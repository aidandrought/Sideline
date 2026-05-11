import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';

const FAQS = [
  {
    q: 'How do I follow a team or league?',
    a: 'Go to Communities, tap the + button on a team or league, or use Settings → Favorite Teams/Leagues.',
  },
  {
    q: 'How do live score alerts work?',
    a: 'Enable Live Score Alerts in Settings. You will receive goal notifications for teams you follow.',
  },
  {
    q: 'Why is a chat not open?',
    a: 'Match chats open 45 minutes before kickoff and close 15 minutes after a match ends.',
  },
  {
    q: 'How do I change dark mode?',
    a: 'Settings → Appearance. You can use Auto (system) or toggle Light/Dark manually.',
  },
  {
    q: 'How do I report a problem?',
    a: 'Use Contact Support from Settings or the Support screen to email us.',
  },
];

export default function HelpCenterScreen() {
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
        <Text style={[styles.headerTitle, { color: palette.text }]}>Help Center</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: palette.subtext }]}>
          Common questions and quick answers.
        </Text>

        {FAQS.map((item) => (
          <View key={item.q} style={[styles.card, { backgroundColor: palette.card }]}>
            <Text style={[styles.question, { color: palette.text }]}>{item.q}</Text>
            <Text style={[styles.answer, { color: palette.subtext }]}>{item.a}</Text>
          </View>
        ))}

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
  intro: {
    fontSize: 13,
    marginBottom: 12,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  question: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  answer: {
    fontSize: 13,
    lineHeight: 18,
  },
});
