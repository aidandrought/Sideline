import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function PrivacySecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { deleteAccount } = useAuth();
  const { isDark } = useTheme();

  const palette = useMemo(
    () =>
      isDark
        ? { background: '#0B0B0B', card: '#1C1C1E', border: '#2C2C2E', text: '#FFFFFF', subtext: '#A1A1A6', danger: '#FF453A' }
        : { background: '#F5F5F7', card: '#FFFFFF', border: '#E5E7EB', text: '#000000', subtext: '#666666', danger: '#FF3B30' },
    [isDark]
  );

  const confirmDelete = () => {
    Alert.alert(
      'Delete Account',
      'This action is permanent. Your profile and saved preferences will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              router.replace('/(auth)/login');
            } catch (error) {
              console.error('Delete account failed', error);
              const code = (error as { code?: string } | null)?.code;
              Alert.alert(
                'Delete Failed',
                code === 'auth/requires-recent-login'
                  ? 'For security, sign in again and then retry deleting your account.'
                  : 'Unable to delete your account right now. Please try again later.'
              );
            }
          },
        },
      ]
    );
  };

  const items = [
    { label: 'Privacy Policy', icon: 'document-text-outline', onPress: () => router.push('/legal/privacy' as any) },
    { label: 'Terms of Service', icon: 'reader-outline', onPress: () => router.push('/legal/terms' as any) },
    { label: 'Trademarks & Affiliation', icon: 'shield-outline', onPress: () => router.push('/legal/affiliation' as any) },
    { label: 'Help Center', icon: 'help-circle-outline', onPress: () => router.push('/support/help' as any) },
    { label: 'Contact Support', icon: 'mail-outline', onPress: () => router.push('/support' as any) },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['bottom']}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12), backgroundColor: palette.card, borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Privacy & Security</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.row, index < items.length - 1 && { borderBottomColor: palette.border, borderBottomWidth: 1 }]}
              onPress={item.onPress}
            >
              <View style={styles.rowLeft}>
                <Ionicons name={item.icon as any} size={20} color="#0066CC" />
                <Text style={[styles.rowText, { color: palette.text }]}>{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.subtext} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[styles.deleteButton, { borderColor: palette.danger }]} onPress={confirmDelete}>
          <Text style={[styles.deleteText, { color: palette.danger }]}>Delete Account</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
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
    borderBottomWidth: 1,
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
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    fontSize: 15,
    fontWeight: '700',
  },
  deleteButton: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
