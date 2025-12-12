// lib/vinTracking.ts
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export type VINTier = 'FREE' | 'PLUS' | 'TRACK_MODE' | 'CLUB';

// VIN decode limits per tier
const VIN_LIMITS: Record<VINTier, number> = {
  FREE: 0,
  PLUS: 4,
  TRACK_MODE: 15,
  CLUB: 30,
};

interface UsageData {
  count?: number;        // ← Old field name
  vinsUsed?: number;     // ← New field name (make both optional)
  day?: string;          // ← Old field name
  resetDate?: string;    // ← New field name
  tier: VINTier;
  lastUpdated: any;
}

/**
 * Get the first day of next month for reset date
 */
function getNextMonthResetDate(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString();
}

/**
 * Get the first day of current month
 */
function getCurrentMonthStart(): string {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return monthStart.toISOString();
}

/**
 * Check if we need to reset (new month)
 */
function shouldReset(resetDate: string): boolean {
  const reset = new Date(resetDate);
  const now = new Date();
  return now >= reset;
}

/**
 * Get or create usage document for user
 */
async function getUsageDoc(userId: string, userTier: VINTier): Promise<UsageData> {
  try {
    const usageRef = doc(db, 'usage', userId);
    const usageSnap = await getDoc(usageRef);

    if (usageSnap.exists()) {
      const data = usageSnap.data() as UsageData;

      // Check if we need to reset for new month
      const dateToCheck = data.resetDate || data.day;
      if (dateToCheck && shouldReset(dateToCheck)) {
        console.log('[VIN] New month detected, resetting counter');
        const newData: UsageData = {
          vinsUsed: 0,
          resetDate: getNextMonthResetDate(),
          tier: userTier,
          lastUpdated: serverTimestamp(),
        };
        await setDoc(usageRef, newData);
        return newData;
      }

      // Update tier if changed
      if (data.tier !== userTier) {
        await updateDoc(usageRef, { tier: userTier });
        data.tier = userTier;
      }

      return data;
    } else {
      // Create new usage document
      console.log('[VIN] Creating new usage document');
      const newData: UsageData = {
        vinsUsed: 0,
        resetDate: getNextMonthResetDate(),
        tier: userTier,
        lastUpdated: serverTimestamp(),
      };
      await setDoc(usageRef, newData);
      return newData;
    }
  } catch (error) {
    console.error('[VIN] Failed to get usage doc:', error);
    // Return safe default
    return {
      vinsUsed: 0,
      resetDate: getNextMonthResetDate(),
      tier: userTier,
      lastUpdated: null,
    };
  }
}

/**
 * Get current VIN decode count for this month
 */
export async function getVINDecodeCount(userId: string, userTier: VINTier): Promise<number> {
  try {
    const usage = await getUsageDoc(userId, userTier);
    // Handle both old and new field names
    const vinsUsed = usage.vinsUsed ?? usage.count ?? 0;
    return vinsUsed;
  } catch (error) {
    console.error('[VIN] Failed to get count:', error);
    return 0;
  }
}

/**
 * Increment VIN decode count
 */
export async function incrementVINDecodeCount(userId: string, userTier: VINTier): Promise<number> {
  try {
    const usage = await getUsageDoc(userId, userTier);
    // Handle both old and new field names
    const currentCount = usage.vinsUsed ?? usage.count ?? 0;
    const newCount = currentCount + 1;

    const usageRef = doc(db, 'usage', userId);
    await updateDoc(usageRef, {
      vinsUsed: newCount,
      lastUpdated: serverTimestamp(),
    });

    console.log('[VIN] Count incremented to:', newCount);
    return newCount;
  } catch (error) {
    console.error('[VIN] Failed to increment:', error);
    return 0;
  }
}

/**
 * Check if user can decode VIN based on tier and usage
 */
export async function canDecodeVIN(
  userId: string,
  userTier: VINTier
): Promise<{
  canDecode: boolean;
  currentCount: number;
  limit: number;
  remaining: number;
  tierName: string;
}> {
  console.log('[VIN] 🔍 Starting check for:', { userId, userTier });
  
  try {
    const usage = await getUsageDoc(userId, userTier);
    console.log('[VIN] 📊 Usage data:', usage);
    
    // Handle both old and new field names
    const vinsUsed = usage.vinsUsed ?? usage.count ?? 0;
    
    const limit = VIN_LIMITS[userTier];
    const remaining = Math.max(0, limit - vinsUsed);
    
    console.log('[VIN] 📊 Calculated:', { limit, remaining, vinsUsed });

    // FREE tier is blocked (0 VINs allowed)
    if (userTier === 'FREE') {
      return {
        canDecode: false,
        currentCount: vinsUsed,
        limit: 0,
        remaining: 0,
        tierName: 'Free',
      };
    }

    // CLUB has unlimited (we still track but always allow)
    if (userTier === 'CLUB') {
      return {
        canDecode: true,
        currentCount: vinsUsed,
        limit: limit,
        remaining: limit,
        tierName: 'Club',
      };
    }

    // PLUS and TRACK_MODE have monthly limits
    const canDecode = vinsUsed < limit;

    const tierNames: Record<VINTier, string> = {
      FREE: 'Free',
      PLUS: 'Plus',
      TRACK_MODE: 'Track Mode',
      CLUB: 'Club',
    };

    const result = {
      canDecode,
      currentCount: vinsUsed,
      limit,
      remaining,
      tierName: tierNames[userTier],
    };
    
    console.log('[VIN] ✅ Final result:', result);
    return result;
    
  } catch (error) {
    console.error('[VIN] ❌ Check failed:', error);
    console.error('[VIN] ❌ User ID:', userId);
    console.error('[VIN] ❌ Tier:', userTier);
    return {
      canDecode: false,
      currentCount: 0,
      limit: 0,
      remaining: 0,
      tierName: 'Free',
    };
  }
}

/**
 * Get VIN limit for a tier (for display purposes)
 */
export function getVINLimit(tier: VINTier): number {
  return VIN_LIMITS[tier];
}

/**
 * Format usage message for user
 */
export function formatVINUsageMessage(
  currentCount: number,
  limit: number,
  remaining: number,
  tierName: string
): string {
  if (limit === 0) {
    return `🚫 VIN scanning is not available on the Free plan. Upgrade to Plus ($3.99/mo) to scan up to 4 VINs per month!`;
  }

  if (remaining === 0) {
    return `❌ You've used all ${limit} VIN scans this month on ${tierName}. Upgrade to scan more vehicles!`;
  }

  return `✅ VIN Scans: ${currentCount}/${limit} used this month (${remaining} remaining)`;
}

/**
 * Reset VIN decode count (admin/testing only)
 */
export async function resetVINDecodeCount(userId: string, userTier: VINTier): Promise<void> {
  try {
    const usageRef = doc(db, 'usage', userId);
    await setDoc(usageRef, {
      vinsUsed: 0,
      resetDate: getNextMonthResetDate(),
      tier: userTier,
      lastUpdated: serverTimestamp(),
    });
    console.log('[VIN] Count reset for user:', userId);
  } catch (error) {
    console.error('[VIN] Reset failed:', error);
  }
}