// apps/mobile/app/index.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

import { GoogleAuthProvider, OAuthProvider, signInWithCredential } from "firebase/auth";
import { auth } from "../lib/firebase";

WebBrowser.maybeCompleteAuthSession();

const C = {
  bg: "#0C0D11",
  panel: "#121318",
  surface: "#0F1116",
  line: "#1E2127",
  text: "#E7EAF0",
  muted: "#A6ADBB",
  accent: "#E11D48",
  grey1: "#23262E",
  grey2: "#171A21",
};

// Expo proxy redirect (only this is needed for dev / Expo Go)
const REDIRECT_URI = "https://auth.expo.dev/@rwxtek/ovrtk";

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: H } = Dimensions.get("window");
  const contentMinH = useMemo(
    () => Math.max(560, H - insets.top - insets.bottom - 80),
    [H, insets.top, insets.bottom]
  );

  // ✅ Only keep the Expo proxy client for now
  const expoClientId = process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID ?? "";

  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [askLoading, setAskLoading] = useState(false);

  // Google request using Expo proxy (works in Expo Go + dev builds)
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: expoClientId,
    responseType: "id_token",
    scopes: ["openid", "profile", "email"],
    redirectUri: REDIRECT_URI,
    extraParams: { prompt: "select_account" },
  });

  useEffect(() => {
    if (!expoClientId) {
      console.warn("Missing EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID in apps/mobile/.env");
    }
  }, [expoClientId]);

  // Handle the Google -> Firebase sign-in
  useEffect(() => {
    const go = async () => {
      if (response?.type !== "success") return;
      const idToken =
        (response as any)?.params?.id_token ??
        (response as any)?.authentication?.idToken;
      if (!idToken) {
        setGoogleLoading(false);
        return;
      }
      try {
        setGoogleLoading(true);
        const cred = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, cred);
        // since tabs were removed, route to a future /garage screen
        router.replace("/garage");
      } finally {
        setGoogleLoading(false);
      }
    };
    go();
  }, [response, router]);
  
  const signInWithGoogle = async () => {
    if (!request) return;
    setGoogleLoading(true);
    try {
      await promptAsync(); // ✅ works with your REDIRECT_URI
    } finally {
      setGoogleLoading(false);
    }
  };
  
  // -------- Apple Sign-In (unchanged) --------
  const randomId = (len = 32) =>
    Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join("");

  const signInWithApple = async () => {
    if (Platform.OS !== "ios") return;
    try {
      setAppleLoading(true);
      const rawNonce = randomId(32);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) throw new Error("No identity token from Apple");

      const provider = new OAuthProvider("apple.com");
      const firebaseCred = provider.credential({
        idToken: credential.identityToken,
        rawNonce,
      });

      await signInWithCredential(auth, firebaseCred);
      // since tabs were removed, route to a future /garage screen
      router.replace("/garage");
    } catch (e) {
      console.warn("Apple sign-in failed", e);
    } finally {
      setAppleLoading(false);
    }
  };

  // -------- Ask Scotty -> preview chat (push so Back returns here) --------
  const onAskScotty = async () => {
    if (askLoading) return;
    setAskLoading(true);
    try {
      await Haptics.selectionAsync();
      router.push({
        pathname: "/chat",
        params: {
          prefill:
            "Hey Scotty! I’m checking out OVRTK — can you help me plan my first mod?",
        },
      });
    } finally {
      setAskLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      {/* full-bleed background */}
      <View
        pointerEvents="none"
        style={[s.blobWrap, { top: -insets.top, bottom: -insets.bottom }]}
      >
        <View style={[s.blob, { backgroundColor: C.grey1, top: -140, right: -90 }]} />
        <View style={[s.blob, { backgroundColor: C.grey2, bottom: -160, left: -120 }]} />
      </View>

      <View style={{ flex: 1 }}>
        {/* top bar */}
        <View style={[s.topbar, { paddingTop: Math.max(6, insets.top ? 0 : 6) }]}>
          <Text style={s.brand}>OVRTK</Text>
          <View style={s.chip}>
            <Text style={s.dot}>•</Text>
            <Text style={s.chipText}>OVERTEK WITH SCOTTY</Text>
          </View>
        </View>

        {/* card */}
        <View style={[s.center, { minHeight: contentMinH }]}>
          <View style={s.card}>
            <View style={s.scottyRow}>
              <View style={s.scotty}>
                <View style={[s.eye, { left: 10 }]} />
                <View style={[s.eye, { right: 10 }]} />
                <View style={s.smile} />
              </View>
              <Text style={s.scottyMute}>Scotty is standing by</Text>
            </View>

            <Text style={s.title}>Best buds. Better builds.</Text>
            <Text style={s.subtitle}>
              Keep it simple—plan mods, track parts, and visualize fitment together.
            </Text>

            <View style={s.divider} />

            <View style={s.actions}>
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={signInWithGoogle}
                disabled={googleLoading || !request}
                style={[s.oauthBtn, s.googleBtn, (googleLoading || !request) && { opacity: 0.7 }]}
              >
                {googleLoading ? (
                  <ActivityIndicator />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={18} color="#111" />
                    <Text style={s.oauthTextDark}>Continue with Google</Text>
                  </>
                )}
              </TouchableOpacity>

              {Platform.OS === "ios" ? (
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={signInWithApple}
                  disabled={appleLoading}
                  style={[s.oauthBtn, s.appleBtn, appleLoading && { opacity: 0.7 }]}
                >
                  {appleLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="logo-apple" size={20} color="#fff" />
                      <Text style={s.oauthText}>Continue with Apple</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}

              <View style={s.linkRow}>
                <TouchableOpacity hitSlop={8} onPress={() => router.push("/auth/signup")}>
                  <Text style={s.linkText}>Create account</Text>
                </TouchableOpacity>
                <Text style={s.linkSep}>·</Text>
                <TouchableOpacity hitSlop={8} onPress={() => router.push("/auth/login")}>
                  <Text style={s.linkText}>Log in with email</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* bottom CTA */}
        <View style={[s.bottom, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={onAskScotty}
            style={[s.scottyBtn, askLoading && { opacity: 0.7 }]}
            disabled={askLoading}
          >
            {askLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.scottyBtnText}>Ask Scotty</Text>
            )}
          </TouchableOpacity>
          <Text style={s.footer}>Powered by RWX-TEK INC.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  blobWrap: { position: "absolute", left: 0, right: 0 },
  blob: { position: "absolute", width: 360, height: 360, borderRadius: 360, opacity: 0.6 },

  topbar: {
    paddingHorizontal: 18,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { color: C.text, fontSize: 18, fontWeight: "700", letterSpacing: 0.6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15,16,19,0.9)",
    gap: 6,
  },
  dot: { color: C.accent, fontSize: 16, lineHeight: 14, marginTop: -1 },
  chipText: { color: C.muted, fontSize: 12, letterSpacing: 0.2 },

  center: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 14,
    alignItems: "center",
    shadowColor: Platform.OS === "ios" ? "#000" : "rgba(0,0,0,0.7)",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },

  scottyRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10 },
  scotty: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#0D0E12", borderWidth: 1, borderColor: C.line,
    justifyContent: "center", alignItems: "center",
  },
  eye: { position: "absolute", top: 12, width: 6, height: 6, borderRadius: 6, backgroundColor: C.text },
  smile: { position: "absolute", bottom: 9, width: 12, height: 3, borderRadius: 3, backgroundColor: C.accent },
  scottyMute: { color: C.muted, fontSize: 12 },

  title: { color: C.text, fontSize: 24, fontWeight: "800", textAlign: "center", letterSpacing: 0.2 },
  subtitle: { color: C.muted, textAlign: "center", lineHeight: 20, marginTop: 2 },

  divider: { width: "100%", height: 1, backgroundColor: C.line, marginTop: 6 },

  actions: { width: "100%", alignItems: "center", gap: 10 },
  oauthBtn: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
  },
  googleBtn: { backgroundColor: "#fff", borderColor: "#E7EAF0" },
  appleBtn: { backgroundColor: "#000", borderColor: "#000" },
  oauthText: { color: "#fff", fontWeight: "800" },
  oauthTextDark: { color: "#111", fontWeight: "800" },

  linkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  linkText: { color: C.text, fontWeight: "700" },
  linkSep: { color: C.muted },

  bottom: { paddingHorizontal: 18, gap: 10 },
  scottyBtn: {
    backgroundColor: "rgba(16,17,22,0.95)",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  scottyBtnText: { color: C.text, fontWeight: "800" },
  footer: { textAlign: "center", color: C.muted, fontSize: 12 },
});
