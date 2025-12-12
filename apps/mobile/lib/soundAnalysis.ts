// lib/soundAnalysis.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_SOUND_COUNT = '@ovrtk/sound.analysis.count';
const STORAGE_SOUND_RESET = '@ovrtk/sound.analysis.reset';

export type SoundTier = 'FREE' | 'PLUS' | 'TRACK_MODE' | 'CLUB';


const SOUND_LIMITS: Record<SoundTier, number> = {
  FREE: 0,
  PLUS: 5,
  TRACK_MODE: 20,
  CLUB: 50,
};

export const RECORDING_DURATION: Record<SoundTier, number> = {
  FREE: 0,
  PLUS: 30,
  TRACK_MODE: 30,  // ← All get 30 seconds
  CLUB: 30,        // ← All get 30 seconds
};

/**
 * Get current month key for resetting counts
 */
function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

/**
 * Check if we need to reset the counter (new month)
 */
async function checkAndResetIfNeeded(): Promise<void> {
  try {
    const currentMonth = getCurrentMonthKey();
    const storedMonth = await AsyncStorage.getItem(STORAGE_SOUND_RESET);

    if (storedMonth !== currentMonth) {
      // New month, reset counter
      await AsyncStorage.setItem(STORAGE_SOUND_COUNT, '0');
      await AsyncStorage.setItem(STORAGE_SOUND_RESET, currentMonth);
      console.log('[SoundAnalysis] Counter reset for new month:', currentMonth);
    }
  } catch (error) {
    console.error('[SoundAnalysis] Reset check failed:', error);
  }
}

/**
 * Get current sound analysis count for this month
 */
export async function getSoundAnalysisCount(): Promise<number> {
  try {
    await checkAndResetIfNeeded();
    const raw = await AsyncStorage.getItem(STORAGE_SOUND_COUNT);
    return raw ? parseInt(raw, 10) : 0;
  } catch (error) {
    console.error('[SoundAnalysis] Failed to get count:', error);
    return 0;
  }
}

/**
 * Increment sound analysis count
 */
export async function incrementSoundAnalysisCount(): Promise<number> {
  try {
    const current = await getSoundAnalysisCount();
    const next = current + 1;
    await AsyncStorage.setItem(STORAGE_SOUND_COUNT, String(next));
    console.log('[SoundAnalysis] Count incremented:', next);
    return next;
  } catch (error) {
    console.error('[SoundAnalysis] Failed to increment:', error);
    return 0;
  }
}

/**
 * Check if user can record sound based on tier and usage
 */
export async function canRecordSound(tier: SoundTier): Promise<{
  canRecord: boolean;
  currentCount: number;
  limit: number;
  remaining: number;
}> {
  try {
    const currentCount = await getSoundAnalysisCount();
    const limit = SOUND_LIMITS[tier];
    const remaining = Math.max(0, limit - currentCount);

    return {
      canRecord: tier === 'CLUB' || currentCount < limit,
      currentCount,
      limit,
      remaining,
    };
  } catch (error) {
    console.error('[SoundAnalysis] Check failed:', error);
    return {
      canRecord: false,
      currentCount: 0,
      limit: 0,
      remaining: 0,
    };
  }
}

/**
 * Get max recording duration for user's tier
 */
export function getMaxRecordingDuration(tier: SoundTier): number {
  return RECORDING_DURATION[tier];
}

/**
 * Reset sound analysis count (for testing only)
 */
export async function resetSoundAnalysisCount(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_SOUND_COUNT);
    await AsyncStorage.removeItem(STORAGE_SOUND_RESET);
    console.log('[SoundAnalysis] Count reset');
  } catch (error) {
    console.error('[SoundAnalysis] Reset failed:', error);
  }
}