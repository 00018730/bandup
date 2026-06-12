// ════════════════════════════════════════════════════════════════════════════
//  utils/credentials.ts
//  App-side helpers for:
//    • setting a username + password during profile setup
//    • logging in later with username + password
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '../supabase';

// 🔧 Same base URL as telegramAuth.ts
const FUNCTIONS_URL = 'https://irgbzqjpdawixzyborfl.functions.supabase.co';
// 🔧 Same anon key as supabase.ts
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZ2J6cWpwZGF3aXh6eWJvcmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4ODgyNTAsImV4cCI6MjA5MzQ2NDI1MH0.5CsSM2Lxm83WqGFQ9yQvNNOWg2FKaCQuGT3mW6ufui8';

// ── Live username availability check (debounce this in the UI) ────────────────
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', { p_username: username });
  if (error) { console.error('username check', error.message); return false; }
  return Boolean(data);
}

// ── Set username + password for the CURRENT logged-in user ────────────────────
export async function setCredentials(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { success: false, error: 'You must be signed in.' };

  try {
    const res = await fetch(`${FUNCTIONS_URL}/set-credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`, // identifies the caller
      },
      body: JSON.stringify({ username: username.trim(), password }),
    });
    const raw = await res.text();
    const body = raw ? JSON.parse(raw) : null;
    if (!res.ok || !body?.success) {
      return { success: false, error: body?.error ?? `Failed (HTTP ${res.status})` };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Network error' };
  }
}

// ── Log in with username + password ──────────────────────────────────────────
export async function loginWithUsername(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/username-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ username: username.trim(), password }),
    });
    const raw = await res.text();
    const body = raw ? JSON.parse(raw) : null;

    if (!res.ok || !body?.success) {
      return { success: false, error: body?.error ?? 'Incorrect username or password.' };
    }

    // Install the returned session on this device.
    const { error: setErr } = await supabase.auth.setSession({
      access_token:  body.access_token,
      refresh_token: body.refresh_token,
    });
    if (setErr) return { success: false, error: setErr.message };

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Network error' };
  }
}


// ── Permanently delete the current user's account ────────────────────────────
export async function deleteAccount(): Promise<{ success: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { success: false, error: 'You must be signed in.' };

  try {
    const res = await fetch(`${FUNCTIONS_URL}/delete-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({}),
    });
    const raw = await res.text();
    const body = raw ? JSON.parse(raw) : null;
    if (!res.ok || !body?.success) {
      return { success: false, error: body?.error ?? `Failed (HTTP ${res.status})` };
    }
    // Clear the local session after deletion.
    await supabase.auth.signOut();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Network error' };
  }
}