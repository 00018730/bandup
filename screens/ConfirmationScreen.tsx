import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, useColorScheme, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { verifyOtp, resendOtp } from '../utils/auth';
import { syncLocalProgressToSupabase } from '../utils/sync';
import { supabase } from '../supabase';

const ORANGE = '#e85c2f';
const NAVY   = '#1a2744';
const OTP_LENGTH     = 6;
const EXPIRY_SECONDS = 10 * 60;

const light = { bg:'#ffffff', surface:'#f4f5f8', text:NAVY, muted:'#6b7280', border:'#e2e6ee', input:'#f8f9fb' };
const dark  = { bg:'#23262d', surface:'#2e323b', text:'#eef0f4', muted:'#8a919e', border:'#3e434f', input:'#1d2027' };

export default function ConfirmationScreen({ route, navigation }: any) {
  const { email = '' } = route?.params ?? {};
  const isDark = useColorScheme() === 'dark';
  const colors = isDark ? dark : light;

  const [otp, setOtp]                   = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [secondsLeft, setSecondsLeft]   = useState(EXPIRY_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading]           = useState(false);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown(s => s - 1), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const handleChange = (text: string, index: number) => {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    if (digit && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0)
      inputs.current[index - 1]?.focus();
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    const { error } = await resendOtp(email);
    if (error) { Alert.alert('Error', error.message); return; }
    setOtp(Array(OTP_LENGTH).fill(''));
    setSecondsLeft(EXPIRY_SECONDS);
    setResendCooldown(60);
    inputs.current[0]?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < OTP_LENGTH) return;
    setLoading(true);
    try {
      const { error } = await verifyOtp(email, code);
      if (error) { Alert.alert('Verification failed', error.message); return; }
      const { data } = await supabase.auth.getUser();
      if (data.user) await syncLocalProgressToSupabase(data.user.id);
      navigation.replace('ProfileSetup');
    } finally {
      setLoading(false);
    }
  };

  const isExpired = secondsLeft <= 0;
  const isFilled  = otp.every(d => d !== '');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>

          <TouchableOpacity style={[styles.backBtn, { borderColor: colors.border }]} onPress={() => navigation.goBack()}>
            <AntDesign name={'left' as any} size={18} color={colors.text} />
          </TouchableOpacity>

          <View style={[styles.iconWrap, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb' }]}>
            <AntDesign name={'mail' as any} size={28} color={ORANGE} />
          </View>

          <Text style={[styles.heading, { color: colors.text }]}>Check your email</Text>
          <Text style={[styles.subheading, { color: colors.muted }]}>
            We sent a 6-digit confirmation code to{'\n'}
            <Text style={{ color: colors.text, fontWeight: '700' }}>{email}</Text>
          </Text>

          <View style={styles.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i} ref={ref => { inputs.current[i] = ref; }}
                style={[styles.otpBox, {
                  borderColor: digit ? ORANGE : colors.border,
                  backgroundColor: digit ? (isDark ? '#2a1a12' : '#fff5f2') : colors.input,
                  color: digit ? ORANGE : colors.text,
                }]}
                keyboardType="number-pad" maxLength={1} value={digit}
                onChangeText={text => handleChange(text, i)}
                onKeyPress={e => handleKeyPress(e, i)}
                textAlign="center" selectionColor={ORANGE} editable={!isExpired}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.cta, { opacity: isFilled && !isExpired && !loading ? 1 : 0.45 }]}
            onPress={handleVerify} disabled={!isFilled || isExpired || loading} activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Verify email</Text>}
          </TouchableOpacity>

          <View style={styles.resendRow}>
            <Text style={[styles.resendText, { color: colors.muted }]}>Didn't receive the code? </Text>
            <TouchableOpacity onPress={handleResend} disabled={resendCooldown > 0}>
              <Text style={[styles.resendLink, { color: resendCooldown > 0 ? colors.muted : ORANGE }]}>
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.timerPill, { backgroundColor: colors.surface }]}>
            <AntDesign name={'clockcircleo' as any} size={12} color={colors.muted} />
            {isExpired
              ? <Text style={[styles.timerText, { color: colors.muted }]}>Code expired — <Text style={{ color: ORANGE, fontWeight: '800' }} onPress={handleResend}>resend</Text></Text>
              : <Text style={[styles.timerText, { color: colors.muted }]}>Code expires in <Text style={{ color: ORANGE, fontWeight: '800' }}>{formatTime(secondsLeft)}</Text></Text>
            }
          </View>

          <View style={[styles.tip, { backgroundColor: colors.surface }]}>
            <AntDesign name={'infocirlceo' as any} size={13} color={colors.muted} style={{ marginTop: 1 }} />
            <Text style={[styles.tipText, { color: colors.muted }]}>
              Check your spam folder if you don't see the email in your inbox.
            </Text>
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  backBtn:   { width: 38, height: 38, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  iconWrap:  { width: 62, height: 62, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  heading:   { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginBottom: 8 },
  subheading:{ fontSize: 13.5, lineHeight: 20, marginBottom: 32 },
  otpRow:    { flexDirection: 'row', gap: 8, marginBottom: 28 },
  otpBox:    { flex: 1, height: 52, borderWidth: 2, borderRadius: 10, fontSize: 22, fontWeight: '800' },
  cta:       { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 18 },
  ctaText:   { color: '#fff', fontSize: 15, fontWeight: '800' },
  resendRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
  resendText:{ fontSize: 13 },
  resendLink:{ fontSize: 13, fontWeight: '700' },
  timerPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginBottom: 20 },
  timerText: { fontSize: 12, fontWeight: '600' },
  tip:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12 },
  tipText:   { flex: 1, fontSize: 12, lineHeight: 18 },
});