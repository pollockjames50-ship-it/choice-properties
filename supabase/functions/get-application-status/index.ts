// Choice Properties — Edge Function: get-application-status
// Rate-limited wrapper around the get_application_status() DB RPC.
// Rate limit: 10 requests per IP per minute (brute-force protection).
// C-01 FIX: Requires last_name as a second verification factor alongside app_id.
// This prevents PII enumeration — an attacker with only an app_id gets nothing.

import { corsResponse } from '../_shared/cors.ts';
import { getClientIp, jsonResponse } from '../_shared/utils.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ── In-memory rate-limit store ────────────────────────────────
const RATE_LIMIT_MAX    = 10;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in ms

const ipStore = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = ipStore.get(ip);
  if (!rec || now - rec.windowStart > RATE_LIMIT_WINDOW) {
    ipStore.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (rec.count >= RATE_LIMIT_MAX) return true;
  rec.count++;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  // ── Rate-limit check ──────────────────────────────────────
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    return jsonResponse(
      { success: false, error: 'Too many requests. Please try again later.' },
      429,
      { 'Retry-After': '60' }
    );
  }
  // ── End rate-limit check ──────────────────────────────────

  try {
    let body: any = {};
    try { body = await req.json() } catch (_) { /* empty body */ }

    const { app_id, last_name } = body;
    if (!app_id) return jsonResponse({ success: false, error: 'app_id required' }, 400);
    if (!last_name) return jsonResponse({ success: false, error: 'last_name required' }, 400);

    // Use the service-role key so the RPC can always bypass RLS, regardless
    // of whether the caller is authenticated or anonymous.  The same admin
    // client is reused below for signed-URL generation to avoid a second init.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await supabaseAdmin.rpc('get_application_status', { p_app_id: app_id, p_last_name: last_name });
    if (error) throw new Error(error.message);

    // ── Generate a fresh signed URL for the lease PDF if stored as a path ──
    if (data?.application?.lease_pdf_url && !data.application.lease_pdf_url.startsWith('http')) {
      const { data: signed } = await supabaseAdmin.storage
        .from('lease-pdfs')
        .createSignedUrl(data.application.lease_pdf_url, 604800);
      if (signed?.signedUrl) data.application.lease_pdf_url = signed.signedUrl;
    }

    return jsonResponse(data);
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
})
