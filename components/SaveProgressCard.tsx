import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

const ORANGE = '#e85c2f';
const NAVY   = '#1a2744';

export default function SaveProgressCard({
  onSignUp,
  onDismiss,
  completedCount,
}: {
  onSignUp: () => void;
  onDismiss: () => void;
  completedCount: number;
}) {
  const isDark = useColorScheme() === 'dark';

  const message = completedCount === 1
    ? "You just completed your first test!"
    : `You've completed ${completedCount} tests as a guest!`;

  return (
    <View style={[styles.card, {
      backgroundColor: isDark ? '#2a1a12' : '#fff8f6',
      borderColor: ORANGE,
    }]}>
      {/* Dismiss */}
      <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss}>
        <Feather name="x" size={14} color={isDark ? '#8a919e' : '#6b7280'} />
      </TouchableOpacity>

      {/* Icon + text */}
      <View style={styles.top}>
        <View style={[styles.iconWrap, { backgroundColor: ORANGE }]}>
          <Feather name="bookmark" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: isDark ? '#eef0f4' : NAVY }]}>
            Save your progress
          </Text>
          <Text style={[styles.sub, { color: isDark ? '#8a919e' : '#6b7280' }]}>
            {message} Create a free account to track your band score and streak.
          </Text>
        </View>
      </View>

      {/* CTA */}
      <TouchableOpacity style={styles.cta} onPress={onSignUp} activeOpacity={0.85}>
        <Text style={styles.ctaText}>Create free account</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onDismiss} style={styles.skipBtn}>
        <Text style={[styles.skipText, { color: isDark ? '#8a919e' : '#6b7280' }]}>
          Continue without saving
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card:       { borderWidth: 1.5, borderRadius: 16, padding: 16, marginTop: 14, position: 'relative' },
  dismissBtn: { position: 'absolute', top: 12, right: 12, zIndex: 1 },
  top:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14, paddingRight: 20 },
  iconWrap:   { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:      { fontSize: 14, fontWeight: '800', marginBottom: 3 },
  sub:        { fontSize: 12.5, lineHeight: 18 },
  cta:        { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginBottom: 8 },
  ctaText:    { color: '#fff', fontSize: 13.5, fontWeight: '800' },
  skipBtn:    { alignItems: 'center', paddingVertical: 4 },
  skipText:   { fontSize: 12, fontWeight: '600' },
});