// PricingCard.tsx - Pricing Component for OVRTK
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const C = {
  bg: "#0A0A0F",
  surface: "#13131A",
  panel: "#1A1A24",
  line: "#2A2A35",
  text: "#FFFFFF",
  textSecondary: "#9CA3AF",
  muted: "#6B7280",
  accent: "#FF3B30",
  good: "#34C759",
};

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
};

interface PricingTier {
  id: string;
  name: string;
  price: string;
  pricePerMonth: number;
  icon: string;
  color: string;
  features: string[];
  popular?: boolean;
}

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'FREE',
    name: 'Free',
    price: '$0',
    pricePerMonth: 0,
    icon: 'car-outline',
    color: C.muted,
    features: [
      '10 messages TOTAL (lifetime trial)',
      'Text only',
      'Community access',
      'Unlimited garage cars',
    ],
  },
  {
    id: 'PLUS',
    name: 'Plus',
    price: '$3.99',
    pricePerMonth: 3.99,
    icon: 'flash',
    color: '#FFD60A',
    features: [
      'Unlimited messages',
      '20 images/month',
      '5 sounds/month',
      '4 VINs/month',
      'AI Vision Analysis',
      'Maintenance tracking',
      'Push notifications',
    ],
  },
  {
    id: 'TRACK_MODE',
    name: 'Track Mode',
    price: '$12.99',
    pricePerMonth: 12.99,
    icon: 'speedometer',
    color: '#FF3B30',
    popular: true,
    features: [
      '2,000 messages/month',
      '75 images/month',
      '20 sounds/month',
      '15 VINs/month',
      'Everything in Plus',
      '2x smarter AI model',
    ],
  },
  {
    id: 'CLUB',
    name: 'Club',
    price: '$19.99',
    pricePerMonth: 19.99,
    icon: 'trophy',
    color: '#34C759',
    features: [
      'Unlimited messages',
      '300 images/month',
      '50 sounds/month',
      '30 VINs/month',
      'Club member badge',
      'Everything in Track Mode',
    ],
  },
];

export default function PricingCard({
  currentTier,
  onUpgrade,
}: {
  currentTier: string;
  onUpgrade: (tierId: string) => void;
}) {
  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Choose Your Plan</Text>
        <Text style={s.subtitle}>Unlock premium features and take your car game to the next level</Text>
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tiersContainer}
        snapToInterval={320}
        decelerationRate="fast"
      >
        {PRICING_TIERS.map((tier) => {
          const isCurrentTier = currentTier === tier.id;
          const canUpgrade = PRICING_TIERS.findIndex(t => t.id === currentTier) < PRICING_TIERS.findIndex(t => t.id === tier.id);

          return (
            <View
              key={tier.id}
              style={[
                s.tierCard,
                tier.popular && s.popularCard,
                isCurrentTier && s.currentTierCard,
              ]}
            >
              {tier.popular && (
                <View style={s.popularBadge}>
                  <Text style={s.popularText}>MOST POPULAR</Text>
                </View>
              )}

              <View style={s.tierHeader}>
                <View style={[s.tierIcon, { backgroundColor: tier.color + '20' }]}>
                  <Ionicons name={tier.icon as any} size={32} color={tier.color} />
                </View>
                <Text style={s.tierName}>{tier.name}</Text>
              </View>

              <View style={s.priceContainer}>
                <Text style={s.price}>{tier.price}</Text>
                <Text style={s.priceLabel}>/month</Text>
              </View>

              <View style={s.featuresContainer}>
                {tier.features.map((feature, index) => (
                  <View key={index} style={s.featureRow}>
                    <Ionicons name="checkmark-circle" size={20} color={tier.color} />
                    <Text style={s.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>

              {isCurrentTier ? (
                <View style={[s.currentBtn, { backgroundColor: tier.color + '20', borderColor: tier.color }]}>
                  <Text style={[s.currentBtnText, { color: tier.color }]}>Current Plan</Text>
                </View>
              ) : canUpgrade ? (
                <TouchableOpacity
                  style={[s.upgradeBtn, { backgroundColor: tier.color }]}
                  onPress={() => onUpgrade(tier.id)}
                  activeOpacity={0.8}
                >
                  <Text style={s.upgradeBtnText}>Upgrade to {tier.name}</Text>
                  <Ionicons name="arrow-forward" size={18} color="#111" />
                </TouchableOpacity>
              ) : (
                <View style={s.downgradeBtnDisabled}>
                  <Text style={s.downgradeBtnText}>Downgrade</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={s.footer}>
        <Ionicons name="shield-checkmark" size={20} color={C.accent} />
        <Text style={s.footerText}>Cancel anytime • Secure payments via Apple Pay</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: C.bg,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 15,
    color: C.textSecondary,
    lineHeight: 22,
  },
  tiersContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 20,              // ← Add space for "MOST POPULAR" badge
    gap: SPACING.md,
  },
  tierCard: {
    width: 300,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 2,
    borderColor: C.line,
  },
  popularCard: {
    borderColor: '#FFD60A',
    borderWidth: 2,
  },
  currentTierCard: {
    backgroundColor: C.panel,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    left: '50%',
    transform: [{ translateX: -60 }],
    backgroundColor: '#FFD60A',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: 20,
  },
  popularText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111',
    letterSpacing: 1,
  },
  tierHeader: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  tierIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  tierName: {
    fontSize: 24,
    fontWeight: '700',
    color: C.text,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  price: {
    fontSize: 40,
    fontWeight: '700',
    color: C.text,
  },
  priceLabel: {
    fontSize: 16,
    color: C.textSecondary,
    marginLeft: 4,
  },
  featuresContainer: {
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: C.text,
    lineHeight: 20,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  upgradeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  currentBtn: {
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    alignItems: 'center',
  },
  currentBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  downgradeBtnDisabled: {
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
  },
  downgradeBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: C.muted,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  footerText: {
    fontSize: 13,
    color: C.textSecondary,
  },
});