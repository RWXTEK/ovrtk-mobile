// app/_layout.tsx

import "react-native-gesture-handler";

import { useEffect, useState } from "react";
import { Platform, ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from 'expo-notifications';

import Purchases, { LOG_LEVEL, type CustomerInfo } from "react-native-purchases";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { handleNotificationResponse } from "../utils/notificationHandler";
import { AuthProvider } from "../contexts/AuthContext";

const C = { bg: "#0C0D11", text: "#E7EAF0" };

const RC_IOS_KEY = "appl_kbIDSqefYIxgekZLUxtdjMMJiEx";
const RC_ANDROID_KEY = "goog_cDYCRHTaMuQZsDaHIlBOHiGqtZi";
const ENTITLEMENT_ID = "OVRTK Plus";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotifications(userId: string) {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('❌ Notification permissions not granted');
      return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'b51c33c1-2276-4d1a-916f-aafe0c888374'
    });
    const token = tokenData.data;

    console.log('✅ Push notification token:', token);

    await setDoc(
      doc(db, 'users', userId, 'fcmTokens', token),
      {
        token,
        updatedAt: new Date(),
        platform: Platform.OS,
      }
    );

    console.log('✅ FCM token saved to Firestore');
  } catch (error) {
    console.error('❌ Error registering for push notifications:', error);
  }
}

// 🔥 CONFIGURE IMMEDIATELY - ONLY ON NATIVE PLATFORMS
let revenueCatReady = false;

if (Platform.OS === "ios" || Platform.OS === "android") {
  const apiKey = Platform.OS === "ios" ? RC_IOS_KEY : RC_ANDROID_KEY;
  
  try {
    console.log("🔥 Configuring RevenueCat for", Platform.OS);
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
    Purchases.configure({ apiKey });
    revenueCatReady = true;
    console.log("✅ RevenueCat configured");
  } catch (e) {
    console.error("❌ RevenueCat configure error:", e);
  }
}

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initializeApp = async () => {
      // 🔥 WAIT 1 SECOND FOR REVENUECAT TO FULLY INITIALIZE
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!mounted) return;

      const subscription = Notifications.addNotificationResponseReceivedListener(response => {
        handleNotificationResponse(response);
      });

      if (revenueCatReady) {
        try {
          await Purchases.getOfferings();
          console.log("✅ RevenueCat offerings loaded");
        } catch (e) {
          console.warn("RC: fetch offerings error:", e);
        }
      }

      const unsubAuth = onAuthStateChanged(auth, async (user) => {
        if (Platform.OS !== "ios" && Platform.OS !== "android") return;

        try {
          if (user) {
            if (revenueCatReady) {
              await Purchases.logIn(user.uid);
            }
            await registerForPushNotifications(user.uid);
          } else {
            if (revenueCatReady) {
              await Purchases.logOut();
            }
          }
        } catch (e) {
          console.warn("Auth state change error:", e);
        }
      });

      const listener = (info: CustomerInfo) => {
        const active = !!info.entitlements.active[ENTITLEMENT_ID];
        console.log("RC: customer info updated, hasPro =", active);
      };

      if (revenueCatReady) {
        Purchases.addCustomerInfoUpdateListener(listener);
      }

      if (mounted) {
        setIsReady(true);
      }

      return () => {
        subscription.remove();
        if (revenueCatReady) {
          Purchases.removeCustomerInfoUpdateListener(listener);
        }
        unsubAuth();
      };
    };

    initializeApp();

    return () => {
      mounted = false;
    };
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={C.text} />
      </View>
    );
  }

  return (
    <AuthProvider>
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
    </AuthProvider>
  );
}