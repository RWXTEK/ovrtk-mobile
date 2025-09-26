import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Share,
  Modal,
  Animated,
  Easing,
  Pressable,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc
} from "firebase/firestore";
import { auth, db, storage } from "../../../lib/firebase";
import { ref, deleteObject } from "firebase/storage";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

// Optional haptics (safe to leave if not installed)
let Haptics: any = null;
try { Haptics = require("expo-haptics"); } catch {}

type Car = {
  id: string;
  make: string;
  model: string;
  year?: number;
  trim?: string;
  photoURL?: string;
  pinned?: boolean;
  createdAt?: any;
};

const C = {
  bg: "#0C0D11",
  panel: "#121318",
  line: "#1E2127",
  text: "#E7EAF0",
  muted: "#A6ADBB",
  accent: "#E11D48",
  dim: "#0f1218",
};

export default function Garage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<User | null>(null);
  const [cars, setCars] = useState<Car[]>([]);
  const [sheetCar, setSheetCar] = useState<Car | null>(null);

  useEffect(() => onAuthStateChanged(auth, setMe), []);

  useEffect(() => {
    if (!me) { setCars([]); return; }
    const col = collection(db, "garages", me.uid, "cars");
    const q = query(col, orderBy("pinned", "desc"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      setCars(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    return unsub;
  }, [me]);

  const countText = useMemo(() => `${cars.length} ${cars.length === 1 ? "car" : "cars"}`, [cars.length]);

  const pinToggle = useCallback(async (car: Car) => {
    if (!me) return;
    await updateDoc(doc(db, "garages", me.uid, "cars", car.id), { pinned: !car.pinned });
  }, [me]);

  const shareCar = useCallback(async (car: Car) => {
    const title = `${car.year ?? ""} ${car.make} ${car.model}`.trim();
    await Share.share({ message: title, title });
  }, []);

  const deleteCar = useCallback(async (car: Car) => {
    if (!me) return;
    const go = () => (async () => {
      try {
        if (car.photoURL) {
          const rs = ref(storage, `users/${me.uid}/cars/${car.id}.jpg`);
          await deleteObject(rs).catch(() => {});
        }
        await deleteDoc(doc(db, "garages", me.uid, "cars", car.id));
      } catch (e) {
        Alert.alert("Delete failed", "Could not delete this car.");
      }
    })();
    Alert.alert("Delete car", "This can’t be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: go },
    ]);
  }, [me]);

  const openSheet = (car: Car) => {
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light);
    setSheetCar(car);
  };
  const closeSheet = () => setSheetCar(null);

  return (
    // inside Garage() return
    <SafeAreaView style={[s.safe, { paddingBottom: insets.bottom }]}>
      <Stack.Screen
        options={{
        headerShown: false,
        gestureEnabled: false,          // 🚫 edge-swipe back
        fullScreenGestureEnabled: false // 🚫 anywhere-swipe back (iOS native-stack)
      }}
    />

      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={s.badge}>
            <Ionicons name="car-sport-outline" size={14} color="#111" />
            <Text style={s.badgeTxt}>My Garage</Text>
          </View>
          <View style={s.countChip}>
            <Ionicons name="albums-outline" size={12} color={C.muted} />
            <Text style={s.count}>{countText}</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.push("/cardtab/edit")}
          style={s.addBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Not signed in */}
      {!me ? (
        <View style={s.center}>
          <Text style={s.muted}>Sign in to save your builds.</Text>
          <View style={{ height: 10 }} />
          <TouchableOpacity onPress={() => router.push("/auth/login")} style={s.primary}>
            <Text style={s.primaryTxt}>Log in</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={cars}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/car/[id]", params: { id: item.id } })}
              onLongPress={() => openSheet(item)}
              style={[s.card, item.pinned && s.cardPinned]}
              activeOpacity={0.9}
            >
              {item.photoURL ? (
                <Image source={{ uri: item.photoURL }} style={s.thumb} />
              ) : (
                <View style={[s.thumb, s.thumbEmpty]}>
                  <Ionicons name="car-sport" size={26} color={C.muted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.carTitle}>
                  {item.year ? `${item.year} ` : ""}{item.make} {item.model}
                </Text>
                {item.trim ? <Text style={s.trim}>{item.trim}</Text> : null}
              </View>
              {item.pinned ? <Ionicons name="bookmark" size={18} color={C.accent} /> : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text style={s.muted}>No cars yet. Tap the + to add your first.</Text>
            </View>
          }
        />
      )}

      {/* Bottom Sheet */}
      <ActionSheet
        open={!!sheetCar}
        onClose={closeSheet}
        title={sheetCar ? `${sheetCar.make} ${sheetCar.model}` : ""}
        actions={[
          {
            icon: sheetCar?.pinned ? "bookmark" : "bookmark-outline",
            label: sheetCar?.pinned ? "Unpin from top" : "Pin to top",
            onPress: async () => { if (sheetCar) await pinToggle(sheetCar); closeSheet(); },
          },
          {
            icon: "share-social-outline",
            label: "Share",
            onPress: async () => { if (sheetCar) await shareCar(sheetCar); closeSheet(); },
          },
          {
            icon: "create-outline",
            label: "Edit",
            onPress: () => { if (sheetCar) router.push({ pathname: "/cardtab/edit", params: { id: sheetCar.id } }); closeSheet(); },
          },
          {
            icon: "trash-outline",
            label: "Delete",
            destructive: true,
            onPress: async () => { if (sheetCar) await deleteCar(sheetCar); closeSheet(); },
          },
        ]}
      />
    </SafeAreaView>
  );
}

/* ---------- Bottom Sheet (no deps) ---------- */
function ActionSheet({
  open,
  onClose,
  title,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  actions: Array<{
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void | Promise<void>;
    destructive?: boolean;
  }>;
}) {
  const slide = useRef(new Animated.Value(0)).current; // 0 closed, 1 open

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: open ? 180 : 160,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open]);

  if (!open) return null;

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });
  const backdropOpacity = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  return (
    <Modal transparent animationType="none" visible={open} onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[s.backdrop, { opacity: backdropOpacity }]} />
      </Pressable>

      <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
        {title ? (
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{title}</Text>
          </View>
        ) : null}

        {actions.map((a, i) => (
          <TouchableOpacity
            key={i}
            onPress={a.onPress}
            activeOpacity={0.9}
            style={[s.sheetRow, a.destructive && { backgroundColor: "rgba(225,29,72,0.08)" }]}
          >
            <Ionicons
              name={a.icon}
              size={18}
              color={a.destructive ? C.accent : C.text}
              style={{ width: 24 }}
            />
            <Text style={[s.sheetTxt, a.destructive && { color: C.accent }]}>{a.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.muted} style={{ marginLeft: "auto" }} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity onPress={onClose} activeOpacity={0.9} style={[s.sheetRow, s.sheetCancel]}>
          <Ionicons name="close-outline" size={18} color={C.text} style={{ width: 24 }} />
          <Text style={s.sheetTxt}>Cancel</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

/* ---------- Styles ---------- */
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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

  countChip: {
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
  count: { color: C.muted, fontSize: 12 },

  addBtn: {
    backgroundColor: C.accent,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  primaryTxt: { color: "#fff", fontWeight: "900" },
  muted: { color: C.muted },

  card: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardPinned: {
    borderColor: C.accent,
    shadowColor: "#E11D48",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: C.dim },
  thumbEmpty: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line },
  carTitle: { color: C.text, fontWeight: "900" },
  trim: { color: C.muted, marginTop: 2 },

  // Action sheet
  backdrop: { flex: 1, backgroundColor: "black" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    paddingBottom: 18,
    backgroundColor: "transparent",
  },
  sheetHeader: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  sheetTitle: { color: C.text, fontWeight: "900", fontSize: 16 },

  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  sheetTxt: { color: C.text, fontWeight: "800" },
  sheetCancel: {
    marginTop: 4,
    backgroundColor: C.dim,
  },
});
