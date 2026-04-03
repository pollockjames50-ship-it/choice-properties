/**
 * send-email.ts — H-06 fix
 * Dual-provider email helper: tries Resend first, falls back to GAS relay.
 * Both providers are fire-and-forget (non-fatal) — email failure never blocks
 * the primary operation. The caller is responsible for inserting email_log rows.
 *
 * Usage:
 *   import { sendEmail, EmailResult } from '../_shared/send-email.ts'
 *   const result = await sendEmail({ to, subject, html, template?, data? })
 *   // result.provider = 'resend' | 'gas' | 'none'
 *   // result.ok = boolean
 */

export interface EmailPayload {
  to: string
  subject?: string
  html?: string
  /** GAS template name — used when falling back to GAS relay */
  template?: string
  /** Data object passed to GAS relay templates */
  data?: Record<string, unknown>
  /** CC address (GAS relay only) */
  cc?: string | null
}

export interface EmailResult {
  ok: boolean
  provider: 'resend' | 'gas' | 'none'
  error?: string
}

/**
 * Send an email via Resend (primary) with automatic GAS relay fallback.
 * Returns which provider succeeded, or 'none' if both failed.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const gasUrl    = Deno.env.get('GAS_EMAIL_URL')
  const gasSecret = Deno.env.get('GAS_RELAY_SECRET')

  // ── 1. Try Resend ────────────────────────────────────────────────────────
  if (resendKey && payload.html) {
    try {
      const from = Deno.env.get('RESEND_FROM') || 'Choice Properties <noreply@choicepropertygroup.com>'
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from,
          to: payload.to,
          subject: payload.subject || 'Choice Properties',
          html: payload.html,
        }),
      })
      const json = await r.json().catch(() => ({}))
      if (r.ok && json.id) {
        return { ok: true, provider: 'resend' }
      }
      console.warn('Resend failed:', r.status, JSON.stringify(json), '— falling back to GAS')
    } catch (e) {
      console.warn('Resend threw:', (e as Error)?.message, '— falling back to GAS')
    }
  }

  // ── 2. Fall back to GAS relay ─────────────────────────────────────────────
  if (gasUrl && gasSecret && payload.template) {
    try {
      const r = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret:   gasSecret,
          template: payload.template,
          to:       payload.to,
          cc:       payload.cc ?? null,
          data:     payload.data ?? {},
        }),
      })
      const json = await r.json().catch(() => ({}))
      const ok = r.ok && json.success !== false
      if (ok) return { ok: true, provider: 'gas' }
      return { ok: false, provider: 'gas', error: json.error || `HTTP ${r.status}` }
    } catch (e) {
      return { ok: false, provider: 'gas', error: (e as Error)?.message || 'Network error' }
    }
  }

  // ── 3. Neither provider configured ───────────────────────────────────────
  console.warn('sendEmail: no provider configured (RESEND_API_KEY and GAS_EMAIL_URL both missing)')
  return { ok: false, provider: 'none', error: 'No email provider configured' }
}
