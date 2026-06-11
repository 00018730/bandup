// ════════════════════════════════════════════════════════════════════════════
//  screens/TelegramAuthScreen.tsx
//  Handles the full Telegram login UX:
//    - opens the bot
//    - waits for the user to share their phone (polls status)
//    - 6-digit code entry
//    - verifies → navigates into the app
//
//  Register in App.tsx:
//    <Stack.Screen name="TelegramAuth" component={TelegramAuthScreen} />
// ════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, useColorScheme, ActivityIndicator, Alert,
  Linking, AppState,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  startTelegramAuth, pollTelegramStatus, verifyTelegramCode,
} from '../utils/telegramAuth';

const ORANGE   = '#e85c2f';
const NAVY      = '#1a2744';
const TG_BLUE  = '#229ED9';

const light = { bg:'#ffffff', surface:'#f4f5f8', text:NAVY, muted:'#6b7280', border:'#e2e6ee', input:'#f8f9fb' };
const dark  = { bg:'#23262d', surface:'#2e323b', text:'#eef0f4', muted:'#8a919e', border:'#3e434f', input:'#1d2027' };

const CODE_LEN = 6;

export default function TelegramAuthScreen({ navigation }: any) {
  const isDark = useColorScheme() === 'dark';
  const colors = isDark ? dark : light;

  const [phase, setPhase]   = useState<'intro' | 'waiting' | 'code'>('intro');
  const [token, setToken]   = useState<string | null>(null);
  const [code, setCode]     = useState('');
  const [loading, setLoading] = useState(false);
  const [phone, setPhone]   = useState<string | null>(null);
  const pollRef             = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef            = useRef<TextInput>(null);

  // ── Cleanup polling on unmount ─────────────────────────────────────────────
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Start: create session + open bot ───────────────────────────────────────
  const handleStart = async () => {
    setLoading(true);
    try {
      const { sessionToken, botUrl } = await startTelegramAuth();
      setToken(sessionToken);
      setPhase('waiting');

      const canOpen = await Linking.canOpenURL(botUrl);
      if (!canOpen) {
        Alert.alert(
          'Telegram not installed',
          'You need the Telegram app to sign in this way. Install it and try again, or use email instead.',
        );
        setPhase('intro');
        return;
      }
      await Linking.openURL(botUrl);

      // Start polling for the user sharing their phone / code being ready.
      startPolling(sessionToken);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not start Telegram login.');
      setPhase('intro');
    } finally {
      setLoading(false);
    }
  };

  // ── Poll until the bot has sent the code ───────────────────────────────────
  const startPolling = (sessionToken: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { status, codeReady, phone: ph } = await pollTelegramStatus(sessionToken);
        if (ph) setPhone(ph);
        if (codeReady || status === 'code_sent') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase('code');
          setTimeout(() => inputRef.current?.focus(), 300);
        }
      } catch { /* keep polling */ }
    }, 2000);

    // Safety: stop polling after 10 minutes.
    setTimeout(() => { if (pollRef.current) clearInterval(pollRef.current); }, 10 * 60 * 1000);
  };

  // ── Re-check status when app returns to foreground (user comes back from TG) ─
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && token && phase === 'waiting') {
        pollTelegramStatus(token).then(({ status, codeReady }) => {
          if (codeReady || status === 'code_sent') {
            if (pollRef.current) clearInterval(pollRef.current);
            setPhase('code');
            setTimeout(() => inputRef.current?.focus(), 300);
          }
        });
      }
    });
    return () => sub.remove();
  }, [token, phase]);

  // ── Verify the code ────────────────────────────────────────────────────────
  const handleVerify = async (submitted?: string) => {
    const finalCode = (submitted ?? code).trim();
    if (finalCode.length !== CODE_LEN || !token) return;
    setLoading(true);
    try {
      const result = await verifyTelegramCode(token, finalCode);
      if (!result.success) {
        Alert.alert('Verification failed', result.error ?? 'Please check the code and try again.');
        setCode('');
        return;
      }
      // Logged in. Route based on whether they're new.
      navigation.replace(result.isNewUser ? 'ProfileSetup' : 'MainTabs');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not verify the code.');
    } finally {
      setLoading(false);
    }
  };

  // auto-submit when 6 digits entered
  const onChangeCode = (v: string) => {
    const digits = v.replace(/[^0-9]/g, '').slice(0, CODE_LEN);
    setCode(digits);
    if (digits.length === CODE_LEN) handleVerify(digits);
  };

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      {/* Back */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
        <Feather name="arrow-left" size={20} color={colors.muted} />
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Telegram icon */}
        <View style={[styles.tgCircle, { backgroundColor: TG_BLUE }]}>
          <Feather name="send" size={34} color="#fff" />
        </View>

        {phase === 'intro' && (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Continue with Telegram</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              We'll open Telegram so you can share your phone number and receive a 6-digit login code.
            </Text>
            <TouchableOpacity
              style={[styles.cta, { backgroundColor: TG_BLUE }]}
              onPress={handleStart} disabled={loading} activeOpacity={0.88}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.ctaText}>Open Telegram</Text>}
            </TouchableOpacity>
          </>
        )}

        {phase === 'waiting' && (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Waiting for Telegram…</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              In Telegram: tap <Text style={{ fontWeight: '800' }}>Start</Text>, then share your phone
              number. Your 6-digit code will appear in the chat.
            </Text>
            <ActivityIndicator color={TG_BLUE} size="large" style={{ marginVertical: 16 }} />
            <TouchableOpacity onPress={() => setPhase('code')} activeOpacity={0.7}>
              <Text style={[styles.linkText, { color: ORANGE }]}>I already have my code →</Text>
            </TouchableOpacity>
          </>
        )}

        {phase === 'code' && (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Enter your code</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {phone
                ? `We sent a 6-digit code to ${phone} via Telegram.`
                : 'Enter the 6-digit code from the Telegram chat.'}
            </Text>

            {/* Code boxes */}
            <TouchableOpacity activeOpacity={1} onPress={() => inputRef.current?.focus()} style={styles.codeRow}>
              {Array.from({ length: CODE_LEN }).map((_, i) => (
                <View key={i} style={[styles.codeBox, {
                  borderColor: code.length === i ? TG_BLUE : colors.border,
                  backgroundColor: colors.input,
                }]}>
                  <Text style={[styles.codeDigit, { color: colors.text }]}>{code[i] ?? ''}</Text>
                </View>
              ))}
            </TouchableOpacity>

            {/* Hidden actual input */}
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={onChangeCode}
              keyboardType="number-pad"
              maxLength={CODE_LEN}
              style={styles.hiddenInput}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.cta, { backgroundColor: TG_BLUE, opacity: code.length === CODE_LEN && !loading ? 1 : 0.5 }]}
              onPress={() => handleVerify()}
              disabled={code.length !== CODE_LEN || loading}
              activeOpacity={0.88}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.ctaText}>Verify & sign in</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleStart} activeOpacity={0.7} style={{ marginTop: 16 }}>
              <Text style={[styles.linkText, { color: colors.muted }]}>Didn't get a code? Restart</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  backBtn:     { padding: 16 },
  content:     { flex: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  tgCircle:    { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title:       { fontSize: 23, fontWeight: '800', textAlign: 'center', marginBottom: 10, letterSpacing: -0.3 },
  subtitle:    { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 21, marginBottom: 28, paddingHorizontal: 8 },
  cta:         { width: '100%', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  ctaText:     { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  linkText:    { fontSize: 13, fontWeight: '700' },
  codeRow:     { flexDirection: 'row', gap: 10, marginBottom: 28 },
  codeBox:     { width: 46, height: 56, borderWidth: 2, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  codeDigit:   { fontSize: 24, fontWeight: '800' },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
});