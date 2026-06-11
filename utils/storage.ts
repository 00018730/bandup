import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  GUEST_PROGRESS:  'guest_progress',
  TESTS_COMPLETED: 'tests_completed_count',
  HAS_SEEN_PROMPT: 'has_seen_save_prompt',
};

export interface LocalTestResult {
  testId:     number;
  testTitle:  string;
  skill:      string;
  type:       string;
  score:      number;
  total:      number;
  completedAt: string;
}

// ─── Save a test result locally ───────────────────────────────────────────────
export async function saveLocalResult(result: LocalTestResult): Promise<void> {
  try {
    const existing = await getLocalResults();
    const updated  = [...existing.filter(r => r.testId !== result.testId), result];
    await AsyncStorage.setItem(KEYS.GUEST_PROGRESS, JSON.stringify(updated));

    // Increment completed count
    const count = await getCompletedCount();
    await AsyncStorage.setItem(KEYS.TESTS_COMPLETED, String(count + 1));
  } catch (e) {
    console.error('saveLocalResult error:', e);
  }
}

// ─── Get all local results ────────────────────────────────────────────────────
export async function getLocalResults(): Promise<LocalTestResult[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.GUEST_PROGRESS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─── Get total completed test count ──────────────────────────────────────────
export async function getCompletedCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.TESTS_COMPLETED);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

// ─── Check if user has seen save prompt ──────────────────────────────────────
export async function hasSeenSavePrompt(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.HAS_SEEN_PROMPT);
    return raw === 'true';
  } catch {
    return false;
  }
}

export async function markSavePromptSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.HAS_SEEN_PROMPT, 'true');
  } catch {}
}

// ─── Clear all local progress (after sync) ───────────────────────────────────
export async function clearLocalProgress(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([KEYS.GUEST_PROGRESS, KEYS.TESTS_COMPLETED]);
  } catch {}
}