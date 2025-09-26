// apps/mobile/app/(tabs)/profile/index.tsx
import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Switch,
  ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView, Linking, Image, Modal
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";


import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, db, storage } from "../../../lib/firebase";
import {
  doc, getDoc, setDoc, serverTimestamp, updateDoc, collection, query, where, getDocs, limit,
} from "firebase/firestore";
import { ensureUploadAllowed } from "../../../lib/uploadGate";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// 💳 RevenueCat
import Purchases, {
  CustomerInfo,
  PACKAGE_TYPE,
  PurchasesPackage,
} from "react-native-purchases";

const ENV_ENTITLEMENT = process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID?.trim();
const ENTITLEMENT_ID = ENV_ENTITLEMENT || "pro_uploads"; // make sure this matches your RC entitlement id
const PRODUCT_ID_FALLBACK = "com.rwxtek.ovrtk.plus.monthly"; // safety net during propagation

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
};

const STORAGE_KEY = "ovrtk.chat.guest.quota";

// helper: detect a user-cancelled purchase without relying on SDK enums
function isUserCancelled(err: any) {
  const code = err?.code;
  return (
    err?.userCancelled === true ||
    code === "PURCHASE_CANCELLED" ||
    code === "UserCancelled" ||
    // some SDKs stringify like this
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

  const [u, setU] = useState<UserDoc>({});
  const [notifBuilds, setNotifBuilds] = useState(true);
  const [notifReplies, setNotifReplies] = useState(true);
  const [quotaLeft, setQuotaLeft] = useState<number | null>(null);

  // handle status
  const [handleStatus, setHandleStatus] =
    useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");

  // Plus state
  const [hasPro, setHasPro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setMe), []);

  // load profile doc
  useEffect(() => {
    (async () => {
      if (!me) { setLoading(false); return; }
      try {
        const userRef = doc(db, "users", me.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          setU(snap.data() as UserDoc);
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

  // guest quota sample
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

  // RevenueCat: react to customer updates
useEffect(() => {
  const listener = (info: CustomerInfo) => {
    const active = !!info.entitlements.active[ENTITLEMENT_ID];
    setHasPro(active);
  };

  Purchases.addCustomerInfoUpdateListener(listener);

  // initial fetch
  (async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      const active = !!info.entitlements.active[ENTITLEMENT_ID];
      setHasPro(active);
    } catch {
      setHasPro(false);
    }
  })();

  // proper cleanup for SDKs that don't return a remover
  return () => {
    try {
      // some SDK versions expose this remover, others no-op – both are safe
      // @ts-ignore – older type defs may not include it
      Purchases.removeCustomerInfoUpdateListener?.(listener);
    } catch {}
  };
}, []);


  // prefetch offerings (for UI / fallback)
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

  const pickBestMonthly = () => {
    const monthly = packages.find(p => p.packageType === PACKAGE_TYPE.MONTHLY);
    return monthly ?? packages[0];
  };

  // purchase via default offering ($rc_monthly)
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
        Alert.alert("Activated", "OVRTK Plus is live. Enjoy unlimited uploads.");
      } else if (packages.length) {
        // fallback to prefetched list if current is temporarily empty
        const pkg = pickBestMonthly();
        await Purchases.purchasePackage(pkg);
        setPaywallOpen(false);
        Alert.alert("Activated", "OVRTK Plus is live. Enjoy unlimited uploads.");
      } else {
        // last-resort: direct product id while App Store/RC propagate
        await Purchases.purchaseProduct(PRODUCT_ID_FALLBACK);
        setPaywallOpen(false);
        Alert.alert("Activated", "OVRTK Plus is live. Enjoy unlimited uploads.");
      }
    } catch (e: any) {
      if (isUserCancelled(e)) {
        Alert.alert("Upgrade", "Purchase cancelled");
      } else {
        const msg = String(e?.message ?? e ?? "");
        // surface common setup issues to console
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
        active ? "Welcome back — Plus restored." : "No active subscription found."
      );
    } catch (e) {
      Alert.alert("Restore", "Could not restore purchases.");
    } finally {
      setBusy(false);
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

  // live badge while typing handle
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await updateDoc(doc(db, "users", me.uid), { ...u, updatedAt: serverTimestamp() });
      setSavedToast("ok");
      setTimeout(() => setSavedToast(null), 1500);
    } catch (e: any) {
      console.log("saveProfile error:", e?.message || e);
      setSavedToast("err");
      setTimeout(() => setSavedToast(null), 2000);
      Alert.alert("Error", "Could not save profile.");
    } finally {
      setSaving(false);
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
  
    // ✅ check subscription/quota before any upload
    const ok = await ensureUploadAllowed();
    if (!ok) {
      // show your paywall if they’re out of free uploads / not subscribed
      setPaywallOpen(true);
      return;
    }
  
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return;
  
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      Alert.alert("Avatar", "Couldn’t update photo.");
    }
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

  return (
    <SafeAreaView style={[s.safe, { paddingBottom: insets.bottom || 10 }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: (insets.bottom || 10) + 100 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar */}
          <TouchableOpacity onPress={pickAvatar} style={s.avatarWrap} activeOpacity={0.9}>
            <View style={[s.avatar, { overflow: "hidden" }]}>
              {u.avatarURL ? (
                <Image source={{ uri: u.avatarURL }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <Text style={s.avatarLetter}>{(u.displayName ?? "D").slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <Text style={s.changePhoto}>{hasPro ? "Change photo" : "Upgrade to change photo"}</Text>
          </TouchableOpacity>

          {/* Identity */}
          <View style={s.card}>
            <View style={{ gap: 8 }}>
              <Field
                label="Display name"
                value={u.displayName ?? ""}
                onChangeText={(v) => setU((prev) => ({ ...prev, displayName: v }))}
                placeholder="Driver"
              />
              <Field
                label="Handle"
                value={u.handle ?? ""}
                onChangeText={(v) => setU((prev) => ({ ...prev, handle: v.toLowerCase() }))}
                placeholder="handle"
                prefix="@"
              >
                <View style={s.handleBadge}>
                  {handleStatus === "checking" && <Text style={s.badgeTxt}>Checking…</Text>}
                  {handleStatus === "ok" && <Text style={[s.badgeTxt, { color: C.good }]}>Available</Text>}
                  {handleStatus === "taken" && <Text style={[s.badgeTxt, { color: C.accent }]}>Taken</Text>}
                  {handleStatus === "invalid" && <Text style={[s.badgeTxt, { color: C.accent }]}>Invalid</Text>}
                </View>
              </Field>
            </View>

            <Field
              label="Bio"
              value={u.bio ?? ""}
              onChangeText={(v) => setU((prev) => ({ ...prev, bio: v }))}
              placeholder="140 characters about you"
              multiline
            />
            <Field
              label="Location"
              value={u.location ?? ""}
              onChangeText={(v) => setU((prev) => ({ ...prev, location: v }))}
              placeholder="City, ST"
            />
          </View>

          {/* Links */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Links</Text>
            <Field
              label="Instagram"
              value={u.links?.instagram ?? ""}
              onChangeText={(v) => setU((prev) => ({ ...prev, links: { ...(prev.links ?? {}), instagram: v } }))}
              placeholder="instagram.com/you"
            />
            <Field
              label="YouTube"
              value={u.links?.youtube ?? ""}
              onChangeText={(v) => setU((prev) => ({ ...prev, links: { ...(prev.links ?? {}), youtube: v } }))}
              placeholder="youtube.com/@you"
            />
            <Field
              label="Website"
              value={u.links?.website ?? ""}
              onChangeText={(v) => setU((prev) => ({ ...prev, links: { ...(prev.links ?? {}), website: v } }))}
              placeholder="yourdomain.com"
            />
          </View>

          {/* Scotty usage + Upgrade */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Scotty</Text>
            <Text style={s.muted}>
              {me ? (hasPro ? "Plus: unlimited uploads & messages" : "Free: uploads locked") : `Guest: ${quotaLeft ?? "—"} free today`}
            </Text>

            <TouchableOpacity
              onPress={() => setPaywallOpen(true)}
              style={s.upgradeBtn}
              activeOpacity={0.9}
            >
              <Ionicons name="flash" size={16} color="#111" />
              <Text style={s.upgradeTxt}>{hasPro ? "Plus Active" : "Upgrade — $3.99/mo"}</Text>
            </TouchableOpacity>
          </View>

          {/* Settings */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Settings</Text>

            <ToggleRow label="Build reminders" value={notifBuilds} onValueChange={setNotifBuilds} />
            <ToggleRow label="Replies from Scotty" value={notifReplies} onValueChange={setNotifReplies} />

            {/* Legal links */}
            <View style={{ height: 10 }} />
            <View style={s.row}>
              <TouchableOpacity onPress={() => Linking.openURL("https://ovrtk-117f6.web.app/privacy.html")} style={s.linkBtn}>
                <Ionicons name="document-text-outline" size={16} color={C.muted} />
                <Text style={s.linkTxt}>Privacy Policy</Text>
              </TouchableOpacity>

              <View style={{ width: 16 }} />

              <TouchableOpacity onPress={() => Linking.openURL("https://ovrtk-117f6.web.app/terms.html")} style={s.linkBtn}>
                <Ionicons name="shield-checkmark-outline" size={16} color={C.muted} />
                <Text style={s.linkTxt}>Terms</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 8 }} />

            <TouchableOpacity onPress={onSignOut} style={s.secondary} activeOpacity={0.9}>
              <Ionicons name="log-out-outline" size={18} color={C.text} />
              <Text style={s.secondaryTxt}>Sign out</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                Alert.alert("Delete account", "This cannot be undone.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () =>
                      Alert.alert("Heads up", "Account deletion requires recent login; implement server-side."),
                  },
                ])
              }
              style={[s.secondary, { marginTop: 8, borderColor: "#381018", backgroundColor: "#19090d" }]}
              activeOpacity={0.9}
            >
              <Ionicons name="trash-outline" size={18} color={C.accent} />
              <Text style={[s.secondaryTxt, { color: C.accent }]}>Delete account</Text>
            </TouchableOpacity>
          </View>

          {!me && (
            <View style={[s.card, { borderStyle: "dashed" }]}>
              <Text style={s.muted}>You’re browsing as guest. Sign up or log in to save your profile.</Text>
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
          <ActivityIndicator color="#111" />
        ) : (
          <>
            <Ionicons name="save-outline" size={18} color="#111" />
            <Text style={s.fabTxt}>Save</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Tiny toast */}
      {savedToast && (
        <View style={[s.toast, savedToast === "ok" ? { borderColor: "#12401f", backgroundColor: "#0f1a13" } : { borderColor: "#3c141a", backgroundColor: "#1a0f11" }]}>
          <Ionicons
            name={savedToast === "ok" ? "checkmark-circle-outline" : "alert-circle-outline"}
            size={16}
            color={savedToast === "ok" ? C.good : C.accent}
          />
          <Text style={[s.toastTxt, { color: savedToast === "ok" ? C.good : C.accent }]}>
            {savedToast === "ok" ? "Saved" : "Save failed"}
          </Text>
        </View>
      )}

      {/* 💳 Paywall */}
      <Modal transparent visible={paywallOpen} animationType="fade" onRequestClose={() => setPaywallOpen(false)}>
        <View style={pay.wrap}>
          <View style={pay.card}>
            <Text style={pay.title}>OVRTK Plus</Text>
            <Text style={pay.sub}>Unlimited image uploads + future Pro perks.</Text>

            <TouchableOpacity onPress={purchasePlus} disabled={busy} style={[pay.cta, busy && { opacity: 0.7 }]}>
              {busy ? <ActivityIndicator /> : <Text style={pay.ctaTxt}>Subscribe — $3.99 / month</Text>}
            </TouchableOpacity>

            <View style={{ height: 8 }} />
            <TouchableOpacity onPress={restorePlus} disabled={busy} style={pay.secondary}>
              <Text style={pay.secondaryTxt}>Restore Purchases</Text>
            </TouchableOpacity>

            <View style={{ height: 6 }} />
            <TouchableOpacity onPress={() => setPaywallOpen(false)} style={pay.secondary}>
              <Text style={pay.secondaryTxt}>Not now</Text>
            </TouchableOpacity>

            <Text style={pay.legal}>Auto-renews. Manage or cancel in iOS Settings.</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({
  label, value, onChangeText, placeholder, prefix, multiline, children,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  multiline?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.inputWrap, { alignItems: "center" }]}>
        {prefix ? <Text style={s.prefix}>{prefix}</Text> : null}
        <TextInput
          style={[s.input, multiline && { height: 84, textAlignVertical: "top", paddingTop: 10 }]}
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
  label, value, onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={[s.row, { paddingVertical: 6 }]}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Switch value={value} onValueChange={onValueChange} thumbColor="#fff" trackColor={{ true: C.accent, false: "#444" }} />
    </View>
  );
}

/* ---------- styles ---------- */
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  avatarWrap:{ alignSelf:"center", alignItems:"center", marginTop:12, marginBottom:4 },
  avatar:{ width:84, height:84, borderRadius:999, backgroundColor:"#0f1218", borderWidth:1, borderColor:C.line, alignItems:"center", justifyContent:"center" },
  avatarLetter:{ color:C.text, fontSize:28, fontWeight:"900" },
  changePhoto:{ color:C.muted, fontSize:12, marginTop:6 },

  card: {
    marginTop: 12, marginHorizontal: 12, backgroundColor: C.panel,
    borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { color: C.muted, fontSize: 12 },
  muted: { color: C.muted },

  inputWrap: {
    marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.dim, paddingHorizontal: 12, flexDirection: "row", alignItems: "center",
  },
  prefix: { color: C.muted, marginRight: 6, includeFontPadding: false },
  input: { flex: 1, color: C.text, height: 44 },

  cardTitle: { color: C.text, fontWeight: "900", fontSize: 16 },

  secondary: {
    marginTop: 6, backgroundColor: C.dim, borderWidth: 1, borderColor: C.line,
    borderRadius: 12, paddingVertical: 12, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  secondaryTxt: { color: C.text, fontWeight: "800" },

  linkBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  linkTxt: { color: C.text, fontWeight: "800" },

  upgradeBtn: {
    marginTop: 12, alignSelf: "flex-start", flexDirection: "row", alignItems: "center",
    gap: 8, backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10,
  },
  upgradeTxt: { color: "#111", fontWeight: "900" },

  handleBadge:{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#0f1218", borderWidth: 1, borderColor: C.line },
  badgeTxt:{ color: C.muted, fontSize: 11, fontWeight: "800" },

  fab: {
    position: "absolute",
    right: 16,
    bottom: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.accent,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3a0c18",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },

  fabTxt: { color: "#111", fontWeight: "900" },

  toast: {
    position: "absolute",
    alignSelf: "center",
    bottom: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  toastTxt: { fontWeight: "800", fontSize: 12 },
});

// 💳 Paywall styles
const pay = StyleSheet.create({
  wrap:{flex:1,backgroundColor:"rgba(0,0,0,0.6)",alignItems:"center",justifyContent:"center"},
  card:{width:"88%",backgroundColor:"#121318",padding:16,borderRadius:16,borderWidth:1,borderColor:"#1E2127"},
  title:{color:"#E7EAF0",fontSize:18,fontWeight:"900"},
  sub:{color:"#A6ADBB",marginTop:6},
  cta:{marginTop:14,backgroundColor:"#E11D48",paddingVertical:12,borderRadius:999,alignItems:"center"},
  ctaTxt:{color:"#111",fontWeight:"900"},
  secondary:{paddingVertical:10,borderRadius:12,borderWidth:1,borderColor:"#1E2127",alignItems:"center"},
  secondaryTxt:{color:"#E7EAF0",fontWeight:"800"},
  legal:{color:"#A6ADBB",fontSize:11,textAlign:"center",marginTop:8}
});
