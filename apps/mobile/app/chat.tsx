// apps/mobile/app/chat.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { onAuthStateChanged, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../lib/firebase";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

// RevenueCat
import Purchases, { CustomerInfo } from "react-native-purchases";

import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";

const C = {
  bg: "#0C0D11",
  panel: "#121318",
  line: "#1E2127",
  text: "#E7EAF0",
  muted: "#A6ADBB",
  accent: "#E11D48",
  badge: "#1a1c23",
};

const DAILY_QUOTA = 10;
const STORAGE_KEY = "ovrtk.chat.guest.quota";
const STORAGE_KEY_LOGGED_IN = "ovrtk.chat.loggedin.quota";
const ENTITLEMENT_ID = (process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID || "pro_uploads").trim();

type Msg = { id: string; role: "user" | "scotty"; text: string };
type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

export default function Chat() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();

  const [me, setMe] = useState<User | null>(null);
  const [count, setCount] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [hasPro, setHasPro] = useState(false);

  const [msg, setMsg] = useState("");

  const initialItems: Msg[] = useMemo(() => {
    const p = typeof prefill === "string" ? prefill.trim() : "";
    return p ? [{ id: "seed", role: "user", text: p }] : [];
  }, [prefill]);
  const [items, setItems] = useState<Msg[]>(initialItems);

  const listRef = useRef<FlatList<Msg>>(null);
  const scrollDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => onAuthStateChanged(auth, setMe), []);

  /* ---------- RevenueCat: watch entitlement ---------- */
  useEffect(() => {
    const onUpdate = (info: CustomerInfo) => {
      const active = !!info.entitlements.active[ENTITLEMENT_ID];
      setHasPro(active);
    };

    Purchases.getCustomerInfo()
      .then(onUpdate)
      .catch(() => setHasPro(false));

    Purchases.addCustomerInfoUpdateListener(onUpdate);

    return () => {
      try { /* @ts-ignore */ Purchases.removeCustomerInfoUpdateListener?.(onUpdate); } catch {}
    };
  }, []);

  // quota setup (once)
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  useEffect(() => {
    (async () => {
      // Use different storage key for logged-in vs guest
      const storageKey = me ? STORAGE_KEY_LOGGED_IN : STORAGE_KEY;
      
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) {
          await AsyncStorage.setItem(storageKey, JSON.stringify({ date: today, count: 0 }));
          setCount(0);
          setBlocked(false);
          return;
        }
        const data = JSON.parse(raw) as { date: string; count: number };
        if (data.date !== today) {
          await AsyncStorage.setItem(storageKey, JSON.stringify({ date: today, count: 0 }));
          setCount(0);
          setBlocked(false);
        } else {
          setCount(data.count);
          setBlocked(data.count >= DAILY_QUOTA);
        }
      } catch {
        await AsyncStorage.setItem(storageKey, JSON.stringify({ date: today, count: 0 }));
        setCount(0);
        setBlocked(false);
      }
    })();
  }, [today, me]);

  async function bumpQuota() {
    const storageKey = me ? STORAGE_KEY_LOGGED_IN : STORAGE_KEY;
    const next = count + 1;
    setCount(next);
    setBlocked(next >= DAILY_QUOTA);
    await AsyncStorage.setItem(storageKey, JSON.stringify({ date: today, count: next }));
  }

  // Can send if: Pro user OR not blocked
  const canSend = hasPro || !blocked;

  // callable to backend
  const callScotty = httpsCallable<{ messages: ChatMsg[] }, { reply?: string }>(functions, "scottyChat");

  const onSend = async () => {
    const text = msg.trim();
    if (!text) return;

    // Check quota for non-Pro users
    if (!hasPro && blocked) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const upgradeMsg: Msg = {
        id: uuidv4(),
        role: "scotty",
        text: me 
          ? "You've used your 10 free questions today. Upgrade to OVRTK Plus for unlimited chat - check Profile → Upgrade."
          : "You've used your 10 free questions today. Sign up and upgrade to OVRTK Plus for unlimited chat.",
      };
      setItems((prev) => [...prev, upgradeMsg]);
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const userMsg: Msg = { id: uuidv4(), role: "user", text };
    setItems((prev) => [...prev, userMsg]);
    setMsg("");

    // bump quota for non-Pro users
    if (!hasPro) await bumpQuota();

    // build lightweight chat history for the model (clip to last 24 turns)
    const history: ChatMsg[] = [
      ...items.slice(-24).map<ChatMsg>((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      })),
      { role: "user", content: text },
    ];

    try {
      const res = await callScotty({ messages: history });
      const replyText = (res.data?.reply || "").trim() || "I couldn't parse that—try again?";
      const reply: Msg = { id: uuidv4(), role: "scotty", text: replyText };
      setItems((prev) => [...prev, reply]);
    } catch {
      // graceful fallback
      const reply: Msg = {
        id: uuidv4(),
        role: "scotty",
        text: "Server hiccup. I'll be back in a sec—try that message one more time.",
      };
      setItems((prev) => [...prev, reply]);
    } finally {
      if (scrollDebounce.current) clearTimeout(scrollDebounce.current);
      scrollDebounce.current = setTimeout(
        () => listRef.current?.scrollToEnd({ animated: true }),
        50
      );
    }
  };

  const remaining = hasPro ? null : Math.max(0, DAILY_QUOTA - count);

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top bar */}
      <View style={[s.topbar, { paddingTop: 6 }]}>
        <View style={s.leftRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={s.brand}>Scotty</Text>
        </View>

        {hasPro ? (
          <View style={s.badge}>
            <Text style={s.badgeTxt}>Plus — Unlimited</Text>
          </View>
        ) : me ? (
          <View style={s.badge}>
            <Text style={s.badgeTxt}>{remaining}/10 left today</Text>
          </View>
        ) : (
          <View style={s.badge}>
            <Text style={s.badgeTxt}>{DAILY_QUOTA - count} left today</Text>
          </View>
        )}
      </View>

      {/* KeyboardAvoiding wraps the scroll + input */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.chatBody}>
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingTop: 8,
              paddingHorizontal: 16,
              paddingBottom: 16 + 56 + insets.bottom,
              gap: 10,
            }}
            renderItem={({ item }) => (
              <View style={[s.bubble, item.role === "user" ? s.userBubble : s.botBubble]}>
                <Text style={s.bubbleTxt}>{item.text}</Text>
              </View>
            )}
            onContentSizeChange={() => {
              if (scrollDebounce.current) clearTimeout(scrollDebounce.current);
              scrollDebounce.current = setTimeout(
                () => listRef.current?.scrollToEnd({ animated: true }),
                50
              );
            }}
          />

          {/* Sticky signup banner overlay (guest + not blocked) */}
          {!me && !blocked && (
            <View
              style={[s.stickyWrap, { bottom: 56 + Math.max(8, insets.bottom) + 10 }]}
              pointerEvents="box-none"
            >
              <View style={s.stickyCard} pointerEvents="auto">
                <Text style={s.stickyTxt}>
                  Enjoy chatting with Scotty?{" "}
                  <Text style={{ fontWeight: "800", color: C.text }}>Sign up</Text> or{" "}
                  <Text style={{ fontWeight: "800", color: C.text }}>Log in</Text> for full access.
                </Text>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    style={[s.cta, { backgroundColor: C.accent }]}
                    onPress={() => router.push("/auth/signup")}
                  >
                    <Text style={s.ctaTxt}>Sign up</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.cta, { backgroundColor: "#1f222b" }]}
                    onPress={() => router.push("/auth/login")}
                  >
                    <Text style={[s.ctaTxt, { color: C.text }]}>Log in</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Docked input bar */}
          <View style={[s.inputDock, { paddingBottom: Math.max(8, insets.bottom) }]}>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder={
                  !canSend
                    ? "Daily limit reached — upgrade for unlimited"
                    : "Ask Scotty anything…"
                }
                placeholderTextColor={C.muted}
                value={msg}
                onChangeText={setMsg}
                editable={canSend}
                returnKeyType="send"
                onSubmitEditing={onSend}
              />
              <TouchableOpacity
                style={[s.sendBtn, !canSend && { opacity: 0.5 }]}
                onPress={onSend}
                disabled={!canSend}
              >
                <Text style={s.sendTxt}>Send</Text>
              </TouchableOpacity>
            </View>

            {!hasPro && blocked && (
              <Text style={s.blockTxt}>
                You've used {DAILY_QUOTA}/{DAILY_QUOTA} free messages today. 
                {me ? " Upgrade to Plus for unlimited chat." : " Sign up for unlimited chats."}
              </Text>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  topbar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: C.line,
  },
  brand: { color: C.text, fontSize: 18, fontWeight: "900" },
  badge: { backgroundColor: C.badge, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeTxt: { color: C.muted, fontSize: 12 },

  chatBody: { flex: 1 },

  cta: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
  ctaTxt: { color: "#fff", fontWeight: "900" },

  bubble: {
    maxWidth: "88%",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#191c23", borderColor: C.line },
  botBubble: { alignSelf: "flex-start", backgroundColor: "#101219", borderColor: C.line },
  bubbleTxt: { color: C.text },

  stickyWrap: {
    position: "absolute",
    left: 10,
    right: 10,
    zIndex: 10,
  },
  stickyCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#161821",
    borderWidth: 1,
    borderColor: C.line,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  stickyTxt: { color: C.muted },

  inputDock: {
    borderTopWidth: 1,
    borderColor: C.line,
    backgroundColor: "#0d0f15",
    paddingTop: 8,
    paddingHorizontal: 10,
  },
  inputRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    color: C.text,
    backgroundColor: "#12141b",
    borderWidth: 1,
    borderColor: C.line,
    height: 44,
  },
  sendBtn: {
    backgroundColor: C.accent,
    borderRadius: 999,
    paddingHorizontal: 16,
    justifyContent: "center",
    height: 44,
  },
  sendTxt: { color: "#fff", fontWeight: "900" },

  blockTxt: { color: C.muted, fontSize: 12, textAlign: "center", marginTop: 6 },
});