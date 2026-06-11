import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, useColorScheme, Switch, Alert, Modal, Appearance,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Feather, AntDesign } from '@expo/vector-icons';
import { clearLocalProgress } from '../utils/storage';

const ORANGE = '#e85c2f';
const NAVY   = '#1a2744';

const light = { bg:'#ffffff', surface:'#f4f5f8', text:NAVY, muted:'#6b7280', border:'#e2e6ee' };
const dark  = { bg:'#23262d', surface:'#2e323b', text:'#eef0f4', muted:'#8a919e', border:'#3e434f' };

const STORAGE_KEYS = {
  THEME:           'settings_theme',
  NOTIF_ENABLED:   'settings_notif_enabled',
  NOTIF_HOUR:      'settings_notif_hour',
  NOTIF_MINUTE:    'settings_notif_minute',
};

const APP_VERSION = '1.0.0';

type ThemeMode = 'system' | 'light' | 'dark';

function SectionHeader({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={[styles.sectionHeader, { color: colors.muted }]}>{title}</Text>
  );
}

function SettingRow({
  icon, label, sublabel, right, onPress, colors, isDark, danger = false,
}: {
  icon: string; label: string; sublabel?: string;
  right?: React.ReactNode; onPress?: () => void;
  colors: any; isDark: boolean; danger?: boolean;
}) {
  const row = (
    <View style={[styles.row, { backgroundColor: colors.surface }]}>
      <View style={[styles.rowIcon, { backgroundColor: danger ? (isDark?'#2a1212':'#fef2f2') : (isDark?'#2a1a12':'#fff0eb') }]}>
        <Feather name={icon as any} size={16} color={danger ? '#ef4444' : ORANGE} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: danger ? '#ef4444' : colors.text }]}>{label}</Text>
        {sublabel && <Text style={[styles.rowSub, { color: colors.muted }]}>{sublabel}</Text>}
      </View>
      {right ?? (onPress && <Feather name="chevron-right" size={16} color={colors.muted} />)}
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>{row}</TouchableOpacity>
  ) : row;
}

export default function SettingsScreen({ navigation }: any) {
  const systemScheme = useColorScheme();
  const [theme, setTheme]             = useState<ThemeMode>('system');
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifHour, setNotifHour]     = useState(9);
  const [notifMinute, setNotifMinute] = useState(0);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Derive current dark mode
  const isDark = theme === 'system' ? systemScheme === 'dark' : theme === 'dark';
  const colors = isDark ? dark : light;

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    const [t, ne, nh, nm] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.THEME),
      AsyncStorage.getItem(STORAGE_KEYS.NOTIF_ENABLED),
      AsyncStorage.getItem(STORAGE_KEYS.NOTIF_HOUR),
      AsyncStorage.getItem(STORAGE_KEYS.NOTIF_MINUTE),
    ]);
    if (t) setTheme(t as ThemeMode);
    if (ne) setNotifEnabled(ne === 'true');
    if (nh) setNotifHour(parseInt(nh));
    if (nm) setNotifMinute(parseInt(nm));
  };

  // ── Theme ─────────────────────────────────────────────────────────────────
  const applyTheme = async (mode: ThemeMode) => {
    setTheme(mode);
    await AsyncStorage.setItem(STORAGE_KEYS.THEME, mode);
    Appearance.setColorScheme(mode === 'system' ? null : mode);
  };

  // ── Notifications ─────────────────────────────────────────────────────────
  const toggleNotifications = async (val: boolean) => {
    if (val) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please enable notifications in your device settings to use this feature.');
        return;
      }
    }
    setNotifEnabled(val);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTIF_ENABLED, String(val));
    if (val) scheduleNotification(notifHour, notifMinute);
    else await Notifications.cancelAllScheduledNotificationsAsync();
  };

  const scheduleNotification = async (hour: number, minute: number) => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📚 Time to practise!',
        body:  'Your daily IELTS practice session is waiting. Keep your streak going!',
      },
      trigger: { hour, minute, repeats: true } as any,
    });
  };

  const saveReminderTime = async (hour: number, minute: number) => {
    setNotifHour(hour);
    setNotifMinute(minute);
    await AsyncStorage.setItem(STORAGE_KEYS.NOTIF_HOUR, String(hour));
    await AsyncStorage.setItem(STORAGE_KEYS.NOTIF_MINUTE, String(minute));
    if (notifEnabled) scheduleNotification(hour, minute);
    setShowTimePicker(false);
  };

  const formatTime = (h: number, m: number) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
  };

  // ── Clear data ────────────────────────────────────────────────────────────
  const handleClearData = () => {
    Alert.alert(
      'Clear local data',
      'This will delete all practice results saved on this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear', style: 'destructive',
          onPress: async () => {
            await clearLocalProgress();
            Alert.alert('Done', 'Local practice data cleared.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={16} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Appearance ── */}
        <SectionHeader title="APPEARANCE" colors={colors} />
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardLabel, { color: colors.text }]}>Theme</Text>
          <Text style={[styles.cardSub, { color: colors.muted }]}>Choose how IELTSPath looks</Text>
          <View style={styles.themeRow}>
            {(['system', 'light', 'dark'] as ThemeMode[]).map(mode => (
              <TouchableOpacity
                key={mode}
                style={[styles.themeBtn, {
                  backgroundColor: theme === mode ? ORANGE : colors.bg,
                  borderColor: theme === mode ? ORANGE : colors.border,
                }]}
                onPress={() => applyTheme(mode)}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 16, marginBottom: 4 }}>
                  {mode === 'system' ? '⚙️' : mode === 'light' ? '☀️' : '🌙'}
                </Text>
                <Text style={[styles.themeBtnText, { color: theme === mode ? '#fff' : colors.text }]}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Notifications ── */}
        <SectionHeader title="NOTIFICATIONS" colors={colors} />
        <View style={[styles.groupCard, { borderColor: colors.border }]}>
          <View style={[styles.row, { backgroundColor: colors.surface }]}>
            <View style={[styles.rowIcon, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb' }]}>
              <Feather name="bell" size={16} color={ORANGE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Daily reminder</Text>
              <Text style={[styles.rowSub, { color: colors.muted }]}>
                {notifEnabled ? `Reminder set for ${formatTime(notifHour, notifMinute)}` : 'Off'}
              </Text>
            </View>
            <Switch
              value={notifEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: colors.border, true: ORANGE }}
              thumbColor="#fff"
            />
          </View>

          {notifEnabled && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <TouchableOpacity
                style={[styles.row, { backgroundColor: colors.surface }]}
                onPress={() => setShowTimePicker(true)}
                activeOpacity={0.75}
              >
                <View style={[styles.rowIcon, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb' }]}>
                  <Feather name="clock" size={16} color={ORANGE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Reminder time</Text>
                  <Text style={[styles.rowSub, { color: colors.muted }]}>{formatTime(notifHour, notifMinute)}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.muted} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Data ── */}
        <SectionHeader title="DATA" colors={colors} />
        <View style={[styles.groupCard, { borderColor: colors.border }]}>
          <SettingRow
            icon="trash-2" label="Clear local data" danger
            sublabel="Remove practice results saved on this device"
            onPress={handleClearData} colors={colors} isDark={isDark}
          />
        </View>

        {/* ── About ── */}
        <SectionHeader title="ABOUT" colors={colors} />
        <View style={[styles.groupCard, { borderColor: colors.border }]}>
          <SettingRow icon="info" label="Version" sublabel={`IELTSPath v${APP_VERSION}`} colors={colors} isDark={isDark} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingRow icon="shield" label="Privacy Policy" onPress={() => {}} colors={colors} isDark={isDark} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingRow icon="file-text" label="Terms of Service" onPress={() => {}} colors={colors} isDark={isDark} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingRow icon="star" label="Rate IELTSPath" sublabel="Enjoying the app? Leave us a review!" onPress={() => {}} colors={colors} isDark={isDark} />
        </View>

      </ScrollView>

      {/* ── Time Picker Modal ── */}
      <Modal visible={showTimePicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTimePicker(false)}>
          <View style={[styles.timePickerSheet, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Set reminder time</Text>

            <TimePickerInline
              hour={notifHour} minute={notifMinute}
              colors={colors} isDark={isDark}
              onConfirm={saveReminderTime}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Inline Time Picker ───────────────────────────────────────────────────────
function TimePickerInline({ hour, minute, colors, isDark, onConfirm }: {
  hour: number; minute: number; colors: any; isDark: boolean;
  onConfirm: (h: number, m: number) => void;
}) {
  const [h, setH] = useState(hour);
  const [m, setM] = useState(minute);
  const period  = h >= 12 ? 'PM' : 'AM';
  const hour12  = h % 12 === 0 ? 12 : h % 12;

  const pad = (n: number) => n.toString().padStart(2, '0');

  const adjH = (d: number) => setH(prev => (prev + d + 24) % 24);
  const adjM = (d: number) => setM(prev => (prev + d + 60) % 60);
  const togglePeriod = () => setH(prev => prev < 12 ? prev + 12 : prev - 12);

  return (
    <View style={styles.tpWrap}>
      <View style={styles.tpRow}>
        {/* Hour */}
        <View style={styles.tpCol}>
          <TouchableOpacity onPress={() => adjH(1)} style={[styles.tpArrow, { backgroundColor: colors.surface }]}>
            <Feather name="chevron-up" size={22} color={ORANGE} />
          </TouchableOpacity>
          <Text style={[styles.tpNum, { color: colors.text }]}>{pad(hour12)}</Text>
          <TouchableOpacity onPress={() => adjH(-1)} style={[styles.tpArrow, { backgroundColor: colors.surface }]}>
            <Feather name="chevron-down" size={22} color={ORANGE} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.tpColon, { color: colors.text }]}>:</Text>

        {/* Minute */}
        <View style={styles.tpCol}>
          <TouchableOpacity onPress={() => adjM(5)} style={[styles.tpArrow, { backgroundColor: colors.surface }]}>
            <Feather name="chevron-up" size={22} color={ORANGE} />
          </TouchableOpacity>
          <Text style={[styles.tpNum, { color: colors.text }]}>{pad(m)}</Text>
          <TouchableOpacity onPress={() => adjM(-5)} style={[styles.tpArrow, { backgroundColor: colors.surface }]}>
            <Feather name="chevron-down" size={22} color={ORANGE} />
          </TouchableOpacity>
        </View>

        {/* AM/PM */}
        <TouchableOpacity
          style={[styles.tpPeriod, { backgroundColor: isDark ? '#2a1a12' : '#fff0eb', borderColor: ORANGE }]}
          onPress={togglePeriod}
        >
          <Text style={[styles.tpPeriodText, { color: ORANGE }]}>{period}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.tpConfirm} onPress={() => onConfirm(h, m)} activeOpacity={0.85}>
        <Text style={styles.tpConfirmText}>Set reminder</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1 },
  header:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1 },
  headerBtn:      { width:34, height:34, alignItems:'center', justifyContent:'center' },
  headerTitle:    { fontSize:16, fontWeight:'800' },
  scroll:         { paddingHorizontal:16, paddingTop:16, paddingBottom:48 },
  sectionHeader:  { fontSize:10, fontWeight:'700', letterSpacing:0.8, marginBottom:8, marginTop:20, marginLeft:4 },

  // Appearance card
  card:           { borderRadius:14, padding:16, marginBottom:0 },
  cardLabel:      { fontSize:15, fontWeight:'700', marginBottom:2 },
  cardSub:        { fontSize:12, marginBottom:14 },
  themeRow:       { flexDirection:'row', gap:10 },
  themeBtn:       { flex:1, borderWidth:1.5, borderRadius:12, paddingVertical:12, alignItems:'center', gap:2 },
  themeBtnText:   { fontSize:12, fontWeight:'700' },

  // Group card (multiple rows)
  groupCard:      { borderRadius:14, overflow:'hidden', borderWidth:0 },
  row:            { flexDirection:'row', alignItems:'center', gap:12, padding:14 },
  rowIcon:        { width:34, height:34, borderRadius:9, alignItems:'center', justifyContent:'center' },
  rowLabel:       { fontSize:14, fontWeight:'600' },
  rowSub:         { fontSize:11.5, marginTop:1 },
  divider:        { height:1, marginLeft:60 },

  // Modal
  modalOverlay:   { flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,0.4)' },
  timePickerSheet:{ borderTopLeftRadius:20, borderTopRightRadius:20, borderTopWidth:1, paddingTop:12, paddingBottom:40 },
  sheetHandle:    { width:40, height:4, borderRadius:2, alignSelf:'center', marginBottom:16 },
  sheetTitle:     { fontSize:16, fontWeight:'800', paddingHorizontal:24, marginBottom:8 },

  // Time picker
  tpWrap:         { paddingHorizontal:24, paddingTop:8 },
  tpRow:          { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:12, marginBottom:24 },
  tpCol:          { alignItems:'center', gap:8 },
  tpArrow:        { width:44, height:44, borderRadius:12, alignItems:'center', justifyContent:'center' },
  tpNum:          { fontSize:48, fontWeight:'800', width:72, textAlign:'center' },
  tpColon:        { fontSize:40, fontWeight:'800', marginBottom:8 },
  tpPeriod:       { width:56, height:56, borderRadius:12, borderWidth:2, alignItems:'center', justifyContent:'center', marginLeft:4 },
  tpPeriodText:   { fontSize:18, fontWeight:'800' },
  tpConfirm:      { backgroundColor:ORANGE, borderRadius:12, paddingVertical:14, alignItems:'center' },
  tpConfirmText:  { color:'#fff', fontSize:15, fontWeight:'800' },
});