import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  useColorScheme, ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import { Feather } from '@expo/vector-icons';

const ORANGE = '#e85c2f';
const NAVY   = '#1a2744';

const light = { surface:'#f4f5f8', text:NAVY, muted:'#6b7280', border:'#e2e6ee' };
const dark  = { surface:'#2e323b', text:'#eef0f4', muted:'#8a919e', border:'#3e434f' };

interface Props {
  audioUrl: string | null;
}

export default function AudioPlayer({ audioUrl }: Props) {
  const isDark  = useColorScheme() === 'dark';
  const colors  = isDark ? dark : light;

  const soundRef            = useRef<Audio.Sound | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [duration, setDuration]     = useState(0);
  const [position, setPosition]     = useState(0);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (audioUrl) loadAudio();
    return () => { soundRef.current?.unloadAsync(); };
  }, [audioUrl]);

  const loadAudio = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl! },
        { shouldPlay: false },
        onPlaybackStatusUpdate
      );
      soundRef.current = sound;
    } catch {
      setError('Could not load audio');
    } finally {
      setIsLoading(false);
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying);
    setPosition(status.positionMillis ?? 0);
    setDuration(status.durationMillis ?? 0);
    if (status.didJustFinish) {
      setIsPlaying(false);
      setPosition(0);
      soundRef.current?.setPositionAsync(0);
    }
  };

  const togglePlay = async () => {
    if (!soundRef.current) return;
    if (isPlaying) await soundRef.current.pauseAsync();
    else await soundRef.current.playAsync();
  };

  const seek = async (direction: 'back' | 'forward') => {
    if (!soundRef.current) return;
    const delta  = direction === 'back' ? -10000 : 10000;
    const newPos = Math.max(0, Math.min(position + delta, duration));
    await soundRef.current.setPositionAsync(newPos);
  };

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? position / duration : 0;

  // No audio yet
  if (!audioUrl) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Feather name="headphones" size={20} color={colors.muted} />
        <Text style={[styles.noAudioText, { color: colors.muted }]}>Audio not available yet</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Feather name="alert-circle" size={18} color={ORANGE} />
        <Text style={[styles.noAudioText, { color: ORANGE }]}>{error}</Text>
        <TouchableOpacity onPress={loadAudio} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.playerBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.labelRow}>
        <Feather name="headphones" size={14} color={ORANGE} />
        <Text style={[styles.label, { color: ORANGE }]}>LISTENING</Text>
        <Text style={[styles.timeText, { color: colors.muted }]}>
          {formatTime(position)} / {formatTime(duration)}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.seekBtn}
          onPress={() => seek('back')}
          disabled={isLoading}
          activeOpacity={0.7}
        >
          <Feather name="rotate-ccw" size={18} color={colors.muted} />
          <Text style={[styles.seekLabel, { color: colors.muted }]}>10</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.playBtn, { backgroundColor: ORANGE }]}
          onPress={togglePlay}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Feather name={isPlaying ? 'pause' : 'play'} size={22} color="#fff" />
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.seekBtn}
          onPress={() => seek('forward')}
          disabled={isLoading}
          activeOpacity={0.7}
        >
          <Feather name="rotate-cw" size={18} color={colors.muted} />
          <Text style={[styles.seekLabel, { color: colors.muted }]}>10</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flexDirection:'row', alignItems:'center', gap:10, borderRadius:14, borderWidth:1, padding:14, marginBottom:14 },
  noAudioText:   { fontSize:13, fontWeight:'600', flex:1 },
  retryBtn:      { backgroundColor:ORANGE, borderRadius:8, paddingHorizontal:12, paddingVertical:5 },
  retryText:     { color:'#fff', fontSize:12, fontWeight:'700' },
  playerBox:     { borderRadius:14, borderWidth:1, padding:14, marginBottom:14, gap:10 },
  labelRow:      { flexDirection:'row', alignItems:'center', gap:6 },
  label:         { fontSize:10, fontWeight:'700', letterSpacing:0.6, flex:1 },
  timeText:      { fontSize:11, fontWeight:'600' },
  progressTrack: { height:4, borderRadius:2, overflow:'hidden' },
  progressFill:  { height:'100%', backgroundColor:ORANGE, borderRadius:2 },
  controls:      { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:24 },
  seekBtn:       { alignItems:'center', gap:2 },
  seekLabel:     { fontSize:9, fontWeight:'700' },
  playBtn:       { width:48, height:48, borderRadius:24, alignItems:'center', justifyContent:'center' },
});