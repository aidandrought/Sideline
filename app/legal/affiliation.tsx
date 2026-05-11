import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';

const LAST_UPDATED = 'March 2, 2026';

export default function TrademarksAffiliationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark
    ? { background: '#0B0B0B', card: '#1C1C1E', text: '#FFFFFF', subtext: '#A1A1A6' }
    : { background: '#F5F5F7', card: '#FFFFFF', text: '#000000', subtext: '#666666' };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['bottom']}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12), backgroundColor: palette.card }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Trademarks & Affiliation</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.updated, { color: palette.subtext }]}>Last updated: {LAST_UPDATED}</Text>

        <View style={[styles.noticeCard, { backgroundColor: palette.card }]}>
          <Text style={[styles.noticeText, { color: palette.text }]}>
            Sideline is an independent fan platform and is not affiliated with, endorsed by, or sponsored by FIFA or any
            league, club, or federation.
          </Text>
          <Text style={[styles.noticeText, { color: palette.text }]}>
            All team/league names are used for identification/news reporting purposes.
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Use of Names & Marks</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Sideline does not claim ownership of third-party trademarks, logos, or competition identities. References are
          provided only for fan information and editorial context.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>No Official Partnership</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Sideline must not be represented as an official product of any governing body, league, federation, club, or
          broadcaster.
        </Text>

        <View style={{ height: 40 }} />
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
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  updated: {
    fontSize: 12,
    marginBottom: 12,
  },
  noticeCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 20,
  },
});
