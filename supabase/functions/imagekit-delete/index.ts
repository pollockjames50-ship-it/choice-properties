// ============================================================
// Choice Properties — ImageKit Delete Edge Function
// Supabase → Functions → imagekit-delete
//
// Required secrets (same as imagekit-upload):
//   IMAGEKIT_PRIVATE_KEY  →  your ImageKit private key
//
// This function:
//   1. Verifies the caller has an authenticated Supabase session
//   2. Verifies the fileId belongs to a property owned by the caller
//      (or the caller is an admin) — prevents cross-landlord deletion
//   3. Calls the ImageKit Delete API server-side (private key never
//      exposed to the browser)
//   4. Returns { success: true } or { success: false, error }
//
// Deletion is best-effort: a CDN failure does NOT block the UI.
// Callers should fire-and-forget and not surface errors to landlords.
// ============================================================

import { corsResponse } from '../_shared/cors.ts';
import { requireAuth }  from '../_shared/auth.ts';
import { jsonResponse } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  // ── Auth check ────────────────────────────────────────────
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;
  // ── End auth check ────────────────────────────────────────

  try {
    const IMAGEKIT_PRIVATE_KEY = Deno.env.get('IMAGEKIT_PRIVATE_KEY');
    if (!IMAGEKIT_PRIVATE_KEY) {
      return jsonResponse({ success: false, error: 'ImageKit not configured' }, 500);
    }

    const { fileId } = await req.json();
    if (!fileId || typeof fileId !== 'string') {
      return jsonResponse({ success: false, error: 'fileId is required' }, 400);
    }

    // ── Ownership check ───────────────────────────────────────
    // Verify that this fileId lives in a property owned by the caller.
    // Admins bypass the ownership filter.
    const { data: adminRow } = await supabase
      .from('admin_roles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const isAdmin = !!adminRow;

    if (!isAdmin) {
      // cs = "contains" operator — checks if the TEXT[] column contains the value.
      const { data: owned, error: ownerErr } = await supabase
        .from('properties')
        .select('id')
        .eq('landlord_id', user.id)
        .filter('photo_file_ids', 'cs', JSON.stringify([fileId]))
        .maybeSingle();

      if (ownerErr || !owned) {
        // fileId not found on any property owned by this landlord.
        // Return 403 to prevent enumeration of other landlords' files.
        return jsonResponse({ success: false, error: 'Forbidden' }, 403);
      }
    }
    // ── End ownership check ───────────────────────────────────

    const credentials = btoa(`${IMAGEKIT_PRIVATE_KEY}:`);
    const ikRes = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${credentials}` },
    });

    // ImageKit returns 204 No Content on success, 404 if already gone.
    // Both are acceptable outcomes — treat 404 as success (idempotent).
    if (!ikRes.ok && ikRes.status !== 404) {
      const errText = await ikRes.text().catch(() => `HTTP ${ikRes.status}`);
      return jsonResponse({ success: false, error: `ImageKit error: ${errText}` }, 502);
    }

    return jsonResponse({ success: true });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
});
