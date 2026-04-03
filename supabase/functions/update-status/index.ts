// Choice Properties — Edge Function: update-status
// Allowed callers:
//   • Admin users (admin_roles table)
//   • Authenticated landlords — only for applications on their own properties
import { corsResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { jsonResponse } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  // ── Authenticate caller ───────────────────────────────────
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response
  const { user, supabase } = auth

  const { data: adminRow }    = await supabase.from('admin_roles').select('id').eq('user_id', user.id).maybeSingle()
  const { data: landlordRow } = await supabase.from('landlords').select('id').eq('user_id', user.id).maybeSingle()
  const isAdmin    = !!adminRow
  const isLandlord = !!landlordRow

  if (!isAdmin && !isLandlord) return jsonResponse({ success: false, error: 'Forbidden' }, 403)
  // ── End auth check ────────────────────────────────────────

  try {
    const { app_id, status, notes } = await req.json()
    if (!app_id || !status) throw new Error('app_id and status required')

    // Landlords may only update applications for their own properties.
    // Check landlord_id first; fall back to property ownership for apps where landlord_id was not resolved at submission time.
    if (!isAdmin && isLandlord) {
      const { data: appCheck } = await supabase
        .from('applications')
        .select('landlord_id, property_id')
        .eq('app_id', app_id)
        .maybeSingle()
      if (!appCheck) return jsonResponse({ success: false, error: 'Application not found' }, 404)
      let hasAccess = appCheck.landlord_id === landlordRow!.id
      if (!hasAccess && appCheck.property_id) {
        const { data: propCheck } = await supabase
          .from('properties')
          .select('landlord_id')
          .eq('id', appCheck.property_id)
          .maybeSingle()
        hasAccess = propCheck?.landlord_id === landlordRow!.id
      }
      if (!hasAccess) return jsonResponse({ success: false, error: 'Forbidden — not your property' }, 403)
    }

    const { data: app, error: fetchErr } = await supabase.from('applications').select('email,first_name,last_name,preferred_language').eq('app_id', app_id).single()
    if (fetchErr) throw new Error(fetchErr.message)

    const { error } = await supabase.from('applications').update({ status, admin_notes: notes || null }).eq('app_id', app_id)
    if (error) throw new Error(error.message)

    // M-06: Log admin action for audit trail
    supabase.from('admin_actions').insert({
      user_id:     user.id,
      action:      'update_status',
      target_type: 'application',
      target_id:   app_id,
      metadata:    { status, notes: notes || null, actor_role: isAdmin ? 'admin' : 'landlord' },
    }).then(() => {}).catch((e: Error) => console.error('[audit] update_status log failed:', e.message))

    // Email for approved/denied
    if (status === 'approved' || status === 'denied') {
      const gasUrl = Deno.env.get('GAS_EMAIL_URL')!
      fetch(gasUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: Deno.env.get('GAS_RELAY_SECRET'), template: 'status_update', to: app.email, data: { app_id, first_name: app.first_name, status, reason: notes || '', preferred_language: app.preferred_language || 'en' } })
      }).then(async (r) => {
        const json = await r.json().catch(() => ({}))
        const ok = r.ok && json.success !== false
        await supabase.from('email_logs').insert({ type: 'status_update', recipient: app.email, status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
      }).catch(async (e) => {
        await supabase.from('email_logs').insert({ type: 'status_update', recipient: app.email, status: 'failed', app_id, error_msg: e?.message || 'Network error' })
      })
    }

    return jsonResponse({ success: true })
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500)
  }
})
