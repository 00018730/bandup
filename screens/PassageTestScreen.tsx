// ─── Imports FIRST ────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput,
  KeyboardAvoidingView, Platform, useColorScheme,
  Alert, Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { saveLocalResult } from '../utils/storage';

// ─── Constants ────────────────────────────────────────────────────────────────
const ORANGE    = '#e85c2f';
const NAVY      = '#1a2744';
const NAVY_DARK = '#0d1a2e';

const light = {
  bg: '#ffffff', text: NAVY, muted: '#6b7280',
  border: '#e5e7eb', instrBg: 'rgba(232,92,47,0.07)',
  inputBg: 'transparent', card: '#ffffff',
};
const dark = {
  bg: '#152035', text: '#eef0f4', muted: '#8a919e',
  border: '#1e3050', instrBg: 'rgba(232,92,47,0.12)',
  inputBg: 'transparent', card: '#152035',
};

// ─── Type helpers ─────────────────────────────────────────────────────────────
const isTFNG       = (l: string) => l === 'Identifying Information' || l === 'Yes / No / Not Given';
const isCompletion = (l: string) => [
  'Note Completion', 'Summary Completion', 'Sentence Completion',
  'Flow-Chart Completion', 'Table Completion', 'Diagram Label Completion',
  'Short Answer Question',
].includes(l);
const isMC        = (l: string) => l === 'Multiple Choice 1' || l === 'Multiple Choice 2';
const isMatchPara = (l: string) => l === 'Matching Paragraph Info';
const isMatchHead = (l: string) => l === 'Matching Headings';
const isMatchFeat = (l: string) => l === 'Matching Features';

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const ColoredInstructions = ({ text, style }: { text: string; style: any }) => {
  const KW    = ['NOT GIVEN', 'TRUE', 'FALSE', 'YES', 'NO'];
  const parts = text.split(/(NOT GIVEN|TRUE|FALSE|YES|NO)/g);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        KW.includes(p)
          ? <Text key={i} style={{ color: ORANGE, fontWeight: '900' }}>{p}</Text>
          : p
      )}
    </Text>
  );
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Group {
  id: number; sort_order: number; title: string | null;
  instructions: string | null; type_label: string;
  question_type_id: number; extra_data: Record<string, unknown> | null;
}
interface Question {
  id: number; group_id: number; sort_order: number; body: string;
  correct_answer: string; answer_location: string;
  prefix: string; suffix: string; section_heading: string; is_static: boolean;
}
interface MCOption {
  id: number; question_id: number; label: string;
  text: string; is_correct: boolean;
}

// ─── CompletionQuestion ───────────────────────────────────────────────────────
// Renders the whole sentence in ONE <Text> so prefix, blank and suffix flow as
// a single continuous line that wraps naturally. The input is a real <TextInput>
// placed in normal text flow. Each question reports its Y via onLayout so we can
// scroll it above the keyboard on focus (no measureLayout — that crashes Fabric).
function CompletionQuestion({
  q, num, ans, next, inputRefs, setAnswer, C, scrollRef, layoutMap,
}: any) {
  return (
    <View
      style={{ marginBottom: 18 }}
      onLayout={e => {
        layoutMap.current[q.id] = e.nativeEvent.layout.y;
      }}
    >
      <Text style={[CQ.text, { color: C.text }]}>
        <Text style={{ color: ORANGE, fontWeight: '900' }}>{num}{'  '}</Text>
        {q.prefix ? q.prefix + ' ' : ''}
        <TextInput
          ref={(r: TextInput | null) => { inputRefs.current[q.id] = r; }}
          style={[CQ.input, {
            color: C.text,
            borderBottomColor: ans ? ORANGE : C.border,
          }]}
          value={ans}
          onChangeText={(v: string) => setAnswer(q.id, v)}
          onFocus={() => {
            const y = layoutMap.current[q.id];
            if (y != null && scrollRef?.current) {
              setTimeout(() => {
                scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
              }, 250);
            }
          }}
          placeholder="·····"
          placeholderTextColor={C.muted}
          returnKeyType={next ? 'next' : 'done'}
          onSubmitEditing={() => { if (next) inputRefs.current[next.id]?.focus(); }}
          autoCapitalize="none"
          autoCorrect={false}
          blurOnSubmit={!next}
        />
        {q.suffix ? ' ' + q.suffix : ''}
      </Text>
      {q.body && !q.prefix && !q.suffix ? (
        <Text style={[CQ.text, { color: C.text, marginTop: 4 }]}>{q.body}</Text>
      ) : null}
    </View>
  );
}
const CQ = StyleSheet.create({
  text:  { fontSize: 16, lineHeight: 36, fontWeight: '400' },
  input: {
    borderBottomWidth: 2,
    minWidth: 90,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 0,
  },
});

// ─── Settings modal ───────────────────────────────────────────────────────────
function SettingsModal({
  visible, onClose, isDark, onThemeChange,
}: {
  visible: boolean; onClose: () => void;
  isDark: boolean; onThemeChange: (v: 'light' | 'dark' | null) => void;
}) {
  const bg     = isDark ? '#1e2d45' : '#ffffff';
  const text   = isDark ? '#eef0f4' : NAVY;
  const border = isDark ? '#2a3f5f' : '#e5e7eb';
  const modes  = [
    { label: 'Light Mode',     icon: 'sun'        as const, value: 'light'  as any },
    { label: 'Dark Mode',      icon: 'moon'       as const, value: 'dark'   as any },
    { label: 'System Default', icon: 'smartphone' as const, value: null     as any },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={SS.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[SS.sheet, { backgroundColor: bg }]}
              onStartShouldSetResponder={() => true}>
          <View style={[SS.handle, { backgroundColor: border }]} />
          <Text style={[SS.title, { color: text }]}>Appearance</Text>
          {modes.map(m => (
            <TouchableOpacity key={String(m.value)}
              style={[SS.row, { borderBottomColor: border }]}
              onPress={() => { onThemeChange(m.value); onClose(); }}
              activeOpacity={0.75}>
              <View style={[SS.icon, { backgroundColor: isDark ? '#253548' : '#f5f5f7' }]}>
                <Feather name={m.icon} size={18} color={ORANGE} />
              </View>
              <Text style={[SS.rowLabel, { color: text }]}>{m.label}</Text>
              {((m.value === 'light' && !isDark) || (m.value === 'dark' && isDark)) && (
                <Feather name="check" size={18} color={ORANGE} />
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={SS.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={SS.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
const SS = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title:       { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  icon:        { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowLabel:    { flex: 1, fontSize: 15, fontWeight: '600' },
  doneBtn:     { marginTop: 20, backgroundColor: ORANGE, borderRadius: 24, paddingVertical: 14, alignItems: 'center' },
  doneBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function PassageTestScreen({ route, navigation }: any) {
  const { testId, testTitle, skill } = route.params;

  // ── Theme ──────────────────────────────────────────────────────────────────
  const systemDark = useColorScheme() === 'dark';
  const [themeOverride, setThemeOverride] = useState<'light' | 'dark' | null>(null);
  const isDark = themeOverride === 'dark' || (themeOverride === null && systemDark);
  const C      = isDark ? dark : light;

  // ── Data ───────────────────────────────────────────────────────────────────
  const [passage, setPassage]     = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [groups, setGroups]       = useState<Group[]>([]);
  const [questions, setQuestions] = useState<Record<number, Question[]>>({});
  const [options, setOptions]     = useState<Record<number, MCOption[]>>({});
  const [loading, setLoading]     = useState(true);

  // ── Test state ─────────────────────────────────────────────────────────────
  const [answers, setAnswers]       = useState<Record<number, string>>({});
  const [mode, setMode]             = useState<'test' | 'results' | 'review'>('test');
  const [timeLeft, setTimeLeft]     = useState(20 * 60);
  const [score, setScore]           = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [showSettings, setShow]     = useState(false);
  const timerRef                    = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittedRef                = useRef(false); // guards double-submit

  // ── View toggle: passage | questions ─────────────────────────────────────────
  const [view, setView] = useState<'passage' | 'questions'>('passage');

  // answersRef mirrors `answers` so evaluate() can read the latest values
  // WITHOUT being recreated on every keystroke (which would restart the timer).
  const answersRef = useRef<Record<number, string>>({});
  useEffect(() => { answersRef.current = answers; }, [answers]);

  const questionsScrollRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Record<number, TextInput | null>>({});
  // Each completion question's Y offset within the questions ScrollView, reported
  // via onLayout. Used to scroll the input above the keyboard on focus.
  const layoutMap = useRef<Record<number, number>>({});

  const completionQs = useMemo(() =>
    groups
      .filter(g => isCompletion(g.type_label))
      .flatMap(g => (questions[g.id] ?? []).filter(q => !q.is_static)),
    [groups, questions]
  );

  const nextCompletionQ = (id: number): Question | null => {
    const idx = completionQs.findIndex(q => q.id === id);
    return idx >= 0 && idx < completionQs.length - 1 ? completionQs[idx + 1] : null;
  };

  const paragraphs = useMemo(() =>
    passage
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .replace(/([^\n])\n([^\n])/g, '$1 $2')
      .replace(/\n{2,}/g, '||')
      .split('||').map(p => p.trim()).filter(Boolean),
    [passage]
  );

  const realQs = useMemo(
    () => groups.flatMap(g => (questions[g.id] ?? []).filter(q => !q.is_static)),
    [groups, questions]
  );

  // evaluate reads answersRef (not answers) so it stays stable across keystrokes.
  const evaluate = useCallback(async () => {
    if (submittedRef.current) return; // prevent double submit (timer + button)
    submittedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);

    const currentAnswers = answersRef.current;
    let correct = 0;
    realQs.forEach(q => {
      if ((currentAnswers[q.id] ?? '').trim().toLowerCase() === q.correct_answer.trim().toLowerCase())
        correct++;
    });
    setScore(correct);
    setMode('results');
    try {
      const { data: sd } = await supabase.auth.getSession();
      if (sd.session?.user) {
        await supabase.from('user_progress').upsert({
          user_id: sd.session.user.id, test_id: testId,
          score: correct, total: realQs.length,
          completed_at: new Date().toISOString(),
        }, { onConflict: 'user_id,test_id' });
      } else {
        await saveLocalResult({
          testId, testTitle: String(testTitle), skill: skill ?? '',
          type: 'passage', score: correct, total: realQs.length,
          completedAt: new Date().toISOString(),
        });
      }
    } catch (e) { console.error('save result', e); }
  }, [realQs, testId, testTitle, skill]);

  const doSubmit = useCallback((auto = false) => {
    if (submittedRef.current) return;
    const currentAnswers = answersRef.current;
    const answeredCount  = realQs.filter(q => (currentAnswers[q.id] ?? '').trim() !== '').length;
    const unanswered     = realQs.length - answeredCount;
    if (!auto && unanswered > 0) {
      Alert.alert('Submit?',
        `${unanswered} question${unanswered > 1 ? 's' : ''} unanswered. Submit anyway?`,
        [{ text: 'Cancel' }, { text: 'Submit', onPress: () => evaluate() }]);
      return;
    }
    evaluate();
  }, [realQs, evaluate]);

  useEffect(() => { loadData(); }, []);

  // Timer: starts once data is loaded, runs to 0, auto-submits.
  // Deps are [mode, loading] only — NOT answers — so typing never restarts it.
  useEffect(() => {
    if (mode !== 'test' || loading) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          doSubmit(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [mode, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadData = async () => {
    try {
      const { data: testData } = await supabase
        .from('tests').select('passage, form_title').eq('id', testId).maybeSingle();
      setPassage(testData?.passage ?? '');
      setFormTitle(testData?.form_title ?? '');

      const { data: qtData } = await supabase.from('question_types').select('id, label');
      const qtMap: Record<number, string> = {};
      (qtData ?? []).forEach((qt: any) => { qtMap[qt.id] = qt.label; });

      const { data: grpData } = await supabase
        .from('question_groups')
        .select('id, sort_order, title, instructions, question_type_id, extra_data')
        .eq('test_id', testId).order('sort_order');

      const grps: Group[] = (grpData ?? []).map((g: any) => ({
        ...g, type_label: qtMap[g.question_type_id] ?? '',
      }));
      setGroups(grps);
      if (!grps.length) { setLoading(false); return; }

      const { data: qData } = await supabase
        .from('questions').select('*')
        .in('group_id', grps.map(g => g.id)).order('sort_order');

      const qByGroup: Record<number, Question[]> = {};
      grps.forEach(g => { qByGroup[g.id] = []; });
      (qData ?? []).forEach((q: any) => {
        if (q.group_id != null)
          qByGroup[q.group_id] = [
            ...(qByGroup[q.group_id] ?? []),
            { ...q, is_static: q.is_static ?? false },
          ];
      });
      setQuestions(qByGroup);

      const mcIds = grps.filter(g => isMC(g.type_label)).map(g => g.id);
      if (mcIds.length) {
        const mcQIds = (qData ?? [])
          .filter((q: any) => q.group_id && mcIds.includes(q.group_id) && !q.is_static)
          .map((q: any) => q.id);
        if (mcQIds.length) {
          const { data: opts } = await supabase
            .from('options').select('*').in('question_id', mcQIds).order('label');
          const om: Record<number, MCOption[]> = {};
          (opts ?? []).forEach((o: MCOption) => {
            if (!om[o.question_id]) om[o.question_id] = [];
            om[o.question_id].push(o);
          });
          setOptions(om);
        }
      }
    } catch (e) { console.error('loadData', e); }
    finally { setLoading(false); }
  };

  const setAnswer = (id: number, val: string) =>
    setAnswers(p => ({ ...p, [id]: val }));

  const answered = useMemo(
    () => realQs.filter(q => (answers[q.id] ?? '').trim() !== '').length,
    [realQs, answers]
  );

  const getOffset = (gi: number) =>
    groups.slice(0, gi).reduce(
      (s, g) => s + (questions[g.id] ?? []).filter(q => !q.is_static).length, 0
    );

  const groupLabel = (gi: number, gQs: Question[]) => {
    if (groups[gi].title) return groups[gi].title!;
    const off = getOffset(gi);
    const cnt = gQs.filter(q => !q.is_static).length;
    return cnt <= 1 ? `Question ${off + 1}` : `Questions ${off + 1}–${off + cnt}`;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  RESULTS
  // ═══════════════════════════════════════════════════════════════════════════
  if (mode === 'results') {
    const pct  = realQs.length ? Math.round((score / realQs.length) * 100) : 0;
    const band = Math.min(9, (score / Math.max(realQs.length, 1)) * 9).toFixed(1);
    return (
      <SafeAreaView style={[S.safe, { backgroundColor: NAVY_DARK }]}>
        <View style={S.resWrap}>
          <View style={[S.resCard, { backgroundColor: NAVY }]}>
            <Text style={S.resTick}>🎉</Text>
            <Text style={S.resTitle}>Test Complete!</Text>
            <Text style={S.resBand}>{band}</Text>
            <Text style={S.resBandLbl}>Estimated Band Score</Text>
            <Text style={S.resScore}>{score}/{realQs.length} correct · {pct}%</Text>
            <View style={S.resPBg}>
              <View style={[S.resPFill, { width: `${pct}%` as any }]} />
            </View>
          </View>
          <TouchableOpacity style={S.reviewBtn} onPress={() => setMode('review')} activeOpacity={0.85}>
            <Text style={S.reviewBtnText}>Review Answers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[S.doneBtn, { borderColor: ORANGE }]}
            onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Text style={[S.doneBtnText, { color: ORANGE }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  REVIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (mode === 'review') {
    let n = 0;
    return (
      <SafeAreaView style={[S.safe, { backgroundColor: NAVY_DARK }]}>
        <View style={[S.revHdr, { backgroundColor: NAVY_DARK }]}>
          <TouchableOpacity onPress={() => setMode('results')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={22} color={ORANGE} />
          </TouchableOpacity>
          <Text style={S.revTitle}>Review Answers</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={{ color: ORANGE, fontWeight: '800', fontSize: 13 }}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ backgroundColor: isDark ? '#0d1a2e' : '#f5f5f7' }}
          contentContainerStyle={{ padding: 16, gap: 10 }}>
          {realQs.map(q => {
            n++;
            const ans     = answers[q.id] ?? '';
            const isRight = ans.trim().toLowerCase() === q.correct_answer.trim().toLowerCase();
            return (
              <View key={q.id} style={[S.revRow, {
                backgroundColor: C.card, borderColor: isRight ? '#22c55e' : '#ef4444',
              }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                  <View style={[S.qBadge, { backgroundColor: isRight ? '#22c55e' : '#ef4444' }]}>
                    <Text style={S.qBadgeTxt}>{n}</Text>
                  </View>
                  <Text style={[S.passageText, { color: C.text, flex: 1 }]}>
                    {q.prefix ? `${q.prefix} ___ ${q.suffix ?? ''}`.trim() : q.body}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 20, paddingLeft: 42 }}>
                  <View>
                    <Text style={S.revLbl}>Your answer</Text>
                    <Text style={[S.revAns, { color: isRight ? '#22c55e' : '#ef4444' }]}>
                      {ans || '(no answer)'}
                    </Text>
                  </View>
                  {!isRight && (
                    <View>
                      <Text style={S.revLbl}>Correct</Text>
                      <Text style={[S.revAns, { color: '#22c55e' }]}>{q.correct_answer}</Text>
                    </View>
                  )}
                </View>
                {!isRight && q.answer_location
                  ? <Text style={[S.revLoc, { color: C.muted }]}>📍 {q.answer_location}</Text>
                  : null}
              </View>
            );
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  QUESTION RENDERERS
  // ═══════════════════════════════════════════════════════════════════════════

  const SH = ({ q }: { q: Question }) =>
    q.section_heading
      ? <Text style={[S.secHead, { color: ORANGE }]}>{q.section_heading}</Text>
      : null;

  const renderTFNG = (group: Group, gQs: Question[], offset: number) => {
    const opts = group.type_label === 'Yes / No / Not Given'
      ? ['Yes', 'No', 'Not Given'] : ['True', 'False', 'Not Given'];
    let ri = 0;
    return (
      <>
        {gQs.map(q => {
          if (q.is_static) return (
            <View key={q.id}>
              <SH q={q} />
              <Text style={[S.passageText, { color: C.text }]}>{q.body}</Text>
            </View>
          );
          const num = offset + (++ri);
          const ans = answers[q.id];
          return (
            <View key={q.id} style={{ marginBottom: 22 }}>
              <SH q={q} />
              <View style={S.qRow}>
                <View style={S.qBadge}><Text style={S.qBadgeTxt}>{num}</Text></View>
                <Text style={[S.passageText, { color: C.text, flex: 1 }]}>{q.body}</Text>
              </View>
              <View style={{ gap: 12, marginTop: 14 }}>
                {opts.map(opt => {
                  const sel = ans === opt;
                  return (
                    <TouchableOpacity key={opt}
                      style={[S.optRow, {
                        backgroundColor: sel ? 'rgba(232,92,47,0.07)' : C.bg,
                        borderColor:     sel ? ORANGE : C.border,
                      }]}
                      onPress={() => setAnswer(q.id, opt)} activeOpacity={0.75}>
                      <View style={[S.optCircle, {
                        borderColor:     ORANGE,
                        backgroundColor: sel ? ORANGE : 'transparent',
                      }]}>
                        {sel && <View style={S.optDot} />}
                      </View>
                      <Text style={[S.optText, { color: sel ? ORANGE : C.text }]}>
                        {opt.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </>
    );
  };

  const renderCompletion = (_group: Group, gQs: Question[], offset: number) => {
    let ri = 0;
    return (
      <>
        {formTitle
          ? <Text style={[S.formTitle, { color: C.text }]}>{formTitle}</Text>
          : null}
        {gQs.map(q => {
          if (q.is_static) return (
            <View key={q.id}>
              <SH q={q} />
              <Text style={[S.passageText, { color: C.text }]}>{q.body}</Text>
            </View>
          );
          const num  = offset + (++ri);
          const ans  = answers[q.id] ?? '';
          const next = nextCompletionQ(q.id);
          return (
            <CompletionQuestion
              key={q.id}
              q={q}
              num={num}
              ans={ans}
              next={next}
              inputRefs={inputRefs}
              setAnswer={setAnswer}
              C={C}
              scrollRef={questionsScrollRef}
              layoutMap={layoutMap}
            />
          );
        })}
      </>
    );
  };

  const renderMatchPara = (_group: Group, gQs: Question[], offset: number) => {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    let ri = 0;
    return (
      <>
        {gQs.map(q => {
          if (q.is_static) return (
            <View key={q.id}><SH q={q} />
              <Text style={[S.passageText, { color: C.text }]}>{q.body}</Text>
            </View>
          );
          const num = offset + (++ri); const ans = answers[q.id];
          return (
            <View key={q.id} style={{ marginBottom: 16 }}>
              <SH q={q} />
              <View style={S.qRow}>
                <View style={S.qBadge}><Text style={S.qBadgeTxt}>{num}</Text></View>
                <Text style={[S.passageText, { color: C.text, flex: 1 }]}>{q.body}</Text>
              </View>
              <View style={[S.letterGrid, { marginTop: 10 }]}>
                {letters.map(l => (
                  <TouchableOpacity key={l}
                    style={[S.letterBtn, {
                      backgroundColor: ans === l ? ORANGE : (isDark ? '#1e3050' : '#f5f5f7'),
                      borderColor:     ans === l ? ORANGE : C.border,
                    }]}
                    onPress={() => setAnswer(q.id, l)} activeOpacity={0.75}>
                    <Text style={[S.letterTxt, { color: ans === l ? '#fff' : C.text }]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}
      </>
    );
  };

  const renderMatchHead = (group: Group, gQs: Question[], offset: number) => {
    const headings: string[] = (group.extra_data?.headings as string[]) ?? [];
    let ri = 0;
    return (
      <>
        {headings.length > 0 && (
          <View style={[S.bankBox, { backgroundColor: isDark ? '#1e3050' : '#f5f5f7', borderColor: C.border }]}>
            <Text style={[S.bankLbl, { color: C.muted }]}>List of Headings</Text>
            {headings.map((h, hi) => (
              <Text key={hi} style={[S.passageText, { color: C.text }]}>
                <Text style={{ color: ORANGE, fontWeight: '800' }}>{'i'.repeat(hi + 1)}.  </Text>{h}
              </Text>
            ))}
          </View>
        )}
        {gQs.map(q => {
          if (q.is_static) return (
            <View key={q.id}><SH q={q} />
              <Text style={[S.passageText, { color: C.text }]}>{q.body}</Text>
            </View>
          );
          const num = offset + (++ri); const ans = answers[q.id];
          return (
            <View key={q.id} style={{ marginBottom: 14 }}>
              <View style={S.qRow}>
                <View style={S.qBadge}><Text style={S.qBadgeTxt}>{num}</Text></View>
                <Text style={[S.passageText, { color: C.text }]}>Paragraph {q.body}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingLeft: 40, marginTop: 8 }}>
                {headings.map((_h, hi) => {
                  const roman = 'i'.repeat(hi + 1);
                  return (
                    <TouchableOpacity key={hi}
                      style={[S.headChip, {
                        backgroundColor: ans === roman ? ORANGE : (isDark ? '#1e3050' : '#fff'),
                        borderColor:     ans === roman ? ORANGE : C.border,
                      }]}
                      onPress={() => setAnswer(q.id, roman)} activeOpacity={0.75}>
                      <Text style={[S.headChipTxt, { color: ans === roman ? '#fff' : C.text }]} numberOfLines={2}>
                        {roman}. {_h}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          );
        })}
      </>
    );
  };

  const renderMatchFeat = (group: Group, gQs: Question[], offset: number) => {
    const features: string[] = (group.extra_data?.features as string[]) ?? [];
    let ri = 0;
    return (
      <>
        {features.length > 0 && (
          <View style={[S.bankBox, { backgroundColor: isDark ? '#1e3050' : '#f5f5f7', borderColor: C.border }]}>
            <Text style={[S.bankLbl, { color: C.muted }]}>Features</Text>
            {features.map((f, fi) => (
              <Text key={fi} style={[S.passageText, { color: C.text }]}>
                <Text style={{ color: ORANGE, fontWeight: '800' }}>{String.fromCharCode(65 + fi)}.  </Text>{f}
              </Text>
            ))}
          </View>
        )}
        {gQs.map(q => {
          if (q.is_static) return (
            <View key={q.id}><SH q={q} />
              <Text style={[S.passageText, { color: C.text }]}>{q.body}</Text>
            </View>
          );
          const num = offset + (++ri); const ans = answers[q.id];
          return (
            <View key={q.id} style={{ marginBottom: 16 }}>
              <SH q={q} />
              <View style={S.qRow}>
                <View style={S.qBadge}><Text style={S.qBadgeTxt}>{num}</Text></View>
                <Text style={[S.passageText, { color: C.text, flex: 1 }]}>{q.body}</Text>
              </View>
              <View style={[S.letterGrid, { marginTop: 10 }]}>
                {features.map((_, fi) => {
                  const letter = String.fromCharCode(65 + fi);
                  return (
                    <TouchableOpacity key={fi}
                      style={[S.letterBtn, {
                        backgroundColor: ans === letter ? ORANGE : (isDark ? '#1e3050' : '#f5f5f7'),
                        borderColor:     ans === letter ? ORANGE : C.border,
                      }]}
                      onPress={() => setAnswer(q.id, letter)} activeOpacity={0.75}>
                      <Text style={[S.letterTxt, { color: ans === letter ? '#fff' : C.text }]}>{letter}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </>
    );
  };

  const renderMC = (_group: Group, gQs: Question[], offset: number) => {
    let ri = 0;
    return (
      <>
        {gQs.map(q => {
          if (q.is_static) return (
            <View key={q.id}><SH q={q} />
              <Text style={[S.passageText, { color: C.text }]}>{q.body}</Text>
            </View>
          );
          const num  = offset + (++ri);
          const ans  = answers[q.id];
          const opts = options[q.id] ?? [];
          return (
            <View key={q.id} style={{ marginBottom: 22 }}>
              <SH q={q} />
              <View style={S.qRow}>
                <View style={S.qBadge}><Text style={S.qBadgeTxt}>{num}</Text></View>
                <Text style={[S.passageText, { color: C.text, flex: 1 }]}>{q.body}</Text>
              </View>
              <View style={{ gap: 12, marginTop: 14 }}>
                {opts.map(opt => {
                  const sel = ans === opt.label;
                  return (
                    <TouchableOpacity key={opt.id}
                      style={[S.optRow, {
                        backgroundColor: sel ? 'rgba(232,92,47,0.07)' : C.bg,
                        borderColor:     sel ? ORANGE : C.border,
                      }]}
                      onPress={() => setAnswer(q.id, opt.label)} activeOpacity={0.75}>
                      <View style={[S.mcLetter, {
                        backgroundColor: sel ? ORANGE : 'transparent',
                        borderColor:     ORANGE,
                      }]}>
                        <Text style={[S.mcLetterTxt, { color: sel ? '#fff' : ORANGE }]}>{opt.label}</Text>
                      </View>
                      <Text style={[S.optText, { color: sel ? ORANGE : C.text }]}>{opt.text}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </>
    );
  };

  const renderGroup = (group: Group, gi: number) => {
    const gQs       = questions[group.id] ?? [];
    const offset    = getOffset(gi);
    const typeLabel = group.type_label;
    const known =
      isTFNG(typeLabel) || isCompletion(typeLabel) || isMatchPara(typeLabel) ||
      isMatchHead(typeLabel) || isMatchFeat(typeLabel) || isMC(typeLabel);
    return (
      <View key={group.id} style={{ marginBottom: 28 }}>
        <View style={S.grpHdr}>
          <View style={S.grpIcon}><Feather name="file-text" size={16} color="#fff" /></View>
          <Text style={[S.grpLabel, { color: C.text }]}>{groupLabel(gi, gQs)}</Text>
        </View>
        {group.instructions ? (
          <View style={[S.instrBox, { backgroundColor: C.instrBg }]}>
            <ColoredInstructions text={group.instructions}
              style={[S.instrText, { color: C.text }]} />
          </View>
        ) : null}
        <View style={{ marginTop: 16 }}>
          {isTFNG(typeLabel)       && renderTFNG(group, gQs, offset)}
          {isCompletion(typeLabel) && renderCompletion(group, gQs, offset)}
          {isMatchPara(typeLabel)  && renderMatchPara(group, gQs, offset)}
          {isMatchHead(typeLabel)  && renderMatchHead(group, gQs, offset)}
          {isMatchFeat(typeLabel)  && renderMatchFeat(group, gQs, offset)}
          {isMC(typeLabel)         && renderMC(group, gQs, offset)}
          {!known && (
            <Text style={{ color: C.muted, fontSize: 13, fontStyle: 'italic' }}>
              This question type isn't supported yet ({typeLabel || 'unknown'}).
            </Text>
          )}
        </View>
      </View>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  TEST RENDER — two full-screen views toggled by a floating segmented pill
  // ═══════════════════════════════════════════════════════════════════════════
  const timerColor = timeLeft < 300 ? '#ef4444' : timeLeft < 600 ? '#f59e0b' : ORANGE;
  const showingPassage = view === 'passage';

  return (
    <SafeAreaView style={[S.safe, { backgroundColor: NAVY_DARK }]}>
      <View style={S.backRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="chevron-left" size={26} color={ORANGE} />
        </TouchableOpacity>
      </View>

      <View style={S.headerRow}>
        <View style={[S.timerPill, { borderColor: timerColor }]}>
          <Feather name="clock" size={15} color={timerColor} />
          <Text style={[S.timerText, { color: timerColor }]}>{fmt(timeLeft)}</Text>
        </View>
        <Text style={S.headerTitle} numberOfLines={2}>{testTitle}</Text>
        <TouchableOpacity style={S.iconBtn} onPress={() => setShow(true)} activeOpacity={0.8}>
          <Feather name="settings" size={18} color={ORANGE} />
        </TouchableOpacity>
        <TouchableOpacity style={S.iconBtn} onPress={() => setBookmarked(b => !b)} activeOpacity={0.8}>
          <Feather name="bookmark" size={18} color={bookmarked ? ORANGE : ORANGE} />
        </TouchableOpacity>
      </View>

      <View style={[S.card, { backgroundColor: C.bg }]}>

        {/* ── PASSAGE VIEW (stays mounted; hidden when on questions so scroll
               position is preserved) ──────────────────────────────────────── */}
        <View
          style={[S.fill, !showingPassage && S.hidden]}
          pointerEvents={showingPassage ? 'auto' : 'none'}
        >
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 90 }}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <Text style={{ color: C.muted, fontSize: 14 }}>Loading passage…</Text>
            ) : (
              paragraphs.map((p, pi) => (
                <Text key={pi} style={[S.passageText, { color: C.text }]}>{p}</Text>
              ))
            )}
          </ScrollView>
        </View>

        {/* ── QUESTIONS VIEW (stays mounted; hidden when on passage so answers
               and scroll position persist) ────────────────────────────────── */}
        <View
          style={[S.fill, showingPassage && S.hidden]}
          pointerEvents={showingPassage ? 'none' : 'auto'}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              ref={questionsScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 180 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            >
              {loading ? (
                <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center', marginTop: 20 }}>
                  Loading questions…
                </Text>
              ) : groups.length === 0 ? (
                <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center', marginTop: 20 }}>
                  No question groups found for this test.
                </Text>
              ) : (
                groups.map((g, gi) => renderGroup(g, gi))
              )}
            </ScrollView>

            <View style={[S.submitBar, { borderTopColor: C.border, backgroundColor: C.bg }]}>
              <Text style={[S.submitCount, { color: C.muted }]}>
                {answered}/{realQs.length} answered
              </Text>
              <TouchableOpacity style={S.submitBtn} onPress={() => doSubmit(false)} activeOpacity={0.85}>
                <Text style={S.submitBtnText}>Submit</Text>
                <Feather name="check" size={15} color="#fff" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>

        {/* ── Floating segmented toggle: [ Passage | Questions ] ───────────────
               box-none so taps pass through the wrapper but hit the buttons. */}
        <View style={S.toggleWrap} pointerEvents="box-none">
          <View style={[S.toggle, { backgroundColor: isDark ? '#0d1a2e' : '#ffffff', borderColor: C.border }]}>
            <TouchableOpacity
              style={[S.toggleSeg, showingPassage && S.toggleSegActive]}
              onPress={() => setView('passage')}
              activeOpacity={0.85}
            >
              <Feather name="book-open" size={15} color={showingPassage ? '#fff' : C.muted} />
              <Text style={[S.toggleTxt, { color: showingPassage ? '#fff' : C.muted }]}>Passage</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.toggleSeg, !showingPassage && S.toggleSegActive]}
              onPress={() => setView('questions')}
              activeOpacity={0.85}
            >
              <Feather name="edit-3" size={15} color={!showingPassage ? '#fff' : C.muted} />
              <Text style={[S.toggleTxt, { color: !showingPassage ? '#fff' : C.muted }]}>Questions</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <SettingsModal
        visible={showSettings}
        onClose={() => setShow(false)}
        isDark={isDark}
        onThemeChange={setThemeOverride}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  safe:        { flex: 1 },
  backRow:     { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  timerPill:   { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 24, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 0 },
  timerText:   { fontSize: 18, fontWeight: '800' },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#fff', lineHeight: 21 },
  iconBtn:     { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  card:        { flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },

  // View container fill + hide. Keeping both views mounted (just hidden)
  // preserves scroll position AND typed answers when switching.
  fill:        { ...StyleSheet.absoluteFillObject },
  hidden:      { opacity: 0, zIndex: -1 },

  // Floating segmented toggle
  toggleWrap:  { position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center' },
  toggle:      { flexDirection: 'row', borderRadius: 26, borderWidth: 1, padding: 4, gap: 4,
                 shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  toggleSeg:   { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 22 },
  toggleSegActive: { backgroundColor: ORANGE },
  toggleTxt:   { fontSize: 14, fontWeight: '800' },

  passageText: { fontSize: 16, lineHeight: 26, marginBottom: 10, fontWeight: '400' },

  qRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  qBadge:      { width: 32, height: 32, borderRadius: 16, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  qBadgeTxt:   { color: '#fff', fontWeight: '900', fontSize: 13 },

  secHead:     { fontSize: 16, fontWeight: '900', marginTop: 8, marginBottom: 6, color: ORANGE },
  formTitle:   { fontSize: 16, fontWeight: '800', textAlign: 'center', marginBottom: 14 },

  optRow:      { flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16 },
  optCircle:   { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  optDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  optText:     { fontSize: 15, fontWeight: '700' },
  mcLetter:    { width: 28, height: 28, borderRadius: 14, borderWidth: 2, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  mcLetterTxt: { fontSize: 12, fontWeight: '900' },

  letterGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginLeft: 44 },
  letterBtn:   { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  letterTxt:   { fontSize: 14, fontWeight: '800' },
  bankBox:     { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6, marginBottom: 14 },
  bankLbl:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  headChip:    { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 180 },
  headChipTxt: { fontSize: 12, fontWeight: '600', lineHeight: 17 },

  instrBox:    { borderRadius: 14, padding: 16, marginBottom: 8 },
  instrText:   { fontSize: 14, lineHeight: 22 },

  grpHdr:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  grpIcon:     { width: 38, height: 38, borderRadius: 11, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  grpLabel:    { fontSize: 20, fontWeight: '900' },

  submitBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 80, borderTopWidth: 1 },
  submitCount:   { fontSize: 13, fontWeight: '600' },
  submitBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ORANGE, borderRadius: 22, paddingHorizontal: 22, paddingVertical: 10 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  resWrap:       { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  resCard:       { borderRadius: 20, padding: 28, alignItems: 'center', gap: 8 },
  resTick:       { fontSize: 36, marginBottom: 4 },
  resTitle:      { fontSize: 22, fontWeight: '800', color: '#fff' },
  resBand:       { fontSize: 64, fontWeight: '900', color: ORANGE, lineHeight: 72 },
  resBandLbl:    { fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  resScore:      { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  resPBg:        { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, marginTop: 6 },
  resPFill:      { height: 6, borderRadius: 3, backgroundColor: ORANGE },
  reviewBtn:     { backgroundColor: ORANGE, borderRadius: 24, paddingVertical: 14, alignItems: 'center' },
  reviewBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  doneBtn:       { borderWidth: 1.5, borderRadius: 24, paddingVertical: 14, alignItems: 'center' },
  doneBtnText:   { fontSize: 15, fontWeight: '700' },

  revHdr:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  revTitle:      { fontSize: 16, fontWeight: '800', color: '#fff' },
  revRow:        { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 8 },
  revLbl:        { fontSize: 10, fontWeight: '600', color: '#94a3b8', marginBottom: 2 },
  revAns:        { fontSize: 14, fontWeight: '800' },
  revLoc:        { fontSize: 11, lineHeight: 16, paddingLeft: 42, fontStyle: 'italic' },
});