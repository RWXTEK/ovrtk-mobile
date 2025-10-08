// apps/mobile/app/(tabs)/profile/index.tsx
import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Switch,
  ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView, Linking, Image, Modal, Share, Animated
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, db, storage } from "../../../lib/firebase";
import {
  doc, getDoc, setDoc, serverTimestamp, updateDoc, collection, query, where, getDocs, limit,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import Purchases, {
  CustomerInfo,
  PACKAGE_TYPE,
  PurchasesPackage,
} from "react-native-purchases";

const ENV_ENTITLEMENT = process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID?.trim();
const ENTITLEMENT_ID = ENV_ENTITLEMENT || "pro_uploads";
const PRODUCT_ID_FALLBACK = "com.rwxtek.ovrtk.plus.monthly";

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

type Links = { instagram?: string; youtube?: string; website?: string };
type UserDoc = {
  displayName?: string;
  handle?: string;
  avatarURL?: string;
  bio?: string;
  location?: string;
  links?: Links;
  createdAt?: any;
  updatedAt?: any;
  publicProfile?: boolean;
  showGarageValue?: boolean;
  showCarValues?: boolean;
  notifBuilds?: boolean;
  notifReplies?: boolean;
};

const STORAGE_KEY = "ovrtk.chat.loggedin.quota";

function isUserCancelled(err: any) {
  const code = err?.code;
  return (
    err?.userCancelled === true ||
    code === "PURCHASE_CANCELLED" ||
    code === "UserCancelled" ||
    String(err?.message || "").toLowerCase().includes("cancel")
  );
}

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState<null | "ok" | "err">(null);
  const [toastAnim] = useState(new Animated.Value(0));

  const [u, setU] = useState<UserDoc>({});
  const [notifBuilds, setNotifBuilds] = useState(true);
  const [notifReplies, setNotifReplies] = useState(true);
  const [quotaLeft, setQuotaLeft] = useState<number | null>(null);

  const [publicProfile, setPublicProfile] = useState(false);
  const [showGarageValue, setShowGarageValue] = useState(false);
  const [showCarValues, setShowCarValues] = useState(false);

  const [handleStatus, setHandleStatus] =
    useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");

  const [hasPro, setHasPro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [platformModalOpen, setPlatformModalOpen] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setMe), []);

  useEffect(() => {
    (async () => {
      if (!me) { setLoading(false); return; }
      try {
        const userRef = doc(db, "users", me.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data() as UserDoc;
          setU(data);
          setPublicProfile(data.publicProfile ?? false);
          setShowGarageValue(data.showGarageValue ?? false);
          setShowCarValues(data.showCarValues ?? false);
          setNotifBuilds(data.notifBuilds ?? true);
          setNotifReplies(data.notifReplies ?? true);
        } else {
          const init: UserDoc = {
            displayName: me.displayName ?? "Driver",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userRef, init, { merge: true });
          setU(init);
        }
      } catch (e: any) {
        console.log("profile load error:", e?.message || e);
        Alert.alert("Error", "Could not load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [me]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) { setQuotaLeft(10); return; }
        const today = new Date().toISOString().slice(0, 10);
        const data = JSON.parse(raw) as { date: string; count: number };
        setQuotaLeft(data.date === today ? Math.max(10 - data.count, 0) : 10);
      } catch {
        setQuotaLeft(10);
      }
    })();
  }, []);

  useEffect(() => {
    const listener = (info: CustomerInfo) => {
      const active = !!info.entitlements.active[ENTITLEMENT_ID];
      setHasPro(active);
    };

    Purchases.addCustomerInfoUpdateListener(listener);

    (async () => {
      try {
        const info = await Purchases.getCustomerInfo();
        const active = !!info.entitlements.active[ENTITLEMENT_ID];
        setHasPro(active);
      } catch {
        setHasPro(false);
      }
    })();

    return () => {
      try {
        // @ts-ignore
        Purchases.removeCustomerInfoUpdateListener?.(listener);
      } catch {}
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const offerings = await Purchases.getOfferings();
        const list = offerings.current?.availablePackages ?? [];
        setPackages(list);
      } catch {
        setPackages([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (savedToast) {
      Animated.sequence([
        Animated.spring(toastAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
        Animated.delay(1500),
        Animated.timing(toastAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => setSavedToast(null));
    }
  }, [savedToast]);

  const pickBestMonthly = () => {
    const monthly = packages.find(p => p.packageType === PACKAGE_TYPE.MONTHLY);
    return monthly ?? packages[0];
  };

  const purchasePlus = async () => {
    setBusy(true);
    try {
      const offerings = await Purchases.getOfferings();
      const monthlyPkg =
        offerings.current?.monthly ??
        offerings.current?.availablePackages?.find(p => p.packageType === PACKAGE_TYPE.MONTHLY);

      if (monthlyPkg) {
        await Purchases.purchasePackage(monthlyPkg);
        setPaywallOpen(false);
        Alert.alert("Welcome to Plus!", "Unlimited Scotty chat is now active. Ask away!");
      } else if (packages.length) {
        const pkg = pickBestMonthly();
        await Purchases.purchasePackage(pkg);
        setPaywallOpen(false);
        Alert.alert("Welcome to Plus!", "Unlimited Scotty chat is now active. Ask away!");
      } else {
        await Purchases.purchaseProduct(PRODUCT_ID_FALLBACK);
        setPaywallOpen(false);
        Alert.alert("Welcome to Plus!", "Unlimited Scotty chat is now active. Ask away!");
      }
    } catch (e: any) {
      if (isUserCancelled(e)) {
        Alert.alert("Upgrade", "Purchase cancelled");
      } else {
        const msg = String(e?.message ?? e ?? "");
        if (/Couldn't find product|Product not available/i.test(msg)) {
          console.warn(
            "RC: 'Couldn't find product'. Check:\n" +
              `• App Store Connect product id = ${PRODUCT_ID_FALLBACK}\n` +
              "• RevenueCat Product linked to App Store product\n" +
              "• Product added to current Offering & set as Current\n" +
              "• Device signed into iOS Sandbox (Settings → Developer)\n" +
              "• Clear purchase history & reboot if needed"
          );
        }
        Alert.alert("Upgrade", "Purchase failed");
      }
      console.log("purchase error", e?.message || e);
    } finally {
      setBusy(false);
    }
  };

  const restorePlus = async () => {
    setBusy(true);
    try {
      const info = await Purchases.restorePurchases();
      const active = !!info.entitlements.active[ENTITLEMENT_ID];
      setHasPro(active);
      setPaywallOpen(false);
      Alert.alert(
        active ? "Restored" : "Restore",
        active ? "Welcome back — Plus is active again." : "No active subscription found."
      );
    } catch (e) {
    } finally {
      setBusy(false);
    }
  };

  const openManageSubscription = () => {
    setPlatformModalOpen(true);
  };

  const handlePlatformChoice = (platform: "ios" | "android") => {
    setPlatformModalOpen(false);
    
    if (platform === "ios") {
      Linking.openURL("https://apps.apple.com/account/subscriptions");
    } else {
      Linking.openURL("https://play.google.com/store/account/subscriptions");
    }
  };

  const validateHandle = async (val?: string) => {
    if (!val) return true;
    const ok = /^[a-z0-9_]{3,20}$/.test(val);
    if (!ok) return false;
    if (!me) return ok;
    const qy = query(collection(db, "users"), where("handle", "==", val), limit(1));
    const s = await getDocs(qy);
    if (s.empty) return true;
    return s.docs[0].id === me.uid;
  };

  useEffect(() => {
    let t: any;
    const run = async () => {
      const val = u.handle?.trim().toLowerCase();
      if (!val) { setHandleStatus("idle"); return; }
      if (!/^[a-z0-9_]{3,20}$/.test(val)) { setHandleStatus("invalid"); return; }
      setHandleStatus("checking");
      const ok = await validateHandle(val);
      setHandleStatus(ok ? "ok" : "taken");
    };
    t = setTimeout(run, 350);
    return () => clearTimeout(t);
  }, [u.handle]);

  const saveProfile = async () => {
    if (!me) {
      Alert.alert("Not signed in");
      return;
    }
    if (!(await validateHandle(u.handle))) {
      Alert.alert("Handle error", "Handle must be 3–20 chars [a–z 0–9 _] and unique.");
      return;
    }
    try {
      setSaving(true);
      await updateDoc(doc(db, "users", me.uid), { 
        ...u, 
        publicProfile,
        showGarageValue,
        showCarValues,
        updatedAt: serverTimestamp() 
      });
      setSavedToast("ok");
    } catch (e: any) {
      console.log("saveProfile error:", e?.message || e);
      setSavedToast("err");
      Alert.alert("Error", "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  const toggleAndSave = async (field: "publicProfile" | "showGarageValue" | "showCarValues" | "notifBuilds" | "notifReplies", value: boolean) => {
    if (!me) return;
    
    if (field === "publicProfile") setPublicProfile(value);
    if (field === "showGarageValue") setShowGarageValue(value);
    if (field === "showCarValues") setShowCarValues(value);
    if (field === "notifBuilds") setNotifBuilds(value);
    if (field === "notifReplies") setNotifReplies(value);

    try {
      await updateDoc(doc(db, "users", me.uid), {
        [field]: value,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.log("toggle save error:", e);
      if (field === "publicProfile") setPublicProfile(!value);
      if (field === "showGarageValue") setShowGarageValue(!value);
      if (field === "showCarValues") setShowCarValues(!value);
      if (field === "notifBuilds") setNotifBuilds(!value);
      if (field === "notifReplies") setNotifReplies(!value);
      Alert.alert("Error", "Could not save setting");
    }
  };

  const onSignOut = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.log("signOut error", e);
    } finally {
      router.replace("/");
    }
  };

  const pickAvatar = async () => {
    if (!me) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.length) return;
    const uri = res.assets[0].uri;
    try {
      const blob = await (await fetch(uri)).blob();
      const key = `users/${me.uid}/avatar-${Date.now()}.jpg`;
      const r = ref(storage, key);
      await uploadBytes(r, blob);
      const url = await getDownloadURL(r);
      await updateDoc(doc(db, "users", me.uid), {
        avatarURL: url,
        updatedAt: serverTimestamp(),
      });
      setU((prev) => ({ ...prev, avatarURL: url }));
    } catch (e) {
      Alert.alert("Avatar", "Couldn't update photo.");
    }
  };

  const shareProfile = async () => {
    if (!u.handle) {
      Alert.alert("Set Handle", "Create a handle first to share your profile");
      return;
    }
    const url = `https://ovrtk.com/u/${u.handle}`;
    await Share.share({
      message: `Check out my garage on OVRTK: ${url}`,
      title: "My OVRTK Garage"
    });
  };

  const viewPublic = () => {
    const handle = u.handle?.trim();
    if (!handle) {
      Alert.alert("Set Handle", "Pick a handle to preview your public page.");
      return;
    }
    if (!publicProfile) {
      Alert.alert("Profile is Private", "Turn on 'Public profile' to preview.");
      return;
    }
    router.push(`/u/${handle}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.safe, { paddingBottom: insets.bottom || 10 }]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: C.muted, marginTop: 8 }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const toastScale = toastAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  });

  const toastOpacity = toastAnim;

  return (
    <SafeAreaView style={[s.safe, { paddingBottom: insets.bottom || 10 }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: (insets.bottom || 10) + 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={s.header}>
            <View style={s.badge}>
              <Ionicons name="person-outline" size={14} color="#111" />
              <Text style={s.badgeTxt}>Profile</Text>
            </View>

            <View style={s.headerRight}>
              {hasPro && (
                <View style={s.proBadge}>
                  <Ionicons name="flash" size={12} color="#111" />
                  <Text style={s.proBadgeTxt}>Plus</Text>
                </View>
              )}

              <TouchableOpacity onPress={viewPublic} style={s.publicBtn} activeOpacity={0.9}>
                <Ionicons name="eye-outline" size={16} color={C.text} />
                <Text style={s.publicBtnTxt}>Public</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Avatar Section */}
          <View style={s.avatarSection}>
            <View style={s.avatarContainer}>
              <View style={s.avatar}>
                {u.avatarURL ? (
                  <Image source={{ uri: u.avatarURL }} style={s.avatarImg} />
                ) : (
                  <Text style={s.avatarLetter}>{(u.displayName ?? "D").slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Identity Card */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Identity</Text>
            <Field
              label="Display Name"
              value={u.displayName ?? ""}
              onChangeText={(v) => setU((prev) => ({ ...prev, displayName: v }))}
              placeholder="Your name"
            />
            <Field
              label="Handle"
              value={u.handle ?? ""}
              onChangeText={(v) => setU((prev) => ({ ...prev, handle: v.toLowerCase() }))}
              placeholder="username"
              prefix="@"
            >
              <View style={s.handleBadge}>
                {handleStatus === "checking" && <View style={s.statusDot} />}
                {handleStatus === "ok" && <Ionicons name="checkmark-circle" size={16} color={C.good} />}
                {handleStatus === "taken" && <Ionicons name="close-circle" size={16} color={C.accent} />}
                {handleStatus === "invalid" && <Ionicons name="alert-circle" size={16} color={C.accent} />}
              </View>
            </Field>
          </View>

          {/* About Card */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>About</Text>
            <Field
              label="Bio"
              value={u.bio ?? ""}
              onChangeText={(v) => setU((prev) => ({ ...prev, bio: v }))}
              placeholder="Tell us about your builds..."
              multiline
            />
            <Field
              label="Location"
              value={u.location ?? ""}
              onChangeText={(v) => setU((prev) => ({ ...prev, location: v }))}
              placeholder="City, State"
              icon="location-outline"
            />
          </View>

          {/* Links Card */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Social Links</Text>
            <Field
              label="Instagram"
              value={u.links?.instagram ?? ""}
              onChangeText={(v) => setU((prev) => ({ ...prev, links: { ...(prev.links ?? {}), instagram: v } }))}
              placeholder="@username"
              icon="logo-instagram"
            />
            <Field
              label="YouTube"
              value={u.links?.youtube ?? ""}
              onChangeText={(v) => setU((prev) => ({ ...prev, links: { ...(prev.links ?? {}), youtube: v } }))}
              placeholder="@channel"
              icon="logo-youtube"
            />
            <Field
              label="Website"
              value={u.links?.website ?? ""}
              onChangeText={(v) => setU((prev) => ({ ...prev, links: { ...(prev.links ?? {}), website: v } }))}
              placeholder="yourdomain.com"
              icon="globe-outline"
            />
          </View>

          {/* Plus Card */}
          <View style={[s.card, hasPro && s.proCard]}>
            <View style={s.scottyHeader}>
              <View>
                <Text style={s.sectionTitle}>OVRTK Plus</Text>
                <Text style={s.scottyDesc}>
                  {me 
                    ? (hasPro ? "Unlimited Scotty chat, no daily limits" : "Ask Scotty unlimited questions") 
                    : `${quotaLeft ?? 10} free Scotty questions today`}
                </Text>
              </View>
              <Ionicons name="flash" size={32} color={hasPro ? C.good : C.accent} />
            </View>

            <TouchableOpacity
              onPress={() => setPaywallOpen(true)}
              style={[s.upgradeBtn, hasPro && s.upgradeBtnActive]}
              activeOpacity={0.9}
            >
              <Ionicons name={hasPro ? "checkmark-circle" : "flash"} size={18} color="#fff" />
              <Text style={s.upgradeTxt}>
                {hasPro ? "Plus Active" : "Get Unlimited Chat — $3.99/mo"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Settings Card */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Preferences</Text>

            <ToggleRow 
              label="Public profile" 
              value={publicProfile} 
              onValueChange={(v) => toggleAndSave("publicProfile", v)}
              icon="globe-outline"
            />
            <ToggleRow 
              label="Show garage value" 
              value={showGarageValue} 
              onValueChange={(v) => toggleAndSave("showGarageValue", v)}
              icon="cash-outline"
            />
            <ToggleRow 
              label="Show car values" 
              value={showCarValues} 
              onValueChange={(v) => toggleAndSave("showCarValues", v)}
              icon="pricetag-outline"
            />

            <View style={s.divider} />

            <ToggleRow 
              label="Build reminders" 
              value={notifBuilds} 
              onValueChange={(v) => toggleAndSave("notifBuilds", v)}
              icon="notifications-outline"
            />
            <ToggleRow 
              label="Scotty replies" 
              value={notifReplies} 
              onValueChange={(v) => toggleAndSave("notifReplies", v)}
              icon="chatbubble-outline"
            />

            {u.handle && publicProfile && (
              <>
                <View style={s.divider} />
                <TouchableOpacity 
                  onPress={shareProfile}
                  style={s.shareBtn}
                >
                  <Ionicons name="share-social" size={18} color={C.accent} />
                  <Text style={s.shareTxt}>Share Profile</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.muted} style={{ marginLeft: "auto" }} />
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Legal & Account */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>Legal & Support</Text>
            
            <TouchableOpacity 
              onPress={() => Linking.openURL("https://ovrtk.com/privacy.html")} 
              style={s.legalBtn}
            >
              <Ionicons name="shield-checkmark-outline" size={18} color={C.text} />
              <Text style={s.legalTxt}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={16} color={C.muted} style={{ marginLeft: "auto" }} />
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => Linking.openURL("https://ovrtk.com/terms.html")} 
              style={s.legalBtn}
            >
              <Ionicons name="document-text-outline" size={18} color={C.text} />
              <Text style={s.legalTxt}>Terms of Service</Text>
              <Ionicons name="chevron-forward" size={16} color={C.muted} style={{ marginLeft: "auto" }} />
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={openManageSubscription} 
              style={s.legalBtn}
            >
              <Ionicons name="card-outline" size={18} color={C.text} />
              <Text style={s.legalTxt}>Manage Subscription</Text>
              <Ionicons name="chevron-forward" size={16} color={C.muted} style={{ marginLeft: "auto" }} />
            </TouchableOpacity>

            <View style={s.divider} />

            <TouchableOpacity onPress={onSignOut} style={s.actionBtn} activeOpacity={0.9}>
              <Ionicons name="log-out-outline" size={18} color={C.text} />
              <Text style={s.actionTxt}>Sign Out</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                Alert.alert("Delete Account", "This action cannot be undone.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () =>
                      Alert.alert("Notice", "Account deletion requires recent login. Contact support for assistance."),
                  },
                ])
              }
              style={[s.actionBtn, s.deleteBtn]}
              activeOpacity={0.9}
            >
              <Ionicons name="trash-outline" size={18} color={C.accent} />
              <Text style={[s.actionTxt, { color: C.accent }]}>Delete Account</Text>
            </TouchableOpacity>
          </View>

          {!me && (
            <View style={s.guestCard}>
              <Ionicons name="information-circle-outline" size={24} color={C.muted} />
              <Text style={s.guestText}>
                You're browsing as a guest. Sign up to save your profile and builds.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating Save Button */}
      <TouchableOpacity
        onPress={saveProfile}
        disabled={saving}
        activeOpacity={0.9}
        style={[s.fab, saving && { opacity: 0.7 }]}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="save" size={20} color="#fff" />
            <Text style={s.fabTxt}>Save Changes</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Enhanced Toast */}
      {savedToast && (
        <Animated.View 
          style={[
            s.toast, 
            savedToast === "ok" ? s.toastSuccess : s.toastError,
            {
              opacity: toastOpacity,
              transform: [{ scale: toastScale }],
            }
          ]}
        >
          <View style={s.toastIcon}>
            <Ionicons
              name={savedToast === "ok" ? "checkmark-circle" : "close-circle"}
              size={28}
              color={savedToast === "ok" ? C.good : C.accent}
            />
          </View>
          <View style={s.toastContent}>
            <Text style={[s.toastTitle, { color: savedToast === "ok" ? C.good : C.accent }]}>
              {savedToast === "ok" ? "Saved" : "Error"}
            </Text>
            <Text style={s.toastSubtitle}>
              {savedToast === "ok" ? "Profile updated successfully" : "Could not save changes"}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Platform Choice Modal */}
      <Modal transparent visible={platformModalOpen} animationType="fade" onRequestClose={() => setPlatformModalOpen(false)}>
        <View style={platform.overlay}>
          <View style={platform.card}>
            <View style={platform.header}>
              <Ionicons name="exit-outline" size={36} color={C.accent} />
              <Text style={platform.title}>Leaving OVRTK</Text>
              <Text style={platform.subtitle}>Choose your platform to manage subscriptions</Text>
            </View>

            <View style={platform.buttons}>
              <TouchableOpacity 
                onPress={() => handlePlatformChoice("ios")}
                style={platform.platformBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-apple" size={32} color={C.text} />
                <Text style={platform.platformTxt}>iOS / App Store</Text>
                <Text style={platform.platformDesc}>Manage Apple subscriptions</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={() => handlePlatformChoice("android")}
                style={platform.platformBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-google-playstore" size={32} color={C.text} />
                <Text style={platform.platformTxt}>Android / Play Store</Text>
                <Text style={platform.platformDesc}>Manage Google subscriptions</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              onPress={() => setPlatformModalOpen(false)} 
              style={platform.cancelBtn}
            >
              <Text style={platform.cancelTxt}>Cancel</Text>
            </TouchableOpacity>

            <Text style={platform.notice}>
              You'll be redirected to your app store to manage your subscription
            </Text>
          </View>
        </View>
      </Modal>

      {/* Paywall */}
      <Modal transparent visible={paywallOpen} animationType="fade" onRequestClose={() => setPaywallOpen(false)}>
        <View style={pay.overlay}>
          <View style={pay.card}>
            <View style={pay.header}>
              <Ionicons name="flash" size={40} color={C.accent} />
              <Text style={pay.title}>OVRTK Plus</Text>
              <Text style={pay.subtitle}>Chat with Scotty without limits</Text>
            </View>

            <View style={pay.features}>
              <View style={pay.feature}>
                <Ionicons name="checkmark-circle" size={20} color={C.good} />
                <Text style={pay.featureTxt}>Unlimited AI chat questions</Text>
              </View>
              <View style={pay.feature}>
                <Ionicons name="checkmark-circle" size={20} color={C.good} />
                <Text style={pay.featureTxt}>No daily message limits</Text>
              </View>
              <View style={pay.feature}>
                <Ionicons name="checkmark-circle" size={20} color={C.good} />
                <Text style={pay.featureTxt}>Priority support</Text>
              </View>
              <View style={pay.feature}>
                <Ionicons name="checkmark-circle" size={20} color={C.good} />
                <Text style={pay.featureTxt}>Early access to new features</Text>
              </View>
            </View>

            <TouchableOpacity onPress={purchasePlus} disabled={busy} style={[pay.cta, busy && { opacity: 0.7 }]}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="flash" size={20} color="#fff" />
                  <Text style={pay.ctaTxt}>Get Plus — $3.99/month</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={restorePlus} disabled={busy} style={pay.restore}>
              <Text style={pay.restoreTxt}>Restore Purchases</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setPaywallOpen(false)} style={pay.close}>
              <Ionicons name="close-circle-outline" size={24} color={C.muted} />
            </TouchableOpacity>

            <Text style={pay.legal}>
              Auto-renews monthly. Cancel anytime in iOS Settings → Subscriptions.
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({
  label, value, onChangeText, placeholder, prefix, multiline, icon, children,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  multiline?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.inputWrap}>
        {icon && <Ionicons name={icon} size={18} color={C.muted} style={{ marginRight: 8 }} />}
        {prefix && <Text style={s.prefix}>{prefix}</Text>}
        <TextInput
          style={[s.input, multiline && { height: 90, textAlignVertical: "top", paddingTop: 12 }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          multiline={!!multiline}
        />
        {children}
      </View>
    </View>
  );
}

function ToggleRow({
  label, value, onValueChange, icon,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <TouchableOpacity 
      activeOpacity={0.7}
      onPress={() => onValueChange(!value)}
      style={s.toggleRow}
    >
      <View style={s.toggleLeft}>
        <View style={[s.iconCircle, value && s.iconCircleActive]}>
          <Ionicons name={icon} size={20} color={value ? "#111" : C.text} />
        </View>
        <Text style={s.toggleLabel}>{label}</Text>
      </View>
      <View style={s.switchLane}>
        <Switch 
          value={value} 
          onValueChange={onValueChange} 
          thumbColor="#fff" 
          trackColor={{ true: C.accent, false: C.line }}
          ios_backgroundColor={C.line}
        />
      </View>
    </TouchableOpacity>
  );
}

/* Styles */
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    paddingHorizontal: 16,
    paddingTop: 1,
    paddingBottom: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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

  headerRight: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },

  proBadge: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    backgroundColor: C.good,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  proBadgeTxt: { color: "#111", fontWeight: "900", fontSize: 11 },

  publicBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
  },
  publicBtnTxt: { color: C.text, fontWeight: "800", fontSize: 12 },

  avatarSection: { alignItems: "center", paddingVertical: 24 },
  avatarContainer: { position: "relative" },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: C.dim,
    borderWidth: 3,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarLetter: { color: C.text, fontSize: 36, fontWeight: "900" },

  card: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 16,
  },
  proCard: {
    borderColor: C.good,
    backgroundColor: "rgba(34, 197, 94, 0.05)",
  },
  sectionTitle: { color: C.text, fontWeight: "900", fontSize: 17, marginBottom: 4 },

  label: { color: C.muted, fontSize: 13, fontWeight: "600", marginBottom: 8 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.dim,
    paddingHorizontal: 14,
  },
  prefix: { color: C.muted, marginRight: 4, fontSize: 15, fontWeight: "600" },
  input: { flex: 1, color: C.text, height: 48, fontSize: 15 },

  handleBadge: { 
    marginLeft: 8, 
    paddingHorizontal: 8, 
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.muted,
  },

  scottyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  scottyDesc: { color: C.muted, fontSize: 13, marginTop: 4 },

  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  upgradeBtnActive: {
    backgroundColor: C.good,
  },
  upgradeTxt: { color: "#fff", fontWeight: "900", fontSize: 15 },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    minHeight: 58,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingRight: 16,
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.dim,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  toggleLabel: { 
    color: C.text, 
    fontSize: 16, 
    fontWeight: "600",
    flexShrink: 1,
    letterSpacing: 0.2,
  },
  switchLane: {
    width: 51,
    alignItems: "flex-end",
    justifyContent: "center",
  },

  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  shareTxt: { 
    color: C.accent, 
    fontWeight: "700", 
    flex: 1,
    fontSize: 15,
  },

  legalBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  legalTxt: { color: C.text, fontWeight: "600", flex: 1 },

  divider: {
    height: 1,
    backgroundColor: C.line,
    marginVertical: 12,
  },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: C.dim,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  actionTxt: { color: C.text, fontWeight: "800", fontSize: 15 },
  deleteBtn: {
    backgroundColor: "rgba(225, 29, 72, 0.08)",
    borderColor: "rgba(225, 29, 72, 0.3)",
  },

  guestCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderStyle: "dashed",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  guestText: { color: C.muted, flex: 1, fontSize: 14 },

  fab: {
    position: "absolute",
    right: 16,
    bottom: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.accent,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  fabTxt: { color: "#fff", fontWeight: "900", fontSize: 15 },

  toast: {
    position: "absolute",
    alignSelf: "center",
    top: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 15,
  },
  toastSuccess: {
    backgroundColor: "rgba(18, 19, 24, 0.95)",
    borderColor: C.good,
  },
  toastError: {
    backgroundColor: "rgba(18, 19, 24, 0.95)",
    borderColor: C.accent,
  },
  toastIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  toastContent: {
    flex: 1,
  },
  toastTitle: { 
    fontWeight: "900", 
    fontSize: 18,
    letterSpacing: 0.5,
  },
  toastSubtitle: { 
    color: C.muted, 
    fontSize: 13, 
    marginTop: 2,
    fontWeight: "600",
  },
});

const platform = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: C.panel,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: C.line,
  },
  header: {
    alignItems: "center",
    marginBottom: 28,
  },
  title: {
    color: C.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 12,
  },
  subtitle: {
    color: C.muted,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  buttons: {
    gap: 12,
    marginBottom: 16,
  },
  platformBtn: {
    backgroundColor: C.dim,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  platformTxt: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  platformDesc: {
    color: C.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  cancelTxt: {
    color: C.text,
    fontWeight: "700",
    fontSize: 16,
  },
  notice: {
    color: C.muted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 18,
  },
});

const pay = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: C.panel,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: C.line,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    color: C.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: 12,
  },
  subtitle: {
    color: C.muted,
    fontSize: 15,
    marginTop: 6,
    textAlign: "center",
  },
  features: {
    gap: 14,
    marginBottom: 24,
  },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureTxt: {
    color: C.text,
    fontSize: 15,
    fontWeight: "600",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: C.accent,
    paddingVertical: 16,
    borderRadius: 16,
  },
  ctaTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },
  restore: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  restoreTxt: {
    color: C.text,
    fontWeight: "700",
    fontSize: 15,
  },
  close: {
    position: "absolute",
    top: 16,
    right: 16,
  },
  legal: {
    color: C.muted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 16,
  },
});
