import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Platform,
    Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { useAuth } from '../contexts/AuthContext';

interface PaywallProps {
    visible: boolean;
    reason: 'messages' | 'vin' | 'image' | 'sound' | 'upgrade';
    currentUsage: number;
    limit: number;
    onClose: () => void;
    onPurchaseSuccess: () => void;
}

export default function Paywall({
    visible,
    reason,
    currentUsage,
    limit,
    onClose,
    onPurchaseSuccess,
}: PaywallProps) {
    const { user } = useAuth();
    const [packages, setPackages] = useState<PurchasesPackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [purchasing, setPurchasing] = useState<string | null>(null);

    useEffect(() => {
        if (visible) {
            // 🔥 ADD DELAY TO ENSURE REVENUECAT IS READY
            const timer = setTimeout(() => {
                loadPackages();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [visible]);

    const loadPackages = async () => {
        try {
            const offerings = await Purchases.getOfferings();
            if (offerings.current?.availablePackages) {
                setPackages(offerings.current.availablePackages);
            }
        } catch (error) {
            console.error('Error loading packages:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePurchase = async (pkg: PurchasesPackage) => {
        if (!user) return;

        setPurchasing(pkg.identifier);
        try {
            const { customerInfo } = await Purchases.purchasePackage(pkg);
            console.log('✅ Purchase successful:', customerInfo);
            onPurchaseSuccess();
            onClose();
        } catch (error: any) {
            if (!error.userCancelled) {
                console.error('❌ Purchase error:', error);
                alert('Purchase failed. Please try again.');
            }
        } finally {
            setPurchasing(null);
        }
    };

    const getReasonText = () => {
        switch (reason) {
            case 'messages':
                if (limit === 0 || limit === 10) {
                    return {
                        title: "You've reached your message limit",
                        description: `Free users get 10 lifetime messages. Upgrade to continue chatting with Scotty!`,
                        icon: 'chatbubbles' as const,
                    };
                }
                return {
                    title: "You've reached your message limit",
                    description: `You've sent ${currentUsage}/${limit === -1 ? 'unlimited' : limit} messages this month.`,
                    icon: 'chatbubbles' as const,
                };
            case 'vin':
                if (limit === 0) {
                    return {
                        title: "VIN scanning not available",
                        description: `VIN scanning requires a Plus subscription or higher. Upgrade to scan vehicles!`,
                        icon: 'barcode' as const,
                    };
                }
                return {
                    title: "VIN scan limit reached",
                    description: `You've scanned ${currentUsage}/${limit} VINs this month. Upgrade for more scans!`,
                    icon: 'barcode' as const,
                };
            case 'image':
                if (limit === 0) {
                    return {
                        title: "Image analysis not available",
                        description: `Image analysis requires a Plus subscription or higher. Upgrade to analyze vehicle photos!`,
                        icon: 'images' as const,
                    };
                }
                return {
                    title: "Image analysis limit reached",
                    description: `You've analyzed ${currentUsage}/${limit} images this month. Upgrade for more analyses!`,
                    icon: 'images' as const,
                };
            case 'sound':
                if (limit === 0) {
                    return {
                        title: "Sound analysis not available",
                        description: `Sound analysis requires a Plus subscription or higher. Upgrade to analyze engine sounds!`,
                        icon: 'musical-notes' as const,
                    };
                }
                return {
                    title: "Sound analysis limit reached",
                    description: `You've analyzed ${currentUsage}/${limit} sounds this month. Upgrade for more analyses!`,
                    icon: 'musical-notes' as const,
                };
            case 'upgrade':
                return {
                    title: "Unlock Premium Features",
                    description: `Choose the perfect plan for your car enthusiasm. Get unlimited AI chat, image analysis, sound diagnostics, and VIN scanning!`,
                    icon: 'rocket' as const,
                };
        }
    };

    const reasonInfo = getReasonText();

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                <View style={styles.content}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.iconContainer}>
                            <Ionicons name={reasonInfo.icon} size={32} color="#E11D48" />
                        </View>
                        <Text style={styles.title}>{reasonInfo.title}</Text>
                        <Text style={styles.description}>{reasonInfo.description}</Text>
                    </View>

                    {/* Packages */}
                    <ScrollView style={styles.packagesContainer} showsVerticalScrollIndicator={false}>
                        {loading ? (
                            <ActivityIndicator size="large" color="#FF6B6B" style={styles.loader} />
                        ) : packages.length === 0 ? (
                            <Text style={styles.noPackages}>No subscription options available</Text>
                        ) : (
                            packages.map((pkg) => (
                                <TouchableOpacity
                                    key={pkg.identifier}
                                    style={styles.packageCard}
                                    onPress={() => handlePurchase(pkg)}
                                    disabled={purchasing !== null}
                                >
                                    <View style={styles.packageHeader}>
                                        <Text style={styles.packageTitle}>
                                            {pkg.product.title.replace('(OVRTK)', '').trim()}
                                        </Text>
                                        <Text style={styles.packagePrice}>
                                            {pkg.product.priceString}
                                            {pkg.packageType !== 'LIFETIME' && '/mo'}
                                        </Text>
                                    </View>

                                    <Text style={styles.packageDescription}>
                                        {pkg.product.description}
                                    </Text>

                                    {/* Feature List */}
                                    <View style={styles.features}>
                                        {(pkg.identifier.includes('plus') || pkg.identifier.includes('$rc_monthly') || pkg.identifier.includes('rc_monthly')) && (
                                            <>
                                                <FeatureBullet text="Unlimited messages" />
                                                <FeatureBullet text="20 images/month" />
                                                <FeatureBullet text="5 sounds/month" />
                                                <FeatureBullet text="4 VINs/month" />
                                                <FeatureBullet text="AI Vision Analysis" />
                                                <FeatureBullet text="Maintenance tracking" />
                                            </>
                                        )}
                                        {(pkg.identifier.includes('track') || pkg.identifier.includes('trackmode')) && (
                                            <>
                                                <FeatureBullet text="2,000 messages/month" />
                                                <FeatureBullet text="75 images/month" />
                                                <FeatureBullet text="20 sounds/month" />
                                                <FeatureBullet text="15 VINs/month" />
                                                <FeatureBullet text="2x smarter AI model" />
                                                <FeatureBullet text="Everything in Plus" />
                                            </>
                                        )}
                                        {(pkg.identifier.includes('club') || pkg.identifier.includes('c_club')) && (
                                            <>
                                                <FeatureBullet text="Unlimited messages" />
                                                <FeatureBullet text="300 images/month" />
                                                <FeatureBullet text="50 sounds/month" />
                                                <FeatureBullet text="30 VINs/month" />
                                                <FeatureBullet text="Club member badge" />
                                                <FeatureBullet text="Everything in Track Mode" />
                                            </>
                                        )}
                                    </View>

                                    {purchasing === pkg.identifier ? (
                                        <ActivityIndicator color="#FFF" style={styles.purchaseLoader} />
                                    ) : (
                                        <View style={styles.purchaseButton}>
                                            <Text style={styles.purchaseButtonText}>Subscribe Now</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ))
                        )}
                    </ScrollView>

                    {/* Fine Print */}
                    <Text style={styles.finePrint}>
                        Auto-renews. Cancel anytime in {Platform.OS === 'ios' ? 'iOS' : 'Android'} Settings → Subscriptions
                    </Text>

                    {/* Close Button */}
                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                        <Text style={styles.closeButtonText}>Maybe Later</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

function FeatureBullet({ text }: { text: string }) {
    return (
        <View style={styles.featureRow}>
            <Ionicons name="checkmark-circle" size={20} color="#E11D48" />
            <Text style={styles.featureText}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'flex-end',
    },
    content: {
        backgroundColor: '#0C0D11',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 8,
        paddingHorizontal: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
        maxHeight: '90%',
        borderTopWidth: 1,
        borderTopColor: '#E11D48',
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
        paddingTop: 16,
    },
    iconContainer: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: 'rgba(225, 29, 72, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        borderWidth: 2,
        borderColor: '#E11D48',
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: '#E7EAF0',
        textAlign: 'center',
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    description: {
        fontSize: 16,
        color: '#A6ADBB',
        textAlign: 'center',
        lineHeight: 22,
    },
    packagesContainer: {
        maxHeight: 420,
    },
    loader: {
        marginVertical: 40,
    },
    noPackages: {
        color: '#A6ADBB',
        textAlign: 'center',
        marginVertical: 40,
        fontSize: 16,
    },
    packageCard: {
        backgroundColor: '#121318',
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: '#1E2127',
    },
    packageHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    packageTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#E7EAF0',
        flex: 1,
        letterSpacing: -0.3,
    },
    packagePrice: {
        fontSize: 20,
        fontWeight: '800',
        color: '#E11D48',
        letterSpacing: -0.5,
    },
    packageDescription: {
        fontSize: 14,
        color: '#A6ADBB',
        marginBottom: 16,
        lineHeight: 20,
    },
    features: {
        marginBottom: 16,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    featureText: {
        fontSize: 14,
        color: '#E7EAF0',
        marginLeft: 10,
        flex: 1,
        fontWeight: '500',
    },
    purchaseButton: {
        backgroundColor: '#E11D48',
        borderRadius: 12,
        padding: 18,
        alignItems: 'center',
        shadowColor: '#E11D48',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    purchaseButtonText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    purchaseLoader: {
        padding: 18,
    },
    finePrint: {
        color: '#6B7280',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 12,
        marginBottom: 8,
        paddingHorizontal: 20,
        lineHeight: 16,
    },
    closeButton: {
        marginTop: 8,
        padding: 16,
        alignItems: 'center',
    },
    closeButtonText: {
        color: '#A6ADBB',
        fontSize: 16,
        fontWeight: '600',
    },
});