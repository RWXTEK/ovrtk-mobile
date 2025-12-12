// apps/mobile/app/car/[id].tsx
import { useEffect, useMemo, useState, useCallback, useLayoutEffect, useRef } from "react";
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Alert, ActivityIndicator, Platform, KeyboardAvoidingView, Modal, TextInput, Animated, Linking, Image
} from "react-native";
import { Stack, useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { onAuthStateChanged, type User } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db, storage } from "../../lib/firebase";
import {
    doc, getDoc, updateDoc, serverTimestamp,
    onSnapshot, collection, addDoc, deleteDoc, query, orderBy
} from "firebase/firestore";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Notifications from 'expo-notifications';
import { checkAndScheduleNotifications } from '../../utils/notifications';
import * as DocumentPicker from 'expo-document-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const C = {
    bg: "#0C0D11", panel: "#121318", line: "#1E2127", text: "#E7EAF0",
    muted: "#A6ADBB", accent: "#E11D48", good: "#22c55e", warn: "#f59e0b", dim: "#0f1218",
};


// Default maintenance intervals (in miles)
const DEFAULT_INTERVALS = {
    oilChange: 5000,
    tireRotation: 6000,
    airFilter: 15000,
    cabinFilter: 15000,
    coolantFlush: 60000,
    sparkPlug: 30000,
    brakeInspection: 12000,
    brakeFluid: 24000,
    transmissionService: 60000,
    differentialService: 50000,
};

type StatusKey = "OK" | "CHECK" | "SERVICE";


type Car = {
    id: string; 
    vehicleType?: "car" | "motorcycle" | "truck" | "offroad" | "marine" | "other";
    make: string; 
    model: string;
    year: number | null; 
    trim: string | null;
    photoURL?: string;
    pinned?: boolean; 
    oilStatus?: StatusKey; 
    batteryStatus?: StatusKey; 
    tiresStatus?: StatusKey;
    purchasePrice?: number; 
    currentValue?: number; 
    vin?: string;
    createdAt?: any; 
    updatedAt?: any;
    currentMileage?: number;
    
    // Car/Truck specific
    engine?: string;
    transmission?: string;
    drivetrain?: string;
    color?: string;
    
    // Motorcycle/Off-Road specific
    bikeType?: string;
    engineSize?: string;
    
    // Truck specific
    bedLength?: string;
    towingCapacity?: string;
    payloadCapacity?: string;
    
    // Marine specific
    length?: string;
    hullType?: string;
    marineEngineType?: string;
    // ... rest of your fields
    // Service intervals (customizable by user)
    oilChangeInterval?: number;
    tireRotationInterval?: number;
    airFilterInterval?: number;
    coolantFlushInterval?: number;
    sparkPlugInterval?: number;
    brakeInspectionInterval?: number;
    transmissionServiceInterval?: number;
    differentialServiceInterval?: number;
    brakeFluidInterval?: number;
    cabinFilterInterval?: number;
    // Last service mileage (when each service was last done)
    lastOilChangeMileage?: number;
    lastTireRotationMileage?: number;
    lastAirFilterMileage?: number;
    lastCoolantFlushMileage?: number;
    lastSparkPlugMileage?: number;
    lastBrakeInspectionMileage?: number;
    lastTransmissionServiceMileage?: number;
    lastDifferentialServiceMileage?: number;
    lastBrakeFluidMileage?: number;
    lastCabinFilterMileage?: number;
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
// UPDATED TYPE DEFINITION - Add isWishlist field
type Part = {
    id: string;
    name: string;
    brand?: string;
    price?: number;
    purchaseDate?: any;
    installed: boolean;
    storeLink?: string;
    isWishlist?: boolean; // NEW FIELD
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
    fileURL?: string;      // ADD THIS
    fileName?: string;     // ADD THIS
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
    isWishlist?: boolean; // ADD THIS
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
    // Remove this line since we're using it in the activeTab declaration above
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

    const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
    const [activeTab, setActiveTab] = useState<"overview" | "maintenance" | "parts" | "docs" | "issues">(
        (tab as any) || "overview"
    );

    const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
    const [showPartModal, setShowPartModal] = useState(false);
    const [showPartsHelpModal, setShowPartsHelpModal] = useState(false);
    const [showModModal, setShowModModal] = useState(false);
    const [showIssueModal, setShowIssueModal] = useState(false);
    const [showDocModal, setShowDocModal] = useState(false);
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [showReminderSettingsModal, setShowReminderSettingsModal] = useState(false);
    const [showMaintenanceHelpModal, setShowMaintenanceHelpModal] = useState(false);
    const [showSuccessMessage, setShowSuccessMessage] = useState(false);
    const successToastAnim = useRef(new Animated.Value(0)).current; // ADD THIS LINE
    const [showMileageUpdateModal, setShowMileageUpdateModal] = useState(false); // NEW
    const [uploadingDocument, setUploadingDocument] = useState(false);
    const [selectedDocumentForUpload, setSelectedDocumentForUpload] = useState<Document | null>(null);

    const [editingMaintenance, setEditingMaintenance] = useState<MaintenanceRecord | null>(null);
    const [editingPart, setEditingPart] = useState<Part | null>(null);
    const [editingMod, setEditingMod] = useState<Mod | null>(null);
    const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
    const [editingDocument, setEditingDocument] = useState<Document | null>(null);
    const [presetWishlist, setPresetWishlist] = useState(false);

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

    const uploadDocumentFile = async (documentId: string) => {
        if (!me || !id) return;

        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*'],
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets?.length) return;

            setUploadingDocument(true);

            const file = result.assets[0];
            const response = await fetch(file.uri);
            const blob = await response.blob();

            const filename = `users/${me.uid}/cars/${id}/documents/${documentId}_${file.name}`;
            const docStorageRef = ref(storage, filename);

            await uploadBytes(docStorageRef, blob);
            const downloadURL = await getDownloadURL(docStorageRef);

            // Update document with file URL
            await updateDoc(doc(db, "garages", me.uid, "cars", id, "documents", documentId), {
                fileURL: downloadURL,
                fileName: file.name,
            });

            Alert.alert("Success", "Document uploaded successfully!");
        } catch (error) {
            console.error("Upload error:", error);
            Alert.alert("Error", "Failed to upload document");
        } finally {
            setUploadingDocument(false);
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
            {
                text: "Delete", style: "destructive", onPress: async () => {
                    try { await deleteDoc(doc(db, "garages", me.uid, "cars", id, "maintenance", maintId)); }
                    catch { Alert.alert("Error", "Failed to delete."); }
                }
            }
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
            {
                text: "Delete", style: "destructive", onPress: async () => {
                    try { await deleteDoc(doc(db, "garages", me.uid, "cars", id, "documents", docId)); }
                    catch { Alert.alert("Error", "Failed to delete document."); }
                }
            }
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


    const getServiceStatus = (
        lastMileage: number | undefined,
        interval: number | undefined,
        currentMileage: number | undefined,
        defaultInterval: number
    ): { remaining: number; nextDue: number; status: "good" | "warning" | "overdue" | "not_set" } | null => {
        if (!currentMileage) return null;

        // Use default interval if not set
        const actualInterval = interval || defaultInterval;

        // If never done, show as "not set"
        if (!lastMileage || lastMileage === 0) {
            return { remaining: 0, nextDue: 0, status: "not_set" };
        }

        const nextDue = lastMileage + actualInterval;
        const remaining = nextDue - currentMileage;

        let status: "good" | "warning" | "overdue" | "not_set";
        if (remaining < 0) {
            status = "overdue";
        } else if (remaining <= 1500) {
            status = "warning";
        } else {
            status = "good";
        }

        return { remaining, nextDue, status };
    };

    // ADD THIS NEW FUNCTION RIGHT HERE! ⬇️⬇️⬇️
    const getScottyMessage = (serviceName: string, milesOverdue: number, car: Car) => {
        const carName = `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim() || 'your car';

        if (milesOverdue < 0) {
            const overdueMessages = [
                `🚨 Scotty here! Your ${carName}'s ${serviceName.toLowerCase()} is ${Math.abs(milesOverdue).toLocaleString()} miles overdue. Don't ignore this!`,
                `⚠️ Scotty says: Your ${serviceName.toLowerCase()} should've been done ${Math.abs(milesOverdue).toLocaleString()} miles ago!`,
                `🔧 Hey! Scotty noticed your ${carName} needs ${serviceName.toLowerCase()} - you're ${Math.abs(milesOverdue).toLocaleString()} miles overdue!`,
                `🚗💨 Scotty's Warning: ${serviceName} is seriously overdue by ${Math.abs(milesOverdue).toLocaleString()} miles. Take care of your ride!`,
            ];
            return overdueMessages[Math.floor(Math.random() * overdueMessages.length)];
        } else {
            const dueSoonMessages = [
                `🔔 Scotty recommends: Schedule your ${serviceName.toLowerCase()} soon - only ${milesOverdue.toLocaleString()} miles left!`,
                `👋 Hey! Scotty here. Your ${carName} will need ${serviceName.toLowerCase()} in ${milesOverdue.toLocaleString()} miles.`,
                `🔧 Scotty's Tip: ${serviceName} coming up in ${milesOverdue.toLocaleString()} miles. Plan ahead!`,
                `🚗 Scotty says: Don't forget - ${serviceName.toLowerCase()} due in ${milesOverdue.toLocaleString()} miles!`,
            ];
            return dueSoonMessages[Math.floor(Math.random() * dueSoonMessages.length)];
        }
    };




    const markServiceAsDone = async (serviceType: string) => {
        if (!me || !id || !car?.currentMileage) {
            Alert.alert("Error", "Please set your current mileage first.");
            return;
        }

        const serviceFieldMap: { [key: string]: { lastField: string, intervalField: string, defaultInterval: number } } = {
            'Oil Change': { lastField: 'lastOilChangeMileage', intervalField: 'oilChangeInterval', defaultInterval: DEFAULT_INTERVALS.oilChange },
            'Tire Rotation': { lastField: 'lastTireRotationMileage', intervalField: 'tireRotationInterval', defaultInterval: DEFAULT_INTERVALS.tireRotation },
            'Air Filter': { lastField: 'lastAirFilterMileage', intervalField: 'airFilterInterval', defaultInterval: DEFAULT_INTERVALS.airFilter },
            'Cabin Filter': { lastField: 'lastCabinFilterMileage', intervalField: 'cabinFilterInterval', defaultInterval: DEFAULT_INTERVALS.cabinFilter },
            'Coolant Flush': { lastField: 'lastCoolantFlushMileage', intervalField: 'coolantFlushInterval', defaultInterval: DEFAULT_INTERVALS.coolantFlush },
            'Spark Plugs': { lastField: 'lastSparkPlugMileage', intervalField: 'sparkPlugInterval', defaultInterval: DEFAULT_INTERVALS.sparkPlug },
            'Brake Inspection': { lastField: 'lastBrakeInspectionMileage', intervalField: 'brakeInspectionInterval', defaultInterval: DEFAULT_INTERVALS.brakeInspection },
            'Brake Fluid': { lastField: 'lastBrakeFluidMileage', intervalField: 'brakeFluidInterval', defaultInterval: DEFAULT_INTERVALS.brakeFluid },
            'Transmission Service': { lastField: 'lastTransmissionServiceMileage', intervalField: 'transmissionServiceInterval', defaultInterval: DEFAULT_INTERVALS.transmissionService },
            'Differential Service': { lastField: 'lastDifferentialServiceMileage', intervalField: 'differentialServiceInterval', defaultInterval: DEFAULT_INTERVALS.differentialService },
        };

        const serviceConfig = serviceFieldMap[serviceType];
        if (!serviceConfig) return;

        const currentInterval = (car as any)[serviceConfig.intervalField] || serviceConfig.defaultInterval;
        const nextDue = car.currentMileage + currentInterval;

        Alert.alert(
            "Mark as Done",
            `Record ${serviceType} completed at ${car.currentMileage.toLocaleString()} miles?\n\nNext due: ${nextDue.toLocaleString()} miles`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Confirm",
                    onPress: async () => {
                        try {
                            const updates: any = {
                                [serviceConfig.lastField]: car.currentMileage,
                                updatedAt: serverTimestamp(),
                            };

                            // Set default interval if not already set
                            if (!(car as any)[serviceConfig.intervalField]) {
                                updates[serviceConfig.intervalField] = serviceConfig.defaultInterval;
                            }

                            await updateDoc(doc(db, "garages", me.uid, "cars", id), updates);

                            // Update local state
                            setCar({ ...car, ...updates });

                            Alert.alert("✅ Done!", `${serviceType} completed!\nNext due at ${nextDue.toLocaleString()} miles`);
                        } catch (error) {
                            Alert.alert("Error", "Failed to update service record.");
                        }
                    }
                }
            ]
        );
    };



    // Line ~490 - THEN your loading checks and JSX render
    if (loading) {
        return (
            <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={s.center}>
                    <ActivityIndicator />
                    <Text style={{ color: C.muted, marginTop: 8 }}>Loading car…</Text>
                </View>
            </SafeAreaView>
        );
    }
    // ... rest of your component
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
                            {/* CAR PHOTO - ADD THIS SECTION */}
                            {car.photoURL && (
                                <View style={s.card}>
                                    <Image
                                        source={{ uri: car.photoURL }}
                                        style={s.carPhoto}
                                        resizeMode="cover"
                                    />
                                </View>
                            )}

                            <View style={[s.card, { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
                                <View style={s.titleBlock}>
                                    {car.pinned ? (
                                        <View style={s.badgePin}>
                                            <Ionicons name="star" size={12} color="#111" />
                                            <Text style={s.badgePinTxt}>Pinned</Text>
                                        </View>
                                    ) : null}
                                    <Text style={[s.titleTxt, { fontSize: 20, color: C.text }]}>{title}</Text>
                                    {(car as any).nickname ? (
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                                            <Ionicons name="pricetag" size={14} color={C.accent} />
                                            <Text style={[s.subtitleTxt, { color: C.accent, fontWeight: "700" }]}>"{(car as any).nickname}"</Text>
                                        </View>
                                    ) : null}
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
                                    
                                    {/* Conditional: Show Trim for Car/Truck/Other */}
                                    {(car.vehicleType === "car" || car.vehicleType === "truck" || car.vehicleType === "other" || !car.vehicleType) && (
                                        <Spec label="Trim" value={car.trim || "—"} />
                                    )}
                                    
                                    {/* Conditional: Show Type for Motorcycle/Off-Road */}
                                    {(car.vehicleType === "motorcycle" || car.vehicleType === "offroad") && car.bikeType && (
                                        <Spec label="Type" value={car.bikeType} />
                                    )}
                                    
                                    {/* Conditional: Show Engine Size for Motorcycle/Off-Road */}
                                    {(car.vehicleType === "motorcycle" || car.vehicleType === "offroad") && car.engineSize && (
                                        <Spec label="Engine" value={`${car.engineSize} cc`} />
                                    )}
                                    
                                    {/* Conditional: Show Engine for Car/Truck/Other */}
                                    {(car.vehicleType === "car" || car.vehicleType === "truck" || car.vehicleType === "other" || !car.vehicleType) && car.engine && (
                                        <Spec label="Engine" value={car.engine} />
                                    )}
                                    
                                    {/* Conditional: Show Transmission for all except Marine */}
                                    {car.vehicleType !== "marine" && car.transmission && (
                                        <Spec label="Transmission" value={car.transmission} />
                                    )}
                                    
                                    {/* Conditional: Show Drivetrain for Car/Truck/Off-Road */}
                                    {(car.vehicleType === "car" || car.vehicleType === "truck" || car.vehicleType === "offroad" || car.vehicleType === "other" || !car.vehicleType) && car.drivetrain && (
                                        <Spec label="Drivetrain" value={car.drivetrain} />
                                    )}
                                    
                                    {/* Conditional: Show Marine-specific fields */}
                                    {car.vehicleType === "marine" && car.length && (
                                        <Spec label="Length" value={`${car.length} ft`} />
                                    )}
                                    {car.vehicleType === "marine" && car.hullType && (
                                        <Spec label="Hull Type" value={car.hullType} />
                                    )}
                                    {car.vehicleType === "marine" && car.marineEngineType && (
                                        <Spec label="Engine Type" value={car.marineEngineType} />
                                    )}
                                    
                                    {/* Conditional: Show Truck-specific fields */}
                                    {car.vehicleType === "truck" && car.bedLength && (
                                        <Spec label="Bed Length" value={car.bedLength} />
                                    )}
                                    {car.vehicleType === "truck" && car.towingCapacity && (
                                        <Spec label="Towing Capacity" value={car.towingCapacity} />
                                    )}
                                    {car.vehicleType === "truck" && car.payloadCapacity && (
                                        <Spec label="Payload Capacity" value={car.payloadCapacity} />
                                    )}
                                    
                                    {/* Show Color if available */}
                                    {car.color && <Spec label="Color" value={car.color} />}
                                    
                                    {car.vin && <Spec label={car.vehicleType === "marine" ? "HIN" : "VIN"} value={car.vin} wide />}
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
                                    <Text style={s.cardTitle}>Current Mileage</Text>
                                    <TouchableOpacity onPress={() => setShowMileageUpdateModal(true)}>
                                        <Text style={{ color: C.accent, fontWeight: "800" }}>Update</Text>
                                    </TouchableOpacity>
                                </View>
                                <Text style={{ color: C.text, fontSize: 32, fontWeight: "900", marginTop: 4 }}>
                                    {car.currentMileage ? `${car.currentMileage.toLocaleString()} mi` : "Not set"}
                                </Text>
                                <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
                                    Keep this updated to track service intervals
                                </Text>
                            </View>

                            <View style={s.card}>
                                <View style={s.cardHeader}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Ionicons name="notifications-outline" size={22} color={C.accent} />
                                        <Text style={s.cardTitle}>Service Reminders</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <TouchableOpacity
                                            onPress={() => setShowMaintenanceHelpModal(true)}
                                            style={s.settingsIconBtn}
                                        >
                                            <Ionicons name="help-circle-outline" size={20} color={C.accent} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => setShowReminderSettingsModal(true)}
                                            style={s.settingsIconBtn}
                                        >
                                            <Ionicons name="settings-outline" size={20} color={C.accent} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {!car.currentMileage ? (
                                    <View style={s.emptyStateContainer}>
                                        <Ionicons name="speedometer-outline" size={48} color={C.muted} style={{ opacity: 0.3 }} />
                                        <Text style={s.emptyStateTitle}>No Mileage Data</Text>
                                        <Text style={s.emptyStateDesc}>
                                            Update your current mileage to start tracking service reminders
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => setShowMileageUpdateModal(true)}
                                            style={s.emptyStateCTA}
                                        >
                                            <Text style={s.emptyStateCTAText}>Update Mileage</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <>
                                        {/* Service Items - Simple Cards */}
                                        <View style={{ gap: 12, marginTop: 12 }}>
                                            {[
                                                {
                                                    name: 'Oil Change',
                                                    icon: 'water-outline',
                                                    interval: car.oilChangeInterval || DEFAULT_INTERVALS.oilChange,
                                                    lastMileage: car.lastOilChangeMileage,
                                                    defaultInterval: DEFAULT_INTERVALS.oilChange
                                                },
                                                {
                                                    name: 'Tire Rotation',
                                                    icon: 'repeat-outline',
                                                    interval: car.tireRotationInterval || DEFAULT_INTERVALS.tireRotation,
                                                    lastMileage: car.lastTireRotationMileage,
                                                    defaultInterval: DEFAULT_INTERVALS.tireRotation
                                                },
                                                {
                                                    name: 'Air Filter',
                                                    icon: 'leaf-outline',
                                                    interval: car.airFilterInterval || DEFAULT_INTERVALS.airFilter,
                                                    lastMileage: car.lastAirFilterMileage,
                                                    defaultInterval: DEFAULT_INTERVALS.airFilter
                                                },
                                                {
                                                    name: 'Cabin Filter',
                                                    icon: 'snow-outline',
                                                    interval: car.cabinFilterInterval || DEFAULT_INTERVALS.cabinFilter,
                                                    lastMileage: car.lastCabinFilterMileage,
                                                    defaultInterval: DEFAULT_INTERVALS.cabinFilter
                                                },
                                                {
                                                    name: 'Coolant Flush',
                                                    icon: 'thermometer-outline',
                                                    interval: car.coolantFlushInterval || DEFAULT_INTERVALS.coolantFlush,
                                                    lastMileage: car.lastCoolantFlushMileage,
                                                    defaultInterval: DEFAULT_INTERVALS.coolantFlush
                                                },
                                                {
                                                    name: 'Spark Plugs',
                                                    icon: 'flash-outline',
                                                    interval: car.sparkPlugInterval || DEFAULT_INTERVALS.sparkPlug,
                                                    lastMileage: car.lastSparkPlugMileage,
                                                    defaultInterval: DEFAULT_INTERVALS.sparkPlug
                                                },
                                                {
                                                    name: 'Brake Inspection',
                                                    icon: 'hand-left-outline',
                                                    interval: car.brakeInspectionInterval || DEFAULT_INTERVALS.brakeInspection,
                                                    lastMileage: car.lastBrakeInspectionMileage,
                                                    defaultInterval: DEFAULT_INTERVALS.brakeInspection
                                                },
                                                {
                                                    name: 'Brake Fluid',
                                                    icon: 'water-outline',
                                                    interval: car.brakeFluidInterval || DEFAULT_INTERVALS.brakeFluid,
                                                    lastMileage: car.lastBrakeFluidMileage,
                                                    defaultInterval: DEFAULT_INTERVALS.brakeFluid
                                                },
                                                {
                                                    name: 'Transmission Service',
                                                    icon: 'settings-outline',
                                                    interval: car.transmissionServiceInterval || DEFAULT_INTERVALS.transmissionService,
                                                    lastMileage: car.lastTransmissionServiceMileage,
                                                    defaultInterval: DEFAULT_INTERVALS.transmissionService
                                                },
                                                {
                                                    name: 'Differential Service',
                                                    icon: 'cog-outline',
                                                    interval: car.differentialServiceInterval || DEFAULT_INTERVALS.differentialService,
                                                    lastMileage: car.lastDifferentialServiceMileage,
                                                    defaultInterval: DEFAULT_INTERVALS.differentialService
                                                },
                                            ].map((service) => {
                                                const status = getServiceStatus(
                                                    service.lastMileage,
                                                    service.interval,
                                                    car.currentMileage,
                                                    service.defaultInterval
                                                );

                                                if (!status) return null;

                                                const isNotSet = status.status === "not_set";
                                                const isOverdue = status.status === "overdue";
                                                const isWarning = status.status === "warning";
                                                const isGood = status.status === "good";

                                                return (
                                                    <View key={service.name} style={s.serviceCard}>
                                                        <View style={s.serviceHeader}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                                <View style={[
                                                                    s.serviceIconWrapper,
                                                                    { backgroundColor: isOverdue ? C.accent + '20' : isWarning ? C.warn + '20' : isNotSet ? C.muted + '20' : C.good + '20' }
                                                                ]}>
                                                                    <Ionicons
                                                                        name={service.icon as any}
                                                                        size={20}
                                                                        color={isOverdue ? C.accent : isWarning ? C.warn : isNotSet ? C.muted : C.good}
                                                                    />
                                                                </View>
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={s.serviceName}>{service.name}</Text>
                                                                    {isNotSet ? (
                                                                        <Text style={s.serviceSubtext}>Not tracked yet - tap to start</Text>
                                                                    ) : (
                                                                        <Text style={s.serviceSubtext}>
                                                                            Every {service.interval.toLocaleString()} mi
                                                                        </Text>
                                                                    )}
                                                                </View>
                                                            </View>
                                                        </View>

                                                        {!isNotSet && (
                                                            <View style={s.serviceDetails}>
                                                                <View style={s.serviceDetailRow}>
                                                                    <Text style={s.serviceDetailLabel}>Last done:</Text>
                                                                    <Text style={s.serviceDetailValue}>
                                                                        {service.lastMileage?.toLocaleString() || '0'} mi
                                                                    </Text>
                                                                </View>
                                                                <View style={s.serviceDetailRow}>
                                                                    <Text style={s.serviceDetailLabel}>Next due:</Text>
                                                                    <Text style={[
                                                                        s.serviceDetailValue,
                                                                        { color: isOverdue ? C.accent : isWarning ? C.warn : C.good }
                                                                    ]}>
                                                                        {status.nextDue.toLocaleString()} mi
                                                                    </Text>
                                                                </View>
                                                                <View style={s.serviceDetailRow}>
                                                                    <Text style={s.serviceDetailLabel}>Status:</Text>
                                                                    <Text style={[
                                                                        s.serviceDetailValue,
                                                                        {
                                                                            color: isOverdue ? C.accent : isWarning ? C.warn : C.good,
                                                                            fontWeight: '800'
                                                                        }
                                                                    ]}>
                                                                        {isOverdue
                                                                            ? `${Math.abs(status.remaining).toLocaleString()} mi overdue`
                                                                            : isWarning
                                                                                ? `${status.remaining.toLocaleString()} mi left`
                                                                                : `${status.remaining.toLocaleString()} mi left`
                                                                        }
                                                                    </Text>
                                                                </View>
                                                            </View>
                                                        )}

                                                        <TouchableOpacity
                                                            style={[
                                                                s.justDidThisBtn,
                                                                isNotSet && { backgroundColor: C.accent }
                                                            ]}
                                                            onPress={() => markServiceAsDone(service.name)}
                                                            activeOpacity={0.8}
                                                        >
                                                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                                                            <Text style={s.justDidThisBtnText}>
                                                                {isNotSet ? 'Start Tracking' : 'Just Did This'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </>
                                )}
                            </View>

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
                            {/* Hero Stats Card */}
                            <View style={[s.card, { backgroundColor: C.dim }]}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
                                    <View style={[s.serviceIconCircle, { backgroundColor: C.accent + "20" }]}>
                                        <Ionicons name="construct" size={28} color={C.accent} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.cardTitle, { fontSize: 20 }]}>Parts Inventory</Text>
                                        <Text style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
                                            Track upgrades, spares, and wishlist items
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => setShowPartsHelpModal(true)}
                                        style={s.settingsIconBtn}
                                    >
                                        <Ionicons name="help-circle-outline" size={20} color={C.accent} />
                                    </TouchableOpacity>
                                </View>

                                <View style={{ flexDirection: "row", gap: 8 }}>
                                    <View style={s.reminderStat}>
                                        <Ionicons name="cube" size={20} color={C.text} />
                                        <Text style={[s.reminderStatValue, { fontSize: 20, color: C.text }]}>
                                            {parts.filter(p => !p.isWishlist).length}
                                        </Text>
                                        <Text style={s.reminderStatLabel}>Owned</Text>
                                    </View>
                                    <View style={s.reminderStat}>
                                        <Ionicons name="checkmark-circle" size={20} color={C.good} />
                                        <Text style={[s.reminderStatValue, { fontSize: 20, color: C.good }]}>
                                            {parts.filter(p => p.installed && !p.isWishlist).length}
                                        </Text>
                                        <Text style={s.reminderStatLabel}>Installed</Text>
                                    </View>
                                    <View style={s.reminderStat}>
                                        <Ionicons name="heart" size={20} color="#E91E63" />
                                        <Text style={[s.reminderStatValue, { fontSize: 20, color: "#E91E63" }]}>
                                            {parts.filter(p => p.isWishlist).length}
                                        </Text>
                                        <Text style={s.reminderStatLabel}>Wishlist</Text>
                                    </View>
                                </View>
                            </View>

                            {/* Value Summary */}
                            {parts.filter(p => !p.isWishlist).length > 0 && (
                                <View style={s.card}>
                                    <Text style={s.cardTitle}>Investment Summary</Text>
                                    <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>Installed Value</Text>
                                            <Text style={{ color: C.good, fontSize: 24, fontWeight: "900" }}>
                                                ${parts.filter(p => p.installed && !p.isWishlist).reduce((sum, p) => sum + (p.price || 0), 0).toLocaleString()}
                                            </Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>Pending Value</Text>
                                            <Text style={{ color: C.warn, fontSize: 24, fontWeight: "900" }}>
                                                ${parts.filter(p => !p.installed && !p.isWishlist).reduce((sum, p) => sum + (p.price || 0), 0).toLocaleString()}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
                                        <Text style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>Total Parts Investment</Text>
                                        <Text style={{ color: C.text, fontSize: 28, fontWeight: "900" }}>
                                            ${parts.filter(p => !p.isWishlist).reduce((sum, p) => sum + (p.price || 0), 0).toLocaleString()}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* WISHLIST SECTION - NEW! */}
                            {parts.filter(p => p.isWishlist).length > 0 && (
                                <View style={s.card}>
                                    <View style={s.cardHeader}>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                            <Ionicons name="heart" size={20} color="#E91E63" />
                                            <Text style={s.cardTitle}>Parts Wishlist</Text>
                                        </View>
                                        <View style={[s.statusBadge, { backgroundColor: "#E91E63" + "20" }]}>
                                            <Text style={[s.statusBadgeText, { color: "#E91E63" }]}>
                                                {parts.filter(p => p.isWishlist).length}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Wishlist Total */}
                                    <View style={{
                                        backgroundColor: "#E91E63" + "10",
                                        borderRadius: 10,
                                        padding: 12,
                                        marginTop: 8,
                                        marginBottom: 12,
                                        borderWidth: 1,
                                        borderColor: "#E91E63" + "30"
                                    }}>
                                        <Text style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>Total Wishlist Value</Text>
                                        <Text style={{ color: "#E91E63", fontSize: 24, fontWeight: "900" }}>
                                            ${parts.filter(p => p.isWishlist).reduce((sum, p) => sum + (p.price || 0), 0).toLocaleString()}
                                        </Text>
                                    </View>

                                    <View style={{ gap: 12 }}>
                                        {parts.filter(p => p.isWishlist).map(part => (
                                            <View key={part.id} style={[s.partCardEnhanced, { borderColor: "#E91E63" + "30" }]}>
                                                <View style={[s.partCheckboxInner, {
                                                    width: 32,
                                                    height: 32,
                                                    borderRadius: 16,
                                                    backgroundColor: "#E91E63" + "20",
                                                    borderColor: "#E91E63",
                                                    borderWidth: 2,
                                                    alignItems: "center",
                                                    justifyContent: "center"
                                                }]}>
                                                    <Ionicons name="heart" size={18} color="#E91E63" />
                                                </View>

                                                <View style={{ flex: 1 }}>
                                                    <Text style={s.partNameEnhanced}>{part.name}</Text>
                                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                                                        {part.brand && (
                                                            <View style={s.partBadge}>
                                                                <Ionicons name="pricetag" size={10} color={C.muted} />
                                                                <Text style={s.partBadgeText}>{part.brand}</Text>
                                                            </View>
                                                        )}
                                                        {part.price && (
                                                            <View style={[s.partBadge, { backgroundColor: "#E91E63" + "15" }]}>
                                                                <Ionicons name="cash" size={10} color="#E91E63" />
                                                                <Text style={[s.partBadgeText, { color: "#E91E63" }]}>
                                                                    ${part.price.toLocaleString()}
                                                                </Text>
                                                            </View>
                                                        )}
                                                        <View style={[s.partBadge, { backgroundColor: "#E91E63" + "10" }]}>
                                                            <Ionicons name="heart" size={10} color="#E91E63" />
                                                            <Text style={[s.partBadgeText, { color: "#E91E63" }]}>Wishlist</Text>
                                                        </View>
                                                    </View>
                                                </View>

                                                <View style={{ flexDirection: "row", gap: 6 }}>
                                                    {part.storeLink && (
                                                        <TouchableOpacity
                                                            onPress={() => {
                                                                if (part.storeLink) {
                                                                    let url = part.storeLink.trim();

                                                                    // Add https:// if no protocol is present
                                                                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                                                                        url = 'https://' + url;
                                                                    }

                                                                    Linking.openURL(url).catch((err) => {
                                                                        console.error("Failed to open URL:", err);
                                                                        Alert.alert("Error", "Could not open link. Please check the URL.");
                                                                    });
                                                                }
                                                            }}
                                                            style={[s.partActionBtn, { backgroundColor: "#3b82f6" + "20", borderColor: "#3b82f6" }]}
                                                        >
                                                            <Ionicons name="link" size={18} color="#3b82f6" />
                                                        </TouchableOpacity>
                                                    )}
                                                    <TouchableOpacity
                                                        onPress={async () => {
                                                            if (!me || !id) return;
                                                            try {
                                                                await updateDoc(doc(db, "garages", me.uid, "cars", id, "parts", part.id), {
                                                                    isWishlist: false,
                                                                    purchaseDate: serverTimestamp(),
                                                                });
                                                                Alert.alert("Purchased! 🎉", `${part.name} moved to Pending Installs`);
                                                            } catch { Alert.alert("Error", "Failed to update part."); }
                                                        }}
                                                        style={[s.partActionBtn, { backgroundColor: C.good + "20", borderColor: C.good }]}
                                                    >
                                                        <Ionicons name="cart" size={18} color={C.good} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        onPress={() => { setEditingPart(part); setShowPartModal(true); }}
                                                        style={s.partActionBtn}
                                                    >
                                                        <Ionicons name="create-outline" size={18} color={C.text} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        onPress={() => deletePart(part.id)}
                                                        style={s.partActionBtn}
                                                    >
                                                        <Ionicons name="trash-outline" size={18} color={C.muted} />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}

                            {/* Pending Installs Section */}
                            {parts.filter(p => !p.installed && !p.isWishlist).length > 0 && (
                                <View style={s.card}>
                                    <View style={s.cardHeader}>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                            <Ionicons name="hourglass" size={20} color={C.warn} />
                                            <Text style={s.cardTitle}>Pending Installs</Text>
                                        </View>
                                        <View style={[s.statusBadge, { backgroundColor: C.warn + "20" }]}>
                                            <Text style={[s.statusBadgeText, { color: C.warn }]}>
                                                {parts.filter(p => !p.installed && !p.isWishlist).length}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{ marginTop: 12, gap: 12 }}>
                                        {parts.filter(p => !p.installed && !p.isWishlist).map(part => (
                                            <View key={part.id} style={s.partCardEnhanced}>
                                                <TouchableOpacity
                                                    onPress={() => togglePartInstalled(part.id, part.installed)}
                                                    style={s.partCheckbox}
                                                    activeOpacity={0.7}
                                                >
                                                    <View style={[s.partCheckboxInner, { borderColor: C.warn }]}>
                                                        <Ionicons name="ellipse-outline" size={20} color={C.warn} />
                                                    </View>
                                                </TouchableOpacity>

                                                <View style={{ flex: 1 }}>
                                                    <Text style={s.partNameEnhanced}>{part.name}</Text>
                                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                                                        {part.brand && (
                                                            <View style={s.partBadge}>
                                                                <Ionicons name="pricetag" size={10} color={C.muted} />
                                                                <Text style={s.partBadgeText}>{part.brand}</Text>
                                                            </View>
                                                        )}
                                                        {part.price && (
                                                            <View style={[s.partBadge, { backgroundColor: C.warn + "15" }]}>
                                                                <Ionicons name="cash" size={10} color={C.warn} />
                                                                <Text style={[s.partBadgeText, { color: C.warn }]}>
                                                                    ${part.price.toLocaleString()}
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                </View>

                                                <View style={{ flexDirection: "row", gap: 6 }}>
                                                    <TouchableOpacity
                                                        onPress={() => { setEditingPart(part); setShowPartModal(true); }}
                                                        style={s.partActionBtn}
                                                    >
                                                        <Ionicons name="create-outline" size={18} color={C.text} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        onPress={() => deletePart(part.id)}
                                                        style={s.partActionBtn}
                                                    >
                                                        <Ionicons name="trash-outline" size={18} color={C.muted} />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}

                            {/* Installed Parts Section */}
                            {parts.filter(p => p.installed && !p.isWishlist).length > 0 && (
                                <View style={s.card}>
                                    <View style={s.cardHeader}>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                            <Ionicons name="checkmark-circle" size={20} color={C.good} />
                                            <Text style={s.cardTitle}>Installed Parts</Text>
                                        </View>
                                        <View style={[s.statusBadge, { backgroundColor: C.good + "20" }]}>
                                            <Text style={[s.statusBadgeText, { color: C.good }]}>
                                                {parts.filter(p => p.installed && !p.isWishlist).length}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={{ marginTop: 12, gap: 12 }}>
                                        {parts.filter(p => p.installed && !p.isWishlist).map(part => (
                                            <View key={part.id} style={s.partCardEnhanced}>
                                                <TouchableOpacity
                                                    onPress={() => togglePartInstalled(part.id, part.installed)}
                                                    style={s.partCheckbox}
                                                    activeOpacity={0.7}
                                                >
                                                    <View style={[s.partCheckboxInner, { backgroundColor: C.good + "20", borderColor: C.good }]}>
                                                        <Ionicons name="checkmark" size={20} color={C.good} />
                                                    </View>
                                                </TouchableOpacity>

                                                <View style={{ flex: 1 }}>
                                                    <Text style={s.partNameEnhanced}>{part.name}</Text>
                                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                                                        {part.brand && (
                                                            <View style={s.partBadge}>
                                                                <Ionicons name="pricetag" size={10} color={C.muted} />
                                                                <Text style={s.partBadgeText}>{part.brand}</Text>
                                                            </View>
                                                        )}
                                                        {part.price && (
                                                            <View style={[s.partBadge, { backgroundColor: C.good + "15" }]}>
                                                                <Ionicons name="cash" size={10} color={C.good} />
                                                                <Text style={[s.partBadgeText, { color: C.good }]}>
                                                                    ${part.price.toLocaleString()}
                                                                </Text>
                                                            </View>
                                                        )}
                                                        <View style={[s.partBadge, { backgroundColor: C.good + "10" }]}>
                                                            <Ionicons name="checkmark-done" size={10} color={C.good} />
                                                            <Text style={[s.partBadgeText, { color: C.good }]}>Installed</Text>
                                                        </View>
                                                    </View>
                                                </View>

                                                <View style={{ flexDirection: "row", gap: 6 }}>
                                                    <TouchableOpacity
                                                        onPress={() => { setEditingPart(part); setShowPartModal(true); }}
                                                        style={s.partActionBtn}
                                                    >
                                                        <Ionicons name="create-outline" size={18} color={C.text} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        onPress={() => deletePart(part.id)}
                                                        style={s.partActionBtn}
                                                    >
                                                        <Ionicons name="trash-outline" size={18} color={C.muted} />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}

                            {/* Empty State */}
                            {parts.length === 0 && (
                                <View style={s.card}>
                                    <View style={s.emptyStateContainer}>
                                        <View style={[s.serviceIconCircle, { width: 80, height: 80, backgroundColor: C.accent + "10" }]}>
                                            <Ionicons name="construct-outline" size={40} color={C.muted} style={{ opacity: 0.5 }} />
                                        </View>
                                        <Text style={s.emptyStateTitle}>No Parts Yet</Text>
                                        <Text style={s.emptyStateDesc}>
                                            Start tracking your aftermarket parts, upgrades, and wishlist items
                                        </Text>
                                        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                                            <TouchableOpacity
                                                onPress={() => setShowPartModal(true)}
                                                style={s.emptyStateCTA}
                                            >
                                                <Ionicons name="add-circle" size={20} color="#fff" />
                                                <Text style={s.emptyStateCTAText}>Add Part</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    setEditingPart(null);
                                                    setShowPartModal(true);
                                                }}
                                                style={[s.emptyStateCTA, { backgroundColor: "#E91E63" }]}
                                            >
                                                <Ionicons name="heart" size={20} color="#fff" />
                                                <Text style={s.emptyStateCTAText}>Add to Wishlist</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            )}

                            {/* Quick Add Buttons - Floating */}
                            {parts.length > 0 && (
                                <View style={{ flexDirection: "row", gap: 8, marginHorizontal: 12, marginTop: 12 }}>
                                    <TouchableOpacity
                                        onPress={() => setShowPartModal(true)}
                                        style={[s.floatingAddBtn, { flex: 1 }]}
                                        activeOpacity={0.9}
                                    >
                                        <Ionicons name="add" size={24} color="#fff" />
                                        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Add Part</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setEditingPart(null);
                                            setPresetWishlist(true); // Set flag to pre-check wishlist
                                            setShowPartModal(true);
                                        }}
                                        style={[s.floatingAddBtn, { backgroundColor: "#E91E63", flex: 1 }]}
                                        activeOpacity={0.9}
                                    >
                                        <Ionicons name="heart" size={24} color="#fff" />
                                        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Wishlist</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
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
                                                onUpload={uploadDocumentFile}
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
                                                onUpload={uploadDocumentFile}
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
                                                onUpload={uploadDocumentFile}
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
                onClose={() => {
                    setShowPartModal(false);
                    setEditingPart(null);
                    setPresetWishlist(false); // Reset when closing
                }}
                editing={editingPart}
                presetWishlist={presetWishlist} // PASS THE PROP
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

            <ReminderSettingsModal
                visible={showReminderSettingsModal}
                onClose={() => setShowReminderSettingsModal(false)}
                car={car}
                onSave={async (intervals: {
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
                }) => {
                    if (!me || !id) return;
                    try {
                        await updateDoc(doc(db, "garages", me.uid, "cars", id), {
                            ...intervals,
                            updatedAt: serverTimestamp(),
                        });
                        setCar({ ...car!, ...intervals });
                        setShowReminderSettingsModal(false);

                        // Show success message with animation
                        setShowSuccessMessage(true);

                        Animated.sequence([
                            Animated.spring(successToastAnim, {
                                toValue: 1,
                                tension: 80,
                                friction: 12,
                                useNativeDriver: true,
                            }),
                            Animated.delay(2500),
                            Animated.timing(successToastAnim, {
                                toValue: 0,
                                duration: 300,
                                useNativeDriver: true,
                            }),
                        ]).start(() => {
                            setShowSuccessMessage(false);
                        });

                    } catch { Alert.alert("Error", "Failed to save intervals."); }
                }}
            />


            <MileageUpdateModal
                visible={showMileageUpdateModal}
                onClose={() => setShowMileageUpdateModal(false)}
                car={car}
                onSave={async (newMileage: number) => {
                    if (!me || !id) return;
                    try {
                        await updateDoc(doc(db, "garages", me.uid, "cars", id), {
                            currentMileage: newMileage,
                            updatedAt: serverTimestamp(),
                        });
                        const updatedCar = { ...car!, currentMileage: newMileage };
                        setCar(updatedCar);

                        // CHECK FOR NOTIFICATIONS HERE!
                        if (me) {
                            await checkAndScheduleNotifications(updatedCar as any, me.uid);
                        }
                        setShowMileageUpdateModal(false);
                    } catch { Alert.alert("Error", "Failed to update mileage."); }
                }}
            />

            <Modal visible={showPartsHelpModal} transparent animationType="fade">
                <BlurView intensity={20} style={s.modalOverlay}>
                    <View style={s.modalCard}>
                        <View style={s.modalHeader}>
                            <Ionicons name="help-circle" size={24} color={C.accent} />
                            <Text style={s.modalTitle}>Parts Tab Guide</Text>
                            <TouchableOpacity onPress={() => setShowPartsHelpModal(false)} style={s.modalClose}>
                                <Ionicons name="close" size={24} color={C.muted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ maxHeight: 400 }}>
                            <View style={{ gap: 16 }}>
                                <View>
                                    <Text style={s.helpSectionTitle}>What is the Parts Tab?</Text>
                                    <Text style={s.helpText}>
                                        Track aftermarket parts, upgrades, spare components, and wishlist items all in one organized place.
                                    </Text>
                                </View>

                                <View>
                                    <Text style={s.helpSectionTitle}>Wishlist vs Owned Parts</Text>
                                    <Text style={s.helpText}>
                                        Toggle "Add to Wishlist" when adding parts to save items you want to buy later. When you purchase them, tap the cart icon to move them to your owned parts.
                                    </Text>
                                </View>

                                <View>
                                    <Text style={s.helpSectionTitle}>Store Links</Text>
                                    <Text style={s.helpText}>
                                        Add store links to wishlist items so you can easily find where to buy them. Tap the blue link icon to open the product page.
                                    </Text>
                                </View>

                                <View>
                                    <Text style={s.helpSectionTitle}>Pending vs Installed</Text>
                                    <Text style={s.helpText}>
                                        Owned parts start as "Pending". Tap the checkbox to mark them as "Installed" when you've completed the installation.
                                    </Text>
                                </View>

                                <View>
                                    <Text style={s.helpSectionTitle}>Investment Tracking</Text>
                                    <Text style={s.helpText}>
                                        See the total value of wishlist items, pending installs, and installed parts to track your car's modification costs.
                                    </Text>
                                </View>

                                <View>
                                    <Text style={s.helpSectionTitle}>Managing Parts</Text>
                                    <Text style={s.helpText}>
                                        Use the edit button to update details, the link button to visit store pages, or the trash button to remove items.
                                    </Text>
                                </View>
                            </View>
                        </ScrollView>

                        <TouchableOpacity
                            onPress={() => setShowPartsHelpModal(false)}
                            style={[s.modalBtn, { marginTop: 16 }]}
                        >
                            <Text style={s.modalBtnTxt}>Got it!</Text>
                        </TouchableOpacity>
                    </View>
                </BlurView>
            </Modal>



            <Modal visible={showMaintenanceHelpModal} transparent animationType="fade">
                <BlurView intensity={20} style={s.modalOverlay}>
                    <View style={s.modalCard}>
                        <View style={s.modalHeader}>
                            <Ionicons name="help-circle" size={24} color={C.accent} />
                            <Text style={s.modalTitle}>How It Works</Text>
                            <TouchableOpacity onPress={() => setShowMaintenanceHelpModal(false)} style={s.modalClose}>
                                <Ionicons name="close" size={24} color={C.muted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ maxHeight: 400 }}>
                            <View style={{ gap: 16 }}>
                                <View>
                                    <Text style={s.helpSectionTitle}>Update Your Mileage</Text>
                                    <Text style={s.helpText}>
                                        Keep your current mileage up to date so the app can track when services are due.
                                    </Text>
                                </View>

                                <View>
                                    <Text style={s.helpSectionTitle}>Customize Intervals</Text>
                                    <Text style={s.helpText}>
                                        Tap the settings icon to set maintenance intervals based on your car's manual or mechanic recommendations.
                                    </Text>
                                </View>

                                <View>
                                    <Text style={s.helpSectionTitle}>Get Reminders</Text>
                                    <Text style={s.helpText}>
                                        The app will notify you when services are due soon or overdue based on your mileage.
                                    </Text>
                                </View>

                                <View>
                                    <Text style={s.helpSectionTitle}>Mark as Done</Text>
                                    <Text style={s.helpText}>
                                        When you complete a service, tap the "Done" button to reset the counter to your current mileage.
                                    </Text>
                                </View>

                                <View>
                                    <Text style={s.helpSectionTitle}>Track History</Text>
                                    <Text style={s.helpText}>
                                        Use "Add" in Maintenance History to keep detailed records of all work done on your car.
                                    </Text>
                                </View>
                            </View>
                        </ScrollView>

                        <TouchableOpacity
                            onPress={() => setShowMaintenanceHelpModal(false)}
                            style={[s.modalBtn, { marginTop: 16 }]}
                        >
                            <Text style={s.modalBtnTxt}>Got it!</Text>
                        </TouchableOpacity>
                    </View>
                </BlurView>
            </Modal>

            {
                showSuccessMessage && (
                    <Animated.View
                        style={[
                            s.successToast,
                            {
                                opacity: successToastAnim,
                                transform: [
                                    {
                                        translateY: successToastAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [-100, 0],
                                        }),
                                    },
                                    {
                                        scale: successToastAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0.8, 1],
                                        }),
                                    },
                                ],
                            },
                        ]}
                    >
                        <Ionicons name="checkmark-circle" size={24} color={C.good} />
                        <View style={{ flex: 1 }}>
                            <Text style={s.successTitle}>Saved</Text>
                            <Text style={s.successDesc}>Maintenance intervals updated successfully</Text>
                        </View>
                    </Animated.View>
                )
            }
        </SafeAreaView >
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

function PartModal({ visible, onClose, onSave, editing, presetWishlist }: {
    visible: boolean;
    onClose: () => void;
    onSave: (data: PartData & { isWishlist?: boolean; storeLink?: string | null }) => void;
    editing: Part | null;
    presetWishlist: boolean;
}) {
    const [name, setName] = useState("");
    const [brand, setBrand] = useState("");
    const [price, setPrice] = useState("");
    const [storeLink, setStoreLink] = useState("");
    const [isWishlist, setIsWishlist] = useState(false);

    useEffect(() => {
        if (editing) {
            setName(editing.name);
            setBrand(editing.brand || "");
            setPrice(editing.price?.toString() || "");
            setStoreLink(editing.storeLink || "");
            setIsWishlist(editing.isWishlist || false);
        } else {
            setName("");
            setBrand("");
            setPrice("");
            setStoreLink("");
            setIsWishlist(presetWishlist);
        }
    }, [editing, visible, presetWishlist]);

    const handleClose = () => {
        setName("");
        setBrand("");
        setPrice("");
        setStoreLink("");
        setIsWishlist(false);
        onClose();
    };

    const handleSave = () => {
        if (!name.trim()) {
            Alert.alert("Missing Info", "Part name is required.");
            return;
        }
        onSave({
            name: name.trim(),
            brand: brand.trim() || null,
            price: price ? parseFloat(price) : null,
            storeLink: storeLink.trim() || null,
            isWishlist,
        });
    };

    return (
        <Modal visible={visible} transparent animationType="fade">
            <BlurView intensity={20} style={s.modalOverlay}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={{ flex: 1, justifyContent: "center", paddingHorizontal: 20 }}
                    keyboardVerticalOffset={-50}
                >
                    <View style={[s.modalCard, { maxHeight: '85%' }]}>
                        {/* HEADER */}
                        <View style={s.modalHeader}>
                            <Ionicons name={isWishlist ? "heart" : "settings-outline"} size={24} color={isWishlist ? "#E91E63" : C.accent} />
                            <Text style={s.modalTitle}>{editing ? "Edit" : "Add"} Part</Text>
                            <TouchableOpacity onPress={handleClose} style={s.modalClose}>
                                <Ionicons name="close" size={24} color={C.muted} />
                            </TouchableOpacity>
                        </View>

                        {/* SCROLLABLE CONTENT */}
                        <ScrollView
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            <TouchableOpacity
                                onPress={() => setIsWishlist(!isWishlist)}
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    marginBottom: 16,
                                    paddingVertical: 16,
                                    paddingHorizontal: isWishlist ? 50 : 65, // MORE SPACE WHEN CHECKED
                                    backgroundColor: isWishlist ? "#E91E63" + "10" : C.dim,
                                    borderRadius: 14,
                                    borderWidth: 2,
                                    borderColor: isWishlist ? "#E91E63" : C.line,
                                    position: "relative",
                                }}
                                activeOpacity={0.7}
                            >
                                <Ionicons name={isWishlist ? "heart" : "heart-outline"} size={24} color={isWishlist ? "#E91E63" : C.muted} />
                                <Text style={{ color: C.text, fontWeight: "700", fontSize: 16, marginLeft: 8 }}>
                                    Add to Wishlist
                                </Text>
                                {isWishlist && (
                                    <Ionicons name="checkmark-circle" size={28} color="#E91E63" style={{ position: "absolute", right: 16 }} />
                                )}
                            </TouchableOpacity>

                            <TextInput
                                style={[s.modalInput, { marginBottom: 12 }]}
                                placeholder="Part Name"
                                placeholderTextColor={C.muted}
                                value={name}
                                onChangeText={setName}
                            />

                            <TextInput
                                style={[s.modalInput, { marginBottom: 12 }]}
                                placeholder="Brand (optional)"
                                placeholderTextColor={C.muted}
                                value={brand}
                                onChangeText={setBrand}
                            />

                            <TextInput
                                style={[s.modalInput, { marginBottom: 12 }]}
                                placeholder="Price (optional)"
                                placeholderTextColor={C.muted}
                                value={price}
                                onChangeText={setPrice}
                                keyboardType="decimal-pad"
                            />

                            <TextInput
                                style={[s.modalInput, { marginBottom: 16 }]}
                                placeholder="Store Link (optional)"
                                placeholderTextColor={C.muted}
                                value={storeLink}
                                onChangeText={setStoreLink}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </ScrollView>

                        {/* SAVE BUTTON - STAYS AT BOTTOM */}
                        <TouchableOpacity
                            onPress={handleSave}
                            style={[
                                s.modalBtn,
                                isWishlist && { backgroundColor: "#E91E63" },
                                { marginTop: 16 }
                            ]}
                        >
                            <Text style={s.modalBtnTxt}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
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
/*this is new aswel*/
function MileageUpdateModal({ visible, onClose, onSave, car }: {
    visible: boolean;
    onClose: () => void;
    onSave: (mileage: number) => void;
    car: Car | null;
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
    };

    return (
        <Modal visible={visible} transparent animationType="fade">
            <BlurView intensity={20} style={s.modalOverlay}>
                <View style={s.modalCard}>
                    <View style={s.modalHeader}>
                        <Ionicons name="speedometer" size={24} color={C.accent} />
                        <Text style={s.modalTitle}>Update Mileage</Text>
                        <TouchableOpacity onPress={onClose} style={s.modalClose}>
                            <Ionicons name="close" size={24} color={C.muted} />
                        </TouchableOpacity>
                    </View>

                    <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>
                        Enter your current odometer reading
                    </Text>

                    <TextInput
                        style={s.modalInput}
                        placeholder="Current Mileage"
                        placeholderTextColor={C.muted}
                        value={mileage}
                        onChangeText={setMileage}
                        keyboardType="number-pad"
                    />

                    <TouchableOpacity onPress={handleSave} style={s.modalBtn}>
                        <Text style={s.modalBtnTxt}>Update</Text>
                    </TouchableOpacity>
                </View>
            </BlurView>
        </Modal>
    );
}

/*THIS IS NEW*/
function ReminderSettingsModal({ visible, onClose, car, onSave }: {
    visible: boolean;
    onClose: () => void;
    car: Car | null;
    onSave: (intervals: any) => void;
}) {
    const [intervals, setIntervals] = useState({
        oilChange: car?.oilChangeInterval || DEFAULT_INTERVALS.oilChange,
        tireRotation: car?.tireRotationInterval || DEFAULT_INTERVALS.tireRotation,
        airFilter: car?.airFilterInterval || DEFAULT_INTERVALS.airFilter,
        cabinFilter: car?.cabinFilterInterval || DEFAULT_INTERVALS.cabinFilter,
        coolantFlush: car?.coolantFlushInterval || DEFAULT_INTERVALS.coolantFlush,
        sparkPlug: car?.sparkPlugInterval || DEFAULT_INTERVALS.sparkPlug,
        brakeInspection: car?.brakeInspectionInterval || DEFAULT_INTERVALS.brakeInspection,
        brakeFluid: car?.brakeFluidInterval || DEFAULT_INTERVALS.brakeFluid,
        transmissionService: car?.transmissionServiceInterval || DEFAULT_INTERVALS.transmissionService,
        differentialService: car?.differentialServiceInterval || DEFAULT_INTERVALS.differentialService,
    });

    useEffect(() => {
        if (car) {
            setIntervals({
                oilChange: car.oilChangeInterval || DEFAULT_INTERVALS.oilChange,
                tireRotation: car.tireRotationInterval || DEFAULT_INTERVALS.tireRotation,
                airFilter: car.airFilterInterval || DEFAULT_INTERVALS.airFilter,
                cabinFilter: car.cabinFilterInterval || DEFAULT_INTERVALS.cabinFilter,
                coolantFlush: car.coolantFlushInterval || DEFAULT_INTERVALS.coolantFlush,
                sparkPlug: car.sparkPlugInterval || DEFAULT_INTERVALS.sparkPlug,
                brakeInspection: car.brakeInspectionInterval || DEFAULT_INTERVALS.brakeInspection,
                brakeFluid: car.brakeFluidInterval || DEFAULT_INTERVALS.brakeFluid,
                transmissionService: car.transmissionServiceInterval || DEFAULT_INTERVALS.transmissionService,
                differentialService: car.differentialServiceInterval || DEFAULT_INTERVALS.differentialService,
            });
        }
    }, [car, visible]);

    const services = [
        { key: 'oilChange', name: 'Oil Change', icon: 'water-outline', color: '#3b82f6' },
        { key: 'tireRotation', name: 'Tire Rotation', icon: 'repeat-outline', color: '#8b5cf6' },
        { key: 'airFilter', name: 'Air Filter', icon: 'leaf-outline', color: '#10b981' },
        { key: 'cabinFilter', name: 'Cabin Filter', icon: 'snow-outline', color: '#06b6d4' },
        { key: 'coolantFlush', name: 'Coolant Flush', icon: 'thermometer-outline', color: '#f59e0b' },
        { key: 'sparkPlug', name: 'Spark Plugs', icon: 'flash-outline', color: '#eab308' },
        { key: 'brakeInspection', name: 'Brake Inspection', icon: 'hand-left-outline', color: '#ef4444' },
        { key: 'brakeFluid', name: 'Brake Fluid', icon: 'water-outline', color: '#dc2626' },
        { key: 'transmissionService', name: 'Transmission Service', icon: 'settings-outline', color: '#6366f1' },
        { key: 'differentialService', name: 'Differential Service', icon: 'cog-outline', color: '#8b5cf6' },
    ];

    const handleSave = () => {
        onSave({
            oilChangeInterval: intervals.oilChange,
            tireRotationInterval: intervals.tireRotation,
            airFilterInterval: intervals.airFilter,
            cabinFilterInterval: intervals.cabinFilter,
            coolantFlushInterval: intervals.coolantFlush,
            sparkPlugInterval: intervals.sparkPlug,
            brakeInspectionInterval: intervals.brakeInspection,
            brakeFluidInterval: intervals.brakeFluid,
            transmissionServiceInterval: intervals.transmissionService,
            differentialServiceInterval: intervals.differentialService,
        });
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
            <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <View style={s.reminderModal}>
                        {/* Header */}
                        <View style={s.reminderModalHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={[s.reminderHeaderIcon, { backgroundColor: C.accent + '20' }]}>
                                    <Ionicons name="settings" size={24} color={C.accent} />
                                </View>
                                <View>
                                    <Text style={s.reminderModalTitle}>Service Intervals</Text>
                                    <Text style={s.reminderModalSubtitle}>Customize maintenance reminders</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={onClose} style={s.reminderCloseBtn}>
                                <Ionicons name="close" size={24} color={C.muted} />
                            </TouchableOpacity>
                        </View>

                        {/* Services List */}
                        <ScrollView
                            style={s.reminderModalScroll}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="interactive"
                        >
                            <View style={{ padding: 20, gap: 12 }}>
                                {services.map((service) => (
                                    <View key={service.key} style={s.intervalCard}>
                                        <View style={s.intervalCardLeft}>
                                            <View style={[s.intervalIcon, { backgroundColor: service.color + '20' }]}>
                                                <Ionicons name={service.icon as any} size={20} color={service.color} />
                                            </View>
                                            <Text style={s.intervalName}>{service.name}</Text>
                                        </View>
                                        <View style={s.intervalInputWrapper}>
                                            <TextInput
                                                style={s.intervalInput}
                                                value={intervals[service.key as keyof typeof intervals].toString()}
                                                onChangeText={(text) => {
                                                    const num = parseInt(text) || 0;
                                                    setIntervals({ ...intervals, [service.key]: num });
                                                }}
                                                keyboardType="number-pad"
                                                placeholder="0"
                                                placeholderTextColor={C.muted}
                                            />
                                            <Text style={s.intervalUnit}>mi</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </ScrollView>

                        {/* Footer Actions */}
                        <View style={s.reminderModalFooter}>
                            <TouchableOpacity
                                onPress={onClose}
                                style={s.reminderCancelBtn}
                                activeOpacity={0.8}
                            >
                                <Text style={s.reminderCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleSave}
                                style={s.reminderSaveBtn}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="checkmark" size={20} color="#fff" />
                                <Text style={s.reminderSaveText}>Save Changes</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
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

function StatusChip({ icon, label, value, onPress }: {
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

function DocumentItem({ document, onDelete, onEdit, onUpload }: {
    document: Document;
    onDelete: (id: string) => void;
    onEdit: () => void;
    onUpload?: (id: string) => void;
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
                {document.fileName && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                        <Ionicons name="document-attach" size={12} color={C.good} />
                        <Text style={[s.docMeta, { color: C.good }]}>{document.fileName}</Text>
                    </View>
                )}
                {document.notes && <Text style={s.docNotes}>{document.notes}</Text>}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
                {document.fileURL ? (
                    <TouchableOpacity
                        onPress={() => Linking.openURL(document.fileURL!)}
                        style={[s.iconBtn, { backgroundColor: C.good + "20" }]}
                    >
                        <Ionicons name="eye" size={16} color={C.good} />
                    </TouchableOpacity>
                ) : onUpload ? (
                    <TouchableOpacity
                        onPress={() => onUpload(document.id)}
                        style={[s.iconBtn, { backgroundColor: C.accent + "20" }]}
                    >
                        <Ionicons name="cloud-upload" size={16} color={C.accent} />
                    </TouchableOpacity>
                ) : null}
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
        padding: 28,
        gap: 16,
        borderWidth: 1,
        borderColor: C.line,
    },
    modalHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 0,
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
        borderRadius: 14,
        padding: 18,
        color: C.text,
        fontSize: 18,
        fontWeight: "700",
        minHeight: 60,
    },
    modalBtn: {
        backgroundColor: C.accent,
        borderRadius: 14,
        paddingVertical: 16,
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
    reminderItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 12,
        backgroundColor: C.dim,
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 12,
    },
    reminderIconBox: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: C.warn + "20",
        alignItems: "center",
        justifyContent: "center",
    },
    reminderTitle: {
        color: C.text,
        fontWeight: "800",
        fontSize: 14,
    },
    reminderDesc: {
        color: C.muted,
        fontSize: 12,
        marginTop: 2,
    },
    reminderMeta: {
        color: C.muted,
        fontSize: 11,
        marginTop: 2,
    },
    intervalInputGroup: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
        backgroundColor: C.dim,
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 12,
        padding: 12,
    },
    intervalLabel: {
        flex: 1,
        color: C.text,
        fontWeight: "600",
        fontSize: 13,
    },
    intervalUnit: {
        color: C.muted,
        fontSize: 12,
        fontWeight: "600",
    },
    successToast: {
        position: "absolute",
        top: 60,
        left: 16,
        right: 16,
        backgroundColor: C.panel,
        borderWidth: 2,
        borderColor: C.good,
        borderRadius: 16,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    successTitle: {
        color: C.good,
        fontSize: 16,
        fontWeight: "900",
    },
    successDesc: {
        color: C.muted,
        fontSize: 13,
        marginTop: 2,
    },

    // SERVICE REMINDERS STYLES
    serviceReminderCard: {
        backgroundColor: C.dim,
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 12,
        padding: 14,
        gap: 10,
    },
    serviceReminderHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    serviceIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
    },
    serviceTitle: {
        color: C.text,
        fontSize: 16,
        fontWeight: "800",
    },
    serviceMileage: {
        color: C.muted,
        fontSize: 13,
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusBadgeText: {
        fontSize: 10,
        fontWeight: "900",
        textTransform: "uppercase",
    },
    serviceReminderFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: C.line,
    },
    nextDueText: {
        color: C.muted,
        fontSize: 12,
        fontWeight: "600",
    },
    remainingText: {
        fontSize: 13,
        fontWeight: "800",
    },

    // NEW STYLES FOR ENHANCED SERVICE REMINDERS UI
    settingsIconBtn: {
        padding: 6,
        borderRadius: 8,
        backgroundColor: C.dim,
        borderWidth: 1,
        borderColor: C.line,
    },

    emptyStateContainer: {
        alignItems: "center",
        paddingVertical: 32,
        gap: 12,
    },

    emptyStateTitle: {
        color: C.text,
        fontSize: 16,
        fontWeight: "800",
        marginTop: 8,
    },

    carPhoto: {
        width: "100%",
        height: 200,
        borderRadius: 12,
    },

    emptyStateDesc: {
        color: C.muted,
        fontSize: 13,
        textAlign: "center",
        lineHeight: 18,
        maxWidth: "80%",
    },

    emptyStateCTA: {
        marginTop: 8,
        backgroundColor: C.accent,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },

    emptyStateCTAText: {
        color: "#fff",
        fontWeight: "800",
        fontSize: 14,
    },

    reminderStatsRow: {
        flexDirection: "row",
        marginTop: 12,
        gap: 8,
    },

    reminderStat: {
        flex: 1,
        backgroundColor: C.dim,
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 12,
        padding: 12,
        alignItems: "center",
        gap: 4,
    },

    reminderStatValue: {
        color: C.accent,
        fontSize: 24,
        fontWeight: "900",
    },

    reminderStatLabel: {
        color: C.muted,
        fontSize: 11,
        fontWeight: "600",
        textTransform: "uppercase",
    },

    markDoneBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: C.good,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        marginLeft: 8,
    },

    markDoneTxt: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "800",
    },

    helpSectionTitle: {
        color: C.text,
        fontSize: 15,
        fontWeight: "800",
        marginBottom: 6,
    },
    helpText: {
        color: C.muted,
        fontSize: 13,
        lineHeight: 20,
    },

    // ALERTS SUMMARY CARD STYLES
    alertsSummaryCard: {
        backgroundColor: C.accent + "15",
        borderWidth: 2,
        borderColor: C.accent + "40",
        borderRadius: 16,
        padding: 16,
        marginTop: 12,
    },
    alertCategoryTitle: {
        color: C.text,
        fontSize: 14,
        fontWeight: "800",
        marginBottom: 8,
    },
    alertServiceRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 6,
        paddingHorizontal: 8,
        backgroundColor: C.bg + "60",
        borderRadius: 8,
        marginBottom: 4,
    },
    alertServiceName: {
        color: C.text,
        fontSize: 13,
        fontWeight: "700",
    },
    alertServiceMiles: {
        fontSize: 12,
        fontWeight: "800",
    },

    // 🔥 NEW PARTS TAB STYLES - ADD THESE 🔥
    partCardEnhanced: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        backgroundColor: C.dim,
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 12,
    },
    partCheckbox: {
        padding: 2,
    },
    partCheckboxInner: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 2,
        alignItems: "center",
        justifyContent: "center",
    },
    partNameEnhanced: {
        color: C.text,
        fontSize: 15,
        fontWeight: "800",
    },
    partBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: C.bg,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: C.line,
    },


    serviceCard: {
        backgroundColor: C.panel,
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 16,
        padding: 16,
        gap: 12,
    },
    serviceHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    serviceIconWrapper: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    serviceName: {
        color: C.text,
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    serviceSubtext: {
        color: C.muted,
        fontSize: 13,
        marginTop: 2,
    },
    serviceDetails: {
        backgroundColor: C.dim,
        borderRadius: 12,
        padding: 12,
        gap: 8,
    },
    serviceDetailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    serviceDetailLabel: {
        color: C.muted,
        fontSize: 13,
        fontWeight: '600',
    },
    serviceDetailValue: {
        color: C.text,
        fontSize: 14,
        fontWeight: '700',
    },
    justDidThisBtn: {
        backgroundColor: C.good,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    justDidThisBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '800',
    },

    partBadgeText: {
        color: C.muted,
        fontSize: 11,
        fontWeight: "700",
    },
    partActionBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: C.bg,
        borderWidth: 1,
        borderColor: C.line,
        alignItems: "center",
        justifyContent: "center",
    },
    floatingAddBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: C.accent,
        marginHorizontal: 12,
        marginTop: 12,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 14,
        justifyContent: "center",
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },


    reminderModal: {
        flex: 1,
        backgroundColor: C.bg,
        paddingTop: 35,
    },
    reminderModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        paddingBottom: 16,
        borderBottomWidth: 0,
        backgroundColor: C.bg,
    },
    reminderHeaderIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    reminderModalTitle: {
        color: C.text,
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    reminderModalSubtitle: {
        color: C.muted,
        fontSize: 13,
        marginTop: 2,
    },
    reminderCloseBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: C.dim,
        alignItems: 'center',
        justifyContent: 'center',
    },
    reminderModalScroll: {
        flex: 1,
    },
    intervalCard: {
        backgroundColor: C.panel,
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    intervalCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    intervalIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    intervalName: {
        color: C.text,
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.3,
    },
    intervalInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: C.dim,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: C.line,
    },
    intervalInput: {
        color: C.text,
        fontSize: 16,
        fontWeight: '800',
        minWidth: 60,
        textAlign: 'right',
    },
    reminderModalFooter: {
        flexDirection: 'row',
        gap: 12,
        padding: 20,
        paddingTop: 16,
        borderTopWidth: 0,
        backgroundColor: C.bg,
    },
    reminderCancelBtn: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 14,
        backgroundColor: C.dim,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: C.line,
    },
    reminderCancelText: {
        color: C.text,
        fontSize: 16,
        fontWeight: '700',
    },
    reminderSaveBtn: {
        flex: 2,
        paddingVertical: 16,
        borderRadius: 14,
        backgroundColor: C.accent,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    reminderSaveText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
    },
});