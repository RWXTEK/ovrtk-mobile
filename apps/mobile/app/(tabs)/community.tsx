import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    TextInput,
    Image,
    Modal,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    Alert,
    Share,
    Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
    collection, addDoc, query, orderBy, onSnapshot, updateDoc, doc, increment, arrayUnion, arrayRemove, where, getDocs, getDoc, setDoc, deleteDoc, limit
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../../lib/firebase';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { sendPushNotification } from '../../utils/notifications';
import * as FileSystem from 'expo-file-system';



const C = {
    bg: '#0C0D11',
    panel: '#121318',
    surface: '#0F1116',
    line: '#1E2127',
    text: '#E7EAF0',
    muted: '#A6ADBB',
    accent: '#E11D48',
    accentHover: '#BE123A',
    grey1: '#23262E',
    grey2: '#171A21',
};

interface Post {
    id: string;
    userId: string;
    username: string;
    handle: string;
    userAvatar?: string;
    content: string;
    imageUrl?: string;
    category: string;
    likes: string[];
    saves: string[];
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
}

interface Notification {
    id: string;
    recipientId: string;
    senderId: string;
    senderHandle: string;
    senderAvatar?: string;
    type: 'like' | 'comment' | 'follow' | 'reply' | 'mention';
    postId?: string;
    commentId?: string;
    read: boolean;
    timestamp: any;
}

const CATEGORIES = [
    'For You', 
    'Social',
    'Following', 
    'Builds',
    'Mods',        // NEW - Modifications & upgrades
    'Spotted',     // NEW - Cool cars seen in the wild
    'Questions', 
    'Tips',
    'DIY',         // NEW - How-to guides & tutorials
    'Events',      // RENAMED from "Meets"
    'For Sale'
  ];

export default function CommunityScreen() {
    const router = useRouter();
    const [posts, setPosts] = useState<Post[]>([]);
    const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [modalVisible, setModalVisible] = useState(false);
    const [commentsModalVisible, setCommentsModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [postMenuModalVisible, setPostMenuModalVisible] = useState(false);
    const [commentMenuModalVisible, setCommentMenuModalVisible] = useState(false);

    const [newPostContent, setNewPostContent] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Builds');
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [posting, setPosting] = useState(false);

    const [activeFilter, setActiveFilter] = useState('For You');

    const [selectedPost, setSelectedPost] = useState<Post | null>(null);
    const [selectedPostForMenu, setSelectedPostForMenu] = useState<Post | null>(null);
    const [selectedCommentForMenu, setSelectedCommentForMenu] = useState<Comment | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loadingComments, setLoadingComments] = useState(false);
    const [replyingTo, setReplyingTo] = useState<Comment | null>(null);

    const [savedPosts, setSavedPosts] = useState<string[]>([]);
    const [followingUsers, setFollowingUsers] = useState<string[]>([]);

    const [editingPost, setEditingPost] = useState<Post | null>(null);
    const [editContent, setEditContent] = useState('');

    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const toastOpacity = new Animated.Value(0);
    const toastTranslateY = new Animated.Value(50);

    const currentUserId = auth.currentUser?.uid;
    const currentUserEmail = auth.currentUser?.email;
    const [currentUserHandle, setCurrentUserHandle] = useState<string>('');
    const [currentUserAvatar, setCurrentUserAvatar] = useState<string>('');
    const [notificationCount, setNotificationCount] = useState(0);
    const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loadingNotifications, setLoadingNotifications] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [searchType, setSearchType] = useState<'posts' | 'users'>('users');
    const [userTiers, setUserTiers] = useState<Record<string, string>>({});



    const showToast = (message: string) => {
        setToastMessage(message);
        setToastVisible(true);

        Animated.parallel([
            Animated.timing(toastOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
            Animated.timing(toastTranslateY, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }),
        ]).start();

        setTimeout(() => {
            Animated.parallel([
                Animated.timing(toastOpacity, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(toastTranslateY, {
                    toValue: 50,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                setToastVisible(false);
                toastTranslateY.setValue(50);
            });
        }, 2500);
    };

    useEffect(() => {
        if (!currentUserId) return;

        const loadUserData = async () => {
            try {
                const userDoc = await getDoc(doc(db, 'users', currentUserId));
                if (userDoc.exists()) {
                    setSavedPosts(userDoc.data()?.savedPosts || []);
                    setCurrentUserHandle(userDoc.data()?.handle || currentUserEmail?.split('@')[0] || 'user');
                    setCurrentUserAvatar(userDoc.data()?.avatarURL || '');
                }

                const followDoc = await getDoc(doc(db, 'follows', currentUserId));
                if (followDoc.exists()) {
                    setFollowingUsers(followDoc.data()?.following || []);
                }
            } catch (error) {
                console.error('Error loading user data:', error);
            }
        };

        loadUserData();
    }, [currentUserId]);


    useEffect(() => {
        const loadUserTiers = async () => {
            const userIds = [...new Set(posts.map(post => post.userId))];
            const tiers: Record<string, string> = {};

            for (const userId of userIds) {
                try {
                    const userDoc = await getDoc(doc(db, 'users', userId));
                    if (userDoc.exists()) {
                        tiers[userId] = userDoc.data()?.subscriptionTier || 'FREE';
                    }
                } catch (error) {
                    console.error('Error loading user tier:', error);
                }
            }

            setUserTiers(tiers);
        };

        if (posts.length > 0) {
            loadUserTiers();
        }
    }, [posts]);



    const loadNotifications = async () => {
        if (!currentUserId) return;

        setLoadingNotifications(true);
        try {
            const notificationsQuery = query(
                collection(db, 'notifications'),
                where('recipientId', '==', currentUserId),
                orderBy('timestamp', 'desc')
            );

            const snapshot = await getDocs(notificationsQuery);
            const fetchedNotifications = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
            })) as Notification[];

            setNotifications(fetchedNotifications);
        } catch (error) {
            console.error('Error loading notifications:', error);
        } finally {
            setLoadingNotifications(false);
        }
    };
    const markNotificationAsRead = async (notificationId: string) => {
        try {
            await updateDoc(doc(db, 'notifications', notificationId), { read: true });
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            const unreadNotifications = notifications.filter(n => !n.read);
            await Promise.all(
                unreadNotifications.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true }))
            );
            loadNotifications();
        } catch (error) {
            console.error('Error marking all as read:', error);
        }
    };




    const handleSearch = async (searchText: string) => {
        setSearchQuery(searchText);

        if (!searchText.trim()) {
            setShowSearchResults(false);
            setSearchResults([]);
            return;
        }

        setShowSearchResults(true);

        try {
            if (searchType === 'users') {
                const usersRef = collection(db, 'users');
                const q = query(
                    usersRef,
                    where('handle', '>=', searchText.toLowerCase()),
                    where('handle', '<=', searchText.toLowerCase() + '\uf8ff'),
                    limit(10)
                );

                const snapshot = await getDocs(q);
                const users = snapshot.docs.map(doc => ({
                    id: doc.id,
                    type: 'user',
                    ...doc.data()
                }));

                setSearchResults(users);
            } else {
                const postsRef = collection(db, 'posts');
                const allPosts = posts.filter(post =>
                    post.content.toLowerCase().includes(searchText.toLowerCase())
                );

                setSearchResults(allPosts.map(post => ({ ...post, type: 'post' })));
            }
        } catch (error) {
            console.error('Search error:', error);
        }
    };


    useEffect(() => {
        const q = query(collection(db, 'posts'), orderBy('timestamp', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedPosts = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
            })) as Post[];

            setPosts(fetchedPosts);
            applyFilters(fetchedPosts, activeFilter);
            setLoading(false);
            setRefreshing(false);
        });

        return () => unsubscribe();
    }, []);

    useFocusEffect(
        useCallback(() => {
            setRefreshing(true);
            setTimeout(() => setRefreshing(false), 500);
        }, [])
    );

    const applyFilters = (postsList: Post[], filter: string) => {
        let filtered = postsList;

        if (filter === 'For You') {
            filtered = [...postsList].sort((a, b) => {
                const scoreA = (a.likes?.length || 0) * 2 + (a.commentCount || 0);
                const scoreB = (b.likes?.length || 0) * 2 + (b.commentCount || 0);
                return scoreB - scoreA;
            });
        } else if (filter === 'Following') {
            filtered = filtered.filter(post => followingUsers.includes(post.userId));
        } else if (filter !== 'For You') {
            filtered = filtered.filter(post => post.category === filter);
        }

        setFilteredPosts(filtered);
    };


    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.read) {
            await markNotificationAsRead(notification.id);
        }

        setNotificationsModalVisible(false);

        if (notification.type === 'follow') {
            setTimeout(() => {
                router.push(`/u/${notification.senderHandle}`);
            }, 100);
        } else if (notification.postId) {
            const postDoc = await getDoc(doc(db, 'posts', notification.postId));
            if (postDoc.exists()) {
                const post = { id: postDoc.id, ...postDoc.data() } as Post;
                setTimeout(() => {
                    openComments(post);
                }, 100);
            }
        }
    };


    useEffect(() => {
        applyFilters(posts, activeFilter);
    }, [activeFilter, posts, followingUsers]);

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.9,
        });

        if (!result.canceled) {
            setSelectedImage(result.assets[0].uri);
        }
    };

    useEffect(() => {
        if (!currentUserId) return;

        const notificationsQuery = query(
            collection(db, 'notifications'),
            where('recipientId', '==', currentUserId),
            where('read', '==', false)
        );

        const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
            setNotificationCount(snapshot.docs.length);
        });

        return () => unsubscribe();
    }, [currentUserId]);

    const uploadImage = async (uri: string): Promise<string> => {
        try {
            const base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: 'base64',
            });
    
            const blob = await fetch(`data:image/jpeg;base64,${base64}`).then(res => res.blob());
    
            const filename = `posts/${currentUserId}/${Date.now()}.jpg`;
            const storageRef = ref(storage, filename);
    
            await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
            return await getDownloadURL(storageRef);
        } catch (error: any) {
            console.error('Upload error:', error);
            Alert.alert('Upload Failed', error.message || 'Could not upload image');
            throw error;
        }
    };

    const handleCreatePost = async () => {
        if (!newPostContent.trim()) {
            Alert.alert('Error', 'Please add some content to your post');
            return;
        }

        setPosting(true);
        try {
            let imageUrl = '';
            if (selectedImage) {
                imageUrl = await uploadImage(selectedImage);
            }

            await addDoc(collection(db, 'posts'), {
                userId: currentUserId,
                username: currentUserEmail?.split('@')[0] || 'Anonymous',
                handle: currentUserHandle || currentUserEmail?.split('@')[0] || 'user',
                userAvatar: currentUserAvatar || '',
                content: newPostContent,
                imageUrl,
                category: selectedCategory,
                likes: [],
                saves: [],
                commentCount: 0,
                timestamp: new Date(),
            });

            setNewPostContent('');
            setSelectedImage(null);
            setSelectedCategory('Builds');
            setModalVisible(false);
            showToast('Post created successfully!');
        } catch (error) {
            console.error('Error creating post:', error);
            Alert.alert('Error', 'Failed to create post');
        } finally {
            setPosting(false);
        }
    };

    const handleLike = async (postId: string, likes: string[], postOwnerId: string) => {
        if (!currentUserId) return;

        const postRef = doc(db, 'posts', postId);
        const isLiked = likes.includes(currentUserId);

        try {
            await updateDoc(postRef, {
                likes: isLiked ? arrayRemove(currentUserId) : arrayUnion(currentUserId)
            });

            if (!isLiked) {
                await createNotification(postOwnerId, 'like', postId);

                // Send push notification
                if (postOwnerId !== currentUserId) {
                    sendPushNotification(postOwnerId, {
                        title: '❤️ New Like',
                        body: `@${currentUserHandle} liked your post`,
                        data: { type: 'like', postId }
                    });
                }
            }
        } catch (error) {
            console.error('Error toggling like:', error);
        }
    };



    const handleSave = async (postId: string, saves: string[]) => {
        if (!currentUserId) return;

        const postRef = doc(db, 'posts', postId);
        const userRef = doc(db, 'users', currentUserId);
        const isSaved = saves.includes(currentUserId);

        try {
            await updateDoc(postRef, {
                saves: isSaved ? arrayRemove(currentUserId) : arrayUnion(currentUserId)
            });

            await updateDoc(userRef, {
                savedPosts: isSaved ? arrayRemove(postId) : arrayUnion(postId)
            });

            setSavedPosts(prev => isSaved ? prev.filter(id => id !== postId) : [...prev, postId]);
            showToast(isSaved ? 'Removed from saved' : 'Post saved');
        } catch (error) {
            console.error('Error toggling save:', error);
        }
    };

    const handleFollow = async (targetUserId: string) => {
        if (!currentUserId || targetUserId === currentUserId) return;

        const isFollowing = followingUsers.includes(targetUserId);

        try {
            const currentUserFollowRef = doc(db, 'follows', currentUserId);
            const currentUserFollowDoc = await getDoc(currentUserFollowRef);

            if (!currentUserFollowDoc.exists()) {
                await setDoc(currentUserFollowRef, {
                    following: isFollowing ? [] : [targetUserId],
                    followers: []
                });
            } else {
                await updateDoc(currentUserFollowRef, {
                    following: isFollowing ? arrayRemove(targetUserId) : arrayUnion(targetUserId)
                });
            }

            const targetUserFollowRef = doc(db, 'follows', targetUserId);
            const targetUserFollowDoc = await getDoc(targetUserFollowRef);

            if (!targetUserFollowDoc.exists()) {
                await setDoc(targetUserFollowRef, {
                    followers: [currentUserId],
                    following: []
                });
            } else {
                await updateDoc(targetUserFollowRef, {
                    followers: isFollowing ? arrayRemove(currentUserId) : arrayUnion(currentUserId)
                });
            }

            setFollowingUsers(prev =>
                isFollowing ? prev.filter(id => id !== targetUserId) : [...prev, targetUserId]
            );

            showToast(isFollowing ? 'Unfollowed' : 'Following');
        } catch (error) {
            console.error('Error toggling follow:', error);
        }
        if (!isFollowing) {
            await createNotification(targetUserId, 'follow');

            // Send push notification for follow
            if (targetUserId !== currentUserId) {
                sendPushNotification(targetUserId, {
                    title: '👥 New Follower',
                    body: `@${currentUserHandle} started following you`,
                    data: { type: 'follow', userId: currentUserId, handle: currentUserHandle },
                    notificationType: 'community'
                });
            }
        }
    };

    const handleShare = async (post: Post) => {
        try {
            const result = await Share.share({
                message: `Check out this post on OVRTK: "${post.content.slice(0, 100)}..." - @${post.handle || post.username}`,
            });

            if (result.action === Share.sharedAction) {
                showToast('Post shared!');
            }
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };

    const handleDeletePost = async (postId: string) => {
        Alert.alert(
            'Delete Post',
            'This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteDoc(doc(db, 'posts', postId));

                            const commentsQuery = query(collection(db, 'comments'), where('postId', '==', postId));
                            const commentsSnapshot = await getDocs(commentsQuery);
                            await Promise.all(commentsSnapshot.docs.map(d => deleteDoc(doc(db, 'comments', d.id))));

                            setPostMenuModalVisible(false);
                            setSelectedPostForMenu(null);
                            showToast('Post deleted');
                        } catch (error) {
                            console.error('Error deleting post:', error);
                        }
                    }
                }
            ]
        );
    };

    const handleEditPost = (post: Post) => {
        setEditingPost(post);
        setEditContent(post.content);
        setEditModalVisible(true);
        setPostMenuModalVisible(false);
        setSelectedPostForMenu(null);
    };

    const handleSaveEdit = async () => {
        if (!editingPost || !editContent.trim()) return;

        try {
            await updateDoc(doc(db, 'posts', editingPost.id), { content: editContent });

            setEditModalVisible(false);
            setEditingPost(null);
            setEditContent('');
            showToast('Post updated');
        } catch (error) {
            console.error('Error updating post:', error);
        }
    };

    const handleCopyLink = async (postId: string) => {
        setPostMenuModalVisible(false);
        setSelectedPostForMenu(null);

        try {
            await Clipboard.setStringAsync(`https://ovrtk.com/post/${postId}`);
            showToast('Link copied');
        } catch (error) {
            console.error('Error copying link:', error);
        }
    };

    const handleCopyComment = async (comment: Comment) => {
        setCommentMenuModalVisible(false);
        setSelectedCommentForMenu(null);

        try {
            await Clipboard.setStringAsync(comment.content);
            showToast('Text copied');
        } catch (error) {
            console.error('Error copying:', error);
        }
    };

    const handleReplyToComment = (comment: Comment) => {
        setCommentMenuModalVisible(false);
        setSelectedCommentForMenu(null);
        setReplyingTo(comment);
        setNewComment(`@${comment.handle || comment.username} `);
    };

    const openComments = async (post: Post) => {
        setLoadingComments(true); // Don't open modal yet!

        try {
            // Get FRESH post data from Firestore FIRST
            const postDoc = await getDoc(doc(db, 'posts', post.id));
            if (postDoc.exists()) {
                const freshPost = { id: postDoc.id, ...postDoc.data() } as Post;
                setSelectedPost(freshPost); // Set the fresh data with correct count
            } else {
                setSelectedPost(post); // Fallback to passed post
            }

            // Then load comments
            const q = query(
                collection(db, 'comments'),
                where('postId', '==', post.id),
                orderBy('timestamp', 'desc')
            );

            const snapshot = await getDocs(q);
            const fetchedComments = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
            })) as Comment[];

            setComments(fetchedComments);

            // NOW open the modal after data is loaded
            setCommentsModalVisible(true);
        } catch (error) {
            console.error('Error fetching comments:', error);
        } finally {
            setLoadingComments(false);
        }
    };

    const handleDeleteComment = async (commentId: string, postId: string) => {
        Alert.alert(
            'Delete Reply?',
            'This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            // First, get the actual comment count from Firestore
                            const commentsQuery = query(
                                collection(db, 'comments'),
                                where('postId', '==', postId)
                            );
                            const commentsSnapshot = await getDocs(commentsQuery);
                            const actualCommentCount = commentsSnapshot.docs.length;

                            // Delete the comment
                            await deleteDoc(doc(db, 'comments', commentId));

                            // Set the correct count (actual count - 1, but never below 0)
                            const newCount = Math.max(0, actualCommentCount - 1);
                            await updateDoc(doc(db, 'posts', postId), {
                                commentCount: newCount
                            });

                            // Refresh post data
                            const updatedPostDoc = await getDoc(doc(db, 'posts', postId));
                            if (updatedPostDoc.exists()) {
                                const freshPost = { id: updatedPostDoc.id, ...updatedPostDoc.data() } as Post;
                                setSelectedPost(freshPost);

                                // Update posts list
                                setPosts(prevPosts =>
                                    prevPosts.map(p =>
                                        p.id === postId ? freshPost : p
                                    )
                                );
                            }

                            // Reload comments
                            const q = query(
                                collection(db, 'comments'),
                                where('postId', '==', postId),
                                orderBy('timestamp', 'desc')
                            );
                            const snapshot = await getDocs(q);
                            const fetchedComments = snapshot.docs.map(docSnap => ({
                                id: docSnap.id,
                                ...docSnap.data(),
                            })) as Comment[];
                            setComments(fetchedComments);

                            setCommentMenuModalVisible(false);
                            setSelectedCommentForMenu(null);
                            showToast('Reply deleted');
                        } catch (error) {
                            console.error('Error deleting comment:', error);
                            Alert.alert('Error', `Could not delete: ${(error as Error).message}`);
                        }
                    }
                }
            ]
        );
    };

    const formatTime = (timestamp: any) => {
        if (!timestamp) return 'now';

        const date = timestamp.toDate?.() || new Date(timestamp);
        const now = new Date();
        const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diff < 60) return 'now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const goToUserProfile = (handle: string) => {
        if (handle) {
            setCommentsModalVisible(false);
            setReplyingTo(null);
            setNewComment('');
            setTimeout(() => {
                router.push(`/u/${handle}`);
            }, 100);
        }
    };

    const createNotification = async (
        recipientId: string,
        type: 'like' | 'comment' | 'follow' | 'reply' | 'mention',
        postId?: string,
        commentId?: string
    ) => {
        if (recipientId === currentUserId) return;

        try {
            await addDoc(collection(db, 'notifications'), {
                recipientId,
                senderId: currentUserId,
                senderHandle: currentUserHandle || currentUserEmail?.split('@')[0] || 'user',
                senderAvatar: currentUserAvatar || '',
                type,
                postId: postId || null,
                commentId: commentId || null,
                read: false,
                timestamp: new Date(),
            });
        } catch (error) {
            console.error('Error creating notification:', error);
        }
    };


    const handleAddComment = async () => {
        if (!newComment.trim() || !selectedPost) return;

        try {
            const userDoc = await getDoc(doc(db, 'users', currentUserId!));
            const userData = userDoc.data();
            const userHandle = userData?.handle || currentUserHandle || currentUserEmail?.split('@')[0] || 'user';

            // Add the comment
            const commentRef = await addDoc(collection(db, 'comments'), {
                postId: selectedPost.id,
                userId: currentUserId,
                username: userData?.displayName || currentUserEmail?.split('@')[0] || 'Anonymous',
                handle: userHandle,
                content: newComment,
                timestamp: new Date(),
            });

            // Get actual comment count
            const commentsQuery = query(
                collection(db, 'comments'),
                where('postId', '==', selectedPost.id)
            );
            const commentsSnapshot = await getDocs(commentsQuery);
            const actualCommentCount = commentsSnapshot.docs.length;

            // Set the correct count
            await updateDoc(doc(db, 'posts', selectedPost.id), {
                commentCount: actualCommentCount
            });

            // Get fresh post data
            const postDoc = await getDoc(doc(db, 'posts', selectedPost.id));
            if (postDoc.exists()) {
                const freshPost = { id: postDoc.id, ...postDoc.data() } as Post;
                setSelectedPost(freshPost);

                setPosts(prevPosts =>
                    prevPosts.map(p =>
                        p.id === selectedPost.id ? freshPost : p
                    )
                );
            }

            // Notifications
            if (replyingTo) {
                await createNotification(replyingTo.userId, 'reply', selectedPost.id, commentRef.id);

                // Send push notification for reply
                if (replyingTo.userId !== currentUserId) {
                    sendPushNotification(replyingTo.userId, {
                        title: '💬 New Reply',
                        body: `@${currentUserHandle} replied: ${newComment.slice(0, 50)}${newComment.length > 50 ? '...' : ''}`,
                        data: { type: 'reply', postId: selectedPost.id, commentId: commentRef.id }
                    });
                }
            } else {
                await createNotification(selectedPost.userId, 'comment', selectedPost.id, commentRef.id);

                // Send push notification for comment
                if (selectedPost.userId !== currentUserId) {
                    sendPushNotification(selectedPost.userId, {
                        title: '💬 New Comment',
                        body: `@${currentUserHandle} commented: ${newComment.slice(0, 50)}${newComment.length > 50 ? '...' : ''}`,
                        data: { type: 'comment', postId: selectedPost.id, commentId: commentRef.id }
                    });
                }
            }

            // Mentions
            const mentionRegex = /@(\w+)/g;
            const mentions = newComment.match(mentionRegex);
            if (mentions) {
                for (const mention of mentions) {
                    const mentionedHandle = mention.substring(1);
                    const usersQuery = query(collection(db, 'users'), where('handle', '==', mentionedHandle));
                    const usersSnapshot = await getDocs(usersQuery);
                    if (!usersSnapshot.empty) {
                        const mentionedUserId = usersSnapshot.docs[0].id;
                        await createNotification(mentionedUserId, 'mention', selectedPost.id, commentRef.id);
                    }
                }
            }

            setNewComment('');
            setReplyingTo(null);

            // Reload comments
            setComments(commentsSnapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
            })) as Comment[]);
        } catch (error) {
            console.error('Error adding comment:', error);
        }
    };


    const renderPost = ({ item }: { item: Post }) => {
        const isLiked = item.likes?.includes(currentUserId || '');
        const isSaved = item.saves?.includes(currentUserId || '');
        const isFollowing = followingUsers.includes(item.userId);
        const isOwnPost = item.userId === currentUserId;

        return (
            <View style={s.postCard}>
                <View style={s.postHeader}>
                    <TouchableOpacity onPress={() => goToUserProfile(item.handle || item.username)}>
                        {item.userAvatar ? (
                            <Image source={{ uri: item.userAvatar }} style={s.avatar} />
                        ) : (
                            <View style={s.avatar}>
                                <Text style={s.avatarText}>
                                    {(item.handle || item.username || 'U').charAt(0).toUpperCase()}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    <View style={s.postMain}>
                        <View style={s.postTop}>
                            <TouchableOpacity onPress={() => goToUserProfile(item.handle || item.username)} style={s.userInfo}>
                                <Text style={s.username} numberOfLines={1}>@{item.handle || item.username}</Text>
                                {userTiers[item.userId] === 'CLUB' && (
                                    <View style={s.clubBadgeSmall}>
                                        <Ionicons name="star" size={12} color="#111" />
                                    </View>
                                )}
                                <Text style={s.dot}>·</Text>
                                <Text style={s.time}>{formatTime(item.timestamp)}</Text>
                            </TouchableOpacity>

                            <View style={s.topActions}>
                                {!isOwnPost && (
                                    <TouchableOpacity
                                        style={[s.followBtn, isFollowing && s.followingBtn]}
                                        onPress={() => handleFollow(item.userId)}
                                    >
                                        <Text style={[s.followBtnText, isFollowing && s.followingBtnText]}>
                                            {isFollowing ? 'Following' : 'Follow'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    onPress={() => {
                                        setSelectedPostForMenu(item);
                                        setPostMenuModalVisible(true);
                                    }}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    <Ionicons name="ellipsis-horizontal" size={18} color={C.muted} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <Text style={s.content}>{item.content}</Text>

                        {item.imageUrl && (
                            <TouchableOpacity activeOpacity={0.9}>
                                <Image source={{ uri: item.imageUrl }} style={s.postImage} />
                            </TouchableOpacity>
                        )}

                        <View style={s.actions}>
                            <TouchableOpacity style={s.actionBtn} onPress={() => openComments(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Ionicons name="chatbubble-outline" size={18} color={C.muted} />
                                {item.commentCount > 0 && <Text style={s.actionCount}>{item.commentCount}</Text>}
                            </TouchableOpacity>

                            <TouchableOpacity style={s.actionBtn} onPress={() => handleLike(item.id, item.likes || [], item.userId)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Ionicons name={isLiked ? "heart" : "heart-outline"} size={18} color={isLiked ? C.accent : C.muted} />
                                {item.likes?.length > 0 && <Text style={[s.actionCount, isLiked && s.likedCount]}>{item.likes.length}</Text>}
                            </TouchableOpacity>

                            <TouchableOpacity style={s.actionBtn} onPress={() => handleSave(item.id, item.saves || [])} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={18} color={isSaved ? C.accent : C.muted} />
                            </TouchableOpacity>

                            <TouchableOpacity style={s.actionBtn} onPress={() => handleShare(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Ionicons name="share-outline" size={18} color={C.muted} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={s.container}>
                <ActivityIndicator size="large" color={C.accent} style={{ marginTop: 40 }} />
            </SafeAreaView>
        );
    }
    return (
        <SafeAreaView style={s.container} edges={['top']}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    {currentUserAvatar ? (
                        <Image source={{ uri: currentUserAvatar }} style={s.headerAvatar} />
                    ) : (
                        <View style={s.headerAvatar}>
                            <Text style={s.avatarText}>{(currentUserHandle?.charAt(0) || currentUserEmail?.charAt(0) || 'U').toUpperCase()}</Text>
                        </View>
                    )}
                </TouchableOpacity>

                <Text style={s.headerLogo}>OVRTK</Text>

                <TouchableOpacity
                    onPress={() => {
                        setNotificationsModalVisible(true);
                        loadNotifications();
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ position: 'relative' }}
                >
                    <Ionicons name="notifications-outline" size={22} color={C.text} />
                    {notificationCount > 0 && (
                        <View style={s.notificationBadge}>
                            <Text style={s.notificationBadgeText}>
                                {notificationCount > 99 ? '99+' : notificationCount}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            <View style={s.searchAndTabsWrapper}>
                <View style={s.searchContainer}>
                    <Ionicons name="search" size={18} color={C.muted} style={s.searchIcon} />
                    <TextInput
                        style={s.searchInput}
                        placeholder={searchType === 'users' ? "Search users..." : "Search posts..."}
                        placeholderTextColor={C.muted}
                        value={searchQuery}
                        onChangeText={handleSearch}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => handleSearch('')}>
                            <Ionicons name="close-circle" size={18} color={C.muted} />
                        </TouchableOpacity>
                    )}
                </View>

                <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 8 }}>
                    <TouchableOpacity
                        style={[s.searchTypeBtn, searchType === 'users' && s.searchTypeBtnActive]}
                        onPress={() => {
                            setSearchType('users');
                            setSearchQuery('');
                            setShowSearchResults(false);
                            setSearchResults([]);
                        }}
                    >
                        <Text style={[s.searchTypeText, searchType === 'users' && s.searchTypeTextActive]}>
                            Users
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[s.searchTypeBtn, searchType === 'posts' && s.searchTypeBtnActive]}
                        onPress={() => {
                            setSearchType('posts');
                            setSearchQuery('');
                            setShowSearchResults(false);
                            setSearchResults([]);
                        }}
                    >
                        <Text style={[s.searchTypeText, searchType === 'posts' && s.searchTypeTextActive]}>
                            Posts
                        </Text>
                    </TouchableOpacity>
                </View>

                {showSearchResults && (
                    <View style={s.searchResultsContainer}>
                        {searchResults.length === 0 ? (
                            <Text style={s.noResults}>No results found</Text>
                        ) : (
                            <FlatList
                                data={searchResults}
                                keyExtractor={(item) => item.id}
                                renderItem={({ item }) => {
                                    if (item.type === 'user') {
                                        return (
                                            <TouchableOpacity
                                                style={s.userResultItem}
                                                onPress={() => {
                                                    router.push(`/u/${item.handle}`);
                                                    setShowSearchResults(false);
                                                    setSearchQuery('');
                                                }}
                                            >
                                                <View style={s.userResultAvatar}>
                                                    {item.avatarURL ? (
                                                        <Image source={{ uri: item.avatarURL }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                                                    ) : (
                                                        <Text style={s.avatarLetter}>
                                                            {(item.handle || 'U').charAt(0).toUpperCase()}
                                                        </Text>
                                                    )}
                                                </View>
                                                <View style={{ marginLeft: 12 }}>
                                                    <Text style={s.userResultName}>{item.displayName || 'User'}</Text>
                                                    <Text style={s.userResultHandle}>@{item.handle}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    } else {
                                        return (
                                            <TouchableOpacity
                                                style={s.postResultItem}
                                                onPress={() => {
                                                    setShowSearchResults(false);
                                                    setSearchQuery('');
                                                }}
                                            >
                                                <Text style={s.postResultText} numberOfLines={2}>
                                                    {item.content}
                                                </Text>
                                                <Text style={s.postResultAuthor}>@{item.handle}</Text>
                                            </TouchableOpacity>
                                        );
                                    }
                                }}
                            />
                        )}
                    </View>
                )}

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsContainer} contentContainerStyle={s.tabsContent}>
                    {CATEGORIES.map((cat) => (
                        <TouchableOpacity key={cat} style={s.tab} onPress={() => setActiveFilter(cat)}>
                            <Text style={[s.tabText, activeFilter === cat && s.tabTextActive]}>{cat}</Text>
                            {activeFilter === cat && <View style={s.tabIndicator} />}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <FlatList
                data={filteredPosts}
                renderItem={renderPost}
                keyExtractor={(item) => item.id}
                contentContainerStyle={s.feedContainer}
                style={{ flex: 1 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} tintColor={C.accent} />}
                ItemSeparatorComponent={() => <View style={s.separator} />}
                ListEmptyComponent={
                    <View style={s.emptyState}>
                        <Ionicons name="chatbubbles-outline" size={56} color={C.muted} />
                        <Text style={s.emptyText}>No posts yet</Text>
                        <Text style={s.emptySubtext}>Be the first to post!</Text>
                    </View>
                }
            />

            <TouchableOpacity style={s.fab} onPress={() => setModalVisible(true)} activeOpacity={0.85}>
                <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>

            {toastVisible && (
                <Animated.View style={[s.toast, { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }] }]}>
                    <Text style={s.toastText}>{toastMessage}</Text>
                </Animated.View>
            )}

            <Modal visible={postMenuModalVisible} animationType="fade" transparent={true} onRequestClose={() => { setPostMenuModalVisible(false); setSelectedPostForMenu(null); }}>
                <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => { setPostMenuModalVisible(false); setSelectedPostForMenu(null); }}>
                    <View style={s.menuModal}>
                        {selectedPostForMenu && selectedPostForMenu.userId === currentUserId ? (
                            <>
                                <TouchableOpacity style={s.menuItem} onPress={() => handleEditPost(selectedPostForMenu)}>
                                    <Ionicons name="create-outline" size={20} color={C.text} />
                                    <Text style={s.menuText}>Edit</Text>
                                </TouchableOpacity>
                                <View style={s.menuDivider} />
                                <TouchableOpacity style={s.menuItem} onPress={() => handleDeletePost(selectedPostForMenu.id)}>
                                    <Ionicons name="trash-outline" size={20} color={C.accent} />
                                    <Text style={[s.menuText, { color: C.accent }]}>Delete</Text>
                                </TouchableOpacity>
                            </>
                        ) : selectedPostForMenu ? (
                            <>
                                <TouchableOpacity style={s.menuItem} onPress={() => { if (selectedPostForMenu) { handleFollow(selectedPostForMenu.userId); setPostMenuModalVisible(false); setSelectedPostForMenu(null); } }}>
                                    <Ionicons name={selectedPostForMenu && followingUsers.includes(selectedPostForMenu.userId) ? "person-remove-outline" : "person-add-outline"} size={20} color={C.text} />
                                    <Text style={s.menuText}>{selectedPostForMenu && followingUsers.includes(selectedPostForMenu.userId) ? 'Unfollow' : 'Follow'} @{selectedPostForMenu?.handle}</Text>
                                </TouchableOpacity>
                            </>
                        ) : null}
                        {selectedPostForMenu && (
                            <>
                                <View style={s.menuDivider} />
                                <TouchableOpacity style={s.menuItem} onPress={() => handleCopyLink(selectedPostForMenu.id)}>
                                    <Ionicons name="link-outline" size={20} color={C.text} />
                                    <Text style={s.menuText}>Copy link</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>

            <Modal visible={modalVisible} animationType="slide" transparent={false} onRequestClose={() => setModalVisible(false)}>
                <SafeAreaView style={s.createModal}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                        <View style={s.createHeader}>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Text style={s.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.postBtn, (!newPostContent.trim() || posting) && s.postBtnDisabled]}
                                onPress={handleCreatePost}
                                disabled={!newPostContent.trim() || posting}
                            >
                                <Text style={s.postBtnText}>{posting ? 'Posting...' : 'Post'}</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={s.createContent}>
                            <View style={s.createRow}>
                                {currentUserAvatar ? (
                                    <Image source={{ uri: currentUserAvatar }} style={s.createAvatar} />
                                ) : (
                                    <View style={s.createAvatar}>
                                        <Text style={s.avatarText}>{(currentUserHandle?.charAt(0) || currentUserEmail?.charAt(0) || 'U').toUpperCase()}</Text>
                                    </View>
                                )}

                                <View style={{ flex: 1 }}>
                                    <TextInput
                                        style={s.createInput}
                                        placeholder="What's happening?"
                                        placeholderTextColor={C.muted}
                                        multiline
                                        maxLength={500}
                                        value={newPostContent}
                                        onChangeText={setNewPostContent}
                                        autoFocus
                                    />

                                    {selectedImage && (
                                        <View style={s.imagePreviewContainer}>
                                            <Image source={{ uri: selectedImage }} style={s.imagePreview} />
                                            <TouchableOpacity style={s.removeImageBtn} onPress={() => setSelectedImage(null)}>
                                                <Ionicons name="close" size={14} color="#fff" />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            </View>

                            <View style={s.categorySelector}>
                                <Text style={s.categorySelectorLabel}>CATEGORY</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {CATEGORIES.filter(c => c !== 'For You' && c !== 'Following').map((cat) => (
                                        <TouchableOpacity
                                            key={cat}
                                            style={[s.categoryChip, selectedCategory === cat && s.categoryChipActive]}
                                            onPress={() => setSelectedCategory(cat)}
                                        >
                                            <Text style={[s.categoryChipText, selectedCategory === cat && s.categoryChipTextActive]}>
                                                {cat}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        </ScrollView>

                        <View style={s.createFooter}>
                            <TouchableOpacity onPress={pickImage}>
                                <Ionicons name="image-outline" size={20} color={C.accent} />
                            </TouchableOpacity>
                            <Text style={s.charCount}>{newPostContent.length}/500</Text>
                        </View>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </Modal>

            <Modal visible={editModalVisible} animationType="slide" transparent={false} onRequestClose={() => setEditModalVisible(false)}>
                <SafeAreaView style={s.createModal}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                        <View style={s.createHeader}>
                            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                                <Text style={s.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.postBtn, !editContent.trim() && s.postBtnDisabled]}
                                onPress={handleSaveEdit}
                                disabled={!editContent.trim()}
                            >
                                <Text style={s.postBtnText}>Save</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={s.createContent}>
                            <View style={s.createRow}>
                                {currentUserAvatar ? (
                                    <Image source={{ uri: currentUserAvatar }} style={s.createAvatar} />
                                ) : (
                                    <View style={s.createAvatar}>
                                        <Text style={s.avatarText}>{(currentUserHandle?.charAt(0) || currentUserEmail?.charAt(0) || 'U').toUpperCase()}</Text>
                                    </View>
                                )}

                                <TextInput
                                    style={s.createInput}
                                    placeholder="What's happening?"
                                    placeholderTextColor={C.muted}
                                    multiline
                                    maxLength={500}
                                    value={editContent}
                                    onChangeText={setEditContent}
                                    autoFocus
                                />
                            </View>
                        </View>

                        <View style={s.createFooter}>
                            <View />
                            <Text style={s.charCount}>{editContent.length}/500</Text>
                        </View>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </Modal>

            <Modal visible={commentsModalVisible} animationType="slide" transparent={false} onRequestClose={() => { setCommentsModalVisible(false); setReplyingTo(null); setNewComment(''); }}>
                <SafeAreaView style={s.commentsModal} edges={['bottom']}>
                    <View style={s.commentsHeader}>
                        <TouchableOpacity onPress={() => { setCommentsModalVisible(false); setReplyingTo(null); setNewComment(''); }}>
                            <Ionicons name="arrow-back" size={24} color={C.text} />
                        </TouchableOpacity>
                        <Text style={s.commentsHeaderTitle}>Replies</Text>
                        <View style={{ width: 24 }} />
                    </View>

                    {selectedPost && (
                        <View style={s.originalPostCard}>
                            <View style={s.opHeader}>
                                <TouchableOpacity onPress={() => goToUserProfile(selectedPost.handle || selectedPost.username)}>
                                    {selectedPost.userAvatar ? (
                                        <Image source={{ uri: selectedPost.userAvatar }} style={s.opAvatar} />
                                    ) : (
                                        <View style={s.opAvatar}>
                                            <Text style={s.avatarText}>{(selectedPost.handle || selectedPost.username || 'U').charAt(0).toUpperCase()}</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                                <View style={s.opInfo}>
                                    <Text style={s.opUsername}>@{selectedPost.handle || selectedPost.username}</Text>
                                </View>
                            </View>
                            <Text style={s.opContent}>{selectedPost.content}</Text>
                            {selectedPost.imageUrl && (
                                <Image source={{ uri: selectedPost.imageUrl }} style={s.opImage} />
                            )}
                            <View style={s.opStats}>
                                <View style={s.opStat}>
                                    <Ionicons name="heart" size={16} color={C.accent} />
                                    <Text style={s.opStatText}>{selectedPost.likes?.length || 0}</Text>
                                </View>
                                <View style={s.opStat}>
                                    <Ionicons name="chatbubble" size={16} color={C.muted} />
                                    <Text style={s.opStatText}>{selectedPost.commentCount || 0}</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                        <ScrollView style={s.repliesList} contentContainerStyle={s.repliesContent}>
                            {loadingComments ? (
                                <ActivityIndicator size="large" color={C.accent} style={{ marginTop: 40 }} />
                            ) : comments.length === 0 ? (
                                <View style={s.emptyReplies}>
                                    <Ionicons name="chatbubbles-outline" size={48} color={C.muted} />
                                    <Text style={s.emptyRepliesText}>No replies yet</Text>
                                    <Text style={s.emptyRepliesSubtext}>Be the first to reply!</Text>
                                </View>
                            ) : (
                                comments.map((comment) => (
                                    <View key={comment.id} style={s.replyCard}>
                                        <TouchableOpacity onPress={() => goToUserProfile(comment.handle || comment.username)}>
                                            <View style={s.replyAvatar}>
                                                <Text style={s.avatarText}>{(comment.handle || comment.username || 'U').charAt(0).toUpperCase()}</Text>
                                            </View>
                                        </TouchableOpacity>

                                        <View style={s.replyBody}>
                                            <View style={s.replyHeader}>
                                                <TouchableOpacity onPress={() => goToUserProfile(comment.handle || comment.username)} style={s.replyUserInfo}>
                                                    <Text style={s.replyUsername}>@{comment.handle || comment.username}</Text>
                                                    <Text style={s.replyDot}>·</Text>
                                                    <Text style={s.replyTime}>{formatTime(comment.timestamp)}</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    onPress={() => {
                                                        setSelectedCommentForMenu(comment);
                                                        setCommentMenuModalVisible(true);
                                                    }}
                                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                >
                                                    <Ionicons name="ellipsis-horizontal" size={16} color={C.muted} />
                                                </TouchableOpacity>
                                            </View>
                                            <Text style={s.replyText} selectable>{comment.content}</Text>
                                        </View>
                                    </View>
                                ))
                            )}
                        </ScrollView>

                        <View style={s.replyInputSection}>
                            {replyingTo && (
                                <View style={s.replyingToBanner}>
                                    <Text style={s.replyingToText}>Replying to @{replyingTo.handle || replyingTo.username}</Text>
                                    <TouchableOpacity onPress={() => { setReplyingTo(null); setNewComment(''); }}>
                                        <Ionicons name="close-circle" size={18} color={C.muted} />
                                    </TouchableOpacity>
                                </View>
                            )}
                            <View style={s.replyInputRow}>
                                {currentUserAvatar ? (
                                    <Image source={{ uri: currentUserAvatar }} style={s.inputAvatar} />
                                ) : (
                                    <View style={s.inputAvatar}>
                                        <Text style={s.avatarText}>{(currentUserHandle?.charAt(0) || currentUserEmail?.charAt(0) || 'U').toUpperCase()}</Text>
                                    </View>
                                )}

                                <View style={s.replyInputWrapper}>
                                    <TextInput
                                        style={s.replyInput}
                                        placeholder="Post your reply..."
                                        placeholderTextColor={C.muted}
                                        value={newComment}
                                        onChangeText={setNewComment}
                                        multiline
                                        maxLength={500}
                                    />
                                    <TouchableOpacity
                                        style={[s.sendButton, !newComment.trim() && s.sendButtonDisabled]}
                                        onPress={handleAddComment}
                                        disabled={!newComment.trim()}
                                    >
                                        <Ionicons name="send" size={18} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </KeyboardAvoidingView>

                    <Modal visible={commentMenuModalVisible} animationType="fade" transparent={true} onRequestClose={() => { setCommentMenuModalVisible(false); setSelectedCommentForMenu(null); }}>
                        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => { setCommentMenuModalVisible(false); setSelectedCommentForMenu(null); }}>
                            <View style={s.menuModal}>
                                {selectedCommentForMenu && (
                                    <>
                                        <TouchableOpacity style={s.menuItem} onPress={() => handleReplyToComment(selectedCommentForMenu)}>
                                            <Ionicons name="arrow-undo-outline" size={20} color={C.text} />
                                            <Text style={s.menuText}>Reply</Text>
                                        </TouchableOpacity>
                                        <View style={s.menuDivider} />
                                        <TouchableOpacity style={s.menuItem} onPress={() => handleCopyComment(selectedCommentForMenu)}>
                                            <Ionicons name="copy-outline" size={20} color={C.text} />
                                            <Text style={s.menuText}>Copy</Text>
                                        </TouchableOpacity>
                                        {selectedCommentForMenu.userId === currentUserId && (
                                            <>
                                                <View style={s.menuDivider} />
                                                <TouchableOpacity style={s.menuItem} onPress={() => handleDeleteComment(selectedCommentForMenu.id, selectedCommentForMenu.postId)}>
                                                    <Ionicons name="trash-outline" size={20} color={C.accent} />
                                                    <Text style={[s.menuText, { color: C.accent }]}>Delete</Text>
                                                </TouchableOpacity>
                                            </>
                                        )}
                                    </>
                                )}
                            </View>
                        </TouchableOpacity>
                    </Modal>
                </SafeAreaView>
            </Modal>
            <Modal visible={notificationsModalVisible} animationType="slide" transparent={false} onRequestClose={() => setNotificationsModalVisible(false)}>
                <SafeAreaView style={s.notificationsModal} edges={['bottom']}>
                    <View style={s.notificationsHeader}>
                        <TouchableOpacity onPress={() => setNotificationsModalVisible(false)}>
                            <Ionicons name="arrow-back" size={24} color={C.text} />
                        </TouchableOpacity>
                        <Text style={s.notificationsHeaderTitle}>Notifications</Text>
                        <TouchableOpacity onPress={() => {
                            setNotificationsModalVisible(false);
                            setTimeout(() => {
                                router.push({
                                    pathname: '/(tabs)/profile',
                                    params: { scrollTo: 'preferences' }
                                });
                            }, 100);
                        }}>
                            <Ionicons name="settings-outline" size={22} color={C.text} />
                        </TouchableOpacity>
                    </View>

                    {notifications.length > 0 && (
                        <TouchableOpacity style={s.markAllReadBtn} onPress={markAllAsRead}>
                            <Text style={s.markAllReadText}>Mark all as read</Text>
                        </TouchableOpacity>
                    )}

                    <ScrollView style={s.notificationsList} contentContainerStyle={s.notificationsContent}>
                        {loadingNotifications ? (
                            <ActivityIndicator size="large" color={C.accent} style={{ marginTop: 40 }} />
                        ) : notifications.length === 0 ? (
                            <View style={s.emptyNotifications}>
                                <Ionicons name="notifications-outline" size={64} color={C.muted} />
                                <Text style={s.emptyNotificationsText}>No notifications yet</Text>
                                <Text style={s.emptyNotificationsSubtext}>When someone likes, comments, or follows you, you'll see it here</Text>
                            </View>
                        ) : (
                            notifications.map((notification) => {
                                let notificationText = '';
                                let icon: any = 'heart';
                                let iconColor = C.accent;

                                switch (notification.type) {
                                    case 'like':
                                        notificationText = 'liked your post';
                                        icon = 'heart';
                                        iconColor = C.accent;
                                        break;
                                    case 'comment':
                                        notificationText = 'commented on your post';
                                        icon = 'chatbubble';
                                        iconColor = C.text;
                                        break;
                                    case 'follow':
                                        notificationText = 'started following you';
                                        icon = 'person-add';
                                        iconColor = C.accent;
                                        break;
                                    case 'reply':
                                        notificationText = 'replied to your comment';
                                        icon = 'arrow-undo';
                                        iconColor = C.text;
                                        break;
                                    case 'mention':
                                        notificationText = 'mentioned you in a comment';
                                        icon = 'at';
                                        iconColor = C.accent;
                                        break;
                                }

                                return (
                                    <TouchableOpacity
                                        key={notification.id}
                                        style={[s.notificationItem, !notification.read && s.notificationItemUnread]}
                                        onPress={() => handleNotificationClick(notification)}
                                    >
                                        <View style={s.notificationLeft}>
                                            {notification.senderAvatar ? (
                                                <Image source={{ uri: notification.senderAvatar }} style={s.notificationAvatar} />
                                            ) : (
                                                <View style={s.notificationAvatar}>
                                                    <Text style={s.avatarText}>
                                                        {notification.senderHandle.charAt(0).toUpperCase()}
                                                    </Text>
                                                </View>
                                            )}
                                            <View style={s.notificationIconBadge}>
                                                <Ionicons name={icon} size={12} color={iconColor} />
                                            </View>
                                        </View>

                                        <View style={s.notificationContent}>
                                            <Text style={s.notificationText}>
                                                <Text style={s.notificationHandle}>@{notification.senderHandle}</Text>
                                                {' '}{notificationText}
                                            </Text>
                                            <Text style={s.notificationTime}>{formatTime(notification.timestamp)}</Text>
                                        </View>

                                        {!notification.read && <View style={s.unreadDot} />}
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </ScrollView>
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}







const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 12,
        backgroundColor: C.bg,
        borderBottomWidth: 0,
        borderBottomColor: C.line,
    },
    headerLogo: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: 0.6 },
    headerAvatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.line,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchAndTabsWrapper: {
        backgroundColor: C.panel,
        borderBottomWidth: 1,
        borderBottomColor: C.line,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: C.surface,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: C.line,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: C.text,
        padding: 0,
    },
    tabsContainer: {
        paddingBottom: 0,
    },
    tabsContent: {
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    tab: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginRight: 4,
        position: 'relative',
    },
    tabText: { fontSize: 14, fontWeight: '600', color: C.muted },
    tabTextActive: { color: C.text, fontWeight: '700' },
    tabIndicator: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: C.accent,
        borderRadius: 1,
    },
    feedContainer: { paddingBottom: 120 },
    separator: { height: 1, backgroundColor: C.line },
    postCard: { backgroundColor: C.bg, paddingVertical: 12 },
    postHeader: { flexDirection: 'row', paddingHorizontal: 11 },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.line,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    avatarText: { color: C.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
    postMain: { flex: 1 },
    postTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    userInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
    username: { fontSize: 14, fontWeight: '700', color: C.text, marginRight: 6, maxWidth: 120, letterSpacing: 0.2 },
    handle: { fontSize: 14, color: C.muted, marginRight: 6, maxWidth: 100 },
    dot: { fontSize: 14, color: C.muted, marginRight: 6 },
    time: { fontSize: 13, color: C.text, opacity: 0.6 },
    topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    followBtn: {
        paddingHorizontal: 14,
        paddingVertical: 5,
        borderRadius: 10,
        backgroundColor: C.accent,
    },
    followingBtn: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: C.line,
    },
    followBtnText: { fontSize: 13, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
    followingBtnText: { color: C.text },
    content: { fontSize: 15, lineHeight: 20, color: C.text, marginTop: 2, marginBottom: 12, letterSpacing: 0.2 },
    postImage: {
        width: '100%',
        height: 240,
        borderRadius: 12,
        marginTop: 12,
        borderWidth: 1,
        borderColor: C.line,
        backgroundColor: C.surface,
    },
    actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingRight: 40 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    actionCount: { fontSize: 13, color: C.muted, fontWeight: '600' },
    likedCount: { color: C.accent },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 32 },
    emptyText: { fontSize: 24, fontWeight: '800', color: C.text, marginTop: 16, letterSpacing: 0.3 },
    emptySubtext: { fontSize: 14, color: C.muted, marginTop: 8, textAlign: 'center' },
    fab: {
        position: 'absolute',
        bottom: 90,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: C.accent,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    toast: {
        position: 'absolute',
        bottom: 100,
        alignSelf: 'center',
        backgroundColor: C.accent,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    toastText: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'center', alignItems: 'center' },
    menuModal: {
        width: '85%',
        maxWidth: 320,
        backgroundColor: C.panel,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.line,
        overflow: 'hidden',
    },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 16 },
    menuText: { fontSize: 15, fontWeight: '700', color: C.text, flex: 1, letterSpacing: 0.2 },
    menuDivider: { height: 1, backgroundColor: C.line },
    createModal: { flex: 1, backgroundColor: C.bg },
    createHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 55,
        borderBottomWidth: 0,
        borderBottomColor: C.line,
        backgroundColor: C.bg,
    },
    cancelText: { fontSize: 16, color: C.text, fontWeight: '600', letterSpacing: 0.2 },
    postBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: C.accent,
    },
    postBtnDisabled: { opacity: 0.5 },
    postBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
    createContent: { flex: 1, padding: 18 },
    createRow: { flexDirection: 'row' },
    createAvatar: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.line,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    createInput: {
        fontSize: 18,
        color: C.text,
        minHeight: 100,
        textAlignVertical: 'top',
        letterSpacing: 0.2,
    },
    imagePreviewContainer: { position: 'relative', marginTop: 12, borderRadius: 12, overflow: 'hidden' },
    imagePreview: { width: '100%', height: 240, borderRadius: 12 },
    removeImageBtn: {
        position: 'absolute',
        top: 8,
        left: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    categorySelector: { marginTop: 24, paddingTop: 18, borderTopWidth: 1, borderTopColor: C.line },
    categorySelectorLabel: { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 12, letterSpacing: 0.5 },
    categoryChip: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: C.line,
        marginRight: 8,
    },
    categoryChipActive: { backgroundColor: C.accent, borderColor: C.accent },
    categoryChipText: { fontSize: 13, fontWeight: '600', color: C.text, letterSpacing: 0.2 },
    categoryChipTextActive: { color: '#fff', fontWeight: '700' },
    createFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 28,
        paddingVertical: 30,
        borderTopWidth: 0,
        borderTopColor: C.line,
        backgroundColor: C.bg,
    },
    charCount: { fontSize: 12, color: C.muted, letterSpacing: 0.2 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: 0.3 },
    commentsContent: { flex: 1 },
    originalPost: {
        paddingHorizontal: 18,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: C.line
    },
    repliesHeader: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        backgroundColor: C.bg,
    },
    repliesTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: C.text,
        letterSpacing: 0.3
    },
    emptyComments: {
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 32
    },
    commentItem: {
        flexDirection: 'row',
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: C.line
    },
    commentAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.line,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    commentMain: { flex: 1 },
    commentTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6
    },
    commentContent: {
        fontSize: 15,
        lineHeight: 20,
        color: C.text,
        marginTop: 2,
        letterSpacing: 0.2
    },
    replyingToBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 10,
        backgroundColor: C.surface,
        borderTopWidth: 1,
        borderTopColor: C.line,
    },
    replyingToText: { fontSize: 13, color: C.muted, letterSpacing: 0.2 },
    replyInputContainer: {
        borderTopWidth: 1,
        borderTopColor: C.line,
        backgroundColor: C.panel,
        paddingBottom: Platform.OS === 'ios' ? 20 : 8
    },
    replyInputRow: {
        flexDirection: 'row',
        paddingHorizontal: 18,
        paddingTop: 14,
        paddingBottom: 10,
        alignItems: 'center',
    },
    replyAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.line,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    replyInput: {
        flex: 1,
        fontSize: 15,
        color: C.text,
        minHeight: 36,
        maxHeight: 100,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: C.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: C.line,
        letterSpacing: 0.2
    },
    replyActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingBottom: 12
    },
    replyButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: C.accent
    },
    replyButtonDisabled: { opacity: 0.5 },
    replyButtonText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 0.3
    },
    commentsModal: {
        flex: 1,
        backgroundColor: C.bg
    },
    commentsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 60,
        borderBottomWidth: 0,
        borderBottomColor: C.line,
        backgroundColor: C.bg,
    },
    commentsHeaderTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: C.text,
        letterSpacing: 0.3
    },
    originalPostCard: {
        backgroundColor: C.panel,
        paddingHorizontal: 18,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: C.line,
    },
    opHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    opAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.line,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    opInfo: {
        flex: 1,
    },
    opUsername: {
        fontSize: 16,
        fontWeight: '700',
        color: C.text,
        letterSpacing: 0.2,
    },
    opHandle: {
        fontSize: 14,
        color: C.muted,
        marginTop: 2,
    },
    opContent: {
        fontSize: 16,
        lineHeight: 22,
        color: C.text,
        marginBottom: 12,
        letterSpacing: 0.2,
    },
    opImage: {
        width: '100%',
        height: 200,
        borderRadius: 12,
        marginBottom: 12,
        backgroundColor: C.surface,
    },
    opStats: {
        flexDirection: 'row',
        gap: 20,
    },
    opStat: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    opStatText: {
        fontSize: 14,
        fontWeight: '600',
        color: C.muted,
    },
    repliesList: {
        flex: 1,
    },
    repliesContent: {
        paddingBottom: 20,
    },
    emptyReplies: {
        alignItems: 'center',
        paddingVertical: 80,
        paddingHorizontal: 32,
    },
    emptyRepliesText: {
        fontSize: 20,
        fontWeight: '700',
        color: C.text,
        marginTop: 16,
    },
    emptyRepliesSubtext: {
        fontSize: 14,
        color: C.muted,
        marginTop: 6,
    },
    replyCard: {
        flexDirection: 'row',
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: C.line,
    },
    replyBody: {
        flex: 1,
    },
    replyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    replyUserInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    replyUsername: {
        fontSize: 15,
        fontWeight: '700',
        color: C.text,
        marginRight: 6,
        letterSpacing: 0.2,
    },
    replyHandle: {
        fontSize: 14,
        color: C.muted,
        marginRight: 6,
    },
    replyDot: {
        fontSize: 14,
        color: C.muted,
        marginRight: 6,
    },
    replyTime: {
        fontSize: 13,
        color: C.muted,
    },
    replyText: {
        fontSize: 15,
        lineHeight: 20,
        color: C.text,
        letterSpacing: 0.2,
    },
    replyInputSection: {
        borderTopWidth: 0,
        borderTopColor: C.line,
        backgroundColor: C.bg,
        paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    },
    replyingToBanner: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 10,
        backgroundColor: C.surface,
    },

    searchTypeBtn: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#1a1a1a',
    },
    searchTypeBtnActive: {
        backgroundColor: C.accent,
    },
    searchTypeText: {
        color: C.muted,
        fontSize: 14,
        fontWeight: '600',
    },
    searchTypeTextActive: {
        color: '#fff',
    },
    searchResultsContainer: {
        borderBottomColor: '#333333',
        marginHorizontal: 16,
        marginTop: 8,
        borderRadius: 12,
        maxHeight: 400,
    },
    userResultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
    },
    userResultAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: C.accent,
        alignItems: 'center',
        justifyContent: 'center',
    },
    userResultName: {
        color: C.text,
        fontSize: 16,
        fontWeight: '600',
    },
    userResultHandle: {
        color: C.muted,
        fontSize: 14,
    },
    postResultItem: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
    },
    postResultText: {
        color: C.text,
        fontSize: 14,
    },
    postResultAuthor: {
        color: C.muted,
        fontSize: 12,
        marginTop: 4,
    },
    noResults: {
        color: C.muted,
        textAlign: 'center',
        padding: 20,
    },
    avatarLetter: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },

    inputAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.line,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    replyInputWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-end',
        backgroundColor: C.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: C.line,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    sendButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: C.accent,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    sendButtonDisabled: {
        opacity: 0.4,
    },
    notificationBadge: {
        position: 'absolute',
        top: -4,
        right: -6,
        backgroundColor: C.accent,
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    notificationBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
    },

    clubBadgeSmall: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFD700',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        marginLeft: 6,
        marginRight: 4,
    },

    notificationsModal: {
        flex: 1,
        backgroundColor: C.bg,
    },
    notificationsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 55,
        borderBottomWidth: 1,
        borderBottomColor: C.line,
        backgroundColor: C.bg,
    },
    notificationsHeaderTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: C.text,
        letterSpacing: 0.3,
    },
    markAllReadBtn: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: C.line,
    },
    markAllReadText: {
        fontSize: 14,
        fontWeight: '600',
        color: C.accent,
    },
    notificationsList: {
        flex: 1,
    },
    notificationsContent: {
        paddingBottom: 20,
    },
    emptyNotifications: {
        alignItems: 'center',
        paddingVertical: 80,
        paddingHorizontal: 32,
    },
    emptyNotificationsText: {
        fontSize: 20,
        fontWeight: '700',
        color: C.text,
        marginTop: 16,
    },
    emptyNotificationsSubtext: {
        fontSize: 14,
        color: C.muted,
        marginTop: 6,
        textAlign: 'center',
    },
    notificationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: C.line,
        backgroundColor: C.bg,
    },
    notificationItemUnread: {
        backgroundColor: C.surface,
    },
    notificationLeft: {
        position: 'relative',
        marginRight: 12,
    },
    notificationAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.line,
        justifyContent: 'center',
        alignItems: 'center',
    },
    notificationIconBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: C.bg,
        borderWidth: 2,
        borderColor: C.bg,
        justifyContent: 'center',
        alignItems: 'center',
    },
    notificationContent: {
        flex: 1,
    },
    notificationText: {
        fontSize: 15,
        color: C.text,
        lineHeight: 20,
    },
    notificationHandle: {
        fontWeight: '700',
    },
    notificationTime: {
        fontSize: 13,
        color: C.muted,
        marginTop: 2,
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: C.accent,
        marginLeft: 8,
    },
});