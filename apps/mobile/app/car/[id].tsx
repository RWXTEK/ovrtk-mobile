// apps/mobile/app/car/[id].tsx
import { useEffect, useMemo, useState, useCallback, useLayoutEffect, useRef } from "react";
import {
  View, Text, Image, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Platform, KeyboardAvoidingView
} from "react-native";
import { Stack, useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import {
  doc, getDoc, updateDoc, serverTimestamp,
  onSnapshot, collection, addDoc, deleteDoc, query, orderBy
} from "firebase/firestore";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const C = {
  bg: "#0C0D11", panel: "#121318", line: "#1E2127", text: "#E7EAF0",
  muted: "#A6ADBB", accent: "#E11D48", good: "#22c55e", warn: "#f59e0b", dim: "#0f1218",
};

type StatusKey = "OK" | "CHECK" | "SERVICE";
type Car = {
  id: string; make: string; model: string;
  year: number | null; trim: string | null; photoURL: string | null;
  pinned?: boolean; oilStatus?: StatusKey; batteryStatus?: StatusKey; tiresStatus?: StatusKey;
  createdAt?: any; updatedAt?: any;
};
type Note = { id: string; text: string; createdAt?: any };
type Mod  = { id: string; text: string; createdAt?: any };

const cycle = (v?: StatusKey): StatusKey => (v === "OK" ? "CHECK" : v === "CHECK" ? "SERVICE" : "OK");

export default function CarDetail() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [me, setMe] = useState<User | null>(null);

  const [car, setCar]   = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinBusy, setPinBusy] = useState(false);

  const [notes, setNotes] = useState<Note[]>([]);
  const [mods,  setMods]  = useState<Mod[]>([]);

  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  useEffect(() => onAuthStateChanged(auth, setMe), []);

  // hide tab bar while here
  useLayoutEffect(() => {
    const parent = (navigation as any)?.getParent?.();
    parent?.setOptions?.({ tabBarStyle: { display: "none" } });
    return () => parent?.setOptions?.({ tabBarStyle: undefined });
  }, [navigation]);

  // animated back
  const animatedBack = () => {
    if ((navigation as any)?.canGoBack?.()) {
      (navigation as any).goBack();
    } else {
      router.push("/(tabs)/garage");
    }
  };

  // Load car
  useEffect(() => {
    (async () => {
      if (!me || !id) return;
      try {
        setLoading(true);
        const snap = await getDoc(doc(db, "garages", me.uid, "cars", id));
        setCar(snap.exists() ? ({ id, ...(snap.data() as any) } as Car) : null);
      } catch (e) {
        console.warn("Failed to load car:", e);
        Alert.alert("Error", "Could not load this car.");
      } finally {
        setLoading(false);
      }
    })();
  }, [me, id]);

  // Live notes & mods
  useEffect(() => {
    if (!me || !id) return;
    const notesQ = query(collection(db, "garages", me.uid, "cars", id, "notes"), orderBy("createdAt", "desc"));
    const modsQ  = query(collection(db, "garages", me.uid, "cars", id, "mods"),  orderBy("createdAt", "desc"));
    const un1 = onSnapshot(notesQ, s => setNotes(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    const un2 = onSnapshot(modsQ,  s => setMods(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    return () => { un1(); un2(); };
  }, [me, id]);

  const title = useMemo(() => {
    if (!car) return "Car";
    const y = car.year ? `${car.year} ` : "";
    return `${y}${car.make ?? ""} ${car.model ?? ""}`.trim();
  }, [car]);

  const togglePinned = async () => {
    if (!me || !car) return;
    try {
      setPinBusy(true);
      const next = !car.pinned;
      await updateDoc(doc(db, "garages", me.uid, "cars", car.id), { pinned: next, updatedAt: serverTimestamp() });
      setCar({ ...car, pinned: next });
    } catch {
      Alert.alert("Update failed", "Could not update pin.");
    } finally {
      setPinBusy(false);
    }
  };

  const setStatus = useCallback(async (key: "oilStatus" | "batteryStatus" | "tiresStatus") => {
    if (!me || !car) return;
    try {
      const next = cycle(car[key] as StatusKey);
      await updateDoc(doc(db, "garages", me.uid, "cars", car.id), { [key]: next, updatedAt: serverTimestamp() });
      setCar({ ...car, [key]: next });
    } catch {
      Alert.alert("Update failed", "Could not update status.");
    }
  }, [me, car]);

  const addNote = async () => {
    if (!me || !id) return;
    Alert.prompt?.("Add note", undefined, async (text) => {
      const trimmed = (text ?? "").trim();
      if (!trimmed) return;
      try {
        await addDoc(collection(db, "garages", me.uid, "cars", id, "notes"), {
          text: trimmed, createdAt: serverTimestamp(),
        });
      } catch { Alert.alert("Error", "Failed to add note."); }
    });
  };
  const removeNote = async (noteId: string) => {
    if (!me || !id) return;
    try { await deleteDoc(doc(db, "garages", me.uid, "cars", id, "notes", noteId)); }
    catch { Alert.alert("Error", "Failed to delete note."); }
  };

  const addMod = async () => {
    if (!me || !id) return;
    Alert.prompt?.("Add mod", undefined, async (text) => {
      const trimmed = (text ?? "").trim();
      if (!trimmed) return;
      try {
        await addDoc(collection(db, "garages", me.uid, "cars", id, "mods"), {
          text: trimmed, createdAt: serverTimestamp(),
        });
      } catch { Alert.alert("Error", "Failed to add mod."); }
    });
  };
  const removeMod = async (modId: string) => {
    if (!me || !id) return;
    try { await deleteDoc(doc(db, "garages", me.uid, "cars", id, "mods", modId)); }
    catch { Alert.alert("Error", "Failed to delete mod."); }
  };

  const goAskScotty = () => {
    router.push({ pathname: "/(tabs)/scotty", params: { carId: car!.id, title } });
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={s.center}><ActivityIndicator /><Text style={{ color: C.muted, marginTop: 8 }}>Loading car…</Text></View>
      </SafeAreaView>
    );
  }
  if (!car) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={s.center}><Text style={{ color: C.muted }}>This car isn’t in your garage.</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* custom back arrow with animated pop */}
      <View style={{ paddingTop: insets.top }}>
        <TouchableOpacity onPress={animatedBack} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
          <Text style={s.backTxt}>Garage</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* HERO (only if photo exists) */}
          {car.photoURL ? (
            <View style={s.heroWrap}>
              <Image source={{ uri: car.photoURL }} style={s.heroImg} />
              <View style={s.heroOverlay} />
              <View style={s.heroRow}>
                <View style={s.titleBlock}>
                  {car.pinned ? (
                    <View style={s.badgePin}>
                      <Ionicons name="star" size={12} color="#111" />
                      <Text style={s.badgePinTxt}>Pinned</Text>
                    </View>
                  ) : null}
                  <Text style={s.titleTxt}>{title}</Text>
                  {car.trim ? <Text style={s.subtitleTxt}>{car.trim}</Text> : null}
                </View>

                <TouchableOpacity onPress={togglePinned} disabled={pinBusy} style={[s.pinBtn, car.pinned && { borderColor: C.accent }]} activeOpacity={0.9}>
                  <Ionicons name={car.pinned ? "star" : "star-outline"} size={20} color={car.pinned ? C.accent : C.muted} />
                  <Text style={[s.pinTxt, car.pinned && { color: C.accent }]}>{car.pinned ? "Unpin" : "Pin"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[s.card, { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
              <View style={s.titleBlock}>
                {car.pinned ? (
                  <View style={s.badgePin}>
                    <Ionicons name="star" size={12} color="#111" />
                    <Text style={s.badgePinTxt}>Pinned</Text>
                  </View>
                ) : null}
                <Text style={[s.titleTxt, { fontSize: 20, color: C.text }]}>{title}</Text>
                {car.trim ? <Text style={s.subtitleTxt}>{car.trim}</Text> : null}
              </View>
              <TouchableOpacity onPress={togglePinned} disabled={pinBusy} style={[s.pinBtn, car.pinned && { borderColor: C.accent }]} activeOpacity={0.9}>
                <Ionicons name={car.pinned ? "star" : "star-outline"} size={20} color={car.pinned ? C.accent : C.muted} />
                <Text style={[s.pinTxt, car.pinned && { color: C.accent }]}>{car.pinned ? "Unpin" : "Pin"}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* SPECS */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Specs</Text>
            <View style={s.specGrid}>
              <Spec label="Make"  value={car.make} />
              <Spec label="Model" value={car.model} />
              <Spec label="Year"  value={car.year ? String(car.year) : "—"} />
              <Spec label="Trim"  value={car.trim || "—"} />
            </View>
          </View>

          {/* QUICK STATUS */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Quick Status</Text>
            <View style={s.chipsRow}>
              <StatusChip icon="speedometer-outline" label="Oil"     value={car.oilStatus     || "OK"} onPress={() => setStatus("oilStatus")} />
              <StatusChip icon="flash-outline"       label="Battery" value={car.batteryStatus || "OK"} onPress={() => setStatus("batteryStatus")} />
              <StatusChip icon="warning-outline"     label="Tires"   value={car.tiresStatus   || "OK"} onPress={() => setStatus("tiresStatus")} />
            </View>
            <Text style={s.hintRow}>Tap a chip to cycle status.</Text>
          </View>

          {/* ASK SCOTTY (CTA) */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Ask Scotty</Text>
            <Text style={{ color: C.muted, marginTop: 6, marginBottom: 10 }}>
              Need advice about this build? Jump to Scotty with this car’s context.
            </Text>
            <TouchableOpacity onPress={goAskScotty} style={s.primary} activeOpacity={0.9}>
              <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
              <Text style={s.primaryTxt}>Ask Scotty about this car</Text>
            </TouchableOpacity>
          </View>

          {/* NOTES */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Garage Notes</Text>
              <TouchableOpacity onPress={addNote}><Text style={{ color: C.accent, fontWeight: "800" }}>Add</Text></TouchableOpacity>
            </View>
            {notes.length === 0 ? (
              <Text style={{ color: C.muted, marginTop: 6 }}>No notes yet.</Text>
            ) : (
              notes.map(n => (
                <View key={n.id} style={s.noteItem}>
                  <View style={s.dot} />
                  <Text style={s.noteTxt}>{n.text}</Text>
                  <TouchableOpacity onPress={() => removeNote(n.id)} style={s.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={16} color={C.muted} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          {/* MODS */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Mods</Text>
              <TouchableOpacity onPress={addMod}><Text style={{ color: C.accent, fontWeight: "800" }}>Add</Text></TouchableOpacity>
            </View>
            {mods.length === 0 ? (
              <Text style={{ color: C.muted, marginTop: 6 }}>No mods logged yet.</Text>
            ) : (
              mods.map(m => (
                <View key={m.id} style={s.modItem}>
                  <Ionicons name="construct-outline" size={18} color={C.muted} />
                  <Text style={s.modTxt}>{m.text}</Text>
                  <TouchableOpacity onPress={() => removeMod(m.id)} style={s.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={16} color={C.muted} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          {/* ACTIONS */}
          <View style={[s.card, { gap: 10 }]}>
            <TouchableOpacity onPress={() => router.push({ pathname: "/cardtab/edit", params: { id: car.id } })} style={s.secondary} activeOpacity={0.9}>
              <Ionicons name="create-outline" size={18} color={C.text} />
              <Text style={s.secondaryTxt}>Edit details</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* helpers */
function Spec({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.specBox}>
      <Text style={s.specLabel}>{label}</Text>
      <Text style={s.specValue}>{value}</Text>
    </View>
  );
}
function StatusChip({ icon, label, value, onPress }:{
  icon: keyof typeof Ionicons.glyphMap; label: string; value: StatusKey; onPress: () => void;
}) {
  const tone = value === "OK" ? C.good : value === "CHECK" ? C.warn : C.accent;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={[s.chip, { borderColor: C.line }]}>
      <Ionicons name={icon} size={16} color={tone} />
      <Text style={[s.chipTxt, { color: tone }]}>{label}: {value}</Text>
    </TouchableOpacity>
  );
}

/* styles */
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    paddingHorizontal: 12,
    paddingVertical: -10,
  },
  backTxt: { color: "#fff", fontWeight: "800" },

  heroWrap: { width: "100%", aspectRatio: 16 / 9, backgroundColor: C.dim },
  heroImg: { width: "100%", height: "100%", resizeMode: "cover" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
  heroRow: {
    position: "absolute", left: 12, right: 12, bottom: 12,
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12,
  },
  titleBlock: { gap: 4, maxWidth: "70%" },
  titleTxt: { color: "#fff", fontSize: 22, fontWeight: "900" },
  subtitleTxt: { color: C.muted, fontSize: 13 },

  badgePin: {
    alignSelf: "flex-start", flexDirection: "row", gap: 6, alignItems: "center",
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: C.accent,
  },
  badgePinTxt: { color: "#111", fontWeight: "900", fontSize: 10, textTransform: "uppercase" },

  pinBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: C.line, backgroundColor: "rgba(0,0,0,0.35)",
  },
  pinTxt: { color: C.muted, fontWeight: "700" },

  card: {
    marginTop: 12, marginHorizontal: 12,
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, padding: 14,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  cardTitle: { color: C.text, fontWeight: "900", fontSize: 16 },

  specGrid: { marginTop: 8, gap: 8, flexDirection: "row", flexWrap: "wrap" },
  specBox: {
    width: "48%", backgroundColor: C.dim, borderWidth: 1, borderColor: C.line,
    borderRadius: 12, padding: 12, gap: 4,
  },
  specLabel: { color: C.muted, fontSize: 12 },
  specValue: { color: C.text, fontWeight: "800" },

  chipsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 6 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.dim,
  },
  chipTxt: { fontWeight: "700", fontSize: 12 },
  hintRow: { color: C.muted, fontSize: 12, marginTop: 6 },

  noteItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  noteTxt: { color: C.text, flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 999, backgroundColor: C.accent, marginLeft: 2 },
  iconBtn: { paddingHorizontal: 6, paddingVertical: 6 },

  modItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  modTxt: { color: C.text, flex: 1 },

  primary: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12,
  },
  primaryTxt: { color: "#fff", fontWeight: "900" },

  secondary: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: C.dim, borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: C.line,
  },
  secondaryTxt: { color: C.text, fontWeight: "800" },
});
