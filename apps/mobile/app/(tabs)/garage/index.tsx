import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  Modal,
  Animated,
  Easing,
  Pressable,
  ScrollView,
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
  purchasePrice?: number;
  currentValue?: number;
};

const C = {
  bg: "#0C0D11",
  panel: "#121318",
  line: "#1E2127",
  text: "#E7EAF0",
  muted: "#A6ADBB",
  accent: "#E11D48",
  dim: "#0f1218",
  good: "#22c55e",
};

type SortOption = "recent" | "year" | "make" | "value" | "pinned";
type ViewMode = "list" | "grid";

export default function Garage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<User | null>(null);
  const [cars, setCars] = useState<Car[]>([]);
  const [sheetCar, setSheetCar] = useState<Car | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("pinned");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showSortModal, setShowSortModal] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setMe), []);

  useEffect(() => {
    if (!me) { setCars([]); return; }
    const col = collection(db, "garages", me.uid, "cars");
    const q = query(col, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      setCars(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    return unsub;
  }, [me]);

  const sortedCars = useMemo(() => {
    const sorted = [...cars];
    switch (sortBy) {
      case "pinned":
        return sorted.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return 0;
        });
      case "year":
        return sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
      case "make":
        return sorted.sort((a, b) => a.make.localeCompare(b.make));
      case "value":
        return sorted.sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
      case "recent":
      default:
        return sorted;
    }
  }, [cars, sortBy]);

  const stats = useMemo(() => {
    const totalValue = cars.reduce((sum, c) => sum + (c.currentValue || 0), 0);
    const totalInvested = cars.reduce((sum, c) => sum + (c.purchasePrice || 0), 0);
    const mostValuable = cars.reduce((max, c) => 
      (c.currentValue || 0) > (max.currentValue || 0) ? c : max
    , cars[0]);
    const uniqueMakes = new Set(cars.map(c => c.make)).size;
    const oldestYear = Math.min(...cars.map(c => c.year || 9999));
    
    return { totalValue, totalInvested, mostValuable, uniqueMakes, oldestYear };
  }, [cars]);

  const milestones = useMemo(() => {
    const badges = [];
    if (cars.length >= 1) badges.push({ icon: "trophy", label: "First Build", color: C.accent });
    if (cars.length >= 5) badges.push({ icon: "ribbon", label: "Dream Garage", color: "#f59e0b" });
    if (cars.length >= 10) badges.push({ icon: "medal", label: "Collector", color: "#8b5cf6" });
    if (stats.uniqueMakes >= 3) badges.push({ icon: "albums", label: "Diverse Fleet", color: "#06b6d4" });
    return badges;
  }, [cars.length, stats.uniqueMakes]);

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
    Alert.alert("Delete car", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: go },
    ]);
  }, [me]);

  const openSheet = (car: Car) => {
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light);
    setSheetCar(car);
  };
  const closeSheet = () => setSheetCar(null);

  const EmptyState = () => (
    <View style={s.emptyState}>
      <Ionicons name="car-sport-outline" size={64} color={C.muted} />
      <Text style={s.emptyTitle}>Start Your Collection</Text>
      <Text style={s.emptyDesc}>Add your first car to track builds, mods, and value</Text>
      
      <View style={s.tipsCard}>
        <Text style={s.tipsTitle}>Pro Tips:</Text>
        <Text style={s.tipItem}>📸 Add photos to showcase your ride</Text>
        <Text style={s.tipItem}>🔧 Track mods and performance gains</Text>
        <Text style={s.tipItem}>💰 Monitor your garage's value</Text>
      </View>

      <TouchableOpacity onPress={() => router.push("/cardtab/edit")} style={s.emptyBtn}>
        <Ionicons name="add-circle" size={20} color="#fff" />
        <Text style={s.emptyBtnTxt}>Add Your First Car</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[s.safe, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false, fullScreenGestureEnabled: false }} />

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

        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() => setViewMode(viewMode === "list" ? "grid" : "list")}
            style={s.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={viewMode === "list" ? "grid-outline" : "list-outline"} size={20} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowSortModal(true)}
            style={s.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="swap-vertical" size={20} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/cardtab/edit")}
            style={s.addBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

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
          data={sortedCars}
          key={viewMode}
          numColumns={viewMode === "grid" ? 2 : 1}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListHeaderComponent={
            cars.length > 0 ? (
              <>
                {/* Stats Dashboard */}
                <View style={s.statsCard}>
                  <Text style={s.statsTitle}>Garage Overview</Text>
                  <View style={s.statsGrid}>
                    <View style={s.statBox}>
                      <Ionicons name="cash-outline" size={18} color={C.good} />
                      <Text style={s.statValue}>${stats.totalValue.toLocaleString()}</Text>
                      <Text style={s.statLabel}>Total Value</Text>
                    </View>
                    <View style={s.statBox}>
                      <Ionicons name="trending-up-outline" size={18} color={C.accent} />
                      <Text style={s.statValue}>
                        {stats.totalValue > 0 && stats.totalInvested > 0 
                          ? `${((stats.totalValue - stats.totalInvested) / stats.totalInvested * 100).toFixed(1)}%`
                          : "—"}
                      </Text>
                      <Text style={s.statLabel}>ROI</Text>
                    </View>
                    <View style={s.statBox}>
                      <Ionicons name="star-outline" size={15} color="#f59e0b" />
                      <Text style={s.statValue}>{stats.mostValuable?.make || "—"}</Text>
                      <Text style={s.statLabel}>Top Value</Text>
                    </View>
                    <View style={s.statBox}>
                      <Ionicons name="time-outline" size={18} color={C.muted} />
                      <Text style={s.statValue}>{stats.oldestYear !== 9999 ? stats.oldestYear : "—"}</Text>
                      <Text style={s.statLabel}>Oldest</Text>
                    </View>
                  </View>
                </View>

                {/* Milestones */}
                {milestones.length > 0 && (
                  <View style={s.milestonesCard}>
                    <Text style={s.milestonesTitle}>Achievements</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {milestones.map((m, i) => (
                        <View key={i} style={s.milestone}>
                          <Ionicons name={m.icon as any} size={16} color={m.color} />
                          <Text style={s.milestoneLabel}>{m.label}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            ) : null
          }
          renderItem={({ item }) => (
            viewMode === "list" ? (
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
                  {item.currentValue ? (
                    <Text style={s.carValue}>${item.currentValue.toLocaleString()}</Text>
                  ) : null}
                </View>
                {item.pinned ? <Ionicons name="bookmark" size={18} color={C.accent} /> : null}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/car/[id]", params: { id: item.id } })}
                onLongPress={() => openSheet(item)}
                style={s.gridCard}
                activeOpacity={0.9}
              >
                {item.photoURL ? (
                  <Image source={{ uri: item.photoURL }} style={s.gridThumb} />
                ) : (
                  <View style={[s.gridThumb, s.thumbEmpty]}>
                    <Ionicons name="car-sport" size={32} color={C.muted} />
                  </View>
                )}
                {item.pinned && (
                  <View style={s.gridPin}>
                    <Ionicons name="bookmark" size={14} color={C.accent} />
                  </View>
                )}
                <View style={s.gridInfo}>
                  <Text style={s.gridTitle} numberOfLines={1}>
                    {item.year ? `${item.year} ` : ""}{item.make}
                  </Text>
                  <Text style={s.gridModel} numberOfLines={1}>{item.model}</Text>
                </View>
              </TouchableOpacity>
            )
          )}
          ListEmptyComponent={<EmptyState />}
        />
      )}

      {/* Sort Modal */}
      <Modal visible={showSortModal} transparent animationType="fade">
        <Pressable style={s.modalOverlay} onPress={() => setShowSortModal(false)}>
          <View style={s.sortModal}>
            <Text style={s.sortTitle}>Sort By</Text>
            {[
              { value: "pinned", label: "Pinned First", icon: "bookmark" },
              { value: "recent", label: "Recently Added", icon: "time" },
              { value: "year", label: "Year", icon: "calendar" },
              { value: "make", label: "Make", icon: "text" },
              { value: "value", label: "Value", icon: "cash" },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => { setSortBy(opt.value as SortOption); setShowSortModal(false); }}
                style={s.sortOption}
              >
                <Ionicons name={opt.icon as any} size={18} color={sortBy === opt.value ? C.accent : C.text} />
                <Text style={[s.sortLabel, sortBy === opt.value && { color: C.accent, fontWeight: "900" }]}>
                  {opt.label}
                </Text>
                {sortBy === opt.value && <Ionicons name="checkmark" size={18} color={C.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

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

/* Bottom Sheet */
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
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: open ? 180 : 160,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open]);

  if (!open) return null;

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [300, 0] });
  const backdropOpacity = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });

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
            <Ionicons name={a.icon} size={18} color={a.destructive ? C.accent : C.text} style={{ width: 24 }} />
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

/* Styles */
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10,
    borderBottomWidth: 1, borderColor: C.line,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  badge: {
    flexDirection: "row", gap: 6, alignItems: "center",
    backgroundColor: C.accent, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  badgeTxt: { color: "#111", fontWeight: "900", fontSize: 12, textTransform: "uppercase" },
  countChip: {
    flexDirection: "row", gap: 6, alignItems: "center",
    backgroundColor: C.dim, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  count: { color: C.muted, fontSize: 12 },
  iconBtn: {
    backgroundColor: C.dim, borderWidth: 1, borderColor: C.line,
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  addBtn: {
    backgroundColor: C.accent, width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },

  statsCard: {
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  statsTitle: { color: C.text, fontWeight: "900", fontSize: 16, marginBottom: 10 },
  statsGrid: { flexDirection: "row", gap: 5 },
  statBox: {
    flex: 1, backgroundColor: C.dim, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, padding: 4, alignItems: "center", gap: 4,
  },
  statValue: { color: C.text, fontWeight: "900", fontSize: 12 },
  statLabel: { color: C.muted, fontSize: 10, textTransform: "uppercase" },

  milestonesCard: {
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  milestonesTitle: { color: C.text, fontWeight: "900", fontSize: 14, marginBottom: 10 },
  milestone: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.dim, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
  },
  milestoneLabel: { color: C.text, fontWeight: "700", fontSize: 12 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  primaryTxt: { color: "#fff", fontWeight: "900" },
  muted: { color: C.muted },

  card: {
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, padding: 12,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  cardPinned: {
    borderColor: C.accent,
    shadowColor: "#E11D48", shadowOpacity: 0.25, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: C.dim },
  thumbEmpty: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line },
  carTitle: { color: C.text, fontWeight: "900" },
  trim: { color: C.muted, marginTop: 2, fontSize: 12 },
  carValue: { color: C.good, marginTop: 4, fontSize: 13, fontWeight: "800" },

  gridCard: {
    flex: 1, margin: 6,
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, overflow: "hidden",
  },
  gridThumb: { width: "100%", aspectRatio: 1, backgroundColor: C.dim },
  gridPin: {
    position: "absolute", top: 8, right: 8,
    backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 8, padding: 4,
  },
  gridInfo: { padding: 10 },
  gridTitle: { color: C.text, fontWeight: "900", fontSize: 13 },
  gridModel: { color: C.muted, fontSize: 12, marginTop: 2 },

  emptyState: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 24 },
  emptyTitle: { color: C.text, fontSize: 22, fontWeight: "900", marginTop: 16 },
  emptyDesc: { color: C.muted, fontSize: 14, marginTop: 8, textAlign: "center" },
  tipsCard: {
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, padding: 16, marginTop: 24, width: "100%",
  },
  tipsTitle: { color: C.text, fontWeight: "900", marginBottom: 12 },
  tipItem: { color: C.muted, marginTop: 6, fontSize: 13 },
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.accent, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 14, marginTop: 24,
  },
  emptyBtnTxt: { color: "#fff", fontWeight: "900" },

  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end", padding: 12,
  },
  sortModal: {
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    borderRadius: 20, padding: 16, marginBottom: 12,
  },
  sortTitle: { color: C.text, fontWeight: "900", fontSize: 18, marginBottom: 12 },
  sortOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  sortLabel: { flex: 1, color: C.text, fontWeight: "700" },

  backdrop: { flex: 1, backgroundColor: "black" },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: 12, paddingBottom: 18, backgroundColor: "transparent",
  },
  sheetHeader: {
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10,
  },
  sheetTitle: { color: C.text, fontWeight: "900", fontSize: 16 },
  sheetRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8,
  },
  sheetTxt: { color: C.text, fontWeight: "800" },
  sheetCancel: { marginTop: 4, backgroundColor: C.dim },
});