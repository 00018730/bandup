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

interface Question {
  id: number;
  body: string;
  correct_answer: string;
  answer_location: string;
  sort_order: number;
}
interface Test {
  id: number;
  title: string;
  passage: string;
  form_title: string;
  questions: Question[];
}
type Mode = 'test' | 'results' | 'review';

// ─── Paragraph label helper ───────────────────────────────────────────────────
const LABELS = ['A','B','C','D','E','F','G','H','I','J'];

function getParagraphs(passage: string) {
  return passage.split('\n').filter(p => p.trim().length > 0);
}

// ─── Highlight text helper ────────────────────────────────────────────────────
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

// ─── Paragraph picker bottom sheet ───────────────────────────────────────────
function ParagraphPicker({
  visible,
  paragraphs,
  selected,
  onSelect,
  onClose,
  colors,
  isDark,
}: {
  visible: boolean;
  paragraphs: string[];
  selected: string | null;
  onSelect: (label: string) => void;
  onClose: () => void;
  colors: any;
  isDark: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Select paragraph</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {paragraphs.map((para, i) => {
              const label      = LABELS[i];
              const isSelected = selected === label;
              return (
                <TouchableOpacity
                  key={label}
                  style={[
                    styles.sheetItem,
                    { borderBottomColor: colors.border },
                    isSelected && { backgroundColor: isDark ? '#2a1a12' : '#fff0eb' },
                  ]}
                  onPress={() => { onSelect(label); onClose(); }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.sheetLabel, { backgroundColor: isSelected ? ORANGE : colors.surface }]}>
                    <Text style={[styles.sheetLabelText, { color: isSelected ? '#fff' : colors.muted }]}>
                      {label}
                    </Text>
                  </View>
                  <Text style={[styles.sheetParaText, { color: colors.text }]} numberOfLines={3}>
                    {para}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[styles.sheetCancel, { borderTopColor: colors.border }]}
            onPress={onClose}
          >
            <Text style={[styles.sheetCancelText, { color: colors.muted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default function MatchingParaScreen({ route, navigation }: any) {
  const { testId, testTitle } = route?.params ?? {};
  const isDark  = useColorScheme() === 'dark';
  const colors  = isDark ? dark : light;

  const [test, setTest]         = useState<Test | null>(null);
  const [loading, setLoading]   = useState(true);
  const [answers, setAnswers]   = useState<Record<number, string | null>>({});
  const [mode, setMode]         = useState<Mode>('test');
  const [score, setScore]       = useState(0);
  const [modalQ, setModalQ]     = useState<Question | null>(null);
  const [pickerQ, setPickerQ]   = useState<Question | null>(null);

  const [isGuest, setIsGuest]           = useState(true);
const [showSaveCard, setShowSaveCard] = useState(false);
const [completedCount, setCompletedCount] = useState(0);

  // Highlight state
  const [highlights, setHighlights]   = useState<[number, number][]>([]);
  const [selectStart, setSelectStart] = useState<number | null>(null);

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
      .select(`id, title, passage, form_title,
        questions(id, body, correct_answer, answer_location, sort_order)`)
      .eq('id', testId)
      .single();
    if (!error && data) {
      setTest({
        ...data,
        questions: [...(data.questions ?? [])].sort(
          (a: Question, b: Question) => a.sort_order - b.sort_order
        ),
      } as Test);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
  if (!test) return;
  let correct = 0;
  test.questions.forEach(q => {
    if ((answers[q.id] ?? '') === q.correct_answer) correct++;
  });
  setScore(correct);
  setMode('results');

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
      const start = Math.min(selectStart, index);
      const end   = Math.max(selectStart, index);
      setHighlights(prev => [...prev, [start, end]]);
      setSelectStart(null);
    }
  };

  const isWordHighlighted = (i: number) => highlights.some(([s, e]) => i >= s && i <= e);
  const isWordPending     = (i: number) => selectStart !== null && i === selectStart;

  // ── Passage renderer with paragraph labels ────────────────────────────────
  const renderPassage = () => {
    if (!test) return null;
    const paragraphs = getParagraphs(test.passage);
    const selecting  = selectStart !== null;
    let wordIndex    = 0;

    return (
      <View style={[styles.passageCard, { backgroundColor: colors.surface }]}>
        <View style={styles.passageHeader}>
          <Text style={[styles.passageLabel, { color: ORANGE }]}>PASSAGE</Text>
          <View style={styles.passageHintRow}>
            {selecting && (
              <TouchableOpacity
                onPress={() => setSelectStart(null)}
                style={[styles.cancelSelBtn, { borderColor: colors.border }]}
              >
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
          const label = LABELS[pi] ?? String(pi + 1);
          const words = para.split(' ').filter(w => w.length > 0);
          return (
            <View key={pi} style={styles.paragraphRow}>
              {/* Paragraph label */}
              <View style={[styles.paraLabelBadge, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb' }]}>
                <Text style={[styles.paraLabelText, { color: ORANGE }]}>{label}</Text>
              </View>

              {/* Words */}
              <View style={[styles.passageWords, { marginBottom: 10 }]}>
                {words.map(word => {
                  const i = wordIndex++;
                  return (
                    <TouchableOpacity key={i} onPress={() => handleWordTap(i)} activeOpacity={0.7}>
                      <Text style={[
                        styles.passageWord,
                        { color: colors.text },
                        isWordHighlighted(i) && { backgroundColor: '#fff0eb', color: ORANGE, fontWeight: '700', borderRadius: 3 },
                        isWordPending(i)     && { backgroundColor: '#ffd9cc', color: ORANGE, borderRadius: 3 },
                      ]}>
                        {word}{' '}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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

  const paragraphs = getParagraphs(test.passage);

  // ── Results ───────────────────────────────────────────────────────────────
  if (mode === 'results') {
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
            <Text style={[styles.resultsSub, { color: colors.muted }]}>
              You got {score} out of {total} correct
            </Text>
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
                onPress={() => setMode('review')} activeOpacity={0.8}
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
  if (mode === 'review') return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setMode('results')} style={styles.headerBtn}>
          <Feather name="arrow-left" size={16} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Review</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.testScroll} showsVerticalScrollIndicator={false}>
        {test.questions.map((q, i) => {
          const userAns   = answers[q.id] ?? null;
          const isCorrect = userAns === q.correct_answer;
          return (
            <View key={q.id} style={[
              styles.reviewCard,
              { backgroundColor: colors.surface, borderLeftColor: isCorrect ? GREEN : ORANGE },
            ]}>
              <View style={styles.reviewCardTop}>
                <Text style={[styles.reviewQNum, { color: ORANGE }]}>{i + 1}</Text>
                <Text style={[styles.reviewQBody, { color: colors.text }]}>{q.body}</Text>
                <TouchableOpacity
                  onPress={() => setModalQ(q)}
                  style={[styles.bulbBtn, { backgroundColor: isDark ? '#2a2210' : '#fffbe6' }]}
                >
                  <Text>💡</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.reviewAnswerRow}>
                <View style={styles.reviewAnswerItem}>
                  <Text style={[styles.reviewAnswerLabel, { color: colors.muted }]}>Your answer</Text>
                  <View style={[styles.paraLabelBadge, {
                    backgroundColor: isCorrect
                      ? (isDark ? '#1a2a1a' : '#eaf5ee')
                      : (isDark ? '#2a1212' : '#fef2f2'),
                  }]}>
                    <Text style={[styles.paraLabelText, { color: isCorrect ? GREEN : ORANGE }]}>
                      {userAns ?? '—'}
                    </Text>
                  </View>
                </View>
                {!isCorrect && (
                  <View style={styles.reviewAnswerItem}>
                    <Text style={[styles.reviewAnswerLabel, { color: colors.muted }]}>Correct</Text>
                    <View style={[styles.paraLabelBadge, { backgroundColor: isDark ? '#1a2a1a' : '#eaf5ee' }]}>
                      <Text style={[styles.paraLabelText, { color: GREEN }]}>{q.correct_answer}</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* 💡 Modal */}
      <Modal visible={!!modalQ} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalQ(null)}>
          <View style={[styles.modalCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>📖 Answer location</Text>
            <HighlightedText
              text={modalQ?.answer_location ?? ''}
              highlight={modalQ?.correct_answer ?? ''}
              textStyle={[styles.modalPassage, { color: colors.muted }]}
            />
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
        {/* Passage with labeled paragraphs */}
        {renderPassage()}

        {/* Instructions */}
        <View style={[styles.instructionsBox, {
          backgroundColor: isDark ? '#2a1a12' : '#fff8f6', borderColor: ORANGE,
        }]}>
          <Text style={[styles.instructionText, { color: colors.text }]}>
            Reading Passage has several paragraphs labelled <Text style={{ color: ORANGE, fontWeight: '800' }}>A–{LABELS[paragraphs.length - 1]}</Text>.{'\n'}
            Which paragraph contains the following information?{'\n'}
            Tap each question to select a paragraph.
          </Text>
        </View>

        {/* Questions with dropdown */}
        {test.questions.map((q, i) => {
          const selected = answers[q.id] ?? null;
          return (
            <View key={q.id} style={[styles.questionCard, { backgroundColor: colors.surface }]}>
              <View style={styles.questionTop}>
                <Text style={[styles.questionNum, { color: ORANGE }]}>{i + 1}</Text>
                <Text style={[styles.questionBody, { color: colors.text }]}>{q.body}</Text>
              </View>

              {/* Dropdown trigger */}
              <TouchableOpacity
                style={[styles.dropdown, {
                  borderColor: selected ? ORANGE : colors.border,
                  backgroundColor: selected ? (isDark ? '#2a1a12' : '#fff0eb') : colors.bg,
                }]}
                onPress={() => setPickerQ(q)}
                activeOpacity={0.8}
              >
                <Text style={[styles.dropdownText, { color: selected ? ORANGE : colors.muted }]}>
                  {selected ? `Paragraph ${selected}` : 'Select paragraph...'}
                </Text>
                <Feather name="chevron-down" size={16} color={selected ? ORANGE : colors.muted} />
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Submit */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
          <Text style={styles.submitText}>Submit</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Paragraph picker bottom sheet */}
      <ParagraphPicker
        visible={!!pickerQ}
        paragraphs={paragraphs}
        selected={pickerQ ? (answers[pickerQ.id] ?? null) : null}
        onSelect={label => {
          if (pickerQ) setAnswers(prev => ({ ...prev, [pickerQ.id]: label }));
        }}
        onClose={() => setPickerQ(null)}
        colors={colors}
        isDark={isDark}
      />
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
  passageHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  passageLabel:       { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  passageHintRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  passageHint:        { fontSize: 10, fontWeight: '600', fontStyle: 'italic' },
  cancelSelBtn:       { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  cancelSelText:      { fontSize: 10, fontWeight: '600' },

  paragraphRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  paraLabelBadge:     { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  paraLabelText:      { fontSize: 13, fontWeight: '800' },
  passageWords:       { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  passageWord:        { fontSize: 13.5, lineHeight: 24 },
  clearBtn:           { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-end' },
  clearBtnText:       { fontSize: 11, fontWeight: '600' },

  instructionsBox:    { borderRadius: 10, borderWidth: 1.5, padding: 12, marginBottom: 14 },
  instructionText:    { fontSize: 12.5, lineHeight: 20 },

  questionCard:       { borderRadius: 14, padding: 14, marginBottom: 10 },
  questionTop:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  questionNum:        { fontSize: 15, fontWeight: '800', flexShrink: 0, marginTop: 1 },
  questionBody:       { flex: 1, fontSize: 13.5, lineHeight: 21 },
  dropdown:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  dropdownText:       { fontSize: 13.5, fontWeight: '600' },

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
  reviewAnswerRow:    { flexDirection: 'row', gap: 24, alignItems: 'center' },
  reviewAnswerItem:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewAnswerLabel:  { fontSize: 11, fontWeight: '600' },

  // Bottom sheet
  sheetOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:              { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, paddingTop: 12, maxHeight: '75%' },
  sheetHandle:        { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetTitle:         { fontSize: 15, fontWeight: '800', paddingHorizontal: 20, marginBottom: 10 },
  sheetItem:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  sheetLabel:         { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sheetLabelText:     { fontSize: 14, fontWeight: '800' },
  sheetParaText:      { flex: 1, fontSize: 12.5, lineHeight: 18 },
  sheetCancel:        { borderTopWidth: 1, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  sheetCancelText:    { fontSize: 14, fontWeight: '600' },

  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard:          { width: '100%', borderRadius: 18, padding: 22, borderWidth: 1, gap: 12 },
  modalTitle:         { fontSize: 15, fontWeight: '800' },
  modalPassage:       { fontSize: 14, lineHeight: 24 },
  modalClose:         { borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  modalCloseText:     { color: '#fff', fontWeight: '800', fontSize: 14 },
});