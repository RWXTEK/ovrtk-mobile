// apps/mobile/lib/revenuecat.ts
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";

export const ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID ?? "pro_uploads";

  const RC_IOS_KEY = "appl_kbIDSqefYIxgekZLUxtdjMMJiEx";
  const RC_ANDROID_KEY = process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? "";

export function configureRevenueCat() {
  Purchases.setLogLevel(LOG_LEVEL.WARN);
  const apiKey = Platform.select({
    ios: RC_IOS_KEY,
    android: RC_ANDROID_KEY,
    default: RC_IOS_KEY,
  })!;
  console.log('RevenueCat API Key:', apiKey); // Add this
  Purchases.configure({ apiKey });
}
