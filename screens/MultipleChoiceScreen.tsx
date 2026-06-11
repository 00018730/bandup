import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { saveLocalResult, getCompletedCount, hasSeenSavePrompt, markSavePromptSeen } from '../utils/storage';
import SaveProgressCard from '../components/SaveProgressCard';
import { supabase } from '../supabase';

const ORANGE = '#e85c2f';
const NAVY   = '#1a2744';
const GREEN  = '#22c55e';

const light = {
  bg: '#ffffff', surface: '#f4f5f8', text: NAVY,
  muted: '#6b7280', border: '#e2e6ee',
};
const dark = {
  bg: '#23262d', surface: '#2e323b', text: '#eef0f4',
  muted: '#8a919e', border: '#3e434f',
};

interface Option {
  id: number;
  label: string;
  body: string;
  is_correct: boolean;
}
interface Question {
  id: number;
  body: string;
  correct_answer: string;
  answer_location: string;
  sort_order: number;
  options: Option[];
}
interface Test {
  id: number;
  title: string;
  passage: string;
  questions: Question[];
}
type ScreenMode = 'test' | 'results' | 'review';

function HighlightedText({ text, highlight, textStyle }: {
  text: string; highlight: string; textStyle: any;
}) {
  if (!highlight || !text) return <Text style={textStyle}>{text}</Text>;
  const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts   = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <Text style={textStyle}>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase()
          ? <Text key={i} style={{ color: ORANGE, fontWeight: '800', textDecorationLine: 'underline' }}>{part}</Text>
          : part
      )}
    </Text>
  );
}

export default function MultipleChoiceScreen({ route, navigation }: any) {
  const { testId, testTitle, type } = route?.params ?? {};
  const isDark  = useColorScheme() === 'dark';
  const colors  = isDark ? dark : light;

  // MC1 = single answer, MC2 = multiple answers
  const isMultiple = type === 'Multiple Choice 2';

  const [test, setTest]         = useState<Test | null>(null);
  const [loading, setLoading]   = useState(true);
  // For MC1: Record<questionId, optionId>
  // For MC2: Record<questionId, optionId[]>
  const [answers, setAnswers]   = useState<Record<number, any>>({});
  const [screenMode, setScreenMode] = useState<ScreenMode>('test');
  const [score, setScore]       = useState(0);
  const [modalQ, setModalQ]     = useState<Question | null>(null);

  // Highlight state
  const [highlights, setHighlights]   = useState<[number, number][]>([]);
  const [selectStart, setSelectStart] = useState<number | null>(null);

  const [isGuest, setIsGuest]           = useState(true);
const [showSaveCard, setShowSaveCard] = useState(false);
const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
  fetchTest();
  supabase.auth.getSession().then(({ data }) => {
    setIsGuest(!data.session);
  });
}, []);

  const fetchTest = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tests')
      .select(`id, title, passage,
        questions(id, body, correct_answer, answer_location, sort_order,
          options(id, label, body, is_correct)
        )`)
      .eq('id', testId)
      .single();
    if (!error && data) {
      const questions = [...(data.questions ?? [])].sort(
        (a: Question, b: Question) => a.sort_order - b.sort_order
      ).map((q: Question) => ({
        ...q,
        options: [...(q.options ?? [])].sort((a: Option, b: Option) =>
          a.label.localeCompare(b.label)
        ),
      }));
      setTest({ ...data, questions } as Test);
    }
    setLoading(false);
  };

  const toggleAnswer = (questionId: number, optionId: number) => {
    if (!isMultiple) {
      setAnswers(prev => ({ ...prev, [questionId]: optionId }));
    } else {
      setAnswers(prev => {
        const current: number[] = prev[questionId] ?? [];
        const exists = current.includes(optionId);
        return {
          ...prev,
          [questionId]: exists
            ? current.filter((id: number) => id !== optionId)
            : [...current, optionId],
        };
      });
    }
  };

  const isSelected = (questionId: number, optionId: number): boolean => {
    if (!isMultiple) return answers[questionId] === optionId;
    return (answers[questionId] ?? []).includes(optionId);
  };

  const handleSubmit = async () => {
  if (!test) return;
  let correct = 0;
  test.questions.forEach(q => {
    const correctIds = q.options.filter(o => o.is_correct).map(o => o.id);
    if (!isMultiple) {
      if (correctIds.includes(answers[q.id])) correct++;
    } else {
      const ua: number[] = answers[q.id] ?? [];
      if (correctIds.length === ua.length && correctIds.every(id => ua.includes(id))) correct++;
    }
  });
  setScore(correct);
  setScreenMode('results');

  if (isGuest) {
    await saveLocalResult({
      testId: test.id, testTitle: test.title ?? '',
      skill: route?.params?.skill ?? '', type: route?.params?.type ?? '',
      score: correct, total: test.questions.length,
      completedAt: new Date().toISOString(),
    });
    const count = await getCompletedCount();
    const seen  = await hasSeenSavePrompt();
    setCompletedCount(count);
    if (!seen) setShowSaveCard(true);
  }
};

  // ── Highlight handlers ────────────────────────────────────────────────────
  const handleWordTap = (index: number) => {
    const existingIdx = highlights.findIndex(([s, e]) => index >= s && index <= e);
    if (existingIdx !== -1) {
      setHighlights(prev => prev.filter((_, i) => i !== existingIdx));
      setSelectStart(null);
      return;
    }
    if (selectStart === null) {
      setSelectStart(index);
    } else {
      setHighlights(prev => [...prev, [Math.min(selectStart, index), Math.max(selectStart, index)]]);
      setSelectStart(null);
    }
  };
  const isWordHighlighted = (i: number) => highlights.some(([s, e]) => i >= s && i <= e);
  const isWordPending     = (i: number) => selectStart !== null && i === selectStart;

  const renderPassage = () => {
    if (!test) return null;
    const paragraphs = test.passage.split('\n').filter(p => p.trim().length > 0);
    const selecting  = selectStart !== null;
    let wordIndex    = 0;
    return (
      <View style={[styles.passageCard, { backgroundColor: colors.surface }]}>
        <View style={styles.passageHeader}>
          <Text style={[styles.passageLabel, { color: ORANGE }]}>PASSAGE</Text>
          <View style={styles.passageHintRow}>
            {selecting && (
              <TouchableOpacity onPress={() => setSelectStart(null)} style={[styles.cancelSelBtn, { borderColor: colors.border }]}>
                <Feather name="x" size={11} color={colors.muted} />
                <Text style={[styles.cancelSelText, { color: colors.muted }]}>Cancel</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.passageHint, { color: selecting ? ORANGE : colors.muted }]}>
              {selecting ? 'Tap end of selection' : 'Tap to highlight'}
            </Text>
          </View>
        </View>
        {paragraphs.map((para, pi) => {
          const words = para.split(' ').filter(w => w.length > 0);
          return (
            <View key={pi} style={[styles.passageWords, { marginBottom: 10 }]}>
              {words.map(word => {
                const i = wordIndex++;
                return (
                  <TouchableOpacity key={i} onPress={() => handleWordTap(i)} activeOpacity={0.7}>
                    <Text style={[
                      styles.passageWord, { color: colors.text },
                      isWordHighlighted(i) && { backgroundColor: '#fff0eb', color: ORANGE, fontWeight: '700', borderRadius: 3 },
                      isWordPending(i)     && { backgroundColor: '#ffd9cc', color: ORANGE, borderRadius: 3 },
                    ]}>
                      {word}{' '}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
        {highlights.length > 0 && (
          <TouchableOpacity onPress={() => setHighlights([])} style={styles.clearBtn}>
            <Feather name="trash-2" size={12} color={colors.muted} />
            <Text style={[styles.clearBtnText, { color: colors.muted }]}>Clear highlights</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ORANGE} />
        <Text style={[styles.loadingText, { color: colors.muted }]}>Loading test...</Text>
      </View>
    </SafeAreaView>
  );

  if (!test) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={styles.center}>
        <Feather name="alert-circle" size={32} color={ORANGE} />
        <Text style={[styles.errorText, { color: colors.text }]}>Test not found</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.retryText}>Go back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  // ── Results ───────────────────────────────────────────────────────────────
  if (screenMode === 'results') {
    const total = test.questions.length;
    const pct   = Math.round((score / total) * 100);
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <View style={styles.resultsWrap}>
          <View style={[styles.resultsCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.scoreCircle, { borderColor: ORANGE }]}>
              <Text style={styles.scoreNum}>{score}/{total}</Text>
              <Text style={[styles.scorePct, { color: colors.muted }]}>{pct}%</Text>
            </View>
            <Text style={[styles.resultsTitle, { color: colors.text }]}>
              {pct >= 80 ? 'Excellent! 🎉' : pct >= 60 ? 'Good job! 👍' : 'Keep practising 💪'}
            </Text>
            <Text style={[styles.resultsSub, { color: colors.muted }]}>You got {score} out of {total} correct</Text>
            {isGuest && showSaveCard && (
  <SaveProgressCard
    completedCount={completedCount}
    onSignUp={async () => {
      await markSavePromptSeen();
      setShowSaveCard(false);
      navigation.navigate('Auth');
    }}
    onDismiss={async () => {
      await markSavePromptSeen();
      setShowSaveCard(false);
    }}
  />
)}
            <View style={styles.resultsBtns}>
              <TouchableOpacity
                style={[styles.resultsBtn, { backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1.5 }]}
                onPress={() => setScreenMode('review')} activeOpacity={0.8}
              >
                <Feather name="eye" size={15} color={colors.text} />
                <Text style={[styles.resultsBtnText, { color: colors.text }]}>Review</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resultsBtn, { backgroundColor: ORANGE }]}
                onPress={() => navigation.navigate('Dashboard')} activeOpacity={0.8}
              >
                <Feather name="home" size={15} color="#fff" />
                <Text style={[styles.resultsBtnText, { color: '#fff' }]}>Go Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Review ────────────────────────────────────────────────────────────────
  if (screenMode === 'review') return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setScreenMode('results')} style={styles.headerBtn}>
          <Feather name="arrow-left" size={16} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Review</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView contentContainerStyle={styles.testScroll} showsVerticalScrollIndicator={false}>
        {test.questions.map((q, i) => {
          const correctIds = q.options.filter(o => o.is_correct).map(o => o.id);
          const userIds: number[] = isMultiple
            ? (answers[q.id] ?? [])
            : answers[q.id] != null ? [answers[q.id]] : [];
          const isCorrect = isMultiple
            ? correctIds.length === userIds.length && correctIds.every(id => userIds.includes(id))
            : correctIds.includes(answers[q.id]);

          return (
            <View key={q.id} style={[styles.reviewCard, { backgroundColor: colors.surface, borderLeftColor: isCorrect ? GREEN : ORANGE }]}>
              <View style={styles.reviewCardTop}>
                <Text style={[styles.reviewQNum, { color: ORANGE }]}>{i + 1}</Text>
                <Text style={[styles.reviewQBody, { color: colors.text }]}>{q.body}</Text>
                <TouchableOpacity onPress={() => setModalQ(q)} style={[styles.bulbBtn, { backgroundColor: isDark ? '#2a2210' : '#fffbe6' }]}>
                  <Text style={{ fontSize: 14 }}>💡</Text>
                </TouchableOpacity>
              </View>
              {q.options.map(opt => {
                const userPicked  = userIds.includes(opt.id);
                const isRight     = opt.is_correct;
                let bgColor       = 'transparent';
                let borderColor   = colors.border;
                let textColor     = colors.text;
                if (isRight)               { bgColor = isDark ? '#1a2a1a' : '#eaf5ee'; borderColor = GREEN;  textColor = GREEN;  }
                else if (userPicked && !isRight) { bgColor = isDark ? '#2a1212' : '#fef2f2'; borderColor = ORANGE; textColor = ORANGE; }
                return (
                  <View key={opt.id} style={[styles.reviewOption, { backgroundColor: bgColor, borderColor }]}>
                    <View style={[styles.optionLabel, { backgroundColor: borderColor }]}>
                      <Text style={[styles.optionLabelText, { color: '#fff' }]}>{opt.label}</Text>
                    </View>
                    <Text style={[styles.optionBody, { color: textColor, flex: 1 }]}>{opt.body}</Text>
                    {isRight    && <Feather name="check-circle" size={15} color={GREEN}  />}
                    {userPicked && !isRight && <Feather name="x-circle" size={15} color={ORANGE} />}
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
      <Modal visible={!!modalQ} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalQ(null)}>
          <View style={[styles.modalCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>📖 Answer location</Text>
            <HighlightedText text={modalQ?.answer_location ?? ''} highlight={modalQ?.correct_answer ?? ''} textStyle={[styles.modalPassage, { color: colors.muted }]} />
            <TouchableOpacity style={[styles.modalClose, { backgroundColor: ORANGE }]} onPress={() => setModalQ(null)}>
              <Text style={styles.modalCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );

  // ── Test mode ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={16} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{testTitle}</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView
        contentContainerStyle={styles.testScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        {renderPassage()}

        <View style={[styles.instructionsBox, { backgroundColor: isDark ? '#2a1a12' : '#fff8f6', borderColor: ORANGE }]}>
          <Text style={[styles.instructionText, { color: colors.text }]}>
            {isMultiple
              ? 'Choose TWO correct answers for each question.'
              : 'Choose the correct answer, A, B, C or D.'}
          </Text>
        </View>

        {test.questions.map((q, i) => (
          <View key={q.id} style={[styles.questionCard, { backgroundColor: colors.surface }]}>
            <View style={styles.questionTop}>
              <Text style={[styles.questionNum, { color: ORANGE }]}>{i + 1}</Text>
              <Text style={[styles.questionBody, { color: colors.text }]}>{q.body}</Text>
            </View>
            {q.options.map(opt => {
              const selected = isSelected(q.id, opt.id);
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.optionRow,
                    {
                      backgroundColor: selected ? (isDark ? '#2a1a12' : '#fff0eb') : colors.bg,
                      borderColor:     selected ? ORANGE : colors.border,
                    },
                  ]}
                  onPress={() => toggleAnswer(q.id, opt.id)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.optionLabel, { backgroundColor: selected ? ORANGE : colors.surface }]}>
                    <Text style={[styles.optionLabelText, { color: selected ? '#fff' : colors.muted }]}>{opt.label}</Text>
                  </View>
                  <Text style={[styles.optionBody, { color: colors.text, flex: 1 }]}>{opt.body}</Text>
                  {isMultiple && (
                    <View style={[styles.checkbox, { borderColor: selected ? ORANGE : colors.border, backgroundColor: selected ? ORANGE : 'transparent' }]}>
                      {selected && <Feather name="check" size={11} color="#fff" />}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
          <Text style={styles.submitText}>Submit</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:               { flex: 1 },
  center:             { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText:        { fontSize: 13, fontWeight: '600' },
  errorText:          { fontSize: 16, fontWeight: '800' },
  retryBtn:           { backgroundColor: ORANGE, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryText:          { color: '#fff', fontWeight: '700', fontSize: 13 },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerBtn:          { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle:        { fontSize: 16, fontWeight: '800' },
  testScroll:         { padding: 16, paddingBottom: 60 },
  passageCard:        { borderRadius: 14, padding: 16, marginBottom: 14 },
  passageHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  passageLabel:       { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  passageHintRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  passageHint:        { fontSize: 10, fontWeight: '600', fontStyle: 'italic' },
  cancelSelBtn:       { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  cancelSelText:      { fontSize: 10, fontWeight: '600' },
  passageWords:       { flexDirection: 'row', flexWrap: 'wrap' },
  passageWord:        { fontSize: 13.5, lineHeight: 24 },
  clearBtn:           { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-end' },
  clearBtnText:       { fontSize: 11, fontWeight: '600' },
  instructionsBox:    { borderRadius: 10, borderWidth: 1.5, padding: 12, marginBottom: 14 },
  instructionText:    { fontSize: 12.5, lineHeight: 20 },
  questionCard:       { borderRadius: 14, padding: 14, marginBottom: 10 },
  questionTop:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  questionNum:        { fontSize: 15, fontWeight: '800', flexShrink: 0, marginTop: 1 },
  questionBody:       { flex: 1, fontSize: 13.5, lineHeight: 21 },
  optionRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 10, padding: 10, marginBottom: 8 },
  optionLabel:        { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optionLabelText:    { fontSize: 12, fontWeight: '800' },
  optionBody:         { fontSize: 13, lineHeight: 19 },
  checkbox:           { width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  submitBtn:          { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  submitText:         { color: '#fff', fontSize: 15, fontWeight: '800' },
  resultsWrap:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  resultsCard:        { width: '100%', borderRadius: 20, padding: 28, alignItems: 'center', gap: 8 },
  scoreCircle:        { width: 100, height: 100, borderRadius: 50, borderWidth: 4, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  scoreNum:           { fontSize: 26, fontWeight: '800', color: ORANGE },
  scorePct:           { fontSize: 12, fontWeight: '600' },
  resultsTitle:       { fontSize: 22, fontWeight: '800', marginTop: 4 },
  resultsSub:         { fontSize: 13, marginBottom: 8 },
  resultsBtns:        { flexDirection: 'row', gap: 10, marginTop: 8, width: '100%' },
  resultsBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12 },
  resultsBtnText:     { fontSize: 14, fontWeight: '800' },
  reviewCard:         { borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 4 },
  reviewCardTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  reviewQNum:         { fontSize: 14, fontWeight: '800', flexShrink: 0 },
  reviewQBody:        { flex: 1, fontSize: 13.5, lineHeight: 20 },
  bulbBtn:            { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reviewOption:       { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, padding: 9, marginBottom: 6 },
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard:          { width: '100%', borderRadius: 18, padding: 22, borderWidth: 1, gap: 12 },
  modalTitle:         { fontSize: 15, fontWeight: '800' },
  modalPassage:       { fontSize: 14, lineHeight: 24 },
  modalClose:         { borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  modalCloseText:     { color: '#fff', fontWeight: '800', fontSize: 14 },
});