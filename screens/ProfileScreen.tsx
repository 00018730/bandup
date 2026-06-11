import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, useColorScheme, ActivityIndicator,
  Alert, Image, Modal, TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { fetchUserStats } from '../utils/sync';

const ORANGE    = '#e85c2f';
const NAVY      = '#1a2744';

const light = {
  bg:'#f0f2f7', surface:'#ffffff', text:NAVY,
  muted:'#6b7280', border:'#eef0f4', input:'#f8f9fb',
};
const dark = {
  bg:'#0d1a2e', surface:'#152035', text:'#eef0f4',
  muted:'#8a919e', border:'#1e3050', input:'#1a2744',
};

// ─── Change-password modal ────────────────────────────────────────────────────
function ChangePasswordModal({ visible, onClose, isDark }: any) {
  const c = isDark ? dark : light;
  const [pw, setPw]           = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (pw.length < 6)      { Alert.alert('Too short', 'Password must be at least 6 characters.'); return; }
    if (pw !== confirm)     { Alert.alert('Mismatch', 'Passwords do not match.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Done', 'Your password has been updated.');
    setPw(''); setConfirm(''); onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={pm.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[pm.sheet, { backgroundColor: c.surface }]} onStartShouldSetResponder={() => true}>
          <View style={[pm.handle, { backgroundColor: c.border }]} />
          <Text style={[pm.title, { color: c.text }]}>Change Password</Text>

          <View style={[pm.inputBox, { backgroundColor: c.input, borderColor: c.border }]}>
            <Feather name="lock" size={16} color={c.muted} />
            <TextInput
              style={[pm.input, { color: c.text }]} value={pw} onChangeText={setPw}
              placeholder="New password" placeholderTextColor={c.muted}
              secureTextEntry={!show} autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShow(v => !v)} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
              <Feather name={show ? 'eye-off' : 'eye'} size={16} color={c.muted} />
            </TouchableOpacity>
          </View>

          <View style={[pm.inputBox, { backgroundColor: c.input, borderColor: c.border, marginTop: 10 }]}>
            <Feather name="check-circle" size={16} color={c.muted} />
            <TextInput
              style={[pm.input, { color: c.text }]} value={confirm} onChangeText={setConfirm}
              placeholder="Confirm new password" placeholderTextColor={c.muted}
              secureTextEntry={!show} autoCapitalize="none"
            />
          </View>

          <TouchableOpacity style={[pm.btn, { opacity: loading ? 0.7 : 1 }]} onPress={submit} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={pm.btnText}>Update password</Text>}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
const pm = StyleSheet.create({
  overlay:  { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  sheet:    { borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, paddingBottom:36 },
  handle:   { width:40, height:4, borderRadius:2, alignSelf:'center', marginBottom:16 },
  title:    { fontSize:18, fontWeight:'800', marginBottom:16 },
  inputBox: { flexDirection:'row', alignItems:'center', gap:10, borderWidth:1.5, borderRadius:12, paddingHorizontal:14, paddingVertical:12 },
  input:    { flex:1, fontSize:15 },
  btn:      { backgroundColor:ORANGE, borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:18 },
  btnText:  { color:'#fff', fontSize:15, fontWeight:'800' },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ProfileScreen({ navigation }: any) {
  const isDark = useColorScheme() === 'dark';
  const C = isDark ? dark : light;

  const [loading, setLoading]       = useState(true);
  const [isGuest, setIsGuest]       = useState(false);
  const [fullName, setFullName]     = useState('');
  const [avatarUrl, setAvatarUrl]   = useState<string | null>(null);
  const [targetBand, setTargetBand] = useState(7.5);
  const [currentBand, setCurrentBand] = useState(0);
  const [streak, setStreak]         = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [mockTests, setMockTests]   = useState(0);
  const [showPwModal, setShowPwModal] = useState(false);

  useEffect(() => {
    loadProfile();
    const unsub = navigation.addListener('focus', loadProfile);
    return unsub;
  }, [navigation]);

  const loadProfile = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsGuest(true); setLoading(false); return; }
    setIsGuest(false);

    const { data: profile } = await supabase
      .from('profiles').select('full_name, target_band, avatar_url')
      .eq('id', user.id).maybeSingle();

    if (profile) {
      setFullName(profile.full_name ?? '');
      setTargetBand(profile.target_band ? Number(profile.target_band) : 7.5);
      setAvatarUrl(profile.avatar_url ?? null);
    }

    // Stats from user_progress: questions answered (sum of totals), mock tests
    // (count of completed rows), current band (avg of per-test bands).
    const { data: progress } = await supabase
      .from('user_progress').select('score, total').eq('user_id', user.id);

    // Type the rows explicitly so reduce() callback params aren't inferred as any.
    type ProgressRow = { score: number; total: number };
    const rows: ProgressRow[] = progress ?? [];

    if (rows.length) {
      const totalQ  = rows.reduce((sum: number, p: ProgressRow) => sum + (p.total ?? 0), 0);
      const avgBand = rows.reduce((sum: number, p: ProgressRow) => sum + ((p.score / Math.max(p.total, 1)) * 9), 0) / rows.length;
      setQuestionsAnswered(totalQ);
      setMockTests(rows.length);
      setCurrentBand(avgBand);
    }

    const s = await fetchUserStats(user.id);
    if (s) setStreak(s.streak);

    setLoading(false);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow access to your photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1,1], quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    try {
      const ext  = uri.split('.').pop() ?? 'jpg';
      const path = `${user.id}/avatar.${ext}`;
      const blob = await (await fetch(uri)).blob();
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert:true, contentType:`image/${ext}` });
      if (error) { Alert.alert('Upload failed', error.message); return; }
      const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
      setAvatarUrl(url + '?t=' + Date.now()); // cache-bust
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update photo.');
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => {
          await supabase.auth.signOut();
          navigation.navigate('Auth');
        } },
    ]);
  };

  const soon = (feature: string) => Alert.alert('Coming soon', `${feature} is coming in a future update.`);

  const initials = fullName ? fullName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() : '?';
  const bandAway = Math.max(0, targetBand - currentBand).toFixed(1);
  const pct = Math.min(100, Math.round((currentBand / Math.max(targetBand, 0.1)) * 100));

  // ── Guest state ──────────────────────────────────────────────────────────────
  if (!loading && isGuest) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: C.bg }]}>
        <View style={styles.center}>
          <View style={[styles.guestIcon, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb' }]}>
            <Feather name="user" size={40} color={ORANGE} />
          </View>
          <Text style={[styles.guestTitle, { color: C.text }]}>You're not signed in</Text>
          <Text style={[styles.guestSub, { color: C.muted }]}>Sign in to track your progress and band score.</Text>
          <TouchableOpacity style={styles.guestBtn} onPress={() => navigation.navigate('Auth')} activeOpacity={0.88}>
            <Text style={styles.guestBtnText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.bg }]}>
      <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>
    </SafeAreaView>
  );

  // ── Menu rows ────────────────────────────────────────────────────────────────
  const menu = [
    { icon:'user'   as const, title:'Edit Profile',  sub:'Name, photo, target band', onPress:()=>navigation.navigate('ProfileSetup') },
    { icon:'book'   as const, title:'Exam Type',     sub:'Currently: IELTS',         onPress:()=>soon('Exam type switching') },
    { icon:'award'  as const, title:'Subscription',  sub:'Manage your plan',         onPress:()=>soon('Subscriptions') },
    { icon:'bell'   as const, title:'Notifications', sub:'Manage your preferences',  onPress:()=>soon('Notification settings') },
    { icon:'lock'   as const, title:'Change Password', sub:'Update your password',   onPress:()=>setShowPwModal(true) },
    { icon:'headphones' as const, title:'Help & Support', sub:'Get help and contact support', onPress:()=>soon('Help & support') },
    { icon:'info'   as const, title:'About',         sub:'App version and information', onPress:()=>Alert.alert('IELTSPath', 'IELTSPath by MockMaster\nVersion 1.0.0') },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.topBar}>
          <Text style={[styles.pageTitle, { color: C.text }]}>Profile</Text>
          <TouchableOpacity style={[styles.gearBtn, { backgroundColor: C.surface }]} onPress={() => soon('Settings')} activeOpacity={0.8}>
            <Feather name="settings" size={18} color={C.text} />
          </TouchableOpacity>
        </View>

        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <TouchableOpacity onPress={pickImage} style={styles.heroAvatarWrap} activeOpacity={0.85}>
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} style={styles.heroAvatar} />
                : <View style={[styles.heroAvatar, styles.heroAvatarPlaceholder]}>
                    <Text style={styles.heroInitials}>{initials}</Text>
                  </View>}
              <View style={styles.heroCamera}>
                <Feather name="camera" size={12} color="#fff" />
              </View>
            </TouchableOpacity>

            <View style={{ flex:1, marginLeft:16 }}>
              <Text style={styles.heroName} numberOfLines={1}>{fullName || 'Your name'}</Text>
              <View style={styles.candidatePill}>
                <Feather name="award" size={11} color="#fff" />
                <Text style={styles.candidateText}>IELTS Candidate</Text>
              </View>
              <View style={styles.bandRow}>
                <View>
                  <Text style={styles.bandLabel}>Current Band</Text>
                  <Text style={styles.bandValue}>{currentBand > 0 ? currentBand.toFixed(1) : '—'}</Text>
                </View>
                <View style={styles.bandDivider} />
                <View>
                  <Text style={styles.bandLabel}>Target Band</Text>
                  <Text style={styles.bandValue}>{targetBand.toFixed(1)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.targetIcon}>
              <Feather name="target" size={40} color="rgba(232,92,47,0.4)" />
            </View>
          </View>

          <Text style={styles.bandAway}>
            {currentBand > 0
              ? `You're ${bandAway} band away from your target!`
              : 'Complete a test to see your band progress!'}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
            <Text style={styles.progressPct}>{pct}%</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={[styles.statsCard, { backgroundColor: C.surface }]}>
          {[
            { icon:'🔥', tint:'#fff0eb', value:String(streak),           label:'Practice Streak', unit:'Days',  color:ORANGE },
            { icon:'📋', tint:'#e8eeff', value:questionsAnswered.toLocaleString(), label:'Questions Answered', unit:'Total', color:NAVY },
            { icon:'✅', tint:'#e6f7ed', value:String(mockTests),        label:'Mock Tests', unit:'Tests', color:'#16a34a' },
          ].map((s, i) => (
            <View key={s.label} style={[styles.statCol, i<2 && { borderRightWidth:1, borderRightColor:C.border }]}>
              <View style={[styles.statIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : s.tint }]}>
                <Text style={{ fontSize:18 }}>{s.icon}</Text>
              </View>
              <Text style={[styles.statLabel, { color: C.muted }]}>{s.label}</Text>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={[styles.statUnit, { color: C.muted }]}>{s.unit}</Text>
            </View>
          ))}
        </View>

        {/* Plan card */}
        <View style={[styles.planCard, { backgroundColor: isDark ? '#2a1a12' : '#fff5f0' }]}>
          <View style={styles.planIcon}>
            <Text style={{ fontSize:24 }}>👑</Text>
          </View>
          <View style={{ flex:1 }}>
            <Text style={[styles.planLabel, { color: C.muted }]}>Current Plan</Text>
            <Text style={[styles.planName, { color: C.text }]}>Free Plan</Text>
            <View style={styles.planFeatures}>
              <View style={styles.planFeature}>
                <Feather name="check" size={11} color={ORANGE} />
                <Text style={[styles.planFeatureText, { color: C.muted }]}>Basic practice</Text>
              </View>
              <View style={styles.planFeature}>
                <Feather name="check" size={11} color={ORANGE} />
                <Text style={[styles.planFeatureText, { color: C.muted }]}>Limited mock tests</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.upgradeBtn} onPress={() => soon('Premium plans')} activeOpacity={0.85}>
            <Feather name="zap" size={13} color="#fff" />
            <Text style={styles.upgradeText}>Upgrade</Text>
          </TouchableOpacity>
        </View>

        {/* Menu */}
        <View style={[styles.menuCard, { backgroundColor: C.surface }]}>
          {menu.map((m, i) => (
            <TouchableOpacity key={m.title}
              style={[styles.menuRow, i < menu.length - 1 && { borderBottomWidth:1, borderBottomColor:C.border }]}
              onPress={m.onPress} activeOpacity={0.7}>
              <View style={[styles.menuIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f4f5f8' }]}>
                <Feather name={m.icon} size={17} color={C.text} />
              </View>
              <View style={{ flex:1 }}>
                <Text style={[styles.menuTitle, { color: C.text }]}>{m.title}</Text>
                <Text style={[styles.menuSub, { color: C.muted }]}>{m.sub}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={C.muted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign out */}
        <TouchableOpacity style={[styles.signOut, { backgroundColor: C.surface }]} onPress={handleSignOut} activeOpacity={0.8}>
          <Feather name="log-out" size={17} color={ORANGE} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 12 }} />
      </ScrollView>

      <ChangePasswordModal visible={showPwModal} onClose={() => setShowPwModal(false)} isDark={isDark} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex:1 },
  center: { flex:1, alignItems:'center', justifyContent:'center', padding:32 },
  scroll: { paddingHorizontal:16, paddingTop:8, paddingBottom:24 },

  topBar:    { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:16, marginTop:8 },
  pageTitle: { fontSize:30, fontWeight:'800', letterSpacing:-0.5 },
  gearBtn:   { width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center' },

  // Hero
  heroCard:   { backgroundColor:NAVY, borderRadius:22, padding:18, marginBottom:14, overflow:'hidden' },
  heroTop:    { flexDirection:'row', alignItems:'flex-start' },
  heroAvatarWrap: { position:'relative' },
  heroAvatar: { width:74, height:74, borderRadius:37, borderWidth:3, borderColor:'rgba(255,255,255,0.15)' },
  heroAvatarPlaceholder: { backgroundColor:'rgba(232,92,47,0.25)', alignItems:'center', justifyContent:'center' },
  heroInitials: { color:'#fff', fontSize:26, fontWeight:'800' },
  heroCamera: { position:'absolute', bottom:0, right:0, width:24, height:24, borderRadius:12, backgroundColor:'rgba(0,0,0,0.6)', alignItems:'center', justifyContent:'center', borderWidth:1.5, borderColor:NAVY },
  heroName:   { fontSize:21, fontWeight:'800', color:'#fff', marginBottom:6 },
  candidatePill: { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'rgba(255,255,255,0.12)', borderRadius:20, paddingHorizontal:10, paddingVertical:4, alignSelf:'flex-start', marginBottom:12 },
  candidateText: { fontSize:11, fontWeight:'700', color:'#fff' },
  bandRow:    { flexDirection:'row', alignItems:'center' },
  bandLabel:  { fontSize:11, color:'rgba(255,255,255,0.55)', fontWeight:'600', marginBottom:2 },
  bandValue:  { fontSize:24, fontWeight:'800', color:ORANGE },
  bandDivider:{ width:1, height:36, backgroundColor:'rgba(255,255,255,0.15)', marginHorizontal:16 },
  targetIcon: { position:'absolute', right:-4, top:8 },
  bandAway:   { fontSize:12.5, color:'rgba(255,255,255,0.8)', fontWeight:'600', marginTop:16, marginBottom:8 },
  progressTrack: { height:8, backgroundColor:'rgba(255,255,255,0.12)', borderRadius:4, justifyContent:'center' },
  progressFill:  { position:'absolute', left:0, height:8, borderRadius:4, backgroundColor:ORANGE },
  progressPct:   { position:'absolute', right:4, top:-18, fontSize:13, fontWeight:'800', color:ORANGE },

  // Stats
  statsCard: { flexDirection:'row', borderRadius:18, paddingVertical:16, marginBottom:14 },
  statCol:   { flex:1, alignItems:'center', gap:3 },
  statIcon:  { width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center', marginBottom:4 },
  statLabel: { fontSize:10.5, fontWeight:'600', textAlign:'center' },
  statValue: { fontSize:24, fontWeight:'800' },
  statUnit:  { fontSize:10.5, fontWeight:'500' },

  // Plan
  planCard:    { flexDirection:'row', alignItems:'center', gap:12, borderRadius:18, padding:14, marginBottom:14 },
  planIcon:    { width:52, height:52, borderRadius:14, backgroundColor:'rgba(232,92,47,0.15)', alignItems:'center', justifyContent:'center' },
  planLabel:   { fontSize:11, fontWeight:'600' },
  planName:    { fontSize:18, fontWeight:'800', marginVertical:1 },
  planFeatures:{ flexDirection:'row', gap:14, marginTop:4 },
  planFeature: { flexDirection:'row', alignItems:'center', gap:4 },
  planFeatureText: { fontSize:11, fontWeight:'500' },
  upgradeBtn:  { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:ORANGE, borderRadius:12, paddingHorizontal:14, paddingVertical:10, flexShrink:0 },
  upgradeText: { color:'#fff', fontSize:13, fontWeight:'800' },

  // Menu
  menuCard:  { borderRadius:18, paddingHorizontal:16, marginBottom:14 },
  menuRow:   { flexDirection:'row', alignItems:'center', gap:14, paddingVertical:15 },
  menuIcon:  { width:40, height:40, borderRadius:12, alignItems:'center', justifyContent:'center' },
  menuTitle: { fontSize:15, fontWeight:'700', marginBottom:1 },
  menuSub:   { fontSize:12 },

  // Sign out
  signOut:     { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10, borderRadius:18, paddingVertical:16 },
  signOutText: { color:ORANGE, fontSize:15, fontWeight:'800' },

  // Guest
  guestIcon:    { width:84, height:84, borderRadius:42, alignItems:'center', justifyContent:'center', marginBottom:18 },
  guestTitle:   { fontSize:20, fontWeight:'800', marginBottom:6 },
  guestSub:     { fontSize:13.5, textAlign:'center', lineHeight:20, marginBottom:24 },
  guestBtn:     { backgroundColor:ORANGE, borderRadius:14, paddingHorizontal:48, paddingVertical:14 },
  guestBtnText: { color:'#fff', fontSize:15, fontWeight:'800' },
});