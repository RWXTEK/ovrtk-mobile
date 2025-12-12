import { useEffect, useRef, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList,
  Keyboard, Platform, Modal, Pressable, Share, Animated, Easing, Dimensions, Alert, Clipboard, Image, PanResponder, ActivityIndicator
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from 'expo-image-picker';
import { getUserTier } from "../../../lib/revenuecat";
import {
  canUploadImage,
  incrementImageCount,
  getMonthlyImageCount
} from "../../../lib/imageTracking";
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import SoundRecorder from '../../../components/SoundRecorder';
import { canRecordSound, getSoundAnalysisCount, incrementSoundAnalysisCount, getMaxRecordingDuration, type SoundTier } from '../../../lib/soundAnalysis';
import { uploadAudioToStorage } from '../../../lib/audioAnalysis';
import { decodeVIN, extractVIN, formatVINResponse, isValidVIN } from '../../../lib/vinDecoder';
import { canDecodeVIN, incrementVINDecodeCount, formatVINUsageMessage, type VINTier } from '../../../lib/vinTracking';
import VinScanner from './VinScanner';  // Adjust path if needed
import { canSendMessage, incrementMessageCount, getMessageCount } from '../../../lib/messageTracking';
import Paywall from '../../../components/Paywall';
import SoundLocationPicker from '../../../components/SoundLocationPicker';



// haptics (optional)
let Haptics: any = null;
try { Haptics = require("expo-haptics"); } catch { }

import { sendPushNotification } from "../../../utils/notifications";


// Firebase
import { onAuthStateChanged, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions, storage } from "../../../lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

// RevenueCat
import Purchases, { CustomerInfo } from "react-native-purchases";


/* ---------- Theme ---------- */
const C = {
  // Backgrounds
  bg: "#0A0A0F",
  surface: "#14151A",
  panel: "#1A1B21",
  glass: "rgba(18,19,24,0.92)",

  // Borders
  line: "#25262E",
  lineLight: "#2A2B33",

  // Text
  text: "#FFFFFF",
  textSecondary: "#A0A0A8",
  textTertiary: "#6B6B73",
  muted: "#A6ADBB",

  // Brand
  accent: "#FF3B30",
  accentDark: "#D32D24",
  accentGlow: "rgba(255, 59, 48, 0.15)",

  // Status
  good: "#30D158",
  warn: "#FFD60A",
  error: "#FF453A",

  // Tiers (STOPLIGHT THEME)
  tierFree: "#6B6B73",      // Gray
  tierPlus: "#30D158",      // 🟢 GREEN
  tierTrack: "#FFD60A",     // 🟡 YELLOW  
  tierClub: "#FF3B30",      // 🔴 RED
};

/* ---------- Spacing ---------- */
const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};

/* ---------- RC Entitlement ---------- */
const ENTITLEMENT_ID = (process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID || "pro_uploads").trim();

/* ---------- Chat Quota ---------- */
const DAILY_CHAT_LIMIT = 10;
const STORAGE_CHAT_QUOTA = "@ovrtk/scotty.chat.quota";

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
const STORAGE_CHATS = (userId: string) => `@ovrtk/scotty.chats.${userId}.v3`;
const STORAGE_CHAT = (userId: string, chatId: string) => `@ovrtk/scotty.chat.${userId}.${chatId}.v1`;

async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}
async function saveJSON(key: string, val: any) {
  try { await AsyncStorage.setItem(key, JSON.stringify(val)); } catch { }
}

/* ---------- Chat Quota ---------- */
const CHAT_LIMIT = 10; // Total free questions EVER
const STORAGE_CHAT_COUNT = "@ovrtk/scotty.chat.count";


/* ---------- Chat Count Helpers ---------- */
async function getChatCount(): Promise<{ count: number; blocked: boolean }> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_CHAT_COUNT);
    const count = raw ? parseInt(raw) : 0;
    return { count, blocked: count >= CHAT_LIMIT };
  } catch {
    return { count: 0, blocked: false };
  }

}

async function incrementChatCount(): Promise<{ count: number; blocked: boolean }> {
  const current = await getChatCount();
  const next = current.count + 1;
  await AsyncStorage.setItem(STORAGE_CHAT_COUNT, String(next));
  return { count: next, blocked: next >= CHAT_LIMIT };
}


/* ---------- Image Upload Helpers ---------- */
async function uploadImageToStorage(userId: string, uri: string): Promise<string> {
  try {
    // REMOVED: const { ref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');

    // Compress image
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );

    // Fetch the image as blob
    const response = await fetch(manipResult.uri);
    const blob = await response.blob();

    // Upload to Firebase Storage
    const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const storageRef = ref(storage, `scotty-images/${userId}/${filename}`);

    // Upload the blob
    await uploadBytesResumable(storageRef, blob, {
      contentType: 'image/jpeg',
    });

    // Get download URL
    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (error) {
    console.error('[Scotty] Image upload failed:', error);
    throw error;
  }
}


/* ---------- Screen ---------- */
export default function Scotty() {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<User | null>(null);

  // chat state
  const [msg, setMsg] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [items, setItems] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [typingText, setTypingText] = useState("");
  const [isTypingEffect, setIsTypingEffect] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Add this near your other handlers
  const closeSoundRecorder = () => {
    setShowSoundRecorder(false);
    setPendingAudioUri(null);
    setShowLocationPicker(false);
    setIsAnalyzing(false);
  };

  // drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerX = useRef(new Animated.Value(0)).current;

  // bottom sheet menu
  const [toolMenuVisible, setToolMenuVisible] = useState(false);


  // VIN scanner
  const [vinScannerVisible, setVinScannerVisible] = useState(false);

  // chats
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);

  // drawer filters
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState<Tag | "All">("All");

  // layout
  const MIN_INPUT_HEIGHT = 52;
  const MAX_INPUT_HEIGHT = 160;
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const TAB_BAR_H = 76;

  // keyboard
  const GAP_WHEN_KB = 34;
  const GAP_WHEN_NO_KB = -3;
  const [kbVisible, setKbVisible] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  // Paywall state
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState<'messages' | 'vin' | 'image' | 'sound'>('messages');
  const [currentMessageCount, setCurrentMessageCount] = useState(0);
  const [messageLimit, setMessageLimit] = useState(1);

  const bottomOffset = kbVisible
    ? kbHeight  // Full keyboard height
    : insets.bottom + 38; // Simple padding when hidden

  const dynamicDockHeight = Math.max(65, inputHeight + 20);
  const listBottomPad = kbVisible
    ? kbHeight + dynamicDockHeight + 80  // When keyboard is open (increased from 30 to 80)
    : insets.bottom + dynamicDockHeight + TAB_BAR_H + 120; // When keyboard is closed (increased from 55 to 120)

  /* ---------- Rename modal state ---------- */
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);

  /* ---------- Monetization state ---------- */
  const [hasPro, setHasPro] = useState(false); // ← ADD THIS LINE
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [showSoundRecorder, setShowSoundRecorder] = useState(false);
  const [soundAnalysisCount, setSoundAnalysisCount] = useState(0);
  const [soundAnalysisLimit, setSoundAnalysisLimit] = useState(0);
  const [vinDecodeCount, setVinDecodeCount] = useState(0);
  const [vinDecodeLimit, setVinDecodeLimit] = useState(0);
  const [chatQuotaCount, setChatQuotaCount] = useState(0);
  const [chatQuotaBlocked, setChatQuotaBlocked] = useState(false);
  const [paywallCurrentUsage, setPaywallCurrentUsage] = useState(0);
  const [paywallLimit, setPaywallLimit] = useState(0);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [pendingAudioUri, setPendingAudioUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);



  const [userTier, setUserTier] = useState<'FREE' | 'PLUS' | 'TRACK_MODE' | 'CLUB'>("FREE");
  const [imageCount, setImageCount] = useState(0);
  const [imageLimit, setImageLimit] = useState(0);
  const [messageCount, setMessageCount] = useState(0);

  /* ---------- Auth ---------- */
  useEffect(() => onAuthStateChanged(auth, setMe), []);

  useEffect(() => {
    if (me?.uid) {
      loadUserStatus();
    }
  }, [me?.uid]);

  async function loadUserStatus() {
    if (!me?.uid) {
      console.log('🔥 No user, skipping status load');
      return;
    }

    try {
      const tier = await getUserTier();
      console.log('🔥 USER TIER:', tier);

      // Map tier to correct type
      const mappedTier = mapToUserTier(tier);
      setUserTier(mappedTier);

      // Load message usage
      const messageUsage = await canSendMessage(mappedTier);
      console.log('🔥 MESSAGE USAGE:', messageUsage);
      setMessageCount(messageUsage.currentCount);
      setMessageLimit(messageUsage.limit);

      const usage = await canUploadImage();
      console.log('🔥 IMAGE USAGE:', usage);
      setImageCount(usage.currentCount);
      setImageLimit(usage.limit);

      // Load sound analysis usage
      const soundTier = mapToSoundTier(mappedTier);
      console.log('🔥 SOUND TIER:', soundTier);
      const soundUsage = await canRecordSound(soundTier);
      console.log('🔥 SOUND USAGE:', soundUsage);
      setSoundAnalysisCount(soundUsage.currentCount);
      setSoundAnalysisLimit(soundUsage.limit);

      // Load VIN decode usage
      const vinTier = mapToVINTier(mappedTier);
      const vinUsage = await canDecodeVIN(me.uid, vinTier);
      setVinDecodeCount(vinUsage.currentCount);
      setVinDecodeLimit(vinUsage.limit);
    } catch (error) {
      console.error("Error loading user status:", error);
    }
  }

  // Add this mapper function
  function mapToUserTier(rcTier: string): 'FREE' | 'PLUS' | 'TRACK_MODE' | 'CLUB' {
    if (rcTier === "CLUB") return "CLUB";
    if (rcTier === "TRACK_MODE") return "TRACK_MODE";
    if (rcTier === "PLUS") return "PLUS";
    return "FREE";
  }

  function mapToSoundTier(rcTier: 'FREE' | 'PLUS' | 'TRACK_MODE' | 'CLUB'): SoundTier {
    return rcTier as SoundTier;
  }

  function mapToVINTier(rcTier: 'FREE' | 'PLUS' | 'TRACK_MODE' | 'CLUB'): VINTier {
    return rcTier as VINTier;
  }

  /* ---------- Hydrate ---------- */
  useEffect(() => {
    (async () => {
      if (!me?.uid) {
        // ✅ CLEAR STATE when user logs out
        setChats([]);
        setItems([]);
        setChatId(null);
        return;
      }

      // ✅ CLEAR STATE before loading new user's data
      setChats([]);
      setItems([]);
      setChatId(null);

      const list = await loadJSON<ChatMeta[]>(STORAGE_CHATS(me.uid), []);
      setChats(list);
      if (list.length) {
        const initial = [...list].sort(sortMeta)[0];
        await selectChat(initial.id, { scroll: false });
      } else {
        const first = await createChat();
        await selectChat(first.id, { scroll: false });
      }
    })();
  }, [me?.uid]); // ← Re-run when user changes

  /* ---------- Load chat quota on mount ---------- */
  useEffect(() => {
    (async () => {
      const quota = await getChatCount(); // ← Changed
      setChatQuotaCount(quota.count);
      setChatQuotaBlocked(quota.blocked);
    })();
  }, []);

  /* ---------- CHECK FOR NEW CHAT FROM CAR DETAIL ---------- */
  useEffect(() => {
    const checkNewChat = async () => {
      try {
        const stored = await AsyncStorage.getItem("@ovrtk/scotty.newChat");
        if (!stored) return;

        const data = JSON.parse(stored);
        console.log('[Scotty] Found new chat request:', data);

        await AsyncStorage.removeItem("@ovrtk/scotty.newChat");

        const newChat = await createChat(data.title);
        await selectChat(newChat.id);

        setTimeout(() => {
          onSend(data.message);
        }, 500);
      } catch (error) {
        console.error('[Scotty] Failed to process new chat:', error);
      }
    };

    checkNewChat();

    const interval = setInterval(checkNewChat, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isTypingEffect && autoScroll) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [typingText, isTypingEffect, autoScroll]);

  useEffect(() => {
    if (!isTypingEffect && autoScroll) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [items.length, autoScroll]);



  const pickImage = async () => {
    // Check if user can upload (tier-based limits)
    const uploadCheck = await canUploadImage();

    if (!uploadCheck.canUpload) {
      setCurrentMessageCount(uploadCheck.currentCount);
      setMessageLimit(uploadCheck.limit);
      setPaywallReason('image');
      setShowPaywall(true);
      return;
    }

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission Required", "Please allow access to your photo library.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (error) {
      console.error('[Scotty] Image picker error:', error);
      Alert.alert("Error", "Failed to pick image. Please try again.");
    }
  };


  // NEW FUNCTIONS - ADD THESE:
  const openVinScanner = () => {
    setVinScannerVisible(true);
  };

  const handleVinDecoded = async (result: any) => {
    if (result.error) {
      // VIN decoded but no details
      const errorMsg = `🚗 **VIN Decoded: ${result.vin}**\n\n⚠️ ${result.error}`;
      setMsg(errorMsg);
      setTimeout(() => onSend(), 100);
    } else {
      // Success - format vehicle info
      const vinInfo = `🚗 **VIN Decoded: ${result.vin}**\n\n` +
        `📋 **Vehicle Specs:**\n` +
        `• Year: ${result.year || 'Unknown'}\n` +
        `• Make: ${result.make || 'Unknown'}\n` +
        `• Model: ${result.model || 'Unknown'}\n` +
        (result.trim ? `• Trim: ${result.trim}\n` : '') +
        (result.engine ? `• Engine: ${result.engine}\n` : '') +
        (result.transmission ? `• Transmission: ${result.transmission}\n` : '') +
        (result.bodyStyle ? `• Body: ${result.bodyStyle}\n` : '') +
        (result.doors ? `• Doors: ${result.doors}\n` : '') +
        (result.fuelType ? `• Fuel: ${result.fuelType}\n` : '');

      setMsg(vinInfo);
      setTimeout(() => onSend(), 100);
    }
  };


  const removeSelectedImage = () => {
    setSelectedImage(null);
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };



  // Sound recording handler
  const handleSoundRecording = async (audioUri: string) => {
    try {
      if (!me?.uid) {
        Alert.alert("Error", "Please sign in to use sound analysis");
        setShowSoundRecorder(false);
        return;
      }

      console.log('[Scotty] Processing sound recording:', audioUri);

      // Check tier and usage
      const soundTier = mapToSoundTier(userTier);
      const usage = await canRecordSound(soundTier);

      console.log('[Scotty] Usage check:', usage); // ← ADD THIS

      if (!usage.canRecord) {
        setShowSoundRecorder(false);
        setPaywallCurrentUsage(usage.currentCount);
        setPaywallLimit(usage.limit);
        setPaywallReason('sound');
        setShowPaywall(true);
        return;
      }

      console.log('[Scotty] About to show location picker'); // ← ADD THIS

      // Store the audio URI and show location picker
      setPendingAudioUri(audioUri);
      setShowLocationPicker(true);
      setShowSoundRecorder(false);

      console.log('[Scotty] Location picker should be visible now'); // ← ADD THIS

    } catch (error) {
      console.error('[Scotty] Sound recording failed:', error);
      setShowSoundRecorder(false);
      Alert.alert("Error", "Failed to process recording. Please try again.");
    }
  };

  // Handle location selection
  const handleLocationSelected = async (location: string) => {
    if (!pendingAudioUri || !me?.uid) return;
  
    try {
      setShowLocationPicker(false);
      setIsAnalyzing(true);
  
      console.log('[Scotty] 1. Uploading audio...');
      const audioUrl = await uploadAudioToStorage(me.uid, pendingAudioUri);
      console.log('[Scotty] 2. Audio uploaded:', audioUrl);
  
      await incrementSoundAnalysisCount();
      const soundTier = mapToSoundTier(userTier);
      const newUsage = await canRecordSound(soundTier);
      setSoundAnalysisCount(newUsage.currentCount);
  
      const carInfo = {
        make: "Unknown",
        model: "Unknown",
        year: undefined,
        mileage: undefined,
        soundLocation: location,
        userTier: userTier,
      };
      
      console.log('[Scotty] 3. Calling Firebase function with:', { audioUrl, carInfo });
      
      const result = await callSoundAnalysisFn({ audioUrl, carInfo });
  
      console.log('[Scotty] 4. Analysis result:', result);
  
      if (!result.data || !result.data.diagnosis) {
        throw new Error('Invalid response from analysis function');
      }
  
      console.log('[Scotty] 5. Diagnosis received:', result.data.diagnosis);
  
      const diagnosisMsg: Msg = {
        id: String(Date.now()),
        role: "scotty",
        text: result.data.diagnosis,
      };
  
      setItems(prev => [...prev, diagnosisMsg]);
  
      if (chatId && me?.uid) {
        const updatedMsgs = [...items, diagnosisMsg];
        await saveJSON(STORAGE_CHAT(me.uid, chatId), updatedMsgs);
        await bumpPreview("🔊 Sound Analysis");
      }
  
      // 🔥 FIX: Close EVERYTHING immediately
      setIsAnalyzing(false);
      setPendingAudioUri(null);
      setShowSoundRecorder(false);
      setShowLocationPicker(false);  // ← Add this too!
  
      // 🔥 ADD THIS: Force a small delay to ensure state updates
      await new Promise(resolve => setTimeout(resolve, 300));
  
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
  
      Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Success);
  
    } catch (error: any) {
      console.error('[Scotty] Sound analysis error details:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        fullError: error
      });
      
      // 🔥 FIX: Close EVERYTHING on error too
      setIsAnalyzing(false);
      setPendingAudioUri(null);
      setShowSoundRecorder(false);
      setShowLocationPicker(false);
      
      Alert.alert(
        "Analysis Failed",
        `Failed to analyze the sound: ${error?.message || 'Unknown error'}. Please try again.`
      );
    }
  };

  const openSoundRecorder = async () => {
    const soundTier = mapToSoundTier(userTier);
    const usage = await canRecordSound(soundTier);

    if (!usage.canRecord) {
      Alert.alert(
        soundTier === "TRACK_MODE" ? "Monthly Limit Reached" : "Upgrade Required",
        soundTier === "TRACK_MODE"
          ? `You've used all ${usage.limit} sound analyses this month.\n\nUpgrade to OVRTK Club for unlimited!`
          : "Sound analysis is available on Track Mode ($12.99) and Club ($19.99) tiers.\n\n• Track Mode: 5 analyses/month\n• Club: Unlimited analyses",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Upgrade", onPress: () => setShowPaywall(true) }
        ]
      );
      return;
    }

    // 🔥 RESET STATES BEFORE OPENING
    setPendingAudioUri(null);
    setShowLocationPicker(false);
    setIsAnalyzing(false);

    setShowSoundRecorder(true);
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium);
  };


  const scrollToBottom = () => {
    setAutoScroll(true);
    setShowScrollButton(false);

    // Force scroll to massive offset
    setTimeout(() => {
      listRef.current?.scrollToOffset({
        offset: 999999,
        animated: true
      });
    }, 100);

    // Backup scroll
    setTimeout(() => {
      listRef.current?.scrollToOffset({
        offset: 999999,
        animated: false
      });
    }, 400);
  };
  useEffect(() => { if (chatId && me?.uid) saveJSON(STORAGE_CHAT(me.uid, chatId), items); }, [chatId, items, me?.uid]);

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
    };

    Purchases.getCustomerInfo()
      .then(onUpdate)
      .catch(() => setHasPro(false));

    Purchases.addCustomerInfoUpdateListener(onUpdate);

    return () => {
      try { /* @ts-ignore */ Purchases.removeCustomerInfoUpdateListener?.(onUpdate); } catch { }
    };
  }, []);

  /* ---------- Firebase callable ---------- */
  const callScottyFn = httpsCallable<{ messages: ChatMsg[]; imageUrl?: string; userTier?: string }, { reply?: string }>(functions, "scottyChat");
  const callSoundAnalysisFn = httpsCallable<{ audioUrl: string; carInfo?: any }, { success: boolean; diagnosis: string }>(functions, "analyzeSoundWithWhisper");


  /* ---------- Chat helpers ---------- */
  const sortMeta = (a: ChatMeta, b: ChatMeta) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  };

  const seedForTitle = (t: string): Msg[] => ([
    {
      id: "hi", role: "scotty",
      text: `I'm Scotty.${t ? ` You want to talk about the ${t}?` : ""} Tell me your car + what you're going for (OEM+, track, stance, sleeper, etc).`
    }
  ]);

  const createChat = async (t?: string) => {
    if (!me?.uid) return { id: '', title: '', updatedAt: 0 }; // ✅ Safety check

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    const title = t || "New chat";

    const meta: ChatMeta = { id, title, updatedAt: now, pinned: false, tags: [], unread: 0 };
    setChats(prev => {
      const next = [meta, ...prev].sort(sortMeta);
      saveJSON(STORAGE_CHATS(me.uid), next);  // ✅ FIXED
      return next;
    });
    await saveJSON(STORAGE_CHAT(me.uid, id), seedForTitle(title));  // ✅ FIXED
    return meta;
  };

  // 🔥 ENHANCED: Smart auto-title from EVERY user message
  const autoTitleChat = async (userMessage: string) => {
    if (!chatId) return;

    const currentChat = chats.find(c => c.id === chatId);
    if (!currentChat) return;

    const msg = userMessage.toLowerCase();

    // 🚗 RWX-TEK Automotive Intelligence Dictionary

    // 🧭 Car Model / Brand Patterns
    const carPatterns = [
      // 🏁 BMW
      { regex: /\b(e30|e36|e46|e60|e90|e92|f80|f82|f87|g80|g82|m3|m4|m5|m2|m6|335i|340i|330i|320i|z4|z3|i8|alpina|x5m|x6m)\b/i, brand: "BMW" },

      // 🏎️ Mercedes-Benz
      { regex: /\b(w108|w109|w114|w115|w116|w123|w124|w126|w140|w201|190e|w202|w203|w204|w205|w206|w210|w211|w212|w213|w220|w221|w222|w223|w463|w464|g-wagen|gwagen|g-class|g55|g63|g65|c63|c43|c450|c400|c300|c200|e63|e55|e500|e53|e43|e350|e320|s63|s65|s580|s560|s500|s400|a45|a35|a250|a200|cla45|cla35|cla250|glb35|glc63|glc43|glc300|gle63|gle53|gle43|gle350|gls63|gls600|sl55|sl63|sl65|sl500|slk32|slk55|slk230|amg|black series|brabus|maybach|cls63|cls55|cls53|cls500|eqs|eqe|eqb|eqc|300sl|190sl|450sl|500sl|560sl)\b/i, brand: "Benz" },

      // 🔰 Honda / Acura
      { regex: /\b(civic|ek|eg|em1|s2000|nsx|crx|integra|dc2|dc5|type r|accord|prelude|fit|cr-z|tsx|tl|rsx|crv|del sol)\b/i, brand: "Honda" },

      // 🅿️ Toyota / Lexus / Scion
      { regex: /\b(supra|mk3|mk4|mk5|ae86|gt86|frs|fr-s|brz|celica|mr2|corolla|trueno|chaser|soarer|is300|is350|gs300|gs400|rc350|lfa|aristo|crown|yaris|camry|avalon)\b/i, brand: "Toyota" },

      // ⚡ Nissan / Infiniti / Datsun
      { regex: /\b(240sx|s13|s14|s15|350z|370z|z33|z34|r32|r33|r34|r35|gtr|gt-r|skyline|silvia|300zx|z31|z32|510|datsun|fairlady|g35|g37|q50|q60|altima|maxima)\b/i, brand: "Nissan" },

      // 🌀 Mazda
      { regex: /\b(miata|mx5|mx-5|rx7|rx-7|fd|fc|fb|rx8|rx-8|cosmo|mazdaspeed|speed3|speed6|protege)\b/i, brand: "Mazda" },

      // 🦊 Subaru
      { regex: /\b(wrx|sti|impreza|gc8|bug eye|blob eye|hawk eye|brz|legacy|forester|outback|baja)\b/i, brand: "Subaru" },

      // ⚙️ Mitsubishi
      { regex: /\b(evo|evolution|eclipse|3000gt|gto|mirage|galant vr4|starion|lancer)\b/i, brand: "Mitsu" },

      // 🇩🇪 VW / Audi
      { regex: /\b(golf|gti|r32|r36|jetta|passat|gli|rabbit|scirocco|a3|a4|a5|a6|s4|s5|rs4|rs5|rs6|r8|tt|quattro)\b/i, brand: "VAG" },

      // 🦅 Ford
      { regex: /\b(mustang|foxbody|gt350|gt500|cobra|mach 1|boss 302|focus rs|focus st|fiesta st|raptor|lightning|bronco|maverick|f150)\b/i, brand: "Ford" },

      // 🇺🇸 GM / Chevy
      { regex: /\b(corvette|c5|c6|c7|c8|camaro|z28|ss|1le|zl1|z06|chevelle|nova|impala|malibu|silverado)\b/i, brand: "Chevy" },

      // 🇺🇸 Mopar
      { regex: /\b(challenger|charger|hellcat|demon|viper|srt|srt4|srt8|durango|300c|magnum|jeep|trackhawk|ram)\b/i, brand: "Mopar" },

      // 🇮🇹 Italian Exotics
      { regex: /\b(ferrari|f40|f50|enzo|laferrari|458|488|roma|lamborghini|huracan|aventador|gallardo|murcielago|countach|alfaromeo|giulia|abarth|fiat)\b/i, brand: "Italian" },

      // 🇬🇧 British
      { regex: /\b(mclaren|570s|650s|720s|p1|aston martin|db9|db11|vantage|jaguar|f-type|mini cooper|lotus|caterham)\b/i, brand: "UK" },

      // 🇩🇪 Porsche
      { regex: /\b(911|992|991|997|996|993|964|930|carrera|gt3|gt2|boxster|cayman|718|macan|panamera|taycan)\b/i, brand: "Porsche" },

      // 🇯🇵 Suzuki / Kei
      { regex: /\b(suzuki|swift|kei|jimny|cappuccino|carry)\b/i, brand: "JDM" },

      // 🇰🇷 Korean
      { regex: /\b(hyundai|genesis|elantra|veloster|kia|stinger|optima|soul|g70|g80)\b/i, brand: "Korean" },
    ];

    // 🧩 Engine Codes, Swaps & Powertrains
    const enginePatterns = [
      { regex: /\b(2jz|1jz|7m-gte|1uz|3s-gte|4age|3sge|1gr|2gr)\b/i, brand: "Toyota Engine" },
      { regex: /\b(sr20|rb26|rb25|rb20|vq35|vq37|ka24|q45|vg30|hr|de|det)\b/i, brand: "Nissan Engine" },
      { regex: /\b(b16|b18|b20|k20|k24|h22|f22|d16|j32|j35)\b/i, brand: "Honda Engine" },
      { regex: /\b(13b|20b|26b|renesis|rotary)\b/i, brand: "Mazda Rotary" },
      { regex: /\b(4g63|4b11|6a13|3s|4b12)\b/i, brand: "Mitsu Engine" },
      { regex: /\b(ls1|ls2|ls3|ls6|lt1|lt2|lt4|lq9|lm7|5\.3|6\.2|5\.7 hemi|6\.4 hemi)\b/i, brand: "V8 Engine" },
      { regex: /\b(302|351w|coyote|mod motor|godzilla)\b/i, brand: "Ford Engine" },
      { regex: /\b(ej20|ej25|fa20|fa24|fb20|ez30|ez36)\b/i, brand: "Subaru Engine" },
      { regex: /\b(s54|s52|s50|b58|n54|n55|s85|s65)\b/i, brand: "BMW Engine" },
    ];

    // 🔧 Tuner & Aftermarket Brands
    const brandPatterns = [
      { regex: /\b(hks|greddy|apexi|trust|blitz|tomei|cusco|arc|mugen|spoon|skunk2|tanabe)\b/i, brand: "JDM Brand" },
      { regex: /\b(h&r|bilstein|kw|bc racing|teins|ohlins|airlift|accuair)\b/i, brand: "Suspension Brand" },
      { regex: /\b(brembo|stoptech|wilwood|endless|project mu)\b/i, brand: "Brake Brand" },
      { regex: /\b(volk|te37|rays|gram lights|work|meisters|bbs|enkei|advan|weds|rotiform|fifteen52|vossen|forgestar)\b/i, brand: "Wheel Brand" },
      { regex: /\b(cobb|hondata|ecutek|link ecu|haltech|motec|aem|megajolt)\b/i, brand: "Tuning / ECU Brand" },
      { regex: /\b(nismo|trd|m performance|amg|mugen|st|rs|autech)\b/i, brand: "Factory Performance Division" },
    ];

    // 🧠 Build & Topic Map
    const topicMap = [
      // Performance
      { keywords: ["turbo", "boost", "supercharger", "twin turbo", "nitrous", "forced induction"], title: "Turbo / Forced Induction" },
      { keywords: ["engine swap", "swap", "k-swap", "ls swap", "2jz", "rb26", "1jz"], title: "Engine Swap / Conversion" },
      { keywords: ["exhaust", "headers", "muffler", "downpipe", "catback"], title: "Exhaust Setup" },
      { keywords: ["intake", "filter", "throttle body", "maf", "cold air"], title: "Intake / Airflow" },
      { keywords: ["ecu", "tune", "map", "flash", "dyno", "remap"], title: "Tuning / ECU" },
      { keywords: ["fuel", "injector", "rail", "pump", "e85", "meth"], title: "Fuel System" },

      // Handling
      { keywords: ["suspension", "coilover", "spring", "damper", "shock"], title: "Suspension Setup" },
      { keywords: ["fitment", "offset", "camber", "stance", "tire", "wheel"], title: "Stance / Fitment" },
      { keywords: ["bbk", "rotor", "caliper", "pads"], title: "Brake Upgrade" },
      { keywords: ["aero", "wing", "splitter", "diffuser", "lip", "canard"], title: "Aero / Exterior Mods" },

      // Build Type
      { keywords: ["track", "autocross", "time attack"], title: "Track Build" },
      { keywords: ["drift", "angle", "tandem"], title: "Drift Build" },
      { keywords: ["drag", "quarter mile", "strip", "launch"], title: "Drag Build" },
      { keywords: ["daily", "oem+", "reliable"], title: "Daily Driver" },
      { keywords: ["show", "bagged", "static"], title: "Show Build" },
      { keywords: ["offroad", "overland", "lifted", "trail"], title: "Off-Road Build" },

      // Style
      { keywords: ["widebody", "kit", "rocket bunny", "pandem"], title: "Widebody / Body Kit" },
      { keywords: ["wrap", "paint", "vinyl", "livery"], title: "Wrap / Paintwork" },
      { keywords: ["interior", "bucket seat", "wheel", "roll cage"], title: "Interior Setup" },
      { keywords: ["led", "underglow", "headlight", "taillight"], title: "Lighting Mods" },
      { keywords: ["classic", "retro", "restomod"], title: "Classic Build" },
      { keywords: ["ev", "electric", "battery swap"], title: "EV Conversion" },

      // Community / Culture
      { keywords: ["car meet", "cars and coffee", "event", "cruise"], title: "Car Meet / Event" },
      { keywords: ["garage", "progress", "update", "build log"], title: "Project Log" },
      { keywords: ["club", "crew", "squad"], title: "Car Club / Crew" },
    ];

    // 1️⃣ Try CAR MODEL first (highest priority)
    for (const pattern of carPatterns) {
      const match = msg.match(pattern.regex);
      if (match) {
        const model = match[1].toUpperCase();
        const newTitle = `${pattern.brand} ${model}`;
        await renameChat(chatId, newTitle);
        return;
      }
    }

    // 2️⃣ Try ENGINE CODE second
    for (const pattern of enginePatterns) {
      const match = msg.match(pattern.regex);
      if (match) {
        const engine = match[1].toUpperCase();
        const newTitle = `${engine} ${pattern.brand}`;
        await renameChat(chatId, newTitle);
        return;
      }
    }

    // 3️⃣ Try BRAND third
    for (const pattern of brandPatterns) {
      const match = msg.match(pattern.regex);
      if (match) {
        const brandName = match[1].toUpperCase();
        const newTitle = `${brandName} ${pattern.brand}`;
        await renameChat(chatId, newTitle);
        return;
      }
    }

    // 4️⃣ Fallback to TOPIC
    for (const topic of topicMap) {
      if (topic.keywords.some(kw => msg.includes(kw))) {
        await renameChat(chatId, topic.title);
        return;
      }
    }
  };

  const renameChat = async (id: string, newTitle: string) => {
    if (!me?.uid) return;  // ✅ Safety check

    setChats(prev => {
      const next = prev.map(c => c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c).sort(sortMeta);
      saveJSON(STORAGE_CHATS(me.uid), next);  // ✅ FIXED
      return next;
    });
  };

  const deleteChat = async (id: string) => {
    if (!me?.uid) return;  // ✅ ADD THIS SAFETY CHECK AT THE TOP!

    setChats(prev => {
      const next = prev.filter(c => c.id !== id);
      saveJSON(STORAGE_CHATS(me.uid), next);  // ✅ Now safe
      return next;
    });

    try {
      await AsyncStorage.removeItem(STORAGE_CHAT(me.uid, id));  // ✅ Now safe
    } catch { }

    if (chatId === id) {
      const list = await loadJSON<ChatMeta[]>(STORAGE_CHATS(me.uid), []);  // ✅ Now safe
      if (list[0]) await selectChat(list[0].id);
      else {
        const fresh = await createChat();
        await selectChat(fresh.id);
      }
    }
  };

  const togglePin = async (id: string) => {
    if (!me?.uid) return;  // ✅ Safety check

    setChats(prev => {
      const next = prev.map(c => c.id === id ? { ...c, pinned: !c.pinned, updatedAt: Date.now() } : c).sort(sortMeta);
      saveJSON(STORAGE_CHATS(me.uid), next);  // ✅ FIXED
      return next;
    });
  };

  const setTags = async (id: string, tags: Tag[]) => {
    if (!me?.uid) return;  // ✅ Safety check

    setChats(prev => {
      const next = prev.map(c => c.id === id ? { ...c, tags, updatedAt: Date.now() } : c).sort(sortMeta);
      saveJSON(STORAGE_CHATS(me.uid), next);  // ✅ FIXED
      return next;
    });
  };

  const readChat = async (id: string) => {
    if (!me?.uid) return seedForTitle("");  // ✅ Safety check

    const stored = await loadJSON<Msg[] | null>(STORAGE_CHAT(me.uid, id), null);  // ✅ FIXED
    if (stored) return stored;
    const title = (chats.find(c => c.id === id)?.title) || "New chat";
    return seedForTitle(title);
  };

  const bumpPreview = async (snippet: string) => {
    if (!chatId || !me?.uid) return;  // ✅ Safety check

    setChats(prev => {
      const next = prev.map(c =>
        c.id === chatId ? ({ ...c, last: snippet, updatedAt: Date.now(), unread: 0 }) : c
      ).sort(sortMeta);
      saveJSON(STORAGE_CHATS(me.uid), next);  // ✅ FIXED
      return next;
    });
  };

  const selectChat = async (id: string, opt?: { scroll?: boolean }) => {
    if (!me?.uid) return;  // ✅ Safety check

    setChatId(id);
    const msgs = await readChat(id);
    setItems(msgs);
    setChats(prev => {
      const next = prev.map(c => c.id === id ? { ...c, unread: 0 } : c).sort(sortMeta);
      saveJSON(STORAGE_CHATS(me.uid), next);  // ✅ FIXED - Added me.uid
      return next;
    });
    if (opt?.scroll !== false) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
    setDrawerOpen(false);
  };

  /* ---------- Send (WITH QUOTA CHECK) ---------- */
  async function onSend(textIn?: string) {
    const text = (textIn ?? msg).trim();
    if (!text && !selectedImage) return;
    if (!chatId) return;
    const currentTier = await getUserTier();
    setUserTier(currentTier);
    if (!me?.uid) {  // ✅ ADD THIS - Safety check for me.uid

      Alert.alert("Error", "You must be logged in to send messages");
      return;
    }

    // Block free users at quota
    if (!hasPro && chatQuotaBlocked) {
      Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Warning);
      setItems(prev => ([
        ...prev,
        {
          id: String(Math.random()),
          role: "scotty",
          text: "Unlock unlimited — $3.99/mo",
        },
      ]));
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return;
    }

    // Upload image if selected - Check limits
    let imageUrl: string | undefined;
    if (selectedImage) {
      // Check image upload limit
      const canUpload = await canUploadImage();

      if (!canUpload.canUpload) {
        setPaywallCurrentUsage(canUpload.currentCount);  // Changed
        setPaywallLimit(canUpload.limit);                 // Changed
        setPaywallReason('image');
        setShowPaywall(true);
        return;
      }

      if (!me) {
        Alert.alert("Error", "Please sign in to upload images.");
        return;
      }

      setUploadingImage(true);
      try {
        imageUrl = await uploadImageToStorage(me.uid, selectedImage);
        console.log('[Scotty] Image uploaded:', imageUrl);

        // Track image usage
        await incrementImageCount();
        const newCount = await getMonthlyImageCount();
        setImageCount(newCount);
        console.log('[Scotty] Image count updated:', newCount);

      } catch (error) {
        console.error('[Scotty] Image upload failed:', error);
        Alert.alert("Upload Failed", "Failed to upload image. Please try again.");
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    }

    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium);

    const id = String(Math.random());
    const nextMsgs = [...items, { id, role: "you", text, imageUrl } as Msg];

    setItems(nextMsgs);
    setMsg("");
    setSelectedImage(null);
    setInputHeight(MIN_INPUT_HEIGHT);
    setTyping(true);
    setAutoScroll(true);
    setShowScrollButton(false);

    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);

    await saveJSON(STORAGE_CHAT(me.uid, chatId), nextMsgs);  // ✅ FIXED
    await bumpPreview(text || "[Image]");

    // Auto-title on user message
    if (text) {
      await autoTitleChat(text);
    }

    if (!hasPro) {
      const newQuota = await incrementChatCount();
      setChatQuotaCount(newQuota.count);
      setChatQuotaBlocked(newQuota.blocked);
    }

    // 🚨 CHECK MESSAGE LIMIT BEFORE SENDING
    const messageUsageCheck = await canSendMessage(currentTier);

    if (!messageUsageCheck.canSend) {
      setTyping(false);
      setPaywallCurrentUsage(messageUsageCheck.currentCount);  // Changed
      setPaywallLimit(messageUsageCheck.limit);                // Changed
      setPaywallReason('messages');
      setShowPaywall(true);
      return;
    }

    // Increment message count for all users (only if they can send)
    await incrementMessageCount(currentTier);
    const newMessageUsage = await canSendMessage(currentTier);
    setMessageCount(newMessageUsage.currentCount);
    console.log('[Scotty] Message count updated:', newMessageUsage.currentCount);

    try {
      const history: ChatMsg[] =
        items.filter(m => !!m.text).slice(-24).map<ChatMsg>(m => ({
          role: m.role === "you" ? "user" : "assistant",
          content: m.text || "",
        }));

      // Add the current user message
      history.push({
        role: "user",
        content: text || ""
      });


      // 🔍 VIN DETECTION
      const detectedVIN = extractVIN(text);
      if (detectedVIN && isValidVIN(detectedVIN)) {
        console.log('[Scotty] VIN detected:', detectedVIN);

        // Guard: Check if user is logged in
        if (!me?.uid) {
          setTyping(false);
          Alert.alert('Error', 'Please log in to use VIN scanning');
          return;
        }

        // Check if user can decode VIN
        const vinTier = mapToVINTier(userTier);
        const usage = await canDecodeVIN(me.uid, vinTier);

        console.log('🔍 VIN Usage Check:', JSON.stringify(usage, null, 2));
        console.log('🔍 VIN Tier:', vinTier);
        console.log('🔍 User Tier:', userTier);

        if (!usage.canDecode) {
          setTyping(false);
          setPaywallCurrentUsage(usage.currentCount);
          setPaywallLimit(usage.limit);
          setPaywallReason('vin');
          setShowPaywall(true);
          return;
        }

        // Decode VIN
        const result = await decodeVIN(detectedVIN, vinTier);

        if (result.success) {
          // Increment usage
          await incrementVINDecodeCount(me.uid, vinTier);  // me.uid is guaranteed
          const newUsage = await canDecodeVIN(me.uid, vinTier);  // me.uid is guaranteed
          setVinDecodeCount(newUsage.currentCount);

          // Format response
          const vinResponse = formatVINResponse(result);

          // Add to chat
          const scottyMsg: Msg = {
            id: String(Date.now()),
            role: "scotty",
            text: vinResponse,
          };

          const finalMsgs = [...nextMsgs, scottyMsg];
          setItems(finalMsgs);

          if (chatId && me?.uid) {
            await saveJSON(STORAGE_CHAT(me.uid, chatId), finalMsgs);
            await bumpPreview("🚗 VIN Decoded");
          }

          setTyping(false);
          Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Success);

          setTimeout(() => {
            listRef.current?.scrollToEnd({ animated: true });
          }, 100);

          return;
        } else {
          setTyping(false);
          Alert.alert("VIN Decode Error", result.error || "Failed to decode VIN");
          return;
        }
      }


      // Call Scotty with optional imageUrl and userTier
      const res = await callScottyFn({
        messages: history,
        imageUrl,
        userTier: userTier // Pass tier to Firebase
      });
      const reply = (res.data?.reply || "").trim() || "I'm blanking. Rephrase that for me?";

      setTyping(false);
      setIsTypingEffect(true);

      const tempId = id + "_r";
      const scottyMsg: Msg = { id: tempId, role: "scotty", text: "" };
      setItems([...nextMsgs, scottyMsg]);

      const words = reply.split(' ');
      let currentWordIndex = 0;
      let displayText = "";
      const typingSpeed = 50;

      typingIntervalRef.current = setInterval(() => {
        if (currentWordIndex < words.length) {
          displayText += (currentWordIndex > 0 ? ' ' : '') + words[currentWordIndex];

          setItems(prevItems =>
            prevItems.map(item =>
              item.id === tempId ? { ...item, text: displayText } : item
            )
          );
          currentWordIndex++;

          if (autoScroll) {
            listRef.current?.scrollToOffset({ offset: 999999, animated: false });
          }

        } else {
          if (typingIntervalRef.current) {
            clearInterval(typingIntervalRef.current);
            typingIntervalRef.current = null;
          }
          setIsTypingEffect(false);
          const finalMsgs = [...nextMsgs, { id: tempId, role: "scotty", text: reply } as Msg];
          setItems(finalMsgs);
          saveJSON(STORAGE_CHAT(me.uid, chatId), finalMsgs);  // ✅ FIXED - Added me.uid
          bumpPreview(reply);

          // Send push notification
          if (me?.uid) {
            sendPushNotification(me.uid, {
              title: '🔧 Scotty replied!',
              body: reply.slice(0, 100) + (reply.length > 100 ? '...' : ''),
              data: { type: 'scotty_reply', chatId },
              notificationType: 'replies'
            });
          }

          if (autoScroll) {
            setTimeout(() => {
              listRef.current?.scrollToOffset({ offset: 999999, animated: true });
            }, 100);
          }
        }
      }, typingSpeed);

    } catch {
      const after = [...nextMsgs, { id: id + "_r", role: "scotty", text: "Server hiccup. Try again in a sec." } as Msg];
      setItems(after);
      await saveJSON(STORAGE_CHAT(me.uid, chatId), after);  // ✅ FIXED - Added me.uid
      await bumpPreview("Server hiccup.");
      setTyping(false);
    }
  }

  /* ---------- Export ---------- */
  const exportChat = async (format: "text" | "md") => {
    if (!chatId) return;
    const meta = chats.find(c => c.id === chatId);
    const body = items.map(m => {
      const who = m.role === "you" ? "You" : "Scotty";
      return format === "md"
        ? `**${who}:** ${m.text || ""}`
        : `${who}: ${m.text || ""}`;
    }).join(format === "md" ? "\n\n" : "\n");
    await Share.share({ title: meta?.title || "Scotty chat", message: body });
  };

  /* ---------- Drawer helpers ---------- */
  const openDrawer = () => setDrawerOpen(true);
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

  const remaining = hasPro ? null : Math.max(0, CHAT_LIMIT - chatQuotaCount); // ← Changed

  /* ---------- UI ---------- */
  return (
    <SafeAreaView style={s.safe} edges={['bottom', 'left', 'right']}>
      <View style={s.premiumHeader}>
        {/* Left: Title */}
        <View style={s.headerLeft}>
          <Text style={s.headerTitle}>SCOTTY</Text>
          <Text style={s.headerSubtitle}>Performance Assistant</Text>
        </View>

        {/* Right: New Chat + Tier Badge + History */}
        <View style={s.headerRight}>
          {/* New Chat Button */}
          <TouchableOpacity
            onPress={async () => {
              const created = await createChat();
              await selectChat(created.id);
            }}
            style={s.newChatBtn}
          >
            <Ionicons name="add" size={18} color={C.text} />
            <Text style={s.newChatText}>New</Text>
          </TouchableOpacity>

          {/* History Button */}
          <TouchableOpacity onPress={openDrawer} style={s.historyBtn}>
            <Ionicons name="time-outline" size={18} color={C.textSecondary} />
          </TouchableOpacity>

          {/* Tier Badge */}
          {userTier !== "FREE" && (
            <View style={[
              s.tierBadge,
              {
                backgroundColor:
                  userTier === "CLUB" ? "#FF3B30" :        // 🔴 RED (VIP STOP!)
                    userTier === "TRACK_MODE" ? "#FFD60A" :  // 🟡 YELLOW (RACING!)
                      "#30D158"                                 // 🟢 GREEN (PLUS GO!)
              }
            ]}>
              <Text style={s.tierBadgeText}>
                {userTier === "TRACK_MODE" ? "TRACK MODE" : userTier}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Usage Stats Bar - Hidden for cleaner ChatGPT-style UI */}

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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
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

      {/* 🔥 NEW: Upgrade Card */}
      {!hasPro && chatQuotaBlocked && (
        <View style={s.upgradeCard}>
          <View style={s.upgradeHeader}>
            <Ionicons name="lock-closed" size={20} color={C.accent} />
            <Text style={s.upgradeTitle}>You've used all 10 free questions</Text>
          </View>
          <Text style={s.upgradeDesc}>
            Get unlimited access to Scotty for just $3.99/month
          </Text>
          <TouchableOpacity
            style={s.upgradeBtn}
            onPress={async () => {
              try {
                const customerInfo = await Purchases.getCustomerInfo();
                const offerings = await Purchases.getOfferings();

                if (offerings.current !== null && offerings.current.availablePackages.length > 0) {
                  const purchaseResult = await Purchases.purchasePackage(
                    offerings.current.availablePackages[0]
                  );

                  if (purchaseResult.customerInfo.entitlements.active[ENTITLEMENT_ID]) {
                    setHasPro(true);
                    setChatQuotaBlocked(false);
                    Alert.alert("🎉 Welcome to Plus!", "You now have unlimited questions!");
                  }
                } else {
                  Alert.alert(
                    "Coming Soon!",
                    "Subscriptions are being set up. Check back soon!"
                  );
                }
              } catch (error: any) {
                if (error.userCancelled) {
                  return;
                }
                console.log("Purchase error:", error);
                Alert.alert(
                  "Purchase Error",
                  "Could not complete purchase. Please try again."
                );
              }
            }}
          >
            <Ionicons name="flash" size={18} color="#111" />
            <Text style={s.upgradeBtnTxt}>Upgrade to Plus</Text>
          </TouchableOpacity>
          {/* 🔥 NEW: Auto-renew disclaimer */}
          <Text style={s.upgradeLegal}>
            Auto-renews monthly. Cancel anytime in iOS Settings → Subscriptions.
          </Text>
        </View>
      )}

      {/* Hold to copy hint */}
      <View style={s.hintRow}>
        <Ionicons name="information-circle-outline" size={14} color={C.muted} />
        <Text style={s.hintTxt}>Hold any message to copy</Text>
      </View>


      {/* Chat list */}
      <View style={s.chatWrap}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 14, paddingBottom: listBottomPad }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={true}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const isNearBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 100;

            if (!isNearBottom && !showScrollButton) {
              setShowScrollButton(true);
            } else if (isNearBottom && showScrollButton) {
              setShowScrollButton(false);
            }
          }}
          onScrollBeginDrag={() => {
            // User touched to scroll - disable auto-scroll
            if (isTypingEffect) {
              setAutoScroll(false);
              setShowScrollButton(true);
            }
          }}
          renderItem={({ item }) => (
            <Bubble
              role={item.role}
              text={item.text}
              imageUrl={item.imageUrl}
              onImagePress={(url) => setViewingImage(url)}
            />
          )}
        />

        {/* Scroll to bottom button */}
        {showScrollButton && (
          <TouchableOpacity
            onPress={scrollToBottom}
            style={[s.scrollToBottomBtn, { bottom: listBottomPad - bottomOffset + -40 }]}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-down" size={20} color={C.text} />
          </TouchableOpacity>
        )}
      </View>

      {/* Typing pill */}
      {typing && (
        <View style={[s.typingPill, { bottom: bottomOffset + dynamicDockHeight + 6 }]}>
          <View style={s.dot} /><View style={s.dot} /><View style={s.dot} />
          <Text style={s.typingTxt}>Scotty is thinking…</Text>
        </View>
      )}

      {/* Input Dock - Compact ChatGPT Style */}
      <View style={[s.inputDockCompact, { bottom: bottomOffset }]}>

        {/* Image Preview Above Input */}
        {selectedImage && (
          <View style={s.imagePreviewCompact}>
            <Image source={{ uri: selectedImage }} style={s.imagePreviewThumbCompact} />
            <TouchableOpacity
              style={s.imagePreviewRemoveCompact}
              onPress={removeSelectedImage}
            >
              <Ionicons name="close-circle" size={20} color={C.text} />
            </TouchableOpacity>
          </View>
        )}

        {/* Compact Input Row */}
        <View style={s.compactInputRow}>
          {/* Plus Button */}
          <TouchableOpacity
            style={s.plusBtn}
            onPress={() => setToolMenuVisible(true)}
          >
            <Ionicons name="add" size={24} color={C.text} />
          </TouchableOpacity>

          {/* Input Field */}
          <TextInput
            style={s.compactInput}
            value={msg}
            onChangeText={setMsg}
            placeholder="Ask anything..."
            placeholderTextColor={C.muted}
            returnKeyType="send"
            onSubmitEditing={() => onSend()}
            editable={hasPro || !chatQuotaBlocked}
            multiline
            maxLength={2000}
          />

          {/* Send Button */}
          <TouchableOpacity
            style={[s.compactSendBtn, ((!msg.trim() && !selectedImage) || uploadingImage) && { opacity: 0.3 }]}
            onPress={() => onSend()}
            disabled={(!msg.trim() && !selectedImage) || uploadingImage}
          >
            <Ionicons name="arrow-up" size={20} color="#111" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Sheet Tool Menu */}
      <Modal
        visible={toolMenuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setToolMenuVisible(false)}
      >
        <Pressable
          style={s.bottomSheetScrim}
          onPress={() => setToolMenuVisible(false)}
        >
          <View style={s.bottomSheetContent}>
            {/* Scan VIN */}
            <TouchableOpacity
              style={s.bottomSheetBtn}
              onPress={() => {
                setToolMenuVisible(false);
                openVinScanner();
              }}
              disabled={userTier === "FREE"}
            >
              <View style={s.bottomSheetIcon}>
                <Ionicons name="scan" size={24} color={userTier !== "FREE" ? C.accent : C.muted} />
              </View>
              <View style={s.bottomSheetText}>
                <Text style={s.bottomSheetTitle}>Scan VIN</Text>
                <Text style={s.bottomSheetSubtitle}>Decode vehicle from photo</Text>
              </View>
              {userTier === "FREE" && (
                <Ionicons name="lock-closed" size={16} color={C.muted} />
              )}
            </TouchableOpacity>

            {/* Sound Check */}
            <TouchableOpacity
              style={s.bottomSheetBtn}
              onPress={() => {
                setToolMenuVisible(false);
                openSoundRecorder();
              }}
              disabled={userTier === "FREE"}
            >
              <View style={s.bottomSheetIcon}>
                <Ionicons name="mic" size={24} color={userTier !== "FREE" ? C.accent : C.muted} />
              </View>
              <View style={s.bottomSheetText}>
                <Text style={s.bottomSheetTitle}>Sound Check</Text>
                <Text style={s.bottomSheetSubtitle}>Analyze engine sounds</Text>
              </View>
              {userTier === "FREE" && (
                <Ionicons name="lock-closed" size={16} color={C.muted} />
              )}
            </TouchableOpacity>

            {/* Upload Photo */}
            <TouchableOpacity
              style={s.bottomSheetBtn}
              onPress={() => {
                setToolMenuVisible(false);
                pickImage();
              }}
              disabled={uploadingImage}
            >
              <View style={s.bottomSheetIcon}>
                <Ionicons name="image" size={24} color={hasPro ? C.accent : C.muted} />
              </View>
              <View style={s.bottomSheetText}>
                <Text style={s.bottomSheetTitle}>Upload Photo</Text>
                <Text style={s.bottomSheetSubtitle}>Get visual diagnostics</Text>
              </View>
              {!hasPro && <Ionicons name="lock-closed" size={16} color={C.muted} />}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Sound Location Picker - OUTSIDE the tool menu modal */}
      <SoundLocationPicker
        visible={showLocationPicker}
        onSelectLocation={handleLocationSelected}
        onClose={() => {
          setShowLocationPicker(false);
          setPendingAudioUri(null);
        }}
      />


      {/* VIN Scanner Modal */}
      {vinScannerVisible && (
    <Modal
        visible={vinScannerVisible}
        animationType="slide"
        presentationStyle="fullScreen"
    >
        <VinScanner
            onClose={() => setVinScannerVisible(false)}
            onVinDecoded={handleVinDecoded}
            userId={me?.uid || ''}
        />
    </Modal>
)}

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
                const created = await createChat();
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
      {/* Paywall Modal */}
      <Paywall
        visible={showPaywall}
        reason={paywallReason}
        currentUsage={paywallCurrentUsage}
        limit={paywallLimit}
        onClose={() => setShowPaywall(false)}
        onPurchaseSuccess={async () => {
          setShowPaywall(false);
        }}
      />

      {/* Full Screen Image Viewer */}
      <Modal
        visible={!!viewingImage}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingImage(null)}
      >
        <View style={s.imageViewerModal}>
          <TouchableOpacity
            style={s.imageViewerClose}
            onPress={() => setViewingImage(null)}
          >
            <Ionicons name="close" size={32} color={C.text} />
          </TouchableOpacity>

          {viewingImage && (
            <Image
              source={{ uri: viewingImage }}
              style={s.imageViewerImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Sound Recorder Modal */}
      <SoundRecorder
        visible={showSoundRecorder}
        onClose={closeSoundRecorder}  // 🔥 USE THE NEW FUNCTION
        onRecordingComplete={handleSoundRecording}
        maxDuration={getMaxRecordingDuration(mapToSoundTier(userTier))}
        userTier={userTier as 'FREE' | 'PLUS' | 'TRACK_MODE' | 'CLUB'}
      />

      {/* Analyzing Overlay */}
      {isAnalyzing && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
        }}>
          <ActivityIndicator size="large" color="#E11D48" />
          <Text style={{ color: '#E7EAF0', fontSize: 18, fontWeight: '700', marginTop: 20 }}>
            Analyzing sound...
          </Text>
          <Text style={{ color: '#A6ADBB', fontSize: 14, marginTop: 8 }}>
            Scotty is diagnosing...
          </Text>
        </View>
      )}

      {/* Paywall Modal */}
      <Paywall
        visible={showPaywall}
        reason={paywallReason}
        currentUsage={currentMessageCount}
        limit={messageLimit}
        onClose={() => setShowPaywall(false)}
        onPurchaseSuccess={async () => {
          setShowPaywall(false);
          // Refresh will happen automatically on next message
        }}
      />
    </SafeAreaView>
  );
}




function Bubble({ role, text, imageUrl, onImagePress }: {
  role: "you" | "scotty";
  text?: string;
  imageUrl?: string;
  onImagePress?: (url: string) => void;
}) {
  const isYou = role === "you";
  const [copied, setCopied] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const cursorAnim = useRef(new Animated.Value(1)).current;

  // Blinking cursor animation
  useEffect(() => {
    if (!isYou && text && text.length > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(cursorAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(cursorAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [text]);

  const handleCopy = () => {
    if (!text) return;
    try {
      Clipboard.setString(text);
      Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Success);

      // Show copied indicator
      setCopied(true);
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(1500),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => setCopied(false));
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  return (
    <View style={{ maxWidth: "88%", alignSelf: isYou ? "flex-end" : "flex-start", marginBottom: 12 }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={handleCopy}
        style={[s.bubble, isYou ? s.bubbleYou : s.bubbleScotty]}
      >
        {!isYou && (
          <View style={s.badgeRow}>
            <Text style={s.badgeDot}>•</Text>
            <Text style={s.badgeTxt}>scotty</Text>
          </View>
        )}
        {imageUrl && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onImagePress?.(imageUrl)}
          >
            <Image
              source={{ uri: imageUrl }}
              style={{
                width: 230,
                height: 150,
                borderRadius: 12,
                marginBottom: text ? 8 : 0,
                backgroundColor: '#1a1d24',
              }}
              resizeMode="cover"
            />
          </TouchableOpacity>
        )}
        {text ? (
          <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
            <Text style={s.msgTxt} selectable>{text}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      {/* Copied indicator */}
      {copied && (
        <Animated.View
          style={[
            s.copiedIndicator,
            isYou ? { alignSelf: "flex-end", right: 0 } : { alignSelf: "flex-start", left: 0 },
            { opacity: fadeAnim }
          ]}
        >
          <Ionicons name="checkmark-circle" size={14} color={C.good} />
          <Text style={s.copiedText}>Copied</Text>
        </Animated.View>
      )}
    </View>
  );
}

/* ---------- Styles ---------- */
const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg
  },

  /* ===== PREMIUM HEADER ===== */
  premiumHeader: {
    paddingHorizontal: SPACING.md,  // ← Changed from lg to md
    paddingTop: SPACING.md,          // ← Changed from lg to md
    paddingBottom: SPACING.sm,       // ← Changed from md to sm
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.bg,
  },
  headerLeft: {
    gap: 4,
  },
  headerTitle: {
    color: C.text,
    fontSize: 26,
    fontWeight: "900",  // ← BOLDER!
    letterSpacing: 0.8, // ← MORE SPACING!
  },
  headerSubtitle: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,  // ← Smaller gap between buttons
  },
  historyBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
  },
  tierBadge: {
    paddingHorizontal: 10,  // ← Changed from 12 to 10
    paddingVertical: 5,      // ← Changed from 6 to 5
    borderRadius: RADIUS.sm,
  },
  tierBadgeText: {
    color: "#000",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,  // ← Changed from 12 to 10
    paddingVertical: 5,      // ← Changed from 6 to 5
    borderRadius: RADIUS.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
  },
  newChatText: {
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
  },  // ← COMMA HERE!

  /* ===== USAGE STATS BAR ===== */
  usageBar: {
    flexDirection: "row",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  usageStat: {
    flex: 1,
    alignItems: "center",
  },
  usageLabel: {
    color: C.textTertiary,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  usageCount: {
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
  },
  usageDivider: {
    width: 1,
    height: 24,
    backgroundColor: C.line,
    marginHorizontal: SPACING.sm,
  },

  /* ===== RECENTS (KEEP) ===== */
  recentsWrap: {
    paddingVertical: SPACING.sm,
    gap: 6
  },
  recentsTitle: {
    color: C.textSecondary,
    fontSize: 11,
    paddingHorizontal: SPACING.md,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontWeight: "700"
  },
  recentCard: {
    width: 200,
    marginRight: SPACING.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  recentTitle: {
    color: C.text,
    fontWeight: "800",
    flexShrink: 1,
    fontSize: 13
  },
  recentLast: {
    color: C.textSecondary,
    fontSize: 12,
    marginTop: 2
  },

  /* ===== CHAT AREA ===== */
  chatWrap: { flex: 1 },

  /* ===== ENHANCED MESSAGE BUBBLES ===== */
  bubble: {
    width: "100%",
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  bubbleYou: {
    backgroundColor: C.panel,
    borderColor: C.lineLight,
    alignSelf: "flex-end",
    maxWidth: "85%",
  },
  bubbleScotty: {
    backgroundColor: C.surface,
    borderColor: C.line,
    alignSelf: "flex-start",
    maxWidth: "90%",
  },

  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: SPACING.sm
  },
  badgeTxt: {
    color: C.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontWeight: "700"
  },

  /* ===== TEXT STYLING ===== */
  msgTxt: {
    color: C.text,
    lineHeight: 22,
    fontSize: 15,
    letterSpacing: 0.1,
  },

  copiedIndicator: {
    marginTop: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.good,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  copiedText: {
    color: C.good,
    fontSize: 12,
    fontWeight: "700",
  },

  /* ===== TYPING INDICATOR ===== */
  typingPill: {
    position: "absolute",
    left: SPACING.md,
    right: SPACING.md,
    height: 36,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: C.textSecondary,
    opacity: 0.6
  },
  typingTxt: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },


  /* ===== MODALS ===== */
  modalScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center"
  },
  modalCard: {
    width: "82%",
    backgroundColor: C.panel,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: C.line
  },
  modalTitle: {
    color: C.text,
    fontWeight: "800",
    marginBottom: 10,
    fontSize: 16
  },
  modalInput: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.sm,
    color: C.text,
    paddingHorizontal: 10,
    paddingVertical: SPACING.sm,
    backgroundColor: C.surface
  },
  modalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: SPACING.lg,
    marginTop: SPACING.md
  },

  /* ===== BADGES & TAGS ===== */
  badgeDot: {
    color: C.accent,
    fontSize: 14,
    lineHeight: 14
  },

  tagSmall: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 999,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4
  },
  tagSmallTxt: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700"
  },


  /* ===== COMPACT INPUT DOCK (CHATGPT STYLE) ===== */
  inputDockCompact: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderColor: C.line,
  },

  compactInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: C.surface,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: C.line,
  },

  plusBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  compactInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    color: C.text,
    maxHeight: 100,
    paddingVertical: 4,
  },

  compactSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
  },

  /* ===== COMPACT IMAGE PREVIEW ===== */
  imagePreviewCompact: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
  },

  imagePreviewThumbCompact: {
    width: 50,
    height: 50,
    borderRadius: RADIUS.sm,
    marginRight: SPACING.sm,
  },

  imagePreviewRemoveCompact: {
    marginLeft: "auto",
    padding: 4,
  },

  /* ===== BOTTOM SHEET MENU ===== */
  bottomSheetScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },


  bottomSheetContent: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderColor: C.line,
  },

  bottomSheetBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    gap: SPACING.md,
  },

  bottomSheetIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bg,
    borderRadius: RADIUS.md,
  },

  bottomSheetText: {
    flex: 1,
  },

  bottomSheetTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },

  bottomSheetSubtitle: {
    color: C.textSecondary,
    fontSize: 13,
  },

  /* ===== DRAWER BUTTONS ===== */
  addMini: {
    backgroundColor: C.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  miniGhost: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    justifyContent: "center"
  },

  /* ===== INPUT WRAPPER ===== */
  inputWrapper: {
    flex: 1,
    position: "relative",
  },


  /* ===== SCROLL TO BOTTOM ===== */
  scrollToBottomBtn: {
    position: "absolute",
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },

  /* ===== ENHANCED INPUT DOCK ===== */
  inputDock: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderColor: C.line,
    backgroundColor: C.bg,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    gap: SPACING.md,
  },

  /* ===== TOOL BAR (NEW) ===== */
  toolBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
  },
  toolBtn: {
    alignItems: "center",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  toolBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: C.accent,
  },
  toolLabel: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  toolLabelActive: {
    color: C.accent,
  },

  /* ===== INPUT ROW ===== */
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.md,
  },
  input: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0,
    color: C.text,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.line,
  },
  charCount: {
    position: "absolute",
    bottom: 8,
    right: 12,
    backgroundColor: "rgba(18,19,24,0.8)",
    borderRadius: RADIUS.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  charCountTxt: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  sendBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  /* ===== IMAGE PREVIEW - INLINE ===== */
  imagePreviewInline: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  imagePreviewContainer: {
    position: "relative",
    width: 80,
    height: 80,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: C.accent,
  },
  imagePreviewThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: C.surface,
  },
  imagePreviewRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* ===== IMAGE VIEWER ===== */
  imageViewerModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    padding: 12,
    backgroundColor: 'rgba(18, 19, 24, 0.8)',
    borderRadius: 30,
  },
  imageViewerImage: {
    width: '100%',
    height: '100%',
  },

  /* ===== DRAWER ===== */
  drawer: {
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: C.panel,
    borderLeftWidth: 1,
    borderColor: C.line,
    padding: SPACING.md,
    zIndex: 40,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: -6, height: 0 },
    elevation: 12,
    borderTopLeftRadius: RADIUS.lg,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm
  },
  drawerTitle: {
    color: C.text,
    fontWeight: "900",
    fontSize: 16
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm
  },
  searchInput: {
    color: C.text,
    flex: 1
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    padding: 10,
    marginBottom: SPACING.sm
  },
  chatRowActive: {
    borderColor: C.accent
  },
  chatTitle: {
    color: C.text,
    fontWeight: "800",
    fontSize: 14
  },
  chatLast: {
    color: C.textSecondary,
    fontSize: 12,
    marginTop: 2
  },

  /* ===== UPGRADE CARD ===== */
  upgradeCard: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: C.accent,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  upgradeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: SPACING.sm,
  },
  upgradeTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "900",
    flex: 1,
  },
  upgradeDesc: {
    color: C.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: C.accent,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
  },
  upgradeBtnTxt: {
    color: "#000",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  /* ===== PAYWALL MODAL ===== */
  paywallScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  paywallCard: {
    width: "90%",
    backgroundColor: C.panel,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    borderWidth: 2,
    borderColor: C.accent,
  },
  paywallClose: {
    position: "absolute",
    top: 16,
    right: 16,
    padding: SPACING.sm,
  },
  paywallTitle: {
    color: C.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: SPACING.lg,
    textAlign: "center",
  },
  paywallSubtitle: {
    color: C.textSecondary,
    fontSize: 16,
    marginTop: SPACING.sm,
    textAlign: "center",
  },
  paywallBtn: {
    backgroundColor: C.accent,
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: RADIUS.lg,
    marginTop: SPACING.xl,
    width: "100%",
  },
  paywallBtnTxt: {
    color: "#000",
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  upgradeLegal: {
    color: C.textSecondary,
    fontSize: 9,
    textAlign: 'center',
    marginTop: SPACING.md,
    lineHeight: 16,
    opacity: 0.8,
  },

  /* ===== MISC ===== */
  unreadDot: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4
  },
  unreadTxt: {
    color: "#000",
    fontSize: 10,
    fontWeight: "900"
  },
  bubbleSelecting: {
    borderColor: C.accent,
    borderWidth: 2,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  hintRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  hintTxt: {
    color: C.textSecondary,
    fontSize: 12,
    fontStyle: "italic",
  },
});