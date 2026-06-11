import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, useColorScheme, ActivityIndicator,
  Modal, PanResponder, Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { saveLocalResult, getCompletedCount, hasSeenSavePrompt, markSavePromptSeen } from '../utils/storage';
import SaveProgressCard from '../components/SaveProgressCard';
import { supabase } from '../supabase';

const ORANGE  = '#e85c2f';
const NAVY    = '#1a2744';
const GREEN   = '#22c55e';
const SCREEN_H = Dimensions.get('window').height;
const DEFAULT_PASSAGE_H = SCREEN_H * 0.38;
const MIN_PASSAGE_H     = 80;
const MAX_PASSAGE_H     = SCREEN_H * 0.72;
const TEST_DURATION     = 20 * 60; // 20 minutes in seconds

const light = {
  bg:'#ffffff', surface:'#f4f5f8', text:NAVY,
  muted:'#6b7280', border:'#e2e6ee', input:'#ffffff', form:'#ffffff',
};
const dark = {
  bg:'#23262d', surface:'#2e323b', text:'#eef0f4',
  muted:'#8a919e', border:'#3e434f', input:'#1d2027', form:'#2e323b',
};

// ─── Normalise passage → string[] of paragraphs ───────────────────────────────
const normalizePassage = (text: string): string[] =>
  text
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/([^\n])\n([^\n])/g, '$1 $2')
    .replace(/\n{2,}/g, '||PARA||')
    .split('||PARA||')
    .map(p => p.replace(/ {2,}/g, ' ').trim())
    .filter(p => p.length > 0);

interface Question {
  id:number; body:string; prefix:string; suffix:string;
  correct_answer:string; answer_location:string;
  section_heading:string; sort_order:number;
}
interface Test {
  id:number; title:string; passage:string[];
  form_title:string; questions:Question[];
}
type Mode = 'test'|'results'|'review';

function groupBySection(questions: Question[]) {
  const groups: { heading:string; questions:Question[] }[] = [];
  questions.forEach(q => {
    const h = q.section_heading ?? '';
    const existing = groups.find(g => g.heading === h);
    if (existing) existing.questions.push(q);
    else groups.push({ heading:h, questions:[q] });
  });
  return groups;
}

function HighlightedText({ text, highlight, textStyle }:{ text:string; highlight:string; textStyle:any }) {
  if (!highlight||!text) return <Text style={textStyle}>{text}</Text>;
  const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'));
  return <Text style={textStyle}>{parts.map((p,i)=>p.toLowerCase()===highlight.toLowerCase()?<Text key={i} style={{color:ORANGE,fontWeight:'800',textDecorationLine:'underline'}}>{p}</Text>:p)}</Text>;
}

export default function ReadingTestScreen({ route, navigation }:any) {
  const { testId, testTitle } = route?.params ?? {};
  const isDark  = useColorScheme() === 'dark';
  const colors  = isDark ? dark : light;

  const [test, setTest]       = useState<Test|null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<number,string>>({});
  const [mode, setMode]       = useState<Mode>('test');
  const [score, setScore]     = useState(0);
  const [modalQ, setModalQ]   = useState<Question|null>(null);
  const inputRefs             = useRef<Record<number, TextInput|null>>({});

  // ── Timer ─────────────────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState(TEST_DURATION);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); handleSubmit(); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m.toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`;
  };

  const timerColor = timeLeft < 300 ? '#ef4444' : timeLeft < 600 ? '#f59e0b' : colors.muted;

  // ── Draggable divider ─────────────────────────────────────────────────────
  const passageHeightRef = useRef(DEFAULT_PASSAGE_H);
  const baseHeightRef    = useRef(DEFAULT_PASSAGE_H);
  const [passageH, setPassageH] = useState(DEFAULT_PASSAGE_H);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        baseHeightRef.current = passageHeightRef.current;
      },
      onPanResponderMove: (_, gs) => {
        const newH = Math.max(MIN_PASSAGE_H, Math.min(MAX_PASSAGE_H, baseHeightRef.current + gs.dy));
        passageHeightRef.current = newH;
        setPassageH(newH);
      },
    })
  ).current;

  // ── Highlight state ───────────────────────────────────────────────────────
  const [highlights, setHighlights]   = useState<[number,number][]>([]);
  const [selectStart, setSelectStart] = useState<number|null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [isGuest, setIsGuest]               = useState(true);
  const [showSaveCard, setShowSaveCard]     = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    fetchTest();
    supabase.auth.getSession().then(({ data }) => setIsGuest(!data.session));
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const fetchTest = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tests')
      .select(`id, title, passage, form_title,
        questions(id, body, prefix, suffix, correct_answer, answer_location, section_heading, sort_order)`)
      .eq('id', testId).single();
    if (!error && data) {
      setTest({
        ...data,
        passage:   normalizePassage(data.passage ?? ''),
        questions: [...(data.questions ?? [])].sort((a:Question,b:Question) => a.sort_order - b.sort_order),
      } as Test);
      startTimer();
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!test) return;
    if (timerRef.current) clearInterval(timerRef.current);
    let correct = 0;
    test.questions.forEach(q => {
      if ((answers[q.id]??'').trim().toLowerCase() === q.correct_answer.trim().toLowerCase()) correct++;
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
    const ei = highlights.findIndex(([s,e]) => index>=s && index<=e);
    if (ei !== -1) { setHighlights(prev => prev.filter((_,i)=>i!==ei)); setSelectStart(null); return; }
    if (selectStart === null) setSelectStart(index);
    else {
      setHighlights(prev => [...prev,[Math.min(selectStart,index),Math.max(selectStart,index)]]);
      setSelectStart(null);
    }
  };
  const isHL      = (i:number) => highlights.some(([s,e]) => i>=s && i<=e);
  const isPending = (i:number) => selectStart !== null && i === selectStart;

  // ── Passage renderer ──────────────────────────────────────────────────────
  const renderPassage = () => {
    if (!test) return null;
    const selecting = selectStart !== null;
    let wi = 0;
    return (
      <View style={{ flex:1 }}>
        <View style={styles.passageHeader}>
          <Text style={[styles.passageLabel,{color:ORANGE}]}>PASSAGE</Text>
          <View style={styles.passageHintRow}>
            {selecting && (
              <TouchableOpacity onPress={()=>setSelectStart(null)} style={[styles.cancelSelBtn,{borderColor:colors.border}]}>
                <Feather name="x" size={11} color={colors.muted}/>
                <Text style={[styles.cancelSelText,{color:colors.muted}]}>Cancel</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.passageHint,{color:selecting?ORANGE:colors.muted}]}>
              {selecting ? 'Tap end of selection' : 'Tap to highlight'}
            </Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {test.passage.map((para, pi) => {
            const words = para.split(' ').filter(w => w.length > 0);
            return (
              <View key={pi} style={styles.paragraphBlock}>
                <View style={styles.passageWords}>
                  {words.map(word => {
                    const i = wi++;
                    return (
                      <TouchableOpacity key={i} onPress={()=>handleWordTap(i)} activeOpacity={0.7}>
                        <Text style={[
                          styles.passageWord, {color:colors.text},
                          isHL(i)      && {backgroundColor:'#fff0eb',color:ORANGE,fontWeight:'700',borderRadius:3},
                          isPending(i) && {backgroundColor:'#ffd9cc',color:ORANGE,borderRadius:3},
                        ]}>{word}{' '}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}
          {highlights.length > 0 && (
            <TouchableOpacity onPress={()=>setHighlights([])} style={styles.clearBtn}>
              <Feather name="trash-2" size={12} color={colors.muted}/>
              <Text style={[styles.clearBtnText,{color:colors.muted}]}>Clear highlights</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  };

  // ── Note form renderer ────────────────────────────────────────────────────
  const renderNoteForm = (reviewMode: boolean) => {
    if (!test) return null;
    return (
      <View style={[styles.formBox,{borderColor:colors.border,backgroundColor:colors.form}]}>
        {test.form_title
          ? <Text style={[styles.formTitle,{color:ORANGE}]}>{test.form_title}</Text>
          : null}
        {groupBySection(test.questions).map((group,gi) => (
          <View key={gi} style={styles.formSection}>
            {group.heading
              ? <Text style={[styles.formSectionHeading,{color:ORANGE}]}>{group.heading}</Text>
              : null}
            {group.questions.map(q => {
              const userAns   = (answers[q.id] ?? '').trim();
              const isCorrect = userAns.toLowerCase() === q.correct_answer.toLowerCase();
              return (
                <View key={q.id} style={styles.bulletRow}>
                  {/* Numbered badge */}
                  <View style={[styles.qBadge,{backgroundColor:isDark?'#2a1a12':'#fff0eb'}]}>
                    <Text style={[styles.qBadgeText,{color:ORANGE}]}>{q.sort_order}</Text>
                  </View>
                  <View style={styles.inlineContent}>
                    {q.prefix
                      ? <Text style={[styles.inlineText,{color:colors.text}]}>{q.prefix} </Text>
                      : null}
                    {reviewMode ? (
                      <View style={styles.reviewRow}>
                        <View style={[styles.reviewBubble,{
                          backgroundColor: isCorrect?(isDark?'#1a2a1a':'#eaf5ee'):(isDark?'#2a1212':'#fef2f2'),
                          borderColor: isCorrect?GREEN:ORANGE,
                        }]}>
                          <Text style={{fontSize:13,fontWeight:'800' as const,color:isCorrect?GREEN:ORANGE}}>
                            {userAns||'—'}
                          </Text>
                          {!isCorrect && (
                            <Text style={{fontSize:12,fontWeight:'700' as const,color:GREEN}}>
                              {' '}({q.correct_answer})
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity onPress={()=>setModalQ(q)} style={[styles.bulbBtn,{backgroundColor:isDark?'#2a2210':'#fffbe6'}]}>
                          <Text style={{fontSize:14}}>💡</Text>
                        </TouchableOpacity>
                        {q.suffix ? <Text style={[styles.inlineText,{color:colors.text}]}> {q.suffix}</Text> : null}
                      </View>
                    ) : (
                      <View style={styles.inputRow}>
                        <TextInput
                          ref={ref => { inputRefs.current[q.id] = ref; }}
                          style={[styles.inlineInput,{
                            backgroundColor: colors.input,
                            borderColor: answers[q.id] ? ORANGE : colors.border,
                            color: colors.text,
                          }]}
                          placeholder="________" placeholderTextColor={colors.muted}
                          value={answers[q.id]??''}
                          onChangeText={val => setAnswers(prev=>({...prev,[q.id]:val}))}
                          autoCapitalize="none"
                        />
                        {q.suffix ? <Text style={[styles.inlineText,{color:colors.text}]}> {q.suffix}</Text> : null}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) return (
    <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}>
      <View style={styles.center}><ActivityIndicator size="large" color={ORANGE}/><Text style={[styles.loadingText,{color:colors.muted}]}>Loading test...</Text></View>
    </SafeAreaView>
  );
  if (!test) return (
    <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}>
      <View style={styles.center}><Feather name="alert-circle" size={32} color={ORANGE}/><Text style={[styles.errorText,{color:colors.text}]}>Test not found</Text><TouchableOpacity style={styles.retryBtn} onPress={()=>navigation.goBack()}><Text style={styles.retryText}>Go back</Text></TouchableOpacity></View>
    </SafeAreaView>
  );

  // ── Results ───────────────────────────────────────────────────────────────
  if (mode === 'results') {
    const total=test.questions.length; const pct=Math.round((score/total)*100);
    return (
      <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}>
        <ScrollView contentContainerStyle={styles.resultsWrap}>
          <View style={[styles.resultsCard,{backgroundColor:colors.surface}]}>
            <View style={[styles.scoreCircle,{borderColor:ORANGE}]}>
              <Text style={styles.scoreNum}>{score}/{total}</Text>
              <Text style={[styles.scorePct,{color:colors.muted}]}>{pct}%</Text>
            </View>
            <Text style={[styles.resultsTitle,{color:colors.text}]}>{pct>=80?'Excellent! 🎉':pct>=60?'Good job! 👍':'Keep practising 💪'}</Text>
            <Text style={[styles.resultsSub,{color:colors.muted}]}>You got {score} out of {total} correct</Text>
            {isGuest && showSaveCard && (
              <SaveProgressCard
                completedCount={completedCount}
                onSignUp={async()=>{ await markSavePromptSeen(); setShowSaveCard(false); navigation.navigate('Auth'); }}
                onDismiss={async()=>{ await markSavePromptSeen(); setShowSaveCard(false); }}
              />
            )}
            <View style={styles.resultsBtns}>
              <TouchableOpacity style={[styles.resultsBtn,{backgroundColor:colors.bg,borderColor:colors.border,borderWidth:1.5}]} onPress={()=>setMode('review')} activeOpacity={0.8}>
                <Feather name="eye" size={15} color={colors.text}/>
                <Text style={[styles.resultsBtnText,{color:colors.text}]}>Review</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.resultsBtn,{backgroundColor:ORANGE}]} onPress={()=>navigation.navigate('Dashboard')} activeOpacity={0.8}>
                <Feather name="home" size={15} color="#fff"/>
                <Text style={[styles.resultsBtnText,{color:'#fff'}]}>Go Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Review ────────────────────────────────────────────────────────────────
  if (mode === 'review') return (
    <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}>
      <View style={[styles.header,{borderBottomColor:colors.border}]}>
        <TouchableOpacity onPress={()=>setMode('results')} style={styles.headerBtn}><Feather name="arrow-left" size={16} color={colors.text}/></TouchableOpacity>
        <Text style={[styles.headerTitle,{color:colors.text}]}>Review</Text>
        <View style={{width:34}}/>
      </View>
      <ScrollView contentContainerStyle={styles.testScroll} showsVerticalScrollIndicator={false}>
        {renderNoteForm(true)}
      </ScrollView>
      <Modal visible={!!modalQ} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={()=>setModalQ(null)}>
          <View style={[styles.modalCard,{backgroundColor:colors.bg,borderColor:colors.border}]}>
            <Text style={[styles.modalTitle,{color:colors.text}]}>📖 Answer location</Text>
            <HighlightedText text={modalQ?.answer_location??''} highlight={modalQ?.correct_answer??''} textStyle={[styles.modalPassage,{color:colors.muted}]}/>
            <TouchableOpacity style={[styles.modalClose,{backgroundColor:ORANGE}]} onPress={()=>setModalQ(null)}><Text style={styles.modalCloseText}>Got it</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );

  // ── Test mode — split layout ──────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}>
      {/* Header with timer */}
      <View style={[styles.header,{borderBottomColor:colors.border}]}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={16} color={colors.text}/>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.timerBadge,{backgroundColor:timeLeft<300?(isDark?'#2a1212':'#fef2f2'):(isDark?'#2a1a12':'#fff0eb')}]}>
            <Feather name="clock" size={11} color={timerColor}/>
            <Text style={[styles.timerText,{color:timerColor}]}>{formatTime(timeLeft)}</Text>
          </View>
          <Text style={[styles.headerTitle,{color:colors.text}]} numberOfLines={1}>{testTitle}</Text>
        </View>
        <TouchableOpacity style={[styles.submitIconBtn,{backgroundColor:ORANGE}]} onPress={handleSubmit} activeOpacity={0.85}>
          <Feather name="check" size={16} color="#fff"/>
        </TouchableOpacity>
      </View>

      {/* Split view */}
      <View style={styles.splitContainer}>

        {/* Passage panel */}
        <View style={[styles.passagePanel,{height:passageH,backgroundColor:colors.surface}]}>
          {renderPassage()}
        </View>

        {/* Draggable divider */}
        <View {...panResponder.panHandlers} style={[styles.divider,{backgroundColor:colors.border}]}>
          <View style={[styles.dividerPill,{backgroundColor:colors.muted}]}/>
          <Feather name="more-horizontal" size={14} color={colors.muted}/>
          <View style={[styles.dividerPill,{backgroundColor:colors.muted}]}/>
        </View>

        {/* Questions panel */}
        <View style={[styles.questionsPanel,{backgroundColor:colors.bg}]}>
          <ScrollView
            contentContainerStyle={styles.questionsScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
          >
            <View style={[styles.instructionsBox,{backgroundColor:isDark?'#2a1a12':'#fff8f6',borderColor:ORANGE}]}>
              <Text style={[styles.instructionText,{color:colors.text}]}>
                Complete the notes below. Choose{' '}
                <Text style={{color:ORANGE,fontWeight:'800'}}>ONE WORD ONLY</Text>
                {' '}from the passage for each answer.
              </Text>
            </View>
            {renderNoteForm(false)}
          </ScrollView>
        </View>
      </View>

      {/* Modal */}
      <Modal visible={!!modalQ} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={()=>setModalQ(null)}>
          <View style={[styles.modalCard,{backgroundColor:colors.bg,borderColor:colors.border}]}>
            <Text style={[styles.modalTitle,{color:colors.text}]}>📖 Answer location</Text>
            <HighlightedText text={modalQ?.answer_location??''} highlight={modalQ?.correct_answer??''} textStyle={[styles.modalPassage,{color:colors.muted}]}/>
            <TouchableOpacity style={[styles.modalClose,{backgroundColor:ORANGE}]} onPress={()=>setModalQ(null)}><Text style={styles.modalCloseText}>Got it</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:               { flex:1 },
  center:             { flex:1, alignItems:'center', justifyContent:'center', gap:10 },
  loadingText:        { fontSize:13, fontWeight:'600' },
  errorText:          { fontSize:16, fontWeight:'800' },
  retryBtn:           { backgroundColor:ORANGE, borderRadius:10, paddingHorizontal:24, paddingVertical:10 },
  retryText:          { color:'#fff', fontWeight:'700', fontSize:13 },

  // Header
  header:             { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14, paddingVertical:10, borderBottomWidth:1 },
  headerBtn:          { width:34, height:34, alignItems:'center', justifyContent:'center' },
  headerCenter:       { flex:1, alignItems:'center', gap:4 },
  headerTitle:        { fontSize:14, fontWeight:'800', maxWidth:200 },
  timerBadge:         { flexDirection:'row', alignItems:'center', gap:4, borderRadius:20, paddingHorizontal:10, paddingVertical:4 },
  timerText:          { fontSize:13, fontWeight:'800', fontVariant:['tabular-nums'] as any },
  submitIconBtn:      { width:34, height:34, borderRadius:17, alignItems:'center', justifyContent:'center' },

  // Split layout
  splitContainer:     { flex:1 },
  passagePanel:       { paddingHorizontal:14, paddingTop:10, paddingBottom:4 },
  divider:            { height:24, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6 },
  dividerPill:        { flex:1, height:1, marginHorizontal:8 },
  questionsPanel:     { flex:1 },
  questionsScroll:    { padding:14, paddingBottom:40 },

  // Passage
  passageHeader:      { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8 },
  passageLabel:       { fontSize:10, fontWeight:'700', letterSpacing:0.6 },
  passageHintRow:     { flexDirection:'row', alignItems:'center', gap:6 },
  passageHint:        { fontSize:10, fontWeight:'600', fontStyle:'italic' },
  cancelSelBtn:       { flexDirection:'row', alignItems:'center', gap:3, borderWidth:1, borderRadius:10, paddingHorizontal:7, paddingVertical:3 },
  cancelSelText:      { fontSize:10, fontWeight:'600' },
  paragraphBlock:     { marginBottom:10 },
  passageWords:       { flexDirection:'row', flexWrap:'wrap' },
  passageWord:        { fontSize:13.5, lineHeight:24 },
  clearBtn:           { flexDirection:'row', alignItems:'center', gap:5, marginTop:8, alignSelf:'flex-end' },
  clearBtnText:       { fontSize:11, fontWeight:'600' },

  // Instructions
  instructionsBox:    { borderRadius:10, borderWidth:1.5, padding:12, marginBottom:14 },
  instructionText:    { fontSize:13, lineHeight:20 },

  // Form
  formBox:            { borderWidth:1.5, borderRadius:14, padding:16, marginBottom:20 },
  formTitle:          { fontSize:15, fontWeight:'800', textAlign:'center', marginBottom:14 },
  formSection:        { marginBottom:12 },
  formSectionHeading: { fontSize:13, fontWeight:'800', marginBottom:8 },
  bulletRow:          { flexDirection:'row', alignItems:'flex-start', marginBottom:14, gap:8 },
  qBadge:             { width:26, height:26, borderRadius:13, alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 },
  qBadgeText:         { fontSize:12, fontWeight:'800' },
  inlineContent:      { flex:1 },
  inlineText:         { fontSize:13.5, lineHeight:22 },
  inputRow:           { flexDirection:'row', alignItems:'center', flexWrap:'wrap', gap:4, marginTop:4 },
  inlineInput:        { borderWidth:1.5, borderRadius:8, paddingHorizontal:10, paddingVertical:5, fontSize:13.5, minWidth:90, maxWidth:140 },
  reviewRow:          { flexDirection:'row', alignItems:'center', flexWrap:'wrap', gap:6, marginTop:4 },
  reviewBubble:       { flexDirection:'row', alignItems:'center', borderWidth:1.5, borderRadius:8, paddingHorizontal:8, paddingVertical:4, flexWrap:'wrap' },
  bulbBtn:            { width:28, height:28, borderRadius:6, alignItems:'center', justifyContent:'center' },

  // Results
  resultsWrap:        { flexGrow:1, justifyContent:'center', padding:24 },
  resultsCard:        { width:'100%', borderRadius:20, padding:28, alignItems:'center', gap:8 },
  scoreCircle:        { width:100, height:100, borderRadius:50, borderWidth:4, alignItems:'center', justifyContent:'center', marginBottom:8 },
  scoreNum:           { fontSize:26, fontWeight:'800', color:ORANGE },
  scorePct:           { fontSize:12, fontWeight:'600' },
  resultsTitle:       { fontSize:22, fontWeight:'800', marginTop:4 },
  resultsSub:         { fontSize:13, marginBottom:8 },
  resultsBtns:        { flexDirection:'row', gap:10, marginTop:8, width:'100%' },
  resultsBtn:         { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingVertical:13, borderRadius:12 },
  resultsBtnText:     { fontSize:14, fontWeight:'800' },

  testScroll:         { padding:16, paddingBottom:40 },

  // Modal
  modalOverlay:       { flex:1, backgroundColor:'rgba(0,0,0,0.5)', alignItems:'center', justifyContent:'center', padding:24 },
  modalCard:          { width:'100%', borderRadius:18, padding:22, borderWidth:1, gap:12 },
  modalTitle:         { fontSize:15, fontWeight:'800' },
  modalPassage:       { fontSize:14, lineHeight:24 },
  modalClose:         { borderRadius:10, paddingVertical:11, alignItems:'center', marginTop:4 },
  modalCloseText:     { color:'#fff', fontWeight:'800', fontSize:14 },
});