// ════════════════════════════════════════════════════════════════════════════
//  EDGE FUNCTION: username-login
//  Logs a user in with USERNAME + PASSWORD. The username↔email mapping never
//  leaves the server, and wrong-username vs wrong-password return the SAME error
//  so usernames can't be enumerated.
//
//  Deploy:
//    supabase functions deploy username-login --no-verify-jwt
//
//  Returns { success, access_token, refresh_token } on success. The app then
//  calls supabase.auth.setSession({ access_token, refresh_token }).
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Same generic message whether the username doesn't exist OR the password is
// wrong — prevents attackers from learning which usernames are registered.
const GENERIC = 'Incorrect username or password.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return json({ error: 'method not allowed' }, 405);

  let payload: { username?: string; password?: string };
  try { payload = await req.json(); } catch { return json({ error: 'invalid body' }, 400); }

  const username = (payload.username ?? '').trim();
  const password = payload.password ?? '';
  if (!username || !password) return json({ error: GENERIC }, 401);

  try {
    // ── Resolve username → user id → email (server-side only) ────────────────
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .maybeSingle();

    if (!profile) return json({ error: GENERIC }, 401); // unknown username → generic

    const { data: userData, error: gErr } = await admin.auth.admin.getUserById(profile.id);
    if (gErr || !userData?.user?.email) return json({ error: GENERIC }, 401);

    const email = userData.user.email;

    // ── Verify the password by attempting a normal sign-in ───────────────────
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn, error: sErr } = await anon.auth.signInWithPassword({ email, password });

    if (sErr || !signIn?.session) return json({ error: GENERIC }, 401); // wrong password → same generic

    // ── Success: hand the session back to the app ────────────────────────────
    return json({
      success: true,
      access_token:  signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    });
  } catch (e) {
    console.error('username-login error', e);
    return json({ error: GENERIC }, 401);
  }
});