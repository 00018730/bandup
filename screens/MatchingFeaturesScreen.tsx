import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, useColorScheme, ActivityIndicator, Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { saveLocalResult, getCompletedCount, hasSeenSavePrompt, markSavePromptSeen } from '../utils/storage';
import SaveProgressCard from '../components/SaveProgressCard';
import { supabase } from '../supabase';

const ORANGE = '#e85c2f';
const NAVY   = '#1a2744';
const GREEN  = '#22c55e';

const light = { bg:'#ffffff', surface:'#f4f5f8', text:NAVY, muted:'#6b7280', border:'#e2e6ee' };
const dark  = { bg:'#23262d', surface:'#2e323b', text:'#eef0f4', muted:'#8a919e', border:'#3e434f' };

interface Question { id:number; body:string; correct_answer:string; answer_location:string; sort_order:number; }
interface Test { id:number; title:string; passage:string; extra_data:{ features:string[] }; questions:Question[]; }
type ScreenMode = 'test'|'results'|'review';

function HighlightedText({ text, highlight, textStyle }:{ text:string; highlight:string; textStyle:any }) {
  if (!highlight||!text) return <Text style={textStyle}>{text}</Text>;
  const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'));
  return <Text style={textStyle}>{parts.map((p,i)=>p.toLowerCase()===highlight.toLowerCase()?<Text key={i} style={{color:ORANGE,fontWeight:'800',textDecorationLine:'underline'}}>{p}</Text>:p)}</Text>;
}

function FeaturePicker({ visible, features, selected, onSelect, onClose, colors, isDark }:{
  visible:boolean; features:string[]; selected:string|null;
  onSelect:(f:string)=>void; onClose:()=>void; colors:any; isDark:boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.sheet,{backgroundColor:colors.bg,borderTopColor:colors.border}]}>
          <View style={[styles.sheetHandle,{backgroundColor:colors.border}]}/>
          <Text style={[styles.sheetTitle,{color:colors.text}]}>Select a feature</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {features.map((f,i)=>{
              const isSel = selected===f;
              return (
                <TouchableOpacity key={i} style={[styles.sheetItem,{borderBottomColor:colors.border},isSel&&{backgroundColor:isDark?'#2a1a12':'#fff0eb'}]} onPress={()=>{onSelect(f);onClose();}} activeOpacity={0.75}>
                  <View style={[styles.sheetBadge,{backgroundColor:isSel?ORANGE:colors.surface}]}>
                    <Text style={[styles.sheetBadgeText,{color:isSel?'#fff':colors.muted}]}>{String.fromCharCode(65+i)}</Text>
                  </View>
                  <Text style={[styles.sheetItemText,{color:isSel?ORANGE:colors.text}]} numberOfLines={2}>{f}</Text>
                  {isSel&&<Feather name="check" size={14} color={ORANGE}/>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={[styles.sheetCancel,{borderTopColor:colors.border}]} onPress={onClose}>
            <Text style={[styles.sheetCancelText,{color:colors.muted}]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default function MatchingFeaturesScreen({ route, navigation }:any) {
  const { testId, testTitle } = route?.params ?? {};
  const isDark  = useColorScheme() === 'dark';
  const colors  = isDark ? dark : light;

  const [test, setTest]           = useState<Test|null>(null);
  const [loading, setLoading]     = useState(true);
  const [answers, setAnswers]     = useState<Record<number,string|null>>({});
  const [screenMode, setScreenMode] = useState<ScreenMode>('test');
  const [score, setScore]         = useState(0);
  const [modalQ, setModalQ]       = useState<Question|null>(null);
  const [pickerQ, setPickerQ]     = useState<Question|null>(null);
  const [highlights, setHighlights] = useState<[number,number][]>([]);
  const [selectStart, setSelectStart] = useState<number|null>(null);

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
      .from('tests').select(`id, title, passage, extra_data, questions(id, body, correct_answer, answer_location, sort_order)`)
      .eq('id', testId).single();
    if (!error&&data) setTest({...data, questions:[...(data.questions??[])].sort((a:Question,b:Question)=>a.sort_order-b.sort_order)} as Test);
    setLoading(false);
  };

  const features: string[] = test?.extra_data?.features ?? [];

  const handleSubmit = async () => {
  if (!test) return;
  let correct = 0;
  test.questions.forEach(q => {
    if ((answers[q.id] ?? '') === q.correct_answer) correct++;
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

  const handleWordTap = (index:number) => {
    const ei = highlights.findIndex(([s,e])=>index>=s&&index<=e);
    if (ei!==-1) { setHighlights(prev=>prev.filter((_,i)=>i!==ei)); setSelectStart(null); return; }
    if (selectStart===null) setSelectStart(index);
    else { setHighlights(prev=>[...prev,[Math.min(selectStart,index),Math.max(selectStart,index)]]); setSelectStart(null); }
  };
  const isHL = (i:number) => highlights.some(([s,e])=>i>=s&&i<=e);
  const isPending = (i:number) => selectStart!==null&&i===selectStart;

  const renderPassage = () => {
    if (!test) return null;
    const paragraphs = test.passage.split('\n').filter(p=>p.trim().length>0);
    const selecting  = selectStart!==null;
    let wi = 0;
    return (
      <View style={[styles.passageCard,{backgroundColor:colors.surface}]}>
        <View style={styles.passageHeader}>
          <Text style={[styles.passageLabel,{color:ORANGE}]}>PASSAGE</Text>
          <View style={styles.passageHintRow}>
            {selecting&&<TouchableOpacity onPress={()=>setSelectStart(null)} style={[styles.cancelBtn,{borderColor:colors.border}]}><Feather name="x" size={11} color={colors.muted}/><Text style={[{fontSize:10,fontWeight:'600' as const,color:colors.muted}]}>Cancel</Text></TouchableOpacity>}
            <Text style={[styles.passageHint,{color:selecting?ORANGE:colors.muted}]}>{selecting?'Tap end of selection':'Tap to highlight'}</Text>
          </View>
        </View>
        {paragraphs.map((para,pi)=>(
          <View key={pi} style={[styles.passageWords,{marginBottom:10}]}>
            {para.split(' ').filter(w=>w.length>0).map(word=>{const i=wi++;return(
              <TouchableOpacity key={i} onPress={()=>handleWordTap(i)} activeOpacity={0.7}>
                <Text style={[styles.passageWord,{color:colors.text},isHL(i)&&{backgroundColor:'#fff0eb',color:ORANGE,fontWeight:'700',borderRadius:3},isPending(i)&&{backgroundColor:'#ffd9cc',color:ORANGE,borderRadius:3}]}>{word}{' '}</Text>
              </TouchableOpacity>
            );})}
          </View>
        ))}
        {highlights.length>0&&<TouchableOpacity onPress={()=>setHighlights([])} style={styles.clearBtn}><Feather name="trash-2" size={12} color={colors.muted}/><Text style={[{fontSize:11,fontWeight:'600' as const,color:colors.muted}]}>Clear highlights</Text></TouchableOpacity>}
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
        {test.questions.map((q,i)=>{
          const userAns=answers[q.id]??null; const isCorrect=userAns===q.correct_answer;
          return (
            <View key={q.id} style={[styles.reviewCard,{backgroundColor:colors.surface,borderLeftColor:isCorrect?GREEN:ORANGE}]}>
              <View style={styles.reviewTop}>
                <Text style={[styles.reviewQNum,{color:ORANGE}]}>{i+1}</Text>
                <Text style={[styles.reviewQBody,{color:colors.text}]}>{q.body}</Text>
                <TouchableOpacity onPress={()=>setModalQ(q)} style={[styles.bulbBtn,{backgroundColor:isDark?'#2a2210':'#fffbe6'}]}><Text style={{fontSize:14}}>💡</Text></TouchableOpacity>
              </View>
              <View style={styles.reviewAnswers}>
                <View><Text style={[styles.reviewLabel,{color:colors.muted}]}>Your answer</Text><Text style={[styles.reviewVal,{color:isCorrect?GREEN:ORANGE}]} numberOfLines={2}>{userAns??'—'}</Text></View>
                {!isCorrect&&<View><Text style={[styles.reviewLabel,{color:colors.muted}]}>Correct</Text><Text style={[styles.reviewVal,{color:GREEN}]} numberOfLines={2}>{q.correct_answer}</Text></View>}
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

        {renderPassage()}

        {/* Features list */}
        <View style={[styles.featuresBox,{backgroundColor:colors.surface}]}>
          <Text style={[styles.featuresTitle,{color:colors.muted}]}>LIST OF FEATURES</Text>
          {features.map((f,i)=>(
            <View key={i} style={styles.featureRow}>
              <View style={[styles.featureBadge,{backgroundColor:isDark?'#2a1a12':'#fff0eb'}]}>
                <Text style={[styles.featureBadgeText,{color:ORANGE}]}>{String.fromCharCode(65+i)}</Text>
              </View>
              <Text style={[styles.featureText,{color:colors.text}]}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.instructBox,{backgroundColor:isDark?'#2a1a12':'#fff8f6',borderColor:ORANGE}]}>
          <Text style={[styles.instructText,{color:colors.text}]}>Match each statement with the correct feature <Text style={{color:ORANGE,fontWeight:'800'}}>A–{String.fromCharCode(64+features.length)}</Text>. You may use any letter more than once.</Text>
        </View>

        {test.questions.map((q,i)=>{
          const selected=answers[q.id]??null;
          const fi=selected ? features.indexOf(selected) : -1;
          return (
            <View key={q.id} style={[styles.questionCard,{backgroundColor:colors.surface}]}>
              <View style={styles.questionTop}>
                <Text style={[styles.questionNum,{color:ORANGE}]}>{i+1}</Text>
                <Text style={[styles.questionBody,{color:colors.text}]}>{q.body}</Text>
              </View>
              <TouchableOpacity
                style={[styles.dropdown,{borderColor:selected?ORANGE:colors.border,backgroundColor:selected?(isDark?'#2a1a12':'#fff0eb'):colors.bg}]}
                onPress={()=>setPickerQ(q)} activeOpacity={0.8}
              >
                <Text style={[styles.dropdownText,{color:selected?ORANGE:colors.muted}]}>
                  {selected ? `${String.fromCharCode(65+fi)}. ${selected}` : 'Select a feature...'}
                </Text>
                <Feather name="chevron-down" size={16} color={selected?ORANGE:colors.muted}/>
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
          <Text style={styles.submitText}>Submit</Text>
        </TouchableOpacity>
      </ScrollView>

      <FeaturePicker
        visible={!!pickerQ}
        features={features}
        selected={pickerQ ? (answers[pickerQ.id]??null) : null}
        onSelect={f=>{ if(pickerQ) setAnswers(prev=>({...prev,[pickerQ.id]:f})); }}
        onClose={()=>setPickerQ(null)}
        colors={colors} isDark={isDark}
      />
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
  passageCard:    { borderRadius:14, padding:16, marginBottom:14 },
  passageHeader:  { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
  passageLabel:   { fontSize:10, fontWeight:'700', letterSpacing:0.6 },
  passageHintRow: { flexDirection:'row', alignItems:'center', gap:6 },
  passageHint:    { fontSize:10, fontWeight:'600', fontStyle:'italic' },
  cancelBtn:      { flexDirection:'row', alignItems:'center', gap:3, borderWidth:1, borderRadius:10, paddingHorizontal:7, paddingVertical:3 },
  passageWords:   { flexDirection:'row', flexWrap:'wrap' },
  passageWord:    { fontSize:13.5, lineHeight:24 },
  clearBtn:       { flexDirection:'row', alignItems:'center', gap:5, marginTop:8, alignSelf:'flex-end' },
  featuresBox:    { borderRadius:14, padding:14, marginBottom:12 },
  featuresTitle:  { fontSize:10, fontWeight:'700', letterSpacing:0.6, marginBottom:10 },
  featureRow:     { flexDirection:'row', alignItems:'flex-start', gap:10, marginBottom:8 },
  featureBadge:   { width:28, height:28, borderRadius:8, alignItems:'center', justifyContent:'center', flexShrink:0 },
  featureBadgeText:{ fontSize:13, fontWeight:'800' },
  featureText:    { flex:1, fontSize:13, lineHeight:19 },
  instructBox:    { borderRadius:10, borderWidth:1.5, padding:12, marginBottom:14 },
  instructText:   { fontSize:12.5, lineHeight:20 },
  questionCard:   { borderRadius:14, padding:14, marginBottom:10 },
  questionTop:    { flexDirection:'row', alignItems:'flex-start', gap:10, marginBottom:10 },
  questionNum:    { fontSize:15, fontWeight:'800', flexShrink:0, marginTop:1 },
  questionBody:   { flex:1, fontSize:13.5, lineHeight:21 },
  dropdown:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', borderWidth:1.5, borderRadius:10, paddingHorizontal:12, paddingVertical:10 },
  dropdownText:   { fontSize:13, fontWeight:'600', flex:1 },
  submitBtn:      { backgroundColor:ORANGE, borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:4 },
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
  reviewCard:     { borderRadius:14, padding:14, marginBottom:10, borderLeftWidth:4 },
  reviewTop:      { flexDirection:'row', alignItems:'flex-start', gap:8, marginBottom:10 },
  reviewQNum:     { fontSize:14, fontWeight:'800', flexShrink:0 },
  reviewQBody:    { flex:1, fontSize:13.5, lineHeight:20 },
  bulbBtn:        { width:28, height:28, borderRadius:6, alignItems:'center', justifyContent:'center', flexShrink:0 },
  reviewAnswers:  { gap:6 },
  reviewLabel:    { fontSize:11, fontWeight:'600', marginBottom:2 },
  reviewVal:      { fontSize:13, fontWeight:'800' },
  sheetOverlay:   { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  sheet:          { borderTopLeftRadius:20, borderTopRightRadius:20, borderTopWidth:1, paddingTop:12, maxHeight:'70%' },
  sheetHandle:    { width:40, height:4, borderRadius:2, alignSelf:'center', marginBottom:12 },
  sheetTitle:     { fontSize:15, fontWeight:'800', paddingHorizontal:20, marginBottom:10 },
  sheetItem:      { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1 },
  sheetBadge:     { width:32, height:32, borderRadius:8, alignItems:'center', justifyContent:'center', flexShrink:0 },
  sheetBadgeText: { fontSize:14, fontWeight:'800' },
  sheetItemText:  { flex:1, fontSize:13, lineHeight:18 },
  sheetCancel:    { borderTopWidth:1, paddingVertical:16, alignItems:'center', marginTop:4 },
  sheetCancelText:{ fontSize:14, fontWeight:'600' },
  modalOverlay:   { flex:1, backgroundColor:'rgba(0,0,0,0.5)', alignItems:'center', justifyContent:'center', padding:24 },
  modalCard:      { width:'100%', borderRadius:18, padding:22, borderWidth:1, gap:12 },
  modalTitle:     { fontSize:15, fontWeight:'800' },
  modalPassage:   { fontSize:14, lineHeight:24 },
  modalClose:     { borderRadius:10, paddingVertical:11, alignItems:'center', marginTop:4 },
  modalCloseText: { color:'#fff', fontWeight:'800', fontSize:14 },
});