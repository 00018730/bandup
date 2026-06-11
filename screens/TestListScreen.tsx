import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, useColorScheme, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { getLocalResults } from '../utils/storage';

const ORANGE = '#e85c2f';
const NAVY   = '#1a2744';
const GREEN  = '#22c55e';

const light = { bg:'#ffffff', surface:'#f4f5f8', text:NAVY, muted:'#6b7280', border:'#e2e6ee' };
const dark  = { bg:'#23262d', surface:'#2e323b', text:'#eef0f4', muted:'#8a919e', border:'#3e434f' };

interface Test {
  id: number;
  title: string;
  sort_order: number;
  question_count?: number;
  completed?: boolean;
  score?: number;
}

const getScreen = (skill: string, type: string): string => {
  if (skill === 'listening') {
    const map: Record<string, string> = {
      'Form Completion':        'ListeningFillBlank',
      'Note Completion 1':      'ListeningFillBlank',
      'Note Completion 2':      'ListeningFillBlank',
      'Sentence Completion':    'ListeningFillBlank',
      'Summary Completion':     'ListeningFillBlank',
      'Flow-Chart Completion':  'ListeningFillBlank',
      'Multiple Choice 1':      'ListeningMC',
      'Multiple Choice 2':      'ListeningMC',
      'Matching':               'ListeningMatching',
      'Table Completion':       'ListeningTable',
      'Short Answer Question':  'ListeningShortAnswer',
    };
    return map[type] ?? 'ListeningFillBlank';
  }
  const map: Record<string, string> = {
    'Note Completion':          'ReadingTest',
    'Summary Completion':       'ReadingTest',
    'Sentence Completion':      'ReadingTest',
    'Flow-Chart Completion':    'ReadingTest',
    'Identifying Information':  'TFNGTest',
    'Yes / No / Not Given':     'TFNGTest',
    'Matching Paragraph Info':  'MatchingPara',
    'Matching Headings':        'MatchingHeadings',
    'Matching Features':        'MatchingFeatures',
    'Multiple Choice 1':        'MultipleChoice',
    'Multiple Choice 2':        'MultipleChoice',
    'Table Completion':         'TableCompletion',
    'Short Answer Question':    'ShortAnswer',
    'Diagram Label Completion': 'ReadingTest',
  };
  return map[type] ?? 'ReadingTest';
};

export default function TestListScreen({ route, navigation }: any) {
  const { skill, type } = route?.params ?? {};
  const isDark = useColorScheme() === 'dark';
  const colors = isDark ? dark : light;

  const [tests, setTests]     = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => { fetchTests(); }, []);

  const fetchTests = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get question type id
      const { data: qtData, error: qtErr } = await supabase
        .from('question_types')
        .select('id')
        .eq('label', type)
        .single();

      if (qtErr || !qtData) throw new Error('Question type not found');

      // 2. Get tests
      const { data: testsData, error: testsErr } = await supabase
        .from('tests')
        .select(`id, title, sort_order, questions(count)`)
        .eq('question_type_id', qtData.id)
        .order('sort_order');

      if (testsErr) throw new Error(testsErr.message);

      // 3. Build progress map
      const progressMap: Record<number, { score: number; total: number }> = {};
      const { data: sessionData } = await supabase.auth.getSession();

      if (sessionData.session?.user) {
        // Logged in — fetch from Supabase
        const { data: progress } = await supabase
          .from('user_progress')
          .select('test_id, score, total')
          .eq('user_id', sessionData.session.user.id);
        if (progress) {
          progress.forEach((p: any) => {
            progressMap[p.test_id] = { score: p.score, total: p.total };
          });
        }
      } else {
        // Guest — fetch from AsyncStorage
        const local = await getLocalResults();
        local.forEach(r => {
          progressMap[r.testId] = { score: r.score, total: r.total };
        });
      }

      // 4. Merge tests with progress
      setTests((testsData ?? []).map((t: any) => {
        const done = progressMap[t.id];
        return {
          id:             t.id,
          title:          t.title,
          sort_order:     t.sort_order,
          question_count: t.questions?.[0]?.count ?? 0,
          completed:      !!done,
          score:          done?.score,
        };
      }));
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const completedCount = tests.filter(t => t.completed).length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>

      {/* Header */}
      <View style={[styles.banner, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb' }]}>
        <View style={styles.bannerTop}>
          <TouchableOpacity
            style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
            onPress={() => navigation.goBack()} activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={16} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerEyebrow, { color: ORANGE }]}>{skill?.toUpperCase()}</Text>
            <Text style={[styles.bannerTitle, { color: colors.text }]} numberOfLines={1}>{type}</Text>
          </View>
          {completedCount > 0 && (
            <View style={[styles.progressBadge, { backgroundColor: isDark ? '#1a2a1a' : '#eaf5ee' }]}>
              <Feather name="check-circle" size={12} color={GREEN} />
              <Text style={[styles.progressBadgeText, { color: GREEN }]}>
                {completedCount}/{tests.length}
              </Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ORANGE} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Loading tests...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={32} color={ORANGE} />
          <Text style={[styles.errorText, { color: colors.text }]}>Couldn't load tests</Text>
          <Text style={[styles.errorSub, { color: colors.muted }]}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchTests} activeOpacity={0.8}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>

          {/* Tutorial card */}
          <TouchableOpacity
            style={[styles.tutorialCard, { backgroundColor: colors.surface, borderColor: ORANGE }]}
            activeOpacity={0.85}
          >
            <View style={[styles.tutorialIcon, { backgroundColor: ORANGE }]}>
              <Feather name="play-circle" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.tutorialTitle, { color: colors.text }]}>Tutorial</Text>
              <Text style={[styles.tutorialDesc, { color: colors.muted }]}>
                Video & text guide for this question type
              </Text>
            </View>
            <View style={[styles.soonBadge, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb' }]}>
              <Text style={[styles.soonText, { color: ORANGE }]}>Soon</Text>
            </View>
          </TouchableOpacity>

          {tests.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="inbox" size={36} color={colors.muted} />
              <Text style={[styles.errorText, { color: colors.text }]}>No tests yet</Text>
              <Text style={[styles.errorSub, { color: colors.muted }]}>
                Tests for this question type are coming soon.
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                {tests.length} TEST{tests.length !== 1 ? 'S' : ''} AVAILABLE
              </Text>

              {tests.map((test, i) => (
                <TouchableOpacity
                  key={test.id}
                  style={[
                    styles.card,
                    { backgroundColor: colors.surface },
                    test.completed && { borderWidth: 1.5, borderColor: GREEN },
                  ]}
                  activeOpacity={0.82}
                  onPress={() => navigation.navigate(getScreen(skill, type), {
                    testId: test.id, testTitle: test.title, skill, type,
                  })}
                >
                  <View style={[styles.badge, {
                    backgroundColor: test.completed
                      ? (isDark ? '#1a2a1a' : '#eaf5ee')
                      : (isDark ? '#2a1a12' : '#fff0eb'),
                  }]}>
                    {test.completed
                      ? <Feather name="check" size={16} color={GREEN} />
                      : <Text style={[styles.badgeText, { color: ORANGE }]}>{i + 1}</Text>
                    }
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{test.title}</Text>
                    <Text style={[styles.cardSub, { color: colors.muted }]}>
                      {test.question_count} question{test.question_count !== 1 ? 's' : ''}
                      {test.completed && (
                        <Text style={{ color: GREEN }}>
                          {' · '}Score: {test.score}/{test.question_count}
                        </Text>
                      )}
                    </Text>
                  </View>

                  {test.completed ? (
                    <View style={[styles.redoBadge, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb' }]}>
                      <Text style={[styles.redoText, { color: ORANGE }]}>Redo</Text>
                    </View>
                  ) : (
                    <Feather name="chevron-right" size={18} color={colors.muted} />
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1 },
  banner:            { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16 },
  bannerTop:         { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backBtn:           { width: 34, height: 34, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  bannerEyebrow:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  bannerTitle:       { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  progressBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  progressBadgeText: { fontSize: 11, fontWeight: '700', color: GREEN },
  center:            { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  loadingText:       { fontSize: 13, fontWeight: '600', marginTop: 8 },
  errorText:         { fontSize: 16, fontWeight: '800', marginTop: 4 },
  errorSub:          { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  retryBtn:          { marginTop: 8, backgroundColor: ORANGE, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryText:         { color: '#fff', fontWeight: '700', fontSize: 13 },
  list:              { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  emptyWrap:         { alignItems: 'center', paddingTop: 40, gap: 10 },
  sectionLabel:      { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 12 },
  tutorialCard:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 16 },
  tutorialIcon:      { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tutorialTitle:     { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  tutorialDesc:      { fontSize: 11.5 },
  soonBadge:         { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  soonText:          { fontSize: 10, fontWeight: '700' },
  card:              { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 10 },
  badge:             { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badgeText:         { fontSize: 16, fontWeight: '800' },
  cardTitle:         { fontSize: 14, fontWeight: '800', marginBottom: 3 },
  cardSub:           { fontSize: 11.5, fontWeight: '500' },
  redoBadge:         { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  redoText:          { fontSize: 11, fontWeight: '700' },
});