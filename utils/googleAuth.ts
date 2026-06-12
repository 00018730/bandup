// ════════════════════════════════════════════════════════════════════════════
//  utils/googleAuth.ts
//  Native Google Sign-In for iOS + Android. Gets a Google idToken and hands it
//  to Supabase, which verifies it against Google's public keys.
//
//  Requires @react-native-google-signin/google-signin and a custom dev client
//  (NOT Expo Go). Fill in the client IDs below from Google Cloud Console.
// ════════════════════════════════════════════════════════════════════════════

import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from '../supabase';

// 🔧 From Google Cloud Console → Credentials.
// - WEB client ID is REQUIRED (Supabase verifies the token against it).
// - iOS client ID for the iOS app.
// - Android uses the Web client ID + your SHA-1 (configured in the console, not here).
const WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';
const IOS_CLIENT_ID = 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,   // critical: Supabase checks the token's audience against this
    iosClientId: IOS_CLIENT_ID,
    scopes: ['profile', 'email'],
  });
  configured = true;
}

export interface GoogleAuthResult {
  success: boolean;
  isNewUser: boolean;
  error?: string;
  canceled?: boolean;
}

export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  ensureConfigured();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();

    // The library shape varies slightly by version; cover both.
    const idToken = (userInfo as any)?.data?.idToken ?? (userInfo as any)?.idToken;
    if (!idToken) return { success: false, isNewUser: false, error: 'No Google ID token returned.' };

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) return { success: false, isNewUser: false, error: error.message };

    const user = data.user;
    if (!user) return { success: false, isNewUser: false, error: 'Sign-in failed.' };

    // New vs returning, based on whether a profile row exists.
    const { data: profile } = await supabase
      .from('profiles').select('id, full_name').eq('id', user.id).maybeSingle();
    const isNewUser = !profile;

    // Persist Google's name on first sign-in if we don't have one.
    const googleName =
      (user.user_metadata?.full_name as string) ||
      (user.user_metadata?.name as string) || '';
    if (googleName && !profile?.full_name) {
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: googleName,
        auth_provider: 'google',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    }

    return { success: true, isNewUser };
  } catch (e: any) {
    if (e?.code === statusCodes.SIGN_IN_CANCELLED) return { success: false, isNewUser: false, canceled: true };
    if (e?.code === statusCodes.IN_PROGRESS)       return { success: false, isNewUser: false, canceled: true };
    if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { success: false, isNewUser: false, error: 'Google Play Services not available or outdated.' };
    }
    return { success: false, isNewUser: false, error: e?.message ?? 'Google sign-in failed.' };
  }
}