import AsyncStorage from '@react-native-async-storage/async-storage';

export type MessageTier = 'FREE' | 'PLUS' | 'TRACK_MODE' | 'CLUB';

const MESSAGE_LIMITS: Record<MessageTier, number> = {
    FREE: 10,           // 10 lifetime messages
    PLUS: -1,           // Unlimited (we use -1 to indicate unlimited)
    TRACK_MODE: 2000,   // 2,000 per month
    CLUB: -1,           // Unlimited
};

const STORAGE_MESSAGE_COUNT = '@ovrtk/message.count';
const STORAGE_MESSAGE_RESET = '@ovrtk/message.reset';
const STORAGE_LIFETIME_COUNT = '@ovrtk/message.lifetime'; // For FREE tier

function getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

async function checkAndResetIfNeeded(tier: MessageTier): Promise<void> {
    // FREE tier never resets (lifetime limit)
    if (tier === 'FREE') return;

    try {
        const currentMonth = getCurrentMonthKey();
        const storedMonth = await AsyncStorage.getItem(STORAGE_MESSAGE_RESET);

        if (storedMonth !== currentMonth) {
            await AsyncStorage.setItem(STORAGE_MESSAGE_COUNT, '0');
            await AsyncStorage.setItem(STORAGE_MESSAGE_RESET, currentMonth);
            console.log('[Messages] Counter reset for new month:', currentMonth);
        }
    } catch (error) {
        console.error('[Messages] Reset check failed:', error);
    }
}

export async function getMessageCount(tier: MessageTier): Promise<number> {
    try {
        await checkAndResetIfNeeded(tier);

        // FREE tier uses lifetime counter
        if (tier === 'FREE') {
            const raw = await AsyncStorage.getItem(STORAGE_LIFETIME_COUNT);
            return raw ? parseInt(raw, 10) : 0;
        }

        // Paid tiers use monthly counter
        const raw = await AsyncStorage.getItem(STORAGE_MESSAGE_COUNT);
        return raw ? parseInt(raw, 10) : 0;
    } catch (error) {
        console.error('[Messages] Failed to get count:', error);
        return 0;
    }
}

export async function incrementMessageCount(tier: MessageTier): Promise<number> {
    try {
        const storageKey = tier === 'FREE' ? STORAGE_LIFETIME_COUNT : STORAGE_MESSAGE_COUNT;
        const current = await getMessageCount(tier);
        const next = current + 1;
        await AsyncStorage.setItem(storageKey, String(next));
        console.log('[Messages] Count incremented:', next);
        return next;
    } catch (error) {
        console.error('[Messages] Failed to increment:', error);
        return 0;
    }
}

export async function canSendMessage(tier: MessageTier): Promise<{
    canSend: boolean;
    currentCount: number;
    limit: number;
    remaining: number;
}> {
    try {
        const currentCount = await getMessageCount(tier);
        const limit = MESSAGE_LIMITS[tier];

        // Handle unlimited tiers (PLUS and CLUB)
        if (limit === -1) {
            return {
                canSend: true,
                currentCount,
                limit: -1,
                remaining: -1,
            };
        }

        const remaining = Math.max(0, limit - currentCount);

        return {
            canSend: currentCount < limit,
            currentCount,
            limit,
            remaining,
        };
    } catch (error) {
        console.error('[Messages] Check failed:', error);
        return {
            canSend: false,
            currentCount: 0,
            limit: 0,
            remaining: 0,
        };
    }
}

/**
 * Reset message count (admin/testing only)
 */
export async function resetMessageCount(tier: MessageTier): Promise<void> {
    try {
        const storageKey = tier === 'FREE' ? STORAGE_LIFETIME_COUNT : STORAGE_MESSAGE_COUNT;
        await AsyncStorage.setItem(storageKey, '0');
        console.log('[Messages] Count reset');
    } catch (error) {
        console.error('[Messages] Reset failed:', error);
    }
}