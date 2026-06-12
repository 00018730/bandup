// ════════════════════════════════════════════════════════════════════════════
//  utils/appleAuth.ts
//  Native Sign in with Apple for iOS. Gets an identity token from Apple and
//  hands it to Supabase, which verifies it against Apple's public keys.
//  iOS-only: no Services ID / .p8 key needed for the native flow.
// ════════════════════════════════════════════════════════════════════════════

import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

export interface AppleAuthResult {
  success: boolean;
  isNewUser: boolean;
  error?: string;
  canceled?: boolean;
}

// Returns true if the device can offer Sign in with Apple (iOS 13+).
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try { return await AppleAuthentication.isAvailableAsync(); }
  catch { return false; }
}

export async function signInWithApple(): Promise<AppleAuthResult> {
  try {
    // 1. Native Apple prompt → returns an identityToken (+ name/email on FIRST
    //    sign-in only; Apple never sends them again).
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { success: false, isNewUser: false, error: 'No identity token returned by Apple.' };
    }

    // 2. Hand the token to Supabase. It validates against Apple's public keys
    //    and creates/returns the auth user.
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) return { success: false, isNewUser: false, error: error.message };

    const user = data.user;
    if (!user) return { success: false, isNewUser: false, error: 'Sign-in failed.' };

    // 3. Apple only returns the name on the very first authorization. If present,
    //    persist it to auth metadata + profiles so we don't lose it.
    const appleName = credential.fullName
      ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ').trim()
      : '';

    // 4. Does a profile already exist? Determines new vs returning.
    const { data: profile } = await supabase
      .from('profiles').select('id, full_name').eq('id', user.id).maybeSingle();

    const isNewUser = !profile;

    if (appleName && (!profile?.full_name)) {
      await supabase.auth.updateUser({ data: { full_name: appleName } });
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: appleName,
        auth_provider: 'apple',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    }

    return { success: true, isNewUser };
  } catch (e: any) {
    // User tapped "Cancel" on the Apple sheet — not an error to alert on.
    if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') {
      return { success: false, isNewUser: false, canceled: true };
    }
    return { success: false, isNewUser: false, error: e?.message ?? 'Apple sign-in failed.' };
  }
}