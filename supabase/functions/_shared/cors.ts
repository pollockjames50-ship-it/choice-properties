// Choice Properties — Shared: CORS headers
// Used by all Edge Functions. Import this instead of redefining locally.

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const corsResponse = () => new Response('ok', { headers: cors });
