// ============================================================
// Choice Properties — ImageKit Upload Edge Function
// Supabase → Functions → imagekit-upload
//
// Required secret in Supabase Dashboard → Edge Functions → Secrets:
//   IMAGEKIT_PRIVATE_KEY  →  your ImageKit private key
//   IMAGEKIT_URL_ENDPOINT →  e.g. https://ik.imagekit.io/yourID
//
// This function:
//   1. Verifies the caller has an authenticated Supabase session
//   2. Receives a base64-encoded file + metadata from the browser
//   3. Authenticates with ImageKit using the private key (server-side)
//   4. Uploads to ImageKit and returns the final CDN URL
//   5. The private key is NEVER exposed to the browser
// ============================================================

import { corsResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { jsonResponse } from '../_shared/utils.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  // ── Auth check — reject unauthenticated callers ───────────
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  // ── End auth check ────────────────────────────────────────

  try {
    const IMAGEKIT_PRIVATE_KEY  = Deno.env.get('IMAGEKIT_PRIVATE_KEY');
    const IMAGEKIT_URL_ENDPOINT = Deno.env.get('IMAGEKIT_URL_ENDPOINT');

    // DEBUG: Log secret presence
    console.log('[imagekit-upload] Secret check:', {
      hasPrivateKey: !!IMAGEKIT_PRIVATE_KEY,
      hasUrlEndpoint: !!IMAGEKIT_URL_ENDPOINT,
      privateKeyLength: IMAGEKIT_PRIVATE_KEY?.length ?? 0,
      urlEndpointLength: IMAGEKIT_URL_ENDPOINT?.length ?? 0,
    });

    if (!IMAGEKIT_PRIVATE_KEY || !IMAGEKIT_URL_ENDPOINT) {
      console.error('[imagekit-upload] Secrets missing or empty');
      return jsonResponse({
        success: false,
        error: 'ImageKit not configured',
        debug: {
          hasPrivateKey: !!IMAGEKIT_PRIVATE_KEY,
          hasUrlEndpoint: !!IMAGEKIT_URL_ENDPOINT,
        },
      }, 500);
    }

    const { fileData, fileName, folder } = await req.json();
    console.log('[imagekit-upload] Request parsed:', {
      hasFileData: !!fileData,
      fileDataLength: typeof fileData === 'string' ? fileData.length : 'not-string',
      hasFileName: !!fileName,
      hasFolder: !!folder,
    });

    if (!fileData || !fileName) {
      console.error('[imagekit-upload] Missing fileData or fileName');
      return jsonResponse({ success: false, error: 'fileData and fileName required' }, 400);
    }

    // ── I-055: Input validation ───────────────────────────────
    // 1. File extension whitelist — only safe image formats accepted
    const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return jsonResponse(
        { success: false, error: `File type .${ext} not allowed. Accepted: jpg, jpeg, png, webp` },
        400
      );
    }

    // 2. Sanitize fileName — strip path separators and dangerous chars
    //    Prevents directory traversal in ImageKit folder structure
    const safeFileName = fileName.replace(/[\/\\?%*:|"<>]/g, '_').replace(/\.{2,}/g, '_');

    // 3. Base64 payload size cap — 15 MB decoded (~20 MB base64)
    //    Prevents memory exhaustion and runaway ImageKit storage costs
    const MAX_BASE64_BYTES = 20 * 1024 * 1024;
    const payloadSize = typeof fileData === 'string' ? fileData.length : 0;
    if (payloadSize > MAX_BASE64_BYTES) {
      return jsonResponse(
        { success: false, error: 'File too large. Maximum upload size is 15 MB.' },
        413
      );
    }
    // ── End I-055 validation ──────────────────────────────────

    // I-062: Strip the data URI prefix before sending to ImageKit.
    // fileToBase64() in imagekit.js returns a full data URI:
    //   "data:image/jpeg;base64,/9j/4AAQ..."
    // ImageKit's upload API expects raw base64 only — the "data:...;base64," prefix
    // causes ImageKit to treat the value as a URL to fetch (which fails) or reject
    // the upload entirely. This was silently breaking every upload even with valid keys.
    const base64Raw = typeof fileData === 'string' && fileData.includes(',')
      ? fileData.split(',')[1]
      : fileData;

    console.log('[imagekit-upload] Base64 processing:', {
      hadPrefix: fileData.includes(','),
      originalLength: fileData.length,
      strippedLength: base64Raw.length,
    });

    // CRITICAL FIX: Decode base64 to binary before sending to ImageKit
    // ImageKit API expects binary data in the 'file' field, not a base64 string
    const binaryData = Uint8Array.from(atob(base64Raw), c => c.charCodeAt(0));

    const credentials = btoa(`${IMAGEKIT_PRIVATE_KEY}:`);
    const formData = new FormData();
    formData.append('file', new Blob([binaryData], { type: 'image/jpeg' }), safeFileName);
    // ImageKit upload API requires fileName as an explicit form field (not just the
    // Blob's Content-Disposition filename). Without this, ImageKit returns HTTP 400
    // "fileName is required" which the function was converting into a 502 error,
    // causing "Photo storage service error" in the UI.
    formData.append('fileName', safeFileName);
    if (folder) formData.append('folder', folder);

    console.log('[imagekit-upload] Sending to ImageKit:', {
      endpoint: 'https://upload.imagekit.io/api/v1/files/upload',
      fileName: safeFileName,
      binaryDataSize: binaryData.length,
      folder,
      credentialsLength: credentials.length,
    });

    const ikRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}` },
      body: formData,
    });

    console.log('[imagekit-upload] ImageKit response:', {
      status: ikRes.status,
      ok: ikRes.ok,
    });

    if (!ikRes.ok) {
      const errText = await ikRes.text().catch(() => `HTTP ${ikRes.status}`);
      console.error('[imagekit-upload] ImageKit error:', errText);
      return jsonResponse({ success: false, error: `ImageKit error: ${errText}` }, 502);
    }

    const ikData = await ikRes.json();
    console.log('[imagekit-upload] Upload successful');
    return jsonResponse({ success: true, url: ikData.url, fileId: ikData.fileId });
  } catch (err: any) {
    console.error('[imagekit-upload] Exception caught:', {
      message: err.message,
      stack: err.stack,
    });
    return jsonResponse({ success: false, error: err.message }, 500);
  }
});
