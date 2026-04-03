// Choice Properties — Edge Function: sign-lease
// Handles tenant signing, co-applicant signing, PDF generation, and admin void action.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { cors, corsResponse } from '../_shared/cors.ts';
import { escHtml, jsonResponse } from '../_shared/utils.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { buildLeaseHTML } from '../_shared/lease-template.ts';

function fmt(n: any) { return parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtDate(d: any) { return d ? new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '—' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  // ── Parse body first so we can route by action ───────────
  // Tenant signing (no action / is_co_applicant) is allowed without admin auth.
  // The void action and admin-initiated re-signs require admin auth.
  // The DB-level sign_lease() and sign_lease_co_applicant() functions enforce
  // their own guards (expiry, void check, duplicate signature) independently.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let body: any = {}
  try { body = await req.json() } catch (_) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  const { app_id, signature, is_co_applicant, co_token, token, action } = body

  // ── Extract real client IP server-side (not from client body) ──
  // The client-supplied ip_address is intentionally ignored to prevent spoofing.
  // Supabase Edge Functions receive the real IP in x-forwarded-for.
  const realIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
              || req.headers.get('x-real-ip')
              || 'unknown'

  // ── Admin-only actions: void ─────────────────────────────
  const requiresAdmin = action === 'void'
  let adminUserId: string | null = null
  if (requiresAdmin) {
    const auth = await requireAdmin(req)
    if (!auth.ok) return auth.response
    adminUserId = auth.user.id
  }

  try {
    // ── Void lease action (admin-only, guarded above) ────────
    if (action === 'void') {
      if (!app_id) throw new Error('app_id required')
      const { error } = await supabase.from('applications').update({ lease_status: 'voided' }).eq('app_id', app_id)
      if (error) throw new Error(error.message)
      // M-06: Log admin void action
      supabase.from('admin_actions').insert({
        user_id:     adminUserId,
        action:      'void_lease',
        target_type: 'application',
        target_id:   app_id,
        metadata:    {},
      }).then(() => {}).catch((e: Error) => console.error('[audit] void_lease log failed:', e.message))
      return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // ── Normal sign flow ────────────────────────────────────
    if (!app_id || !signature) throw new Error('app_id and signature required')

    // ── Primary tenant token validation ─────────────────────
    // H-02 FIX: Token is now always required. The null-skip guard that allowed
    // legacy records (pre-token) to be signed without a token has been removed.
    // SETUP.sql migration backfills tokens for all existing lease records.
    if (!is_co_applicant && action !== 'void') {
      const { data: tokenCheck } = await supabase
        .from('applications')
        .select('tenant_sign_token')
        .eq('app_id', app_id)
        .single()
      if (!token || !tokenCheck?.tenant_sign_token || token !== tokenCheck.tenant_sign_token) {
        throw new Error('Invalid signing link. Please use the link sent to your email address.')
      }
    }

    // ── Co-applicant token validation ───────────────────────
    // H-02 FIX: Token is always required. Backfill migration in SETUP.sql
    // ensures all existing co-applicant records have a token.
    if (is_co_applicant) {
      const { data: tokenCheck } = await supabase
        .from('applications')
        .select('co_applicant_lease_token, has_co_applicant')
        .eq('app_id', app_id)
        .single()
      if (!tokenCheck?.has_co_applicant) throw new Error('No co-applicant on this application')
      if (!co_token || !tokenCheck.co_applicant_lease_token || co_token !== tokenCheck.co_applicant_lease_token) {
        throw new Error('Invalid co-applicant signing link. Please use the link sent to your email address.')
      }
    }

    // ── Sign via DB function ────────────────────────────────
    const fn = is_co_applicant ? 'sign_lease_co_applicant' : 'sign_lease'
    const { data, error } = await supabase.rpc(fn, { p_app_id: app_id, p_signature: signature, p_ip: realIp })
    if (error) throw new Error(error.message)
    if (!data?.success) throw new Error(data?.error || 'Sign failed')

    // ── Fetch full updated application ──────────────────────
    const { data: app } = await supabase.from('applications').select('*').eq('app_id', app_id).single()

    // Fetch co-applicant detail row (needed for name + email in emails/PDF)
    let coApp: any = null
    if (app.has_co_applicant) {
      const { data: coData } = await supabase.from('co_applicants').select('*').eq('app_id', app_id).maybeSingle()
      coApp = coData
    }

    const fullyExecuted = !app.has_co_applicant
      ? (app.lease_status === 'signed')
      : (app.lease_status === 'co_signed')

    // ── Generate + upload signed lease HTML ─────────────────
    // Bucket is PRIVATE. We store only the file PATH (not a time-limited signed URL).
    // Signed URLs are generated on-demand when the tenant views their dashboard,
    // via the get_application_status() DB function — so they never expire in the DB.
    let pdfUrl: string | null = null
    if (fullyExecuted) {
      try {
        const leaseHtml = buildLeaseHTML(app, coApp)
        const htmlBytes = new TextEncoder().encode(leaseHtml)
        const fileName  = `lease-${app_id}-signed.html`
        const { error: uploadErr } = await supabase.storage
          .from('lease-pdfs')
          .upload(fileName, htmlBytes, { contentType: 'text/html', upsert: true })
        if (!uploadErr) {
          // Store the storage PATH only — not a signed URL.
          // get_application_status() will generate a fresh signed URL on each dashboard load.
          const storagePath = fileName
          await supabase.from('applications').update({ lease_pdf_url: storagePath }).eq('app_id', app_id)
          // Generate a one-time signed URL for the confirmation email (7 days, enough for the email)
          const { data: signedData } = await supabase.storage
            .from('lease-pdfs')
            .createSignedUrl(fileName, 604800)
          pdfUrl = signedData?.signedUrl || null  // used only in the email below
        }
      } catch (_) { /* non-fatal — signing already succeeded */ }
    }

    // ── Emails ──────────────────────────────────────────────
    const dashboardUrl = Deno.env.get('DASHBOARD_URL') || ''
    const gasUrl       = Deno.env.get('GAS_EMAIL_URL')!
    const secret       = Deno.env.get('GAS_RELAY_SECRET')

    const leaseData = {
      property:      app.property_address,
      start_date:    app.lease_start_date,
      end_date:      app.lease_end_date,
      rent:          app.monthly_rent,
      move_in_costs: app.move_in_costs,
      signature,
      pdf_url:       pdfUrl,  // now real
    }

    if (fullyExecuted) {
      // Tenant confirmation — now includes real pdf_url
      fetch(gasUrl, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ secret, template:'lease_signed_tenant', to: app.email, cc: null,
          data:{ app_id, first_name: app.first_name, preferred_language: app.preferred_language || 'en', ...leaseData } })
      }).then(async (r) => {
        const json = await r.json().catch(() => ({}))
        const ok = r.ok && json.success !== false
        await supabase.from('email_logs').insert({ type:'lease_signed_tenant', recipient: app.email, status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
      }).catch(async (e) => {
        await supabase.from('email_logs').insert({ type:'lease_signed_tenant', recipient: app.email, status:'failed', app_id, error_msg: e?.message || 'Network error' })
      })

      // Co-applicant confirmation if they signed last
      if (is_co_applicant && coApp?.email) {
        fetch(gasUrl, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ secret, template:'lease_signed_tenant', to: coApp.email, cc: null,
            data:{ app_id, first_name: coApp.first_name || 'Co-Applicant', preferred_language: app.preferred_language || 'en', ...leaseData } })
        }).catch(() => {})

        // Also notify the primary applicant that both parties have now signed
        fetch(gasUrl, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ secret, template:'lease_signed_tenant', to: app.email, cc: null,
            data:{ app_id, first_name: app.first_name, preferred_language: app.preferred_language || 'en', ...leaseData } })
        }).then(async (r) => {
          const json = await r.json().catch(() => ({}))
          const ok = r.ok && json.success !== false
          await supabase.from('email_logs').insert({ type:'lease_cosign_primary_notify', recipient: app.email, status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
        }).catch(async (e) => {
          await supabase.from('email_logs').insert({ type:'lease_cosign_primary_notify', recipient: app.email, status:'failed', app_id, error_msg: e?.message || 'Network error' })
        })
      }

      // Admin alert
      fetch(gasUrl, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ secret, template:'lease_signed_admin', to: null,
          data:{ app_id, tenant_name:`${app.first_name} ${app.last_name}`, email: app.email, phone: app.phone, signature, property: app.property_address } })
      }).then(async (r) => {
        const json = await r.json().catch(() => ({}))
        const ok = r.ok && json.success !== false
        await supabase.from('email_logs').insert({ type:'lease_signed_admin', recipient:'admin', status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
      }).catch(async (e) => {
        await supabase.from('email_logs').insert({ type:'lease_signed_admin', recipient:'admin', status:'failed', app_id, error_msg: e?.message || 'Network error' })
      })

    } else if (!is_co_applicant && app.has_co_applicant && app.lease_status === 'awaiting_co_sign') {
      // Primary signed — nudge co-applicant to sign via their token link
      const coName      = coApp?.first_name || 'Co-Applicant'
      const coLeaseLink = `${dashboardUrl}/apply/lease.html?id=${app_id}&co_token=${app.co_applicant_lease_token}`
      fetch(gasUrl, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ secret, template:'lease_sent_co_applicant', to: coApp?.email, cc: null,
          data:{
            app_id, primary_name: `${app.first_name} ${app.last_name}`,
            tenant_name: coName, lease_link: coLeaseLink,
            preferred_language: app.preferred_language || 'en',
            property: app.property_address, term: app.desired_lease_term || '12 Months',
            startDate: fmtDate(app.lease_start_date), endDate: fmtDate(app.lease_end_date),
            rent: app.monthly_rent, deposit: app.security_deposit, move_in_costs: app.move_in_costs,
          }
        })
      }).then(async (r) => {
        const json = await r.json().catch(() => ({}))
        const ok = r.ok && json.success !== false
        await supabase.from('email_logs').insert({ type:'lease_nudge_co_applicant', recipient: coApp?.email, status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
      }).catch(async (e) => {
        await supabase.from('email_logs').insert({ type:'lease_nudge_co_applicant', recipient: coApp?.email, status:'failed', app_id, error_msg: e?.message || 'Network error' })
      })
    }

    // M-06: Log signing action for audit trail (no admin user_id for tenant self-sign)
    supabase.from('admin_actions').insert({
      user_id:     null,
      action:      is_co_applicant ? 'co_applicant_signed_lease' : 'tenant_signed_lease',
      target_type: 'application',
      target_id:   app_id,
      metadata:    { pdf_url: pdfUrl || null },
    }).then(() => {}).catch((e: Error) => console.error('[audit] sign_lease log failed:', e.message))

    return new Response(JSON.stringify({ success: true, pdf_url: pdfUrl }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
