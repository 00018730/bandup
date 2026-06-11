import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, useColorScheme, Image, Dimensions, Alert,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { getLocalResults } from '../utils/storage';
import { fetchUserStats } from '../utils/sync';

const ORANGE    = '#e85c2f';
const NAVY      = '#1a2744';
const NAVY_DARK = '#0d1a2e';
const W         = Dimensions.get('window').width;

const light = { bg:'#f0f2f7', surface:'#ffffff', text:NAVY, muted:'#6b7280', border:'#e2e6ee', sub:'#94a3b8' };
const dark  = { bg:'#0d1a2e', surface:'#152035', text:'#eef0f4', muted:'#8a919e', border:'#1e3050', sub:'#64748b' };

const getCEFR = (band: number) => {
  if (band >= 8.5) return { level:'C2', next:null,  nextLabel:'' };
  if (band >= 7.0) return { level:'C1', next:'C2',  nextLabel:"You're almost there!" };
  if (band >= 5.5) return { level:'B2', next:'C1',  nextLabel:`${(7.0 - band).toFixed(1)} band away!` };
  if (band >= 4.0) return { level:'B1', next:'B2',  nextLabel:`${(5.5 - band).toFixed(1)} band away!` };
  return             { level:'A2', next:'B1',  nextLabel:'Keep practising!' };
};

const getStatusBadge = (band: number) => {
  if (band >= 7.0) return { label:'Good',     bg:'#166534', color:'#4ade80' };
  if (band >= 5.5) return { label:'Moderate', bg:'#92400e', color:'#fbbf24' };
  return                   { label:'Beginner', bg:'#7f1d1d', color:'#f87171' };
};

const SKILLS = [
  { key:'listening', label:'Listening', icon:'headphones' as const },
  { key:'reading',   label:'Reading',   icon:'book-open'  as const },
  { key:'writing',   label:'Writing',   icon:'edit-3'     as const },
  { key:'speaking',  label:'Speaking',  icon:'mic'        as const },
];

const WEEK_DAYS = ['M','T','W','T','F','S','S'];

// ─── Circular progress ring ───────────────────────────────────────────────────
function ProgressRing({ progress = 0, size = 110, strokeWidth = 9 }: {
  progress: number; size?: number; strokeWidth?: number;
}) {
  const p  = Math.max(0, Math.min(1, progress));
  const a  = p * 360;
  const r  = size / 2;
  const rr = `${Math.min(a, 180) - 90}deg`;
  const lr = `${Math.max(a - 180, 0) - 90}deg`;
  return (
    <View style={{ width:size, height:size }}>
      <View style={{ position:'absolute', width:size, height:size, borderRadius:r, borderWidth:strokeWidth, borderColor:'rgba(255,255,255,0.08)' }} />
      <View style={{ position:'absolute', left:r, width:r, height:size, overflow:'hidden' }}>
        <View style={{ position:'absolute', right:0, width:size, height:size, borderRadius:r, borderWidth:strokeWidth, borderColor:'transparent', borderTopColor:a>0?ORANGE:'transparent', borderRightColor:a>90?ORANGE:'transparent', transform:[{rotate:rr}] }} />
      </View>
      {a > 180 && (
        <View style={{ position:'absolute', left:0, width:r, height:size, overflow:'hidden' }}>
          <View style={{ position:'absolute', left:0, width:size, height:size, borderRadius:r, borderWidth:strokeWidth, borderColor:'transparent', borderBottomColor:ORANGE, borderLeftColor:a>270?ORANGE:'transparent', transform:[{rotate:lr}] }} />
        </View>
      )}
    </View>
  );
}

// ─── Mini line chart ──────────────────────────────────────────────────────────
function MiniChart({ data, labels }: { data: number[]; labels: string[] }) {
  const H   = 48;
  const max = Math.max(...data, 0.1);
  const min = Math.min(...data);
  const rng = Math.max(max - min, 0.5);
  return (
    <View style={{ height: H + 20 }}>
      <View style={{ height:H, flexDirection:'row', alignItems:'flex-end', gap:2 }}>
        {data.map((v, i) => {
          const dotY = H - ((v - min) / rng) * (H - 12) - 6;
          return (
            <View key={i} style={{ flex:1, height:H, justifyContent:'flex-end', alignItems:'center' }}>
              <View style={{ position:'absolute', top:dotY }}>
                <Text style={{ color:'#fff', fontSize:8, fontWeight:'700' }}>{v > 0 ? v.toFixed(1) : ''}</Text>
              </View>
              <View style={{ width:5, height:5, borderRadius:3, backgroundColor:v>0?ORANGE:'rgba(255,255,255,0.2)' }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection:'row', gap:2, marginTop:4 }}>
        {labels.map((l, i) => (
          <Text key={i} style={{ flex:1, textAlign:'center', color:'rgba(255,255,255,0.4)', fontSize:9 }}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation }: any) {
  const isDark = useColorScheme() === 'dark';
  const colors = isDark ? dark : light;

  const [isGuest, setIsGuest]       = useState(true);
  const [userName, setUserName]     = useState('');
  const [avatarUrl, setAvatarUrl]   = useState<string | null>(null);
  const [targetBand, setTargetBand] = useState('7.5');
  const [stats, setStats] = useState({ streak:0, testsCount:0, avgBand:'0.0', studyHrs:0 });

  useEffect(() => {
    checkAuth();
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsGuest(!session);
      if (session?.user) {
        const name = session.user.user_metadata?.full_name ?? session.user.email ?? '';
        setUserName(name);
        loadProfile(session.user.id);
      } else {
        setUserName(''); setAvatarUrl(null); setTargetBand('7.5');
      }
      loadStats(session?.user?.id ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    // maybeSingle() returns null (not an error) when no profile row exists yet,
    // so guests / users mid-onboarding don't trigger console errors.
    const { data } = await supabase.from('profiles')
      .select('full_name, target_band, avatar_url').eq('id', userId).maybeSingle();
    if (data) {
      if (data.full_name)   setUserName(data.full_name);
      if (data.target_band) setTargetBand(String(data.target_band));
      if (data.avatar_url)  setAvatarUrl(data.avatar_url);
    }
  };

  const loadStats = async (userId: string | null) => {
    if (userId) {
      const s = await fetchUserStats(userId);
      if (s) setStats({ streak:s.streak, testsCount:s.testsCount, avgBand:s.avgBand, studyHrs:0 });
    } else {
      const local = await getLocalResults();
      setStats({ streak:0, testsCount:local.length, studyHrs:0,
        avgBand: local.length > 0
          ? (local.reduce((sum, r) => sum + (r.score/r.total)*9, 0) / local.length).toFixed(1)
          : '0.0',
      });
    }
  };

  const checkAuth = async () => {
    const { data } = await supabase.auth.getSession();
    setIsGuest(!data.session);
    if (data.session?.user) {
      const name = data.session.user.user_metadata?.full_name ?? data.session.user.email ?? '';
      setUserName(name);
      await loadProfile(data.session.user.id);
    }
    await loadStats(data.session?.user?.id ?? null);
  };

  const firstName    = userName.split(' ')[0] || 'there';
  const initials     = userName ? userName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() : '?';
  const hour         = new Date().getHours();
  const greeting     = hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
  const currentBand  = parseFloat(stats.avgBand) || 0;
  const targetNum    = parseFloat(targetBand) || 7.5;
  const bandAway     = Math.max(0, targetNum - currentBand).toFixed(1);
  const ringProgress = currentBand > 0 ? Math.min(currentBand / targetNum, 1) : 0.08;
  const cefr         = getCEFR(currentBand);
  const statusBadge  = getStatusBadge(currentBand);

  const chartData   = [0, 0, 0, 0, 0, 0, currentBand];
  const chartLabels = ['M','T','W','T','F','S','T'];

  const todayIdx  = (new Date().getDay() + 6) % 7;
  const streakDots = WEEK_DAYS.map((d, i) => {
    const daysAgo = (todayIdx - i + 7) % 7;
    return { label:d, active: daysAgo < stats.streak };
  });

  const handleNotifications = () => {
    Alert.alert('Notifications', "You're all caught up! No new notifications right now.");
  };

  const handleGoPremium = () => {
    Alert.alert('Premium coming soon', 'Premium plans with full mock tests and AI feedback are launching soon. Stay tuned!');
  };

  const AvatarView = ({ size=44 }: { size?: number }) => (
    avatarUrl ? (
      <Image source={{ uri:avatarUrl }} style={{ width:size, height:size, borderRadius:size/2 }} />
    ) : (
      <View style={[styles.avatar, { width:size, height:size, borderRadius:size/2, backgroundColor:NAVY }]}>
        <Text style={[styles.avatarText, { fontSize:size*0.34 }]}>{initials}</Text>
      </View>
    )
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => isGuest ? navigation.navigate('Auth') : navigation.navigate('Profile')} activeOpacity={0.85}>
            <AvatarView size={48} />
          </TouchableOpacity>
          <View style={{ flex:1, marginLeft:12 }}>
            <Text style={[styles.greetingText, { color:colors.muted }]}>{greeting}, {isGuest?'Guest':firstName} 👋</Text>
            {!isGuest && (
              <View style={styles.cefrBadge}>
                <View style={styles.cefrDot}/>
                <Text style={styles.cefrBadgeText}>{cefr.level} Learner</Text>
              </View>
            )}
            {isGuest && (
              <TouchableOpacity style={styles.signInPill} onPress={() => navigation.navigate('Auth')} activeOpacity={0.85}>
                <Text style={styles.signInPillText}>Sign in to track progress</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={[styles.bellBtn, { backgroundColor:colors.surface, borderColor:colors.border }]} onPress={handleNotifications} activeOpacity={0.8}>
            <Feather name="bell" size={18} color={colors.text}/>
            <View style={styles.bellDot}/>
          </TouchableOpacity>
        </View>

        {/* IELTS Journey Card */}
        <View style={styles.journeyCard}>
          <View style={styles.journeyWave}/>
          <View style={styles.journeyTop}>
            <View style={{ flex:1 }}>
              <View style={styles.journeyTitleRow}>
                <Text style={styles.journeyTitle}>IELTS Journey</Text>
                <View style={styles.acadBadge}><Text style={styles.acadText}>Academic</Text></View>
              </View>
              <Text style={styles.journeyLabel}>Target Band Score</Text>
              <View style={styles.targetRow}>
                <Text style={styles.targetBand}>{targetBand}</Text>
                <TouchableOpacity style={styles.editBtn} onPress={() => isGuest ? navigation.navigate('Auth') : navigation.navigate('Profile')}>
                  <Feather name="edit-2" size={11} color="#fff"/>
                </TouchableOpacity>
              </View>
              <Text style={[styles.journeyLabel, { marginTop:10 }]}>Estimated Overall Band</Text>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginTop:4 }}>
                <Text style={styles.currentBand}>{currentBand > 0 ? currentBand.toFixed(1) : '—'}</Text>
                <View style={[styles.statusBadge, { backgroundColor:statusBadge.bg }]}>
                  <Text style={[styles.statusText, { color:statusBadge.color }]}>{statusBadge.label}</Text>
                </View>
              </View>
              <Text style={styles.journeyKeepGoing}>Keep practising!</Text>
            </View>
            <View style={styles.ringWrap}>
              <ProgressRing progress={ringProgress} size={110} strokeWidth={9}/>
              <View style={styles.ringCenter}>
                <Text style={styles.ringValue}>{bandAway}</Text>
                <Text style={styles.ringLabel}>Band Away{'\n'}from your goal</Text>
              </View>
            </View>
            <View style={styles.cefrCol}>
              <Text style={styles.cefrLabel}>CEFR Level</Text>
              <View style={styles.cefrLevelBadge}><Text style={styles.cefrLevelText}>{cefr.level}</Text></View>
              {cefr.next && (
                <>
                  <Text style={[styles.cefrLabel, { marginTop:10 }]}>Next Level</Text>
                  <Text style={styles.cefrNextLevel}>{cefr.next}</Text>
                  <Text style={styles.cefrNextHint}>{cefr.nextLabel}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Quick Practice */}
        <View style={[styles.card, { backgroundColor:colors.surface }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color:colors.text }]}>Quick Practice</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('Practice')}>
              <Text style={styles.seeAll}>See all  ›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.skillsRow}>
            {SKILLS.map(skill => (
              <TouchableOpacity
                key={skill.key}
                style={[styles.skillBtn, { borderColor:colors.border }]}
                onPress={() => navigation.navigate('SkillTests', { skill:skill.key })}
                activeOpacity={0.75}
              >
                <Feather name={skill.icon} size={24} color={colors.text}/>
                <Text style={[styles.skillLabel, { color:colors.text }]}>{skill.label}</Text>
                <View style={[styles.skillUnderline, { backgroundColor:ORANGE }]}/>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Band Score Overview */}
        <View style={[styles.card, { backgroundColor:colors.surface }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color:colors.text }]}>Band Score Overview</Text>
            <View style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
              <Text style={styles.seeAll}>This Week</Text>
              <Feather name="chevron-down" size={13} color={ORANGE}/>
            </View>
          </View>
          <View style={styles.scoreGrid}>
            {SKILLS.map((skill, idx) => {
              const band = currentBand > 0 ? currentBand : 0;
              const pct  = Math.round((band / 9) * 100);
              const barColor = idx % 2 === 0 ? ORANGE : NAVY;
              return (
                <View key={skill.key} style={[styles.scoreCard, { backgroundColor:colors.bg }]}>
                  <View style={styles.scoreCardTop}>
                    <View style={[styles.scoreAccent, { backgroundColor:ORANGE }]}/>
                    <Text style={[styles.scoreSkill, { color:colors.muted }]}>{skill.label}</Text>
                  </View>
                  <Text style={[styles.scoreBand, { color:colors.text }]}>
                    {band > 0 ? band.toFixed(1) : '—'}
                    <Text style={[styles.scoreMax, { color:colors.muted }]}> /9.0</Text>
                  </Text>
                  <View style={[styles.progressTrack, { backgroundColor:colors.border }]}>
                    <View style={[styles.progressFill, { width:`${pct}%` as any, backgroundColor:barColor }]}/>
                  </View>
                  <Text style={[styles.scorePct, { color:barColor }]}>{band > 0 ? `${pct}%` : '—'}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Band Progress + Streak */}
        <View style={styles.bottomRow}>
          <View style={[styles.chartCard, { backgroundColor:NAVY_DARK }]}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Band Progress</Text>
              <View style={styles.todayBadge}>
                <Text style={styles.todayText}>{currentBand > 0 ? `${currentBand.toFixed(1)} Today` : 'No data'}</Text>
              </View>
            </View>
            <Text style={styles.chartSub}>Last 7 Days</Text>
            <MiniChart data={chartData} labels={chartLabels}/>
          </View>
          <View style={[styles.streakCard, { backgroundColor:colors.surface }]}>
            <View style={styles.streakHeader}>
              <View>
                <Text style={[styles.streakTitle, { color:colors.text }]}>Study Streak</Text>
                <Text style={[styles.streakCount, { color:ORANGE }]}>{stats.streak} Days</Text>
              </View>
              <Text style={{ fontSize:24 }}>🔥</Text>
            </View>
            <Text style={[styles.streakSub, { color:colors.muted }]}>
              {stats.streak > 0 ? 'Keep it up! Consistency brings results.' : 'Start your streak today!'}
            </Text>
            <View style={styles.streakDots}>
              {streakDots.map((d, i) => (
                <View key={i} style={styles.streakDotCol}>
                  {d.active && <Feather name="check" size={8} color={ORANGE}/>}
                  <View style={[styles.streakDot, {
                    backgroundColor: d.active ? ORANGE : colors.border,
                    borderWidth: i === todayIdx ? 1.5 : 0, borderColor: ORANGE,
                  }]}/>
                  <Text style={[styles.streakDayLabel, { color:colors.muted }]}>{d.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

      </ScrollView>

      {/* ── Fixed compact premium strip (always visible above tab bar) ────── */}
      <TouchableOpacity style={styles.premiumStrip} onPress={handleGoPremium} activeOpacity={0.9}>
        <View style={{ flex: 1 }}>
          <Text style={styles.premiumStripTitle}>Achieve Band {targetBand}+</Text>
          <Text style={styles.premiumStripSub}>Unlock full mock tests & AI feedback</Text>
        </View>
        <View style={styles.premiumStripBtn}>
          <Text style={styles.premiumStripBtnText}>Go Premium  ›</Text>
        </View>
      </TouchableOpacity>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex:1 },
  scroll:            { paddingHorizontal:16, paddingTop:16, paddingBottom:16 },

  header:            { flexDirection:'row', alignItems:'center', marginBottom:20 },
  avatar:            { alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:ORANGE },
  avatarText:        { color:'#fff', fontWeight:'800' },
  greetingText:      { fontSize:13, fontWeight:'500', marginBottom:4 },
  cefrBadge:         { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'rgba(232,92,47,0.12)', borderRadius:20, paddingHorizontal:10, paddingVertical:4, alignSelf:'flex-start' },
  cefrDot:           { width:6, height:6, borderRadius:3, backgroundColor:ORANGE },
  cefrBadgeText:     { fontSize:11, fontWeight:'700', color:ORANGE },
  signInPill:        { backgroundColor:'rgba(232,92,47,0.12)', borderRadius:20, paddingHorizontal:12, paddingVertical:4, alignSelf:'flex-start' },
  signInPillText:    { fontSize:11, fontWeight:'700', color:ORANGE },
  bellBtn:           { width:40, height:40, borderRadius:20, borderWidth:1, alignItems:'center', justifyContent:'center', position:'relative' },
  bellDot:           { position:'absolute', top:8, right:8, width:7, height:7, borderRadius:4, backgroundColor:ORANGE },

  journeyCard:       { backgroundColor:NAVY, borderRadius:20, padding:18, marginBottom:14, overflow:'hidden', minHeight:170 },
  journeyWave:       { position:'absolute', bottom:-20, left:-10, right:-10, height:60, backgroundColor:'rgba(232,92,47,0.08)', borderRadius:40, transform:[{scaleX:1.3}] },
  journeyTop:        { flexDirection:'row', alignItems:'center', gap:8 },
  journeyTitleRow:   { flexDirection:'row', alignItems:'center', gap:8, marginBottom:8 },
  journeyTitle:      { fontSize:14, fontWeight:'800', color:'#fff' },
  acadBadge:         { backgroundColor:ORANGE, borderRadius:20, paddingHorizontal:8, paddingVertical:3 },
  acadText:          { fontSize:9, fontWeight:'800', color:'#fff' },
  journeyLabel:      { fontSize:10, color:'rgba(255,255,255,0.55)', fontWeight:'600' },
  targetRow:         { flexDirection:'row', alignItems:'center', gap:8, marginTop:2 },
  targetBand:        { fontSize:30, fontWeight:'800', color:ORANGE, lineHeight:34 },
  editBtn:           { width:20, height:20, borderRadius:10, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center' },
  currentBand:       { fontSize:22, fontWeight:'800', color:'#fff' },
  statusBadge:       { borderRadius:20, paddingHorizontal:8, paddingVertical:3 },
  statusText:        { fontSize:10, fontWeight:'700' },
  journeyKeepGoing:  { fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:4, fontStyle:'italic' },
  ringWrap:          { alignItems:'center', justifyContent:'center' },
  ringCenter:        { position:'absolute', alignItems:'center', justifyContent:'center' },
  ringValue:         { fontSize:22, fontWeight:'800', color:'#fff', textAlign:'center' },
  ringLabel:         { fontSize:9, color:'rgba(255,255,255,0.6)', textAlign:'center', lineHeight:13, marginTop:2 },
  cefrCol:           { alignItems:'center', minWidth:64 },
  cefrLabel:         { fontSize:9, color:'rgba(255,255,255,0.5)', fontWeight:'600', marginBottom:4 },
  cefrLevelBadge:    { borderRadius:20, borderWidth:1.5, borderColor:ORANGE, paddingHorizontal:10, paddingVertical:4 },
  cefrLevelText:     { fontSize:13, fontWeight:'800', color:ORANGE },
  cefrNextLevel:     { fontSize:16, fontWeight:'800', color:ORANGE, marginTop:2 },
  cefrNextHint:      { fontSize:9, color:'rgba(255,255,255,0.45)', textAlign:'center', marginTop:2, lineHeight:13 },

  card:              { borderRadius:18, padding:16, marginBottom:14 },
  cardHeader:        { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:14 },
  cardTitle:         { fontSize:15, fontWeight:'800' },
  seeAll:            { fontSize:12, fontWeight:'700', color:ORANGE },
  skillsRow:         { flexDirection:'row', gap:8 },
  skillBtn:          { flex:1, alignItems:'center', paddingVertical:14, borderRadius:14, borderWidth:1, gap:8 },
  skillLabel:        { fontSize:11, fontWeight:'600' },
  skillUnderline:    { width:20, height:2, borderRadius:1 },
  scoreGrid:         { flexDirection:'row', flexWrap:'wrap', gap:10 },
  scoreCard:         { width:'47%', borderRadius:14, padding:12 },
  scoreCardTop:      { flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 },
  scoreAccent:       { width:3, height:14, borderRadius:2 },
  scoreSkill:        { fontSize:11, fontWeight:'600' },
  scoreBand:         { fontSize:22, fontWeight:'800', marginBottom:8 },
  scoreMax:          { fontSize:12, fontWeight:'500' },
  progressTrack:     { height:4, borderRadius:2, marginBottom:4 },
  progressFill:      { height:4, borderRadius:2 },
  scorePct:          { fontSize:11, fontWeight:'700', textAlign:'right' },

  bottomRow:         { flexDirection:'row', gap:10, marginBottom:4 },
  chartCard:         { flex:1, borderRadius:18, padding:14 },
  chartHeader:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:2 },
  chartTitle:        { fontSize:13, fontWeight:'800', color:'#fff' },
  todayBadge:        { backgroundColor:'rgba(232,92,47,0.25)', borderRadius:20, paddingHorizontal:8, paddingVertical:3 },
  todayText:         { fontSize:9, fontWeight:'700', color:ORANGE },
  chartSub:          { fontSize:9, color:'rgba(255,255,255,0.4)', marginBottom:8 },
  streakCard:        { flex:1, borderRadius:18, padding:14 },
  streakHeader:      { flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between', marginBottom:4 },
  streakTitle:       { fontSize:13, fontWeight:'800', marginBottom:2 },
  streakCount:       { fontSize:20, fontWeight:'800' },
  streakSub:         { fontSize:10, lineHeight:14, marginBottom:10 },
  streakDots:        { flexDirection:'row', gap:4 },
  streakDotCol:      { flex:1, alignItems:'center', gap:3 },
  streakDot:         { width:18, height:18, borderRadius:9 },
  streakDayLabel:    { fontSize:9, fontWeight:'600' },

  // ── Fixed premium strip ─────────────────────────────────────────────────────
  premiumStrip:      {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: ORANGE,
    paddingHorizontal: 16, paddingVertical: 11,
  },
  premiumStripTitle: { fontSize: 13, fontWeight: '800', color: '#fff' },
  premiumStripSub:   { fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  premiumStripBtn:   { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  premiumStripBtnText:{ fontSize: 12, fontWeight: '800', color: ORANGE },
});