import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';

const DISPLAY_EMAIL = 'support@sideline.app';
const SUPPORT_EMAIL = DISPLAY_EMAIL;
const SUPPORT_SUBJECT = 'Sideline Support';

export default function ContactSupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark
    ? { background: '#0B0B0B', card: '#1C1C1E', text: '#FFFFFF', subtext: '#A1A1A6', link: '#4DA3FF' }
    : { background: '#F5F5F7', card: '#FFFFFF', text: '#000000', subtext: '#666666', link: '#0066CC' };

  const openEmail = () => {
    const subject = encodeURIComponent(SUPPORT_SUBJECT);
    const body = encodeURIComponent(
      `Describe your issue here.\n\nDevice: ${Platform.OS}\nApp: Sideline`
    );
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['bottom']}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12), backgroundColor: palette.card }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Contact Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: palette.card }]}>
          <Text style={[styles.title, { color: palette.text }]}>Need help?</Text>
          <Text style={[styles.subtext, { color: palette.subtext }]}>
            Email our support team and we will respond as soon as possible.
          </Text>

          <TouchableOpacity style={styles.cta} onPress={openEmail}>
            <Ionicons name="mail" size={18} color="#FFF" />
            <Text style={styles.ctaText}>Email Support</Text>
          </TouchableOpacity>

          <Text style={[styles.emailText, { color: palette.link }]}>{DISPLAY_EMAIL}</Text>
        </View>
      </View>
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
  card: {
    borderRadius: 14,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtext: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0066CC',
    paddingVertical: 12,
    borderRadius: 12,
  },
  ctaText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  emailText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});

