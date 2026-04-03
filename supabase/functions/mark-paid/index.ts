// Choice Properties — Edge Function: mark-paid
import { cors, corsResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { jsonResponse } from '../_shared/utils.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  // ── Verify caller is authenticated ───────────────────────
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response
  const { user, supabase } = auth

  // Check if caller is admin OR a landlord (landlord check happens after app_id is known)
  const { data: adminRow } = await supabase.from('admin_roles').select('id').eq('user_id', user.id).maybeSingle()
  const isAdmin = !!adminRow
  // ── End auth check ────────────────────────────────────────

  try {
    const { app_id, notes } = await req.json()
    if (!app_id) throw new Error('app_id required')

    const { data: app, error: fetchErr } = await supabase
      .from('applications')
      .select('email,first_name,last_name,phone,preferred_language,landlord_id,property_id')
      .eq('app_id', app_id)
      .maybeSingle()
    if (fetchErr) throw new Error(fetchErr.message)
    if (!app) throw new Error('Application not found')

    // If not admin, verify caller is the landlord who owns this application.
    // Fall back to property ownership when landlord_id was not resolved at submission time.
    if (!isAdmin) {
      const { data: landlordRow } = await supabase.from('landlords').select('id').eq('user_id', user.id).maybeSingle()
      if (!landlordRow) return jsonResponse({ success: false, error: 'Forbidden' }, 403)
      let hasAccess = landlordRow.id === app.landlord_id
      if (!hasAccess && app.property_id) {
        const { data: propCheck } = await supabase
          .from('properties')
          .select('landlord_id')
          .eq('id', app.property_id)
          .maybeSingle()
        hasAccess = propCheck?.landlord_id === landlordRow.id
      }
      if (!hasAccess) return jsonResponse({ success: false, error: 'Forbidden' }, 403)
    }

    const updatePayload: Record<string, unknown> = { payment_status: 'paid', payment_date: new Date().toISOString() }
    if (notes) updatePayload.admin_notes = notes
    const { error } = await supabase.from('applications').update(updatePayload).eq('app_id', app_id)
    if (error) throw new Error(error.message)

    // M-06: Log admin action for audit trail
    supabase.from('admin_actions').insert({
      user_id:     user.id,
      action:      'mark_paid',
      target_type: 'application',
      target_id:   app_id,
      metadata:    { notes: notes || null, actor_role: isAdmin ? 'admin' : 'landlord' },
    }).then(() => {}).catch((e: Error) => console.error('[audit] mark_paid log failed:', e.message))

    const gasUrl = Deno.env.get('GAS_EMAIL_URL')!
    fetch(gasUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: Deno.env.get('GAS_RELAY_SECRET'), template: 'payment_confirmation', to: app.email, data: { app_id, applicant_name: `${app.first_name} ${app.last_name}`, phone: app.phone, preferred_language: app.preferred_language || 'en' } })
    }).then(async (r) => {
      const json = await r.json().catch(() => ({}))
      const ok = r.ok && json.success !== false
      await supabase.from('email_logs').insert({ type: 'payment_confirmation', recipient: app.email, status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
    }).catch(async (e) => {
      await supabase.from('email_logs').insert({ type: 'payment_confirmation', recipient: app.email, status: 'failed', app_id, error_msg: e?.message || 'Network error' })
    })

    return jsonResponse({ success: true })
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500)
  }
})
