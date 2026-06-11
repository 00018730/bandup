import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, useColorScheme, ActivityIndicator, Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../supabase';
import AudioPlayer from '../components/AudioPlayer';
import SaveProgressCard from '../components/SaveProgressCard';
import { saveLocalResult, getCompletedCount, hasSeenSavePrompt, markSavePromptSeen } from '../utils/storage';

const ORANGE = '#e85c2f';
const NAVY   = '#1a2744';
const GREEN  = '#22c55e';

const light = { bg:'#ffffff', surface:'#f4f5f8', text:NAVY, muted:'#6b7280', border:'#e2e6ee', input:'#ffffff' };
const dark  = { bg:'#23262d', surface:'#2e323b', text:'#eef0f4', muted:'#8a919e', border:'#3e434f', input:'#1d2027' };

type CellData = { text:string }|{ blank:number };
interface TableData { headers:string[]; rows:CellData[][]; }
interface Question { id:number; body:string; prefix:string; suffix:string; correct_answer:string; answer_location:string; sort_order:number; }
interface Test { id:number; title:string; audio_url:string|null; extra_data:{ table:TableData }; questions:Question[]; }
type ScreenMode = 'test'|'results'|'review';

function HighlightedText({ text, highlight, textStyle }:{ text:string; highlight:string; textStyle:any }) {
  if (!highlight||!text) return <Text style={textStyle}>{text}</Text>;
  const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'));
  return <Text style={textStyle}>{parts.map((p,i)=>p.toLowerCase()===highlight.toLowerCase()?<Text key={i} style={{color:ORANGE,fontWeight:'800',textDecorationLine:'underline'}}>{p}</Text>:p)}</Text>;
}

// ─── ListeningTableScreen ─────────────────────────────────────────────────────
export function ListeningTableScreen({ route, navigation }:any) {
  const { testId, testTitle } = route?.params ?? {};
  const isDark  = useColorScheme() === 'dark';
  const colors  = isDark ? dark : light;

  const [test, setTest]             = useState<Test|null>(null);
  const [loading, setLoading]       = useState(true);
  const [answers, setAnswers]       = useState<Record<number,string>>({});
  const [screenMode, setScreenMode] = useState<ScreenMode>('test');
  const [score, setScore]           = useState(0);
  const [modalQ, setModalQ]         = useState<Question|null>(null);
  const [isGuest, setIsGuest]               = useState(true);
  const [showSaveCard, setShowSaveCard]     = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    fetchTest();
    supabase.auth.getSession().then(({ data }) => setIsGuest(!data.session));
  }, []);

  const fetchTest = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tests').select(`id, title, audio_url, extra_data, questions(id, body, prefix, suffix, correct_answer, answer_location, sort_order)`)
      .eq('id', testId).single();
    if (!error&&data) setTest({...data, questions:[...(data.questions??[])].sort((a:Question,b:Question)=>a.sort_order-b.sort_order)} as Test);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!test) return;
    let correct = 0;
    test.questions.forEach(q => {
      if ((answers[q.id]??'').trim().toLowerCase() === q.correct_answer.trim().toLowerCase()) correct++;
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

  const renderTable = (reviewMode:boolean) => {
    if (!test?.extra_data?.table) return null;
    const { headers, rows } = test.extra_data.table;
    const qMap:Record<number,Question> = {};
    test.questions.forEach(q=>{ qMap[q.sort_order]=q; });
    return (
      <View style={[styles.tableWrap,{borderColor:colors.border}]}>
        <View style={[styles.tableRow,{backgroundColor:isDark?'#2a1a12':'#fff0eb'}]}>
          {headers.map((h,i)=>(
            <View key={i} style={[styles.tableCell,i<headers.length-1&&{borderRightColor:colors.border,borderRightWidth:1}]}>
              <Text style={[styles.tableHeaderText,{color:ORANGE}]}>{h}</Text>
            </View>
          ))}
        </View>
        {rows.map((row,ri)=>(
          <View key={ri} style={[styles.tableRow,{borderTopColor:colors.border,borderTopWidth:1}]}>
            {row.map((cell,ci)=>{
              const isLast=ci===row.length-1;
              if ('text' in cell) return (
                <View key={ci} style={[styles.tableCell,!isLast&&{borderRightColor:colors.border,borderRightWidth:1}]}>
                  <Text style={[styles.tableCellText,{color:colors.text}]}>{cell.text}</Text>
                </View>
              );
              const q=qMap[cell.blank]; if(!q) return <View key={ci} style={styles.tableCell}/>;
              const ua=(answers[q.id]??'').trim(); const isCorrect=ua.toLowerCase()===q.correct_answer.toLowerCase();
              return (
                <View key={ci} style={[styles.tableCell,!isLast&&{borderRightColor:colors.border,borderRightWidth:1},styles.blankCell]}>
                  <Text style={[styles.blankNum,{color:ORANGE}]}>{cell.blank}</Text>
                  {reviewMode?(
                    <View style={[styles.reviewBubble,{backgroundColor:isCorrect?(isDark?'#1a2a1a':'#eaf5ee'):(isDark?'#2a1212':'#fef2f2'),borderColor:isCorrect?GREEN:ORANGE}]}>
                      <Text style={{fontSize:12,fontWeight:'800' as const,color:isCorrect?GREEN:ORANGE}}>{ua||'—'}</Text>
                      {!isCorrect&&<Text style={{fontSize:11,fontWeight:'700' as const,color:GREEN}}>{' '}({q.correct_answer})</Text>}
                    </View>
                  ):(
                    <TextInput style={[styles.tableInput,{backgroundColor:colors.input,borderColor:answers[q.id]?ORANGE:colors.border,color:colors.text}]}
                      placeholder="___" placeholderTextColor={colors.muted} value={answers[q.id]??''} onChangeText={val=>setAnswers(prev=>({...prev,[q.id]:val}))} autoCapitalize="none"/>
                  )}
                  {reviewMode&&<TouchableOpacity onPress={()=>setModalQ(q)} style={[styles.bulbBtnSmall,{backgroundColor:isDark?'#2a2210':'#fffbe6'}]}><Text style={{fontSize:12}}>💡</Text></TouchableOpacity>}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  if (loading) return <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}><View style={styles.center}><ActivityIndicator size="large" color={ORANGE}/></View></SafeAreaView>;
  if (!test)   return <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}><View style={styles.center}><Text style={{color:colors.text}}>Test not found</Text></View></SafeAreaView>;

  if (screenMode==='results') {
    const total=test.questions.length; const pct=Math.round((score/total)*100);
    return (
      <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}>
        <ScrollView contentContainerStyle={styles.resultsScroll}>
          <View style={[styles.resultsCard,{backgroundColor:colors.surface}]}>
            <View style={[styles.scoreCircle,{borderColor:ORANGE}]}><Text style={styles.scoreNum}>{score}/{total}</Text><Text style={[styles.scorePct,{color:colors.muted}]}>{pct}%</Text></View>
            <Text style={[styles.resultsTitle,{color:colors.text}]}>{pct>=80?'Excellent! 🎉':pct>=60?'Good job! 👍':'Keep practising 💪'}</Text>
            <Text style={[styles.resultsSub,{color:colors.muted}]}>You got {score} out of {total} correct</Text>
            <View style={styles.resultsBtns}>
              <TouchableOpacity style={[styles.resultsBtn,{backgroundColor:colors.bg,borderColor:colors.border,borderWidth:1.5}]} onPress={()=>setScreenMode('review')} activeOpacity={0.8}><Feather name="eye" size={15} color={colors.text}/><Text style={[styles.resultsBtnText,{color:colors.text}]}>Review</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.resultsBtn,{backgroundColor:ORANGE}]} onPress={()=>navigation.navigate('Dashboard')} activeOpacity={0.8}><Feather name="home" size={15} color="#fff"/><Text style={[styles.resultsBtnText,{color:'#fff'}]}>Go Home</Text></TouchableOpacity>
            </View>
            {isGuest && showSaveCard && (
              <SaveProgressCard
                completedCount={completedCount}
                onSignUp={async () => { await markSavePromptSeen(); setShowSaveCard(false); navigation.navigate('Auth'); }}
                onDismiss={async () => { await markSavePromptSeen(); setShowSaveCard(false); }}
              />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screenMode==='review') return (
    <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}>
      <View style={[styles.header,{borderBottomColor:colors.border}]}>
        <TouchableOpacity onPress={()=>setScreenMode('results')} style={styles.headerBtn}><Feather name="arrow-left" size={16} color={colors.text}/></TouchableOpacity>
        <Text style={[styles.headerTitle,{color:colors.text}]}>Review</Text>
        <View style={{width:34}}/>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{renderTable(true)}</ScrollView>
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

  return (
    <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}>
      <View style={[styles.header,{borderBottomColor:colors.border}]}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={styles.headerBtn}><Feather name="arrow-left" size={16} color={colors.text}/></TouchableOpacity>
        <Text style={[styles.headerTitle,{color:colors.text}]}>{testTitle}</Text>
        <View style={{width:34}}/>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
        <AudioPlayer audioUrl={test.audio_url}/>
        <View style={[styles.instructBox,{backgroundColor:isDark?'#2a1a12':'#fff8f6',borderColor:ORANGE}]}>
          <Text style={[styles.instructText,{color:colors.text}]}>Complete the table. Choose <Text style={{color:ORANGE,fontWeight:'800'}}>ONE WORD AND/OR A NUMBER</Text> for each answer.</Text>
        </View>
        {renderTable(false)}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}><Text style={styles.submitText}>Submit</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── ListeningShortAnswerScreen ───────────────────────────────────────────────
interface SAQuestion { id:number; body:string; correct_answer:string; answer_location:string; sort_order:number; }
interface SATest { id:number; title:string; audio_url:string|null; questions:SAQuestion[]; }

export function ListeningShortAnswerScreen({ route, navigation }:any) {
  const { testId, testTitle } = route?.params ?? {};
  const isDark  = useColorScheme() === 'dark';
  const colors  = isDark ? dark : light;

  const [test, setTest]             = useState<SATest|null>(null);
  const [loading, setLoading]       = useState(true);
  const [answers, setAnswers]       = useState<Record<number,string>>({});
  const [screenMode, setScreenMode] = useState<ScreenMode>('test');
  const [score, setScore]           = useState(0);
  const [modalQ, setModalQ]         = useState<SAQuestion|null>(null);
  const [isGuest, setIsGuest]               = useState(true);
  const [showSaveCard, setShowSaveCard]     = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    fetchTest();
    supabase.auth.getSession().then(({ data }) => setIsGuest(!data.session));
  }, []);

  const fetchTest = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tests').select(`id, title, audio_url, questions(id, body, correct_answer, answer_location, sort_order)`)
      .eq('id', testId).single();
    if (!error&&data) setTest({...data, questions:[...(data.questions??[])].sort((a:SAQuestion,b:SAQuestion)=>a.sort_order-b.sort_order)} as SATest);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!test) return;
    let correct = 0;
    test.questions.forEach(q => {
      if ((answers[q.id]??'').trim().toLowerCase() === q.correct_answer.trim().toLowerCase()) correct++;
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

  if (loading) return <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}><View style={styles.center}><ActivityIndicator size="large" color={ORANGE}/></View></SafeAreaView>;
  if (!test)   return <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}><View style={styles.center}><Text style={{color:colors.text}}>Test not found</Text></View></SafeAreaView>;

  if (screenMode==='results') {
    const total=test.questions.length; const pct=Math.round((score/total)*100);
    return (
      <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}>
        <ScrollView contentContainerStyle={styles.resultsScroll}>
          <View style={[styles.resultsCard,{backgroundColor:colors.surface}]}>
            <View style={[styles.scoreCircle,{borderColor:ORANGE}]}><Text style={styles.scoreNum}>{score}/{total}</Text><Text style={[styles.scorePct,{color:colors.muted}]}>{pct}%</Text></View>
            <Text style={[styles.resultsTitle,{color:colors.text}]}>{pct>=80?'Excellent! 🎉':pct>=60?'Good job! 👍':'Keep practising 💪'}</Text>
            <Text style={[styles.resultsSub,{color:colors.muted}]}>You got {score} out of {total} correct</Text>
            <View style={styles.resultsBtns}>
              <TouchableOpacity style={[styles.resultsBtn,{backgroundColor:colors.bg,borderColor:colors.border,borderWidth:1.5}]} onPress={()=>setScreenMode('review')} activeOpacity={0.8}><Feather name="eye" size={15} color={colors.text}/><Text style={[styles.resultsBtnText,{color:colors.text}]}>Review</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.resultsBtn,{backgroundColor:ORANGE}]} onPress={()=>navigation.navigate('Dashboard')} activeOpacity={0.8}><Feather name="home" size={15} color="#fff"/><Text style={[styles.resultsBtnText,{color:'#fff'}]}>Go Home</Text></TouchableOpacity>
            </View>
            {isGuest && showSaveCard && (
              <SaveProgressCard
                completedCount={completedCount}
                onSignUp={async () => { await markSavePromptSeen(); setShowSaveCard(false); navigation.navigate('Auth'); }}
                onDismiss={async () => { await markSavePromptSeen(); setShowSaveCard(false); }}
              />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screenMode==='review') return (
    <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}>
      <View style={[styles.header,{borderBottomColor:colors.border}]}>
        <TouchableOpacity onPress={()=>setScreenMode('results')} style={styles.headerBtn}><Feather name="arrow-left" size={16} color={colors.text}/></TouchableOpacity>
        <Text style={[styles.headerTitle,{color:colors.text}]}>Review</Text>
        <View style={{width:34}}/>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {test.questions.map((q,i)=>{
          const ua=(answers[q.id]??'').trim(); const isCorrect=ua.toLowerCase()===q.correct_answer.toLowerCase();
          return (
            <View key={q.id} style={[styles.reviewCard,{backgroundColor:colors.surface,borderLeftColor:isCorrect?GREEN:ORANGE}]}>
              <View style={styles.reviewTop}>
                <Text style={[styles.reviewQNum,{color:ORANGE}]}>{i+1}</Text>
                <Text style={[styles.reviewQBody,{color:colors.text}]}>{q.body}</Text>
                <TouchableOpacity onPress={()=>setModalQ(q)} style={[styles.bulbBtn,{backgroundColor:isDark?'#2a2210':'#fffbe6'}]}><Text style={{fontSize:14}}>💡</Text></TouchableOpacity>
              </View>
              <View style={styles.reviewAnswers}>
                <View><Text style={[styles.reviewLabel,{color:colors.muted}]}>Your answer</Text><Text style={[styles.reviewVal,{color:isCorrect?GREEN:ORANGE}]}>{ua||'—'}</Text></View>
                {!isCorrect&&<View><Text style={[styles.reviewLabel,{color:colors.muted}]}>Correct</Text><Text style={[styles.reviewVal,{color:GREEN}]}>{q.correct_answer}</Text></View>}
              </View>
            </View>
          );
        })}
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

  return (
    <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}>
      <View style={[styles.header,{borderBottomColor:colors.border}]}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={styles.headerBtn}><Feather name="arrow-left" size={16} color={colors.text}/></TouchableOpacity>
        <Text style={[styles.headerTitle,{color:colors.text}]}>{testTitle}</Text>
        <View style={{width:34}}/>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>
        <AudioPlayer audioUrl={test.audio_url}/>
        <View style={[styles.instructBox,{backgroundColor:isDark?'#2a1a12':'#fff8f6',borderColor:ORANGE}]}>
          <Text style={[styles.instructText,{color:colors.text}]}>Answer the questions below. Write <Text style={{color:ORANGE,fontWeight:'800'}}>NO MORE THAN THREE WORDS AND/OR A NUMBER</Text> for each answer.</Text>
        </View>
        {test.questions.map((q,i)=>(
          <View key={q.id} style={[styles.questionCard,{backgroundColor:colors.surface}]}>
            <View style={styles.questionTop}>
              <Text style={[styles.questionNum,{color:ORANGE}]}>{i+1}</Text>
              <Text style={[styles.questionBody,{color:colors.text}]}>{q.body}</Text>
            </View>
            <TextInput style={[styles.answerInput,{backgroundColor:colors.input,borderColor:answers[q.id]?ORANGE:colors.border,color:colors.text}]}
              placeholder="Your answer..." placeholderTextColor={colors.muted}
              value={answers[q.id]??''} onChangeText={val=>setAnswers(prev=>({...prev,[q.id]:val}))} autoCapitalize="none"/>
          </View>
        ))}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}><Text style={styles.submitText}>Submit</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex:1 },
  center:         { flex:1, alignItems:'center', justifyContent:'center' },
  scroll:         { padding:16, paddingBottom:60 },
  resultsScroll:  { flexGrow:1, justifyContent:'center', padding:24 },
  header:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1 },
  headerBtn:      { width:34, height:34, alignItems:'center', justifyContent:'center' },
  headerTitle:    { fontSize:16, fontWeight:'800' },
  instructBox:    { borderRadius:10, borderWidth:1.5, padding:12, marginBottom:14 },
  instructText:   { fontSize:12.5, lineHeight:20 },
  questionCard:   { borderRadius:14, padding:14, marginBottom:10 },
  questionTop:    { flexDirection:'row', alignItems:'flex-start', gap:10, marginBottom:10 },
  questionNum:    { fontSize:15, fontWeight:'800', flexShrink:0, marginTop:1 },
  questionBody:   { flex:1, fontSize:13.5, lineHeight:21 },
  answerInput:    { borderWidth:1.5, borderRadius:10, paddingHorizontal:12, paddingVertical:10, fontSize:14 },
  tableWrap:      { borderWidth:1.5, borderRadius:12, overflow:'hidden', marginBottom:20 },
  tableRow:       { flexDirection:'row' },
  tableCell:      { flex:1, padding:10, justifyContent:'center' },
  tableHeaderText:{ fontSize:12, fontWeight:'800', textAlign:'center' },
  tableCellText:  { fontSize:13, lineHeight:19, textAlign:'center' },
  blankCell:      { alignItems:'center', gap:4, padding:8 },
  blankNum:       { fontSize:11, fontWeight:'800' },
  tableInput:     { borderWidth:1.5, borderRadius:8, paddingHorizontal:8, paddingVertical:4, fontSize:13, width:'90%', textAlign:'center' },
  reviewBubble:   { flexDirection:'row', alignItems:'center', borderWidth:1.5, borderRadius:8, paddingHorizontal:6, paddingVertical:3, flexWrap:'wrap', justifyContent:'center' },
  bulbBtnSmall:   { width:24, height:24, borderRadius:6, alignItems:'center', justifyContent:'center' },
  submitBtn:      { backgroundColor:ORANGE, borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:4 },
  submitText:     { color:'#fff', fontSize:15, fontWeight:'800' },
  resultsCard:    { width:'100%', borderRadius:20, padding:28, alignItems:'center', gap:8 },
  scoreCircle:    { width:100, height:100, borderRadius:50, borderWidth:4, alignItems:'center', justifyContent:'center', marginBottom:8 },
  scoreNum:       { fontSize:26, fontWeight:'800', color:ORANGE },
  scorePct:       { fontSize:12, fontWeight:'600' },
  resultsTitle:   { fontSize:22, fontWeight:'800', marginTop:4 },
  resultsSub:     { fontSize:13, marginBottom:8 },
  resultsBtns:    { flexDirection:'row', gap:10, marginTop:8, width:'100%' },
  resultsBtn:     { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingVertical:13, borderRadius:12 },
  resultsBtnText: { fontSize:14, fontWeight:'800' },
  reviewCard:     { borderRadius:14, padding:14, marginBottom:10, borderLeftWidth:4 },
  reviewTop:      { flexDirection:'row', alignItems:'flex-start', gap:8, marginBottom:10 },
  reviewQNum:     { fontSize:14, fontWeight:'800', flexShrink:0 },
  reviewQBody:    { flex:1, fontSize:13.5, lineHeight:20 },
  bulbBtn:        { width:28, height:28, borderRadius:6, alignItems:'center', justifyContent:'center', flexShrink:0 },
  reviewAnswers:  { gap:6 },
  reviewLabel:    { fontSize:11, fontWeight:'600', marginBottom:2 },
  reviewVal:      { fontSize:13, fontWeight:'800' },
  modalOverlay:   { flex:1, backgroundColor:'rgba(0,0,0,0.5)', alignItems:'center', justifyContent:'center', padding:24 },
  modalCard:      { width:'100%', borderRadius:18, padding:22, borderWidth:1, gap:12 },
  modalTitle:     { fontSize:15, fontWeight:'800' },
  modalPassage:   { fontSize:14, lineHeight:24 },
  modalClose:     { borderRadius:10, paddingVertical:11, alignItems:'center', marginTop:4 },
  modalCloseText: { color:'#fff', fontWeight:'800', fontSize:14 },
});