import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, useColorScheme, ActivityIndicator, Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import AudioPlayer from '../components/AudioPlayer';

import { saveLocalResult, getCompletedCount, hasSeenSavePrompt, markSavePromptSeen } from '../utils/storage';
import SaveProgressCard from '../components/SaveProgressCard';
import { supabase } from '../supabase';

const ORANGE = '#e85c2f';
const NAVY   = '#1a2744';
const GREEN  = '#22c55e';

const light = { bg:'#ffffff', surface:'#f4f5f8', text:NAVY, muted:'#6b7280', border:'#e2e6ee', input:'#ffffff', form:'#ffffff' };
const dark  = { bg:'#23262d', surface:'#2e323b', text:'#eef0f4', muted:'#8a919e', border:'#3e434f', input:'#1d2027', form:'#2e323b' };

interface Question {
  id:number; body:string; prefix:string; suffix:string;
  correct_answer:string; answer_location:string; section_heading:string; sort_order:number;
}
interface Test {
  id:number; title:string; audio_url:string|null; form_title:string; questions:Question[];
}
type ScreenMode = 'test'|'results'|'review';

function HighlightedText({ text, highlight, textStyle }:{ text:string; highlight:string; textStyle:any }) {
  if (!highlight||!text) return <Text style={textStyle}>{text}</Text>;
  const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'));
  return <Text style={textStyle}>{parts.map((p,i)=>p.toLowerCase()===highlight.toLowerCase()?<Text key={i} style={{color:ORANGE,fontWeight:'800',textDecorationLine:'underline'}}>{p}</Text>:p)}</Text>;
}

function groupBySection(questions: Question[]) {
  const groups: { heading:string; questions:Question[] }[] = [];
  questions.forEach(q => {
    const heading = q.section_heading ?? '';
    const existing = groups.find(g => g.heading === heading);
    if (existing) existing.questions.push(q);
    else groups.push({ heading, questions:[q] });
  });
  return groups;
}

export default function ListeningFillBlankScreen({ route, navigation }:any) {
  const { testId, testTitle } = route?.params ?? {};
  const isDark  = useColorScheme() === 'dark';
  const colors  = isDark ? dark : light;

  const [test, setTest]         = useState<Test|null>(null);
  const [loading, setLoading]   = useState(true);
  const [answers, setAnswers]   = useState<Record<number,string>>({});
  const [screenMode, setScreenMode] = useState<ScreenMode>('test');
  const [score, setScore]       = useState(0);
  const [modalQ, setModalQ]     = useState<Question|null>(null);

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
      .from('tests').select(`id, title, audio_url, form_title,
        questions(id, body, prefix, suffix, correct_answer, answer_location, section_heading, sort_order)`)
      .eq('id', testId).single();
    if (!error&&data) setTest({...data, questions:[...(data.questions??[])].sort((a:Question,b:Question)=>a.sort_order-b.sort_order)} as Test);
    setLoading(false);
  };

  const handleSubmit = async () => {
  if (!test) return;
  let correct = 0;
  test.questions.forEach(q => {
    if ((answers[q.id] ?? '').trim().toLowerCase() === q.correct_answer.trim().toLowerCase())
      correct++;
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

  const renderForm = (reviewMode: boolean) => {
    if (!test) return null;
    return (
      <View style={[styles.formBox,{borderColor:colors.border,backgroundColor:colors.form}]}>
        {test.form_title?<Text style={[styles.formTitle,{color:ORANGE}]}>{test.form_title}</Text>:null}
        {groupBySection(test.questions).map((group,gi)=>(
          <View key={gi} style={styles.formSection}>
            {group.heading?<Text style={[styles.sectionHeading,{color:ORANGE}]}>{group.heading}</Text>:null}
            {group.questions.map(q=>{
              const userAns=(answers[q.id]??'').trim();
              const isCorrect=userAns.toLowerCase()===q.correct_answer.toLowerCase();
              return (
                <View key={q.id} style={styles.bulletRow}>
                  <Text style={[styles.bullet,{color:colors.muted}]}>•</Text>
                  <View style={styles.inlineContent}>
                    <Text style={[styles.inlineText,{color:colors.text}]}>
                      {q.prefix?`${q.prefix} `:''}<Text style={[styles.qNum,{color:ORANGE}]}>{q.sort_order} </Text>
                    </Text>
                    {reviewMode?(
                      <View style={styles.reviewRow}>
                        <View style={[styles.reviewBubble,{backgroundColor:isCorrect?(isDark?'#1a2a1a':'#eaf5ee'):(isDark?'#2a1212':'#fef2f2'),borderColor:isCorrect?GREEN:ORANGE}]}>
                          <Text style={{fontSize:13,fontWeight:'800' as const,color:isCorrect?GREEN:ORANGE}}>{userAns||'—'}</Text>
                          {!isCorrect&&<Text style={{fontSize:12,fontWeight:'700' as const,color:GREEN}}>{' '}({q.correct_answer})</Text>}
                        </View>
                        <TouchableOpacity onPress={()=>setModalQ(q)} style={[styles.bulbBtn,{backgroundColor:isDark?'#2a2210':'#fffbe6'}]}><Text>💡</Text></TouchableOpacity>
                        {q.suffix?<Text style={[styles.inlineText,{color:colors.text}]}> {q.suffix}</Text>:null}
                      </View>
                    ):(
                      <View style={styles.inputRow}>
                        <TextInput
                          style={[styles.inlineInput,{backgroundColor:colors.input,borderColor:answers[q.id]?ORANGE:colors.border,color:colors.text}]}
                          placeholder="________" placeholderTextColor={colors.muted}
                          value={answers[q.id]??''} onChangeText={val=>setAnswers(prev=>({...prev,[q.id]:val}))}
                          autoCapitalize="none"
                        />
                        {q.suffix?<Text style={[styles.inlineText,{color:colors.text}]}> {q.suffix}</Text>:null}
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

  if (loading) return <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}><View style={styles.center}><ActivityIndicator size="large" color={ORANGE}/></View></SafeAreaView>;
  if (!test)   return <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}><View style={styles.center}><Text style={{color:colors.text}}>Test not found</Text></View></SafeAreaView>;

  if (screenMode==='results') {
    const total=test.questions.length; const pct=Math.round((score/total)*100);
    return (
      <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}>
        <View style={styles.resultsWrap}>
          <View style={[styles.resultsCard,{backgroundColor:colors.surface}]}>
            <View style={[styles.scoreCircle,{borderColor:ORANGE}]}><Text style={styles.scoreNum}>{score}/{total}</Text><Text style={[styles.scorePct,{color:colors.muted}]}>{pct}%</Text></View>
            <Text style={[styles.resultsTitle,{color:colors.text}]}>{pct>=80?'Excellent! 🎉':pct>=60?'Good job! 👍':'Keep practising 💪'}</Text>
            <Text style={[styles.resultsSub,{color:colors.muted}]}>You got {score} out of {total} correct</Text>
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
              <TouchableOpacity style={[styles.resultsBtn,{backgroundColor:colors.bg,borderColor:colors.border,borderWidth:1.5}]} onPress={()=>setScreenMode('review')} activeOpacity={0.8}><Feather name="eye" size={15} color={colors.text}/><Text style={[styles.resultsBtnText,{color:colors.text}]}>Review</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.resultsBtn,{backgroundColor:ORANGE}]} onPress={()=>navigation.navigate('Dashboard')} activeOpacity={0.8}><Feather name="home" size={15} color="#fff"/><Text style={[styles.resultsBtnText,{color:'#fff'}]}>Go Home</Text></TouchableOpacity>
            </View>
          </View>
        </View>
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
        {renderForm(true)}
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
          <Text style={[styles.instructText,{color:colors.text}]}>Complete the notes below. Choose <Text style={{color:ORANGE,fontWeight:'800'}}>ONE WORD AND/OR A NUMBER</Text> for each answer.</Text>
        </View>
        {renderForm(false)}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
          <Text style={styles.submitText}>Submit</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex:1 },
  center:         { flex:1, alignItems:'center', justifyContent:'center' },
  scroll:         { padding:16, paddingBottom:60 },
  header:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1 },
  headerBtn:      { width:34, height:34, alignItems:'center', justifyContent:'center' },
  headerTitle:    { fontSize:16, fontWeight:'800' },
  instructBox:    { borderRadius:10, borderWidth:1.5, padding:12, marginBottom:14 },
  instructText:   { fontSize:12.5, lineHeight:20 },
  formBox:        { borderWidth:1.5, borderRadius:14, padding:16, marginBottom:20 },
  formTitle:      { fontSize:15, fontWeight:'800', textAlign:'center', marginBottom:14 },
  formSection:    { marginBottom:12 },
  sectionHeading: { fontSize:13, fontWeight:'800', marginBottom:8 },
  bulletRow:      { flexDirection:'row', alignItems:'flex-start', marginBottom:12, gap:6 },
  bullet:         { fontSize:16, marginTop:2, flexShrink:0 },
  inlineContent:  { flex:1 },
  inlineText:     { fontSize:13.5, lineHeight:22 },
  qNum:           { fontSize:13.5, fontWeight:'800' },
  inputRow:       { flexDirection:'row', alignItems:'center', flexWrap:'wrap', gap:4, marginTop:4 },
  inlineInput:    { borderWidth:1.5, borderRadius:8, paddingHorizontal:10, paddingVertical:5, fontSize:13.5, minWidth:90, maxWidth:140 },
  reviewRow:      { flexDirection:'row', alignItems:'center', flexWrap:'wrap', gap:6, marginTop:4 },
  reviewBubble:   { flexDirection:'row', alignItems:'center', borderWidth:1.5, borderRadius:8, paddingHorizontal:8, paddingVertical:4, flexWrap:'wrap' },
  bulbBtn:        { width:28, height:28, borderRadius:6, alignItems:'center', justifyContent:'center' },
  submitBtn:      { backgroundColor:ORANGE, borderRadius:12, paddingVertical:14, alignItems:'center' },
  submitText:     { color:'#fff', fontSize:15, fontWeight:'800' },
  resultsWrap:    { flex:1, alignItems:'center', justifyContent:'center', padding:24 },
  resultsCard:    { width:'100%', borderRadius:20, padding:28, alignItems:'center', gap:8 },
  scoreCircle:    { width:100, height:100, borderRadius:50, borderWidth:4, alignItems:'center', justifyContent:'center', marginBottom:8 },
  scoreNum:       { fontSize:26, fontWeight:'800', color:ORANGE },
  scorePct:       { fontSize:12, fontWeight:'600' },
  resultsTitle:   { fontSize:22, fontWeight:'800', marginTop:4 },
  resultsSub:     { fontSize:13, marginBottom:8 },
  resultsBtns:    { flexDirection:'row', gap:10, marginTop:8, width:'100%' },
  resultsBtn:     { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingVertical:13, borderRadius:12 },
  resultsBtnText: { fontSize:14, fontWeight:'800' },
  modalOverlay:   { flex:1, backgroundColor:'rgba(0,0,0,0.5)', alignItems:'center', justifyContent:'center', padding:24 },
  modalCard:      { width:'100%', borderRadius:18, padding:22, borderWidth:1, gap:12 },
  modalTitle:     { fontSize:15, fontWeight:'800' },
  modalPassage:   { fontSize:14, lineHeight:24 },
  modalClose:     { borderRadius:10, paddingVertical:11, alignItems:'center', marginTop:4 },
  modalCloseText: { color:'#fff', fontWeight:'800', fontSize:14 },
});