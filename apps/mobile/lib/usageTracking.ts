import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

interface UsageLimits {
  messages: { used: number; limit: number };
  images: { used: number; limit: number };
  sounds: { used: number; limit: number };
  vins: { used: number; limit: number };
  resetDate: string;
}

// Get usage for current month
export async function getUserUsage(userId: string): Promise<UsageLimits | null> {
  const usageRef = doc(db, 'usage', userId);
  const usageDoc = await getDoc(usageRef);
  return usageDoc.exists() ? (usageDoc.data() as UsageLimits) : null;
}

// Check if user can use sound feature
export async function canUseSoundFeature(
  userId: string,
  userTier: 'FREE' | 'PLUS' | 'TRACK_MODE' | 'CLUB'
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const limits = {
    FREE: 0,
    PLUS: 5,
    TRACK_MODE: 20,
    CLUB: 50,
  };

  const usage = await getUserUsage(userId);
  const limit = limits[userTier];
  const used = usage?.sounds.used || 0;

  return {
    allowed: used < limit,
    remaining: Math.max(0, limit - used),
    limit,
  };
}

// Increment sound usage
export async function incrementSoundUsage(userId: string): Promise<void> {
  const usageRef = doc(db, 'usage', userId);
  const usageDoc = await getDoc(usageRef);

  if (usageDoc.exists()) {
    await updateDoc(usageRef, {
      'sounds.used': (usageDoc.data().sounds?.used || 0) + 1,
    });
  } else {
    // Create new usage doc
    await setDoc(usageRef, {
      sounds: { used: 1, limit: 0 },
      messages: { used: 0, limit: 0 },
      images: { used: 0, limit: 0 },
      vins: { used: 0, limit: 0 },
      resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
    });
  }
}