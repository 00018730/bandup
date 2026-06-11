import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Image, useColorScheme, ActivityIndicator, Animated, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { getLocalResults } from '../utils/storage';

// ─── Constants ────────────────────────────────────────────────────────────────
const ORANGE    = '#e85c2f';
const NAVY      = '#1a2744';
const NAVY_DARK = '#0d1a2e';
const NAVY_CARD = '#152035';

const light = { bg:'#f5f5f7', surface:'#ffffff', text:NAVY, muted:'#6b7280', border:'#eeeeee' };
const dark  = { bg:'#0d1a2e', surface:'#152035', text:'#eef0f4', muted:'#8a919e', border:'#1e3050' };

// ─── Types ────────────────────────────────────────────────────────────────────
interface TestCard {
  id:             number;
  title:          string;
  passage_number: number | null;
  band_range:     string | null;
  is_premium:     boolean;
  image_url:      string | null;
  test_type:      string;
  question_count: number;
  completed:      boolean;
  score:          number | null;
  total:          number | null;
}

interface SkillStats {
  avgBand:    number;
  bestBand:   number;
  completed:  number;
  total:      number;
  targetBand: number;
}

// ─── Config per skill ─────────────────────────────────────────────────────────
const SKILL_CONFIG: Record<string,{ title:string; subtitle:string; icon:any }> = {
  reading:   { title:'Reading Tests',   subtitle:'Practice passages and improve your reading score',   icon:'book-open'  },
  listening: { title:'Listening Tests', subtitle:'Practice sections and improve your listening score', icon:'headphones' },
  writing:   { title:'Writing Tests',   subtitle:'Practice tasks and improve your writing score',      icon:'edit-3'     },
  speaking:  { title:'Speaking Tests',  subtitle:'Practice topics and improve your speaking score',    icon:'mic'        },
};

const FILTER_TABS: Record<string,{ label:string; value:'all'|number|null }[]> = {
  reading:   [{ label:'All', value:'all' },{ label:'P1', value:1 },{ label:'P2', value:2 },{ label:'P3', value:3 },{ label:'Full Test', value:null }],
  listening: [{ label:'All', value:'all' },{ label:'S1', value:1 },{ label:'S2', value:2 },{ label:'S3', value:3 },{ label:'S4', value:4 },{ label:'Full Test', value:null }],
  writing:   [{ label:'All', value:'all' }],
  speaking:  [{ label:'All', value:'all' }],
};

// ─── Progress ring (two half-clip approach, no SVG) ──────────────────────────
function BandRing({ band = 0 }: { band: number }) {
  const size        = 88;
  const strokeWidth = 8;
  const progress    = Math.max(0, Math.min(1, band / 9));
  const a           = progress * 360;
  const r           = size / 2;
  const rr          = `${Math.min(a, 180) - 90}deg`;
  const lr          = `${Math.max(a - 180, 0) - 90}deg`;
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position:'absolute', width:size, height:size, borderRadius:r, borderWidth:strokeWidth, borderColor:'rgba(255,255,255,0.1)' }} />
      <View style={{ position:'absolute', left:r, width:r, height:size, overflow:'hidden' }}>
        <View style={{ position:'absolute', right:0, width:size, height:size, borderRadius:r, borderWidth:strokeWidth, borderColor:'transparent', borderTopColor:a>0?ORANGE:'transparent', borderRightColor:a>90?ORANGE:'transparent', transform:[{ rotate:rr }] }} />
      </View>
      {a > 180 && (
        <View style={{ position:'absolute', left:0, width:r, height:size, overflow:'hidden' }}>
          <View style={{ position:'absolute', left:0, width:size, height:size, borderRadius:r, borderWidth:strokeWidth, borderColor:'transparent', borderBottomColor:ORANGE, borderLeftColor:a>270?ORANGE:'transparent', transform:[{ rotate:lr }] }} />
        </View>
      )}
      <View style={{ position:'absolute', width:size, height:size, alignItems:'center', justifyContent:'center' }}>
        <Text style={{ fontSize:20, fontWeight:'900', color:'#fff', lineHeight:24 }}>
          {band > 0 ? band.toFixed(1) : '—'}
        </Text>
        <Text style={{ fontSize:9, color:'rgba(255,255,255,0.5)', fontWeight:'600', textAlign:'center' }}>
          Current{'\n'}Band
        </Text>
      </View>
    </View>
  );
}

// ─── Stat item (icon + label + value) ────────────────────────────────────────
function StatItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flex:1, alignItems:'center', gap:4 }}>
      <View style={S.statIconWrap}>
        <Feather name={icon as any} size={20} color={ORANGE} />
      </View>
      <Text style={S.statLabel}>{label}</Text>
      <Text style={S.statValue}>{value}</Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SkillTestsScreen({ route, navigation }: any) {
  const { skill = 'reading' } = route.params ?? {};
  const isDark  = useColorScheme() === 'dark';
  const C       = isDark ? dark : light;
  const config  = SKILL_CONFIG[skill] ?? SKILL_CONFIG.reading;
  const tabs    = FILTER_TABS[skill] ?? FILTER_TABS.reading;

  const [tests, setTests]       = useState<TestCard[]>([]);
  const [stats, setStats]       = useState<SkillStats>({ avgBand:0, bestBand:0, completed:0, total:0, targetBand:7.5 });
  const [filter, setFilter]     = useState<'all'|number|null>('all');
  const [loading, setLoading]   = useState(true);
  const fadeAnim                = useRef(new Animated.Value(0)).current;

  const isComingSoon = skill === 'writing' || skill === 'speaking';

  useEffect(() => { loadData(); }, [skill]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: skillRow } = await supabase.from('skills').select('id').eq('key', skill).maybeSingle();
      if (!skillRow) { setLoading(false); return; }

      const { data: testsData } = await supabase
        .from('tests')
        .select('id, title, passage_number, band_range, is_premium, image_url, test_type')
        .eq('skill_id', skillRow.id)
        .order('sort_order');

      const testIds = (testsData ?? []).map((t: any) => t.id);
      if (!testIds.length) { setLoading(false); return; }

      const { data: qData } = await supabase
        .from('questions').select('test_id').in('test_id', testIds).eq('is_static', false);
      const qCount: Record<number, number> = {};
      (qData ?? []).forEach((q: any) => { qCount[q.test_id] = (qCount[q.test_id] ?? 0) + 1; });

      const { data: sd } = await supabase.auth.getSession();
      let progMap: Record<number, { score:number; total:number }> = {};

      if (sd.session?.user) {
        const { data: prog } = await supabase.from('user_progress')
          .select('test_id, score, total').eq('user_id', sd.session.user.id).in('test_id', testIds);
        (prog ?? []).forEach((p: any) => { progMap[p.test_id] = { score:p.score, total:p.total }; });
      } else {
        const local = await getLocalResults();
        local.forEach(r => { progMap[r.testId] = { score:r.score, total:r.total }; });
      }

      let targetBand = 7.5;
      if (sd.session?.user) {
        const { data: profile } = await supabase.from('profiles')
          .select('target_band').eq('id', sd.session.user.id).maybeSingle();
        if (profile?.target_band) targetBand = profile.target_band;
      }

      const cards: TestCard[] = (testsData ?? []).map((t: any) => {
        const prog = progMap[t.id];
        return {
          id:             t.id,
          title:          t.title,
          passage_number: t.passage_number,
          band_range:     t.band_range,
          is_premium:     t.is_premium,
          image_url:      t.image_url,
          test_type:      t.test_type ?? 'Academic',
          question_count: qCount[t.id] ?? 0,
          completed:      Boolean(prog),
          score:          prog?.score ?? null,
          total:          prog?.total ?? null,
        };
      });

      const completedCards = cards.filter(c => c.completed);
      const avgBand = completedCards.length > 0
        ? completedCards.reduce((s, c) => s + (c.score!/c.total!)*9, 0) / completedCards.length : 0;
      const bestBand = completedCards.length > 0
        ? Math.max(...completedCards.map(c => (c.score!/c.total!)*9)) : 0;

      setTests(cards);
      setStats({ avgBand, bestBand, completed:completedCards.length, total:cards.length, targetBand });
    } catch(e) { console.error('SkillTestsScreen', e); }
    finally {
      setLoading(false);
      Animated.timing(fadeAnim, { toValue:1, duration:400, useNativeDriver:true }).start();
    }
  };

  const startTest = (test: TestCard) => {
    if (test.is_premium) {
      Alert.alert('Premium test', 'This test is part of Premium. Upgrade to unlock all passages and full mock tests.');
      return;
    }
    navigation.navigate('PassageTest', { testId:test.id, testTitle:test.title, skill });
  };

  const filtered = tests.filter(t => {
    if (filter === 'all') return true;
    return t.passage_number === filter;
  });

  const handleFilter = () => {
    Alert.alert('Filter', 'Use the tabs below to filter by passage. More filter options are coming soon.');
  };

  const handleViewProgress = () => {
    navigation.navigate('Profile');
  };

  const handleGoPremium = () => {
    Alert.alert('Premium coming soon', 'Premium plans with all passages and full mock tests are launching soon. Stay tuned!');
  };

  const motivationalMsg = stats.completed === 0
    ? "Start your first test to track your band score!"
    : stats.avgBand >= stats.targetBand
    ? "🎉 You've reached your target band! Aim higher!"
    : "Keep it up! You're improving consistently.";

  // ── Render test card ─────────────────────────────────────────────────────────
  const renderCard = (test: TestCard) => {
    const pct        = test.total ? Math.round((test.score!/test.total)*100) : 0;
    const isPremLock = test.is_premium;

    return (
      <View key={test.id} style={[S.card, { backgroundColor:C.surface }]}>
        <View style={S.cardImgWrap}>
          {test.image_url ? (
            <Image source={{ uri:test.image_url }} style={S.cardImg} />
          ) : (
            <View style={[S.cardImgPlaceholder, { backgroundColor: isDark?'#1e3050':'#e8eaf0' }]}>
              <Feather name={config.icon} size={28} color={isDark?'#334155':'#94a3b8'} />
            </View>
          )}
          {isPremLock && (
            <View style={S.lockOverlay}>
              <View style={S.lockCircle}>
                <Feather name="lock" size={18} color="#fff" />
              </View>
            </View>
          )}
        </View>

        <View style={S.cardContent}>
          <View style={S.cardTopRow}>
            <View style={S.passageBadge}>
              <Text style={S.passageBadgeText}>
                {test.passage_number !== null
                  ? (skill === 'listening' ? `S${test.passage_number}` : `P${test.passage_number}`)
                  : 'Full'}
              </Text>
            </View>
            <TouchableOpacity hitSlop={{ top:8, bottom:8, left:8, right:8 }}
              onPress={() => startTest(test)}>
              <Feather name="chevron-right" size={18} color={C.muted} />
            </TouchableOpacity>
          </View>

          <Text style={[S.cardTitle, { color:C.text }]} numberOfLines={2}>{test.title}</Text>

          <View style={S.tagsRow}>
            <View style={[S.tagAcademic, { borderColor: isDark?'#334155':'#cbd5e1' }]}>
              <Feather name="book-open" size={10} color={isDark?'#94a3b8':'#64748b'} />
              <Text style={[S.tagAcademicText, { color: isDark?'#94a3b8':'#64748b' }]}>{test.test_type}</Text>
            </View>
            {test.band_range && (
              <Text style={S.tagBand}>Band {test.band_range}</Text>
            )}
            {test.question_count > 0 && (
              <Text style={[S.tagQuestions, { color:C.muted }]}>{test.question_count} Questions</Text>
            )}
          </View>

          <View style={S.statusRow}>
            <Feather name="clock" size={12} color={C.muted} />
            <Text style={[S.statusText, { color:C.muted }]}>20 min</Text>
            <View style={[S.statusDot, { borderColor: test.completed ? ORANGE : C.muted }]}>
              {test.completed && <View style={S.statusDotFill} />}
            </View>
            <Text style={[S.statusText, { color: test.completed ? ORANGE : C.muted }]}>
              {test.completed ? `${pct}% Correct` : 'Not Started'}
            </Text>
          </View>

          {isPremLock ? (
            <TouchableOpacity style={S.premiumAction} onPress={() => startTest(test)} activeOpacity={0.8}>
              <View style={S.premiumBadge}>
                <Feather name="lock" size={12} color={ORANGE} />
                <Text style={S.premiumBadgeText}>Premium</Text>
              </View>
              <Text style={[S.premiumUnlock, { color:ORANGE }]}>Unlock with{'\n'}Premium Plan</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={S.startBtn} onPress={() => startTest(test)} activeOpacity={0.85}>
              <Text style={S.startBtnText}>{test.completed ? 'Redo' : 'Start Practice'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ── Coming soon ──────────────────────────────────────────────────────────────
  if (isComingSoon) return (
    <SafeAreaView style={[S.safe, { backgroundColor:NAVY_DARK }]}>
      <View style={S.topRow}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Feather name="chevron-left" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', gap:12, padding:40 }}>
        <Text style={{ fontSize:48 }}>🚧</Text>
        <Text style={{ fontSize:22, fontWeight:'800', color:'#fff' }}>{config.title}</Text>
        <Text style={{ fontSize:14, color:'rgba(255,255,255,0.5)', textAlign:'center', lineHeight:22 }}>
          {config.subtitle.replace('Practice', 'Coming soon —')}
        </Text>
      </View>
    </SafeAreaView>
  );

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[S.safe, { backgroundColor:NAVY_DARK }]}>

      <View style={S.darkSection}>

        <View style={S.topRow}>
          <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Feather name="chevron-left" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={S.filterBtn} onPress={handleFilter} activeOpacity={0.8}>
            <Feather name="sliders" size={15} color="#fff" />
            <Text style={S.filterBtnText}>Filter</Text>
          </TouchableOpacity>
        </View>

        <Text style={S.pageTitle}>{config.title}</Text>
        <Text style={S.pageSubtitle}>{config.subtitle}</Text>

        <View style={[S.statsCard, { backgroundColor:NAVY_CARD }]}>
          <View style={S.statsRow}>
            <BandRing band={stats.avgBand} />
            <View style={S.statsDivider} />
            <StatItem icon="book-open" label="Completed" value={`${stats.completed} / ${stats.total}`} />
            <StatItem icon="target" label="Target Band" value={stats.targetBand.toFixed(1)} />
            <StatItem icon="award" label="Best Band" value={stats.bestBand > 0 ? stats.bestBand.toFixed(1) : '—'} />
          </View>

          <View style={S.motivStrip}>
            <Feather name="trending-up" size={14} color={ORANGE} />
            <Text style={S.motivText} numberOfLines={1}>{motivationalMsg}</Text>
            <TouchableOpacity hitSlop={{ top:8, bottom:8, left:8, right:8 }} onPress={handleViewProgress}>
              <Text style={S.motivLink}>View Progress  ›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ backgroundColor:C.bg }}
        contentContainerStyle={{ paddingBottom:32 }}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        <View style={[S.filterTabsWrap, { backgroundColor:C.bg }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={S.filterTabsScroll}>
            {tabs.map(tab => {
              const active = filter === tab.value;
              return (
                <TouchableOpacity
                  key={String(tab.value)}
                  style={[S.filterTab, {
                    backgroundColor: active ? ORANGE : C.surface,
                    borderColor:     active ? ORANGE : C.border,
                  }]}
                  onPress={() => setFilter(tab.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[S.filterTabText, { color: active ? '#fff' : C.text }]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={S.listWrap}>
          {loading ? (
            <View style={{ paddingVertical:60, alignItems:'center' }}>
              <ActivityIndicator color={ORANGE} size="large" />
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ paddingVertical:60, alignItems:'center', gap:12 }}>
              <Feather name="inbox" size={40} color={C.muted} />
              <Text style={[S.emptyText, { color:C.muted }]}>No passages found</Text>
            </View>
          ) : (
            <Animated.View style={{ opacity:fadeAnim, gap:12 }}>
              {filtered.map(test => renderCard(test))}
            </Animated.View>
          )}
        </View>

      </ScrollView>

      {/* Go Premium CTA — always visible, fixed above tab bar */}
      <View style={[S.premiumCTA, { backgroundColor:C.surface, borderTopWidth:1, borderTopColor:C.border }]}>
        <View style={{ flex:1 }}>
          <Text style={[S.premiumCTATitle, { color:C.text }]}>Want more practice?</Text>
          <Text style={[S.premiumCTASub, { color:C.muted }]}>
            Unlock all passages and full mock tests with Premium.
          </Text>
        </View>
        <TouchableOpacity style={S.premiumCTABtn} onPress={handleGoPremium} activeOpacity={0.85}>
          <Text style={S.premiumCTABtnText}>👑  Go Premium</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  safe:              { flex:1 },

  darkSection:       { backgroundColor:NAVY_DARK, paddingHorizontal:16, paddingBottom:20 },
  topRow:            { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingTop:8, paddingBottom:14 },
  backBtn:           { width:40, height:40, borderRadius:20, borderWidth:1.5, borderColor:'rgba(255,255,255,0.2)', alignItems:'center', justifyContent:'center' },
  filterBtn:         { flexDirection:'row', alignItems:'center', gap:6, borderWidth:1.5, borderColor:'rgba(255,255,255,0.2)', borderRadius:20, paddingHorizontal:14, paddingVertical:8 },
  filterBtnText:     { fontSize:13, fontWeight:'700', color:'#fff' },
  pageTitle:         { fontSize:28, fontWeight:'900', color:'#fff', marginBottom:4 },
  pageSubtitle:      { fontSize:13, color:'rgba(255,255,255,0.45)', marginBottom:16, lineHeight:18 },

  statsCard:         { borderRadius:16, padding:16, overflow:'hidden' },
  statsRow:          { flexDirection:'row', alignItems:'center', gap:4, marginBottom:14 },
  statsDivider:      { width:1, height:60, backgroundColor:'rgba(255,255,255,0.1)', marginHorizontal:8 },
  statIconWrap:      { width:36, height:36, borderRadius:10, backgroundColor:'rgba(232,92,47,0.15)', alignItems:'center', justifyContent:'center', marginBottom:4 },
  statLabel:         { fontSize:10, color:'rgba(255,255,255,0.5)', fontWeight:'600', textAlign:'center' },
  statValue:         { fontSize:16, fontWeight:'800', color:ORANGE, textAlign:'center' },
  motivStrip:        { flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'rgba(232,92,47,0.1)', borderRadius:10, paddingHorizontal:12, paddingVertical:9 },
  motivText:         { flex:1, fontSize:12, color:'rgba(255,255,255,0.7)', fontWeight:'500' },
  motivLink:         { fontSize:12, fontWeight:'700', color:ORANGE, flexShrink:0 },

  filterTabsWrap:    { paddingVertical:12 },
  filterTabsScroll:  { paddingHorizontal:16, gap:8 },
  filterTab:         { borderWidth:1.5, borderRadius:22, paddingHorizontal:14, paddingVertical:8, flexShrink:0 },
  filterTabText:     { fontSize:13, fontWeight:'700' },

  listWrap:          { paddingHorizontal:16, gap:12 },
  emptyText:         { fontSize:15, fontWeight:'600' },

  card:              { flexDirection:'row', borderRadius:16, overflow:'hidden', elevation:2, shadowColor:'#000', shadowOffset:{ width:0, height:1 }, shadowOpacity:0.06, shadowRadius:4, height:175 },
  cardImgWrap:       { width:120, position:'relative' },
  cardImg:           { width:120, height:175 },
  cardImgPlaceholder:{ width:120, height:175, alignItems:'center', justifyContent:'center' },
  lockOverlay:       { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.55)', alignItems:'center', justifyContent:'center' },
  lockCircle:        { width:40, height:40, borderRadius:20, backgroundColor:'rgba(0,0,0,0.6)', alignItems:'center', justifyContent:'center', borderWidth:1.5, borderColor:'rgba(255,255,255,0.3)' },
  cardContent:       { flex:1, padding:12, gap:6 },
  cardTopRow:        { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  passageBadge:      { backgroundColor:'rgba(232,92,47,0.12)', borderRadius:20, paddingHorizontal:8, paddingVertical:3 },
  passageBadgeText:  { fontSize:11, fontWeight:'800', color:ORANGE },
  cardTitle:         { fontSize:15, fontWeight:'800', lineHeight:21 },

  tagsRow:           { flexDirection:'row', alignItems:'center', flexWrap:'wrap', gap:6 },
  tagAcademic:       { flexDirection:'row', alignItems:'center', gap:4, borderWidth:1, borderRadius:20, paddingHorizontal:7, paddingVertical:3 },
  tagAcademicText:   { fontSize:10.5, fontWeight:'600' },
  tagBand:           { fontSize:11, fontWeight:'700', color:ORANGE },
  tagQuestions:      { fontSize:11, fontWeight:'500' },

  statusRow:         { flexDirection:'row', alignItems:'center', gap:5 },
  statusDot:         { width:14, height:14, borderRadius:7, borderWidth:1.5, alignItems:'center', justifyContent:'center' },
  statusDotFill:     { width:6, height:6, borderRadius:3, backgroundColor:ORANGE },
  statusText:        { fontSize:11.5, fontWeight:'500' },

  startBtn:          { backgroundColor:ORANGE, borderRadius:22, paddingVertical:9, paddingHorizontal:16, alignItems:'center', alignSelf:'flex-start', marginTop:2 },
  startBtnText:      { fontSize:13, fontWeight:'800', color:'#fff' },

  premiumAction:     { gap:4, marginTop:2 },
  premiumBadge:      { flexDirection:'row', alignItems:'center', gap:4 },
  premiumBadgeText:  { fontSize:13, fontWeight:'800', color:ORANGE },
  premiumUnlock:     { fontSize:11, fontWeight:'600', lineHeight:16 },

  premiumCTA:        { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingVertical:12 },
  premiumCTATitle:   { fontSize:15, fontWeight:'800', marginBottom:3 },
  premiumCTASub:     { fontSize:12, lineHeight:17 },
  premiumCTABtn:     { backgroundColor:ORANGE, borderRadius:24, paddingHorizontal:18, paddingVertical:12, flexShrink:0 },
  premiumCTABtnText: { fontSize:13, fontWeight:'800', color:'#fff' },
});