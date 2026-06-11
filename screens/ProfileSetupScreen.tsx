// ════════════════════════════════════════════════════════════════════════════
//  screens/ProfileSetupScreen.tsx
//  4-step onboarding wizard. Redundancies removed:
//    • Test selection (IELTS/CEFR/…) is chosen ONCE on Step 1.
//    • Step 2 no longer re-asks which test — it uses the primary test from Step 1.
//    • Step 3 no longer repeats the test grid.
//
//  Steps:
//    1 Personal Info  — photo, name, email, country, current level, tests
//    2 Goals          — target band, target date, motivation, study commitment
//    3 Test Prefs     — skills, difficulty, practice mode, explanations
//    4 Review         — summary + confirm → writes profile, navigates to MainTabs
// ════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, useColorScheme, ActivityIndicator,
  Alert, Image, Switch, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { isUsernameAvailable, setCredentials, loginWithUsername } from '../utils/credentials';

const ORANGE = '#e85c2f';
const NAVY   = '#1a2744';

const light = {
  bg: '#faf7f5', surface: '#ffffff', text: NAVY, muted: '#6b7280',
  border: '#eadfd8', input: '#fdfbfa', chip: '#f5efeb', chipActive: '#fff0eb',
};
const dark = {
  bg: '#0d1a2e', surface: '#152035', text: '#eef0f4', muted: '#8a919e',
  border: '#1e3050', input: '#1a2744', chip: '#1a2744', chipActive: '#2a1a12',
};

// ── Data ──────────────────────────────────────────────────────────────────────
const STEPS = ['Personal Info', 'Goals', 'Preferences', 'Account', 'Review'];

const LEVELS = [
  { key: 'A1-A2', label: 'Beginner',          sub: 'A1 – A2' },
  { key: 'B1',    label: 'Elementary',        sub: 'B1' },
  { key: 'B2',    label: 'Intermediate',      sub: 'B2' },
  { key: 'C1',    label: 'Upper Intermediate',sub: 'C1' },
  { key: 'C2',    label: 'Advanced',          sub: 'C2' },
];

// Only IELTS is active. Others are visible but flagged "coming soon".
const TESTS = [
  { key: 'ielts', label: 'IELTS', badge: 'IDP',  color: ORANGE,   active: true  },
  { key: 'cefr',  label: 'CEFR',  badge: '🇪🇺',  color: '#1a2a6c', active: false },
  { key: 'toefl', label: 'TOEFL', badge: 'ETS',  color: '#0a5ba0', active: false },
  { key: 'pte',   label: 'PTE',   badge: 'PTE',  color: '#c8102e', active: false },
  { key: 'toeic', label: 'TOEIC', badge: 'ETS',  color: '#0a5ba0', active: false },
  { key: 'other', label: 'Other', badge: '•••',  color: '#9ca3af', active: false },
];

const BANDS = ['5.0','5.5','6.0','6.5','7.0','7.5','8.0','8.5','9.0','9.0+'];

const COMMITMENTS = [
  { key: '1-2',   label: '1–2 days' },
  { key: '3-4',   label: '3–4 days' },
  { key: '5-6',   label: '5–6 days' },
  { key: 'daily', label: 'Every day' },
];

const SKILLS = [
  { key: 'listening', label: 'Listening', icon: 'headphones' as const },
  { key: 'reading',   label: 'Reading',   icon: 'book-open'  as const },
  { key: 'writing',   label: 'Writing',   icon: 'edit-3'     as const },
  { key: 'speaking',  label: 'Speaking',  icon: 'mic'        as const },
];

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ step, C }: { step: number; C: typeof light }) {
  return (
    <View style={st.wrap}>
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <React.Fragment key={label}>
            <View style={st.col}>
              <View style={[st.circle, {
                backgroundColor: done || active ? ORANGE : 'transparent',
                borderColor: done || active ? ORANGE : C.border,
              }]}>
                {done
                  ? <Feather name="check" size={14} color="#fff" />
                  : <Text style={[st.num, { color: active ? '#fff' : C.muted }]}>{i + 1}</Text>}
              </View>
              <Text style={[st.label, { color: active ? ORANGE : C.muted, fontWeight: active ? '800' : '600' }]}>
                {label}
              </Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[st.line, { backgroundColor: i < step ? ORANGE : C.border }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}
const st = StyleSheet.create({
  wrap:   { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 8, marginBottom: 24 },
  col:    { alignItems: 'center', width: 64 },
  circle: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  num:    { fontSize: 14, fontWeight: '800' },
  label:  { fontSize: 10, textAlign: 'center', marginTop: 6 },
  line:   { flex: 1, height: 2, marginTop: 16, borderRadius: 1 },
});

// ── Section header ────────────────────────────────────────────────────────────
function Section({ title, subtitle, optional, C }: any) {
  return (
    <View style={{ marginBottom: 12, marginTop: 4 }}>
      <Text style={[sec.title, { color: C.text }]}>
        {title}{optional ? <Text style={[sec.optional, { color: C.muted }]}>  (Optional)</Text> : null}
      </Text>
      {subtitle ? <Text style={[sec.sub, { color: C.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}
const sec = StyleSheet.create({
  title:    { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  optional: { fontSize: 13, fontWeight: '600' },
  sub:      { fontSize: 13, marginTop: 3, lineHeight: 18 },
});

// ════════════════════════════════════════════════════════════════════════════
export default function ProfileSetupScreen({ navigation }: any) {
  const isDark = useColorScheme() === 'dark';
  const C = isDark ? dark : light;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [fullName, setFullName]   = useState('');
  const [email, setEmail]         = useState('');
  const [country, setCountry]     = useState('');
  const [level, setLevel]         = useState<string | null>(null);
  const [selectedTests, setSelectedTests] = useState<string[]>(['ielts']);

  // Step 2
  const [targetBand, setTargetBand] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [motivation, setMotivation] = useState('');
  const [commitment, setCommitment] = useState<string | null>(null);

  // Step 3
  const [skills, setSkills] = useState<string[]>(SKILLS.map(s => s.key));
  const [difficulty, setDifficulty] = useState('Medium');
  const [practiceMode, setPracticeMode] = useState<'exam' | 'learning'>('exam');
  const [showExplanations, setShowExplanations] = useState(true);

  // Step 4 — Account credentials
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');

  // Debounced username availability check.
  useEffect(() => {
    const u = username.trim();
    if (!u) { setUsernameStatus('idle'); return; }
    if (!/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/.test(u)) { setUsernameStatus('invalid'); return; }
    setUsernameStatus('checking');
    const t = setTimeout(async () => {
      const free = await isUsernameAvailable(u);
      setUsernameStatus(free ? 'available' : 'taken');
    }, 500);
    return () => clearTimeout(t);
  }, [username]);

  // Pre-fill name + email from auth metadata
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (u?.user_metadata?.full_name) setFullName(u.user_metadata.full_name);
      if (u?.email && !u.email.endsWith('@telegram.local')) setEmail(u.email);
    });
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const toggle = (arr: string[], key: string, setter: (v: string[]) => void) =>
    setter(arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) setAvatarUri(result.assets[0].uri);
  };

  const tryTest = (t: typeof TESTS[0]) => {
    if (!t.active) {
      Alert.alert('Coming soon', `${t.label} practice is coming in a future update. IELTS is available now.`);
      return;
    }
    toggle(selectedTests, t.key, setSelectedTests);
  };

  const initials = fullName.trim()
    ? fullName.trim().split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?';

  // ── Validation per step ──────────────────────────────────────────────────────
  const canContinue = useMemo(() => {
    if (step === 0) return fullName.trim().length > 0 && selectedTests.length > 0;
    if (step === 1) return Boolean(targetBand);
    if (step === 2) return skills.length > 0;
    if (step === 3) return usernameStatus === 'available'
                        && password.length >= 6
                        && password === confirm;
    return true;
  }, [step, fullName, selectedTests, targetBand, skills, usernameStatus, password, confirm]);

  const next = async () => {
    if (!canContinue) {
      const msg = step === 0
        ? 'Please enter your name and pick at least one test.'
        : step === 1 ? 'Please choose your target band score.'
        : step === 2 ? 'Please select at least one skill.'
        : usernameStatus !== 'available'
            ? 'Please choose an available username.'
            : password.length < 6
                ? 'Password must be at least 6 characters.'
                : 'Passwords do not match.';
      Alert.alert('Almost there', msg);
      return;
    }
    // Step 3 (Account): save username + password before continuing to Review.
    if (step === 3) {
      setSaving(true);
      const res = await setCredentials(username.trim(), password);
      if (!res.success) {
        setSaving(false);
        Alert.alert('Could not save credentials', res.error ?? 'Try again.');
        return;
      }
      // Setting a password server-side invalidates the current session, so
      // re-authenticate with the new credentials to get a fresh valid session
      // (otherwise the Review save fails with "Not authenticated").
      const relog = await loginWithUsername(username.trim(), password);
      setSaving(false);
      if (!relog.success) {
        Alert.alert('Almost done', relog.error ?? 'Please sign in with your new username and password.');
        return;
      }
      setStep(4);
      return;
    }
    if (step < 4) setStep(s => s + 1);
    else handleSave();
  };

  const back = () => {
    if (step === 0) navigation.goBack();
    else setStep(s => s - 1);
  };

  // ── Avatar upload ────────────────────────────────────────────────────────────
  const uploadAvatar = async (userId: string): Promise<string | null> => {
    if (!avatarUri) return null;
    try {
      const ext  = avatarUri.split('.').pop() ?? 'jpg';
      const path = `${userId}/avatar.${ext}`;
      const blob = await (await fetch(avatarUri)).blob();
      const { error } = await supabase.storage
        .from('avatars').upload(path, blob, { upsert: true, contentType: `image/${ext}` });
      if (error) { console.error('avatar upload', error.message); return null; }
      return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    } catch (e) { console.error('uploadAvatar', e); return null; }
  };

  // ── Save everything ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user }, error: uErr } = await supabase.auth.getUser();
      if (uErr || !user) throw new Error('Not authenticated');

      const avatarUrl = await uploadAvatar(user.id);
      if (fullName.trim()) await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });

      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: fullName.trim(),
        username: username.trim() || null,
        email: email.trim() || null,
        country: country.trim() || null,
        current_level: level,
        target_band: targetBand ? parseFloat(targetBand) : null,
        target_date: targetDate,
        motivation: motivation.trim() || null,
        study_commitment: commitment,
        selected_tests: selectedTests,
        focus_skills: skills,
        difficulty,
        practice_mode: practiceMode,
        show_explanations: showExplanations,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (error) throw new Error(error.message);
      navigation.replace('MainTabs');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  //  STEP RENDERERS
  // ════════════════════════════════════════════════════════════════════════════
  const renderStep1 = () => (
    <>
      {/* Avatar */}
      <View style={s.avatarSection}>
        <TouchableOpacity onPress={pickImage} style={s.avatarWrap} activeOpacity={0.85}>
          {avatarUri
            ? <Image source={{ uri: avatarUri }} style={s.avatarImg} />
            : <View style={[s.avatarPlaceholder, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb' }]}>
                <Feather name="user" size={40} color={ORANGE} />
              </View>}
          <View style={[s.cameraBadge, { backgroundColor: ORANGE }]}>
            <Feather name="camera" size={13} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={[s.avatarTitle, { color: C.text }]}>Add a profile photo</Text>
        <Text style={[s.avatarHint, { color: C.muted }]}>JPG, PNG (max 2MB)</Text>
      </View>

      <Section title="Personal Information" C={C} />

      <Field icon="user"  label="FULL NAME" placeholder="Enter your full name"
        value={fullName} onChangeText={setFullName} C={C} autoCapitalize="words" />
      <Field icon="mail"  label="EMAIL" placeholder="Enter your email address"
        value={email} onChangeText={setEmail} C={C} keyboardType="email-address" />
      <Field icon="globe" label="COUNTRY" placeholder="Enter your country"
        value={country} onChangeText={setCountry} C={C} autoCapitalize="words" />

      <View style={{ height: 8 }} />
      <Section title="Your Current Level" optional subtitle="This helps us personalize your experience." C={C} />
      <View style={s.levelRow}>
        {LEVELS.map(l => {
          const sel = level === l.key;
          return (
            <TouchableOpacity key={l.key}
              style={[s.levelChip, { backgroundColor: sel ? C.chipActive : C.chip, borderColor: sel ? ORANGE : C.border }]}
              onPress={() => setLevel(sel ? null : l.key)} activeOpacity={0.8}>
              <Text style={[s.levelLabel, { color: sel ? ORANGE : C.text }]}>{l.label}</Text>
              <Text style={[s.levelSub, { color: sel ? ORANGE : C.muted }]}>{l.sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ height: 8 }} />
      <Section title="What are you preparing for?" subtitle="Select all that apply." C={C} />
      <View style={s.testGrid}>
        {TESTS.map(t => {
          const sel = selectedTests.includes(t.key);
          return (
            <TouchableOpacity key={t.key}
              style={[s.testCard, { backgroundColor: C.surface, borderColor: sel ? ORANGE : C.border }]}
              onPress={() => tryTest(t)} activeOpacity={0.8}>
              <View style={[s.testBadge, { backgroundColor: t.active ? t.color : C.chip }]}>
                <Text style={[s.testBadgeTxt, { color: t.active ? '#fff' : C.muted, fontSize: t.badge.length > 3 ? 9 : 11 }]}>
                  {t.badge}
                </Text>
              </View>
              <Text style={[s.testLabel, { color: C.text }]}>{t.label}</Text>
              {!t.active && <Text style={s.soonTag}>Soon</Text>}
              <View style={[s.checkbox, { borderColor: sel ? ORANGE : C.border, backgroundColor: sel ? ORANGE : 'transparent' }]}>
                {sel && <Feather name="check" size={12} color="#fff" />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  const renderStep2 = () => {
    const primaryTest = TESTS.find(t => t.key === selectedTests[0]) ?? TESTS[0];
    return (
      <>
        <Section title="Target Score or Level"
          subtitle={`Choose your target for ${primaryTest.label}, your primary test.`} C={C} />

        {/* Primary test indicator (read-only — chosen on step 1, no re-asking) */}
        <View style={[s.primaryTest, { backgroundColor: C.surface, borderColor: ORANGE }]}>
          <View style={[s.testBadge, { backgroundColor: primaryTest.color }]}>
            <Text style={[s.testBadgeTxt, { color: '#fff' }]}>{primaryTest.badge}</Text>
          </View>
          <Text style={[s.primaryTestLabel, { color: C.text }]}>{primaryTest.label}</Text>
          <Text style={[s.primaryTestHint, { color: C.muted }]}>Primary test</Text>
        </View>

        <View style={s.bandGrid}>
          {BANDS.map(b => {
            const sel = targetBand === b;
            return (
              <TouchableOpacity key={b}
                style={[s.bandChip, { backgroundColor: sel ? C.chipActive : C.surface, borderColor: sel ? ORANGE : C.border }]}
                onPress={() => setTargetBand(b)} activeOpacity={0.8}>
                <Text style={[s.bandTxt, { color: sel ? ORANGE : C.text }]}>{b}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {targetBand && (
          <View style={[s.hintBox, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb' }]}>
            <Feather name="target" size={16} color={ORANGE} />
            <Text style={[s.hintText, { color: C.text }]}>
              Aim high! A band score of <Text style={{ fontWeight: '800', color: ORANGE }}>{targetBand}</Text> opens more opportunities.
            </Text>
          </View>
        )}

        <View style={{ height: 12 }} />
        <Section title="Target Date" subtitle="When do you plan to achieve your goal?" C={C} />
        <TouchableOpacity
          style={[s.dateRow, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={() => {
            // Simple cycle of preset horizons; swap for a real date picker if desired.
            const presets = ['In 1 month', 'In 3 months', 'In 6 months', 'In 1 year'];
            const idx = targetDate ? presets.indexOf(targetDate) : -1;
            setTargetDate(presets[(idx + 1) % presets.length]);
          }}
          activeOpacity={0.8}>
          <Feather name="calendar" size={18} color={ORANGE} />
          <Text style={[s.dateText, { color: targetDate ? C.text : C.muted }]}>
            {targetDate ?? 'Select target date'}
          </Text>
          <Feather name="chevron-right" size={18} color={C.muted} />
        </TouchableOpacity>

        <View style={{ height: 12 }} />
        <Section title="Why is this important to you?" optional
          subtitle="This helps us personalize your learning experience." C={C} />
        <View style={[s.textArea, { backgroundColor: C.surface, borderColor: C.border }]}>
          <TextInput
            style={[s.textAreaInput, { color: C.text }]}
            placeholder="E.g. Study abroad, career, immigration, personal growth…"
            placeholderTextColor={C.muted}
            value={motivation} onChangeText={t => t.length <= 200 && setMotivation(t)}
            multiline numberOfLines={4} textAlignVertical="top"
          />
          <Text style={[s.charCount, { color: C.muted }]}>{motivation.length}/200</Text>
        </View>

        <View style={{ height: 12 }} />
        <Section title="Study Commitment" subtitle="How many days per week can you study?" C={C} />
        <View style={s.commitRow}>
          {COMMITMENTS.map(c => {
            const sel = commitment === c.key;
            return (
              <TouchableOpacity key={c.key}
                style={[s.commitChip, { backgroundColor: sel ? C.chipActive : C.surface, borderColor: sel ? ORANGE : C.border }]}
                onPress={() => setCommitment(c.key)} activeOpacity={0.8}>
                <Feather name="calendar" size={14} color={sel ? ORANGE : C.muted} />
                <Text style={[s.commitTxt, { color: sel ? ORANGE : C.text }]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </>
    );
  };

  const renderStep3 = () => (
    <>
      <Section title="Skills to Focus On" subtitle="Choose the skills you want to improve." C={C} />
      <View style={s.skillRow}>
        {SKILLS.map(sk => {
          const sel = skills.includes(sk.key);
          return (
            <TouchableOpacity key={sk.key}
              style={[s.skillCard, { backgroundColor: sel ? C.chipActive : C.surface, borderColor: sel ? ORANGE : C.border }]}
              onPress={() => toggle(skills, sk.key, setSkills)} activeOpacity={0.8}>
              <Feather name={sk.icon} size={24} color={ORANGE} />
              <Text style={[s.skillLabel, { color: C.text }]}>{sk.label}</Text>
              <View style={[s.checkboxSm, { borderColor: sel ? ORANGE : C.border, backgroundColor: sel ? ORANGE : 'transparent' }]}>
                {sel && <Feather name="check" size={11} color="#fff" />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ height: 12 }} />
      <Section title="Question Difficulty" subtitle="Choose the default difficulty level for your practice." C={C} />
      <View style={[s.segmented, { backgroundColor: C.surface, borderColor: C.border }]}>
        {DIFFICULTIES.map(d => {
          const sel = difficulty === d;
          return (
            <TouchableOpacity key={d} style={[s.segment, sel && { backgroundColor: C.chipActive }]}
              onPress={() => setDifficulty(d)} activeOpacity={0.8}>
              <Text style={[s.segmentTxt, { color: sel ? ORANGE : C.muted }]}>{d}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ height: 12 }} />
      <Section title="Practice Mode" subtitle="How would you like to practice?" C={C} />
      <View style={s.modeRow}>
        {[
          { key: 'exam' as const,     icon: 'target' as const, title: 'Exam Mode',     desc: 'Timed practice like the real test experience.' },
          { key: 'learning' as const, icon: 'clock'  as const, title: 'Learning Mode', desc: 'Learn at your own pace with explanations.' },
        ].map(m => {
          const sel = practiceMode === m.key;
          return (
            <TouchableOpacity key={m.key}
              style={[s.modeCard, { backgroundColor: sel ? C.chipActive : C.surface, borderColor: sel ? ORANGE : C.border }]}
              onPress={() => setPracticeMode(m.key)} activeOpacity={0.8}>
              <View style={s.modeTop}>
                <Feather name={m.icon} size={20} color={sel ? ORANGE : C.muted} />
                <View style={[s.radio, { borderColor: sel ? ORANGE : C.border }]}>
                  {sel && <View style={s.radioDot} />}
                </View>
              </View>
              <Text style={[s.modeTitle, { color: C.text }]}>{m.title}</Text>
              <Text style={[s.modeDesc, { color: C.muted }]}>{m.desc}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ height: 8 }} />
      <View style={[s.toggleRow, { borderTopColor: C.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.toggleTitle, { color: C.text }]}>Show Explanations</Text>
          <Text style={[s.toggleSub, { color: C.muted }]}>Get detailed explanations for answers.</Text>
        </View>
        <Switch
          value={showExplanations} onValueChange={setShowExplanations}
          trackColor={{ false: C.border, true: ORANGE }} thumbColor="#fff"
        />
      </View>
    </>
  );

  const renderAccount = () => {
    const pwMatch = confirm.length > 0 && password === confirm;
    const statusColor =
      usernameStatus === 'available' ? '#22c55e' :
      usernameStatus === 'taken' || usernameStatus === 'invalid' ? '#ef4444' : C.muted;
    const statusText =
      usernameStatus === 'checking'  ? 'Checking…' :
      usernameStatus === 'available' ? '✓ Available' :
      usernameStatus === 'taken'     ? 'Already taken' :
      usernameStatus === 'invalid'   ? '3–20 chars, start with a letter' : '';
    return (
      <>
        <View style={s.accountIntro}>
          <View style={[s.accountIconWrap, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb' }]}>
            <Feather name="lock" size={26} color={ORANGE} />
          </View>
          <Text style={[s.accountTitle, { color: C.text }]}>Create your login</Text>
          <Text style={[s.accountSub, { color: C.muted }]}>
            Set a username and password so you can sign back in anytime.
          </Text>
        </View>

        {/* Username */}
        <Section title="Username" C={C} />
        <View style={[s.fieldBox, { backgroundColor: C.surface, borderColor: username ? statusColor : C.border }]}>
          <Feather name="at-sign" size={18} color={ORANGE} />
          <View style={{ flex: 1 }}>
            <Text style={[s.fieldLabel, { color: C.muted }]}>USERNAME</Text>
            <TextInput
              style={[s.fieldInput, { color: C.text }]}
              placeholder="e.g. olloyor_m"
              placeholderTextColor={C.muted}
              value={username}
              onChangeText={t => setUsername(t.replace(/[^a-zA-Z0-9_]/g, ''))}
              autoCapitalize="none" autoCorrect={false}
            />
          </View>
          {usernameStatus === 'checking' && <ActivityIndicator size="small" color={C.muted} />}
        </View>
        {statusText ? <Text style={[s.statusLine, { color: statusColor }]}>{statusText}</Text> : null}

        {/* Password */}
        <View style={{ height: 8 }} />
        <Section title="Password" C={C} />
        <View style={[s.fieldBox, { backgroundColor: C.surface, borderColor: password.length >= 6 ? ORANGE : C.border }]}>
          <Feather name="lock" size={18} color={ORANGE} />
          <View style={{ flex: 1 }}>
            <Text style={[s.fieldLabel, { color: C.muted }]}>PASSWORD</Text>
            <TextInput
              style={[s.fieldInput, { color: C.text }]}
              placeholder="At least 6 characters"
              placeholderTextColor={C.muted}
              value={password} onChangeText={setPassword}
              secureTextEntry={!showPw} autoCapitalize="none" autoCorrect={false}
            />
          </View>
          <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name={showPw ? 'eye-off' : 'eye'} size={18} color={C.muted} />
          </TouchableOpacity>
        </View>

        {/* Confirm */}
        <View style={{ height: 12 }} />
        <View style={[s.fieldBox, { backgroundColor: C.surface, borderColor: confirm.length > 0 ? (pwMatch ? '#22c55e' : '#ef4444') : C.border }]}>
          <Feather name="check-circle" size={18} color={ORANGE} />
          <View style={{ flex: 1 }}>
            <Text style={[s.fieldLabel, { color: C.muted }]}>CONFIRM PASSWORD</Text>
            <TextInput
              style={[s.fieldInput, { color: C.text }]}
              placeholder="Re-enter your password"
              placeholderTextColor={C.muted}
              value={confirm} onChangeText={setConfirm}
              secureTextEntry={!showPw} autoCapitalize="none" autoCorrect={false}
            />
          </View>
        </View>
        {confirm.length > 0 && !pwMatch
          ? <Text style={[s.statusLine, { color: '#ef4444' }]}>Passwords don't match</Text>
          : null}

        <View style={[s.hintBox, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb', marginTop: 16 }]}>
          <Feather name="info" size={16} color={ORANGE} />
          <Text style={[s.hintText, { color: C.text }]}>
            You'll use this username and password to log in next time.
          </Text>
        </View>
      </>
    );
  };

  const renderReview = () => {
    const primaryTest = TESTS.find(t => t.key === selectedTests[0]) ?? TESTS[0];
    const levelLabel  = LEVELS.find(l => l.key === level)?.label;
    const commitLabel = COMMITMENTS.find(c => c.key === commitment)?.label;
    const rows: [string, string | null][] = [
      ['Name', fullName.trim() || '—'],
      ['Email', email.trim() || '—'],
      ['Country', country.trim() || '—'],
      ['Current level', levelLabel ?? 'Not set'],
      ['Preparing for', selectedTests.map(k => TESTS.find(t => t.key === k)?.label).filter(Boolean).join(', ')],
      ['Primary test', primaryTest.label],
      ['Target band', targetBand ?? 'Not set'],
      ['Target date', targetDate ?? 'Not set'],
      ['Study commitment', commitLabel ?? 'Not set'],
      ['Focus skills', skills.map(k => SKILLS.find(s => s.key === k)?.label).join(', ')],
      ['Difficulty', difficulty],
      ['Practice mode', practiceMode === 'exam' ? 'Exam Mode' : 'Learning Mode'],
      ['Explanations', showExplanations ? 'On' : 'Off'],
    ];
    return (
      <>
        <View style={s.reviewHero}>
          {avatarUri
            ? <Image source={{ uri: avatarUri }} style={s.reviewAvatar} />
            : <View style={[s.reviewAvatar, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: ORANGE, fontSize: 26, fontWeight: '800' }}>{initials}</Text>
              </View>}
          <Text style={[s.reviewName, { color: C.text }]}>{fullName.trim() || 'Your profile'}</Text>
          <Text style={[s.reviewSub, { color: C.muted }]}>Review everything before you start</Text>
        </View>

        <View style={[s.reviewCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          {rows.map(([k, v], i) => (
            <View key={k} style={[s.reviewRow, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
              <Text style={[s.reviewKey, { color: C.muted }]}>{k}</Text>
              <Text style={[s.reviewVal, { color: C.text }]} numberOfLines={2}>{v || '—'}</Text>
            </View>
          ))}
        </View>

        <View style={[s.hintBox, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb', marginTop: 4 }]}>
          <Feather name="star" size={16} color={ORANGE} />
          <Text style={[s.hintText, { color: C.text }]}>You can change any of this later in your profile.</Text>
        </View>
      </>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: C.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={back} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="chevron-left" size={26} color={ORANGE} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.headerTitle, { color: C.text }]}>
            {step === 0 ? 'Profile Setup' : step === 1 ? 'Set Your Goals' : step === 2 ? 'Test Preferences' : step === 3 ? 'Account' : 'Review'}
          </Text>
          <Text style={[s.headerSub, { color: C.muted }]}>
            {step === 0 ? "Let's get to know you better"
              : step === 1 ? 'What do you want to achieve?'
              : step === 2 ? 'Customize your practice experience'
              : step === 3 ? 'Set your username and password'
              : 'Make sure everything looks right'}
          </Text>
        </View>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <Stepper step={step} C={C} />
        {step === 0 && renderStep1()}
        {step === 1 && renderStep2()}
        {step === 2 && renderStep3()}
        {step === 3 && renderAccount()}
        {step === 4 && renderReview()}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Continue */}
      <View style={[s.footer, { backgroundColor: C.bg, borderTopColor: C.border }]}>
        <TouchableOpacity
          style={[s.continueBtn, { opacity: saving ? 0.7 : 1 }]}
          onPress={next} disabled={saving} activeOpacity={0.88}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.continueTxt}>{step === 4 ? "Let's go! 🚀" : 'Continue'}</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Reusable field ────────────────────────────────────────────────────────────
function Field({ icon, label, placeholder, value, onChangeText, C, keyboardType, autoCapitalize }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={[s.fieldBox, { backgroundColor: C.surface, borderColor: value ? ORANGE : C.border }]}>
        <Feather name={icon} size={18} color={ORANGE} />
        <View style={{ flex: 1 }}>
          <Text style={[s.fieldLabel, { color: C.muted }]}>{label}</Text>
          <TextInput
            style={[s.fieldInput, { color: C.text }]}
            placeholder={placeholder} placeholderTextColor={C.muted}
            value={value} onChangeText={onChangeText}
            keyboardType={keyboardType} autoCapitalize={autoCapitalize ?? 'none'}
            autoCorrect={false}
          />
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  headerSub:   { fontSize: 13, marginTop: 2 },
  scroll:      { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },

  avatarSection:    { alignItems: 'center', marginBottom: 20 },
  avatarWrap:       { position: 'relative', marginBottom: 10 },
  avatarImg:        { width: 104, height: 104, borderRadius: 52 },
  avatarPlaceholder:{ width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' },
  cameraBadge:      { position: 'absolute', bottom: 2, right: 2, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  avatarTitle:      { fontSize: 15, fontWeight: '800' },
  avatarHint:       { fontSize: 12, marginTop: 2 },

  fieldBox:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  fieldLabel:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  fieldInput:  { fontSize: 15, fontWeight: '500', paddingVertical: 2, marginTop: 1 },

  levelRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  levelChip:   { borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, minWidth: 90, alignItems: 'center' },
  levelLabel:  { fontSize: 12, fontWeight: '700' },
  levelSub:    { fontSize: 11, fontWeight: '600', marginTop: 2 },

  testGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  testCard:    { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 14, padding: 12 },
  testBadge:   { width: 38, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  testBadgeTxt:{ fontSize: 11, fontWeight: '900' },
  testLabel:   { flex: 1, fontSize: 15, fontWeight: '700' },
  soonTag:     { fontSize: 8, fontWeight: '800', color: '#fff', backgroundColor: '#9ca3af', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, overflow: 'hidden' },
  checkbox:    { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  primaryTest:     { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 14 },
  primaryTestLabel:{ flex: 1, fontSize: 16, fontWeight: '800' },
  primaryTestHint: { fontSize: 11, fontWeight: '600' },

  bandGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  bandChip:    { width: '18%', borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  bandTxt:     { fontSize: 14, fontWeight: '800' },

  hintBox:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginTop: 12 },
  hintText:    { flex: 1, fontSize: 13, lineHeight: 18 },

  dateRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14 },
  dateText:    { flex: 1, fontSize: 14, fontWeight: '600' },

  textArea:      { borderWidth: 1.5, borderRadius: 14, padding: 12, minHeight: 90 },
  textAreaInput: { fontSize: 14, minHeight: 60 },
  charCount:     { fontSize: 11, textAlign: 'right', marginTop: 4 },

  commitRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  commitChip:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  commitTxt:   { fontSize: 12.5, fontWeight: '700' },

  skillRow:    { flexDirection: 'row', gap: 8 },
  skillCard:   { flex: 1, alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 16 },
  skillLabel:  { fontSize: 12, fontWeight: '700' },
  checkboxSm:  { width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  segmented:   { flexDirection: 'row', borderWidth: 1.5, borderRadius: 12, padding: 3 },
  segment:     { flex: 1, paddingVertical: 11, borderRadius: 9, alignItems: 'center' },
  segmentTxt:  { fontSize: 13, fontWeight: '700' },

  modeRow:     { flexDirection: 'row', gap: 10 },
  modeCard:    { flex: 1, borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 6 },
  modeTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  radio:       { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: ORANGE },
  modeTitle:   { fontSize: 14, fontWeight: '800' },
  modeDesc:    { fontSize: 11.5, lineHeight: 16 },

  toggleRow:   { flexDirection: 'row', alignItems: 'center', paddingTop: 16, borderTopWidth: 1 },
  toggleTitle: { fontSize: 15, fontWeight: '800' },
  toggleSub:   { fontSize: 12, marginTop: 2 },

  reviewHero:  { alignItems: 'center', marginBottom: 18 },
  reviewAvatar:{ width: 80, height: 80, borderRadius: 40, marginBottom: 10 },
  reviewName:  { fontSize: 18, fontWeight: '800' },
  reviewSub:   { fontSize: 13, marginTop: 2 },
  reviewCard:  { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 16 },
  reviewRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, gap: 16 },
  reviewKey:   { fontSize: 13, fontWeight: '600', flexShrink: 0 },
  reviewVal:   { fontSize: 13.5, fontWeight: '700', flex: 1, textAlign: 'right' },

  accountIntro:    { alignItems: 'center', marginBottom: 20 },
  accountIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  accountTitle:    { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  accountSub:      { fontSize: 13, textAlign: 'center', marginTop: 4, lineHeight: 19, paddingHorizontal: 16 },
  statusLine:      { fontSize: 12, fontWeight: '700', marginTop: 6, marginLeft: 4 },

  footer:      { paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 16, borderTopWidth: 1 },
  continueBtn: { backgroundColor: ORANGE, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  continueTxt: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
});