// app/u/[handle].tsx - FIXED FOLLOWER COUNTS ✨
import { useEffect, useMemo, useState } from "react";
import {
  View, Text, Image, StyleSheet, TouchableOpacity,
  Linking, ActivityIndicator, ScrollView, Share, Dimensions, Alert, Modal
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, query, where, getDocs, orderBy, doc, setDoc, deleteDoc, getDoc, updateDoc, arrayUnion, arrayRemove, limit } from "firebase/firestore";import { db, auth } from "../../lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getUserTier } from "../../lib/revenuecat";


const { width } = Dimensions.get("window");

const C = {
  bg: "#0C0D11",
  panel: "#121318",
  line: "#1E2127",
  text: "#E7EAF0",
  muted: "#A6ADBB",
  accent: "#E11D48",
  dim: "#0f1218",
  good: "#22c55e",
  blue: "#3b82f6",
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

// Add this Post type
type Post = {
  id: string;
  userId: string;
  username: string;
  handle: string;
  userAvatar?: string;
  content: string;
  imageUrl?: string;
  category: string;
  likes: string[];
  commentCount: number;
  timestamp: any;
};

export default function PublicProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ handle?: string | string[] }>();
  const handle = Array.isArray(params.handle) ? params.handle[0] : params.handle;
  const currentUser = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [cars, setCars] = useState<Car[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);

  // New states for follow functionality
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  const [userTier, setUserTier] = useState<'FREE' | 'PLUS' | 'CLUB' | 'TRACK_MODE'>('FREE');

  const [selectedCar, setSelectedCar] = useState<Car | null>(null);
  const [carDetailModalVisible, setCarDetailModalVisible] = useState(false);

  // Add these
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  // Load profile and check follow status
  useEffect(() => {
    (async () => {
      if (!handle) {
        setLoading(false);
        return;
      }

      try {
        const usersRef = collection(db, "users");
        const qy = query(usersRef, where("handle", "==", handle.toLowerCase()));
        const userSnap = await getDocs(qy);

        if (userSnap.empty) {
          setLoading(false);
          return;
        }

        const userData = userSnap.docs[0].data() as UserProfile;
        const uid = userSnap.docs[0].id;

        if (!userData.publicProfile) {
          setLoading(false);
          return;
        }

        setProfile({ ...userData, uid });
        setUserTier((userData as any).subscriptionTier || 'FREE'); // Read tier from Firestore
        setLoading(false);

        // Load followers/following counts for THIS profile
        await loadFollowCounts(uid);

        // Check if current user is following this profile
        if (currentUser) {
          await checkFollowStatus(uid);
        }

        // Load cars
        try {
          const carsRef = collection(db, "garages", uid, "cars");
          const carsQ = query(carsRef, orderBy("createdAt", "desc"));
          const carsSnap = await getDocs(carsQ);

          const carsList = carsSnap.docs.map(d => {
            const data = d.data();
            return { id: d.id, ...data } as Car;
          });
          setCars(carsList);
        } catch (carError) {
          console.error("Error loading cars:", carError);
        } finally {
          setCarsLoading(false);
        }

        // Load posts - ADD THIS BLOCK
        try {
          const postsRef = collection(db, "posts");
          const postsQ = query(
            postsRef,
            where("userId", "==", uid),
            orderBy("timestamp", "desc"),
            limit(10)
          );
          const postsSnap = await getDocs(postsQ);

          const postsList = postsSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
          })) as Post[];

          setPosts(postsList);
        } catch (postError) {
          console.error("Error loading posts:", postError);
        } finally {
          setPostsLoading(false);
        }
      } catch (e) {


        console.error("Error loading profile:", e);
        setLoading(false);
        setCarsLoading(false);
      }
    })();
  }, [handle, currentUser]);

  // Load followers/following counts for the profile being viewed
  const loadFollowCounts = async (profileUid: string) => {
    try {
      console.log("Loading follow counts for user:", profileUid);

      // Get from the follows document instead of subcollections
      const followDoc = await getDoc(doc(db, 'follows', profileUid));

      if (followDoc.exists()) {
        const data = followDoc.data();
        const followersArray = data.followers || [];
        const followingArray = data.following || [];

        console.log("Followers count:", followersArray.length);
        console.log("Following count:", followingArray.length);

        setFollowersCount(followersArray.length);
        setFollowingCount(followingArray.length);
      } else {
        setFollowersCount(0);
        setFollowingCount(0);
      }
    } catch (error) {
      console.error("Error loading follow counts:", error);
    }
  };

  // Check if current user follows this profile
  const checkFollowStatus = async (profileUid: string) => {
    if (!currentUser || !profileUid) return;

    try {
      // Check current user's following array in the follows collection
      const followDoc = await getDoc(doc(db, "follows", currentUser.uid));

      if (followDoc.exists()) {
        const followingArray = followDoc.data()?.following || [];
        const following = followingArray.includes(profileUid);

        console.log(`Current user ${currentUser.uid} is following ${profileUid}:`, following);
        setIsFollowing(following);
      } else {
        setIsFollowing(false);
      }
    } catch (error) {
      console.error("Error checking follow status:", error);
    }
  };

  // Toggle follow/unfollow
  const toggleFollow = async () => {
    if (!currentUser || !profile) {
      Alert.alert("Sign In Required", "Please sign in to follow users");
      return;
    }

    if (currentUser.uid === profile.uid) {
      Alert.alert("Oops!", "You can't follow yourself");
      return;
    }

    setFollowLoading(true);

    try {
      const currentUserFollowRef = doc(db, 'follows', currentUser.uid);
      const profileFollowRef = doc(db, 'follows', profile.uid);

      if (isFollowing) {
        // Unfollow: remove from arrays
        console.log("Unfollowing user:", profile.uid);

        await Promise.all([
          // Remove profile.uid from current user's following array
          updateDoc(currentUserFollowRef, {
            following: arrayRemove(profile.uid)
          }),
          // Remove current user from profile's followers array
          updateDoc(profileFollowRef, {
            followers: arrayRemove(currentUser.uid)
          })
        ]);

        setIsFollowing(false);
        setFollowersCount(prev => Math.max(0, prev - 1));
        await loadFollowCounts(profile.uid);
      } else {
        // Follow: add to arrays
        console.log("Following user:", profile.uid);

        await Promise.all([
          // Add profile.uid to current user's following array
          setDoc(currentUserFollowRef, {
            following: arrayUnion(profile.uid)
          }, { merge: true }),
          // Add current user to profile's followers array
          setDoc(profileFollowRef, {
            followers: arrayUnion(currentUser.uid)
          }, { merge: true })
        ]);

        setIsFollowing(true);
        setFollowersCount(prev => prev + 1);
        await loadFollowCounts(profile.uid);
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
      Alert.alert("Error", "Failed to update follow status. Please try again.");
    } finally {
      setFollowLoading(false);
    }
  };

  const totalValue = useMemo(
    () => cars.reduce((sum, c) => sum + (c.currentValue || 0), 0),
    [cars]
  );
  const avgValue = cars.length ? totalValue / cars.length : 0;

  const formatK = (n: number) => {
    if (!n || isNaN(n)) return "0k";
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    return `${Math.round(n / 1000)}k`;
  };

  const formatCount = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  // Add this
  const formatTime = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate?.() || new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
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
    } catch { }
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
          <View style={s.notFoundIcon}>
            <Ionicons name="person-circle-outline" size={80} color={C.muted} />
          </View>
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

  // Check if viewing own profile
  const isOwnProfile = currentUser?.uid === profile.uid;

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
                <View style={s.avatarFallback}>
                  <Text style={s.avatarLetter}>
                    {(profile.displayName ?? "D").slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>

            {profile.verified && (
              <View style={s.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={28} color={C.good} />
              </View>
            )}
          </View>

          <View style={s.handleChip}>
            <Text style={s.handleTxt}>@{profile.handle}</Text>
          </View>

          {/* Club Member Badge */}
          {userTier === 'CLUB' && (
            <View style={s.clubBadgeContainer}>
              <View style={s.clubBadge}>
                <Ionicons name="star" size={16} color="#111" />
                <Text style={s.clubBadgeText}>CLUB MEMBER</Text>
              </View>
            </View>
          )}

          {/* FOLLOWERS/FOLLOWING STATS */}
          <View style={s.followStats}>
            <TouchableOpacity style={s.followStat} activeOpacity={0.7}>
              <Text style={s.followStatNumber}>{formatCount(followersCount)}</Text>
              <Text style={s.followStatLabel}>Followers</Text>
            </TouchableOpacity>

            <View style={s.followStatDivider} />

            <TouchableOpacity style={s.followStat} activeOpacity={0.7}>
              <Text style={s.followStatNumber}>{formatCount(followingCount)}</Text>
              <Text style={s.followStatLabel}>Following</Text>
            </TouchableOpacity>
          </View>

          {/* FOLLOW/UNFOLLOW BUTTON (only show if not own profile) */}
          {!isOwnProfile && currentUser && (
            <TouchableOpacity
              onPress={toggleFollow}
              style={[s.followBtn, isFollowing && s.followingBtn]}
              activeOpacity={0.9}
              disabled={followLoading}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color={isFollowing ? C.text : "#fff"} />
              ) : (
                <>
                  <Ionicons
                    name={isFollowing ? "checkmark" : "person-add"}
                    size={18}
                    color={isFollowing ? C.text : "#fff"}
                  />
                  <Text style={[s.followBtnTxt, isFollowing && s.followingBtnTxt]}>
                    {isFollowing ? "Following" : "Follow"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {profile.bio ? (
            <Text style={s.bio}>{profile.bio}</Text>
          ) : null}

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
                  <View style={s.statIconBg}>
                    <Ionicons name="car-sport" size={28} color={C.accent} />
                  </View>
                  <Text style={s.statValue}>{cars.length}</Text>
                  <Text style={s.statLabel}>{cars.length === 1 ? "Vehicle" : "Vehicles"}</Text>
                </View>

                {profile.showGarageValue && totalValue > 0 && (
                  <>
                    <View style={s.statCard}>
                      <View style={[s.statIconBg, { backgroundColor: C.good + "15" }]}>
                        <Ionicons name="trending-up" size={28} color={C.good} />
                      </View>
                      <Text style={s.statValue}>${formatK(totalValue)}</Text>
                      <Text style={s.statLabel}>Total Value</Text>
                    </View>

                    <View style={s.statCard}>
                      <View style={[s.statIconBg, { backgroundColor: C.blue + "15" }]}>
                        <Ionicons name="analytics" size={28} color={C.blue} />
                      </View>
                      <Text style={s.statValue}>${formatK(avgValue)}</Text>
                      <Text style={s.statLabel}>Avg Value</Text>
                    </View>
                  </>
                )}
              </View>
            </View>

            <View style={s.carsSection}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Vehicles</Text>
                <View style={s.countBadge}>
                  <Text style={s.countBadgeTxt}>{cars.length}</Text>
                </View>
              </View>

              <View style={s.carsGrid}>
                {cars.map(car => (
                  <TouchableOpacity
                    key={car.id}
                    style={s.carCard}
                    activeOpacity={0.8}
                    onPress={() => {
                      setSelectedCar(car);
                      setCarDetailModalVisible(true);
                    }}
                  >
                    <View style={s.carImgWrapper}>
                      {car.photoURL ? (
                        <>
                          <Image source={{ uri: car.photoURL }} style={s.carImg} />
                          <LinearGradient
                            colors={["transparent", "rgba(0,0,0,0.6)"]}
                            style={s.carGradient}
                          />
                        </>
                      ) : (
                        <View style={s.carImgPlaceholder}>
                          <Ionicons name="car-sport-outline" size={44} color={C.muted} />
                        </View>
                      )}
                    </View>

                    <View style={s.carInfo}>
                      {car.year && <Text style={s.carYear}>{car.year}</Text>}
                      <Text style={s.carTitle} numberOfLines={1}>
                        {car.make} {car.model}
                      </Text>
                      {car.trim && <Text style={s.carTrim} numberOfLines={1}>{car.trim}</Text>}

                      {profile.showCarValues && car.currentValue ? (
                        <View style={s.carValueRow}>
                          <Ionicons name="pricetag" size={13} color={C.good} />
                          <Text style={s.carValue}>${formatK(car.currentValue)}</Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

        {/* Community Posts Section - INSERT HERE */}
        {postsLoading ? (
          <View style={s.loadingSection}>
            <ActivityIndicator size="small" color={C.accent} />
            <Text style={s.loadingTxt}>Loading posts...</Text>
          </View>
        ) : posts.length > 0 && (
          <View style={s.postsSection}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Community Posts</Text>
              <View style={s.countBadge}>
                <Text style={s.countBadgeTxt}>{posts.length}</Text>
              </View>
            </View>

            {posts.map(post => (
              <View key={post.id} style={s.postCard}>
                <View style={s.postHeader}>
                  <View style={s.categoryBadge}>
                    <Text style={s.categoryText}>{post.category}</Text>
                  </View>
                  <Text style={s.postTime}>{formatTime(post.timestamp)}</Text>
                </View>

                <Text style={s.postContent} numberOfLines={4}>
                  {post.content}
                </Text>

                {post.imageUrl && (
                  <Image source={{ uri: post.imageUrl }} style={s.postImage} />
                )}

                <View style={s.postStats}>
                  <View style={s.postStatItem}>
                    <Ionicons name="heart" size={16} color={C.accent} />
                    <Text style={s.postStatText}>{post.likes?.length || 0}</Text>
                  </View>
                  <View style={s.postStatItem}>
                    <Ionicons name="chatbubble" size={16} color={C.muted} />
                    <Text style={s.postStatText}>{post.commentCount || 0}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

      </>
      ) : (
      <View style={s.emptyState}>
        <View style={s.emptyIcon}>
          <Ionicons name="car-sport-outline" size={56} color={C.muted} />
        </View>
        <Text style={s.emptyTitle}>No Vehicles Yet</Text>
        <Text style={s.emptyDesc}>This garage is empty</Text>
      </View>
      )}

      <View style={s.footer}>
        <Text style={s.footerTxt}>OVRTK © 2025</Text>
      </View>
    </ScrollView >

  {/* Car Detail Modal */ }
  < Modal
    visible={carDetailModalVisible}
    animationType="slide"
    transparent={true}
    onRequestClose={() => {
      setCarDetailModalVisible(false);
      setSelectedCar(null);
    }}
  >
    <TouchableOpacity
      style={s.modalOverlay}
      activeOpacity={1}
      onPress={() => {
        setCarDetailModalVisible(false);
        setSelectedCar(null);
      }}
    >
      <View style={s.carDetailModal}>
        {selectedCar?.photoURL && (
          <Image source={{ uri: selectedCar.photoURL }} style={s.modalCarImage} />
        )}
        <View style={s.modalContent}>
          <View style={s.modalHeader}>
            <View>
              {selectedCar?.year && (
                <Text style={s.modalYear}>{selectedCar.year}</Text>
              )}
              <Text style={s.modalTitle}>
                {selectedCar?.make} {selectedCar?.model}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setCarDetailModalVisible(false);
                setSelectedCar(null);
              }}
              style={s.closeBtn}
            >
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
          </View>
          {selectedCar?.trim && (
            <View style={s.modalDetailRow}>
              <Ionicons name="information-circle" size={20} color={C.muted} />
              <Text style={s.modalDetailLabel}>Trim</Text>
              <Text style={s.modalDetailValue}>{selectedCar.trim}</Text>
            </View>
          )}
          {profile?.showCarValues && selectedCar?.currentValue && (
            <View style={s.modalDetailRow}>
              <Ionicons name="pricetag" size={20} color={C.good} />
              <Text style={s.modalDetailLabel}>Estimated Value</Text>
              <Text style={[s.modalDetailValue, { color: C.good }]}>
                ${formatK(selectedCar.currentValue)}
              </Text>
            </View>
          )}
        </View>
      </View>



    </TouchableOpacity>
  </Modal >
    </SafeAreaView >
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingSection: { alignItems: "center", paddingVertical: 40 },
  loadingTxt: { color: C.muted, marginTop: 12, fontSize: 14, fontWeight: "600" },

  notFoundIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  notFoundTitle: { color: C.text, fontSize: 24, fontWeight: "900", marginBottom: 8 },
  notFoundDesc: { color: C.muted, fontSize: 15, textAlign: "center", lineHeight: 21 },
  backBtn: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: C.accent,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
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
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },

  profileSection: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  avatarWrapper: { position: "relative", marginBottom: 4 },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: C.dim,
    borderWidth: 5,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: C.accent + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: C.accent, fontSize: 44, fontWeight: "900" },
  verifiedBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    backgroundColor: C.bg,
    borderRadius: 14,
    padding: 2,
  },

  displayName: { color: C.text, fontSize: 28, fontWeight: "900", marginTop: 18, letterSpacing: -0.5 },
  handleChip: {
    marginTop: 8,
    backgroundColor: C.panel,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line,
  },
  handleTxt: { color: C.accent, fontSize: 15, fontWeight: "700" },

  // Follow stats styling
  followStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    backgroundColor: C.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 24,
  },
  followStat: {
    alignItems: "center",
    gap: 4,
  },
  followStatNumber: {
    color: C.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  followStatLabel: {
    color: C.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  followStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: C.line,
  },

  // Follow button styling
  followBtn: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.accent,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: C.accent,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    minWidth: 140,
    justifyContent: "center",
  },
  followingBtn: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    shadowOpacity: 0,
  },
  followBtnTxt: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  followingBtnTxt: {
    color: C.text,
  },

  bio: {
    color: C.text,
    fontSize: 15,
    marginTop: 18,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: "92%",
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    backgroundColor: C.panel,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line,
  },
  infoTxt: { color: C.muted, fontSize: 14, fontWeight: "600" },

  socialLinks: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  socialBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },

  statsSection: {
    paddingHorizontal: 16,
    paddingVertical: 28,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 18,
    letterSpacing: -0.5,
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
    borderRadius: 18,
    padding: 18,
    alignItems: "center",
    gap: 10,
  },
  statIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.accent + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { color: C.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  statLabel: {
    color: C.muted,
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  carsSection: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  countBadge: {
    backgroundColor: C.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    shadowColor: C.accent,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  countBadgeTxt: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },

  carsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  carCard: {
    width: (width - 46) / 2,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
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
    height: "55%",
  },
  carInfo: { padding: 14, gap: 4 },
  carYear: { color: C.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  carTitle: { color: C.text, fontWeight: "900", fontSize: 16, letterSpacing: -0.3 },
  carTrim: { color: C.muted, fontSize: 12, fontWeight: "600" },
  carValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  carValue: { color: C.good, fontSize: 14, fontWeight: "800" },

  emptyState: {
    alignItems: "center",
    paddingVertical: 72,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 8,
  },
  emptyDesc: { color: C.muted, fontSize: 15, fontWeight: "500" },

  footer: {
    alignItems: "center",
    paddingVertical: 36,
    paddingTop: 48,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  footerTxt: { color: C.muted, fontSize: 13, fontWeight: "600" },

  // Club badge styles
  clubBadgeContainer: {
    marginTop: 12,
    marginBottom: 8,
  },
  clubBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFD700', // Gold
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFA500', // Orange border
    shadowColor: '#FFD700',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  clubBadgeText: {
    color: '#111',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  carDetailModal: {
    backgroundColor: C.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    maxHeight: '80%',
  },
  modalCarImage: {
    width: '100%',
    height: 280,
    backgroundColor: C.dim,
  },
  modalContent: {
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  modalYear: {
    fontSize: 13,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: C.text,
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.dim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: C.line,
    gap: 12,
  },
  modalDetailLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: C.muted,
    flex: 1,
  },
  modalDetailValue: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },

  // Posts section styles - ADD THESE
  postsSection: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  postCard: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: C.dim,
    borderWidth: 1,
    borderColor: C.line,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.accent,
  },
  postTime: {
    fontSize: 13,
    color: C.muted,
  },
  postContent: {
    fontSize: 15,
    color: C.text,
    lineHeight: 22,
    marginBottom: 12,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: C.dim,
  },
  postStats: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  postStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  postStatText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.muted,
  },
});