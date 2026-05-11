import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';

const LAST_UPDATED = 'March 2, 2026';

export default function TermsScreen() {
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
        <Text style={[styles.headerTitle, { color: palette.text }]}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.updated, { color: palette.subtext }]}>Last updated: {LAST_UPDATED}</Text>

        <Text style={[styles.paragraph, { color: palette.text }]}>
          By using Sideline, you agree to these Terms of Service. If you do not agree, please do not use the app.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Use of the App</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Sideline provides football communities, match updates, and chat features. You are responsible for your
          account activity and for keeping your login credentials secure.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Eligibility</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          You must be at least 13 years old (or the minimum required age in your region) to use Sideline.
          If you are under the age of majority in your jurisdiction, use of the app must be with parental or legal guardian permission.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>User Content</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          You own the content you post. By posting, you grant Sideline a non-exclusive license to display and
          distribute your content within the app. Do not post illegal, abusive, or infringing content.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Community Conduct</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Respect other users. We may remove content or restrict accounts that violate our rules, including
          harassment, hate speech, or spam.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Account Actions</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          We may suspend or terminate accounts that violate these Terms, abuse the service, attempt fraud,
          or interfere with platform security, moderation, or fair use.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Notifications</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          If you enable notifications, we will send you match reminders and live score alerts based on teams you
          follow. You can disable notifications at any time in Settings.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Trademarks & Affiliation</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Sideline is an independent fan platform and is not affiliated with, endorsed by, or sponsored by FIFA or any
          league, club, or federation.
        </Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          All team/league names are used for identification/news reporting purposes.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Service Changes</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          We may update or discontinue parts of the service. We are not liable for interruptions caused by
          network issues, third-party APIs, or maintenance.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Disclaimer</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          The app is provided &quot;as is.&quot; We do not guarantee accuracy of external match or news data. Use at your
          own risk.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Contact</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Questions? Contact us at support@sideline.app.
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 20,
  },
});


