// apps/mobile/app/car/[id].tsx
import { useEffect, useMemo, useState, useCallback, useLayoutEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Platform, KeyboardAvoidingView, Modal, TextInput
} from "react-native";
import { Stack, useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { onAuthStateChanged, type User } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "../../lib/firebase";
import {
  doc, getDoc, updateDoc, serverTimestamp,
  onSnapshot, collection, addDoc, deleteDoc, query, orderBy
} from "firebase/firestore";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

const C = {
  bg: "#0C0D11", panel: "#121318", line: "#1E2127", text: "#E7EAF0",
  muted: "#A6ADBB", accent: "#E11D48", good: "#22c55e", warn: "#f59e0b", dim: "#0f1218",
};

type StatusKey = "OK" | "CHECK" | "SERVICE";
type Car = {
  id: string; make: string; model: string;
  year: number | null; trim: string | null;
  pinned?: boolean; oilStatus?: StatusKey; batteryStatus?: StatusKey; tiresStatus?: StatusKey;
  purchasePrice?: number; currentValue?: number; vin?: string;
  createdAt?: any; updatedAt?: any;
};
type Note = { id: string; text: string; createdAt?: any };
type Mod = { 
  id: string; text: string; 
  brand?: string; price?: number; purchaseDate?: any; 
  installDate?: any; storeLink?: string;
  hpGain?: number; torqueGain?: number; 
  createdAt?: any; 
};
type MaintenanceRecord = {
  id: string; type: string; description: string;
  date: any; mileage?: number; cost?: number;
  notes?: string;
  createdAt?: any;
};
type Part = {
  id: string; name: string; brand?: string; 
  price?: number; purchaseDate?: any; installed: boolean;
  storeLink?: string;
  createdAt?: any;
};
type Document = {
  id: string; 
  type: "insurance" | "registration" | "title" | "warranty" | "loan" | "inspection" | "other";
  provider?: string;
  policyNumber?: string;
  expirationDate?: any;
  amount?: number;
  notes?: string;
  createdAt?: any;
};
type Issue = {
  id: string; title: string; description?: string;
  priority: "urgent" | "soon" | "eventually";
  status: "open" | "fixed";
  fixedBy?: string;
  createdAt?: any;
};

type MaintenanceData = {
  type: string;
  description: string;
  mileage: number | null;
  cost: number | null;
};

type PartData = {
  name: string;
  brand: string | null;
  price: number | null;
};

type ModData = {
  text: string;
  brand: string | null;
  price: number | null;
  hpGain: number | null;
};

type IssueData = {
  title: string;
  description: string | null;
  priority: "urgent" | "soon" | "eventually";
};

type DocumentData = {
  type: "insurance" | "registration" | "title" | "warranty" | "loan" | "inspection" | "other";
  provider: string | null;
  policyNumber: string | null;
  expirationDate: string | null;
  amount: number | null;
  notes: string | null;
};

const cycle = (v?: StatusKey): StatusKey => (v === "OK" ? "CHECK" : v === "CHECK" ? "SERVICE" : "OK");

export default function CarDetail() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [me, setMe] = useState<User | null>(null);

  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinBusy, setPinBusy] = useState(false);

  const [notes, setNotes] = useState<Note[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);

  const [activeTab, setActiveTab] = useState<"overview" | "maintenance" | "parts" | "docs" | "issues">("overview");

  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showPartModal, setShowPartModal] = useState(false);
  const [showModModal, setShowModModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);

  const [editingMaintenance, setEditingMaintenance] = useState<MaintenanceRecord | null>(null);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [editingMod, setEditingMod] = useState<Mod | null>(null);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);

  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  useEffect(() => onAuthStateChanged(auth, setMe), []);

  useLayoutEffect(() => {
    const parent = (navigation as any)?.getParent?.();
    parent?.setOptions?.({ tabBarStyle: { display: "none" } });
    return () => parent?.setOptions?.({ tabBarStyle: undefined });
  }, [navigation]);

  // Replace the animatedBack function in [id].tsx (around line 125)

const animatedBack = () => {
  // Always navigate directly to garage, don't use goBack
  router.push("/(tabs)/garage");
};

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

  useEffect(() => {
    if (!me || !id) return;
    const notesQ = query(collection(db, "garages", me.uid, "cars", id, "notes"), orderBy("createdAt", "desc"));
    const modsQ = query(collection(db, "garages", me.uid, "cars", id, "mods"), orderBy("createdAt", "desc"));
    const maintQ = query(collection(db, "garages", me.uid, "cars", id, "maintenance"), orderBy("createdAt", "desc"));
    const partsQ = query(collection(db, "garages", me.uid, "cars", id, "parts"), orderBy("createdAt", "desc"));
    const docsQ = query(collection(db, "garages", me.uid, "cars", id, "documents"), orderBy("createdAt", "desc"));
    const issuesQ = query(collection(db, "garages", me.uid, "cars", id, "issues"), orderBy("createdAt", "desc"));

    const un1 = onSnapshot(notesQ, s => setNotes(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    const un2 = onSnapshot(modsQ, s => setMods(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    const un3 = onSnapshot(maintQ, s => setMaintenance(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    const un4 = onSnapshot(partsQ, s => setParts(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    const un5 = onSnapshot(docsQ, s => setDocuments(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    const un6 = onSnapshot(issuesQ, s => setIssues(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));

    return () => { un1(); un2(); un3(); un4(); un5(); un6(); };
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

  const setStatus = useCallback(async (key: "oilStatus" | "batteryStatus" | "tiresStatus", value: StatusKey) => {
    if (!me || !car) return;
    
    // Update local state immediately
    setCar({ ...car, [key]: value });
    
    // Save to Firestore
    try {
      await updateDoc(doc(db, "garages", me.uid, "cars", car.id), { 
        [key]: value, 
        updatedAt: serverTimestamp() 
      });
    } catch (error) {
      // Revert on error
      const prev = cycle(cycle(value)); // Go back 2 cycles
      setCar({ ...car, [key]: prev });
      Alert.alert("Update failed", "Could not update status.");
    }
  }, [me, car]);

  const deleteMaintenance = async (maintId: string) => {
    if (!me || !id) return;
    Alert.alert("Delete Record", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteDoc(doc(db, "garages", me.uid, "cars", id, "maintenance", maintId)); }
        catch { Alert.alert("Error", "Failed to delete."); }
      }}
    ]);
  };

  const togglePartInstalled = async (partId: string, currentStatus: boolean) => {
    if (!me || !id) return;
    try {
      await updateDoc(doc(db, "garages", me.uid, "cars", id, "parts", partId), {
        installed: !currentStatus,
        installDate: !currentStatus ? serverTimestamp() : null,
      });
    } catch { Alert.alert("Error", "Failed to update part."); }
  };

  const deletePart = async (partId: string) => {
    if (!me || !id) return;
    try { await deleteDoc(doc(db, "garages", me.uid, "cars", id, "parts", partId)); }
    catch { Alert.alert("Error", "Failed to delete part."); }
  };

  const deleteDocument = async (docId: string) => {
    if (!me || !id) return;
    Alert.alert("Delete Document", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteDoc(doc(db, "garages", me.uid, "cars", id, "documents", docId)); }
        catch { Alert.alert("Error", "Failed to delete document."); }
      }}
    ]);
  };

  const toggleIssueStatus = async (issueId: string, currentStatus: "open" | "fixed") => {
    if (!me || !id) return;
    try {
      await updateDoc(doc(db, "garages", me.uid, "cars", id, "issues", issueId), {
        status: currentStatus === "open" ? "fixed" : "open",
      });
    } catch { Alert.alert("Error", "Failed to update issue."); }
  };

  const deleteIssue = async (issueId: string) => {
    if (!me || !id) return;
    try { await deleteDoc(doc(db, "garages", me.uid, "cars", id, "issues", issueId)); }
    catch { Alert.alert("Error", "Failed to delete issue."); }
  };

  const removeNote = async (noteId: string) => {
    if (!me || !id) return;
    try { await deleteDoc(doc(db, "garages", me.uid, "cars", id, "notes", noteId)); }
    catch { Alert.alert("Error", "Failed to delete note."); }
  };

  const removeMod = async (modId: string) => {
    if (!me || !id) return;
    try { await deleteDoc(doc(db, "garages", me.uid, "cars", id, "mods", modId)); }
    catch { Alert.alert("Error", "Failed to delete mod."); }
  };


  const totalInvested = useMemo(() => {
    const purchase = car?.purchasePrice || 0;
    const modsCost = mods.reduce((sum, m) => sum + (m.price || 0), 0);
    const partsCost = parts.filter(p => p.installed).reduce((sum, p) => sum + (p.price || 0), 0);
    const maintCost = maintenance.reduce((sum, m) => sum + (m.cost || 0), 0);
    return purchase + modsCost + partsCost + maintCost;
  }, [car, mods, parts, maintenance]);

  const roi = useMemo(() => {
    if (!car?.currentValue || totalInvested === 0) return 0;
    return ((car.currentValue - totalInvested) / totalInvested) * 100;
  }, [car, totalInvested]);

  const totalHpGain = useMemo(() => {
    return mods.reduce((sum, m) => sum + (m.hpGain || 0), 0);
  }, [mods]);

  const askScottyAboutCar = async () => {
    if (!car || !id) return;
    
    const specs = `${title}${car.trim ? ` ${car.trim}` : ""}${car.vin ? ` (VIN: ${car.vin})` : ""}`;
    
    const modsList = mods.length > 0 
      ? `\n\nMods: ${mods.map(m => `${m.text}${m.brand ? ` (${m.brand})` : ""}${m.hpGain ? ` +${m.hpGain}HP` : ""}`).join(", ")}`
      : "";
    
    const issuesList = issues.filter(i => i.status === "open").length > 0
      ? `\n\nIssues: ${issues.filter(i => i.status === "open").map(i => `${i.title} (${i.priority})`).join(", ")}`
      : "";
    
    const recentMaint = maintenance.slice(0, 3).length > 0
      ? `\n\nRecent maintenance: ${maintenance.slice(0, 3).map(m => `${m.type}`).join(", ")}`
      : "";
    
    const contextMessage = `${specs}${modsList}${issuesList}${recentMaint}`;
    
    await AsyncStorage.setItem("@ovrtk/scotty.newChat", JSON.stringify({
      title,
      message: contextMessage,
      timestamp: Date.now()
    }));
    
    router.push("/(tabs)/scotty");
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
        <View style={s.center}><Text style={{ color: C.muted }}>This car isn't in your garage.</Text></View>
      </SafeAreaView>
    );
  }

  const insuranceDocs = documents.filter(d => d.type === "insurance");
  const registrationDocs = documents.filter(d => d.type === "registration");
  const otherDocs = documents.filter(d => !["insurance", "registration"].includes(d.type));

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

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
        <View style={s.tabsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}>
            <TabButton label="Overview" active={activeTab === "overview"} onPress={() => setActiveTab("overview")} />
            <TabButton label="Maintenance" active={activeTab === "maintenance"} onPress={() => setActiveTab("maintenance")} />
            <TabButton label="Parts" active={activeTab === "parts"} onPress={() => setActiveTab("parts")} />
            <TabButton label="Docs" active={activeTab === "docs"} onPress={() => setActiveTab("docs")} />
            <TabButton label="Issues" active={activeTab === "issues"} onPress={() => setActiveTab("issues")} />
          </ScrollView>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {activeTab === "overview" && (
            <>
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

              <View style={s.card}>
                <Text style={s.cardTitle}>Value Tracking</Text>
                <View style={s.valueGrid}>
                  <ValueStat label="Purchase Price" value={car.purchasePrice ? `$${car.purchasePrice.toLocaleString()}` : "—"} />
                  <ValueStat label="Current Value" value={car.currentValue ? `$${car.currentValue.toLocaleString()}` : "—"} />
                  <ValueStat label="Total Invested" value={`$${totalInvested.toLocaleString()}`} />
                  <ValueStat 
                    label="ROI" 
                    value={roi !== 0 ? `${roi > 0 ? '+' : ''}${roi.toFixed(1)}%` : "—"} 
                    color={roi > 0 ? C.good : roi < 0 ? C.accent : undefined}
                  />
                </View>
              </View>

              <View style={s.card}>
                <Text style={s.cardTitle}>Specs</Text>
                <View style={s.specGrid}>
                  <Spec label="Make" value={car.make} />
                  <Spec label="Model" value={car.model} />
                  <Spec label="Year" value={car.year ? String(car.year) : "—"} />
                  <Spec label="Trim" value={car.trim || "—"} />
                  {car.vin && <Spec label="VIN" value={car.vin} wide />}
                </View>
              </View>

              <View style={s.card}>
                <Text style={s.cardTitle}>Quick Status</Text>
                <View style={s.chipsRow}>
                  <StatusChip icon="speedometer-outline" label="Oil" value={car.oilStatus || "OK"} onPress={() => setStatus("oilStatus", cycle(car.oilStatus))} />
                  <StatusChip icon="flash-outline" label="Battery" value={car.batteryStatus || "OK"} onPress={() => setStatus("batteryStatus", cycle(car.batteryStatus))} />
                  <StatusChip icon="warning-outline" label="Tires" value={car.tiresStatus || "OK"} onPress={() => setStatus("tiresStatus", cycle(car.tiresStatus))} />
                </View>
                <Text style={s.hintRow}>Tap a chip to cycle status.</Text>
              </View>

              {totalHpGain > 0 && (
                <View style={s.card}>
                  <Text style={s.cardTitle}>Performance Gains</Text>
                  <Text style={{ color: C.good, fontSize: 24, fontWeight: "900", marginTop: 4 }}>
                    +{totalHpGain} HP
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                    Total from {mods.filter(m => m.hpGain).length} performance mods
                  </Text>
                </View>
              )}

              <View style={s.card}>
                <Text style={s.cardTitle}>Ask Scotty</Text>
                <Text style={{ color: C.muted, marginTop: 6, marginBottom: 10 }}>
                  Get expert advice about your {title}. Scotty will have full context of your mods, issues, and maintenance history.
                </Text>
                <TouchableOpacity onPress={askScottyAboutCar} style={s.primary} activeOpacity={0.9}>
                  <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
                  <Text style={s.primaryTxt}>Ask Scotty about this car</Text>
                </TouchableOpacity>
              </View>

              <View style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={s.cardTitle}>Garage Notes</Text>
                  <TouchableOpacity onPress={() => setShowNoteModal(true)}>
                    <Text style={{ color: C.accent, fontWeight: "800" }}>Add</Text>
                  </TouchableOpacity>
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

              <View style={[s.card, { gap: 10 }]}>
                <TouchableOpacity onPress={() => router.push({ pathname: "/cardtab/edit", params: { id: car.id } })} style={s.secondary} activeOpacity={0.9}>
                  <Ionicons name="create-outline" size={18} color={C.text} />
                  <Text style={s.secondaryTxt}>Edit details</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {activeTab === "maintenance" && (
            <>
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={s.cardTitle}>Maintenance History</Text>
                  <TouchableOpacity onPress={() => setShowMaintenanceModal(true)}>
                    <Text style={{ color: C.accent, fontWeight: "800" }}>Add</Text>
                  </TouchableOpacity>
                </View>
                {maintenance.length === 0 ? (
                  <Text style={{ color: C.muted, marginTop: 6 }}>No maintenance records yet.</Text>
                ) : (
                  <View style={{ marginTop: 12, gap: 12 }}>
                    {maintenance.map(m => (
                      <View key={m.id} style={s.maintCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.maintType}>{m.type}</Text>
                          <Text style={s.maintDesc}>{m.description}</Text>
                          <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
                            {m.mileage && <Text style={s.maintMeta}>{m.mileage.toLocaleString()} mi</Text>}
                            {m.cost && <Text style={s.maintMeta}>${m.cost.toFixed(2)}</Text>}
                            {m.createdAt && <Text style={s.maintMeta}>{new Date(m.createdAt.toDate()).toLocaleDateString()}</Text>}
                          </View>
                        </View>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <TouchableOpacity onPress={() => { setEditingMaintenance(m); setShowMaintenanceModal(true); }} style={s.iconBtn}>
                            <Ionicons name="create-outline" size={18} color={C.text} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => deleteMaintenance(m.id)} style={s.iconBtn}>
                            <Ionicons name="trash-outline" size={18} color={C.muted} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {maintenance.length > 0 && (
                <View style={s.card}>
                  <Text style={s.cardTitle}>Cost Summary</Text>
                  <Text style={{ color: C.text, fontSize: 28, fontWeight: "900", marginTop: 4 }}>
                    ${maintenance.reduce((sum, m) => sum + (m.cost || 0), 0).toFixed(2)}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                    Total maintenance costs
                  </Text>
                </View>
              )}
            </>
          )}

          {activeTab === "parts" && (
            <>
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={s.cardTitle}>Parts Inventory</Text>
                  <TouchableOpacity onPress={() => setShowPartModal(true)}>
                    <Text style={{ color: C.accent, fontWeight: "800" }}>Add</Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ color: C.text, fontWeight: "800", marginTop: 12 }}>Installed</Text>
                {parts.filter(p => p.installed).length === 0 ? (
                  <Text style={{ color: C.muted, marginTop: 4 }}>No installed parts yet.</Text>
                ) : (
                  parts.filter(p => p.installed).map(p => (
                    <PartItem 
                      key={p.id} 
                      part={p} 
                      onToggle={togglePartInstalled} 
                      onDelete={deletePart}
                      onEdit={() => { setEditingPart(p); setShowPartModal(true); }}
                    />
                  ))
                )}

                <Text style={{ color: C.text, fontWeight: "800", marginTop: 16 }}>In Garage</Text>
                {parts.filter(p => !p.installed).length === 0 ? (
                  <Text style={{ color: C.muted, marginTop: 4 }}>No parts waiting to be installed.</Text>
                ) : (
                  parts.filter(p => !p.installed).map(p => (
                    <PartItem 
                      key={p.id} 
                      part={p} 
                      onToggle={togglePartInstalled} 
                      onDelete={deletePart}
                      onEdit={() => { setEditingPart(p); setShowPartModal(true); }}
                    />
                  ))
                )}
              </View>

              <View style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={s.cardTitle}>Performance Mods</Text>
                  <TouchableOpacity onPress={() => setShowModModal(true)}>
                    <Text style={{ color: C.accent, fontWeight: "800" }}>Add</Text>
                  </TouchableOpacity>
                </View>
                {mods.length === 0 ? (
                  <Text style={{ color: C.muted, marginTop: 6 }}>No mods logged yet.</Text>
                ) : (
                  mods.map(m => (
                    <View key={m.id} style={s.modItemEnhanced}>
                      <Ionicons name="construct-outline" size={18} color={C.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.modTxt}>{m.text}</Text>
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                          {m.brand && <Text style={s.modMeta}>{m.brand}</Text>}
                          {m.price && <Text style={s.modMeta}>${m.price.toFixed(2)}</Text>}
                          {m.hpGain && <Text style={[s.modMeta, { color: C.good }]}>+{m.hpGain} HP</Text>}
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity onPress={() => { setEditingMod(m); setShowModModal(true); }} style={s.iconBtn}>
                          <Ionicons name="create-outline" size={16} color={C.text} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeMod(m.id)} style={s.iconBtn}>
                          <Ionicons name="trash-outline" size={16} color={C.muted} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </>
          )}

          {activeTab === "docs" && (
            <>
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={s.cardTitle}>Insurance</Text>
                  <TouchableOpacity onPress={() => { setEditingDocument(null); setShowDocModal(true); }}>
                    <Text style={{ color: C.accent, fontWeight: "800" }}>Add</Text>
                  </TouchableOpacity>
                </View>
                {insuranceDocs.length === 0 ? (
                  <Text style={{ color: C.muted, marginTop: 6 }}>No insurance records.</Text>
                ) : (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    {insuranceDocs.map(d => (
                      <DocumentItem 
                        key={d.id} 
                        document={d} 
                        onDelete={deleteDocument}
                        onEdit={() => { setEditingDocument(d); setShowDocModal(true); }}
                      />
                    ))}
                  </View>
                )}
              </View>

              <View style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={s.cardTitle}>Registration & Title</Text>
                  <TouchableOpacity onPress={() => { setEditingDocument(null); setShowDocModal(true); }}>
                    <Text style={{ color: C.accent, fontWeight: "800" }}>Add</Text>
                  </TouchableOpacity>
                </View>
                {registrationDocs.length === 0 ? (
                  <Text style={{ color: C.muted, marginTop: 6 }}>No registration/title records.</Text>
                ) : (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    {registrationDocs.map(d => (
                      <DocumentItem 
                        key={d.id} 
                        document={d} 
                        onDelete={deleteDocument}
                        onEdit={() => { setEditingDocument(d); setShowDocModal(true); }}
                      />
                    ))}
                  </View>
                )}
              </View>

              {otherDocs.length > 0 && (
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardTitle}>Other Documents</Text>
                  </View>
                  <View style={{ marginTop: 12, gap: 10 }}>
                    {otherDocs.map(d => (
                      <DocumentItem 
                        key={d.id} 
                        document={d} 
                        onDelete={deleteDocument}
                        onEdit={() => { setEditingDocument(d); setShowDocModal(true); }}
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

          {activeTab === "issues" && (
            <>
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={s.cardTitle}>Open Issues</Text>
                  <TouchableOpacity onPress={() => setShowIssueModal(true)}>
                    <Text style={{ color: C.accent, fontWeight: "800" }}>Add</Text>
                  </TouchableOpacity>
                </View>
                {issues.filter(i => i.status === "open").length === 0 ? (
                  <Text style={{ color: C.muted, marginTop: 6 }}>No open issues.</Text>
                ) : (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    {issues.filter(i => i.status === "open").map(issue => (
                      <IssueItem 
                        key={issue.id} 
                        issue={issue} 
                        onToggle={toggleIssueStatus} 
                        onDelete={deleteIssue}
                        onEdit={() => { setEditingIssue(issue); setShowIssueModal(true); }}
                      />
                    ))}
                  </View>
                )}
              </View>

              {issues.filter(i => i.status === "fixed").length > 0 && (
                <View style={s.card}>
                  <Text style={s.cardTitle}>Fixed Issues</Text>
                  <View style={{ marginTop: 12, gap: 10 }}>
                    {issues.filter(i => i.status === "fixed").map(issue => (
                      <IssueItem 
                        key={issue.id} 
                        issue={issue} 
                        onToggle={toggleIssueStatus} 
                        onDelete={deleteIssue}
                        onEdit={() => { setEditingIssue(issue); setShowIssueModal(true); }}
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODALS */}
      <MaintenanceModal 
        visible={showMaintenanceModal} 
        onClose={() => { setShowMaintenanceModal(false); setEditingMaintenance(null); }}
        editing={editingMaintenance}
        onSave={async (data: MaintenanceData) => {
          if (!me || !id) return;
          try {
            if (editingMaintenance) {
              await updateDoc(doc(db, "garages", me.uid, "cars", id, "maintenance", editingMaintenance.id), data);
            } else {
              await addDoc(collection(db, "garages", me.uid, "cars", id, "maintenance"), {
                ...data,
                createdAt: serverTimestamp(),
              });
            }
            setShowMaintenanceModal(false);
            setEditingMaintenance(null);
          } catch { Alert.alert("Error", "Failed to save maintenance record."); }
        }}
      />

      <PartModal 
        visible={showPartModal}
        onClose={() => { setShowPartModal(false); setEditingPart(null); }}
        editing={editingPart}
        onSave={async (data: PartData) => {
          if (!me || !id) return;
          try {
            if (editingPart) {
              await updateDoc(doc(db, "garages", me.uid, "cars", id, "parts", editingPart.id), data);
            } else {
              await addDoc(collection(db, "garages", me.uid, "cars", id, "parts"), {
                ...data,
                installed: false,
                purchaseDate: serverTimestamp(),
                createdAt: serverTimestamp(),
              });
            }
            setShowPartModal(false);
            setEditingPart(null);
          } catch { Alert.alert("Error", "Failed to save part."); }
        }}
      />

      <ModModal 
        visible={showModModal}
        onClose={() => { setShowModModal(false); setEditingMod(null); }}
        editing={editingMod}
        onSave={async (data: ModData) => {
          if (!me || !id) return;
          try {
            if (editingMod) {
              await updateDoc(doc(db, "garages", me.uid, "cars", id, "mods", editingMod.id), data);
            } else {
              await addDoc(collection(db, "garages", me.uid, "cars", id, "mods"), {
                ...data,
                installDate: serverTimestamp(),
                createdAt: serverTimestamp(),
              });
            }
            setShowModModal(false);
            setEditingMod(null);
          } catch { Alert.alert("Error", "Failed to save mod."); }
        }}
      />

      <IssueModal 
        visible={showIssueModal}
        onClose={() => { setShowIssueModal(false); setEditingIssue(null); }}
        editing={editingIssue}
        onSave={async (data: IssueData) => {
          if (!me || !id) return;
          try {
            if (editingIssue) {
              await updateDoc(doc(db, "garages", me.uid, "cars", id, "issues", editingIssue.id), data);
            } else {
              await addDoc(collection(db, "garages", me.uid, "cars", id, "issues"), {
                ...data,
                status: "open",
                createdAt: serverTimestamp(),
              });
            }
            setShowIssueModal(false);
            setEditingIssue(null);
          } catch { Alert.alert("Error", "Failed to save issue."); }
        }}
      />

<DocumentModal 
  visible={showDocModal}
  onClose={() => { setShowDocModal(false); setEditingDocument(null); }}
  editing={editingDocument}
  onSave={async (data: DocumentData) => {
    if (!me || !id) {
      console.log('Missing auth or car ID:', { me: !!me, id });
      Alert.alert("Error", "Missing authentication or car ID");
      return;
    }
    
    try {
      console.log('Attempting to save document:', data);
      
      if (editingDocument) {
        console.log('Updating existing document:', editingDocument.id);
        await updateDoc(doc(db, "garages", me.uid, "cars", id, "documents", editingDocument.id), data);
      } else {
        console.log('Creating new document');
        const docRef = await addDoc(collection(db, "garages", me.uid, "cars", id, "documents"), {
          ...data,
          createdAt: serverTimestamp(),
        });
        console.log('Document created with ID:', docRef.id);
      }
      
      setShowDocModal(false);
      setEditingDocument(null);
    } catch (error: any) {
      console.error("Full error details:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      Alert.alert("Error", `Failed to save: ${error.message}`);
    }
  }}
/>

      <NoteModal 
        visible={showNoteModal}
        onClose={() => setShowNoteModal(false)}
        onSave={async (text: string) => {
          if (!me || !id || !text.trim()) return;
          try {
            await addDoc(collection(db, "garages", me.uid, "cars", id, "notes"), {
              text: text.trim(),
              createdAt: serverTimestamp(),
            });
            setShowNoteModal(false);
          } catch { Alert.alert("Error", "Failed to add note."); }
        }}
      />
    </SafeAreaView>
  );
}

/* MODAL COMPONENTS */
function MaintenanceModal({ visible, onClose, onSave, editing }: { 
  visible: boolean; 
  onClose: () => void; 
  onSave: (data: MaintenanceData) => void;
  editing: MaintenanceRecord | null;
}) {
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [mileage, setMileage] = useState("");
  const [cost, setCost] = useState("");

  useEffect(() => {
    if (editing) {
      setType(editing.type);
      setDescription(editing.description);
      setMileage(editing.mileage?.toString() || "");
      setCost(editing.cost?.toString() || "");
    } else {
      setType("");
      setDescription("");
      setMileage("");
      setCost("");
    }
  }, [editing, visible]);

  const handleSave = () => {
    if (!type.trim() || !description.trim()) {
      Alert.alert("Missing Info", "Type and description are required.");
      return;
    }
    onSave({
      type: type.trim(),
      description: description.trim(),
      mileage: mileage ? parseInt(mileage) : null,
      cost: cost ? parseFloat(cost) : null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <BlurView intensity={20} style={s.modalOverlay}>
        <View style={s.modalCard}>
          <View style={s.modalHeader}>
            <Ionicons name="build-outline" size={24} color={C.accent} />
            <Text style={s.modalTitle}>{editing ? "Edit" : "Add"} Maintenance</Text>
            <TouchableOpacity onPress={onClose} style={s.modalClose}>
              <Ionicons name="close" size={24} color={C.muted} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={s.modalInput}
            placeholder="Type (e.g., Oil Change)"
            placeholderTextColor={C.muted}
            value={type}
            onChangeText={setType}
          />
          <TextInput
            style={[s.modalInput, { height: 80 }]}
            placeholder="Description"
            placeholderTextColor={C.muted}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <TextInput
            style={s.modalInput}
            placeholder="Mileage (optional)"
            placeholderTextColor={C.muted}
            value={mileage}
            onChangeText={setMileage}
            keyboardType="number-pad"
          />
          <TextInput
            style={s.modalInput}
            placeholder="Cost (optional)"
            placeholderTextColor={C.muted}
            value={cost}
            onChangeText={setCost}
            keyboardType="decimal-pad"
          />

          <TouchableOpacity onPress={handleSave} style={s.modalBtn}>
            <Text style={s.modalBtnTxt}>Save</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
}

function PartModal({ visible, onClose, onSave, editing }: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: PartData) => void;
  editing: Part | null;
}) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setBrand(editing.brand || "");
      setPrice(editing.price?.toString() || "");
    } else {
      setName("");
      setBrand("");
      setPrice("");
    }
  }, [editing, visible]);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Missing Info", "Part name is required.");
      return;
    }
    onSave({
      name: name.trim(),
      brand: brand.trim() || null,
      price: price ? parseFloat(price) : null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <BlurView intensity={20} style={s.modalOverlay}>
        <View style={s.modalCard}>
          <View style={s.modalHeader}>
            <Ionicons name="settings-outline" size={24} color={C.accent} />
            <Text style={s.modalTitle}>{editing ? "Edit" : "Add"} Part</Text>
            <TouchableOpacity onPress={onClose} style={s.modalClose}>
              <Ionicons name="close" size={24} color={C.muted} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={s.modalInput}
            placeholder="Part Name"
            placeholderTextColor={C.muted}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={s.modalInput}
            placeholder="Brand (optional)"
            placeholderTextColor={C.muted}
            value={brand}
            onChangeText={setBrand}
          />
          <TextInput
            style={s.modalInput}
            placeholder="Price (optional)"
            placeholderTextColor={C.muted}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />

          <TouchableOpacity onPress={handleSave} style={s.modalBtn}>
            <Text style={s.modalBtnTxt}>Save</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
}

function ModModal({ visible, onClose, onSave, editing }: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: ModData) => void;
  editing: Mod | null;
}) {
  const [text, setText] = useState("");
  const [brand, setBrand] = useState("");
  const [price, setPrice] = useState("");
  const [hpGain, setHpGain] = useState("");

  useEffect(() => {
    if (editing) {
      setText(editing.text);
      setBrand(editing.brand || "");
      setPrice(editing.price?.toString() || "");
      setHpGain(editing.hpGain?.toString() || "");
    } else {
      setText("");
      setBrand("");
      setPrice("");
      setHpGain("");
    }
  }, [editing, visible]);

  const handleSave = () => {
    if (!text.trim()) {
      Alert.alert("Missing Info", "Mod description is required.");
      return;
    }
    onSave({
      text: text.trim(),
      brand: brand.trim() || null,
      price: price ? parseFloat(price) : null,
      hpGain: hpGain ? parseInt(hpGain) : null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <BlurView intensity={20} style={s.modalOverlay}>
        <View style={s.modalCard}>
          <View style={s.modalHeader}>
            <Ionicons name="construct-outline" size={24} color={C.accent} />
            <Text style={s.modalTitle}>{editing ? "Edit" : "Add"} Performance Mod</Text>
            <TouchableOpacity onPress={onClose} style={s.modalClose}>
              <Ionicons name="close" size={24} color={C.muted} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={s.modalInput}
            placeholder="Mod Description"
            placeholderTextColor={C.muted}
            value={text}
            onChangeText={setText}
          />
          <TextInput
            style={s.modalInput}
            placeholder="Brand (optional)"
            placeholderTextColor={C.muted}
            value={brand}
            onChangeText={setBrand}
          />
          <TextInput
            style={s.modalInput}
            placeholder="Price (optional)"
            placeholderTextColor={C.muted}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={s.modalInput}
            placeholder="HP Gain (optional)"
            placeholderTextColor={C.muted}
            value={hpGain}
            onChangeText={setHpGain}
            keyboardType="number-pad"
          />

          <TouchableOpacity onPress={handleSave} style={s.modalBtn}>
            <Text style={s.modalBtnTxt}>Save</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
}

function IssueModal({ visible, onClose, onSave, editing }: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: IssueData) => void;
  editing: Issue | null;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"urgent" | "soon" | "eventually">("soon");

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description || "");
      setPriority(editing.priority);
    } else {
      setTitle("");
      setDescription("");
      setPriority("soon");
    }
  }, [editing, visible]);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert("Missing Info", "Issue title is required.");
      return;
    }
    onSave({
      title: title.trim(),
      description: description.trim() || null,
      priority,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <BlurView intensity={20} style={s.modalOverlay}>
        <View style={s.modalCard}>
          <View style={s.modalHeader}>
            <Ionicons name="alert-circle-outline" size={24} color={C.accent} />
            <Text style={s.modalTitle}>{editing ? "Edit" : "Add"} Issue</Text>
            <TouchableOpacity onPress={onClose} style={s.modalClose}>
              <Ionicons name="close" size={24} color={C.muted} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={s.modalInput}
            placeholder="Issue Title"
            placeholderTextColor={C.muted}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[s.modalInput, { height: 80 }]}
            placeholder="Description (optional)"
            placeholderTextColor={C.muted}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Text style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>Priority</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={() => setPriority("eventually")} style={[s.priorityBtn, priority === "eventually" && s.priorityActive]}>
              <Text style={[s.priorityTxt, priority === "eventually" && { color: "#fff" }]}>Eventually</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPriority("soon")} style={[s.priorityBtn, priority === "soon" && s.priorityActive]}>
              <Text style={[s.priorityTxt, priority === "soon" && { color: "#fff" }]}>Soon</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPriority("urgent")} style={[s.priorityBtn, priority === "urgent" && s.priorityActive]}>
              <Text style={[s.priorityTxt, priority === "urgent" && { color: "#fff" }]}>Urgent</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleSave} style={[s.modalBtn, { marginTop: 16 }]}>
            <Text style={s.modalBtnTxt}>Save</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
}

function DocumentModal({ visible, onClose, onSave, editing }: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: DocumentData) => void;
  editing: Document | null;
}) {
  const [docType, setDocType] = useState<"insurance" | "registration" | "title" | "warranty" | "loan" | "inspection" | "other">("insurance");
  const [provider, setProvider] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (visible && !editing) {
      setDocType("insurance");
      setProvider("");
      setPolicyNumber("");
      setExpirationDate("");
      setAmount("");
      setNotes("");
    } else if (editing) {
      setDocType(editing.type);
      setProvider(editing.provider || "");
      setPolicyNumber(editing.policyNumber || "");
      setExpirationDate(editing.expirationDate || "");
      setAmount(editing.amount?.toString() || "");
      setNotes(editing.notes || "");
    }
  }, [editing, visible]);

  const handleSave = () => {
    if (!provider.trim() && !policyNumber.trim() && !expirationDate.trim() && !amount && !notes.trim()) {
      Alert.alert("Missing Info", "Please fill in at least one field.");
      return;
    }

    onSave({
      type: docType,
      provider: provider.trim() || null,
      policyNumber: policyNumber.trim() || null,
      expirationDate: expirationDate.trim() || null,
      amount: amount && !isNaN(parseFloat(amount)) ? parseFloat(amount) : null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <BlurView intensity={20} style={s.modalOverlay}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ScrollView 
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.modalCard}>
              <View style={s.modalHeader}>
                <Ionicons name="document-text-outline" size={24} color={C.accent} />
                <Text style={s.modalTitle}>{editing ? "Edit" : "Add"} Document</Text>
                <TouchableOpacity onPress={onClose} style={s.modalClose}>
                  <Ionicons name="close" size={24} color={C.muted} />
                </TouchableOpacity>
              </View>

              <Text style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>Document Type</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {(["insurance", "registration", "title", "warranty", "loan", "inspection", "other"] as const).map((type) => (
                  <TouchableOpacity 
                    key={type} 
                    onPress={() => setDocType(type)} 
                    style={[s.docTypeBtn, docType === type && s.docTypeActive]}
                  >
                    <Text style={[s.docTypeTxt, docType === type && { color: "#fff" }]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={s.modalInput}
                placeholder={docType === "insurance" ? "Insurance Provider" : docType === "registration" ? "DMV/Agency" : "Provider/Source"}
                placeholderTextColor={C.muted}
                value={provider}
                onChangeText={setProvider}
              />

              <TextInput
                style={s.modalInput}
                placeholder={docType === "insurance" ? "Policy Number" : "ID/Reference Number"}
                placeholderTextColor={C.muted}
                value={policyNumber}
                onChangeText={setPolicyNumber}
              />

              <TextInput
                style={s.modalInput}
                placeholder="Expiration Date (MM/DD/YYYY)"
                placeholderTextColor={C.muted}
                value={expirationDate}
                onChangeText={setExpirationDate}
              />

              <TextInput
                style={s.modalInput}
                placeholder={docType === "insurance" ? "Premium Amount" : docType === "loan" ? "Loan Amount" : "Amount (optional)"}
                placeholderTextColor={C.muted}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />

              <TextInput
                style={[s.modalInput, { height: 80 }]}
                placeholder="Notes (optional)"
                placeholderTextColor={C.muted}
                value={notes}
                onChangeText={setNotes}
                multiline
              />

              <TouchableOpacity onPress={handleSave} style={s.modalBtn}>
                <Text style={s.modalBtnTxt}>Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </BlurView>
    </Modal>
  );
}

function NoteModal({ visible, onClose, onSave }: {
  visible: boolean;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState("");

  const handleSave = () => {
    if (!text.trim()) return;
    onSave(text);
    setText("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <BlurView intensity={20} style={s.modalOverlay}>
        <View style={s.modalCard}>
          <View style={s.modalHeader}>
            <Ionicons name="create-outline" size={24} color={C.accent} />
            <Text style={s.modalTitle}>Add Note</Text>
            <TouchableOpacity onPress={onClose} style={s.modalClose}>
              <Ionicons name="close" size={24} color={C.muted} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={[s.modalInput, { height: 100 }]}
            placeholder="Write your note..."
            placeholderTextColor={C.muted}
            value={text}
            onChangeText={setText}
            multiline
          />

          <TouchableOpacity onPress={handleSave} style={s.modalBtn}>
            <Text style={s.modalBtnTxt}>Save</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
}

/* OTHER COMPONENTS */
function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.tab, active && s.tabActive]} activeOpacity={0.7}>
      <Text style={[s.tabTxt, active && s.tabTxtActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Spec({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[s.specBox, wide && { width: "100%" }]}>
      <Text style={s.specLabel}>{label}</Text>
      <Text style={s.specValue}>{value}</Text>
    </View>
  );
}

function ValueStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.specBox}>
      <Text style={s.specLabel}>{label}</Text>
      <Text style={[s.specValue, color && { color }]}>{value}</Text>
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

function PartItem({ part, onToggle, onDelete, onEdit }: { 
  part: Part; 
  onToggle: (id: string, installed: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: () => void;
}) {
  return (
    <View style={s.partItem}>
      <TouchableOpacity onPress={() => onToggle(part.id, part.installed)} style={{ marginRight: 8 }}>
        <Ionicons 
          name={part.installed ? "checkmark-circle" : "ellipse-outline"} 
          size={22} 
          color={part.installed ? C.good : C.muted} 
        />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.partName}>{part.name}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
          {part.brand && <Text style={s.partMeta}>{part.brand}</Text>}
          {part.price && <Text style={s.partMeta}>${part.price.toFixed(2)}</Text>}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity onPress={onEdit} style={s.iconBtn}>
          <Ionicons name="create-outline" size={16} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(part.id)} style={s.iconBtn}>
          <Ionicons name="trash-outline" size={16} color={C.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function IssueItem({ issue, onToggle, onDelete, onEdit }: {
  issue: Issue;
  onToggle: (id: string, status: "open" | "fixed") => void;
  onDelete: (id: string) => void;
  onEdit: () => void;
}) {
  const priorityColor = issue.priority === "urgent" ? C.accent : issue.priority === "soon" ? C.warn : C.muted;
  return (
    <View style={s.issueItem}>
      <TouchableOpacity onPress={() => onToggle(issue.id, issue.status)} style={{ marginRight: 8 }}>
        <Ionicons 
          name={issue.status === "fixed" ? "checkmark-circle" : "alert-circle-outline"} 
          size={22} 
          color={issue.status === "fixed" ? C.good : priorityColor} 
        />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={[s.issueTitle, issue.status === "fixed" && { textDecorationLine: "line-through", color: C.muted }]}>
          {issue.title}
        </Text>
        {issue.description && <Text style={s.issueDesc}>{issue.description}</Text>}
        <Text style={[s.issuePriority, { color: priorityColor }]}>
          {issue.priority.toUpperCase()}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity onPress={onEdit} style={s.iconBtn}>
          <Ionicons name="create-outline" size={16} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(issue.id)} style={s.iconBtn}>
          <Ionicons name="trash-outline" size={16} color={C.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DocumentItem({ document, onDelete, onEdit }: {
  document: Document;
  onDelete: (id: string) => void;
  onEdit: () => void;
}) {
  const getDocIcon = (type: string) => {
    switch (type) {
      case "insurance": return "shield-checkmark";
      case "registration": return "card";
      case "title": return "ribbon";
      case "warranty": return "shield";
      case "loan": return "cash";
      case "inspection": return "checkmark-done";
      default: return "document-text";
    }
  };

  const isExpiringSoon = (expirationDate?: any) => {
    if (!expirationDate) return false;
    const expDate = new Date(expirationDate);
    const today = new Date();
    const daysUntilExpiry = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
  };

  const isExpired = (expirationDate?: any) => {
    if (!expirationDate) return false;
    return new Date(expirationDate) < new Date();
  };

  return (
    <View style={s.docItemEnhanced}>
      <View style={[s.docIconCircle, isExpired(document.expirationDate) && { backgroundColor: C.accent + "20" }]}>
        <Ionicons 
          name={getDocIcon(document.type) as any} 
          size={22} 
          color={isExpired(document.expirationDate) ? C.accent : C.good} 
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.docTypeName}>{document.type.charAt(0).toUpperCase() + document.type.slice(1)}</Text>
        {document.provider && <Text style={s.docProvider}>{document.provider}</Text>}
        {document.policyNumber && <Text style={s.docMeta}>#{document.policyNumber}</Text>}
        {document.expirationDate && (
          <Text style={[
            s.docMeta, 
            isExpired(document.expirationDate) && { color: C.accent },
            isExpiringSoon(document.expirationDate) && !isExpired(document.expirationDate) && { color: C.warn }
          ]}>
            Expires: {document.expirationDate}
            {isExpired(document.expirationDate) && " (Expired)"}
            {isExpiringSoon(document.expirationDate) && !isExpired(document.expirationDate) && " (Soon)"}
          </Text>
        )}
        {document.amount && <Text style={s.docMeta}>${document.amount.toLocaleString()}</Text>}
        {document.notes && <Text style={s.docNotes}>{document.notes}</Text>}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity onPress={onEdit} style={s.iconBtn}>
          <Ionicons name="create-outline" size={16} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(document.id)} style={s.iconBtn}>
          <Ionicons name="trash-outline" size={16} color={C.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* STYLES */
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

  tabsRow: {
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingVertical: 8,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: -2,
  },
  tabActive: {
    backgroundColor: C.accent,
  },
  tabTxt: {
    color: C.muted,
    fontWeight: "700",
    fontSize: 13,
  },
  tabTxtActive: {
    color: "#fff",
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

  valueGrid: { marginTop: 8, gap: 8, flexDirection: "row", flexWrap: "wrap" },

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

  modItemEnhanced: { 
    flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  modTxt: { color: C.text, fontWeight: "700" },
  modMeta: { color: C.muted, fontSize: 12 },

  maintCard: {
    flexDirection: "row",
    backgroundColor: C.dim,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 12,
  },
  maintType: { color: C.text, fontWeight: "800", fontSize: 15 },
  maintDesc: { color: C.muted, fontSize: 13, marginTop: 2 },
  maintMeta: { color: C.muted, fontSize: 12 },

  partItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  partName: { color: C.text, fontWeight: "700" },
  partMeta: { color: C.muted, fontSize: 12 },

  docItemEnhanced: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    backgroundColor: C.dim,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    gap: 12,
  },
  docIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.good + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  docTypeName: { color: C.text, fontWeight: "800", fontSize: 15 },
  docProvider: { color: C.text, fontSize: 13, marginTop: 2 },
  docMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
  docNotes: { color: C.muted, fontSize: 12, marginTop: 4, fontStyle: "italic" },

  issueItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    backgroundColor: C.dim,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
  },
  issueTitle: { color: C.text, fontWeight: "700", fontSize: 15 },
  issueDesc: { color: C.muted, fontSize: 13, marginTop: 2 },
  issuePriority: { fontSize: 10, fontWeight: "800", marginTop: 4 },

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

  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  modalCard: {
    width: "90%",
    maxWidth: 400,
    backgroundColor: C.panel,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: C.line,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  modalTitle: {
    flex: 1,
    color: C.text,
    fontSize: 20,
    fontWeight: "900",
  },
  modalClose: {
    padding: 4,
  },
  modalInput: {
    backgroundColor: C.dim,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 14,
    color: C.text,
    marginBottom: 12,
  },
  modalBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  modalBtnTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },
  priorityBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
  },
  priorityActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  priorityTxt: {
    color: C.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  docTypeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.dim,
  },
  docTypeActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  docTypeTxt: {
    color: C.muted,
    fontWeight: "700",
    fontSize: 12,
  },
});