// Choice Properties — Edge Function: process-application
// Receives application form POST, saves to Supabase, fires emails via GAS relay
// Rate limiting: max 5 submissions per IP per 10 minutes.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { cors, corsResponse } from '../_shared/cors.ts';
import { getClientIp, jsonResponse } from '../_shared/utils.ts';
import { sendEmail } from '../_shared/send-email.ts';
import { isDbRateLimited } from '../_shared/rate-limit.ts';

// ── C-03: DB-backed rate limiting ─────────────────────────────
// Max 5 submissions per IP per 10 minutes.
// Uses rate_limit_log table — persists across Deno cold starts.
// See SETUP.sql C-03 migration for table + index + pg_cron cleanup.
const RATE_LIMIT_MAX    = 5;
const RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes in ms
// ── End C-03 ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  // ── C-03: DB-backed rate-limit check ──────────────────────
  const clientIp = getClientIp(req);
  if (await isDbRateLimited(clientIp, 'process-application', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW)) {
    return new Response(
      JSON.stringify({ error: 'Too many submissions. Please try again later.' }),
      { status: 429, headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '600' } }
    );
  }
  // ── End rate-limit check ──────────────────────────────────

  // ── Optional applicant auth — link submission to authenticated user ──
  // If the applicant is signed in via OTP, their JWT is forwarded by the
  // browser via callEdgeFunction(). We verify it here and save their user_id
  // on the application record. This is purely additive — anonymous
  // submissions continue to work unchanged.
  let applicantUserId: string | null = null
  try {
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (jwt && jwt !== Deno.env.get('SUPABASE_ANON_KEY')) {
      const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      const { data: { user } } = await authClient.auth.getUser(jwt)
      if (user?.id) applicantUserId = user.id
    }
  } catch (_) { /* non-fatal — continue without linking */ }
  // ── End optional auth ─────────────────────────────────────

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const formData = await req.json()

    // ── Duplicate submission guard ────────────────────────
    // Two checks:
    //   A) Active application (pending/under_review/approved) for same email+property — show recovery banner
    //   B) Hard block: same email+property submitted within 24 hours — prevents spam
    const submittedEmail    = (formData['Email'] || formData.email || '').toLowerCase().trim()
    const submittedProperty = formData.listing_property_id || null
    const submittedAddress  = (formData['Property Address'] || formData.property_address || '').trim()

    if (submittedEmail) {
      // Check A: active application for same email + property (by ID or address)
      if (submittedProperty || submittedAddress) {
        let activeQuery = supabase
          .from('applications')
          .select('app_id, status, created_at')
          .ilike('email', submittedEmail)
          .in('status', ['pending', 'under_review', 'approved'])
          .order('created_at', { ascending: false })
          .limit(1)
        if (submittedProperty) {
          activeQuery = activeQuery.eq('property_id', submittedProperty)
        } else {
          activeQuery = activeQuery.ilike('property_address', submittedAddress)
        }
        const { data: activeApp } = await activeQuery
        if (activeApp && activeApp.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              duplicate: true,
              existing_app_id: activeApp[0].app_id,
              error: 'You already have an active application for this property.',
            }),
            { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } }
          )
        }
      }

      // Check B: hard block — same email+property within 24 hours (spam prevention)
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
      let recentQuery = supabase
        .from('applications')
        .select('app_id')
        .eq('email', submittedEmail)
        .gte('created_at', oneDayAgo)
      if (submittedProperty) recentQuery = recentQuery.eq('property_id', submittedProperty)
      const { data: recentApp } = await recentQuery.limit(1)
      if (recentApp && recentApp.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'A recent application from this email already exists. Please wait 24 hours before reapplying, or contact us if you need help.',
          }),
          { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ── Validate property is still active at time of submission ──
    // Prevents applications being submitted for properties that were taken
    // off the market between when the applicant started the form and when they submitted.
    // I-045: Also fetch application_fee from the DB — never trust the client-supplied value.
    let serverSideFee = 0
    if (submittedProperty) {
      const { data: activeProp, error: propCheckError } = await supabase
        .from('properties')
        .select('id, status, title, application_fee, landlord_id')
        .eq('id', submittedProperty)
        .single()
      if (propCheckError || !activeProp || activeProp.status !== 'active') {
        return new Response(
          JSON.stringify({
            success: false,
            property_inactive: true,
            error: 'This property is no longer available for applications.',
          }),
          { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } }
        )
      }
      // Store title for email payload below
      formData._property_title = activeProp.title || ''
      // I-045: Use the server-side fee and landlord_id — ignore any client-supplied values
      serverSideFee = parseInt(activeProp.application_fee) || 0
      formData._server_landlord_id = activeProp.landlord_id || null
    }

    // Generate app_id
    const { data: appIdRow, error: appIdErr } = await supabase.rpc('generate_app_id')
    // L-04: Make generate_app_id() failure fatal — the timestamp fallback produced
    // a 13-digit CP-XXXXXXXXXXXXXXXXX ID that broke the CP-XXXXXXXX format standard
    // and looked unprofessional on the success page and in all communications.
    if (appIdErr || !appIdRow) {
      throw new Error('Failed to generate application ID. Please try again.')
    }
    const appId = appIdRow

    // ── Security: Mask SSN to last-4 digits only ──────────
    // Full SSNs must never be stored in plain text.
    // We keep only the last 4 for identity reference.
    function maskSSN(raw: any): string | null {
      if (!raw) return null
      const digits = String(raw).replace(/\D/g, '')
      if (digits.length < 4) return null
      return 'XXX-XX-' + digits.slice(-4)
    }
    formData['SSN']              = maskSSN(formData['SSN']              || formData.ssn)
    formData['Co-Applicant SSN'] = maskSSN(formData['Co-Applicant SSN'] || formData.co_applicant_ssn)
    formData.ssn                 = formData['SSN']
    formData.co_applicant_ssn    = formData['Co-Applicant SSN']

    // ── I-044: Mask Government ID number — keep last-4 only ──
    // Government IDs (driver license, passport, state ID) must never be stored plaintext.
    function maskGovernmentId(raw: any): string | null {
      if (!raw) return null
      const s = String(raw).replace(/\s/g, '')
      if (s.length < 4) return null
      return '***-' + s.slice(-4).toUpperCase()
    }
    formData['Government ID Number'] = maskGovernmentId(
      formData['Government ID Number'] || formData.government_id_number
    )
    formData.government_id_number = formData['Government ID Number']

    // ── Build application record ──────────────────────────
    const record = {
      app_id:                           appId,
      status:                           'pending',
      payment_status:                   serverSideFee === 0 ? 'waived' : 'unpaid',
      lease_status:                     'none',
      // I-045: application_fee is always the server-side value from the property record,
      // never the client-supplied value. Prevents fee manipulation via client.
      application_fee:                  serverSideFee,
      property_id:                      formData.listing_property_id || null,
      // landlord_id is derived server-side from the property record, not trusted from the client.
      // This prevents a malicious actor from forging a landlordId URL param to spam another landlord.
      // I-045: When the property was fetched above, landlord_id was captured in _server_landlord_id.
      landlord_id:                      formData._server_landlord_id || null,
      property_address:                 formData['Property Address'] || formData.property_address || '',
      first_name:                       formData['First Name'] || formData.first_name || '',
      last_name:                        formData['Last Name'] || formData.last_name || '',
      email:                            formData['Email'] || formData.email || '',
      phone:                            formData['Phone'] || formData.phone || '',
      dob:                              formData['DOB'] || formData.dob || null,
      ssn:                              formData['SSN'] || formData.ssn || null,
      requested_move_in_date:           formData['Requested Move-in Date'] || formData.requested_move_in_date || null,
      desired_lease_term:               formData['Desired Lease Term'] || formData.desired_lease_term || null,
      current_address:                  formData['Current Address'] || formData.current_address || null,
      residency_duration:               formData['Residency Duration'] || formData.residency_duration || null,
      current_rent_amount:              formData['Current Rent Amount'] || formData.current_rent_amount || null,
      reason_for_leaving:               formData['Reason for leaving'] || formData.reason_for_leaving || null,
      current_landlord_name:            formData['Current Landlord Name'] || formData.current_landlord_name || null,
      landlord_phone:                   formData['Landlord Phone'] || formData.landlord_phone || null,
      employment_status:                formData['Employment Status'] || formData.employment_status || null,
      employer:                         formData['Employer'] || formData.employer || null,
      job_title:                        formData['Job Title'] || formData.job_title || null,
      employment_duration:              formData['Employment Duration'] || formData.employment_duration || null,
      supervisor_name:                  formData['Supervisor Name'] || formData.supervisor_name || null,
      supervisor_phone:                 formData['Supervisor Phone'] || formData.supervisor_phone || null,
      monthly_income:                   formData['Monthly Income'] || formData.monthly_income || null,
      other_income:                     formData['Other Income'] || formData.other_income || null,
      reference_1_name:                 formData['Reference 1 Name'] || formData.reference_1_name || null,
      reference_1_phone:                formData['Reference 1 Phone'] || formData.reference_1_phone || null,
      reference_2_name:                 formData['Reference 2 Name'] || formData.reference_2_name || null,
      reference_2_phone:                formData['Reference 2 Phone'] || formData.reference_2_phone || null,
      emergency_contact_name:           formData['Emergency Contact Name'] || formData.emergency_contact_name || null,
      emergency_contact_phone:          formData['Emergency Contact Phone'] || formData.emergency_contact_phone || null,
      emergency_contact_relationship:   formData['Emergency Contact Relationship'] || formData.emergency_contact_relationship || null,
      primary_payment_method:           formData['Primary Payment Method'] || formData.primary_payment_method || null,
      primary_payment_method_other:     formData['Primary Payment Method Other'] || formData.primary_payment_method_other || null,
      alternative_payment_method:       formData['Alternative Payment Method'] || formData.alternative_payment_method || null,
      alternative_payment_method_other: formData['Alternative Payment Method Other'] || formData.alternative_payment_method_other || null,
      third_choice_payment_method:      formData['Third Choice Payment Method'] || formData.third_choice_payment_method || null,
      third_choice_payment_method_other:formData['Third Choice Payment Method Other'] || formData.third_choice_payment_method_other || null,
      has_pets:                         formData['Has Pets'] === 'Yes' || formData.has_pets === true,
      pet_details:                      formData['Pet Details'] || formData.pet_details || null,
      total_occupants:                  formData['Total Occupants'] || formData.total_occupants || null,
      additional_occupants:             formData['Additional Occupants'] || formData.additional_occupants || null,
      ever_evicted:                     formData['Ever Evicted'] === 'Yes' || formData.ever_evicted === true,
      smoker:                           formData['Smoker'] === 'Yes' || formData.smoker === true,
      preferred_language:                formData.preferred_language || 'en',
      preferred_contact_method:         Array.isArray(formData['Preferred Contact Method']) ? formData['Preferred Contact Method'].join(', ') : (formData.preferred_contact_method || null),
      preferred_time:                   Array.isArray(formData['Preferred Time']) ? formData['Preferred Time'].join(', ') : (formData.preferred_time || null),
      preferred_time_specific:          formData['Preferred Time Specific'] || formData.preferred_time_specific || null,
      vehicle_make:                     formData['Vehicle Make'] || formData.vehicle_make || null,
      vehicle_model:                    formData['Vehicle Model'] || formData.vehicle_model || null,
      vehicle_year:                     formData['Vehicle Year'] || formData.vehicle_year || null,
      vehicle_license_plate:            formData['Vehicle License Plate'] || formData.vehicle_license_plate || null,
      has_co_applicant:                 formData['Has Co-Applicant'] === 'Yes' || formData.has_co_applicant === true,
      document_url:                     formData.document_url || null,
      // I-043: Array of Supabase Storage paths for uploaded documents
      // (Photo ID, Proof of Income, Additional Doc). Uploaded client-side
      // to application-docs bucket before this POST; paths passed in payload.
      document_urls:                    Array.isArray(formData.document_urls) ? formData.document_urls : [],
      // Link to authenticated applicant account (null for anonymous submissions)
      applicant_user_id:                applicantUserId,
      // ── Phase 2 new fields ────────────────────────────────
      landlord_email:               formData['Landlord Email']               || formData.landlord_email               || null,
      government_id_type:           formData['Government ID Type']           || formData.government_id_type           || null,
      government_id_number:         formData['Government ID Number']         || formData.government_id_number         || null,
      previous_address:             formData['Previous Address']             || formData.previous_address             || null,
      previous_residency_duration:  formData['Previous Residency Duration']  || formData.previous_residency_duration  || null,
      previous_landlord_name:       formData['Previous Landlord Name']       || formData.previous_landlord_name       || null,
      previous_landlord_phone:      formData['Previous Landlord Phone']      || formData.previous_landlord_phone      || null,
      has_bankruptcy:               formData['Has Bankruptcy'] === 'Yes'     || formData.has_bankruptcy === true,
      bankruptcy_explanation:       formData['Bankruptcy Explanation']       || formData.bankruptcy_explanation       || null,
      has_criminal_history:         formData['Has Criminal History'] === 'Yes' || formData.has_criminal_history === true,
      criminal_history_explanation: formData['Criminal History Explanation'] || formData.criminal_history_explanation || null,
      employer_address:             formData['Employer Address']             || formData.employer_address             || null,
      employment_start_date:        formData['Employment Start Date']        || formData.employment_start_date        || null,
    }

    // I-045: landlord_id was already resolved from the property fetch above (stored in
    // record.landlord_id via _server_landlord_id). The secondary query below is no longer needed.
    // Kept as a fallback for applications without a property_id (address-only submissions).
    if (record.property_id && !record.landlord_id) {
      const { data: propForLandlord } = await supabase
        .from('properties')
        .select('landlord_id')
        .eq('id', record.property_id)
        .single()
      if (propForLandlord?.landlord_id) {
        record.landlord_id = propForLandlord.landlord_id
      }
    }

    // Insert application
    const { error: insertError } = await supabase
      .from('applications')
      .insert(record)

    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`)

    // Insert co-applicant detail row when present
    if (record.has_co_applicant) {
      const coRecord = {
        app_id:               appId,
        first_name:           formData['Co-Applicant First Name']          || formData.co_applicant_first_name          || null,
        last_name:            formData['Co-Applicant Last Name']           || formData.co_applicant_last_name           || null,
        email:                formData['Co-Applicant Email']               || formData.co_applicant_email               || null,
        phone:                formData['Co-Applicant Phone']               || formData.co_applicant_phone               || null,
        dob:                  formData['Co-Applicant DOB']                 || formData.co_applicant_dob                 || null,
        ssn:                  formData['Co-Applicant SSN']                 || formData.co_applicant_ssn                 || null,
        role:                 formData['Additional Person Role']           || formData.additional_person_role           || null,
        employer:             formData['Co-Applicant Employer']            || formData.co_applicant_employer            || null,
        job_title:            formData['Co-Applicant Job Title']           || formData.co_applicant_job_title           || null,
        monthly_income:       formData['Co-Applicant Monthly Income']      || formData.co_applicant_monthly_income      || null,
        employment_duration:  formData['Co-Applicant Employment Duration'] || formData.co_applicant_employment_duration || null,
        employment_status:    formData['Co-Applicant Employment Status']   || formData.co_applicant_employment_status   || null,
        consent:              formData['Co-Applicant Consent'] === true    || formData.co_applicant_consent === true,
      }
      const { error: coInsertError } = await supabase.from('co_applicants').insert(coRecord)
      if (coInsertError) {
        // C-02 FIX: Co-applicant insert is now fatal. The application row is already
        // committed, but a missing co_applicants row would produce a legally invalid
        // lease with blank co-applicant name and email fields. Return HTTP 500 so the
        // client surfaces an error and the user can retry. Admin can clean up the
        // orphaned application row if needed.
        throw new Error(`Co-applicant record could not be saved: ${coInsertError.message}`)
      }
    }

    // Log email attempt
    await supabase.from('email_logs').insert({ type: 'application_confirmation', recipient: record.email, status: 'pending', app_id: appId })

    // H-06: Graceful check — if no email provider is configured, skip all emails but still return success
    const gasUrl    = Deno.env.get('GAS_EMAIL_URL')
    const gasSecret = Deno.env.get('GAS_RELAY_SECRET')
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!gasUrl && !resendKey) {
      console.warn('No email provider configured (RESEND_API_KEY and GAS_EMAIL_URL both missing) — email notifications skipped')
      return new Response(JSON.stringify({ success: true, app_id: appId, warning: 'Email relay not configured' }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // Sanitized payload — only what email templates actually need
    // Never send SSN, DOB, employer, income, references, or emergency contacts to GAS relay
    const emailPayload = {
      app_id:              appId,
      first_name:          record.first_name,
      last_name:           record.last_name,
      email:               record.email,
      phone:               record.phone,
      property_title:      formData._property_title     || record.property_address || '',
      property_address:    record.property_address,
      application_fee:     serverSideFee,
      requested_move_in:   record.requested_move_in_date || 'Not specified',
      desired_lease_term:  record.desired_lease_term     || 'Not specified',
    }

    // H-06: Applicant confirmation — Resend primary, GAS fallback
    sendEmail({
      to:       record.email,
      subject:  'Your Choice Properties Application Was Received',
      html:     `<p>Hi ${record.first_name},</p><p>Your application (ID: <strong>${appId}</strong>) for <strong>${emailPayload.property_address}</strong> has been received. You can track your status at any time using your Application ID.</p><p>Thank you,<br>Choice Properties Team</p>`,
      template: 'application_confirmation',
      data:     emailPayload,
    }).then(result =>
      supabase.from('email_logs').insert({ type: 'application_confirmation', recipient: record.email, status: result.ok ? 'success' : 'failed', app_id: appId, provider: result.provider, error_msg: result.ok ? null : result.error })
    )

    // H-06: Admin notification — Resend primary, GAS fallback
    const adminEmail = Deno.env.get('ADMIN_EMAIL') || Deno.env.get('ADMIN_EMAILS') || null;
    if (adminEmail) {
      sendEmail({
        to:       adminEmail,
        subject:  `New Application: ${record.first_name} ${record.last_name} — ${emailPayload.property_address}`,
        html:     `<p>A new application has been submitted.</p><p>Applicant: <strong>${record.first_name} ${record.last_name}</strong><br>Property: ${emailPayload.property_address}<br>App ID: <strong>${appId}</strong></p>`,
        template: 'admin_notification',
        data:     emailPayload,
      }).then(result =>
        supabase.from('email_logs').insert({ type: 'admin_notification', recipient: adminEmail, status: result.ok ? 'success' : 'failed', app_id: appId, provider: result.provider, error_msg: result.ok ? null : result.error })
      )
    }

    // P1-C: new_application — notify landlord when a new application is submitted for their property
    if (record.property_id) {
      const { data: propRow } = await supabase
        .from('properties')
        .select('landlords(email, contact_name, business_name)')
        .eq('id', record.property_id)
        .single()
      const landlordEmail = (propRow as any)?.landlords?.email
      const landlordName  = (propRow as any)?.landlords?.business_name || (propRow as any)?.landlords?.contact_name || 'Landlord'
      if (landlordEmail) {
        const landlordPayload = {
          ...emailPayload,
          landlordName,
          app_id: appId,
          applicantName: `${record.first_name} ${record.last_name}`,
          propertyAddress: record.property_address,
        }
        // H-06: Landlord notification — Resend primary, GAS fallback
        sendEmail({
          to:       landlordEmail,
          subject:  `New Application for Your Property — ${record.property_address}`,
          html:     `<p>Hi ${landlordName},</p><p>A new application has been submitted for your property at <strong>${record.property_address}</strong>.</p><p>Applicant: <strong>${record.first_name} ${record.last_name}</strong><br>App ID: <strong>${appId}</strong></p><p>Log in to your dashboard to review it.</p>`,
          template: 'new_application',
          data:     landlordPayload,
        }).then(result =>
          supabase.from('email_logs').insert({ type: 'new_application', recipient: landlordEmail, status: result.ok ? 'success' : 'failed', app_id: appId, provider: result.provider, error_msg: result.ok ? null : result.error })
        )
      }
    }

    // Co-applicant notification — inform them they were listed on the application
    const coApplicantEmail = formData['Co-Applicant Email'] || formData.co_applicant_email || null
    if (record.has_co_applicant && coApplicantEmail) {
      const coApplicantPayload = {
        app_id:            appId,
        primary_applicant: `${record.first_name} ${record.last_name}`,
        property_address:  record.property_address,
      }
      // H-06: Co-applicant notification — Resend primary, GAS fallback
      sendEmail({
        to:       coApplicantEmail,
        subject:  'You Have Been Listed as a Co-Applicant — Choice Properties',
        html:     `<p>You have been listed as a co-applicant on a rental application submitted by <strong>${record.first_name} ${record.last_name}</strong> for <strong>${record.property_address}</strong>. Application ID: <strong>${appId}</strong>.</p>`,
        template: 'co_applicant_notification',
        data:     coApplicantPayload,
      }).then(result =>
        supabase.from('email_logs').insert({ type: 'co_applicant_notification', recipient: coApplicantEmail, status: result.ok ? 'success' : 'failed', app_id: appId, provider: result.provider, error_msg: result.ok ? null : result.error })
      )
    }

    return new Response(JSON.stringify({ success: true, app_id: appId }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
