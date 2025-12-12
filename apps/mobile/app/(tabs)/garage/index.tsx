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
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc
} from "firebase/firestore";
import { auth, db, storage } from "../../../lib/firebase";
import { ref, deleteObject } from "firebase/storage";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { checkAndScheduleNotifications } from '../../../utils/notifications';
import { Ionicons } from "@expo/vector-icons";
import VehicleTypePicker, { VehicleType } from '../../../components/VehicleTypePicker';

let Haptics: any = null;
try { Haptics = require("expo-haptics"); } catch { }

type Car = {
  id: string;
  make: string;
  model: string;
  year?: number;
  trim?: string;
  nickname?: string;
  photoURL?: string;
  pinned?: boolean;
  createdAt?: any;
  purchasePrice?: number;
  currentValue?: number;
  currentMileage?: number;
  vehicleType?: VehicleType;
  // Service intervals
  oilChangeInterval?: number;
  tireRotationInterval?: number;
  airFilterInterval?: number;
  cabinFilterInterval?: number;
  coolantFlushInterval?: number;
  sparkPlugInterval?: number;
  brakeInspectionInterval?: number;
  brakeFluidInterval?: number;
  transmissionServiceInterval?: number;
  differentialServiceInterval?: number;
  // Last service mileage
  lastOilChangeMileage?: number;
  lastTireRotationMileage?: number;
  lastAirFilterMileage?: number;
  lastCabinFilterMileage?: number;
  lastCoolantFlushMileage?: number;
  lastSparkPlugMileage?: number;
  lastBrakeInspectionMileage?: number;
  lastBrakeFluidMileage?: number;
  lastTransmissionServiceMileage?: number;
  lastDifferentialServiceMileage?: number;
};
type MaintenanceAlert = {
  carId: string;
  carName: string;
  serviceName: string;
  status: "overdue" | "due_soon";
  milesOverdue: number;
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
  warn: "#f59e0b",
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
  const [showMileageModal, setShowMileageModal] = useState(false);
  const [selectedCarForMileage, setSelectedCarForMileage] = useState<Car | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const [dismissingAlert, setDismissingAlert] = useState<string | null>(null);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);

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

  // Handle vehicle type selection
  const handleVehicleTypeSelect = (type: VehicleType) => {
    console.log('Selected vehicle type:', type);
    // Navigate to edit screen with vehicle type
    router.push({
      pathname: "/cardtab/edit",
      params: { vehicleType: type }
    });
  };

  // Calculate maintenance alerts
  const maintenanceAlerts = useMemo(() => {
    const alerts: MaintenanceAlert[] = [];

    cars.forEach(car => {
      if (!car.currentMileage) return;

      const carName = `${car.year || ''} ${car.make} ${car.model}`.trim();

      const services = [
        {
          name: 'Oil Change',
          interval: car.oilChangeInterval,
          lastMileage: car.lastOilChangeMileage || 0,
          dueSoonThreshold: 500,
        },
        {
          name: 'Tire Rotation',
          interval: car.tireRotationInterval,
          lastMileage: car.lastTireRotationMileage || 0,
          dueSoonThreshold: 500,
        },
        {
          name: 'Air Filter',
          interval: car.airFilterInterval,
          lastMileage: car.lastAirFilterMileage || 0,
          dueSoonThreshold: 1000,
        },
        {
          name: 'Cabin Filter',
          interval: (car as any).cabinFilterInterval,
          lastMileage: (car as any).lastCabinFilterMileage || 0,
          dueSoonThreshold: 1000,
        },
        {
          name: 'Coolant Flush',
          interval: (car as any).coolantFlushInterval,
          lastMileage: (car as any).lastCoolantFlushMileage || 0,
          dueSoonThreshold: 2000,
        },
        {
          name: 'Spark Plugs',
          interval: (car as any).sparkPlugInterval,
          lastMileage: (car as any).lastSparkPlugMileage || 0,
          dueSoonThreshold: 5000,
        },
        {
          name: 'Brake Inspection',
          interval: (car as any).brakeInspectionInterval,
          lastMileage: (car as any).lastBrakeInspectionMileage || 0,
          dueSoonThreshold: 1000,
        },
        {
          name: 'Brake Fluid',
          interval: (car as any).brakeFluidInterval,
          lastMileage: (car as any).lastBrakeFluidMileage || 0,
          dueSoonThreshold: 2000,
        },
        {
          name: 'Transmission Service',
          interval: (car as any).transmissionServiceInterval,
          lastMileage: (car as any).lastTransmissionServiceMileage || 0,
          dueSoonThreshold: 5000,
        },
        {
          name: 'Differential Service',
          interval: (car as any).differentialServiceInterval,
          lastMileage: (car as any).lastDifferentialServiceMileage || 0,
          dueSoonThreshold: 5000,
        },
      ];

      services.forEach(service => {
        if (!service.interval) return;
        if (service.lastMileage === 0) return;

        const nextDue = service.lastMileage + service.interval;
        const remaining = nextDue - car.currentMileage!;

        const alertId = `${car.id}-${service.name}`;
        if (dismissedAlerts.has(alertId)) return;

        if (remaining < 0) {
          alerts.push({
            carId: car.id,
            carName,
            serviceName: service.name,
            status: "overdue",
            milesOverdue: Math.abs(remaining),
          });
        }
        else if (remaining <= service.dueSoonThreshold) {
          alerts.push({
            carId: car.id,
            carName,
            serviceName: service.name,
            status: "due_soon",
            milesOverdue: remaining,
          });
        }
      });
    });

    return alerts.sort((a, b) => {
      if (a.status === "overdue" && b.status !== "overdue") return -1;
      if (a.status !== "overdue" && b.status === "overdue") return 1;
      return a.status === "overdue"
        ? b.milesOverdue - a.milesOverdue
        : a.milesOverdue - b.milesOverdue;
    });
  }, [cars, dismissedAlerts]);

  const dismissAlert = (carId: string, serviceName: string) => {
    const alertId = `${carId}-${serviceName}`;
    setDismissingAlert(alertId);

    setTimeout(() => {
      setDismissedAlerts(prev => new Set([...prev, alertId]));
      setDismissingAlert(null);
    }, 300);
  };

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
          await deleteObject(rs).catch(() => { });
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

  const updateCarMileage = useCallback(async (carId: string, newMileage: number) => {
    if (!me) return;

    try {
      await updateDoc(doc(db, "garages", me.uid, "cars", carId), {
        currentMileage: newMileage,
      });

      const updatedCar = cars.find(c => c.id === carId);
      if (updatedCar && me) {
        await checkAndScheduleNotifications({
          ...updatedCar,
          currentMileage: newMileage
        }, me.uid);
      }

      Alert.alert("Success", "Mileage updated successfully!");
      setShowMileageModal(false);
      setSelectedCarForMileage(null);
    } catch (error) {
      Alert.alert("Error", "Failed to update mileage");
    }
  }, [me, cars]);

  const openSheet = (car: Car) => {
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light);
    setSheetCar(car);
  };
  const closeSheet = () => setSheetCar(null);

  const EmptyState = () => (
    <View style={s.emptyState}>
      <Ionicons name="car-sport-outline" size={64} color={C.muted} />
      <Text style={s.emptyTitle}>Start Your Collection</Text>
      <Text style={s.emptyDesc}>Add your first vehicle to track builds, mods, and value</Text>

      <View style={s.tipsCard}>
        <Text style={s.tipsTitle}>Pro Tips:</Text>
        <Text style={s.tipItem}>Add photos to showcase your ride</Text>
        <Text style={s.tipItem}>Track mods and performance gains</Text>
        <Text style={s.tipItem}>Monitor your garage's value</Text>
      </View>

      <TouchableOpacity 
        onPress={() => setVehiclePickerOpen(true)} 
        style={s.emptyBtn}
      >
        <Ionicons name="add-circle" size={20} color="#fff" />
        <Text style={s.emptyBtnTxt}>Add Your First Vehicle</Text>
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
          {maintenanceAlerts.length > 0 && (
            <View style={s.alertBadge}>
              <Ionicons name="warning" size={7} color="#111" />
              <Text style={s.alertBadgeText}>{maintenanceAlerts.length}</Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 4 }}>
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
            onPress={() => setVehiclePickerOpen(true)}
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
                {maintenanceAlerts.length > 0 && (
                  <CompactMaintenanceAlert
                    alerts={maintenanceAlerts}
                    expanded={alertsExpanded}
                    onToggle={() => setAlertsExpanded(!alertsExpanded)}
                    onNavigate={(carId) => router.push({
                      pathname: "/car/[id]",
                      params: { id: carId, tab: 'maintenance' }
                    })} 
                    onDismiss={dismissAlert}
                    dismissingAlert={dismissingAlert}
                  />
                )}

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

                <View style={s.quickUpdateCard}>
                  <View style={s.quickUpdateHeader}>
                    <Ionicons name="speedometer" size={20} color={C.accent} />
                    <Text style={s.quickUpdateTitle}>Quick Mileage Update</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                    {cars.map((car) => (
                      <TouchableOpacity
                        key={car.id}
                        onPress={() => {
                          setSelectedCarForMileage(car);
                          setShowMileageModal(true);
                        }}
                        style={s.quickUpdateCarCard}
                        activeOpacity={0.8}
                      >
                        <View style={s.quickUpdateCarHeader}>
                          {car.photoURL ? (
                            <Image source={{ uri: car.photoURL }} style={s.quickUpdateThumb} />
                          ) : (
                            <View style={[s.quickUpdateThumb, s.thumbEmpty]}>
                              <Ionicons name="car-sport" size={18} color={C.muted} />
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={s.quickUpdateCarName} numberOfLines={1}>
                              {car.year ? `${car.year} ` : ""}{car.make}
                            </Text>
                            <Text style={s.quickUpdateCarModel} numberOfLines={1}>
                              {car.model}
                            </Text>
                          </View>
                        </View>
                        <View style={s.quickUpdateMileageRow}>
                          <Ionicons name="speedometer-outline" size={14} color={C.muted} />
                          <Text style={s.quickUpdateMileage}>
                            {car.currentMileage ? `${car.currentMileage.toLocaleString()} mi` : "Set mileage"}
                          </Text>
                          <Ionicons name="chevron-forward" size={14} color={C.accent} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
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
                  {item.nickname && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <Ionicons name="pricetag" size={12} color={C.accent} />
                      <Text style={s.nickname}>"{item.nickname}"</Text>
                    </View>
                  )}
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
                  {item.nickname && (
                    <Text style={s.gridNickname} numberOfLines={1}>"{item.nickname}"</Text>
                  )}
                </View>
              </TouchableOpacity>
            )
          )}
          ListEmptyComponent={<EmptyState />}
        />
      )}

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

      <MileageUpdateModal
        visible={showMileageModal}
        onClose={() => {
          setShowMileageModal(false);
          setSelectedCarForMileage(null);
        }}
        car={selectedCarForMileage}
        onSave={(newMileage) => {
          if (selectedCarForMileage) {
            updateCarMileage(selectedCarForMileage.id, newMileage);
          }
        }}
      />

      <VehicleTypePicker
        visible={vehiclePickerOpen}
        onClose={() => setVehiclePickerOpen(false)}
        onSelect={handleVehicleTypeSelect}
      />
    </SafeAreaView>
  );
}

function CompactMaintenanceAlert({
  alerts,
  expanded,
  onToggle,
  onNavigate,
  onDismiss,
  dismissingAlert,
}: {
  alerts: MaintenanceAlert[];
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (carId: string) => void;
  onDismiss: (carId: string, serviceName: string) => void;
  dismissingAlert: string | null;
}) {
  const heightAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const alertAnims = useRef<{ [key: string]: Animated.Value }>({}).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(heightAnim, {
        toValue: expanded ? 1 : 0,
        tension: 100,
        friction: 12,
        useNativeDriver: false,
      }),
      Animated.timing(rotateAnim, {
        toValue: expanded ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [expanded]);

  useEffect(() => {
    if (dismissingAlert) {
      if (!alertAnims[dismissingAlert]) {
        alertAnims[dismissingAlert] = new Animated.Value(1);
      }

      Animated.parallel([
        Animated.timing(alertAnims[dismissingAlert], {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [dismissingAlert]);

  const overdueCount = alerts.filter(a => a.status === "overdue").length;
  const dueSoonCount = alerts.filter(a => a.status === "due_soon").length;

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const mostUrgent = alerts[0];

  return (
    <View style={s.compactAlertContainer}>
      <TouchableOpacity
        onPress={onToggle}
        style={s.compactAlertHeader}
        activeOpacity={0.7}
      >
        <View style={s.compactAlertIcon}>
          <Ionicons
            name={overdueCount > 0 ? "warning" : "time"}
            size={22}
            color={overdueCount > 0 ? C.accent : C.warn}
          />
        </View>

        <View style={s.compactAlertTextContainer}>
          <Text style={s.compactAlertTitle}>
            {overdueCount > 0
              ? `${overdueCount} Overdue Service${overdueCount > 1 ? 's' : ''}`
              : `${dueSoonCount} Service${dueSoonCount > 1 ? 's' : ''} Due Soon`
            }
          </Text>
          <Text style={s.compactAlertSubtitle}>
            {mostUrgent.carName} • {mostUrgent.serviceName}
          </Text>
        </View>

        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={20} color={C.muted} />
        </Animated.View>
      </TouchableOpacity>

      {expanded && (
        <View style={s.expandedAlerts}>
          {alerts.map((alert, idx) => {
            const isOverdue = alert.status === "overdue";
            const statusColor = isOverdue ? C.accent : C.warn;
            const alertId = `${alert.carId}-${alert.serviceName}`;

            if (!alertAnims[alertId]) {
              alertAnims[alertId] = new Animated.Value(1);
            }

            const isDismissing = dismissingAlert === alertId;

            return (
              <Animated.View
                key={`${alert.carId}-${alert.serviceName}-${idx}`}
                style={{
                  opacity: alertAnims[alertId],
                  transform: [
                    {
                      translateX: alertAnims[alertId].interpolate({
                        inputRange: [0, 1],
                        outputRange: [100, 0],
                      }),
                    },
                    {
                      scale: alertAnims[alertId].interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.8, 1],
                      }),
                    },
                  ],
                }}
              >
                <TouchableOpacity
                  onPress={() => !isDismissing && onNavigate(alert.carId)}
                  style={s.miniAlertRow}
                  activeOpacity={0.7}
                  disabled={isDismissing}
                >
                  <View style={[s.miniAlertDot, { backgroundColor: statusColor }]} />

                  <View style={{ flex: 1 }}>
                    <Text style={s.miniAlertCar}>{alert.carName}</Text>
                    <Text style={s.miniAlertService}>
                      {alert.serviceName} •
                      <Text style={[{ color: statusColor, fontWeight: "800" }]}>
                        {isOverdue
                          ? ` ${alert.milesOverdue.toLocaleString()} mi overdue`
                          : ` ${alert.milesOverdue.toLocaleString()} mi left`
                        }
                      </Text>
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => onDismiss(alert.carId, alert.serviceName)}
                    style={s.miniDismissBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    disabled={isDismissing}
                  >
                    <Ionicons name="close" size={16} color={C.muted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function MileageUpdateModal({
  visible,
  onClose,
  car,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  car: Car | null;
  onSave: (mileage: number) => void;
}) {
  const [mileage, setMileage] = useState("");

  useEffect(() => {
    if (visible && car) {
      setMileage(car.currentMileage?.toString() || "");
    }
  }, [visible, car]);

  const handleSave = () => {
    const miles = parseInt(mileage);
    if (!mileage || isNaN(miles) || miles < 0) {
      Alert.alert("Invalid Mileage", "Please enter a valid mileage.");
      return;
    }
    onSave(miles);
    setMileage("");
  };

  if (!car) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Pressable style={s.modalOverlay} onPress={onClose}>
          <Pressable style={s.mileageModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={s.mileageModalHeader}>
              <Ionicons name="speedometer" size={28} color={C.accent} />
              <View style={{ flex: 1 }}>
                <Text style={s.mileageModalTitle}>Update Mileage</Text>
                <Text style={s.mileageModalSubtitle}>
                  {car.year ? `${car.year} ` : ""}{car.make} {car.model}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={s.mileageModalClose}>
                <Ionicons name="close" size={24} color={C.muted} />
              </TouchableOpacity>
            </View>

            <View style={s.mileageInputContainer}>
              <Text style={s.mileageLabel}>Current Odometer Reading</Text>
              <TextInput
                style={s.mileageInput}
                placeholder="Enter mileage"
                placeholderTextColor="#666"
                value={mileage}
                onChangeText={setMileage}
                keyboardType="number-pad"
                autoFocus
                selectionColor={C.accent}
              />
              <Text style={s.mileageHint}>
                Last recorded: {car.currentMileage?.toLocaleString() || "Not set"} mi
              </Text>
            </View>

            <TouchableOpacity onPress={handleSave} style={s.mileageModalBtn} activeOpacity={0.9}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={s.mileageModalBtnTxt}>Update Mileage</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

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
  alertBadge: {
    flexDirection: "row", gap: 4, alignItems: "center",
    backgroundColor: C.warn, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  alertBadgeText: { color: "#111", fontWeight: "900", fontSize: 10 },
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

  compactAlertContainer: {
    backgroundColor: C.panel,
    borderWidth: 2,
    borderColor: C.accent,
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: C.accent,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  compactAlertHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },

  quickUpdateCard: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  quickUpdateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  quickUpdateTitle: {
    color: C.text,
    fontWeight: "900",
    fontSize: 16,
  },
  quickUpdateCarCard: {
    backgroundColor: C.dim,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 10,
    width: 160,
    gap: 10,
  },
  quickUpdateCarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quickUpdateThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: C.bg,
  },
  quickUpdateCarName: {
    color: C.text,
    fontSize: 13,
    fontWeight: "800",
  },
  quickUpdateCarModel: {
    color: C.muted,
    fontSize: 11,
    marginTop: 1,
  },
  quickUpdateMileageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  quickUpdateMileage: {
    flex: 1,
    color: C.text,
    fontSize: 12,
    fontWeight: "700",
  },

  nickname: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "700",
    fontStyle: "italic"
  },
  gridNickname: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "700",
    fontStyle: "italic",
    marginTop: 2,
  },

  compactAlertIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.accent + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  compactAlertTextContainer: {
    flex: 1,
  },
  compactAlertTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: "900",
  },
  compactAlertSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 2,
  },
  expandedAlerts: {
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingVertical: 8,
  },
  miniAlertRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 12,
  },
  miniAlertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  miniAlertCar: {
    color: C.text,
    fontSize: 13,
    fontWeight: "800",
  },
  miniAlertService: {
    color: C.muted,
    fontSize: 11,
    marginTop: 2,
  },
  miniDismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.dim,
    alignItems: "center",
    justifyContent: "center",
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

  mileageModalCard: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 24,
    padding: 24,
    margin: 16,
    width: "90%",
    maxWidth: 400,
    alignSelf: "center",
  },
  mileageModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  mileageModalTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: "900",
  },
  mileageModalSubtitle: {
    color: C.muted,
    fontSize: 13,
    marginTop: 2,
  },
  mileageModalClose: {
    padding: 4,
  },
  mileageInputContainer: {
    marginBottom: 20,
  },
  mileageLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  mileageInput: {
    backgroundColor: "#1a1b20",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 16,
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  mileageHint: {
    color: C.muted,
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  mileageModalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 14,
  },
  mileageModalBtnTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },
});