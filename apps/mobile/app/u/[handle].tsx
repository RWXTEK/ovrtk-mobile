// app/u/[handle].tsx
import { useEffect, useMemo, useState } from "react";
import {
  View, Text, Image, StyleSheet, TouchableOpacity,
  Linking, ActivityIndicator, ScrollView, Share
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

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

type UserProfile = {
  uid: string;
  displayName?: string;
  handle?: string;
  avatarURL?: string;
  bio?: string;
  location?: string;
  links?: Links;
  publicProfile?: boolean;
  showGarageValue?: boolean;
  showCarValues?: boolean;
  verified?: boolean;
};

type Car = {
  id: string;
  make: string;
  model: string;
  year?: number;
  trim?: string;
  photoURL?: string;
  currentValue?: number;
};

export default function PublicProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ handle?: string | string[] }>();
  const handle = Array.isArray(params.handle) ? params.handle[0] : params.handle;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [cars, setCars] = useState<Car[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!handle) {
        setLoading(false);
        return;
      }

      try {
        console.log("Loading profile for handle:", handle);
        
        const usersRef = collection(db, "users");
        const qy = query(usersRef, where("handle", "==", handle.toLowerCase()));
        const userSnap = await getDocs(qy);

        if (userSnap.empty) {
          console.log("No user found with handle:", handle);
          setLoading(false);
          return;
        }

        const userData = userSnap.docs[0].data() as UserProfile;
        const uid = userSnap.docs[0].id;

        console.log("User found:", uid, "Public:", userData.publicProfile);

        if (!userData.publicProfile) {
          console.log("Profile is private");
          setLoading(false);
          return;
        }

        setProfile({ ...userData, uid });
        setLoading(false);

        // Load cars separately
        try {
          console.log("Loading cars for user:", uid);
          const carsRef = collection(db, "garages", uid, "cars");
          const carsQ = query(carsRef, orderBy("createdAt", "desc"));
          const carsSnap = await getDocs(carsQ);
          
          console.log("Cars found:", carsSnap.docs.length);
          
          const carsList = carsSnap.docs.map(d => {
            const data = d.data();
            console.log("Car data:", d.id, data);
            return { id: d.id, ...data } as Car;
          });
          
          setCars(carsList);
        } catch (carError) {
          console.error("Error loading cars:", carError);
        } finally {
          setCarsLoading(false);
        }
      } catch (e) {
        console.error("Error loading profile:", e);
        setLoading(false);
        setCarsLoading(false);
      }
    })();
  }, [handle]);

  const totalValue = useMemo(
    () => cars.reduce((sum, c) => sum + (c.currentValue || 0), 0),
    [cars]
  );
  const avgValue = cars.length ? totalValue / cars.length : 0;

  const formatK = (n: number) => {
    if (!n || isNaN(n)) return "0k";
    return `${Math.round(n / 1000)}k`;
  };

  const normalizeLink = (kind: keyof Links, raw?: string) => {
    if (!raw) return undefined;
    let v = raw.trim();

    if (v.startsWith("@")) v = v.slice(1);

    if (kind === "instagram") {
      if (!/^https?:\/\//i.test(v)) return `https://instagram.com/${v}`;
      return v;
    }
    if (kind === "youtube") {
      if (!/^https?:\/\//i.test(v)) {
        if (v.startsWith("channel/") || v.startsWith("c/")) return `https://youtube.com/${v}`;
        return `https://youtube.com/@${v}`;
      }
      return v;
    }
    if (!/^https?:\/\//i.test(v)) return `https://${v}`;
    return v;
  };

  const openLink = (url?: string) => {
    if (!url) return;
    Linking.openURL(url);
  };

  const shareProfile = async () => {
    try {
      await Share.share({
        message: `Check out ${profile?.displayName || "this"}'s garage on OVRTK: https://ovrtk.com/u/${handle}`,
        title: `${profile?.displayName || "OVRTK"}'s Garage`,
      });
    } catch {}
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/garage");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={s.loadingTxt}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Ionicons name="person-circle-outline" size={80} color={C.muted} />
          <Text style={s.notFoundTitle}>Profile Not Found</Text>
          <Text style={s.notFoundDesc}>This user doesn't exist or has a private profile</Text>
          <TouchableOpacity onPress={goBack} style={s.backBtn} activeOpacity={0.9}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={s.backBtnTxt}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const ig = normalizeLink("instagram", profile.links?.instagram);
  const yt = normalizeLink("youtube", profile.links?.youtube);
  const web = normalizeLink("website", profile.links?.website);

  return (
    <SafeAreaView style={[s.safe, { paddingBottom: insets.bottom }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={goBack} style={s.headerBtn} activeOpacity={0.9}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={shareProfile} style={s.headerBtn} activeOpacity={0.9}>
          <Ionicons name="share-social" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.profileSection}>
          <View style={s.avatarWrapper}>
            <View style={s.avatar}>
              {profile.avatarURL ? (
                <Image source={{ uri: profile.avatarURL }} style={s.avatarImg} />
              ) : (
                <Text style={s.avatarLetter}>
                  {(profile.displayName ?? "D").slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>

            {profile.verified && (
              <View style={s.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={24} color={C.good} />
              </View>
            )}
          </View>

          <Text style={s.displayName}>{profile.displayName || "Driver"}</Text>
          <Text style={s.handleTxt}>@{profile.handle}</Text>

          {profile.bio ? <Text style={s.bio}>{profile.bio}</Text> : null}

          {profile.location && (
            <View style={s.infoRow}>
              <Ionicons name="location" size={16} color={C.accent} />
              <Text style={s.infoTxt}>{profile.location}</Text>
            </View>
          )}

          {(ig || yt || web) && (
            <View style={s.socialLinks}>
              {ig && (
                <TouchableOpacity onPress={() => openLink(ig)} style={s.socialBtn} activeOpacity={0.8}>
                  <Ionicons name="logo-instagram" size={22} color={C.text} />
                </TouchableOpacity>
              )}
              {yt && (
                <TouchableOpacity onPress={() => openLink(yt)} style={s.socialBtn} activeOpacity={0.8}>
                  <Ionicons name="logo-youtube" size={22} color={C.text} />
                </TouchableOpacity>
              )}
              {web && (
                <TouchableOpacity onPress={() => openLink(web)} style={s.socialBtn} activeOpacity={0.8}>
                  <Ionicons name="globe" size={22} color={C.text} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {carsLoading ? (
          <View style={s.loadingSection}>
            <ActivityIndicator size="small" color={C.accent} />
            <Text style={s.loadingTxt}>Loading garage...</Text>
          </View>
        ) : cars.length > 0 ? (
          <>
            <View style={s.statsSection}>
              <Text style={s.sectionTitle}>Garage Stats</Text>
              <View style={s.statsGrid}>
                <View style={s.statCard}>
                  <Ionicons name="car-sport" size={28} color={C.accent} />
                  <Text style={s.statValue}>{cars.length}</Text>
                  <Text style={s.statLabel}>{cars.length === 1 ? "Vehicle" : "Vehicles"}</Text>
                </View>

                {profile.showGarageValue && totalValue > 0 && (
                  <>
                    <View style={s.statCard}>
                      <Ionicons name="cash" size={28} color={C.good} />
                      <Text style={[s.statValue, { color: C.good }]}>${formatK(totalValue)}</Text>
                      <Text style={s.statLabel}>Total Value</Text>
                    </View>

                    <View style={s.statCard}>
                      <Ionicons name="trending-up" size={28} color={C.muted} />
                      <Text style={s.statValue}>${formatK(avgValue)}</Text>
                      <Text style={s.statLabel}>Avg Value</Text>
                    </View>
                  </>
                )}
              </View>
            </View>

            <View style={s.carsSection}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Collection</Text>
                <View style={s.countBadge}>
                  <Text style={s.countBadgeTxt}>{cars.length}</Text>
                </View>
              </View>

              <View style={s.carsGrid}>
                {cars.map((car) => (
                  <View key={car.id} style={s.carCard}>
                    <View style={s.carImgWrapper}>
                      {car.photoURL ? (
                        <>
                          <Image source={{ uri: car.photoURL }} style={s.carImg} />
                          <LinearGradient
                            colors={["transparent", "rgba(12, 13, 17, 0.9)"]}
                            style={s.carGradient}
                          />
                        </>
                      ) : (
                        <View style={s.carImgPlaceholder}>
                          <LinearGradient
                            colors={[C.accent + "20", C.accent + "05"]}
                            style={StyleSheet.absoluteFill}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                          />
                          <Ionicons name="car-sport" size={48} color={C.accent + "40"} />
                        </View>
                      )}
                    </View>

                    <View style={s.carInfo}>
                      <Text style={s.carYear}>{car.year || "—"}</Text>
                      <Text style={s.carTitle} numberOfLines={2}>
                        {car.make} {car.model}
                      </Text>
                      {car.trim ? <Text style={s.carTrim} numberOfLines={1}>{car.trim}</Text> : null}
                      {profile.showCarValues && !!car.currentValue && (
                        <View style={s.carValueRow}>
                          <Ionicons name="pricetag" size={14} color={C.good} />
                          <Text style={s.carValue}>${Number(car.currentValue).toLocaleString()}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : (
          <View style={s.emptyState}>
            <View style={s.emptyIcon}>
              <Ionicons name="car-sport-outline" size={56} color={C.muted} />
            </View>
            <Text style={s.emptyTitle}>No Vehicles Yet</Text>
            <Text style={s.emptyDesc}>This garage is empty for now</Text>
          </View>
        )}

        <View style={s.footer}>
          <Text style={s.footerTxt}>Powered by RWXTEK INC.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },

  loadingTxt: { color: C.muted, marginTop: 12, fontSize: 14 },
  loadingSection: {
    alignItems: "center",
    paddingVertical: 32,
  },

  notFoundTitle: { color: C.text, fontSize: 22, fontWeight: "900", marginTop: 16 },
  notFoundDesc: { color: C.muted, fontSize: 14, marginTop: 8, textAlign: "center" },
  backBtn: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 15 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.panel,
    alignItems: "center",
    justifyContent: "center",
  },

  profileSection: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  avatarWrapper: { position: "relative" },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: C.dim,
    borderWidth: 4,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarLetter: { color: C.text, fontSize: 40, fontWeight: "900" },
  verifiedBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 2,
  },

  displayName: { color: C.text, fontSize: 26, fontWeight: "900", marginTop: 16 },
  handleTxt: { color: C.accent, fontSize: 16, marginTop: 4, fontWeight: "600" },
  bio: {
    color: C.text,
    fontSize: 15,
    marginTop: 16,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: "90%",
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  infoTxt: { color: C.muted, fontSize: 14, fontWeight: "500" },

  socialLinks: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  socialBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },

  statsSection: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  statValue: { color: C.text, fontSize: 22, fontWeight: "900" },
  statLabel: {
    color: C.muted,
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "700",
  },

  carsSection: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  countBadge: {
    backgroundColor: C.accent,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  countBadgeTxt: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },

  carsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  carCard: {
    width: "48%",
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    overflow: "hidden",
  },
  carImgWrapper: { position: "relative" },
  carImg: {
    width: "100%",
    aspectRatio: 1,
  },
  carImgPlaceholder: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: C.dim,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  carGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
  },
  carInfo: { padding: 12, gap: 4 },
  carYear: { color: C.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  carTitle: { color: C.text, fontWeight: "900", fontSize: 15 },
  carTrim: { color: C.muted, fontSize: 12, fontWeight: "500" },
  carValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  carValue: { color: C.good, fontSize: 14, fontWeight: "800" },

  emptyState: {
    alignItems: "center",
    paddingVertical: 64,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  emptyDesc: { color: C.muted, fontSize: 14 },

  footer: {
    alignItems: "center",
    paddingVertical: 32,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  footerTxt: { color: C.muted, fontSize: 12, fontWeight: "600" },
});