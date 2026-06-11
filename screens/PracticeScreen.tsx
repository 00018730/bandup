import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, useColorScheme, ActivityIndicator, Modal, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { getLocalResults } from '../utils/storage';
import { fetchUserStats } from '../utils/sync';

const ORANGE    = '#e85c2f';
const NAVY      = '#1a2744';
const NAVY_DARK = '#0d1a2e';
const NAVY_CARD = '#152035';
const GOAL_MIN  = 60;
const WEEK_DAYS = ['M','T','W','T','F','S','S'];

// Alternating accent per skill: 0,2 = orange; 1,3 = navy
const SKILL_ACCENT = [ORANGE, NAVY, ORANGE, NAVY];

const SKILL_DEFS = [
  { key:'listening', label:'Listening', icon:'headphones' as const, unit:'Exercises' },
  { key:'reading',   label:'Reading',   icon:'book-open'  as const, unit:'Exercises' },
  { key:'writing',   label:'Writing',   icon:'edit-3'     as const, unit:'Tasks'     },
  { key:'speaking',  label:'Speaking',  icon:'mic'        as const, unit:'Tasks'     },
];

interface SkillStat {
  key:string; label:string; icon:any; unit:string;
  total:number; completed:number; avgBand:number;
}

// ─── Exam Type bottom sheet ───────────────────────────────────────────────────
function ExamTypeModal({ visible, onClose }: { visible:boolean; onClose:()=>void }) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={ms.overlay} activeOpacity={1} onPress={onClose}>
        <View style={ms.sheet} onStartShouldSetResponder={() => true}>
          <View style={ms.handle} />
          <Text style={ms.sheetTitle}>Choose Exam Type</Text>

          {/* IELTS Academic — active */}
          <TouchableOpacity style={[ms.examCard, ms.examCardActive]} onPress={onClose} activeOpacity={0.85}>
            <View style={ms.examCardLeft}>
              <View style={[ms.examIcon, { backgroundColor:'rgba(232,92,47,0.15)' }]}>
                <Feather name="book-open" size={20} color={ORANGE} />
              </View>
              <View>
                <Text style={ms.examCardTitle}>IELTS Academic</Text>
                <Text style={ms.examCardDesc}>Full simulation with band scoring</Text>
              </View>
            </View>
            <View style={ms.examCheckCircle}>
              <Feather name="check" size={14} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* CEFR — coming soon */}
          <View style={[ms.examCard, { opacity:0.55 }]}>
            <View style={ms.examCardLeft}>
              <View style={[ms.examIcon, { backgroundColor:'rgba(255,255,255,0.06)' }]}>
                <Feather name="award" size={20} color="rgba(255,255,255,0.5)" />
              </View>
              <View>
                <Text style={[ms.examCardTitle, { color:'rgba(255,255,255,0.6)' }]}>CEFR</Text>
                <Text style={ms.examCardDesc}>Level-based practice</Text>
              </View>
            </View>
            <View style={ms.comingSoonBadge}>
              <Text style={ms.comingSoonText}>Coming Soon</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── General Training modal ───────────────────────────────────────────────────
function GeneralTrainingModal({ visible, onClose }: { visible:boolean; onClose:()=>void }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={ms.overlay} activeOpacity={1} onPress={onClose}>
        <View style={ms.centered} onStartShouldSetResponder={() => true}>
          <Text style={{ fontSize:36, marginBottom:12 }}>🚧</Text>
          <Text style={ms.gtTitle}>General Training Coming Soon</Text>
          <Text style={ms.gtDesc}>
            We're preparing General Training tests.{'\n'}
            Stay tuned for the next update!
          </Text>
          <TouchableOpacity style={ms.gtBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={ms.gtBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function PracticeScreen({ navigation }: any) {
  const isDark = useColorScheme() === 'dark';
  const bgColor   = isDark ? '#0d1a2e' : '#f5f5f7';
  const cardColor = isDark ? NAVY_CARD : '#ffffff';
  const textColor = isDark ? '#eef0f4' : NAVY;
  const mutedColor= isDark ? '#8a919e' : '#6b7280';

  const [loading, setLoading]               = useState(true);
  const [skillStats, setSkillStats]         = useState<SkillStat[]>([]);
  const [streak, setStreak]                 = useState(0);
  const [todayMin, setTodayMin]             = useState(0);
  const [showExamType, setShowExamType]     = useState(false);
  const [showGeneral, setShowGeneral]       = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: sd } = await supabase.auth.getSession();
      const userId = sd.session?.user?.id ?? null;

      if (userId) {
        const s = await fetchUserStats(userId);
        if (s) setStreak(s.streak);
      }

      // ── PASSAGE-BASED SCHEMA ──────────────────────────────────────────────
      // tests now have a direct skill_id column (no more question_type_id join)
      const { data: skills } = await supabase.from('skills').select('id, key');
      const { data: tests }  = await supabase.from('tests').select('id, skill_id');

      const skillMap: Record<number,string> = {};
      (skills ?? []).forEach((s:any) => { skillMap[s.id] = s.key; });

      const testsBySkill: Record<string,number[]> = { listening:[], reading:[], writing:[], speaking:[] };
      (tests ?? []).forEach((t:any) => {
        const sk = skillMap[t.skill_id];
        if (sk && testsBySkill[sk]) testsBySkill[sk].push(t.id);
      });

      let progress: any[] = [];
      if (userId) {
        const { data } = await supabase.from('user_progress')
          .select('test_id, score, total, completed_at').eq('user_id', userId);
        progress = data ?? [];
      } else {
        const local = await getLocalResults();
        progress = local.map(r => ({ test_id:r.testId, score:r.score, total:r.total, completed_at:r.completedAt }));
      }
      const progMap: Record<number,any> = {};
      progress.forEach((p:any) => { progMap[p.test_id] = p; });

      const today = new Date().toISOString().split('T')[0];
      setTodayMin(progress.filter((p:any) => p.completed_at?.startsWith(today)).length * 20);

      setSkillStats(SKILL_DEFS.map(def => {
        const testIds = testsBySkill[def.key] ?? [];
        const doneIds = testIds.filter(id => progMap[id]);
        const avgBand = doneIds.length > 0
          ? doneIds.reduce((s,id) => s + (progMap[id].score / Math.max(progMap[id].total,1)) * 9, 0) / doneIds.length
          : 0;
        return { ...def, total:testIds.length, completed:doneIds.length, avgBand };
      }));
    } catch (e) { console.error('PracticeScreen', e); }
    finally { setLoading(false); }
  };

  const todayIdx   = (new Date().getDay() + 6) % 7;
  const streakDots = WEEK_DAYS.map((d, i) => ({
    label: d, active: ((todayIdx - i + 7) % 7) < streak, isToday: i === todayIdx,
  }));
  const goalPct    = Math.min((todayMin / GOAL_MIN) * 100, 100);

  const recommendedSkill = skillStats.filter(s => s.total > 0).sort((a,b) => a.avgBand - b.avgBand)[0];

  const handleMockTest = () => {
    Alert.alert('Coming soon', 'Full mock tests will be available in an upcoming update. For now, practice individual skills to build your band score!');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: NAVY_DARK }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex:1, backgroundColor: bgColor }}
        contentContainerStyle={{ flexGrow: 1 }}
      >

        {/* ══ DARK SECTION ═══════════════════════════════════════════════════ */}
        <View style={{ backgroundColor: NAVY_DARK, paddingHorizontal:16, paddingTop:20, paddingBottom:20 }}>

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex:1 }}>
              <Text style={styles.pageTitle}>Practice</Text>
              <Text style={styles.pageSubtitle}>Sharpen your skills. Improve your band score.</Text>
            </View>
            <TouchableOpacity style={styles.examTypeBtn} onPress={() => setShowExamType(true)} activeOpacity={0.85}>
              <Feather name="book" size={13} color="#fff" />
              <Text style={styles.examTypeBtnText}>Exam Type</Text>
              <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>

            {/* Today's Goal */}
            <View style={styles.goalCard}>
              <View style={styles.goalRow}>
                <View style={styles.goalIconWrap}>
                  <Feather name="target" size={20} color={ORANGE} />
                </View>
                <View>
                  <Text style={styles.smallLabel}>Today's Goal</Text>
                  <Text style={styles.goalValue}>
                    <Text style={{ color: ORANGE, fontSize:22, fontWeight:'800' }}>{todayMin}</Text>
                    <Text style={styles.goalMax}> / {GOAL_MIN} min</Text>
                  </Text>
                </View>
              </View>
              <View style={styles.goalTrack}>
                <View style={[styles.goalFill, { width:`${goalPct}%` as any }]} />
              </View>
            </View>

            {/* Study Streak */}
            <View style={styles.streakCard}>
              <View style={styles.streakTopRow}>
                <View>
                  <Text style={styles.smallLabel}>Study Streak</Text>
                  <View style={{ flexDirection:'row', alignItems:'baseline', gap:4 }}>
                    <Text style={styles.streakNum}>{streak}</Text>
                    <Text style={styles.goalMax}>Days</Text>
                  </View>
                </View>
                <Text style={{ fontSize:22 }}>🔥</Text>
                <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.25)" />
              </View>
              <View style={styles.dotRow}>
                {streakDots.map((d, i) => (
                  <View key={i} style={styles.dotCol}>
                    <View style={[styles.dot, {
                      backgroundColor: d.isToday && !d.active ? ORANGE : d.active ? ORANGE : 'rgba(255,255,255,0.1)',
                      borderWidth: d.isToday ? 2 : 0,
                      borderColor: ORANGE,
                    }]}>
                      {d.active && !d.isToday && <Feather name="check" size={9} color="#fff" />}
                      {d.isToday && <Text style={{ fontSize:9, color:'#fff', fontWeight:'800' }}>{d.label}</Text>}
                    </View>
                    {!d.isToday && <Text style={styles.dotLabel}>{d.label}</Text>}
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Continue Practice — placeholder until in-progress tracking is added */}
          <View style={styles.continueCard}>
            <Text style={styles.continueTitle}>Continue Practice</Text>
            <View style={styles.continueInner}>
              <View style={styles.continueIconBox}>
                <Feather name="edit" size={22} color="#fff" />
              </View>
              <View style={{ flex:1 }}>
                <Text style={styles.continueNoData}>No active practice</Text>
                <Text style={styles.continueNoDataSub}>Start a test — it'll appear here so you can pick up where you left off.</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ══ LIGHT SECTION ══════════════════════════════════════════════════ */}
        <View style={{ borderTopLeftRadius:24, borderTopRightRadius:24, overflow:'hidden', backgroundColor:bgColor }}>

          {/* IELTS Skills card */}
          <View style={{ backgroundColor:cardColor, paddingTop:20, paddingBottom:20 }}>
            <Text style={[styles.sectionTitle, { color:textColor, paddingHorizontal:16, marginBottom:14 }]}>IELTS Skills</Text>

            {loading ? (
              <View style={{ height:200, alignItems:'center', justifyContent:'center' }}>
                <ActivityIndicator color={ORANGE} />
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal:16, gap:12, paddingBottom:4 }}>
                {skillStats.map((skill, idx) => {
                  const accent  = SKILL_ACCENT[idx];
                  const band    = skill.avgBand;
                  const bandPct = Math.min((band / 9) * 100, 100);
                  const isLight = accent === ORANGE;
                  return (
                    <View key={skill.key} style={[styles.skillCard, {
                      backgroundColor: cardColor,
                      borderColor: isDark ? '#1e3050' : '#f0f0f0',
                    }]}>
                      <View style={[styles.skillIconRing, {
                        borderColor: isLight ? 'rgba(232,92,47,0.3)' : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(26,39,68,0.2)'),
                        backgroundColor: isLight ? 'rgba(232,92,47,0.06)' : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(26,39,68,0.06)'),
                      }]}>
                        <Feather name={skill.icon} size={26} color={isDark && !isLight ? '#94a3b8' : accent} />
                      </View>

                      <Text style={[styles.skillName, { color:textColor }]}>{skill.label}</Text>

                      <Text style={[styles.skillCount, { color:mutedColor }]}>
                        {skill.total > 0 ? `${skill.total} ${skill.unit}` : 'Coming Soon'}
                      </Text>

                      <Text style={[styles.avgBandLabel, { color:isDark ? '#64748b' : '#9ca3af' }]}>Avg. Band</Text>

                      <Text style={[styles.avgBandNum, { color: isDark && !isLight ? '#94a3b8' : accent }]}>
                        {band > 0 ? band.toFixed(1) : '—'}
                      </Text>

                      <View style={[styles.skillTrackBg, { backgroundColor: isDark ? '#1e3050' : '#f0f0f0' }]}>
                        <View style={[styles.skillTrackFill, {
                          width: `${bandPct}%` as any,
                          backgroundColor: accent,
                        }]} />
                      </View>

                      <TouchableOpacity
                        style={[styles.startBtn, { borderColor: accent, opacity: skill.total > 0 ? 1 : 0.4 }]}
                        onPress={() => {
                          if (skill.total > 0) navigation.navigate('SkillTests', { skill: skill.key });
                          else Alert.alert('Coming soon', `${skill.label} tests are coming in a future update.`);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.startBtnText, { color: isDark && !isLight ? '#94a3b8' : accent }]}>Start</Text>
                        <Feather name="chevron-right" size={13} color={isDark && !isLight ? '#94a3b8' : accent} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Full IELTS Mock Test */}
          <View style={[styles.mockCard, { margin:16, marginTop:12 }]}>
            <View style={styles.mockTopRow}>
              <View style={{ flex:1, flexDirection:'row', alignItems:'flex-start', gap:12 }}>
                <View style={styles.mockIconBox}>
                  <Feather name="clipboard" size={22} color={ORANGE} />
                  <View style={styles.mockCheckBadge}>
                    <Feather name="check" size={8} color="#fff" />
                  </View>
                </View>
                <View style={{ flex:1 }}>
                  <Text style={styles.mockTitle}>Full IELTS Mock Test</Text>
                  <Text style={styles.mockDesc}>Experience the real test environment and track your performance.</Text>
                </View>
              </View>

              <View style={{ gap:8, flexShrink:0 }}>
                <TouchableOpacity style={styles.mockBtnOrange} onPress={handleMockTest} activeOpacity={0.8}>
                  <Text style={styles.mockBtnOrangeText}>Academic Module</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mockBtnGray} onPress={() => setShowGeneral(true)} activeOpacity={0.8}>
                  <Text style={styles.mockBtnGrayText}>General Training</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.mockMetaRow}>
              <View style={styles.mockMetaItem}>
                <Feather name="clock" size={14} color="rgba(255,255,255,0.4)" />
                <View>
                  <Text style={styles.mockMetaLabel}>Duration</Text>
                  <Text style={styles.mockMetaVal}>2h 45m</Text>
                </View>
              </View>
              <View style={styles.mockMetaDivider} />
              <View style={styles.mockMetaItem}>
                <Feather name="list" size={14} color="rgba(255,255,255,0.4)" />
                <View>
                  <Text style={styles.mockMetaLabel}>4 Sections</Text>
                  <Text style={[styles.mockMetaVal, { fontSize:9.5, lineHeight:14 }]}>
                    Listening, Reading,{'\n'}Writing, Speaking
                  </Text>
                </View>
              </View>
              <View style={styles.mockMetaDivider} />
              <View style={styles.mockMetaItem}>
                <Feather name="bar-chart-2" size={14} color="rgba(255,255,255,0.4)" />
                <View>
                  <Text style={styles.mockMetaLabel}>Realistic Scoring</Text>
                  <Text style={[styles.mockMetaVal, { fontSize:9.5, lineHeight:14 }]}>
                    Get estimated{'\n'}band score
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.mockStartBtn} onPress={handleMockTest} activeOpacity={0.85}>
              <Text style={styles.mockStartBtnText}>Start Mock Test  ›</Text>
            </TouchableOpacity>
          </View>

          {/* Recommended For You */}
          <View style={{ paddingHorizontal:16, paddingBottom:24 }}>
            <Text style={[styles.sectionTitle, { color:textColor, marginBottom:12 }]}>Recommended For You</Text>

            {recommendedSkill ? (
              <View style={[styles.recommendCard, { backgroundColor:cardColor }]}>
                <View style={styles.recommendIcon}>
                  <Text style={{ fontSize:20 }}>✨</Text>
                </View>
                <View style={{ flex:1 }}>
                  <Text style={[styles.recommendTitle, { color:textColor }]}>
                    {recommendedSkill.completed > 0
                      ? `${recommendedSkill.label} – Improve Your Score`
                      : `${recommendedSkill.label} – Get Started`}
                  </Text>
                  <Text style={[styles.recommendDesc, { color:mutedColor }]}>
                    {recommendedSkill.completed > 0
                      ? `Focus on argument structure and examples to improve coherence.`
                      : `Start practising to track your ${recommendedSkill.label} band score.`}
                  </Text>
                </View>
                <View style={{ alignItems:'flex-end', gap:10, flexShrink:0 }}>
                  <View style={styles.potentialBadge}>
                    <Text style={styles.potentialText}>+0.5 Band Potential</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.practiceNowBtn}
                    onPress={() => navigation.navigate('SkillTests', { skill: recommendedSkill.key })}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.practiceNowText}>Practice Now</Text>
                    <Feather name="chevron-right" size={13} color={ORANGE} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={[styles.recommendCard, { backgroundColor:cardColor, justifyContent:'center' }]}>
                <Text style={[styles.recommendDesc, { color:mutedColor }]}>Complete some tests to get personalised recommendations.</Text>
              </View>
            )}
          </View>

        </View>
      </ScrollView>

      {/* Modals */}
      <ExamTypeModal visible={showExamType} onClose={() => setShowExamType(false)} />
      <GeneralTrainingModal visible={showGeneral} onClose={() => setShowGeneral(false)} />
    </SafeAreaView>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:            { flex:1 },

  headerRow:       { flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, gap:12 },
  pageTitle:       { fontSize:30, fontWeight:'800', color:'#fff', marginBottom:4 },
  pageSubtitle:    { fontSize:12.5, color:'rgba(255,255,255,0.45)', lineHeight:18 },
  examTypeBtn:     { flexDirection:'row', alignItems:'center', gap:6, borderWidth:1, borderColor:'rgba(255,255,255,0.25)', borderRadius:22, paddingHorizontal:14, paddingVertical:9, flexShrink:0 },
  examTypeBtnText: { fontSize:13, fontWeight:'700', color:'#fff' },

  statsRow:        { flexDirection:'row', gap:10, marginBottom:16 },

  goalCard:        { flex:1, backgroundColor:NAVY_CARD, borderRadius:14, padding:14, gap:10 },
  goalRow:         { flexDirection:'row', alignItems:'center', gap:10 },
  goalIconWrap:    { width:40, height:40, borderRadius:12, backgroundColor:'rgba(232,92,47,0.15)', alignItems:'center', justifyContent:'center' },
  smallLabel:      { fontSize:11, color:'rgba(255,255,255,0.5)', fontWeight:'600', marginBottom:2 },
  goalValue:       { fontSize:15, fontWeight:'700', color:'#fff' },
  goalMax:         { fontSize:13, color:'rgba(255,255,255,0.4)', fontWeight:'500' },
  goalTrack:       { height:5, backgroundColor:'rgba(255,255,255,0.08)', borderRadius:3 },
  goalFill:        { height:5, backgroundColor:ORANGE, borderRadius:3 },

  streakCard:      { flex:1, backgroundColor:NAVY_CARD, borderRadius:14, padding:14, gap:10 },
  streakTopRow:    { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  streakNum:       { fontSize:24, fontWeight:'800', color:ORANGE },
  dotRow:          { flexDirection:'row', gap:2 },
  dotCol:          { flex:1, alignItems:'center', gap:2 },
  dot:             { width:22, height:22, borderRadius:11, alignItems:'center', justifyContent:'center' },
  dotLabel:        { fontSize:8.5, color:'rgba(255,255,255,0.3)', fontWeight:'600' },

  continueCard:    { backgroundColor:NAVY_CARD, borderRadius:16, padding:16 },
  continueTitle:   { fontSize:15, fontWeight:'800', color:'#fff', marginBottom:12 },
  continueInner:   { flexDirection:'row', alignItems:'center', gap:12 },
  continueIconBox: { width:52, height:52, borderRadius:12, backgroundColor:'rgba(232,92,47,0.2)', alignItems:'center', justifyContent:'center', flexShrink:0 },
  continueNoData:  { fontSize:13, fontWeight:'700', color:'rgba(255,255,255,0.7)', marginBottom:3 },
  continueNoDataSub:{ fontSize:11, color:'rgba(255,255,255,0.4)', lineHeight:16 },

  sectionTitle:    { fontSize:19, fontWeight:'800' },

  skillCard:       { width:155, borderRadius:18, borderWidth:1, padding:16, alignItems:'center', gap:4 },
  skillIconRing:   { width:62, height:62, borderRadius:31, borderWidth:2, alignItems:'center', justifyContent:'center', marginBottom:8 },
  skillName:       { fontSize:15, fontWeight:'800', textAlign:'center' },
  skillCount:      { fontSize:12, textAlign:'center', marginBottom:4 },
  avgBandLabel:    { fontSize:11, fontWeight:'600' },
  avgBandNum:      { fontSize:30, fontWeight:'800', lineHeight:34 },
  skillTrackBg:    { width:'100%', height:3, borderRadius:2, marginTop:4 },
  skillTrackFill:  { height:3, borderRadius:2 },
  startBtn:        { width:'100%', flexDirection:'row', alignItems:'center', justifyContent:'center', gap:4, borderWidth:1.5, borderRadius:24, paddingVertical:9, marginTop:8 },
  startBtnText:    { fontSize:13, fontWeight:'700' },

  mockCard:        { backgroundColor:NAVY, borderRadius:18, padding:18, gap:16 },
  mockTopRow:      { flexDirection:'row', alignItems:'flex-start', gap:12 },
  mockIconBox:     { width:52, height:52, borderRadius:12, backgroundColor:'rgba(232,92,47,0.15)', alignItems:'center', justifyContent:'center', flexShrink:0, position:'relative' },
  mockCheckBadge:  { position:'absolute', bottom:-2, right:-2, width:16, height:16, borderRadius:8, backgroundColor:ORANGE, alignItems:'center', justifyContent:'center' },
  mockTitle:       { fontSize:16, fontWeight:'800', color:'#fff', marginBottom:5 },
  mockDesc:        { fontSize:12, color:'rgba(255,255,255,0.5)', lineHeight:18 },
  mockBtnOrange:   { borderWidth:1.5, borderColor:ORANGE, borderRadius:22, paddingVertical:9, paddingHorizontal:16, alignItems:'center' },
  mockBtnOrangeText:{ fontSize:12, fontWeight:'700', color:ORANGE },
  mockBtnGray:     { borderWidth:1.5, borderColor:'rgba(255,255,255,0.2)', borderRadius:22, paddingVertical:9, paddingHorizontal:16, alignItems:'center' },
  mockBtnGrayText: { fontSize:12, fontWeight:'700', color:'rgba(255,255,255,0.6)' },
  mockMetaRow:     { flexDirection:'row', alignItems:'flex-start', backgroundColor:'rgba(255,255,255,0.05)', borderRadius:12, padding:12 },
  mockMetaItem:    { flex:1, flexDirection:'row', alignItems:'flex-start', gap:8 },
  mockMetaDivider: { width:1, backgroundColor:'rgba(255,255,255,0.1)', marginHorizontal:8, alignSelf:'stretch' },
  mockMetaLabel:   { fontSize:9.5, color:'rgba(255,255,255,0.4)', fontWeight:'600', marginBottom:2 },
  mockMetaVal:     { fontSize:11, fontWeight:'700', color:'#fff', lineHeight:15 },
  mockStartBtn:    { backgroundColor:ORANGE, borderRadius:28, paddingVertical:14, alignItems:'center' },
  mockStartBtnText:{ fontSize:15, fontWeight:'800', color:'#fff' },

  recommendCard:   { flexDirection:'row', alignItems:'center', gap:12, borderRadius:16, padding:16 },
  recommendIcon:   { width:44, height:44, borderRadius:12, backgroundColor:'rgba(232,92,47,0.1)', alignItems:'center', justifyContent:'center', flexShrink:0 },
  recommendTitle:  { fontSize:13.5, fontWeight:'800', marginBottom:3 },
  recommendDesc:   { fontSize:11.5, lineHeight:17 },
  potentialBadge:  { backgroundColor:'rgba(232,92,47,0.1)', borderRadius:20, paddingHorizontal:8, paddingVertical:4 },
  potentialText:   { fontSize:10, fontWeight:'700', color:ORANGE },
  practiceNowBtn:  { flexDirection:'row', alignItems:'center', gap:4, borderWidth:1.5, borderColor:ORANGE, borderRadius:22, paddingHorizontal:14, paddingVertical:7 },
  practiceNowText: { fontSize:12, fontWeight:'700', color:ORANGE },
});

// ─── Modal styles ─────────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay:          { flex:1, backgroundColor:'rgba(0,0,0,0.55)', justifyContent:'flex-end' },
  sheet:            { backgroundColor:NAVY_CARD, borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, paddingBottom:36, gap:12 },
  handle:           { width:40, height:4, backgroundColor:'rgba(255,255,255,0.15)', borderRadius:2, alignSelf:'center', marginBottom:8 },
  sheetTitle:       { fontSize:17, fontWeight:'800', color:'#fff', marginBottom:4 },

  examCard:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:'rgba(255,255,255,0.06)', borderRadius:14, padding:14 },
  examCardActive:   { backgroundColor:'rgba(232,92,47,0.12)', borderWidth:1.5, borderColor:ORANGE },
  examCardLeft:     { flexDirection:'row', alignItems:'center', gap:12, flex:1 },
  examIcon:         { width:42, height:42, borderRadius:12, alignItems:'center', justifyContent:'center' },
  examCardTitle:    { fontSize:15, fontWeight:'800', color:'#fff', marginBottom:2 },
  examCardDesc:     { fontSize:11.5, color:'rgba(255,255,255,0.5)' },
  examCheckCircle:  { width:26, height:26, borderRadius:13, backgroundColor:ORANGE, alignItems:'center', justifyContent:'center', flexShrink:0 },

  comingSoonBadge:  { backgroundColor:'rgba(255,255,255,0.1)', borderRadius:20, paddingHorizontal:10, paddingVertical:4, flexShrink:0 },
  comingSoonText:   { fontSize:10, fontWeight:'700', color:'rgba(255,255,255,0.5)' },

  centered:         { margin:32, backgroundColor:NAVY_CARD, borderRadius:20, padding:28, alignItems:'center', gap:8 },
  gtTitle:          { fontSize:17, fontWeight:'800', color:'#fff', textAlign:'center' },
  gtDesc:           { fontSize:13, color:'rgba(255,255,255,0.55)', textAlign:'center', lineHeight:20 },
  gtBtn:            { marginTop:8, backgroundColor:ORANGE, borderRadius:24, paddingHorizontal:32, paddingVertical:12 },
  gtBtnText:        { fontSize:14, fontWeight:'800', color:'#fff' },
});