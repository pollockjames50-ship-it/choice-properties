// Choice Properties — Shared: DB-backed rate limiting
// Replaces in-memory Maps that reset on Deno cold starts.
// Uses rate_limit_log table (see SETUP.sql C-03 migration).
// Requires service-role supabase client so it can bypass RLS.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

/**
 * Check whether `ip` has exceeded `maxRequests` within `windowMs` milliseconds
 * for the given `endpoint`. Always inserts a log row for the current request
 * (the insert itself counts this attempt).
 *
 * Returns true if the caller should be rate-limited (over the limit).
 * Returns false if the request is within the allowed window.
 *
 * Falls back to false (allow) on any DB error so a database hiccup never
 * blocks legitimate users — log the error but don't block traffic.
 */
export async function isDbRateLimited(
  ip: string,
  endpoint: string,
  maxRequests: number,
  windowMs: number,
): Promise<boolean> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const windowStart = new Date(Date.now() - windowMs).toISOString();

    // Insert this request first (counts as one attempt).
    const { error: insertErr } = await supabase
      .from('rate_limit_log')
      .insert({ ip, endpoint });

    if (insertErr) {
      console.error('[rate-limit] insert error:', insertErr.message);
      return false; // fail open
    }

    // Count requests from this IP + endpoint within the window.
    const { count, error: countErr } = await supabase
      .from('rate_limit_log')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('endpoint', endpoint)
      .gte('created_at', windowStart);

    if (countErr) {
      console.error('[rate-limit] count error:', countErr.message);
      return false; // fail open
    }

    return (count ?? 0) > maxRequests;
  } catch (err) {
    console.error('[rate-limit] unexpected error:', err);
    return false; // fail open
  }
}
