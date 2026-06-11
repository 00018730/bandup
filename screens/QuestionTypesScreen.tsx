import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const ORANGE = '#e85c2f';
const NAVY   = '#1a2744';

const light = {
  bg:      '#ffffff',
  surface: '#f4f5f8',
  text:    NAVY,
  muted:   '#6b7280',
  border:  '#e2e6ee',
};

const dark = {
  bg:      '#23262d',
  surface: '#2e323b',
  text:    '#eef0f4',
  muted:   '#8a919e',
  border:  '#3e434f',
};

// ─── Question types per skill ─────────────────────────────────────────────────
const QUESTION_TYPES: Record<string, { label: string; desc: string; total: number; done: number }[]> = {
  listening: [
    { label: 'Form Completion',           desc: 'Fill in a form with information you hear',     total: 10, done: 0 },
    { label: 'Note Completion 1',         desc: 'Complete notes from the first listening type',  total: 10, done: 0 },
    { label: 'Table Completion',          desc: 'Fill in a table with heard information',        total: 10, done: 0 },
    { label: 'Multiple Choice 1',         desc: 'Choose one correct answer from options',        total: 10, done: 0 },
    { label: 'Map / Plan / Diagram',      desc: 'Label parts of a map, plan or diagram',         total: 10, done: 0 },
    { label: 'Multiple Choice 2',         desc: 'Choose multiple correct answers',               total: 10, done: 0 },
    { label: 'Flow-Chart Completion',     desc: 'Complete a flow-chart using heard words',       total: 10, done: 0 },
    { label: 'Matching',                  desc: 'Match items to a list of options',              total: 10, done: 0 },
    { label: 'Note Completion 2',         desc: 'Complete notes from the second listening type', total: 10, done: 0 },
    { label: 'Sentence Completion',       desc: 'Fill in the blanks with heard words',           total: 10, done: 0 },
    { label: 'Summary Completion',        desc: 'Complete a summary using words you hear',       total: 10, done: 0 },
    { label: 'Short Answer Question',     desc: 'Write brief answers from what you hear',        total: 10, done: 0 },
  ],
  reading: [
    { label: 'Note Completion',           desc: 'Complete notes using words from the passage',   total: 10, done: 0 },
    { label: 'Identifying Information',   desc: 'True / False / Not Given statements',           total: 10, done: 0 },
    { label: 'Matching Paragraph Info',   desc: 'Match statements to paragraphs',                total: 10, done: 0 },
    { label: 'Matching Headings',         desc: 'Match headings to paragraphs',                  total: 10, done: 0 },
    { label: 'Summary Completion',        desc: 'Complete a summary using passage words',        total: 10, done: 0 },
    { label: 'Multiple Choice 1',         desc: 'Choose one correct answer from options',        total: 10, done: 0 },
    { label: 'Matching Features',         desc: 'Match features to a list of options',           total: 10, done: 0 },
    { label: 'Multiple Choice 2',         desc: 'Choose multiple correct answers',               total: 10, done: 0 },
    { label: 'Table Completion',          desc: 'Fill in a table using words from the text',     total: 10, done: 0 },
    { label: 'Diagram Label Completion',  desc: 'Label a diagram using words from the passage',  total: 10, done: 0 },
    { label: 'Yes / No / Not Given',      desc: 'Match writer\'s views to statements',           total: 10, done: 0 },
    { label: 'Sentence Completion',       desc: 'Complete sentences using passage words',        total: 10, done: 0 },
    { label: 'Flow-Chart Completion',     desc: 'Complete a flow-chart from the passage',        total: 10, done: 0 },
    { label: 'Short Answer Question',     desc: 'Answer questions using words from the text',    total: 10, done: 0 },
  ],
  writing: [
    { label: 'Task 1 – Graphs',           desc: 'Describe charts, graphs, or tables',            total: 8,  done: 0 },
    { label: 'Task 1 – Diagrams',         desc: 'Describe a process or diagram',                 total: 6,  done: 0 },
    { label: 'Task 1 – Maps',             desc: 'Describe changes in a map or plan',             total: 5,  done: 0 },
    { label: 'Task 2 – Opinion',          desc: 'Write an opinion essay with arguments',         total: 10, done: 0 },
    { label: 'Task 2 – Discussion',       desc: 'Discuss two views and give your opinion',       total: 10, done: 0 },
    { label: 'Task 2 – Problem/Sol.',     desc: 'Identify problems and propose solutions',       total: 8,  done: 0 },
  ],
  speaking: [
    { label: 'Part 1 – Introduction',     desc: 'Answer questions about yourself and life',      total: 10, done: 0 },
    { label: 'Part 2 – Long Turn',        desc: 'Speak for 1–2 min from a cue card',            total: 8,  done: 0 },
    { label: 'Part 3 – Discussion',       desc: 'Answer abstract questions in depth',            total: 9,  done: 0 },
  ],
};

const SKILL_STATS: Record<string, { questions: number; band: number }> = {
  listening: { questions: 52, band: 6.5 },
  reading:   { questions: 38, band: 7.0 },
  writing:   { questions: 21, band: 6.0 },
  speaking:  { questions: 15, band: 7.5 },
};

const SKILL_LABELS: Record<string, string> = {
  listening: 'Listening',
  reading:   'Reading',
  writing:   'Writing',
  speaking:  'Speaking',
};

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function QuestionTypesScreen({ route, navigation }: any) {
  const { skill = 'listening' } = route?.params ?? {};
  const isDark = useColorScheme() === 'dark';
  const colors = isDark ? dark : light;

  const types  = QUESTION_TYPES[skill] ?? [];
  const stats  = SKILL_STATS[skill];
  const label  = SKILL_LABELS[skill] ?? skill;

  const doneCount = types.filter(t => t.done === t.total).length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>

      {/* ── Header banner ── */}
      <View style={[styles.banner, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb' }]}>

        {/* Back + title */}
        <View style={styles.bannerTop}>
          <TouchableOpacity
            style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={16} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.bannerEyebrow, { color: ORANGE }]}>SKILL</Text>
            <Text style={[styles.bannerTitle, { color: colors.text }]}>{label}</Text>
          </View>
        </View>

        {/* Mini stats */}
        <View style={styles.miniStats}>
          <View style={[styles.miniStatCard, { backgroundColor: colors.bg }]}>
            <Text style={[styles.miniStatVal, { color: colors.text }]}>{stats.questions}</Text>
            <Text style={[styles.miniStatLabel, { color: colors.muted }]}>Questions done</Text>
          </View>
          <View style={[styles.miniStatCard, { backgroundColor: colors.bg }]}>
            <Text style={[styles.miniStatVal, { color: colors.text }]}>{stats.band.toFixed(1)}</Text>
            <Text style={[styles.miniStatLabel, { color: colors.muted }]}>Avg. band</Text>
          </View>
          <View style={[styles.miniStatCard, { backgroundColor: colors.bg }]}>
            <Text style={[styles.miniStatVal, { color: ORANGE }]}>{doneCount}/{types.length}</Text>
            <Text style={[styles.miniStatLabel, { color: colors.muted }]}>Types done</Text>
          </View>
        </View>
      </View>

      {/* ── Card list ── */}
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        

        <Text style={[styles.sectionLabel, { color: colors.muted }]}>QUESTION TYPES</Text>

        {types.map((t, i) => {
          const pct        = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;
          const isComplete = pct === 100;

          return (
            <TouchableOpacity
              key={i}
              style={[styles.card, { backgroundColor: colors.surface }]}
              activeOpacity={0.82}
              onPress={() => navigation.navigate('TestList', { skill, type: t.label })}
            >
              <View style={styles.cardInner}>
                {/* Icon */}
                <View style={[
                  styles.cardIcon,
                  { backgroundColor: isComplete
                      ? (isDark ? '#1a2a1a' : '#eaf5ee')
                      : (isDark ? '#2a1a12' : '#fff0eb') },
                ]}>
                  <Feather
                    name={isComplete ? 'check-circle' : 'circle'}
                    size={18}
                    color={isComplete ? '#22c55e' : ORANGE}
                  />
                </View>

                {/* Text */}
                <View style={{ flex: 1 }}>
                  <View style={styles.cardTitleRow}>
                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                      {t.label}
                    </Text>
                    {isComplete && (
                      <View style={[styles.doneBadge, { backgroundColor: isDark ? '#1a2a1a' : '#eaf5ee' }]}>
                        <Text style={[styles.doneBadgeText, { color: '#22c55e' }]}>Done</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.cardDesc, { color: colors.muted }]} numberOfLines={1}>
                    {t.desc}
                  </Text>

                  {/* Progress bar */}
                  <View style={styles.progressRow}>
                    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                      <View style={[
                        styles.progressFill,
                        {
                          width: `${pct}%` as any,
                          backgroundColor: isComplete ? '#22c55e' : ORANGE,
                        },
                      ]} />
                    </View>
                    <Text style={[styles.progressText, { color: colors.muted }]}>
                      {t.done}/{t.total}
                    </Text>
                  </View>
                </View>

                {/* Chevron */}
                <Feather name="chevron-right" size={16} color={colors.muted} />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:             { flex: 1 },

  // Banner
  banner:           { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16 },
  bannerTop:        { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  backBtn:          { width: 34, height: 34, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  bannerEyebrow:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  bannerTitle:      { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  miniStats:        { flexDirection: 'row', gap: 8 },
  miniStatCard:     { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  miniStatVal:      { fontSize: 17, fontWeight: '800', marginBottom: 2 },
  miniStatLabel:    { fontSize: 10, fontWeight: '600', textAlign: 'center' },

  // List
  list:             { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  sectionLabel:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 10, marginTop: 4 },

  // Type card
  card:             { borderRadius: 14, padding: 14, marginBottom: 10 },
  cardInner:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon:         { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitleRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cardTitle:        { fontSize: 13.5, fontWeight: '800', flexShrink: 1 },
  cardDesc:         { fontSize: 11, marginBottom: 8 },
  doneBadge:        { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  doneBadgeText:    { fontSize: 10, fontWeight: '700' },
  progressRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack:    { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill:     { height: '100%', borderRadius: 2 },
  progressText:     { fontSize: 10.5, fontWeight: '700', minWidth: 28, textAlign: 'right' },
});