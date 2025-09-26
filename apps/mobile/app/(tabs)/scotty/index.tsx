import { useEffect, useRef, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList,
  Keyboard, Platform, Image, Modal, Pressable, Share, Animated, Easing, Dimensions
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PanResponder } from "react-native";

// haptics (optional)
let Haptics: any = null;
try { Haptics = require("expo-haptics"); } catch {}

// Firebase
import { onAuthStateChanged, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, storage, functions } from "../../../lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// RevenueCat
import Purchases, { CustomerInfo } from "react-native-purchases";

// Upload gate
import { ensureUploadAllowed, type UploadGateRes } from "../../../lib/uploadGate";

/* ---------- Theme ---------- */
const C = {
  bg: "#0C0D11", panel: "#121318", glass: "rgba(18,19,24,0.92)", line: "#1E2127",
  text: "#E7EAF0", muted: "#A6ADBB", accent: "#E11D48", good: "#22c55e", warn: "#f59e0b",
};

/* ---------- RC Entitlement ---------- */
const ENTITLEMENT_ID = (process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID || "pro_uploads").trim();

/* ---------- Types ---------- */
type Msg = { id: string; role: "you" | "scotty"; text?: string; imageUrl?: string };
type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

type Tag = "Track" | "OEM+" | "Stance" | "Sleeper";
const TAG_COLORS: Record<Tag, string> = {
  Track: "#7DD3FC", "OEM+": "#A7F3D0", Stance: "#FBCFE8", Sleeper: "#FDE68A",
};

type ChatMeta = {
  id: string; title: string; updatedAt: number;
  last?: string; pinned?: boolean; tags?: Tag[]; unread?: number;
};

/* ---------- Storage ---------- */
const STORAGE_CHATS = "@ovrtk/scotty.chats.v3";
const STORAGE_CHAT  = (id: string) => `@ovrtk/scotty.chat.${id}.v1`;

async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}
async function saveJSON(key: string, val: any) {
  try { await AsyncStorage.setItem(key, JSON.stringify(val)); } catch {}
}

/* ---------- Screen ---------- */
export default function Scotty() {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<User | null>(null);

  // chat state
  const [msg, setMsg] = useState("");
  const [items, setItems] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);

  // drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerX = useRef(new Animated.Value(0)).current;

  // chats
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);

  // drawer filters
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState<Tag | "All">("All");

  // layout
  const INPUT_DOCK_H = 72;
  const TAB_BAR_H = 76;

  // keyboard → like ChatGPT
  const GAP_WHEN_KB = 34;
  const GAP_WHEN_NO_KB = -3;
  const [kbVisible, setKbVisible] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  // bottom offset shared by dock + typing pill + list padding
  const bottomOffset = kbVisible
    ? Math.max(0, (kbHeight - (insets.bottom || 0))) + GAP_WHEN_KB
    : TAB_BAR_H + GAP_WHEN_NO_KB;

  // list padding so bubbles never hide under the dock
  const listBottomPad = bottomOffset + INPUT_DOCK_H + 12;

  /* ---------- Rename modal state ---------- */
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);

  /* ---------- Monetization state ---------- */
  const [hasPro, setHasPro] = useState(false);
  const [remainingToday, setRemainingToday] = useState<number | null>(null); // null = unknown/Unlimited

  /* ---------- Auth ---------- */
  useEffect(() => onAuthStateChanged(auth, setMe), []);

  /* ---------- Hydrate ---------- */
  useEffect(() => {
    (async () => {
      const list = await loadJSON<ChatMeta[]>(STORAGE_CHATS, []);
      setChats(list);
      if (list.length) {
        const initial = [...list].sort(sortMeta)[0];
        await selectChat(initial.id, { scroll: false });
      } else {
        const first = await createChat("New chat");
        await selectChat(first.id, { scroll: false });
      }
    })();
  }, []);

  // autoscroll on new messages
  useEffect(() => { listRef.current?.scrollToEnd({ animated: true }); }, [items.length]);

  // persist messages of current chat
  useEffect(() => { if (chatId) saveJSON(STORAGE_CHAT(chatId), items); }, [chatId, items]);

  /* ---------- Keyboard listeners ---------- */
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: any) => {
      setKbVisible(true);
      setKbHeight(e?.endCoordinates?.height ?? 0);
    };
    const onHide = () => { setKbVisible(false); setKbHeight(0); };

    const s1 = Keyboard.addListener(showEvt, onShow);
    const s2 = Keyboard.addListener(hideEvt, onHide);
    return () => { s1.remove(); s2.remove(); };
  }, [insets.bottom]);

  /* ---------- Drawer anim ---------- */
  useEffect(() => {
    Animated.timing(drawerX, {
      toValue: drawerOpen ? 1 : 0,
      duration: 220,
      easing: drawerOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [drawerOpen]);

  const pan = useRef(new Animated.Value(0)).current;
  useEffect(() => { pan.setValue(drawerOpen ? 1 : 0); }, [drawerOpen]);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
      onPanResponderMove: (_, g) => {
        const p = Math.max(0, Math.min(1, 1 - g.dx / 320));
        pan.setValue(p);
      },
      onPanResponderRelease: () => closeDrawer(),
    })
  ).current;

  /* ---------- RevenueCat: watch entitlement ---------- */
  useEffect(() => {
    const onUpdate = (info: CustomerInfo) => {
      const active = !!info.entitlements.active[ENTITLEMENT_ID];
      setHasPro(active);
      if (active) setRemainingToday(null); // Unlimited
    };

    Purchases.getCustomerInfo()
      .then(onUpdate)
      .catch(() => setHasPro(false));

    Purchases.addCustomerInfoUpdateListener(onUpdate);

    return () => {
      try { /* @ts-ignore */ Purchases.removeCustomerInfoUpdateListener?.(onUpdate); } catch {}
    };
  }, []);

  /* ---------- Firebase callable ---------- */
  const callScottyFn = httpsCallable<{ messages: ChatMsg[] }, { reply?: string }>(functions, "scottyChat");

  /* ---------- Chat helpers ---------- */
  const sortMeta = (a: ChatMeta, b: ChatMeta) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  };

  const seedForTitle = (t: string): Msg[] => ([
    { id: "hi", role: "scotty",
      text: `I’m Scotty.${t ? ` This the ${t}?` : ""} Tell me the vibe (OEM+, track, stance, sleeper) and what you want it to feel like on throttle.` }
  ]);

  const createChat = async (t: string) => {
    const id  = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    const meta: ChatMeta = { id, title: t || "New chat", updatedAt: now, pinned: false, tags: [], unread: 0 };
    setChats(prev => {
      const next = [meta, ...prev].sort(sortMeta);
      saveJSON(STORAGE_CHATS, next);
      return next;
    });
    await saveJSON(STORAGE_CHAT(id), seedForTitle(meta.title));
    return meta;
  };

  const renameChat = async (id: string, newTitle: string) => {
    setChats(prev => {
      const next = prev.map(c => c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c).sort(sortMeta);
      saveJSON(STORAGE_CHATS, next);
      return next;
    });
  };

  const deleteChat = async (id: string) => {
    setChats(prev => {
      const next = prev.filter(c => c.id !== id);
      saveJSON(STORAGE_CHATS, next);
      return next;
    });
    try { await AsyncStorage.removeItem(STORAGE_CHAT(id)); } catch {}
    if (chatId === id) {
      const list = await loadJSON<ChatMeta[]>(STORAGE_CHATS, []);
      if (list[0]) await selectChat(list[0].id);
      else {
        const fresh = await createChat("New chat");
        await selectChat(fresh.id);
      }
    }
  };

  const togglePin = async (id: string) => {
    setChats(prev => {
      const next = prev.map(c => c.id === id ? { ...c, pinned: !c.pinned, updatedAt: Date.now() } : c).sort(sortMeta);
      saveJSON(STORAGE_CHATS, next);
      return next;
    });
  };

  const setTags = async (id: string, tags: Tag[]) => {
    setChats(prev => {
      const next = prev.map(c => c.id === id ? { ...c, tags, updatedAt: Date.now() } : c).sort(sortMeta);
      saveJSON(STORAGE_CHATS, next);
      return next;
    });
  };

  const readChat  = async (id: string) => {
    const stored = await loadJSON<Msg[] | null>(STORAGE_CHAT(id), null);
    if (stored) return stored;
    const title = (chats.find(c => c.id === id)?.title) || "New chat";
    return seedForTitle(title);
  };

  const bumpPreview = async (snippet: string) => {
    if (!chatId) return;
    setChats(prev => {
      const next = prev.map(c =>
        c.id === chatId ? ({ ...c, last: snippet, updatedAt: Date.now(), unread: 0 }) : c
      ).sort(sortMeta);
      saveJSON(STORAGE_CHATS, next);
      return next;
    });
  };

  const selectChat = async (id: string, opt?: { scroll?: boolean }) => {
    setChatId(id);
    const msgs = await readChat(id);
    setItems(msgs);
    setChats(prev => {
      const next = prev.map(c => c.id === id ? { ...c, unread: 0 } : c).sort(sortMeta);
      saveJSON(STORAGE_CHATS, next);
      return next;
    });
    if (opt?.scroll !== false) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
    setDrawerOpen(false);
  };

  /* ---------- Send ---------- */
  async function onSend(textIn?: string) {
    const text = (textIn ?? msg).trim();
    if (!text || !chatId) return;

    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium);

    const id = String(Math.random());
    const nextMsgs = [...items, { id, role: "you", text } as Msg];
    setItems(nextMsgs); setMsg(""); setTyping(true);
    await saveJSON(STORAGE_CHAT(chatId), nextMsgs);
    await bumpPreview(text);

    try {
      const history: ChatMsg[] =
        nextMsgs.filter(m => !!m.text).slice(-24).map<ChatMsg>(m => ({
          role: m.role === "you" ? "user" : "assistant",
          content: m.text || "",
        }));

      const res = await callScottyFn({ messages: history });
      const reply = (res.data?.reply || "").trim() || "I’m blanking. Rephrase that for me?";
      const after = [...nextMsgs, { id: id + "_r", role: "scotty", text: reply } as Msg];
      setItems(after); await saveJSON(STORAGE_CHAT(chatId), after); await bumpPreview(reply);
    } catch {
      const after = [...nextMsgs, { id: id + "_r", role: "scotty", text: "Server hiccup. Try again in a sec." } as Msg];
      setItems(after); await saveJSON(STORAGE_CHAT(chatId), after); await bumpPreview("Server hiccup.");
    } finally {
      setTyping(false);
    }
  }

  /* ---------- Images (gated) ---------- */
const pickImage = async () => {
  try {
    // Gate free users before opening picker
    if (!hasPro) {
      const res: UploadGateRes | boolean = await ensureUploadAllowed();
      const allowed = typeof res === "object" ? res.allowed : !!res;
      const remaining = typeof res === "object" ? res.remaining : null;

      if (remaining !== null) setRemainingToday(remaining);

      // If NOT allowed, warn and bail out
      if (!allowed) {
        Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Warning);
        setItems(prev => ([
          ...prev,
          {
            id: String(Math.random()),
            role: "scotty",
            text: "You’ve hit the free limit (10 uploads/day). Unlock unlimited uploads with OVRTK Plus in Profile → Upgrade.",
          },
        ]));
        return;
      }
    }

    // Permissions + choose image
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted" || !chatId) return;

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.length) return;

    const localUri = res.assets[0].uri;
    const tempId   = String(Math.random());
    const nextMsgs = [...items, { id: tempId, role: "you", imageUrl: localUri } as Msg];
    setItems(nextMsgs);
    await saveJSON(STORAGE_CHAT(chatId), nextMsgs);

    if (me) {
      try {
        const uploaded = await uploadImage(localUri, me.uid);
        if (uploaded) {
          const replaced = nextMsgs.map(m => m.id === tempId ? { ...m, imageUrl: uploaded } : m);
          setItems(replaced);
          await saveJSON(STORAGE_CHAT(chatId), replaced);
        }
      } catch {}
    }

    setTyping(true);
    setTimeout(async () => {
      const bot = {
        id: tempId + "_r",
        role: "scotty",
        text: "Got it. If you want stance tighter, I can calc offsets. Drop wheel size/width/ET and your goal (flush, mild, tucked).",
      } as Msg;
      const after = [...nextMsgs, bot];
      setItems(after);
      await saveJSON(STORAGE_CHAT(chatId), after);
      await bumpPreview("Got your photo.");
      setTyping(false);
    }, 400);
  } catch {}
};


  const uploadImage = async (uri: string, uid: string) => {
    try {
      const res = await fetch(uri); const buf = await res.blob();
      const fileName = `users/${uid}/scotty/${Date.now()}.jpg`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, buf);
      return await getDownloadURL(storageRef);
    } catch { return null; }
  };

  /* ---------- Export ---------- */
  const exportChat = async (format: "text" | "md") => {
    if (!chatId) return;
    const meta = chats.find(c => c.id === chatId);
    const body = items.map(m => {
      const who = m.role === "you" ? "You" : "Scotty";
      return format === "md"
        ? `**${who}:** ${m.text || (m.imageUrl ? `![image](${m.imageUrl})` : "")}`
        : `${who}: ${m.text || (m.imageUrl ? `[image] ${m.imageUrl}` : "")}`;
    }).join(format === "md" ? "\n\n" : "\n");
    await Share.share({ title: meta?.title || "Scotty chat", message: body });
  };

  /* ---------- Drawer helpers ---------- */
  const openDrawer  = () => setDrawerOpen(true);
  const closeDrawer = () => Animated.timing(drawerX, {
    toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true,
  }).start(() => setDrawerOpen(false));

  const filtered = useMemo(() => {
    const base = [...chats].sort(sortMeta);
    const byTag = tagFilter === "All" ? base : base.filter(c => (c.tags || []).includes(tagFilter as Tag));
    const qq = q.trim().toLowerCase();
    if (!qq) return byTag;
    return byTag.filter(c =>
      c.title.toLowerCase().includes(qq) ||
      (c.last || "").toLowerCase().includes(qq) ||
      (c.tags || []).some(t => t.toLowerCase().includes(qq))
    );
  }, [chats, q, tagFilter]);

  const recent = useMemo(() => [...chats].sort(sortMeta).slice(0, 12), [chats]);

  const drawerWidth = Math.min(320, Math.round(Dimensions.get("window").width * 0.92));

  /* ---------- UI ---------- */
  return (
    <SafeAreaView style={s.safe} edges={['bottom','left','right']}>
      {/* Top bar */}
      <View style={s.topbar}>
        <View style={s.titleRow}>
          <View style={s.face}><View style={[s.eye,{left:10}]}/><View style={[s.eye,{right:10}]}/><View style={s.smile}/></View>
          <Text style={s.brand}>Ask Scotty</Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {/* quota pill */}
          <View style={s.quotaPill}>
            <Ionicons name={hasPro ? "flash" : "cloud-upload-outline"} size={12} color={hasPro ? "#111" : C.muted} />
            <Text style={s.quotaTxt}>
              {hasPro ? "Plus — Unlimited" : (remainingToday === null ? "10/day" : `${remainingToday}/10 left today`)}
            </Text>
          </View>

          <TouchableOpacity onPress={openDrawer} style={s.iconGhost}>
            <Ionicons name="time-outline" size={18} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              const created = await createChat("New chat");
              await selectChat(created.id);
            }}
            style={s.newBtn}
          >
            <Ionicons name="add" size={16} color="#111" />
            <Text style={s.newTxt}>New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recents */}
      {recent.length > 0 && (
        <View style={s.recentsWrap}>
          <Text style={s.recentsTitle}>Recents</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={recent}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ paddingHorizontal: 12 }}
            renderItem={({ item }) => {
              const active = item.id === chatId;
              return (
                <TouchableOpacity
                  onPress={() => selectChat(item.id)}
                  style={[s.recentCard, active && { borderColor: C.accent }]}
                  activeOpacity={0.9}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {item.pinned ? (
                      <Ionicons name="star" size={12} color={C.accent} />
                    ) : (
                      <Ionicons name="chatbubble-ellipses-outline" size={12} color={C.muted} />
                    )}
                    <Text style={s.recentTitle} numberOfLines={1}>{item.title || "Untitled"}</Text>
                    {!!item.unread && item.unread > 0 && (
                      <View style={s.unreadDot}><Text style={s.unreadTxt}>{item.unread}</Text></View>
                    )}
                  </View>
                  {!!item.last && <Text style={s.recentLast} numberOfLines={1}>{item.last}</Text>}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Quick chips */}
      <View style={s.quickRow}>
        {["Budget: $1.5k, 30 days","Daily + OEM+ ride, subtle drop","Track day prep checklist","Power first, then grip?"]
          .map(qv => (
            <TouchableOpacity key={qv} onPress={() => onSend(qv)} style={s.quickChip} activeOpacity={0.9}>
              <Text style={s.quickTxt}>{qv}</Text>
            </TouchableOpacity>
          ))}
      </View>

      {/* Chat list */}
      <View style={s.chatWrap}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 14, paddingBottom: listBottomPad }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Bubble role={item.role} text={item.text} imageUrl={item.imageUrl} onPreview={setPreview} />
          )}
        />
      </View>

      {/* Typing pill */}
      {typing && (
        <View style={[s.typingPill, { bottom: bottomOffset + INPUT_DOCK_H + 6 }]}>
          <View style={s.dot} /><View style={s.dot} /><View style={s.dot} />
          <Text style={s.typingTxt}>Scotty is thinking…</Text>
        </View>
      )}

      {/* Input dock */}
      <View style={[s.inputDock, { bottom: bottomOffset }]}>
        <TouchableOpacity onPress={pickImage} style={s.iconBtn}>
          <Ionicons name="image-outline" size={20} color={C.text} />
        </TouchableOpacity>
        <TextInput
          style={s.input}
          value={msg}
          onChangeText={setMsg}
          placeholder="Tell me your car + goals…"
          placeholderTextColor={C.muted}
          returnKeyType="send"
          onSubmitEditing={() => onSend()}
        />
        <TouchableOpacity style={[s.sendBtn, !msg.trim() && { opacity: 0.5 }]} onPress={() => onSend()} disabled={!msg.trim()}>
          <Ionicons name="send" size={18} color="#111" />
        </TouchableOpacity>
      </View>

      {/* Image preview */}
      <Modal visible={!!preview} transparent onRequestClose={() => setPreview(null)}>
        <Pressable style={s.previewBackdrop} onPress={() => setPreview(null)}>
          {!!preview && <Image source={{ uri: preview }} style={s.previewImg} resizeMode="contain" />}
        </Pressable>
      </Modal>

      {/* Rename chat modal */}
      <Modal visible={renameVisible} transparent animationType="fade" onRequestClose={() => setRenameVisible(false)}>
        <View style={s.modalScrim}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Rename chat</Text>
            <TextInput
              style={s.modalInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Enter new name"
              placeholderTextColor={C.muted}
              autoFocus
            />
            <View style={s.modalRow}>
              <TouchableOpacity onPress={() => setRenameVisible(false)}>
                <Text style={{ color: C.muted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (renameId) await renameChat(renameId, renameValue.trim() || "Untitled");
                  setRenameVisible(false);
                }}>
                <Text style={{ color: C.accent, fontWeight: "700" }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Drawer overlay */}
      {drawerOpen && (
        <Pressable onPress={closeDrawer} style={[StyleSheet.absoluteFill, { bottom: TAB_BAR_H, zIndex: 30 }]}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)", opacity: drawerX }]} />
        </Pressable>
      )}

      {/* Drawer panel */}
      <Animated.View
        {...panResponder.panHandlers}
        pointerEvents={drawerOpen ? "auto" : "none"}
        style={[
          s.drawer,
          {
            width: drawerWidth,
            paddingTop: insets.top || 10,
            bottom: TAB_BAR_H,
            transform: [{ translateX: drawerX.interpolate({ inputRange: [0, 1], outputRange: [drawerWidth, 0] }) }]
          }
        ]}
      >
        <View style={s.drawerHeader}>
          <Text style={s.drawerTitle}>Chats</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={() => exportChat("text")} style={s.miniGhost}>
              <Ionicons name="document-text-outline" size={18} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => exportChat("md")} style={s.miniGhost}>
              <Ionicons name="logo-markdown" size={18} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                const created = await createChat("New chat");
                setQ(""); setTagFilter("All");
                await selectChat(created.id);
              }}
              style={s.addMini}
            >
              <Ionicons name="add" size={18} color="#111" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.searchRow}>
          <Ionicons name="search" size={16} color={C.muted} />
          <TextInput
            style={s.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Search chats, tags…"
            placeholderTextColor={C.muted}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 12 }}
          renderItem={({ item }) => (
            <View style={[s.chatRow, item.id === chatId && s.chatRowActive]}>
              <TouchableOpacity onPress={() => togglePin(item.id)} style={{ padding: 6 }}>
                <Ionicons name={item.pinned ? "star" : "star-outline"} size={18} color={item.pinned ? C.accent : C.muted} />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => selectChat(item.id)} style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={s.chatTitle} numberOfLines={1}>{item.title}</Text>
                  {!!item.unread && item.unread > 0 && (
                    <View style={s.unreadDot}><Text style={s.unreadTxt}>{item.unread}</Text></View>
                  )}
                </View>
                {!!item.last && <Text style={s.chatLast} numberOfLines={1}>{item.last}</Text>}

                <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {(Object.keys(TAG_COLORS) as Tag[]).map(t => {
                    const on = (item.tags || []).includes(t);
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => {
                          const nextTags = on ? (item.tags || []).filter(tt => tt !== t) : [...(item.tags || []), t];
                          setTags(item.id, nextTags);
                        }}
                        style={[s.tagSmall, { backgroundColor: on ? TAG_COLORS[t] : "transparent", borderColor: on ? "transparent" : C.line }]}
                      >
                        <Text style={[s.tagSmallTxt, on && { color: "#111" }]}>{t}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setRenameId(item.id); setRenameValue(item.title); setRenameVisible(true); }}
                style={{ padding: 6 }}>
                <Ionicons name="pencil" size={16} color={C.muted} />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => deleteChat(item.id)} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={16} color={C.accent} />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={{ color: C.muted, padding: 12 }}>No chats yet.</Text>}
        />
      </Animated.View>
    </SafeAreaView>
  );
}

/* ---------- Bubble ---------- */
function Bubble({ role, text, imageUrl, onPreview }: { role: "you" | "scotty"; text?: string; imageUrl?: string; onPreview: (uri: string | null) => void; }) {
  const isYou = role === "you";
  return (
    <View style={[s.bubble, isYou ? s.bubbleYou : s.bubbleScotty]}>
      {!isYou && (
        <View style={s.badgeRow}>
          <Text style={s.badgeDot}>•</Text>
          <Text style={s.badgeTxt}>scotty</Text>
        </View>
      )}
      {imageUrl ? (
        <TouchableOpacity onPress={() => onPreview(imageUrl)} activeOpacity={0.9}>
          <Image source={{ uri: imageUrl }} style={s.bubbleImg} />
        </TouchableOpacity>
      ) : null}
      {text ? <Text style={s.msgTxt}>{text}</Text> : null}
    </View>
  );
}

/* ---------- Styles ---------- */
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  topbar: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1, borderColor: C.line,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brand: { color: C.text, fontSize: 18, fontWeight: "900", letterSpacing: 0.2 },

  face: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#0D0E12", borderWidth: 1, borderColor: C.line, justifyContent: "center", alignItems: "center" },
  eye: { position: "absolute", top: 11, width: 6, height: 6, borderRadius: 6, backgroundColor: C.text },
  smile: { position: "absolute", bottom: 8, width: 12, height: 3, borderRadius: 3, backgroundColor: C.accent },

  iconGhost: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#12141b", borderWidth: 1, borderColor: C.line,
  },
  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.accent, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999,
  },
  newTxt: { color: "#111", fontWeight: "900" },

  quotaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#12141b",
    borderWidth: 1,
    borderColor: C.line,
    marginRight: 6,
  },
  quotaTxt: { color: C.muted, fontSize: 11, fontWeight: "800" },

  /* Recents */
  recentsWrap: { paddingVertical: 8, gap: 6 },
  recentsTitle: { color: C.muted, fontSize: 12, paddingHorizontal: 14, textTransform: "uppercase", letterSpacing: 0.6 },
  recentCard: {
    width: 220, marginRight: 8,
    backgroundColor: "#12141b", borderWidth: 1, borderColor: C.line, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  recentTitle: { color: C.text, fontWeight: "800", flexShrink: 1 },
  recentLast: { color: C.muted, fontSize: 12, marginTop: 2 },

  quickRow: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickChip: { backgroundColor: "#0f1218", borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  quickTxt: { color: C.text, fontSize: 12, fontWeight: "700" },

  chatWrap: { flex: 1 },

  bubble: { maxWidth: "88%", padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  bubbleYou: { alignSelf: "flex-end", backgroundColor: "#191c23", borderColor: C.line },
  bubbleScotty: { alignSelf: "flex-start", backgroundColor: C.panel, borderColor: C.line },

  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  badgeDot: { color: C.accent, fontSize: 14, lineHeight: 14 },
  badgeTxt: { color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },

  msgTxt: { color: C.text },
  bubbleImg: { width: 220, height: 220, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: "#0b0d12" },

  // Typing pill
  typingPill: {
    position: "absolute",
    left: 14, right: 14,
    height: 30,
    borderRadius: 999,
    backgroundColor: "#12141b",
    borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 12,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  dot: { width: 6, height: 6, borderRadius: 6, backgroundColor: C.muted, opacity: 0.6 },
  typingTxt: { color: C.muted, fontSize: 12 },

  // ABSOLUTE dock that follows keyboard
  inputDock: {
    position: "absolute", left: 0, right: 0,
    borderTopWidth: 1, borderColor: C.line, backgroundColor: C.glass,
    paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8,
    flexDirection: "row", gap: 10, alignItems: "center",
    height: 72,
  },
  iconBtn: { width: 44, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: "#12141b", borderWidth: 1, borderColor: C.line },
  input: { flex: 1, height: 44, borderRadius: 999, paddingHorizontal: 14, color: C.text, backgroundColor: "#12141b", borderWidth: 1, borderColor: C.line },
  sendBtn: { height: 44, paddingHorizontal: 14, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: C.accent },

  previewBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center" },
  previewImg: { width: "94%", height: "86%" },

  // Rename modal styles
  modalScrim: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center"
  },
  modalCard: {
    width: "82%", backgroundColor: C.panel,
    borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: C.line
  },
  modalTitle: { color: C.text, fontWeight: "800", marginBottom: 10, fontSize: 16 },
  modalInput: {
    borderWidth: 1, borderColor: C.line, borderRadius: 8,
    color: C.text, paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: "#12141b"
  },
  modalRow: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 14 },

  // Drawer
  drawer: {
    position: "absolute", right: 0, top: 0,
    backgroundColor: C.panel, borderLeftWidth: 1, borderColor: C.line, padding: 12,
    zIndex: 40,
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: -6, height: 0 },
    elevation: 12,
    borderTopLeftRadius: 16,
  },
  drawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  drawerTitle: { color: C.text, fontWeight: "900", fontSize: 16 },
  addMini: { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  miniGhost: { backgroundColor: "#12141b", borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 8, justifyContent: "center" },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#12141b", borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  searchInput: { color: C.text, flex: 1 },

  chatRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#12141b", borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 10, marginBottom: 8 },
  chatRowActive: { borderColor: C.accent },
  chatTitle: { color: C.text, fontWeight: "800" },
  chatLast: { color: C.muted, fontSize: 12, marginTop: 2 },

  tagSmall: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  tagSmallTxt: { color: C.muted, fontSize: 11, fontWeight: "700" },

  unreadDot: { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 4 },
  unreadTxt: { color: "#111", fontSize: 10, fontWeight: "900" },
});
