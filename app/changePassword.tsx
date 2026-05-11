import { Ionicons } from '@expo/vector-icons';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { auth } from '../config/firebase';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();
  const { isDark } = useTheme();
  const [sending, setSending] = useState(false);

  const palette = useMemo(
    () =>
      isDark
        ? { background: '#0B0B0B', card: '#1C1C1E', border: '#2C2C2E', text: '#FFFFFF', subtext: '#A1A1A6' }
        : { background: '#F5F5F7', card: '#FFFFFF', border: '#E5E7EB', text: '#000000', subtext: '#666666' },
    [isDark]
  );

  const sendReset = async () => {
    if (!userProfile?.email) {
      Alert.alert('No Email Found', 'This account does not have an email address available for password reset.');
      return;
    }
    setSending(true);
    try {
      await sendPasswordResetEmail(auth, userProfile.email);
      Alert.alert('Reset Email Sent', `We sent a password reset link to ${userProfile.email}.`);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      Alert.alert('Unable to Send', 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['bottom']}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12), backgroundColor: palette.card, borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Change Password</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.title, { color: palette.text }]}>Reset by email</Text>
          <Text style={[styles.body, { color: palette.subtext }]}>
            For now, the safest flow is to send a reset link to your account email and let you choose a new password there.
          </Text>
          <Text style={[styles.emailText, { color: palette.text }]}>{userProfile?.email || 'No email on file'}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={sendReset} disabled={sending}>
          <Text style={styles.primaryButtonText}>{sending ? 'Sending...' : 'Email Reset Link'}</Text>
        </TouchableOpacity>
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
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
  },
  emailText: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  primaryButton: {
    borderRadius: 14,
    backgroundColor: '#0066CC',
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
