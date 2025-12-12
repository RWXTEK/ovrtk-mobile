// apps/mobile/lib/revenuecat.ts
import Purchases, { CustomerInfo } from "react-native-purchases";

// Entitlement IDs from RevenueCat (these must match your dashboard!)
export const ENTITLEMENTS = {
  PLUS: "OVRTK Plus",
  TRACK_MODE: "trackmode", 
  CLUB: "club",
} as const;

// Tier limits
export const LIMITS = {
  MESSAGES: {
    FREE: 10,           // 10 lifetime messages
    PLUS: -1,           // Unlimited
    TRACK_MODE: 2000,   // 2,000 per month
    CLUB: -1,           // Unlimited
  },
  IMAGES: {
    FREE: 0,
    PLUS: 20,
    TRACK_MODE: 75,
    CLUB: 300,
  },
  SOUNDS: {
    FREE: 0,
    PLUS: 5,
    TRACK_MODE: 20,
    CLUB: 50,
  },
  VINS: {
    FREE: 1,
    PLUS: 4,
    TRACK_MODE: 15,
    CLUB: 30,
  },
} as const;

// Package identifiers from offering
export const PACKAGES = {
  PLUS: "$rc_monthly",
  TRACK_MODE: "trackmode",
  CLUB: "club",
} as const;

// Get user's subscription tier
export type SubscriptionTier = "FREE" | "PLUS" | "TRACK_MODE" | "CLUB";

export async function getUserTier(): Promise<SubscriptionTier> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    
    console.log('🔍 RevenueCat Active Entitlements:', JSON.stringify(customerInfo.entitlements.active, null, 2));
    console.log('🔍 Looking for these entitlement IDs:', ENTITLEMENTS);
    
    // Check in order from highest to lowest tier
    if (customerInfo.entitlements.active[ENTITLEMENTS.CLUB]) {
      console.log('✅ User has CLUB');
      return "CLUB";
    }
    if (customerInfo.entitlements.active[ENTITLEMENTS.TRACK_MODE]) {
      console.log('✅ User has TRACK_MODE');
      return "TRACK_MODE";
    }
    if (customerInfo.entitlements.active[ENTITLEMENTS.PLUS]) {
      console.log('✅ User has PLUS');
      return "PLUS";
    }
    
    console.log('❌ No active entitlements found - defaulting to FREE');
    return "FREE";
  } catch (error) {
    console.error("❌ Error getting user tier:", error);
    // Return FREE on any error (including not configured)
    return "FREE";
  }
}

// Get limits for user's tier
export async function getUserImageLimit(): Promise<number> {
  const tier = await getUserTier();
  return LIMITS.IMAGES[tier];
}

export async function getUserSoundLimit(): Promise<number> {
  const tier = await getUserTier();
  return LIMITS.SOUNDS[tier];
}

export async function getUserVINLimit(): Promise<number> {
  const tier = await getUserTier();
  return LIMITS.VINS[tier];
}

export async function getUserMessageLimit(): Promise<number> {
  const tier = await getUserTier();
  return LIMITS.MESSAGES[tier];
}

// Check if user has any active subscription
export async function hasActiveSubscription(): Promise<boolean> {
  const tier = await getUserTier();
  return tier !== "FREE";
}

// Get customer info
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.error("Error getting customer info:", error);
    return null;
  }
}