import 'react-native-get-random-values';

import TelegramAuthScreen from './screens/TelegramAuthScreen';
// ...


import React, { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, ActivityIndicator, useColorScheme, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from './supabase';

// ─── Main screens ──────────────────────────────────────────────────────────────
import SplashScreen             from './screens/SplashScreen';
import AuthScreen               from './screens/AuthScreen';
import ConfirmationScreen       from './screens/ConfirmationScreen';
import DashboardScreen          from './screens/DashboardScreen';
import PracticeScreen           from './screens/PracticeScreen';
import SkillTestsScreen         from './screens/SkillTestsScreen';
import ReadingTestScreen        from './screens/ReadingTestScreen';
import TFNGTestScreen           from './screens/TFNGTestScreen';
import MatchingParaScreen       from './screens/MatchingParaScreen';
import MultipleChoiceScreen     from './screens/MultipleChoiceScreen';
import MatchingHeadingsScreen   from './screens/MatchingHeadingsScreen';
import MatchingFeaturesScreen   from './screens/MatchingFeaturesScreen';
import TableCompletionScreen    from './screens/TableCompletionScreen';
import ShortAnswerScreen        from './screens/ShortAnswerScreen';
import ListeningFillBlankScreen from './screens/ListeningFillBlankScreen';
import ListeningMCScreen        from './screens/ListeningMCScreen';
import ListeningMatchingScreen  from './screens/ListeningMatchingScreen';
import { ListeningTableScreen, ListeningShortAnswerScreen } from './screens/ListeningOtherScreens';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import ProfileScreen      from './screens/ProfileScreen';
import SettingsScreen     from './screens/SettingsScreen';

import PassageTestScreen from './screens/PassageTestScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const ORANGE    = '#e85c2f';
const NAVY_DARK = '#0d1a2e';

// ─── Placeholder tab screens ──────────────────────────────────────────────────
function AICoachScreen() {
  const isDark = useColorScheme() === 'dark';
  const bg   = isDark ? NAVY_DARK : '#f0f2f7';
  const text = isDark ? '#eef0f4' : '#1a2744';
  const muted= isDark ? '#8a919e' : '#6b7280';
  return (
    <SafeAreaView style={{ flex:1, backgroundColor:bg, alignItems:'center', justifyContent:'center', gap:12 }}>
      <Text style={{ fontSize:44 }}>🤖</Text>
      <Text style={{ fontSize:22, fontWeight:'800', color:text }}>AI Coach</Text>
      <Text style={{ fontSize:13, color:muted, textAlign:'center', paddingHorizontal:40, lineHeight:20 }}>
        Personalised Writing & Speaking feedback scored at examiner level — coming soon.
      </Text>
      <View style={{ backgroundColor:ORANGE, borderRadius:20, paddingHorizontal:16, paddingVertical:6, marginTop:4 }}>
        <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }}>Coming Soon</Text>
      </View>
    </SafeAreaView>
  );
}

function StudyToolsScreen() {
  const isDark = useColorScheme() === 'dark';
  const bg   = isDark ? NAVY_DARK : '#f0f2f7';
  const text = isDark ? '#eef0f4' : '#1a2744';
  const muted= isDark ? '#8a919e' : '#6b7280';
  return (
    <SafeAreaView style={{ flex:1, backgroundColor:bg, alignItems:'center', justifyContent:'center', gap:12 }}>
      <Text style={{ fontSize:44 }}>📚</Text>
      <Text style={{ fontSize:22, fontWeight:'800', color:text }}>Study Tools</Text>
      <Text style={{ fontSize:13, color:muted, textAlign:'center', paddingHorizontal:40, lineHeight:20 }}>
        Podcasts, shadowing, vocabulary tools, and writing samples — coming in the next update.
      </Text>
      <View style={{ backgroundColor:ORANGE, borderRadius:20, paddingHorizontal:16, paddingVertical:6, marginTop:4 }}>
        <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }}>Coming Soon</Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Tab icon ─────────────────────────────────────────────────────────────────
function TabIcon({ name, focused, lib='feather' }: { name:string; focused:boolean; lib?:string }) {
  const color = focused ? ORANGE : '#64748b';
  if (lib === 'ion') return <Ionicons name={name as any} size={22} color={color} />;
  return <Feather name={name as any} size={20} color={color} />;
}

// ─── Bottom tab navigator ─────────────────────────────────────────────────────
function MainTabs() {
  const isDark = useColorScheme() === 'dark';

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? NAVY_DARK : '#ffffff',
          borderTopWidth: 1,
          borderTopColor: isDark ? '#1e3050' : '#e2e6ee',
          // ↓ Platform-aware height so the iOS home indicator
          //   doesn't overlap the tab labels
          height:        Platform.OS === 'ios' ? 84 : 62,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor:   ORANGE,
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tab.Screen name="Home"        component={DashboardScreen} options={{ tabBarIcon: ({focused}) => <TabIcon name="home"      focused={focused} /> }} />
      <Tab.Screen name="Practice"    component={PracticeScreen}  options={{ tabBarIcon: ({focused}) => <TabIcon name="book-open" focused={focused} /> }} />
      <Tab.Screen name="AI Coach"    component={AICoachScreen}   options={{ tabBarIcon: ({focused}) => <TabIcon name="sparkles-outline" focused={focused} lib="ion" /> }} />
      <Tab.Screen name="Study Tools" component={StudyToolsScreen} options={{ tabBarIcon: ({focused}) => <TabIcon name="layers"   focused={focused} /> }} />
      <Tab.Screen name="Profile"     component={ProfileScreen}   options={{ tabBarIcon: ({focused}) => <TabIcon name="user"      focused={focused} /> }} />
    </Tab.Navigator>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [appReady, setAppReady]     = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(() => setAppReady(true));
  }, []);

  if (!splashDone) return <SplashScreen onFinish={() => setSplashDone(true)} />;
  if (!appReady)   return (
    <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
      <ActivityIndicator size="large" color={ORANGE} />
    </View>
  );

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="MainTabs">

        <Stack.Screen name="MainTabs"    component={MainTabs} />

        {/* Auth */}
        <Stack.Screen name="Auth"         component={AuthScreen} />
        <Stack.Screen name="Confirmation" component={ConfirmationScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="Settings"     component={SettingsScreen} />
        <Stack.Screen name="TelegramAuth" component={TelegramAuthScreen} />

        {/* Skill test browser */}
        <Stack.Screen name="SkillTests" component={SkillTestsScreen} />

        {/* Reading */}
        <Stack.Screen name="ReadingTest"      component={ReadingTestScreen} />
        <Stack.Screen name="PassageTest" component={PassageTestScreen} />
        
        <Stack.Screen name="TFNGTest"         component={TFNGTestScreen} />
        <Stack.Screen name="MatchingPara"     component={MatchingParaScreen} />
        <Stack.Screen name="MatchingHeadings" component={MatchingHeadingsScreen} />
        <Stack.Screen name="MatchingFeatures" component={MatchingFeaturesScreen} />
        <Stack.Screen name="MultipleChoice"   component={MultipleChoiceScreen} />
        <Stack.Screen name="TableCompletion"  component={TableCompletionScreen} />
        <Stack.Screen name="ShortAnswer"      component={ShortAnswerScreen} />

        {/* Listening */}
        <Stack.Screen name="ListeningFillBlank"   component={ListeningFillBlankScreen} />
        <Stack.Screen name="ListeningMC"          component={ListeningMCScreen} />
        <Stack.Screen name="ListeningMatching"    component={ListeningMatchingScreen} />
        <Stack.Screen name="ListeningTable"       component={ListeningTableScreen} />
        <Stack.Screen name="ListeningShortAnswer" component={ListeningShortAnswerScreen} />

      </Stack.Navigator>
    </NavigationContainer>
  );
}