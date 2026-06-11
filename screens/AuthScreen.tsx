import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, useColorScheme, ScrollView, KeyboardAvoidingView,
  Platform, Image, ActivityIndicator, Alert,
} from 'react-native';
import { AntDesign, FontAwesome, Feather } from '@expo/vector-icons';
import { signIn, signUp } from '../utils/auth';
import { syncLocalProgressToSupabase } from '../utils/sync';
import { supabase } from '../supabase';
import { loginWithUsername } from '../utils/credentials';

const ORANGE   = '#e85c2f';
const NAVY      = '#1a2744';
const TG_BLUE  = '#229ED9';

const light = {
  bg: '#ffffff', surface: '#f4f5f8', text: NAVY,
  muted: '#6b7280', border: '#e2e6ee', input: '#f8f9fb',
};
const dark = {
  bg: '#23262d', surface: '#2e323b', text: '#eef0f4',
  muted: '#8a919e', border: '#3e434f', input: '#1d2027',
};

interface FieldProps {
  label: string; placeholder: string; secure?: boolean;
  value: string; onChangeText: (t: string) => void;
  colors: typeof light; keyboardType?: any;
}

function Field({ label, placeholder, secure = false, value, onChangeText, colors, keyboardType }: FieldProps) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <View style={[styles.fieldBox, { backgroundColor: colors.input, borderColor: colors.border }]}>
        <TextInput
          placeholder={placeholder} placeholderTextColor={colors.muted}
          secureTextEntry={secure && !show} style={[styles.fieldInput, { color: colors.text }]}
          autoCapitalize="none" value={value} onChangeText={onChangeText}
          keyboardType={keyboardType}
        />
        {secure && (
          <TouchableOpacity onPress={() => setShow((v: boolean) => !v)} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{show ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function AuthScreen({ navigation }: any) {
  const isDark = useColorScheme() === 'dark';
  const colors = isDark ? dark : light;

  const [tab, setTab]         = useState<'login' | 'signup'>('login');
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPass]   = useState('');
  const [loading, setLoading] = useState(false);
  const isLogin = tab === 'login';

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', isLogin
        ? 'Please enter your username and password.'
        : 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        // Login uses USERNAME + password (resolved to a session server-side).
        const result = await loginWithUsername(email.trim(), password);
        if (!result.success) { Alert.alert('Login failed', result.error ?? 'Incorrect username or password.'); return; }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) await syncLocalProgressToSupabase(user.id);

        const { data: profile, error: profileErr } = await supabase
          .from('profiles').select('id').eq('id', user!.id).maybeSingle();

        if (profileErr) {
          console.error('Profile check error:', profileErr.message);
          navigation.replace('MainTabs');
        } else {
          navigation.replace(profile ? 'MainTabs' : 'ProfileSetup');
        }
      } else {
        if (!name.trim()) { Alert.alert('Missing name', 'Please enter your full name.'); return; }
        const { error } = await signUp(email.trim(), password, name.trim());
        if (error) { Alert.alert('Sign up failed', error.message); return; }
        navigation.navigate('Confirmation', { email: email.trim() });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Enter your email', 'Type your email address in the field above, then tap "Forgot password?" again.');
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) { Alert.alert('Error', error.message); return; }
      Alert.alert('Check your email', `We've sent a password reset link to ${email.trim()}.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not send reset email. Please try again.');
    }
  };

  const handleSocialLogin = (provider: 'Google' | 'Apple') => {
    Alert.alert('Coming soon', `${provider} sign-in will be available in an upcoming update.`);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Back to app */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.navigate('MainTabs')}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={15} color={colors.muted} />
            <Text style={[styles.backBtnText, { color: colors.muted }]}>Back to app</Text>
          </TouchableOpacity>

          {/* Logo */}
          <View style={styles.logoArea}>
            <Image source={require('../assets/IPlogo.png')} style={styles.logoImage} resizeMode="contain" />
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={[styles.appName, { color: colors.text }]}>
                IELTS<Text style={{ color: ORANGE }}>Path</Text>
              </Text>
              <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: colors.text }}>
                BY <Text style={{ color: ORANGE }}>MOCK</Text>MASTER
              </Text>
            </View>
            <Text style={[styles.tagline, { color: colors.muted }]}>Achieve your target band score</Text>
          </View>

          {/* Telegram — primary social login (fast, no password) */}
          <TouchableOpacity
            style={styles.telegramBtn}
            onPress={() => navigation.navigate('TelegramAuth')}
            activeOpacity={0.88}
          >
            <Feather name="send" size={18} color="#fff" />
            <Text style={styles.telegramBtnText}>Continue with Telegram</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.muted }]}>or use email</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Tab switcher */}
          <View style={[styles.tabBar, { backgroundColor: colors.surface }]}>
            {(['login', 'signup'] as const).map(t => (
              <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabActive]} onPress={() => setTab(t)} activeOpacity={0.85}>
                <Text style={[styles.tabText, { color: tab === t ? '#fff' : colors.muted }]}>
                  {t === 'login' ? 'Login' : 'Sign up'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Greeting */}
          <View style={styles.greetWrap}>
            <Text style={[styles.greetHead, { color: colors.text }]}>{isLogin ? 'Welcome back 👋' : 'Get started!'}</Text>
            <Text style={[styles.greetSub, { color: colors.muted }]}>
              {isLogin ? 'Log in to continue your practice' : 'Create your free account today'}
            </Text>
          </View>

          {/* Form */}
          {!isLogin && <Field label="FULL NAME" placeholder="Enter your name" value={name} onChangeText={setName} colors={colors} />}
          {isLogin
            ? <Field label="USERNAME" placeholder="Enter your username" value={email} onChangeText={setEmail} colors={colors} />
            : <Field label="EMAIL" placeholder="your@email.com" value={email} onChangeText={setEmail} colors={colors} keyboardType="email-address" />}
          <Field label="PASSWORD" placeholder="••••••••" secure value={password} onChangeText={setPass} colors={colors} />

          {isLogin && (
            <TouchableOpacity style={styles.forgotWrap} onPress={handleForgotPassword} activeOpacity={0.7}>
              <Text style={[styles.forgotText, { color: ORANGE }]}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          {/* CTA */}
          <TouchableOpacity style={[styles.cta, { opacity: loading ? 0.7 : 1 }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.88}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.ctaText}>{isLogin ? 'Log in' : 'Create account'}</Text>
            }
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.muted }]}>or continue with</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Social */}
          <View style={styles.socialRow}>
            <TouchableOpacity
              style={[styles.socialBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handleSocialLogin('Google')}
              activeOpacity={0.75}
            >
              <AntDesign name={'google' as any} size={16} color={isDark ? '#fff' : '#000'} />
              <Text style={[styles.socialLabel, { color: colors.text }]}>Google</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.socialBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => handleSocialLogin('Apple')}
              activeOpacity={0.75}
            >
              <FontAwesome name={'apple' as any} size={16} color={isDark ? '#fff' : '#000'} />
              <Text style={[styles.socialLabel, { color: colors.text }]}>Apple</Text>
            </TouchableOpacity>
          </View>

          {/* Switch tab */}
          <View style={styles.switchRow}>
            <Text style={[styles.switchText, { color: colors.muted }]}>{isLogin ? "Don't have an account? " : 'Already have an account? '}</Text>
            <TouchableOpacity onPress={() => setTab(isLogin ? 'signup' : 'login')}>
              <Text style={[styles.switchLink, { color: ORANGE }]}>{isLogin ? 'Sign up' : 'Log in'}</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  scroll:      { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },
  backBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  backBtnText: { fontSize: 13, fontWeight: '600' },
  logoArea:    { alignItems: 'center', marginBottom: 24 },
  logoImage:   { width: 80, height: 80, borderRadius: 16, marginBottom: 10 },
  appName:     { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  tagline:     { fontSize: 12, fontWeight: '500', marginTop: 3 },

  telegramBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: TG_BLUE, borderRadius: 12, paddingVertical: 14 },
  telegramBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.1 },

  tabBar:      { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 22 },
  tabBtn:      { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabActive:   { backgroundColor: ORANGE },
  tabText:     { fontSize: 13, fontWeight: '700' },
  greetWrap:   { marginBottom: 20 },
  greetHead:   { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 3 },
  greetSub:    { fontSize: 12.5, fontWeight: '500' },
  fieldWrap:   { marginBottom: 12 },
  fieldLabel:  { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, marginBottom: 5 },
  fieldBox:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  fieldInput:  { flex: 1, fontSize: 14 },
  forgotWrap:  { alignItems: 'flex-end', marginBottom: 18, marginTop: -4 },
  forgotText:  { fontSize: 12, fontWeight: '700' },
  cta:         { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 0 },
  ctaText:     { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.1 },
  dividerRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 10.5, fontWeight: '600' },
  socialRow:   { flexDirection: 'row', gap: 10, marginBottom: 18 },
  socialBtn:   { flex: 1, paddingVertical: 10, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  socialLabel: { fontSize: 13, fontWeight: '700' },
  switchRow:   { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  switchText:  { fontSize: 12 },
  switchLink:  { fontSize: 12, fontWeight: '800' },
});