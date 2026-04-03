// Choice Properties — Edge Function: mark-movein
import { cors, corsResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { jsonResponse } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  // ── Verify caller is an authenticated admin ──────────────
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const { user, supabase } = auth
  // ── End auth check ────────────────────────────────────────

  try {
    const { app_id, move_in_date, notes, confirmed_by } = await req.json()
    if (!app_id) throw new Error('app_id required')

    const { data: app, error: fetchErr } = await supabase.from('applications').select('*').eq('app_id', app_id).single()
    if (fetchErr) throw new Error(fetchErr.message)

    const { error } = await supabase.from('applications').update({
      move_in_status:     'completed',
      move_in_date_actual: move_in_date || new Date().toISOString().split('T')[0],
      move_in_notes:      notes || null,
      move_in_confirmed_by: confirmed_by || 'Admin',
    }).eq('app_id', app_id)
    if (error) throw new Error(error.message)

    // M-06: Log admin action for audit trail
    supabase.from('admin_actions').insert({
      user_id:     user.id,
      action:      'mark_movein',
      target_type: 'application',
      target_id:   app_id,
      metadata:    { move_in_date: move_in_date || null, notes: notes || null, confirmed_by: confirmed_by || 'Admin' },
    }).then(() => {}).catch((e: Error) => console.error('[audit] mark_movein log failed:', e.message))

    const gasUrl = Deno.env.get('GAS_EMAIL_URL')!
    fetch(gasUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: Deno.env.get('GAS_RELAY_SECRET'), template: 'move_in_confirmation', to: app.email,
        data: { app_id, first_name: app.first_name, property: app.property_address, rent: app.monthly_rent,
                move_in_date: new Date(move_in_date || Date.now()).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}), notes: notes || '', preferred_language: app.preferred_language || 'en' } })
    }).then(async (r) => {
      const json = await r.json().catch(() => ({}))
      const ok = r.ok && json.success !== false
      await supabase.from('email_logs').insert({ type: 'move_in_confirmation', recipient: app.email, status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
    }).catch(async (e) => {
      await supabase.from('email_logs').insert({ type: 'move_in_confirmation', recipient: app.email, status: 'failed', app_id, error_msg: e?.message || 'Network error' })
    })

    return jsonResponse({ success: true })
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500)
  }
})
