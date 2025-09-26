// mobile/lib/firebase.ts
import { Platform } from "react-native";
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  signOut,
  connectAuthEmulator,
  type Auth,
  type ReactNativeAsyncStorage, // exact type Firebase expects
} from "firebase/auth";
import {
  getStorage,
  connectStorageEmulator,
  type FirebaseStorage,
} from "firebase/storage";
import {
  getFunctions,
  connectFunctionsEmulator,
  type Functions,
} from "firebase/functions";
import type { Analytics } from "firebase/analytics";

/* ----------------------------- Env helpers ----------------------------- */

function must(key: string): string {
  const v = process.env[key as keyof NodeJS.ProcessEnv];
  if (!v) throw new Error(`[firebase] Missing environment variable: ${key}`);
  return String(v);
}

export const isUsingEmulators =
  String(process.env.EXPO_PUBLIC_FIREBASE_USE_EMULATORS || "")
    .toLowerCase()
    .trim() === "true";

const EMU_HOST =
  (process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || "localhost").trim();

/* ---------------------------- Firebase config -------------------------- */

const firebaseConfig = {
  apiKey: must("EXPO_PUBLIC_FIREBASE_API_KEY"),
  authDomain: must("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: must("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: must("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: must("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: must("EXPO_PUBLIC_FIREBASE_APP_ID"),
  // measurementId is optional (web only)
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/* ---------------------------- Singletons -------------------------------- */

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let storage: FirebaseStorage;
let functions: Functions;
let analytics: Analytics | null = null;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);

  // Auth: React Native needs explicit persistence
  if (Platform.OS === "web") {
    auth = getAuth(app);
  } else {
    // require() only on native so web bundle/types aren't pulled in
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const NativeAsyncStorage =
      require("@react-native-async-storage/async-storage")
        .default as unknown as ReactNativeAsyncStorage;

    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(NativeAsyncStorage),
    });
  }

  db = getFirestore(app);
  storage = getStorage(app);
  // IMPORTANT: keep region consistent with deployed Cloud Functions
  functions = getFunctions(app, "us-central1");

  // Connect to emulators (optional)
  if (isUsingEmulators) {
    try {
      connectFirestoreEmulator(db, EMU_HOST, 8080);
      connectAuthEmulator(auth, `http://${EMU_HOST}:9099`, {
        disableWarnings: true,
      });
      connectStorageEmulator(storage, EMU_HOST, 9199);
      connectFunctionsEmulator(functions, EMU_HOST, 5001);
      // Note: On a physical device, EMU_HOST must be your machine’s LAN IP.
    } catch (e) {
      console.warn("[firebase] Emulator connect failed:", e);
    }
  }

  // Analytics (web only) — dynamic import so native bundles exclude it
  if (Platform.OS === "web") {
    (async () => {
      try {
        const { getAnalytics, isSupported } = await import("firebase/analytics");
        if (await isSupported()) analytics = getAnalytics(app);
      } catch {
        // ignore analytics failures on web
      }
    })();
  }
} else {
  app = getApp();
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  functions = getFunctions(app, "us-central1");
}

/* ------------------------------ Helpers --------------------------------- */

export async function logout() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("[firebase] signOut error:", err);
  }
}

/* ------------------------------ Exports --------------------------------- */

export { app, db, auth, storage, functions, analytics };
