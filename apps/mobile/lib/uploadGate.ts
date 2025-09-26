// apps/mobile/lib/uploadGate.ts
import Purchases, { CustomerInfo } from "react-native-purchases";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase"; // adjust relative path if needed

// RevenueCat entitlement ID for unlimited uploads
const ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID?.trim() || "pro_uploads";

export type UploadGateRes = {
  allowed: boolean;           // can the user upload right now?
  remaining: number | null;   // free uploads left today (null = unlimited)
};

/**
 * Gate upload attempts:
 * - Checks RevenueCat entitlement
 * - Calls Cloud Function to increment/check quota
 * - Returns structured { allowed, remaining }
 */
export async function ensureUploadAllowed(): Promise<UploadGateRes> {
  try {
    // 1) Check RevenueCat for Plus entitlement
    const info: CustomerInfo = await Purchases.getCustomerInfo();
    const hasPro = !!info.entitlements.active[ENTITLEMENT_ID];

    // 2) Call backend quota function
    const call = httpsCallable<{ hasPro: boolean }, UploadGateRes>(
      functions,
      "incrementUploadCount"
    );
    const res = await call({ hasPro });

    const data = res?.data as UploadGateRes | undefined;
    const out: UploadGateRes = {
      allowed: !!data?.allowed,
      remaining:
        typeof data?.remaining === "number" ? data.remaining : (hasPro ? null : 0),
    };

    // Debug logs
    if (!out.allowed) {
      console.log("[Gate] Upload blocked. Remaining free:", out.remaining);
    } else {
      console.log("[Gate] Upload allowed. Remaining free:", out.remaining);
    }

    return out;
  } catch (err: any) {
    console.warn("[Gate] ensureUploadAllowed error:", err?.message || err);
    return { allowed: false, remaining: 0 }; // default block on failure
  }
}
