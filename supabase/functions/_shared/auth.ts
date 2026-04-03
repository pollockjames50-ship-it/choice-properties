// Choice Properties — Shared: Auth helpers
// Provides requireAuth() and requireAdmin() for Edge Functions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { cors } from './cors.ts';

export type AuthResult =
  | { ok: true;  user: { id: string }; supabase: ReturnType<typeof createClient> }
  | { ok: false; response: Response };

// Returns a verified user + service-role supabase client,
// or a ready-to-return 401 Response if auth fails.
export async function requireAuth(req: Request): Promise<AuthResult> {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      ),
    };
  }

  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );
  const { data: { user }, error: authErr } = await authClient.auth.getUser(jwt);

  if (authErr || !user) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      ),
    };
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  return { ok: true, user, supabase };
}

// Like requireAuth, but also checks admin_roles and returns 403 if not admin.
export async function requireAdmin(req: Request): Promise<AuthResult> {
  const authResult = await requireAuth(req);
  if (!authResult.ok) return authResult;

  const { user, supabase } = authResult;
  const { data: adminRow } = await supabase
    .from('admin_roles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ success: false, error: 'Forbidden' }),
        { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } }
      ),
    };
  }

  return { ok: true, user, supabase };
}
