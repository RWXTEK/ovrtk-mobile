// apps/mobile/lib/imageTracking.ts
import { db as firestore, auth } from "./firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  increment as firestoreIncrement,
  Timestamp,
  DocumentReference,
  DocumentSnapshot,
  DocumentData
} from "firebase/firestore";
import { getUserImageLimit, getUserTier } from "./revenuecat";

type ImageUsage = {
  count: number;
  month: string;
  lastUpdated: any;
}

// Get current month string (e.g., "2025-10")
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Get user's image usage doc reference
function getUserUsageRef(): DocumentReference<DocumentData> {
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error("User not authenticated");
  return doc(firestore, "users", userId, "usage", "images");
}

// Get user's current image count for this month
export async function getMonthlyImageCount(): Promise<number> {
  try {
    const usageRef = getUserUsageRef();
    const usageDoc: DocumentSnapshot<DocumentData> = await getDoc(usageRef);
    
    if (!usageDoc.exists()) {
      return 0;
    }
    
    const data = usageDoc.data() as ImageUsage;
    const currentMonth = getCurrentMonth();
    
    // If it's a new month, reset count
    if (data.month !== currentMonth) {
      return 0;
    }
    
    return data.count || 0;
  } catch (error) {
    console.error("Error getting image count:", error);
    return 0;
  }
}

// Increment user's image count
export async function incrementImageCount(): Promise<void> {
  try {
    const usageRef = getUserUsageRef();
    const currentMonth = getCurrentMonth();
    const usageDoc: DocumentSnapshot<DocumentData> = await getDoc(usageRef);
    
    if (!usageDoc.exists() || usageDoc.data()?.month !== currentMonth) {
      // Create new document for this month
      await setDoc(usageRef, {
        count: 1,
        month: currentMonth,
        lastUpdated: Timestamp.now(),
      });
    } else {
      // Increment existing count
      await updateDoc(usageRef, {
        count: firestoreIncrement(1),
        lastUpdated: Timestamp.now(),
      });
    }
  } catch (error) {
    console.error("Error incrementing image count:", error);
    throw error;
  }
}

// Check if user can upload more images
export async function canUploadImage(): Promise<{
  canUpload: boolean;
  currentCount: number;
  limit: number;
  tier: string;
}> {
  try {
    const [currentCount, limit, tier] = await Promise.all([
      getMonthlyImageCount(),
      getUserImageLimit(),
      getUserTier(),
    ]);
    
    return {
      canUpload: currentCount < limit,
      currentCount,
      limit,
      tier,
    };
  } catch (error) {
    console.error("Error checking upload eligibility:", error);
    return {
      canUpload: false,
      currentCount: 0,
      limit: 0,
      tier: "FREE",
    };
  }
}