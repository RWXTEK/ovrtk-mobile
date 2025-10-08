// apps/mobile/app/index.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";

const C = {
  bg: "#0C0D11",
  panel: "#121318",
  surface: "#0F1116",
  line: "#1E2127",
  text: "#E7EAF0",
  muted: "#A6ADBB",
  accent: "#E11D48",
  accentHover: "#BE123A",
  grey1: "#23262E",
  grey2: "#171A21",
};

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: H } = Dimensions.get("window");
  const contentMinH = useMemo(
    () => Math.max(560, H - insets.top - insets.bottom - 80),
    [H, insets.top, insets.bottom]
  );

  const [checking, setChecking] = useState(true);
  const [askLoading, setAskLoading] = useState(false);

  // Check if user is already logged in
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/garage");
      } else {
        setChecking(false);
      }
    });
    
    return () => unsubscribe();
  }, [router]);

  const onAskScotty = async () => {
    if (askLoading) return;
    setAskLoading(true);
    try {
      await Haptics.selectionAsync();
      router.push({
        pathname: "/chat",
        params: {
          prefill:
            "Hey Scotty! I'm checking out OVRTK — can you help me plan my first mod?",
        },
      });
    } finally {
      setAskLoading(false);
    }
  };

  if (checking) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={C.text} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <View
        pointerEvents="none"
        style={[s.blobWrap, { top: -insets.top, bottom: -insets.bottom }]}
      >
        <View style={[s.blob, { backgroundColor: C.grey1, top: -140, right: -90 }]} />
        <View style={[s.blob, { backgroundColor: C.grey2, bottom: -160, left: -120 }]} />
      </View>

      <View style={{ flex: 1 }}>
        <View style={[s.topbar, { paddingTop: Math.max(6, insets.top ? 0 : 6) }]}>
          <Text style={s.brand}>OVRTK</Text>
          <View style={s.chip}>
            <Text style={s.dot}>•</Text>
            <Text style={s.chipText}>OVERTEK WITH SCOTTY</Text>
          </View>
        </View>

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

            <Text style={s.title}>Built by hustle.    Tuned by Scotty.</Text>
            <Text style={s.subtitle}>
            Your digital garage — powered by Scotty. Plan it, track it, flex it.
            </Text>

            <View style={s.divider} />

            <View style={s.actions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push("/auth/signup")}
                style={s.primaryBtn}
              >
                <Text style={s.primaryBtnText}>Create Account</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push("/auth/login")}
                style={s.secondaryBtn}
              >
                <Text style={s.secondaryBtnText}>Log In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={[s.bottom, { paddingBottom: insets.bottom + 15 }]}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onAskScotty}
            style={[s.scottyBtn, askLoading && { opacity: 0.7 }]}
            disabled={askLoading}
          >
            {askLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <View style={s.scottyIcon}>
                  <View style={[s.eyeSmall, { left: 6 }]} />
                  <View style={[s.eyeSmall, { right: 6 }]} />
                  <View style={s.smileSmall} />
                </View>
                <Text style={s.scottyBtnText}>Ask Scotty</Text>
              </>
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
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: "rgba(15,16,19,0.9)",
    gap: 5,
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
    padding: 24,
    gap: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  scottyRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10 },
  scotty: {
    width: 36, 
    height: 36, 
    borderRadius: 10,
    backgroundColor: "#0D0E12", 
    borderWidth: 1, 
    borderColor: C.line,
    justifyContent: "center", 
    alignItems: "center",
  },
  eye: { 
    position: "absolute", 
    top: 12, 
    width: 6, 
    height: 6, 
    borderRadius: 6, 
    backgroundColor: C.text 
  },
  smile: { 
    position: "absolute", 
    bottom: 9, 
    width: 12, 
    height: 3, 
    borderRadius: 3, 
    backgroundColor: C.accent 
  },
  scottyMute: { color: C.muted, fontSize: 12, letterSpacing: 0.2 },
  title: { 
    color: C.text, 
    fontSize: 28, 
    fontWeight: "800", 
    textAlign: "center", 
    letterSpacing: 0.3,
    marginTop: 4,
  },
  subtitle: { 
    color: C.muted, 
    textAlign: "center", 
    lineHeight: 22, 
    fontSize: 15,
    marginTop: -2,
  },
  divider: { 
    width: "100%", 
    height: 1, 
    backgroundColor: C.line, 
    marginTop: 8,
    marginBottom: 4,
  },
  actions: { width: "100%", alignItems: "center", gap: 12, marginTop: 4 },
  primaryBtn: {
    width: "100%",
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryBtnText: { 
    color: C.text, 
    fontWeight: "800", 
    fontSize: 16,
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    width: "100%",
    backgroundColor: "transparent",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: C.line,
  },
  secondaryBtnText: { 
    color: C.text, 
    fontWeight: "700", 
    fontSize: 16,
    letterSpacing: 0.3,
  },
  bottom: { paddingHorizontal: 18, gap: 12 },
  scottyBtn: {
    backgroundColor: "rgba(16,17,22,0.95)",
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: C.line,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  scottyIcon: {
    width: 24, 
    height: 24, 
    borderRadius: 6,
    backgroundColor: C.surface, 
    borderWidth: 1, 
    borderColor: C.line,
    justifyContent: "center", 
    alignItems: "center",
  },
  eyeSmall: { 
    position: "absolute", 
    top: 8, 
    width: 4, 
    height: 4, 
    borderRadius: 4, 
    backgroundColor: C.text 
  },
  smileSmall: { 
    position: "absolute", 
    bottom: 6, 
    width: 8, 
    height: 2, 
    borderRadius: 2, 
    backgroundColor: C.accent 
  },
  scottyBtnText: { 
    color: C.text, 
    fontWeight: "800", 
    fontSize: 16,
    letterSpacing: 0.3,
  },
  footer: { 
    textAlign: "center", 
    color: C.muted, 
    fontSize: 11, 
    letterSpacing: 0.5,
  },
});