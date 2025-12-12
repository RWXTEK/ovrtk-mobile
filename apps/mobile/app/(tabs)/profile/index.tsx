// apps/mobile/app/(tabs)/profile/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Switch,
  ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView, Linking, Image, Modal, Share, Animated, FlatList
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, db, storage } from "../../../lib/firebase";
import {
  doc, getDoc, setDoc, serverTimestamp, updateDoc, collection, query, where, getDocs, limit, orderBy, deleteDoc, addDoc, increment, onSnapshot, arrayRemove  // Add this!
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerForPushNotifications } from '../../../utils/notifications';
import * as ImagePicker from "expo-image-picker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import PricingCard from '../profile/PricingCard';
import Paywall from '../../../components/Paywall';
import { getUserTier } from '../../../lib/revenuecat';


import Purchases, {
  CustomerInfo,
  PACKAGE_TYPE,
  PurchasesPackage,
} from "react-native-purchases";

const ENTITLEMENT_ID_PLUS = "OVRTK Plus";
const ENTITLEMENT_ID_TRACK = "track_mode";
const ENTITLEMENT_ID_CLUB = "club";

const PRODUCT_ID_PLUS = "com.rwxtek.ovrtk.plus.monthly";
const PRODUCT_ID_TRACK = "com.rwxtek.ovrtk.trackmode.monthly";
const PRODUCT_ID_CLUB = "com.rwxtek.ovrtk.club.monthly";

const C = {
  bg: "#0C0D11",
  surface: "#121318",        // ← ADD THIS (same as panel)
  panel: "#121318",
  line: "#1E2127",
  text: "#E7EAF0",
  textSecondary: "#A6ADBB",  // ← ADD THIS (same as muted)
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
  notifScottyCheckins?: boolean;
  notifCommunity?: boolean;
};

interface Post {
  id: string;
  userId: string;
  username: string;
  handle: string;
  content: string;
  imageUrl?: string;
  category: string;
  likes: string[];
  commentCount: number;
  timestamp: any;
}

interface Comment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  handle?: string;
  content: string;
  timestamp: any;
  read?: boolean;
}

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

const SPACING = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};


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
  const [notifScottyCheckins, setNotifScottyCheckins] = useState(true);
  const [notifCommunity, setNotifCommunity] = useState(true);


  const [handleStatus, setHandleStatus] =
    useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");

  const [hasPro, setHasPro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<'messages' | 'vin' | 'image' | 'sound' | 'upgrade'>('upgrade');
  const [userTier, setUserTier] = useState<'FREE' | 'PLUS' | 'CLUB' | 'TRACK_MODE'>('FREE');


  // Posts state
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [editPostModal, setEditPostModal] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editContent, setEditContent] = useState("");
  const [selectedTab, setSelectedTab] = useState<"profile" | "posts" | "notifications">("profile");

  // Notifications state
  const [notifications, setNotifications] = useState<Comment[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPostForComments, setSelectedPostForComments] = useState<Post | null>(null);
  const [postComments, setPostComments] = useState<Comment[]>([]);
  const [newReply, setNewReply] = useState("");
  const { scrollTo } = useLocalSearchParams();
  const preferencesRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  //Followers/Following
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followers, setFollowers] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [followersModalVisible, setFollowersModalVisible] = useState(false);
  const [followingModalVisible, setFollowingModalVisible] = useState(false);
  const [followersUsers, setFollowersUsers] = useState<any[]>([]);
  const [followingUsers, setFollowingUsers] = useState<any[]>([]);
  const [loadingFollowList, setLoadingFollowList] = useState(false);

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
          setNotifScottyCheckins(data.notifScottyCheckins ?? true);
          setNotifCommunity(data.notifCommunity ?? true);

          // Register for push notifications
          registerForPushNotifications(me.uid);
        } else {
          const init: UserDoc = {
            displayName: me.displayName ?? "Driver",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userRef, init, { merge: true });
          setU(init);

          // Register for push notifications for new users too
          registerForPushNotifications(me.uid);
        }
      } catch (e: any) {
        console.log("profile load error:", e?.message || e);
        Alert.alert("Error", "Could not load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [me]);

  // Load user's posts
  useEffect(() => {
    if (!me) return;
    loadUserPosts();
  }, [me]);

  // 🔥 Reload tier when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (me?.uid) {
        (async () => {
          const tier = await getUserTier();
          setUserTier(tier);
        })();
      }
    }, [me?.uid])
  );
  // Load notifications with real-time updates
  useEffect(() => {
    if (!me) return;

    // Initial load
    loadNotifications();

    // Set up real-time listener for new comments
    const setupListener = async () => {
      try {
        // Get user's posts
        const postsQuery = query(
          collection(db, "posts"),
          where("userId", "==", me.uid)
        );
        const postsSnapshot = await getDocs(postsQuery);
        const postIds = postsSnapshot.docs.map(doc => doc.id);

        if (postIds.length === 0) return;

        // Listen for new comments on user's posts
        const commentsQuery = query(
          collection(db, "comments"),
          where("postId", "in", postIds),
          orderBy("timestamp", "desc")
        );

        const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
          const allComments = snapshot.docs
            .map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as Comment[];

          // Filter out user's own comments
          const otherComments = allComments.filter(comment => comment.userId !== me.uid);

          setNotifications(otherComments);

          // Count unread
          const unread = otherComments.filter(c => !c.read).length;
          setUnreadCount(unread);
        });

        return unsubscribe;
      } catch (e) {
        console.error("Error setting up notifications listener:", e);
      }
    };

    const listenerPromise = setupListener();

    return () => {
      listenerPromise.then(unsubscribe => {
        if (unsubscribe) unsubscribe();
      });
    };
  }, [me]);

  // Refresh notifications when tab is focused
  useFocusEffect(
    useCallback(() => {
      if (me && selectedTab === "notifications") {
        loadNotifications();
      }
    }, [me, selectedTab])
  );

  const loadUserPosts = async () => {
    if (!me) return;
    setLoadingPosts(true);
    try {
      const q = query(
        collection(db, "posts"),
        where("userId", "==", me.uid),
        orderBy("timestamp", "desc")
      );
      const snapshot = await getDocs(q);

      // For each post, get the actual comment count
      const postsWithCorrectCounts = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const postData = docSnap.data();

          // Get actual comment count
          const commentsQuery = query(
            collection(db, "comments"),
            where("postId", "==", docSnap.id)
          );
          const commentsSnapshot = await getDocs(commentsQuery);
          const actualCommentCount = commentsSnapshot.docs.length;

          // Update Firestore if count is wrong
          if (postData.commentCount !== actualCommentCount) {
            await updateDoc(doc(db, "posts", docSnap.id), {
              commentCount: actualCommentCount
            });
          }

          return {
            id: docSnap.id,
            ...postData,
            commentCount: actualCommentCount
          } as Post;
        })
      );

      setUserPosts(postsWithCorrectCounts);
    } catch (e) {
      console.error("Error loading posts:", e);
    } finally {
      setLoadingPosts(false);
    }
  };

  const loadNotifications = async () => {
    if (!me) return;
    setLoadingNotifications(true);
    try {
      // Get all user's posts
      const postsQuery = query(
        collection(db, "posts"),
        where("userId", "==", me.uid)
      );
      const postsSnapshot = await getDocs(postsQuery);
      const postIds = postsSnapshot.docs.map(doc => doc.id);

      if (postIds.length === 0) {
        setNotifications([]);
        setUnreadCount(0);
        setLoadingNotifications(false);
        return;
      }

      // Get comments on user's posts (excluding their own comments)
      const commentsQuery = query(
        collection(db, "comments"),
        where("postId", "in", postIds),
        orderBy("timestamp", "desc")
      );
      const commentsSnapshot = await getDocs(commentsQuery);

      const allComments = commentsSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Comment[];

      // Filter out user's own comments
      const otherComments = allComments.filter(comment => comment.userId !== me.uid);

      setNotifications(otherComments);

      // Count unread
      const unread = otherComments.filter(c => !c.read).length;
      setUnreadCount(unread);

    } catch (e) {
      console.error("Error loading notifications:", e);
    } finally {
      setLoadingNotifications(false);
    }
  };


  const toggleAndSave = async (field: string, value: boolean) => {
    if (!me) return;

    try {
      const updateData: any = { [field]: value };

      if (field === "notifBuilds") setNotifBuilds(value);
      if (field === "notifReplies") setNotifReplies(value);
      if (field === "notifScottyCheckins") setNotifScottyCheckins(value);
      if (field === "notifCommunity") setNotifCommunity(value);
      if (field === "publicProfile") setPublicProfile(value);
      if (field === "showGarageValue") setShowGarageValue(value);
      if (field === "showCarValues") setShowCarValues(value);

      await updateDoc(doc(db, "users", me.uid), {
        ...updateData,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Error saving preference:", e);
      Alert.alert("Error", "Could not save preference");
    }
  };

  const markAsRead = async (commentId: string) => {
    try {
      const commentRef = doc(db, "comments", commentId);
      const commentSnap = await getDoc(commentRef);

      if (commentSnap.exists()) {
        await updateDoc(commentRef, {
          read: true
        });
      } else {
        // If document doesn't exist, just update local state
        console.log("Comment not found, updating local state only");
      }

      setNotifications(prev =>
        prev.map(n => n.id === commentId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      console.error("Error marking as read:", e);
      // Still update local state even if Firebase update fails
      setNotifications(prev =>
        prev.map(n => n.id === commentId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const openPostComments = async (notification: Comment) => {
    // Mark as read (but don't await - do it in background)
    if (!notification.read) {
      markAsRead(notification.id).catch(err => {
        console.log("Failed to mark as read, continuing anyway:", err);
      });
    }

    // Find the post
    const post = userPosts.find(p => p.id === notification.postId);
    if (!post) {
      // Fetch the post if not in current list
      try {
        const postDoc = await getDoc(doc(db, "posts", notification.postId));
        if (postDoc.exists()) {
          const fetchedPost = { id: postDoc.id, ...postDoc.data() } as Post;
          setSelectedPostForComments(fetchedPost);
        } else {
          Alert.alert("Error", "Post not found");
          return;
        }
      } catch (e) {
        console.error("Error fetching post:", e);
        Alert.alert("Error", "Could not load post");
        return;
      }
    } else {
      setSelectedPostForComments(post);
    }

    // Load all comments for this post
    try {
      const commentsQuery = query(
        collection(db, "comments"),
        where("postId", "==", notification.postId),
        orderBy("timestamp", "desc")
      );
      const snapshot = await getDocs(commentsQuery);
      const comments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Comment[];

      setPostComments(comments);
      setCommentsModalVisible(true);
    } catch (e) {
      console.error("Error loading comments:", e);
      Alert.alert("Error", "Could not load comments");
    }
  };

  const handleReply = async () => {
    if (!newReply.trim() || !selectedPostForComments) return;

    try {
      await addDoc(collection(db, "comments"), {
        postId: selectedPostForComments.id,
        userId: me?.uid,
        username: u.displayName || "Anonymous",
        handle: u.handle || "",
        content: newReply,
        timestamp: new Date(),
        read: false,
      });

      const postRef = doc(db, "posts", selectedPostForComments.id);
      await updateDoc(postRef, {
        commentCount: increment(1)
      });

      setNewReply("");

      // Reload comments
      const commentsQuery = query(
        collection(db, "comments"),
        where("postId", "==", selectedPostForComments.id),
        orderBy("timestamp", "desc")
      );
      const snapshot = await getDocs(commentsQuery);
      const comments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Comment[];

      setPostComments(comments);

      setSavedToast("ok");
    } catch (e) {
      console.error("Error adding reply:", e);
    }
  };

  const handleDeletePost = async (postId: string) => {
    Alert.alert(
      "Delete Post",
      "Are you sure you want to delete this post? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "posts", postId));

              // Delete comments
              const commentsQuery = query(
                collection(db, "comments"),
                where("postId", "==", postId)
              );
              const commentsSnapshot = await getDocs(commentsQuery);
              const deletePromises = commentsSnapshot.docs.map(commentDoc =>
                deleteDoc(doc(db, "comments", commentDoc.id))
              );
              await Promise.all(deletePromises);

              // Refresh posts
              loadUserPosts();
              loadNotifications();
              setSavedToast("ok");
            } catch (error) {
              console.error("Error deleting post:", error);
              Alert.alert("Error", "Failed to delete post");
            }
          }
        }
      ]
    );
  };

  const handleEditPost = (post: Post) => {
    setEditingPost(post);
    setEditContent(post.content);
    setEditPostModal(true);
  };

  const saveEditedPost = async () => {
    if (!editingPost || !editContent.trim()) return;

    try {
      const postRef = doc(db, "posts", editingPost.id);
      await updateDoc(postRef, {
        content: editContent,
        updatedAt: serverTimestamp(),
      });

      setEditPostModal(false);
      setEditingPost(null);
      setEditContent("");
      loadUserPosts();
      setSavedToast("ok");
    } catch (error) {
      console.error("Error updating post:", error);
      Alert.alert("Error", "Failed to update post");
    }
  };

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
      let newTier: 'FREE' | 'PLUS' | 'CLUB' | 'TRACK_MODE' = 'FREE';

      // Check tier hierarchy: CLUB > TRACK_MODE > PLUS > FREE
      if (info.entitlements.active[ENTITLEMENT_ID_CLUB]) {
        newTier = 'CLUB';
        setHasPro(true);
      } else if (info.entitlements.active[ENTITLEMENT_ID_TRACK]) {
        newTier = 'TRACK_MODE';
        setHasPro(true);
      } else if (info.entitlements.active[ENTITLEMENT_ID_PLUS]) {
        newTier = 'PLUS';
        setHasPro(true);
      } else {
        newTier = 'FREE';
        setHasPro(false);
      }

      setUserTier(newTier);

      // Save tier to Firestore so it shows on public profile
      if (me?.uid) {
        updateDoc(doc(db, "users", me.uid), {
          subscriptionTier: newTier
        }).catch(err => console.error("Failed to update tier:", err));
      }
    };

    Purchases.addCustomerInfoUpdateListener(listener);

    (async () => {
      try {
        const info = await Purchases.getCustomerInfo();

        let newTier: 'FREE' | 'PLUS' | 'CLUB' | 'TRACK_MODE' = 'FREE';

        // Check tier hierarchy: CLUB > TRACK_MODE > PLUS > FREE
        if (info.entitlements.active[ENTITLEMENT_ID_CLUB]) {
          newTier = 'CLUB';
          setHasPro(true);
        } else if (info.entitlements.active[ENTITLEMENT_ID_TRACK]) {
          newTier = 'TRACK_MODE';
          setHasPro(true);
        } else if (info.entitlements.active[ENTITLEMENT_ID_PLUS]) {
          newTier = 'PLUS';
          setHasPro(true);
        } else {
          newTier = 'FREE';
          setHasPro(false);
        }

        setUserTier(newTier);

        // Save tier to Firestore
        if (me?.uid) {
          await updateDoc(doc(db, "users", me.uid), {
            subscriptionTier: newTier
          });
        }
      } catch {
        setHasPro(false);
        setUserTier('FREE');
      }
    })();

    return () => {
      try {
        // @ts-ignore
        Purchases.removeCustomerInfoUpdateListener?.(listener);
      } catch { }
    };
  }, [me]);

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

  const purchasePlus = async () => {
    setBusy(true);
    try {
      const offerings = await Purchases.getOfferings();

      if (!offerings.current) {
        Alert.alert("Error", "No offerings available");
        setBusy(false);
        return;
      }

      const monthlyPkg = offerings.current.availablePackages.find(
        p => p.packageType === PACKAGE_TYPE.MONTHLY
      );

      if (!monthlyPkg) {
        Alert.alert("Error", "Monthly subscription not found");
        setBusy(false);
        return;
      }

      await Purchases.purchasePackage(monthlyPkg);
      setPaywallOpen(false);
      Alert.alert("Welcome to Plus!", "Unlimited Scotty chat is now active. Ask away!");
    } catch (e: any) {
      if (isUserCancelled(e)) {
        Alert.alert("Upgrade", "Purchase cancelled");
      } else {
        const msg = String(e?.message ?? e ?? "Unknown error");
        Alert.alert("Upgrade", `Purchase failed: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const restorePlus = async () => {
    setBusy(true);
    try {
      const info = await Purchases.restorePurchases();

      // Check which tier was restored
      let tierName = '';
      if (info.entitlements.active[ENTITLEMENT_ID_CLUB]) {
        setUserTier('CLUB');
        setHasPro(true);
        tierName = 'Club';
      } else if (info.entitlements.active[ENTITLEMENT_ID_TRACK]) {
        setUserTier('TRACK_MODE');
        setHasPro(true);
        tierName = 'Track Mode';
      } else if (info.entitlements.active[ENTITLEMENT_ID_PLUS]) {
        setUserTier('PLUS');
        setHasPro(true);
        tierName = 'Plus';
      } else {
        setUserTier('FREE');
        setHasPro(false);
      }

      setPaywallOpen(false);

      Alert.alert(
        tierName ? "Restored" : "Restore",
        tierName ? `Welcome back — ${tierName} is active again.` : "No active subscription found."
      );
    } catch (e) {
      console.error('Restore error:', e);
    } finally {
      setBusy(false);
    }
  };

  const openManageSubscription = () => {
    Linking.openURL("https://apps.apple.com/account/subscriptions");
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

  useEffect(() => {
    if (scrollTo === 'preferences' && preferencesRef.current && scrollViewRef.current) {
      setTimeout(() => {
        preferencesRef.current?.measureLayout(
          scrollViewRef.current as any,
          (x, y) => {
            scrollViewRef.current?.scrollTo({ y: y - 20, animated: true });
          },
          () => { }
        );
      }, 300);
    }
  }, [scrollTo]);

  useEffect(() => {
    if (!me?.uid) return;

    const loadFollowData = async () => {
      try {
        const followDoc = await getDoc(doc(db, 'follows', me.uid));
        if (followDoc.exists()) {
          const data = followDoc.data();
          setFollowers(data.followers || []);
          setFollowing(data.following || []);
          setFollowersCount(data.followers?.length || 0);
          setFollowingCount(data.following?.length || 0);
        }
      } catch (error) {
        console.error('Error loading follow data:', error);
      }
    };

    loadFollowData();

    // Real-time listener
    const unsubscribe = onSnapshot(doc(db, 'follows', me.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setFollowers(data.followers || []);
        setFollowing(data.following || []);
        setFollowersCount(data.followers?.length || 0);
        setFollowingCount(data.following?.length || 0);
      }
    });

    return () => unsubscribe();
  }, [me?.uid]);


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

  const loadFollowersList = async () => {
    if (followers.length === 0) return;

    setLoadingFollowList(true);
    try {
      const usersPromises = followers.map(userId => getDoc(doc(db, 'users', userId)));
      const usersDocs = await Promise.all(usersPromises);

      const usersData = usersDocs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      setFollowersUsers(usersData);
    } catch (error) {
      console.error('Error loading followers list:', error);
    } finally {
      setLoadingFollowList(false);
    }
  };

  const loadFollowingList = async () => {
    if (following.length === 0) return;

    setLoadingFollowList(true);
    try {
      const usersPromises = following.map(userId => getDoc(doc(db, 'users', userId)));
      const usersDocs = await Promise.all(usersPromises);

      const usersData = usersDocs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      setFollowingUsers(usersData);
    } catch (error) {
      console.error('Error loading following list:', error);
    } finally {
      setLoadingFollowList(false);
    }
  };

  const handleFollowToggle = async (targetUserId: string) => {
    if (!me?.uid) return;

    const isFollowing = following.includes(targetUserId);

    try {
      const currentUserFollowRef = doc(db, 'follows', me.uid);
      const currentUserFollowDoc = await getDoc(currentUserFollowRef);

      if (!currentUserFollowDoc.exists()) {
        await setDoc(currentUserFollowRef, {
          following: isFollowing ? [] : [targetUserId],
          followers: []
        });
      } else {
        const currentFollowing = currentUserFollowDoc.data()?.following || [];
        const updatedFollowing = isFollowing
          ? currentFollowing.filter((id: string) => id !== targetUserId)
          : [...currentFollowing, targetUserId];

        await updateDoc(currentUserFollowRef, {
          following: updatedFollowing
        });
      }

      const targetUserFollowRef = doc(db, 'follows', targetUserId);
      const targetUserFollowDoc = await getDoc(targetUserFollowRef);

      if (!targetUserFollowDoc.exists()) {
        await setDoc(targetUserFollowRef, {
          followers: [me.uid],
          following: []
        });
      } else {
        const currentFollowers = targetUserFollowDoc.data()?.followers || [];
        const updatedFollowers = isFollowing
          ? currentFollowers.filter((id: string) => id !== me.uid)
          : [...currentFollowers, me.uid];

        await updateDoc(targetUserFollowRef, {
          followers: updatedFollowers
        });
      }

      // Refresh the lists
      if (followersModalVisible) {
        loadFollowersList();
      }
      if (followingModalVisible) {
        loadFollowingList();
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
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

  const [uploadingAvatar, setUploadingAvatar] = useState(false);  // ← Add this near other state

  const pickAvatar = async () => {
    if (!me) return;

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission Required", "Please allow access to your photos");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (res.canceled || !res.assets?.length) return;

      setUploadingAvatar(true);

      const uri = res.assets[0].uri;
      const blob = await (await fetch(uri)).blob();
      const key = `avatars/${me.uid}/${Date.now()}.jpg`;
      const r = ref(storage, key);

      await uploadBytes(r, blob, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(r);

      // Update user document
      await updateDoc(doc(db, "users", me.uid), {
        avatarURL: url,
        updatedAt: serverTimestamp(),
      });

      // 🔥 NEW: Update all user's posts with new avatar
      const postsQuery = query(
        collection(db, "posts"),
        where("userId", "==", me.uid)
      );
      const postsSnapshot = await getDocs(postsQuery);

      const updatePromises = postsSnapshot.docs.map(postDoc =>
        updateDoc(doc(db, "posts", postDoc.id), {
          userAvatar: url
        })
      );

      await Promise.all(updatePromises);

      setU((prev) => ({ ...prev, avatarURL: url }));
      setSavedToast("ok");
    } catch (e) {
      console.error("Avatar upload error:", e);
      Alert.alert("Error", "Couldn't update profile picture");
    } finally {
      setUploadingAvatar(false);
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

  const renderPost = ({ item }: { item: Post }) => {
    return (
      <View style={s.postCard}>
        <View style={s.postHeader}>
          <View style={s.postMeta}>
            <View style={s.categoryBadge}>
              <Text style={s.categoryText}>{item.category}</Text>
            </View>
            <Text style={s.postTime}>{formatTime(item.timestamp)}</Text>
          </View>

          <View style={s.postActions}>
            <TouchableOpacity
              onPress={() => handleEditPost(item)}
              style={s.postActionBtn}
            >
              <Ionicons name="create-outline" size={18} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDeletePost(item.id)}
              style={s.postActionBtn}
            >
              <Ionicons name="trash-outline" size={18} color={C.accent} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={s.postContent}>{item.content}</Text>

        {item.imageUrl && (
          <Image source={{ uri: item.imageUrl }} style={s.postImage} />
        )}

        <View style={s.postStats}>
          <View style={s.statItem}>
            <Ionicons name="heart" size={16} color={C.accent} />
            <Text style={s.statText}>{item.likes?.length || 0}</Text>
          </View>
          <View style={s.statItem}>
            <Ionicons name="chatbubble" size={16} color={C.muted} />
            <Text style={s.statText}>{item.commentCount || 0}</Text>
          </View>
        </View>
      </View>
    );
  };


  const handleRemoveFollower = async (followerId: string) => {
    if (!me?.uid) return;

    try {
      const myFollowRef = doc(db, 'follows', me.uid);
      const theirFollowRef = doc(db, 'follows', followerId);

      await Promise.all([
        updateDoc(myFollowRef, { followers: arrayRemove(followerId) }),
        updateDoc(theirFollowRef, { following: arrayRemove(me.uid) })
      ]);

      // Update local state immediately
      setFollowers(prev => prev.filter(id => id !== followerId));
      setFollowersCount(prev => Math.max(0, prev - 1));

      // Remove from the displayed list in the modal
      setFollowersUsers(prev => prev.filter(user => user.id !== followerId));
    } catch (error) {
      console.error('Error removing follower:', error);
      Alert.alert('Error', 'Failed to remove follower');
    }
  };


  const renderNotification = ({ item }: { item: Comment }) => {
    return (
      <TouchableOpacity
        style={[s.notificationCard, !item.read && s.notificationUnread]}
        onPress={() => openPostComments(item)}
        activeOpacity={0.7}
      >
        <View style={s.notificationIcon}>
          <Ionicons name="chatbubble" size={20} color={item.read ? C.muted : C.accent} />
        </View>

        <View style={s.notificationContent}>
          <Text style={s.notificationUser}>
            @{item.handle || item.username}
          </Text>
          <Text style={s.notificationText} numberOfLines={2}>
            {item.content}
          </Text>
          <Text style={s.notificationTime}>{formatTime(item.timestamp)}</Text>
        </View>

        {!item.read && <View style={s.unreadDot} />}
      </TouchableOpacity>
    );
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

        {/* Header */}
        <View style={s.header}>
          <View style={s.badge}>
            <Ionicons name="person-outline" size={14} color="#111" />
            <Text style={s.badgeTxt}>Profile</Text>
          </View>

          <View style={s.headerRight}>
            {userTier !== 'FREE' && (
              <View style={[
                s.proBadge,
                {
                  backgroundColor:
                    userTier === 'CLUB' ? '#FFD700' :      // 🟡 Gold for Club
                      userTier === 'TRACK_MODE' ? '#FFD60A' : // 🟡 Yellow for Track Mode
                        '#30D158'                               // 🟢 Green for Plus
                }
              ]}>
                <Ionicons
                  name={userTier === 'CLUB' ? 'star' : 'flash'}
                  size={12}
                  color="#111"
                />
                <Text style={s.proBadgeTxt}>
                  {userTier === 'CLUB' ? 'Club' : userTier === 'TRACK_MODE' ? 'Track Mode' : 'Plus'}
                </Text>
              </View>
            )}

            <TouchableOpacity onPress={viewPublic} style={s.publicBtn} activeOpacity={0.9}>
              <Ionicons name="eye-outline" size={16} color={C.text} />
              <Text style={s.publicBtnTxt}>Public</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={s.tabContainer}>
          <TouchableOpacity
            style={[s.tab, selectedTab === "profile" && s.tabActive]}
            onPress={() => setSelectedTab("profile")}
          >
            <Ionicons
              name="person-outline"
              size={18}
              color={selectedTab === "profile" ? C.accent : C.muted}
            />
            <Text style={[s.tabText, selectedTab === "profile" && s.tabTextActive]}>
              Profile
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tab, selectedTab === "posts" && s.tabActive]}
            onPress={() => setSelectedTab("posts")}
          >
            <Ionicons
              name="grid-outline"
              size={18}
              color={selectedTab === "posts" ? C.accent : C.muted}
            />
            <Text style={[s.tabText, selectedTab === "posts" && s.tabTextActive]}>
              Posts ({userPosts.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tab, selectedTab === "notifications" && s.tabActive]}
            onPress={() => {
              setSelectedTab("notifications");
              loadNotifications();
            }}
          >
            <View style={s.notificationBellContainer}>
              <Ionicons
                name="notifications-outline"
                size={18}
                color={selectedTab === "notifications" ? C.accent : C.muted}
              />
              {unreadCount > 0 && (
                <View style={s.notificationBadge}>
                  <Text style={s.notificationBadgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[s.tabText, selectedTab === "notifications" && s.tabTextActive]}>
              Replies
            </Text>
          </TouchableOpacity>
        </View>

        {selectedTab === "profile" ? (
          <ScrollView
            contentContainerStyle={{ paddingBottom: (insets.bottom || 10) + 120 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Avatar Section */}
            <View style={s.avatarSection}>
              <TouchableOpacity
                onPress={pickAvatar}
                activeOpacity={0.8}
                style={s.avatarContainer}
              >
                <View style={s.avatar}>
                  {u.avatarURL ? (
                    <Image source={{ uri: u.avatarURL }} style={s.avatarImg} />
                  ) : (
                    <Text style={s.avatarLetter}>{(u.displayName ?? "D").slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>

                {/* Camera icon overlay */}
                <View style={s.avatarEditBadge}>
                  {uploadingAvatar ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={16} color="#fff" />
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* Followers/Following Stats */}
            <View style={s.statsRow}>
              <TouchableOpacity
                style={s.statItem}
                onPress={() => {
                  setFollowersModalVisible(true);
                  loadFollowersList();
                }}
              >
                <Text style={s.statNumber}>{followersCount}</Text>
                <Text style={s.statLabel}>Followers</Text>
              </TouchableOpacity>

              <View style={s.statDivider} />

              <TouchableOpacity
                style={s.statItem}
                onPress={() => {
                  setFollowingModalVisible(true);
                  loadFollowingList();
                }}
              >
                <Text style={s.statNumber}>{followingCount}</Text>
                <Text style={s.statLabel}>Following</Text>
              </TouchableOpacity>
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

            {/* Followers Modal */}
            <Modal visible={followersModalVisible} animationType="slide" transparent={false} onRequestClose={() => setFollowersModalVisible(false)}>
              <SafeAreaView style={s.safe} edges={['bottom']}>
                <View style={s.followModalHeader}>
                  <TouchableOpacity onPress={() => setFollowersModalVisible(false)}>
                    <Ionicons name="arrow-back" size={24} color={C.text} />
                  </TouchableOpacity>
                  <Text style={s.modalTitle}>Followers</Text>
                  <View style={{ width: 24 }} />
                </View>

                {loadingFollowList ? (
                  <ActivityIndicator size="large" color={C.accent} style={{ marginTop: 40 }} />
                ) : followersUsers.length === 0 ? (
                  <View style={s.emptyPosts}>
                    <Ionicons name="people-outline" size={64} color={C.muted} />
                    <Text style={s.emptyText}>No followers yet</Text>
                  </View>
                ) : (
                  <FlatList
                    data={followersUsers}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ padding: 16 }}
                    renderItem={({ item }) => {
                      const isFollowing = following.includes(item.id);
                      const isCurrentUser = item.id === me?.uid;

                      return (
                        <TouchableOpacity
                          style={s.userListItem}
                          onPress={() => {
                            setFollowersModalVisible(false);
                            setTimeout(() => {
                              router.push(`/u/${item.handle}`);
                            }, 300);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={s.userListAvatar}>
                            {item.avatarURL ? (
                              <Image source={{ uri: item.avatarURL }} style={s.avatarImg} />
                            ) : (
                              <Text style={s.avatarLetter}>
                                {(item.handle || item.displayName || 'U').charAt(0).toUpperCase()}
                              </Text>
                            )}
                          </View>

                          <View style={s.userListInfo}>
                            <Text style={s.userListName}>{item.displayName || 'Unknown'}</Text>
                            <Text style={s.userListHandle}>@{item.handle || 'user'}</Text>
                          </View>

                          {!isCurrentUser && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <TouchableOpacity
                                style={[s.followBtn, isFollowing && s.followingBtn]}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  handleFollowToggle(item.id);
                                }}
                              >
                                <Text style={[s.followBtnText, isFollowing && s.followingBtnText]}>
                                  {isFollowing ? 'Following' : 'Follow Back'}
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                onPress={(e) => {
                                  e.stopPropagation();
                                  Alert.alert(
                                    'Remove Follower',
                                    `Remove @${item.handle} as a follower?`,
                                    [
                                      { text: 'Cancel', style: 'cancel' },
                                      {
                                        text: 'Remove',
                                        style: 'destructive',
                                        onPress: () => handleRemoveFollower(item.id)
                                      }
                                    ]
                                  );
                                }}
                                style={{ padding: 8 }}
                              >
                                <Ionicons name="ellipsis-horizontal" size={20} color={C.text} />
                              </TouchableOpacity>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}
              </SafeAreaView>
            </Modal>

            {/* Following Modal */}
            <Modal visible={followingModalVisible} animationType="slide" transparent={false} onRequestClose={() => setFollowingModalVisible(false)}>
              <SafeAreaView style={s.safe} edges={['bottom']}>
                <View style={s.followModalHeader}>
                  <TouchableOpacity onPress={() => setFollowingModalVisible(false)}>
                    <Ionicons name="arrow-back" size={24} color={C.text} />
                  </TouchableOpacity>
                  <Text style={s.modalTitle}>Following</Text>
                  <View style={{ width: 24 }} />
                </View>

                {loadingFollowList ? (
                  <ActivityIndicator size="large" color={C.accent} style={{ marginTop: 40 }} />
                ) : followingUsers.length === 0 ? (
                  <View style={s.emptyPosts}>
                    <Ionicons name="people-outline" size={64} color={C.muted} />
                    <Text style={s.emptyText}>Not following anyone yet</Text>
                  </View>
                ) : (
                  <FlatList
                    data={followingUsers}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ padding: 16 }}
                    renderItem={({ item }) => {
                      const isFollowing = following.includes(item.id);
                      const isCurrentUser = item.id === me?.uid;

                      return (
                        <TouchableOpacity
                          style={s.userListItem}
                          onPress={() => {
                            setFollowingModalVisible(false);
                            setTimeout(() => {
                              router.push(`/u/${item.handle}`);
                            }, 300);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={s.userListAvatar}>
                            {item.avatarURL ? (
                              <Image source={{ uri: item.avatarURL }} style={s.avatarImg} />
                            ) : (
                              <Text style={s.avatarLetter}>
                                {(item.handle || item.displayName || 'U').charAt(0).toUpperCase()}
                              </Text>
                            )}
                          </View>

                          <View style={s.userListInfo}>
                            <Text style={s.userListName}>{item.displayName || 'Unknown'}</Text>
                            <Text style={s.userListHandle}>@{item.handle || 'user'}</Text>
                          </View>

                          {!isCurrentUser && (
                            <TouchableOpacity
                              style={[s.followBtn, isFollowing && s.followingBtn]}
                              onPress={() => handleFollowToggle(item.id)}
                            >
                              <Text style={[s.followBtnText, isFollowing && s.followingBtnText]}>
                                {isFollowing ? 'Unfollow' : 'Follow'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}
              </SafeAreaView>
            </Modal>

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


            {/* Usage Stats Button */}
            <TouchableOpacity
              style={s.usageButton}
              onPress={() => router.push('/(tabs)/profile/usage')}
            >
              <View style={s.usageButtonIcon}>
                <Ionicons name="stats-chart" size={24} color={C.accent} />
              </View>
              <View style={s.usageButtonText}>
                <Text style={s.usageButtonTitle}>Usage Stats</Text>
                <Text style={s.usageButtonSubtitle}>View your monthly limits</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.muted} />
            </TouchableOpacity>



            {/* Subscription Management Button */}
            <TouchableOpacity
              style={[s.upgradeButton, userTier === 'CLUB' && s.manageButton]}
              onPress={() => {
                if (userTier === 'CLUB') {
                  // Show manage options
                  Alert.alert(
                    "Manage Subscription",
                    "You're on the Club plan!",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Change Plan",
                        onPress: () => {
                          setPaywallReason('upgrade');
                          setPaywallOpen(true);
                        }
                      },
                      {
                        text: "Manage in Settings",
                        onPress: openManageSubscription
                      }
                    ]
                  );
                } else {
                  setPaywallReason('upgrade');
                  setPaywallOpen(true);
                }
              }}
            >
              <Text style={s.upgradeButtonText}>
                {userTier === 'CLUB' ? 'Manage Subscription' : 'View All Plans'}
              </Text>
            </TouchableOpacity>

            {/* Settings Card */}
            <View ref={preferencesRef} style={s.card}>
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
              <ToggleRow
                label="Daily Scotty check-ins"
                value={notifScottyCheckins}
                onValueChange={(v) => toggleAndSave("notifScottyCheckins", v)}
                icon="time-outline"
              />
              <ToggleRow
                label="Community activity"
                value={notifCommunity}
                onValueChange={(v) => toggleAndSave("notifCommunity", v)}
                icon="people-outline"
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
                onPress={() => Linking.openURL("https://ovrtk.com/privacy-policy")}
                style={s.legalBtn}
              >
                <Ionicons name="shield-checkmark-outline" size={18} color={C.text} />
                <Text style={s.legalTxt}>Privacy Policy</Text>
                <Ionicons name="chevron-forward" size={16} color={C.muted} style={{ marginLeft: "auto" }} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => Linking.openURL("https://ovrtk.com/terms-and-conditions")}
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
        ) : selectedTab === "posts" ? (
          // Posts Tab
          <View style={{ flex: 1 }}>
            {loadingPosts ? (
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator size="large" color={C.accent} />
              </View>
            ) : userPosts.length === 0 ? (
              <View style={s.emptyPosts}>
                <Ionicons name="document-text-outline" size={64} color={C.muted} />
                <Text style={s.emptyText}>No posts yet</Text>
                <Text style={s.emptySubtext}>Share your builds in the Community tab</Text>
              </View>
            ) : (
              <FlatList
                data={userPosts}
                renderItem={renderPost}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
                refreshing={loadingPosts}
                onRefresh={loadUserPosts}
              />
            )}
          </View>
        ) : (
          // Notifications Tab
          <View style={{ flex: 1 }}>
            {loadingNotifications ? (
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator size="large" color={C.accent} />
              </View>
            ) : notifications.length === 0 ? (
              <View style={s.emptyPosts}>
                <Ionicons name="notifications-outline" size={64} color={C.muted} />
                <Text style={s.emptyText}>No notifications</Text>
                <Text style={s.emptySubtext}>Comments on your posts will appear here</Text>
              </View>
            ) : (
              <FlatList
                data={notifications}
                renderItem={renderNotification}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
                refreshing={loadingNotifications}
                onRefresh={loadNotifications}
              />
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Floating Save Button (only show on profile tab) */}
      {selectedTab === "profile" && (
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
      )}

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
              {savedToast === "ok" ? "Changes saved successfully" : "Could not save changes"}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Edit Post Modal */}
      <Modal
        visible={editPostModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditPostModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.modalOverlay}
        >
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setEditPostModal(false)}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
              <Text style={s.modalTitle}>Edit Post</Text>
              <TouchableOpacity
                onPress={saveEditedPost}
                disabled={!editContent.trim()}
              >
                <Text style={[s.modalSave, !editContent.trim() && { opacity: 0.4 }]}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{ flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
            >
              <TextInput
                style={s.modalInput}
                value={editContent}
                onChangeText={setEditContent}
                placeholder="Edit your post..."
                placeholderTextColor={C.muted}
                multiline
                autoFocus
                maxLength={500}
              />
            </ScrollView>

            <View style={s.modalFooter}>
              <Text style={s.charCount}>{editContent.length}/500</Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Comments Modal */}
      <Modal
        visible={commentsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCommentsModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.modalOverlay}
        >
          <View style={s.commentsModalContent}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setCommentsModalVisible(false)}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
              <Text style={s.modalTitle}>Comments</Text>
              <View style={{ width: 24 }} />
            </View>

            {selectedPostForComments && (
              <View style={s.postPreview}>
                <Text style={s.postPreviewText} numberOfLines={3}>
                  {selectedPostForComments.content}
                </Text>
              </View>
            )}

            <ScrollView ref={scrollViewRef} style={s.commentsList}>
              {postComments.length === 0 ? (
                <View style={s.emptyComments}>
                  <Text style={s.emptyCommentsText}>No comments yet</Text>
                </View>
              ) : (
                postComments.map((comment) => (
                  <View key={comment.id} style={s.commentItem}>
                    <View style={s.commentHeader}>
                      <Text style={s.commentUser}>@{comment.handle || comment.username}</Text>
                      <Text style={s.commentTime}>{formatTime(comment.timestamp)}</Text>
                    </View>
                    <Text style={s.commentText}>{comment.content}</Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={s.replyInputContainer}>
              <TextInput
                style={s.replyInput}
                value={newReply}
                onChangeText={setNewReply}
                placeholder="Write a reply..."
                placeholderTextColor={C.muted}
                multiline
              />
              <TouchableOpacity
                style={s.sendReplyBtn}
                onPress={handleReply}
                disabled={!newReply.trim()}
              >
                <Ionicons
                  name="send"
                  size={20}
                  color={newReply.trim() ? C.accent : C.muted}
                />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>


      {/* New Paywall */}
      <Paywall
        visible={paywallOpen}
        reason={paywallReason}
        currentUsage={0}
        limit={0}
        onClose={() => setPaywallOpen(false)}
        onPurchaseSuccess={async () => {
          setPaywallOpen(false);
          // Refresh tier
          const newTier = await getUserTier();
          setUserTier(newTier);
        }}
      />
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

  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: C.dim,
  },
  tabActive: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
    color: C.muted,
  },
  tabTextActive: {
    color: C.accent,
  },

  notificationBellContainer: {
    position: "relative",
  },
  notificationBadge: {
    position: "absolute",
    top: -6,
    right: -8,
    backgroundColor: C.accent,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
  },

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

  avatarEditBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.accent,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: C.bg,
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

  manageButton: {
    backgroundColor: '#FFD700', // Gold for Club members
  },
  
  //new styles for following.
  followModalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 55,  // Increased padding
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  userListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: C.panel,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  userListAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: C.dim,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  userListInfo: {
    flex: 1,
  },
  userListName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    marginBottom: 2,
  },
  userListHandle: {
    fontSize: 14,
    color: C.muted,
  },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: C.accent,
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.line,
  },
  followBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  followingBtnText: {
    color: C.text,
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

  // Posts styles
  emptyPosts: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "700",
    color: C.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: C.muted,
    marginTop: 8,
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  postMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    fontWeight: "700",
    color: C.accent,
  },
  postTime: {
    fontSize: 13,
    color: C.muted,
  },
  postActions: {
    flexDirection: "row",
    gap: 8,
  },
  postActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.dim,
    justifyContent: "center",
    alignItems: "center",
  },
  postContent: {
    fontSize: 15,
    color: C.text,
    lineHeight: 22,
    marginBottom: 12,
  },
  postImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  postStats: {
    flexDirection: "row",
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.muted,
  },

  usageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: SPACING.md,
    marginHorizontal: 16,
    marginTop: 20,           // ← More space above
  },
  usageButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  usageButtonText: {
    flex: 1,
  },
  usageButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    marginBottom: 2,
  },
  usageButtonSubtitle: {
    fontSize: 13,
    color: C.textSecondary,
  },

  // Notification styles
  notificationCard: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  notificationUnread: {
    borderColor: C.accent,
    borderWidth: 2,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.dim,
    justifyContent: "center",
    alignItems: "center",
  },
  notificationContent: {
    flex: 1,
  },
  notificationUser: {
    fontSize: 15,
    fontWeight: "700",
    color: C.text,
    marginBottom: 4,
  },
  notificationText: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 20,
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: C.muted,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.accent,
  },

  // ADD STATS STYLES HERE 👇
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.line,
    backgroundColor: C.dim,  // ← Changed from C.surface to C.dim
  },


  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: C.muted,
    fontWeight: '600',
  },
  statDivider: {
    width: 90,
    height: 0,
    backgroundColor: C.line,
  },

  // Edit modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: C.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: C.text,
  },
  modalSave: {
    fontSize: 16,
    fontWeight: "700",
    color: C.accent,
  },
  modalInput: {
    padding: 16,
    fontSize: 16,
    color: C.text,
    minHeight: 200,
    textAlignVertical: "top",
  },
  modalFooter: {
    paddingHorizontal: 16,
    alignItems: "flex-end",
  },
  charCount: {
    fontSize: 13,
    color: C.muted,
  },

  // Comments modal
  commentsModalContent: {
    backgroundColor: C.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "80%",
  },
  postPreview: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.dim,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  postPreviewText: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 20,
  },
  commentsList: {
    flex: 1,
    padding: 16,
  },
  emptyComments: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyCommentsText: {
    fontSize: 16,
    fontWeight: "600",
    color: C.muted,
  },
  commentItem: {
    backgroundColor: C.dim,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  commentUser: {
    fontSize: 14,
    fontWeight: "700",
    color: C.text,
  },
  commentTime: {
    fontSize: 12,
    color: C.muted,
  },
  commentText: {
    fontSize: 14,
    color: C.text,
    lineHeight: 20,
  },
  replyInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.line,
    gap: 12,
  },
  replyInput: {
    flex: 1,
    backgroundColor: C.dim,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
    maxHeight: 100,
  },
  sendReplyBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.dim,
    justifyContent: "center",
    alignItems: "center",
  },

  upgradeButton: {
    backgroundColor: C.accent,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    marginHorizontal: 16,  // ← Add horizontal margin to match other elements
    marginBottom: 20,       // ← Add bottom margin for spacing
  },

  upgradeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Club badge styles
  clubBadgeContainer: {
    alignItems: 'center',
    paddingVertical: 12,
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
  },
  clubBadgeText: {
    color: '#111',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
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


