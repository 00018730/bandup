import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image as RNImage,
  Animated,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as SplashScreenLib from 'expo-splash-screen';

const ORANGE = '#e85c2f';
const NAVY   = '#1a2744';

// Keep native splash visible until we're ready
SplashScreenLib.preventAutoHideAsync();

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {
  const scale   = useRef(new Animated.Value(0.3)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const textOp  = useRef(new Animated.Value(0)).current;
  const screenOp = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    run();
  }, []);

  const run = async () => {
    // Hide the native splash now that our JS splash is ready
    await SplashScreenLib.hideAsync();

    // Small delay before animation
    await delay(150);

    // Play sound + haptic together
    playSound();
    await delay(80);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Logo scales up with overshoot bounce
    Animated.spring(scale, {
      toValue: 1,
      tension: 80,
      friction: 6,
      useNativeDriver: true,
    }).start();

    // Fade in logo
    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // Name fades in slightly after logo
    await delay(300);
    Animated.timing(textOp, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();

    // Hold for a moment, then fade out to Dashboard
    await delay(900);

    // Subtle second haptic as it fades out
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Animated.timing(screenOp, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => onFinish());
  };

  const playSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/splash_sound.wav'),
        { shouldPlay: true, volume: 0.8 }
      );
      // Unload after playback
      sound.setOnPlaybackStatusUpdate(status => {
        if ('didJustFinish' in status && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (e) {
      // Sound failure is non-critical — animation still plays
      console.log('Sound load error (non-critical):', e);
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: screenOp }]}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />

      {/* Logo mark */}
      <Animated.View style={[{ transform: [{ scale }], opacity }]}>
  <RNImage
    source={require('../assets/IPlogo.png')}
    style={styles.logoImage}
    resizeMode="contain"
  />
</Animated.View>

      {/* App name */}
      <Animated.View style={{ opacity: textOp, alignItems: 'center' }}>
        <View style={styles.nameRow}>
          <Text style={styles.appName}>
            IELTS<Text style={{ color: ORANGE }}>Path</Text>
          </Text>
        </View>
        <Text style={styles.byLine}>
          BY <Text style={{ color: ORANGE }}>MOCK</Text>MASTER
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
  width: 120,
  height: 120,
},
  logoIcon:  { fontSize: 40, color: '#fff' },
  nameRow:   { flexDirection: 'row', alignItems: 'baseline' },
  appName:   { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  byLine:    { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 1.2, marginTop: 4 },
});