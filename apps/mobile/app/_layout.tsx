// app/_layout.tsx

// Ensure gesture-handler is initialized before any navigation code
import "react-native-gesture-handler";

import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Constants from 'expo-constants';

import Purchases, { LOG_LEVEL, type CustomerInfo } from "react-native-purchases";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";

const C = { bg: "#0C0D11", text: "#E7EAF0" };

// Use environment variables from eas.json via Constants (fallback to hardcoded for Expo Go)
const RC_IOS_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_RC_IOS_KEY ?? "appl_kbIDSqefYIxgekZLUxtdjMMJiEx";
const RC_ANDROID_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_RC_ANDROID_KEY ?? "";
const ENTITLEMENT_ID = Constants.expoConfig?.extra?.EXPO_PUBLIC_RC_ENTITLEMENT_ID ?? "pro_uploads";

export default function RootLayout() {
  const purchasesConfiguredRef = useRef(false);

  useEffect(() => {
    // Native platforms only
    if (Platform.OS === "ios" || Platform.OS === "android") {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);

      const apiKey = Platform.OS === "ios" ? RC_IOS_KEY : (RC_ANDROID_KEY || RC_IOS_KEY);

      const looksPlaceholder =
        !apiKey || apiKey.startsWith("appl_xxx") || apiKey.startsWith("goog_xxx");

      if (!purchasesConfiguredRef.current && !looksPlaceholder) {
        try {
          Purchases.configure({ apiKey });
          purchasesConfiguredRef.current = true;
          console.log("✅ RevenueCat configured successfully");
        } catch (e) {
          console.warn("RevenueCat configure error:", e);
        }
      } else if (looksPlaceholder) {
        console.warn(
          "RevenueCat: missing/placeholder SDK key. Set EXPO_PUBLIC_RC_IOS_KEY (and optional EXPO_PUBLIC_RC_ANDROID_KEY)."
        );
      }
    }

    // Link RC <-> Firebase Auth
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (Platform.OS !== "ios" && Platform.OS !== "android") return;
      if (!purchasesConfiguredRef.current) return;
      
      try {
        if (user) {
          await Purchases.logIn(user.uid);
        } else {
          await Purchases.logOut();
        }
      } catch (e) {
        console.warn("RevenueCat login/link error:", e);
      }
    });

    // Entitlement listener
    const listener = (info: CustomerInfo) => {
      const active = !!info.entitlements.active[ENTITLEMENT_ID];
      console.log("RC: customer info updated, hasPro =", active);
    };

    if (Platform.OS === "ios" || Platform.OS === "android") {
      if (purchasesConfiguredRef.current) {
        Purchases.addCustomerInfoUpdateListener(listener);
      }
      
      // Prefetch offerings (non-blocking) - WITH DELAY
      setTimeout(async () => {
        if (!purchasesConfiguredRef.current) return;
        try {
          const offerings = await Purchases.getOfferings();
          if (!offerings.current) {
            console.warn(
              "RC: No current offerings. Check products/offerings in RevenueCat and your sandbox user."
            );
          } else {
            console.log("✅ RevenueCat offerings loaded successfully");
          }
        } catch (e) {
          console.warn("RC: fetch offerings error:", e);
        }
      }, 500); // 500ms delay to ensure Purchases is fully ready
    }

    return () => {
      if (Platform.OS === "ios" || Platform.OS === "android") {
        if (purchasesConfiguredRef.current) {
          Purchases.removeCustomerInfoUpdateListener(listener);
        }
      }
      unsubAuth();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.bg },
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
          animation: "fade",
          presentation: "card",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="auth/login"
          options={{
            headerShown: true,
            title: "Log in",
            headerStyle: { backgroundColor: C.bg },
            headerTintColor: C.text,
          }}
        />
        <Stack.Screen
          name="auth/signup"
          options={{
            headerShown: true,
            title: "Create account",
            headerStyle: { backgroundColor: C.bg },
            headerTintColor: C.text,
          }}
        />
        <Stack.Screen
          name="chat"
          options={{ headerShown: false, presentation: "card" }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}