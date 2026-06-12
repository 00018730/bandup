// ════════════════════════════════════════════════════════════════════════════
//  EDGE FUNCTION: delete-account
//  Permanently deletes the CURRENT user's account and their data.
//  Required by Apple App Store guideline 5.1.1(v): apps that let users create an
//  account must let them delete it in-app.
//
//  Deploy:
//    supabase functions deploy delete-account --no-verify-jwt
//
//  The app sends the user's access_token in the Authorization header so we delete
//  ONLY the caller's own account.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return json({ error: 'method not allowed' }, 405);

  // ── Identify the caller from their access token ────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return json({ error: 'not authenticated' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return json({ error: 'invalid session' }, 401);

  const userId = user.id;

  try {
    // ── 1. Delete their data rows (best-effort; ignore if tables absent) ──────
    // Order doesn't matter much since we use service role, but delete child data
    // before the profile for cleanliness.
    await admin.from('user_progress').delete().eq('user_id', userId);
    await admin.from('telegram_auth_sessions').delete().eq('telegram_id', null); // no-op safety
    await admin.from('profiles').delete().eq('id', userId);

    // ── 2. Delete their avatar files from storage (best-effort) ───────────────
    try {
      const { data: files } = await admin.storage.from('avatars').list(userId);
      if (files && files.length) {
        const paths = files.map(f => `${userId}/${f.name}`);
        await admin.storage.from('avatars').remove(paths);
      }
    } catch (_) { /* ignore storage errors */ }

    // ── 3. Delete the auth user (this is the actual account removal) ──────────
    const { error: dErr } = await admin.auth.admin.deleteUser(userId);
    if (dErr) return json({ error: dErr.message }, 400);

    return json({ success: true });
  } catch (e) {
    console.error('delete-account error', e);
    return json({ error: 'could not delete account' }, 500);
  }
});