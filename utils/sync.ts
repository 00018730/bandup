import { supabase } from '../supabase';
import { getLocalResults, clearLocalProgress } from './storage';

interface ProgressRow {
  user_id:      string;
  test_id:      number;
  score:        number;
  total:        number;
  completed_at: string;
}

interface SupabaseProgressRow {
  score:        number;
  total:        number;
  completed_at: string;
  test_id:      number;
}

// ─── Sync local guest progress to Supabase ────────────────────────────────────
export async function syncLocalProgressToSupabase(userId: string): Promise<void> {
  try {
    const localResults = await getLocalResults();
    if (localResults.length === 0) return;

    const rows: ProgressRow[] = localResults.map(r => ({
      user_id:      userId,
      test_id:      r.testId,
      score:        r.score,
      total:        r.total,
      completed_at: r.completedAt,
    }));

    const { error } = await supabase
      .from('user_progress')
      .upsert(rows, { onConflict: 'user_id,test_id' });

    if (!error) {
      await clearLocalProgress();
      console.log(`Synced ${rows.length} results to Supabase`);
    } else {
      console.error('Sync error:', error.message);
    }
  } catch (e) {
    console.error('syncLocalProgressToSupabase error:', e);
  }
}

// ─── Fetch user stats from Supabase ──────────────────────────────────────────
export async function fetchUserStats(userId: string): Promise<{
  testsCount: number;
  avgBand: string;
  streak: number;
} | null> {
  try {
    const { data, error } = await supabase
      .from('user_progress')
      .select('score, total, completed_at, test_id')
      .eq('user_id', userId);

    if (error || !data) return null;

    const rows = data as SupabaseProgressRow[];
    const testsCount = rows.length;

    const avgBand = testsCount > 0
      ? (rows.reduce((sum: number, r: SupabaseProgressRow) =>
          sum + (r.score / r.total) * 9, 0) / testsCount).toFixed(1)
      : '0.0';

    // Unique days, sorted newest first
    const dates = rows
      .map((r: SupabaseProgressRow) => new Date(r.completed_at).toDateString())
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
      .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime());

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < dates.length; i++) {
      const expected = new Date(today);
      expected.setDate(today.getDate() - i);
      if (dates[i] === expected.toDateString()) streak++;
      else break;
    }

    return { testsCount, avgBand, streak };
  } catch {
    return null;
  }
}