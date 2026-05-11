// app/fantasy/pro.tsx
// Sideline Pro paywall — RevenueCat integration placeholder

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { PRO_ANNUAL_PRICE, PRO_ANNUAL_SAVINGS, PRO_MONTHLY_PRICE } from '../../services/fantasyService';

const FEATURES = [
  { icon: 'trophy-outline', title: 'Unlimited Leagues', desc: 'Join or create as many leagues as you want' },
  { icon: 'people-outline', title: 'Multiple Teams', desc: 'Run different squads across different competitions' },
  { icon: 'star-outline', title: 'Champions League Fantasy', desc: 'Access the exclusive CL fantasy competition' },
  { icon: 'analytics-outline', title: 'Advanced Stats', desc: 'Deep player analytics, form guides, and transfer hints' },
  { icon: 'notifications-outline', title: 'Gameweek Alerts', desc: 'Deadline reminders, score updates, rank changes' },
  { icon: 'chatbubbles-outline', title: 'Community Leagues', desc: 'Compete in themed community challenges' },
  { icon: 'ribbon-outline', title: 'Pro Badge', desc: 'Stand out with a Pro profile badge' },
];

export default function ProScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();

  const palette = useMemo(
    () =>
      isDark
        ? { background: '#0B0B0B', card: '#1C1C1E', text: '#E6E6E9', subtext: '#A1A1A6', border: '#2C2C2E', gold: '#FBBF24', green: '#34D399', accent: '#4DA3FF' }
        : { background: '#F5F5F7', card: '#FFFFFF', text: '#000000', subtext: '#666666', border: '#E5E5E5', gold: '#D97706', green: '#059669', accent: '#0066CC' },
    [isDark]
  );

  const handleMonthly = () => {
    // TODO: wire RevenueCat monthly SKU
    // Purchases.purchasePackage(monthlyPackage)
    alert('RevenueCat integration coming soon. Monthly plan: ' + PRO_MONTHLY_PRICE);
  };

  const handleAnnual = () => {
    // TODO: wire RevenueCat annual SKU
    alert('RevenueCat integration coming soon. Annual plan: ' + PRO_ANNUAL_PRICE);
  };

  const handleRestore = () => {
    // TODO: Purchases.restorePurchases()
    alert('Restore purchases — RevenueCat integration coming soon.');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Sideline Pro</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>⭐</Text>
          <Text style={[styles.heroTitle, { color: palette.text }]}>Unlock the full{'\n'}Sideline experience</Text>
          <Text style={[styles.heroSubtext, { color: palette.subtext }]}>
            Fantasy football across every league, unlimited teams, and powerful analytics — all in one place.
          </Text>
        </View>

        {/* Features list */}
        <View style={[styles.featuresCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          {FEATURES.map((f, idx) => (
            <View key={f.title} style={[styles.featureRow, idx < FEATURES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border }]}>
              <View style={[styles.featureIcon, { backgroundColor: palette.gold + '22' }]}>
                <Ionicons name={f.icon as any} size={18} color={palette.gold} />
              </View>
              <View style={styles.featureCopy}>
                <Text style={[styles.featureTitle, { color: palette.text }]}>{f.title}</Text>
                <Text style={[styles.featureDesc, { color: palette.subtext }]}>{f.desc}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={18} color={palette.green} />
            </View>
          ))}
        </View>

        {/* Pricing */}
        <View style={styles.pricingRow}>
          {/* Annual — highlighted */}
          <TouchableOpacity
            style={[styles.pricingCard, styles.pricingCardFeatured, { backgroundColor: palette.gold + '15', borderColor: palette.gold }]}
            activeOpacity={0.85}
            onPress={handleAnnual}
          >
            <View style={[styles.popularBadge, { backgroundColor: palette.gold }]}>
              <Text style={styles.popularBadgeText}>BEST VALUE</Text>
            </View>
            <Text style={[styles.pricingPeriod, { color: palette.text }]}>Annual</Text>
            <Text style={[styles.pricingAmount, { color: palette.gold }]}>{PRO_ANNUAL_PRICE}</Text>
            <Text style={[styles.pricingPer, { color: palette.subtext }]}>per year</Text>
            <View style={[styles.savingsBadge, { backgroundColor: palette.green + '22' }]}>
              <Text style={[styles.savingsText, { color: palette.green }]}>{PRO_ANNUAL_SAVINGS}</Text>
            </View>
          </TouchableOpacity>

          {/* Monthly */}
          <TouchableOpacity
            style={[styles.pricingCard, { backgroundColor: palette.card, borderColor: palette.border }]}
            activeOpacity={0.85}
            onPress={handleMonthly}
          >
            <Text style={[styles.pricingPeriod, { color: palette.text }]}>Monthly</Text>
            <Text style={[styles.pricingAmount, { color: palette.accent }]}>{PRO_MONTHLY_PRICE}</Text>
            <Text style={[styles.pricingPer, { color: palette.subtext }]}>per month</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.legalText, { color: palette.subtext }]}>
          Subscriptions renew automatically. Cancel anytime in your App Store settings. Free tier remains available if cancelled.
        </Text>

        <TouchableOpacity onPress={handleRestore}>
          <Text style={[styles.restoreText, { color: palette.accent }]}>Restore Purchases</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  scroll: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  hero: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  heroEmoji: { fontSize: 52 },
  heroTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center', lineHeight: 32 },
  heroSubtext: { fontSize: 14, textAlign: 'center', lineHeight: 21, paddingHorizontal: 16 },
  featuresCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  featureRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  featureIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  featureCopy: { flex: 1 },
  featureTitle: { fontSize: 14, fontWeight: '600' },
  featureDesc: { fontSize: 12, marginTop: 1 },
  pricingRow: { flexDirection: 'row', gap: 10 },
  pricingCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    alignItems: 'center',
    gap: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  pricingCardFeatured: { borderWidth: 2 },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 8,
  },
  popularBadgeText: { fontSize: 9, fontWeight: '800', color: '#000', letterSpacing: 0.5 },
  pricingPeriod: { fontSize: 14, fontWeight: '600', marginTop: 16 },
  pricingAmount: { fontSize: 26, fontWeight: '800' },
  pricingPer: { fontSize: 12 },
  savingsBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  savingsText: { fontSize: 11, fontWeight: '700' },
  legalText: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  restoreText: { fontSize: 13, textAlign: 'center', fontWeight: '500' },
});
