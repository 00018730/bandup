// ════════════════════════════════════════════════════════════════════════════
//  utils/telegramAuth.ts
//  App-side helpers for the Telegram login flow.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '../supabase';

// 🔧 SET THIS to your bot's username (without @), e.g. 'IELTSPathBot'
const BOT_USERNAME = 'bandup_uz_bot';

// 🔧 SET THIS to your project's functions base URL.
//   https://<PROJECT_REF>.functions.supabase.co
// ⚠️ NO trailing slash, NO /telegram-verify at the end — just the base.
const FUNCTIONS_URL = 'https://irgbzqjpdawixzyborfl.functions.supabase.co';

// 🔧 SET THIS to your project's ANON (public) key — the SAME one used in
// supabase.ts when you call createClient(url, anonKey). It's safe to expose;
// it's the public key. The edge-function gateway needs it to know which
// project the request belongs to (otherwise: "Project not specified").
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZ2J6cWpwZGF3aXh6eWJvcmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4ODgyNTAsImV4cCI6MjA5MzQ2NDI1MH0.5CsSM2Lxm83WqGFQ9yQvNNOWg2FKaCQuGT3mW6ufui8';

function randomToken() {
  const bytes = new Uint8Array(24);
  (globalThis.crypto ?? require('react-native-get-random-values')).getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export interface TelegramAuthStart {
  sessionToken: string;
  botUrl: string;
}

// ── 1. Create a pending session and build the bot deep-link ──────────────────
export async function startTelegramAuth(): Promise<TelegramAuthStart> {
  const sessionToken = randomToken();

  const { error } = await supabase
    .from('telegram_auth_sessions')
    .insert({ session_token: sessionToken, status: 'pending' });

  if (error) throw new Error(error.message);

  const botUrl = `https://t.me/${BOT_USERNAME}?start=${sessionToken}`;
  return { sessionToken, botUrl };
}

// ── 2. Poll session status ───────────────────────────────────────────────────
export async function pollTelegramStatus(sessionToken: string): Promise<{
  status: string; codeReady: boolean; phone: string | null;
}> {
  const { data, error } = await supabase
    .from('telegram_auth_status')
    .select('status, code_ready, phone')
    .eq('session_token', sessionToken)
    .maybeSingle();

  if (error || !data) return { status: 'pending', codeReady: false, phone: null };
  return { status: data.status, codeReady: data.code_ready, phone: data.phone };
}

// ── 3. Verify the 6-digit code → real Supabase session ───────────────────────
export interface TelegramVerifyResult {
  success: boolean;
  isNewUser: boolean;
  error?: string;
}

export async function verifyTelegramCode(
  sessionToken: string,
  code: string,
): Promise<TelegramVerifyResult> {
  const url = `${FUNCTIONS_URL}/telegram-verify`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The gateway needs these to resolve the project. Without the apikey
        // header you get HTTP 400 "Project not specified".
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ session_token: sessionToken, code: code.trim() }),
    });
  } catch (e: any) {
    return { success: false, isNewUser: false, error: `Network error: ${e?.message ?? 'could not reach server'}` };
  }

  // Read as text first so a non-JSON error page doesn't crash JSON.parse.
  const raw = await res.text();
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    const snippet = raw.slice(0, 80).replace(/\s+/g, ' ').trim();
    return {
      success: false,
      isNewUser: false,
      error: res.ok
        ? `Unexpected server response: "${snippet}"`
        : `Server error ${res.status}. Check that the edge function is deployed and FUNCTIONS_URL is correct. Response: "${snippet}"`,
    };
  }

  if (!res.ok || !body?.success) {
    return { success: false, isNewUser: false, error: body?.error ?? `Verification failed (HTTP ${res.status})` };
  }

  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: body.token_hash,
  });

  if (otpErr) {
    return { success: false, isNewUser: false, error: otpErr.message };
  }

  return { success: true, isNewUser: Boolean(body.is_new_user) };
}