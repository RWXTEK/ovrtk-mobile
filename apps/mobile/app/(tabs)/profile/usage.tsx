// app/(tabs)/profile/usage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../../lib/firebase';
import { getUserTier } from '../../../lib/revenuecat';
import { canDecodeVIN } from '../../../lib/vinTracking';
import { canRecordSound } from '../../../lib/soundAnalysis';
import { canSendMessage } from '../../../lib/messageTracking';

const C = {
    bg: "#0C0D11",
    surface: "#121318",
    panel: "#121318",
    line: "#1E2127",
    text: "#E7EAF0",
    textSecondary: "#A6ADBB",
    muted: "#A6ADBB",
    accent: "#E11D48",
    dim: "#0f1218",
    good: "#22c55e",
    warning: "#FFD60A",
};

const SPACING = {
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
};

const RADIUS = {
    md: 12,
    lg: 16,
};

export default function UsageScreen() {
    const [me, setMe] = useState(auth.currentUser);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(setMe);
        return unsubscribe;
    }, []);

    const [tier, setTier] = useState<'FREE' | 'PLUS' | 'TRACK_MODE' | 'CLUB'>('FREE');
    const [loading, setLoading] = useState(true);

    // Usage stats
    const [imagesUsed, setImagesUsed] = useState(0);
    const [imagesLimit, setImagesLimit] = useState(0);
    const [soundsUsed, setSoundsUsed] = useState(0);
    const [soundsLimit, setSoundsLimit] = useState(0);
    const [vinsUsed, setVinsUsed] = useState(0);
    const [vinsLimit, setVinsLimit] = useState(0);
    const [messagesUsed, setMessagesUsed] = useState(0);
    const [messagesLimit, setMessagesLimit] = useState(0);

    useFocusEffect(
        useCallback(() => {
          if (me?.uid) {
            loadUsageData();
          }
        }, [me?.uid])
    );

    async function loadUsageData() {
        if (!me?.uid) return;
      
        try {
          setLoading(true);
      
          // Get tier
          const userTier = await getUserTier();
          setTier(userTier as any);
      
          // Get image usage - NOW ACTUALLY LOADS FROM TRACKING!
          const { getMonthlyImageCount } = await import('../../../lib/imageTracking');
          const { LIMITS } = await import('../../../lib/revenuecat');
          
          const imageCount = await getMonthlyImageCount();
          const imageLimit = LIMITS.IMAGES[userTier];
          setImagesUsed(imageCount);
          setImagesLimit(imageLimit);
      
          // Get sound usage
          const soundUsage = await canRecordSound(userTier as any);
          setSoundsUsed(soundUsage.currentCount);
          setSoundsLimit(soundUsage.limit);
      
          // Get VIN usage
          const vinUsage = await canDecodeVIN(me.uid, userTier as any);
          setVinsUsed(vinUsage.currentCount);
          setVinsLimit(vinUsage.limit);
      
          // Get message usage
          const messageUsage = await canSendMessage(userTier as any);
          setMessagesUsed(messageUsage.currentCount);
          setMessagesLimit(messageUsage.limit);
      
          setLoading(false);
        } catch (error) {
          console.error('Failed to load usage data:', error);
          setLoading(false);
        }
    }

    const tierName = {
        FREE: 'Free',
        PLUS: 'Plus',
        TRACK_MODE: 'Track Mode',
        CLUB: 'Club',
    }[tier];

    const tierColor = {
        FREE: C.muted,
        PLUS: '#FFD60A',
        TRACK_MODE: '#FF3B30',
        CLUB: '#34C759',
    }[tier];

    const getResetDate = () => {
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return nextMonth.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const getPercentage = (used: number, limit: number) => {
        if (limit === 0) return 0;
        if (limit === -1) return 0;
        return Math.min((used / limit) * 100, 100);
    };

    const getBarColor = (percentage: number) => {
        if (percentage >= 90) return C.accent;
        if (percentage >= 70) return C.warning;
        return C.good;
    };

    const formatLimit = (limit: number) => {
        if (limit === -1) return 'Unlimited';
        if (limit === 0) return 'Not available';
        return limit.toString();
    };

    interface UsageCardProps {
        icon: string;
        iconColor: string;
        label: string;
        used: number;
        limit: number;
    }

    const UsageCard = ({ icon, iconColor, label, used, limit }: UsageCardProps) => {
        const percentage = getPercentage(used, limit);
        const barColor = getBarColor(percentage);
        const isUnlimited = limit === -1;
        const isBlocked = limit === 0;

        return (
            <View style={s.usageCard}>
                <View style={[s.usageCardIcon, { backgroundColor: iconColor + '20' }]}>
                    <Ionicons name={icon as any} size={32} color={iconColor} />
                </View>

                <Text style={s.usageCardLabel}>{label}</Text>

                <View style={s.usageCardStats}>
                    <Text style={s.usageCardUsed}>{used}</Text>
                    <Text style={s.usageCardDivider}>/</Text>
                    <Text style={s.usageCardLimit}>{formatLimit(limit)}</Text>
                </View>

                {!isUnlimited && !isBlocked && (
                    <>
                        <View style={s.progressBar}>
                            <View style={[s.progressFill, { width: `${percentage}%`, backgroundColor: barColor }]} />
                        </View>
                        <Text style={s.percentageText}>{Math.round(percentage)}% used</Text>
                    </>
                )}

                {isBlocked && (
                    <View style={s.blockedBadge}>
                        <Ionicons name="lock-closed" size={12} color={C.muted} />
                        <Text style={s.blockedText}>Upgrade to unlock</Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <SafeAreaView style={s.container}>
                {/* Header */}
                <View style={s.header}>
                    <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={C.text} />
                    </TouchableOpacity>
                    <Text style={s.headerTitle}>Usage Stats</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView style={s.scrollView} contentContainerStyle={s.scrollContent}>
                    {/* Tier Info */}
                    <View style={s.tierCard}>
                        <View style={s.tierHeader}>
                            <View>
                                <Text style={s.tierTitle}>Current Plan</Text>
                                <Text style={[s.tierName, { color: tierColor }]}>{tierName}</Text>
                            </View>
                            <View style={[s.tierBadge, { backgroundColor: tierColor + '20', borderColor: tierColor }]}>
                                <Text style={[s.tierBadgeText, { color: tierColor }]}>{tierName}</Text>
                            </View>
                        </View>

                        <View style={s.resetInfo}>
                            <Ionicons name="calendar-outline" size={16} color={C.textSecondary} />
                            <Text style={s.resetText}>Resets on {getResetDate()}</Text>
                        </View>
                    </View>

                    {/* Usage Cards Grid */}
                    <View style={s.usageGrid}>
                        <UsageCard
                            icon="image"
                            iconColor="#8B5CF6"
                            label="Images"
                            used={imagesUsed}
                            limit={imagesLimit}
                        />
                        <UsageCard
                            icon="mic"
                            iconColor="#EF4444"
                            label="Sounds"
                            used={soundsUsed}
                            limit={soundsLimit}
                        />
                        <UsageCard
                            icon="scan"
                            iconColor="#F59E0B"
                            label="VIN Scans"
                            used={vinsUsed}
                            limit={vinsLimit}
                        />
                        <UsageCard
                            icon="chatbubble"
                            iconColor="#3B82F6"
                            label="Messages"
                            used={messagesUsed}
                            limit={messagesLimit}
                        />
                    </View>

                    {/* Upgrade CTA */}
                    {tier === 'FREE' && (
                        <View style={s.upgradeCard}>
                            <Text style={s.upgradeTitle}>🚀 Unlock More Features</Text>
                            <Text style={s.upgradeText}>
                                Upgrade to Plus for unlimited messages, more images, sounds, and VIN scans!
                            </Text>
                            <TouchableOpacity
                                style={s.upgradeBtn}
                                onPress={() => router.push('/(tabs)/profile')}
                            >
                                <Text style={s.upgradeBtnText}>View Plans</Text>
                                <Ionicons name="arrow-forward" size={18} color="#111" />
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </SafeAreaView>
        </>
    );
}

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: C.bg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.md,
        borderBottomWidth: 1,
        borderBottomColor: C.line,
    },
    backBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: C.text,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: SPACING.lg,
        paddingBottom: 120,
    },
    tierCard: {
        backgroundColor: C.surface,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: C.line,
        marginBottom: SPACING.lg,
    },
    tierHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: SPACING.md,
    },
    tierTitle: {
        fontSize: 14,
        color: C.textSecondary,
        marginBottom: 4,
    },
    tierName: {
        fontSize: 24,
        fontWeight: '700',
    },
    tierBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
    },
    tierBadgeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    resetInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    resetText: {
        fontSize: 14,
        color: C.textSecondary,
    },
    usageGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20,
    },
    usageCard: {
        width: '48%',
        minHeight: 160,
        backgroundColor: C.surface,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: C.line,
        alignItems: 'center',
    },
    usageCardIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING.md,
    },
    usageCardLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: C.text,
        marginBottom: SPACING.sm,
    },
    usageCardStats: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
        marginBottom: SPACING.sm,
    },
    usageCardUsed: {
        fontSize: 28,
        fontWeight: '700',
        color: C.text,
    },
    usageCardDivider: {
        fontSize: 20,
        color: C.muted,
    },
    usageCardLimit: {
        fontSize: 16,
        color: C.textSecondary,
    },
    progressBar: {
        width: '100%',
        height: 6,
        backgroundColor: C.panel,
        borderRadius: 3,
        overflow: 'hidden',
        marginTop: SPACING.sm,
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
    percentageText: {
        fontSize: 12,
        color: C.textSecondary,
        marginTop: 4,
    },
    blockedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: SPACING.sm,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: C.panel,
        borderRadius: 12,
    },
    blockedText: {
        fontSize: 11,
        color: C.muted,
        fontWeight: '600',
    },
    upgradeCard: {
        backgroundColor: C.surface,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        borderWidth: 2,
        borderColor: C.accent,
        alignItems: 'center',
    },
    upgradeTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: C.text,
        marginBottom: SPACING.sm,
        textAlign: 'center',
    },
    upgradeText: {
        fontSize: 14,
        color: C.textSecondary,
        textAlign: 'center',
        marginBottom: SPACING.lg,
        lineHeight: 20,
    },
    upgradeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
        backgroundColor: C.accent,
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.md,
        borderRadius: RADIUS.md,
    },
    upgradeBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
});