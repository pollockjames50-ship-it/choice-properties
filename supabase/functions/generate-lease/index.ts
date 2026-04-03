// Choice Properties — Edge Function: generate-lease
// Generates lease records, co-applicant tokens, and triggers lease emails via GAS relay.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { cors, corsResponse } from '../_shared/cors.ts';
import { jsonResponse } from '../_shared/utils.ts';
import { requireAdmin } from '../_shared/auth.ts';

const STATE_COMPLIANCE: Record<string, any> = {
  AL:{ depositReturn:35,noticeToVacate:30,eSignLaw:'Alabama Uniform Electronic Transactions Act (UETA)',depositCap:null,lateFeeMax:null,eviNotice:'7 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  AK:{ depositReturn:14,noticeToVacate:30,eSignLaw:'Alaska Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'7 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  AZ:{ depositReturn:14,noticeToVacate:30,eSignLaw:'Arizona Electronic Transactions Act (A.R.S. §44-7001)',depositCap:1.5,lateFeeMax:null,eviNotice:'5 days',disclosures:['Bedbug disclosure','Lead paint disclosure for pre-1978 properties'] },
  AR:{ depositReturn:60,noticeToVacate:30,eSignLaw:'Arkansas Uniform Electronic Transactions Act',depositCap:2,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  CA:{ depositReturn:21,noticeToVacate:30,eSignLaw:'California Uniform Electronic Transactions Act (Cal. Civ. Code §1633.1)',depositCap:2,lateFeeMax:null,eviNotice:'3 days',disclosures:['Mold disclosure','Bedbug disclosure','Lead paint disclosure for pre-1978 properties','Pest control disclosure','Methamphetamine contamination disclosure'] },
  CO:{ depositReturn:30,noticeToVacate:21,eSignLaw:'Colorado Uniform Electronic Transactions Act (C.R.S. §24-71.3-101)',depositCap:null,lateFeeMax:null,eviNotice:'10 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  CT:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Connecticut Electronic Signatures Act (Conn. Gen. Stat. §1-272)',depositCap:2,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties','Radon disclosure'] },
  DE:{ depositReturn:20,noticeToVacate:60,eSignLaw:'Delaware Uniform Electronic Transactions Act',depositCap:1,lateFeeMax:5,eviNotice:'5 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  FL:{ depositReturn:15,noticeToVacate:15,eSignLaw:'Florida Electronic Signature Act of 1996 (Fla. Stat. §668.001)',depositCap:null,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties','Radon gas disclosure'] },
  GA:{ depositReturn:30,noticeToVacate:60,eSignLaw:'Georgia Electronic Records and Signatures Act',depositCap:null,lateFeeMax:null,eviNotice:'7 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  HI:{ depositReturn:14,noticeToVacate:28,eSignLaw:'Hawaii Uniform Electronic Transactions Act',depositCap:1,lateFeeMax:null,eviNotice:'5 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  ID:{ depositReturn:21,noticeToVacate:30,eSignLaw:'Idaho Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  IL:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Illinois Electronic Commerce Security Act (5 ILCS 175)',depositCap:null,lateFeeMax:null,eviNotice:'5 days',disclosures:['Radon disclosure','Lead paint disclosure for pre-1978 properties','Carbon monoxide detector disclosure'] },
  IN:{ depositReturn:45,noticeToVacate:30,eSignLaw:'Indiana Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'10 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  IA:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Iowa Uniform Electronic Transactions Act',depositCap:2,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  KS:{ depositReturn:14,noticeToVacate:30,eSignLaw:'Kansas Uniform Electronic Transactions Act',depositCap:1,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  KY:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Kentucky Uniform Electronic Transactions Act (KRS §369.101)',depositCap:null,lateFeeMax:null,eviNotice:'7 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  LA:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Louisiana Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'5 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  ME:{ depositReturn:21,noticeToVacate:30,eSignLaw:'Maine Uniform Electronic Transactions Act',depositCap:2,lateFeeMax:null,eviNotice:'7 days',disclosures:['Radon disclosure','Lead paint disclosure for pre-1978 properties'] },
  MD:{ depositReturn:45,noticeToVacate:60,eSignLaw:'Maryland Uniform Electronic Transactions Act',depositCap:2,lateFeeMax:5,eviNotice:'4 days',disclosures:['Lead paint disclosure for pre-1978 properties','Mold disclosure'] },
  MA:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Massachusetts Uniform Electronic Transactions Act (M.G.L. c.110G)',depositCap:1,lateFeeMax:null,eviNotice:'14 days',disclosures:['Lead paint disclosure for pre-1978 properties','Smoke detector disclosure'] },
  MI:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Michigan Electronic Commerce Security Act (MCL §450.831)',depositCap:1.5,lateFeeMax:null,eviNotice:'7 days',disclosures:['Lead paint disclosure for pre-1978 properties','Truth in Renting Act disclosure'] },
  MN:{ depositReturn:21,noticeToVacate:30,eSignLaw:'Minnesota Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'14 days',disclosures:['Lead paint disclosure for pre-1978 properties','Radon disclosure'] },
  MS:{ depositReturn:45,noticeToVacate:30,eSignLaw:'Mississippi Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  MO:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Missouri Uniform Electronic Transactions Act',depositCap:2,lateFeeMax:null,eviNotice:'5 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  MT:{ depositReturn:10,noticeToVacate:30,eSignLaw:'Montana Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  NE:{ depositReturn:14,noticeToVacate:30,eSignLaw:'Nebraska Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  NV:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Nevada Uniform Electronic Transactions Act (NRS §719)',depositCap:3,lateFeeMax:null,eviNotice:'7 days',disclosures:['Lead paint disclosure for pre-1978 properties','Mold disclosure'] },
  NH:{ depositReturn:30,noticeToVacate:30,eSignLaw:'New Hampshire Uniform Electronic Transactions Act',depositCap:1,lateFeeMax:null,eviNotice:'7 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  NJ:{ depositReturn:30,noticeToVacate:30,eSignLaw:'New Jersey Uniform Electronic Transactions Act',depositCap:1.5,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties','Truth in Renting disclosure','Flood zone disclosure'] },
  NM:{ depositReturn:30,noticeToVacate:30,eSignLaw:'New Mexico Uniform Electronic Transactions Act',depositCap:1,lateFeeMax:10,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  NY:{ depositReturn:14,noticeToVacate:30,eSignLaw:'New York Electronic Signatures and Records Act (ESRA, NY Tech. Law §301)',depositCap:1,lateFeeMax:50,eviNotice:'14 days',disclosures:['Lead paint disclosure for pre-1978 properties','Bedbug disclosure','Mold disclosure','Flood zone disclosure'] },
  NC:{ depositReturn:30,noticeToVacate:30,eSignLaw:'North Carolina Uniform Electronic Transactions Act (N.C.G.S. §66-311)',depositCap:1.5,lateFeeMax:15,eviNotice:'10 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  ND:{ depositReturn:30,noticeToVacate:30,eSignLaw:'North Dakota Uniform Electronic Transactions Act',depositCap:1,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  OH:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Ohio Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  OK:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Oklahoma Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'5 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  OR:{ depositReturn:31,noticeToVacate:30,eSignLaw:'Oregon Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'72 hours',disclosures:['Lead paint disclosure for pre-1978 properties','Mold disclosure','Carbon monoxide disclosure'] },
  PA:{ depositReturn:30,noticeToVacate:15,eSignLaw:'Pennsylvania Uniform Electronic Transactions Act',depositCap:2,lateFeeMax:null,eviNotice:'10 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  RI:{ depositReturn:20,noticeToVacate:30,eSignLaw:'Rhode Island Uniform Electronic Transactions Act',depositCap:1,lateFeeMax:null,eviNotice:'5 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  SC:{ depositReturn:30,noticeToVacate:30,eSignLaw:'South Carolina Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'5 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  SD:{ depositReturn:14,noticeToVacate:30,eSignLaw:'South Dakota Uniform Electronic Transactions Act',depositCap:1,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  TN:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Tennessee Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'14 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  TX:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Texas Uniform Electronic Transactions Act (Bus. & Com. Code §322)',depositCap:null,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  UT:{ depositReturn:30,noticeToVacate:15,eSignLaw:'Utah Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  VT:{ depositReturn:14,noticeToVacate:60,eSignLaw:'Vermont Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'14 days',disclosures:['Lead paint disclosure for pre-1978 properties','Flood zone disclosure'] },
  VA:{ depositReturn:45,noticeToVacate:30,eSignLaw:'Virginia Uniform Electronic Transactions Act (Va. Code §59.1-479)',depositCap:2,lateFeeMax:10,eviNotice:'5 days',disclosures:['Lead paint disclosure for pre-1978 properties','Mold disclosure'] },
  WA:{ depositReturn:21,noticeToVacate:20,eSignLaw:'Washington Electronic Authentication Act (RCW §19.34)',depositCap:null,lateFeeMax:null,eviNotice:'3 days',disclosures:['Mold disclosure','Lead paint disclosure for pre-1978 properties','Carbon monoxide disclosure'] },
  WV:{ depositReturn:60,noticeToVacate:30,eSignLaw:'West Virginia Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'5 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  WI:{ depositReturn:21,noticeToVacate:28,eSignLaw:'Wisconsin Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'5 days',disclosures:['Lead paint disclosure for pre-1978 properties','Mold disclosure'] },
  WY:{ depositReturn:30,noticeToVacate:30,eSignLaw:'Wyoming Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure for pre-1978 properties'] },
  DC:{ depositReturn:45,noticeToVacate:30,eSignLaw:'DC Uniform Electronic Transactions Act',depositCap:null,lateFeeMax:null,eviNotice:'30 days',disclosures:['Lead paint disclosure for pre-1978 properties','Housing provider registration disclosure'] },
}

const BASE_COMPLIANCE = { depositReturn:30,noticeToVacate:30,gracePeriod:5,eSignLaw:'federal Electronic Signatures in Global and National Commerce Act (E-SIGN Act, 15 U.S.C. §7001)',depositCap:null,lateFeeMax:null,eviNotice:'3 days',disclosures:['Lead paint disclosure required for pre-1978 properties'] }

function getStateCompliance(stateCode: string) {
  if (!stateCode) return BASE_COMPLIANCE
  const state = STATE_COMPLIANCE[stateCode.toUpperCase()]
  if (!state) return BASE_COMPLIANCE
  // Merge: state-specific values override base, but base fills in any missing fields
  return { ...BASE_COMPLIANCE, ...state }
}

function extractState(address: string): string {
  if (!address) return ''
  let m = address.match(/,\s*([A-Z]{2})\s+\d{5}/i)
  if (m) return m[1].toUpperCase()
  m = address.match(/,\s*([A-Z]{2})\s*$/i)
  if (m) return m[1].toUpperCase()
  return ''
}

function calcLeaseEnd(startDate: string, term: string): string {
  const d = new Date(startDate)
  const t = (term || '').toLowerCase()
  // Month-to-month has no fixed end date — return empty so DB stores null
  if (t.includes('month-to-month') || t.includes('month to month')) { return '' }
  else if (t.includes('6')) { d.setMonth(d.getMonth() + 6) }
  else { d.setFullYear(d.getFullYear() + 1) }
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function generateToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  // ── Verify caller is an authenticated admin ──────────────
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { user, supabase } = auth
  // ── End auth check ────────────────────────────────────────
  try {
    const { app_id, monthly_rent, security_deposit, lease_start_date, lease_notes, resend, late_fee_flat, late_fee_daily, expiry_days } = await req.json()
    if (!app_id) throw new Error('app_id required')

    // ── 1. Fetch application ────────────────────────────────
    const { data: app, error: fetchErr } = await supabase.from('applications').select('*').eq('app_id', app_id).single()
    if (fetchErr) throw new Error(fetchErr.message)

    // ── 1b. Require approved status before sending a lease ──
    // Resends are allowed regardless of current status (admin is intentionally re-sending).
    if (!resend && app.status !== 'approved') {
      throw new Error(`Cannot send a lease — application status is "${app.status}". Approve the application first, or use resend=true to override.`)
    }

    // ── 2. Fetch property + landlord ────────────────────────
    let property: any = null
    let landlord: any = null
    if (app.property_id) {
      const { data: prop } = await supabase
        .from('properties')
        .select('*, landlords(contact_name, business_name, email, phone, address, city, state, zip, license_number)')
        .eq('id', app.property_id)
        .single()
      if (prop) { property = prop; landlord = prop.landlords }
    }

    // ── 3. Compute lease fields ─────────────────────────────
    const rent         = parseFloat(monthly_rent  || 0)
    const deposit      = parseFloat(security_deposit || 0)
    const moveIn       = rent + deposit
    const startDate    = lease_start_date || new Date().toISOString().split('T')[0]
    const endDate      = calcLeaseEnd(startDate, app.desired_lease_term)
    const lateFeeFlat  = parseFloat(late_fee_flat  || 50)
    const lateFeeDaily = parseFloat(late_fee_daily || 10)
    const expiryDate   = new Date(Date.now() + ((expiry_days || 7) * 86400000)).toISOString()

    // ── 4. State compliance ─────────────────────────────────
    const stateCode  = extractState(app.property_address || '')
    const compliance = getStateCompliance(stateCode)

    // ── 5. Landlord identity (correct legal party) ──────────
    const landlordLegalName    = landlord ? (landlord.business_name || landlord.contact_name || 'Choice Properties') : 'Choice Properties'
    const landlordAddress      = landlord ? [landlord.address, landlord.city, landlord.state, landlord.zip].filter(Boolean).join(', ') : 'Nationwide'

    // ── 6. Property-specific policy terms ──────────────────
    const petsAllowed    = property?.pets_allowed ?? false
    const smokingAllowed = property?.smoking_allowed ?? false
    const petPolicy      = petsAllowed
      ? (property?.pet_details || 'Pets are permitted subject to a pet deposit and execution of a written pet addendum. Unauthorized pets constitute a material breach.')
      : 'No pets are permitted on the Premises without prior written consent of Landlord. Unauthorized pets constitute a material breach of this Agreement.'
    const smokingPolicy  = smokingAllowed
      ? 'Smoking is permitted in designated outdoor areas only as communicated by Landlord. Smoking inside the Premises or in shared common areas is strictly prohibited.'
      : 'Smoking of any substance, including tobacco, cannabis, or electronic cigarettes, is strictly prohibited within the Premises, on balconies, patios, and in all common areas.'

    // ── 7. Co-applicant unique signing token ────────────────
    let coApplicantToken = app.co_applicant_lease_token
    if ((!coApplicantToken || resend) && app.has_co_applicant) {
      coApplicantToken = generateToken()
    }

    // ── 7b. Primary tenant unique signing token (Fix Group 5) ─
    // Generates a 192-bit random token stored on the application.
    // The tenant's lease URL includes this token; sign-lease verifies it.
    // If a token already exists and this is not a resend, reuse it for
    // backward compatibility. On resend, always regenerate.
    let tenantSignToken = app.tenant_sign_token
    if (!tenantSignToken || resend) {
      tenantSignToken = generateToken()
    }

    const dashboardUrl = Deno.env.get('DASHBOARD_URL') || ''
    const leaseLink    = `${dashboardUrl}/apply/lease.html?id=${app_id}&token=${tenantSignToken}`
    const coLeaseLink  = (app.has_co_applicant && coApplicantToken)
      ? `${dashboardUrl}/apply/lease.html?id=${app_id}&co_token=${coApplicantToken}`
      : null

    // ── 8. Update application row ───────────────────────────
    const updatePayload: any = {
      lease_status:              'sent',
      lease_sent_date:           new Date().toISOString(),
      lease_start_date:          startDate,
      lease_end_date:            endDate || null,
      monthly_rent:              rent,
      security_deposit:          deposit,
      move_in_costs:             moveIn,
      lease_notes:               lease_notes || null,
      lease_late_fee_flat:       lateFeeFlat,
      lease_late_fee_daily:      lateFeeDaily,
      lease_expiry_date:         expiryDate,
      // Snapshot all lease-time data so PDF generation has everything
      lease_state_code:          stateCode || null,
      lease_landlord_name:       landlordLegalName,
      lease_landlord_address:    landlordAddress,
      lease_pets_policy:         petPolicy,
      lease_smoking_policy:      smokingPolicy,
      lease_compliance_snapshot: JSON.stringify(compliance),
      tenant_sign_token:         tenantSignToken,
    }
    if (coApplicantToken) updatePayload.co_applicant_lease_token = coApplicantToken
    if (resend) {
      updatePayload.tenant_signature               = null
      updatePayload.signature_timestamp            = null
      updatePayload.co_applicant_signature         = null
      updatePayload.co_applicant_signature_timestamp = null
      updatePayload.lease_pdf_url                  = null
    }

    // H-03: Conditional UPDATE prevents double-click race condition.
    // If a token already exists and this is not a resend, another request already
    // wrote the token and sent the email. Bail out with a clear error rather than
    // overwriting the token (which would permanently break the first signing link).
    const updateQuery = resend
      ? supabase.from('applications').update(updatePayload).eq('app_id', app_id)
      : supabase.from('applications').update(updatePayload).eq('app_id', app_id).is('tenant_sign_token', null)

    const { error: updateErr, count: updatedCount } = await updateQuery.select('app_id')
    if (updateErr) throw new Error(updateErr.message)
    if (!resend && (!updatedCount || updatedCount === 0)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Lease was already sent for this application. Use resend=true to resend.' }),
        { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // ── 9. Email primary tenant ─────────────────────────────
    const gasUrl = Deno.env.get('GAS_EMAIL_URL')!
    const secret = Deno.env.get('GAS_RELAY_SECRET')

    const baseLeaseData = {
      property:          app.property_address,
      term:              app.desired_lease_term || '12 Months',
      startDate:         new Date(startDate).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }),
      endDate:           endDate ? new Date(endDate).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : 'Month-to-Month',
      rent, deposit, move_in_costs: moveIn,
      start_date: startDate, end_date: endDate,
      lease_link:        leaseLink,
      tenant_name:       `${app.first_name} ${app.last_name}`,
      preferred_language: app.preferred_language || 'en',
    }

    // Primary tenant — their own link (no co-applicant cc)
    fetch(gasUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, template: 'lease_sent', to: app.email, cc: null, data: { app_id, ...baseLeaseData } })
    }).then(async (r) => {
      const json = await r.json().catch(() => ({}))
      const ok = r.ok && json.success !== false
      await supabase.from('email_logs').insert({ type: 'lease_sent', recipient: app.email, status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
    }).catch(async (e) => {
      await supabase.from('email_logs').insert({ type: 'lease_sent', recipient: app.email, status: 'failed', app_id, error_msg: e?.message || 'Network error' })
    })

    // ── 10. Co-applicant email ───────────────────────────────
    // The co-applicant's signing invitation is sent by sign-lease AFTER the primary
    // applicant has signed (status → awaiting_co_sign). Sending it here — before the
    // primary has signed — causes confusion because their link shows "waiting for
    // primary applicant" when they open it. The co-applicant will receive their
    // signing link automatically once the primary tenant completes their signature.

    // M-06: Log admin action for audit trail
    supabase.from('admin_actions').insert({
      user_id:     user.id,
      action:      resend ? 'resend_lease' : 'generate_lease',
      target_type: 'application',
      target_id:   app_id,
      metadata:    { lease_start_date, monthly_rent, security_deposit, expiry_days: expiry_days || null },
    }).then(() => {}).catch((e: Error) => console.error('[audit] generate_lease log failed:', e.message))

    return new Response(
      JSON.stringify({ success: true, lease_link: leaseLink, lease_end_date: endDate, move_in_costs: moveIn }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
