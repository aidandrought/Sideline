import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';

const LAST_UPDATED = 'March 2, 2026';

export default function PrivacyPolicyScreen() {
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
        <Text style={[styles.headerTitle, { color: palette.text }]}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.updated, { color: palette.subtext }]}>Last updated: {LAST_UPDATED}</Text>

        <Text style={[styles.paragraph, { color: palette.text }]}>
          Sideline is a football community app that helps you follow teams, leagues, and live match chats.
          This Privacy Policy explains what data we collect, how we use it, and the choices you have.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Information We Collect</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Account data: email, username, and basic profile information you provide.
          We store your followed teams/leagues, notification preferences, and theme settings.
        </Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Usage data: community follows, chat messages you send, and app interactions needed to deliver features.
          We also store presence data for live chat viewer counts.
        </Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Device data: platform type and push notification tokens, only to deliver notifications you opt into.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>How We Use Data</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          We use your data to provide core app functionality: communities, chats, match updates,
          and live score notifications for teams you follow.
        </Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          We also use data to improve performance, personalize your experience, and keep the app secure.
          We do not sell personal data.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Legal Bases</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          We process data to deliver the service you request (account, chat, scores), based on consent
          where required (notifications), and for legitimate interests such as fraud prevention, reliability,
          moderation, and product improvement.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Sharing</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          We share data only with service providers necessary to operate the app (e.g., Firebase for
          authentication, database, and notifications). These providers are contractually required to
          protect your data.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>International Data Transfers</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Your data may be processed in countries other than your own where our providers operate.
          We use reasonable contractual and technical safeguards to protect data during transfer.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Your Choices</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          You can update your profile, change notification preferences, or delete chats you have sent
          (where supported). You can also request account deletion.
        </Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Depending on your location, you may have rights to access, correct, delete, or export your data,
          and to object to or limit certain processing.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Data Retention</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          We retain data while your account is active and as needed to provide the service. You can
          request deletion of your account and associated data.
        </Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Backup and security logs may be retained for limited periods where required for fraud prevention,
          legal compliance, and service integrity.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Security</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          We use industry-standard security practices, including authentication controls and database rules,
          to protect your data. No system is perfect, so we encourage you to use strong passwords.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Policy Updates</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          We may update this policy from time to time. Material changes will be reflected by the
          &quot;Last updated&quot; date and, where appropriate, shown in-app.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Children</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Sideline is not intended for children under 13. We do not knowingly collect data from children.
        </Text>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Contact</Text>
        <Text style={[styles.paragraph, { color: palette.text }]}>
          Questions or requests? Contact us at support@sideline.app.
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

