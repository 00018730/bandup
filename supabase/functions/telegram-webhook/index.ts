// ════════════════════════════════════════════════════════════════════════════
//  EDGE FUNCTION: set-credentials
//  Called by a logged-in user during profile setup to set a username + password
//  they can use to log in directly afterward.
//
//  Why an edge function: setting a real password on the auth account and
//  guaranteeing username uniqueness needs the service role. The app must never
//  hold the service key.
//
//  Deploy:
//    supabase functions deploy set-credentials --no-verify-jwt
//
//  The app sends the user's access_token in the Authorization header so we can
//  verify WHO is calling and only modify their own account.
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

// Basic username rules: 3–20 chars, letters/numbers/underscore, must start with a letter.
function validUsername(u: string) {
  return /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/.test(u);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return json({ error: 'method not allowed' }, 405);

  // ── Identify the caller from their access token ────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return json({ error: 'not authenticated' }, 401);

  // Verify the token and get the user it belongs to.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return json({ error: 'invalid session' }, 401);

  // ── Parse + validate input ─────────────────────────────────────────────────
  let payload: { username?: string; password?: string };
  try { payload = await req.json(); } catch { return json({ error: 'invalid body' }, 400); }

  const username = (payload.username ?? '').trim();
  const password = payload.password ?? '';

  if (!validUsername(username)) {
    return json({ error: 'Username must be 3–20 characters, start with a letter, and use only letters, numbers, or underscores.' }, 400);
  }
  if (password.length < 6) {
    return json({ error: 'Password must be at least 6 characters.' }, 400);
  }

  try {
    // ── Ensure username is free (case-insensitive), excluding the caller ──────
    const { data: taken } = await admin
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .neq('id', user.id)
      .maybeSingle();

    if (taken) return json({ error: 'That username is already taken.' }, 409);

    // ── Set the real password on the auth account ────────────────────────────
    const { error: pErr } = await admin.auth.admin.updateUserById(user.id, { password });
    if (pErr) return json({ error: pErr.message }, 400);

    // ── Save the username on the profile ─────────────────────────────────────
    const { error: profErr } = await admin
      .from('profiles')
      .update({ username, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (profErr) {
      // Unique-violation safety net (race condition).
      if (profErr.code === '23505') return json({ error: 'That username is already taken.' }, 409);
      return json({ error: profErr.message }, 400);
    }

    return json({ success: true });
  } catch (e) {
    console.error('set-credentials error', e);
    return json({ error: 'could not save credentials' }, 500);
  }
});