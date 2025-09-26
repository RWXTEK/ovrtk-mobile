// apps/mobile/app/cardtab/edit.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ScrollView, Switch
} from "react-native";
import { Stack, useLocalSearchParams, router, useNavigation } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import { doc, getDoc, addDoc, updateDoc, collection, serverTimestamp } from "firebase/firestore";

const C = {
  bg: "#0C0D11", panel: "#121318", line: "#1E2127", text: "#E7EAF0",
  muted: "#A6ADBB", accent: "#E11D48", dim: "#0f1218",
};

export default function EditCar() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = useMemo(() => Boolean(id), [id]);

  const navigation = useNavigation();
  const [me, setMe] = useState<User | null>(null);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<string>("");
  const [trim, setTrim] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const modelRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const trimRef = useRef<TextInput>(null);

  // auth
  useEffect(() => onAuthStateChanged(auth, setMe), []);

  // load when editing
  useEffect(() => {
    (async () => {
      if (!me || !id) return;
      try {
        const snap = await getDoc(doc(db, "garages", me.uid, "cars", id));
        if (snap.exists()) {
          const d = snap.data() as any;
          setMake(d.make ?? "");
          setModel(d.model ?? "");
          setYear(d.year != null ? String(d.year) : "");
          setTrim(d.trim ?? "");
          setPinned(Boolean(d.pinned));
        }
      } catch (e) {
        console.warn("load car failed:", e);
      }
    })();
  }, [me, id]);

  const animatedBack = () => {
    // prefer a real back animation; fallback to garage tab
    if ((navigation as any)?.canGoBack?.()) {
      (navigation as any).goBack();
    } else {
      router.push("/(tabs)/garage");
    }
  };

  const save = async () => {
    if (!me) return Alert.alert("Sign in required", "Please sign in first.");
    if (!make.trim() || !model.trim()) return Alert.alert("Missing info", "Make and model are required.");
    if (year && isNaN(Number(year))) return Alert.alert("Invalid year", "Use a 4-digit year like 1999.");

    const payload = {
      make: make.trim(),
      model: model.trim(),
      year: year ? Number(year) : null,
      trim: trim.trim() || null,
      pinned,
    };

    try {
      setSaving(true);
      if (isEdit && id) {
        await updateDoc(doc(db, "garages", me.uid, "cars", id), { ...payload, updatedAt: serverTimestamp() });
        // pop with animation back to wherever they came from, then show detail
        router.replace(`/car/${id}`);
      } else {
        const ref = await addDoc(collection(db, "garages", me.uid, "cars"), {
          ...payload, photoURL: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        router.replace(`/car/${ref.id}`);
      }
    } catch (e: any) {
      console.error("save failed:", e);
      Alert.alert("Save failed", String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

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
          contentContainerStyle={[s.centerWrap, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* badge */}
          <View style={s.garageHeader}>
            <View style={s.badge}>
              <Ionicons name="car-sport-outline" size={14} color="#111" />
              <Text style={s.badgeTxt}>{isEdit ? "Edit Garage Entry" : "New Garage Entry"}</Text>
            </View>
            {isEdit && id ? (
              <View style={s.badgeGhost}>
                <Ionicons name="id-card-outline" size={14} color={C.muted} />
                <Text style={s.badgeGhostTxt}>ID: {String(id).slice(0, 8)}…</Text>
              </View>
            ) : null}
          </View>

          {/* form card */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Basics</Text>
            <View style={s.divider} />

            <View style={s.group}>
              <FieldLabel label="Make" />
              <TextInput
                style={s.input}
                value={make}
                onChangeText={setMake}
                placeholder="Mercedes-Benz"
                placeholderTextColor={C.muted}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => modelRef.current?.focus()}
              />
            </View>

            <View style={s.group}>
              <FieldLabel label="Model" />
              <TextInput
                ref={modelRef}
                style={s.input}
                value={model}
                onChangeText={setModel}
                placeholder="E320 / W210"
                placeholderTextColor={C.muted}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => yearRef.current?.focus()}
              />
            </View>

            <View style={s.row}>
              <View style={[s.group, { flex: 1 }]}>
                <FieldLabel label="Year" hint="YYYY" />
                <TextInput
                  ref={yearRef}
                  style={s.input}
                  value={year}
                  onChangeText={setYear}
                  placeholder="1999"
                  placeholderTextColor={C.muted}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => trimRef.current?.focus()}
                />
              </View>
              <View style={{ width: 10 }} />
              <View style={[s.group, { flex: 1 }]}>
                <FieldLabel label="Trim" hint="Optional" />
                <TextInput
                  ref={trimRef}
                  style={s.input}
                  value={trim}
                  onChangeText={setTrim}
                  placeholder="Sport / Premium…"
                  placeholderTextColor={C.muted}
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* options */}
            <View style={{ height: 18 }} />
            <Text style={s.sectionTitle}>Garage Options</Text>
            <View style={s.divider} />

            <View style={[s.row, { alignItems: "center", justifyContent: "space-between" }]}>
              <View style={{ gap: 4 }}>
                <Text style={s.switchLabel}>Pin to Top</Text>
                <Text style={s.switchHint}>Keep this car at the front of your garage.</Text>
              </View>
              <Switch
                value={pinned}
                onValueChange={setPinned}
                thumbColor={pinned ? "#fff" : "#bbb"}
                trackColor={{ false: C.line, true: C.accent }}
              />
            </View>

            {/* preview chips */}
            <View style={{ height: 18 }} />
            <Text style={s.sectionTitle}>Preview</Text>
            <View style={s.divider} />
            <View style={s.chipsRow}>
              <Chip icon="pricetag-outline" text={(make || "Make").toUpperCase()} />
              <Chip icon="cube-outline" text={(model || "Model").toUpperCase()} />
              <Chip icon="calendar-outline" text={year ? String(year) : "—"} />
              <Chip icon="ribbon-outline" text={trim || "—"} />
            </View>

            {/* actions */}
            <View style={{ height: 12 }} />
            <TouchableOpacity
              onPress={save}
              style={[s.primary, saving && { opacity: 0.6 }]}
              activeOpacity={0.9}
              disabled={saving}
            >
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={s.primaryTxt}>{isEdit ? "Save changes" : "Add car"}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={animatedBack} style={s.secondary} activeOpacity={0.9}>
              <Ionicons name="arrow-undo-outline" size={18} color={C.text} />
              <Text style={s.secondaryTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.footerNote}>Powered by RWX-TEK INC.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* helpers */
function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

function Chip({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={s.chip}>
      <Ionicons name={icon} size={14} color={C.muted} />
      <Text style={s.chipTxt}>{text}</Text>
    </View>
  );
}

/* styles */
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  backTxt: { color: "#fff", fontWeight: "800" },

  centerWrap: { flexGrow: 1, padding: 16 },

  garageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: C.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeTxt: { color: "#111", fontWeight: "900", fontSize: 12, textTransform: "uppercase" },
  badgeGhost: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: C.dim,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeGhostTxt: { color: C.muted, fontWeight: "800", fontSize: 12 },

  card: {
    width: "100%",
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },

  sectionTitle: { color: C.text, fontWeight: "900", fontSize: 14 },
  divider: { height: 1, backgroundColor: C.line, opacity: 0.9, marginVertical: 4 },

  group: { gap: 6 },
  row: { flexDirection: "row" },

  label: { color: C.muted, fontSize: 12, fontWeight: "700" },
  hint: { color: C.muted, fontSize: 11, opacity: 0.8 },

  input: {
    color: C.text,
    backgroundColor: C.dim,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  switchLabel: { color: C.text, fontWeight: "800" },
  switchHint: { color: C.muted, fontSize: 12 },

  chipsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: C.dim,
  },
  chipTxt: { color: C.text, fontWeight: "800", fontSize: 12 },

  primary: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  primaryTxt: { color: "#fff", fontWeight: "900" },

  secondary: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.dim,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  secondaryTxt: { color: C.text, fontWeight: "800" },

  footerNote: {
    textAlign: "center",
    color: C.muted,
    marginTop: 12,
    fontSize: 12,
  },
});
