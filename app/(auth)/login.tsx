import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useColorScheme,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandedLoading } from '../../components/BrandedLoading';
import { useAppBootstrap } from '../../context/AppBootstrapContext';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../config/firebase';

export default function LoginScreen() {
  const isDark = useColorScheme() !== 'light';
  const palette = isDark
    ? {
        bg: '#111B2F',
        card: 'rgba(18,30,49,0.72)',
        cardBorder: 'rgba(92,124,175,0.24)',
        inputBg: 'rgba(20,33,53,0.82)',
        inputBorder: 'rgba(83,113,162,0.28)',
        text: '#F6FAFF',
        subtext: '#A8BDDB',
        icon: '#99AFCC',
        brandBorder: '#23344D',
        brandBg: 'rgba(12,19,32,0.65)',
        link: '#89C0FF',
      }
    : {
        bg: '#F8FAFC',
        card: '#FFFFFF',
        cardBorder: '#D7E3F3',
        inputBg: '#FFFFFF',
        inputBorder: '#C8D8EC',
        text: '#0F172A',
        subtext: '#475569',
        icon: '#5F7694',
        brandBorder: '#BFD4EF',
        brandBg: '#EAF3FF',
        link: '#1D4ED8',
      };
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { bootstrapApp } = useAppBootstrap();
  const router = useRouter();
  const inputA11yProps = {
    cursorColor: '#4DA3FF',
    selectionColor: 'rgba(77,163,255,0.35)',
    underlineColorAndroid: 'transparent' as const,
  };
  const inputWebStyle =
    Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          backgroundColor: 'transparent',
          WebkitTextFillColor: isDark ? '#E8F2FF' : '#0F172A',
          WebkitBoxShadow: `0 0 0 1000px ${palette.inputBg} inset`,
        } as any)
      : undefined;

  const handleLogin = async () => {
    if (!identifier || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await login(identifier.trim(), password);
      await bootstrapApp({ reason: 'login', userId: auth.currentUser?.uid ?? undefined });
      router.replace('/(tabs)');
    } catch (error: any) {
      if (error?.code === 'auth/user-not-found') {
        Alert.alert('Account Not Found', 'No account found with that username, email, or phone number.');
      } else if (error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') {
        Alert.alert('Invalid Credentials', 'The password is incorrect for this account.');
      } else {
        Alert.alert('Login Failed', error?.message || 'Unable to log in right now.');
      }
    } finally {
      setLoading(false);
    }
  };

  const continueAsGuest = () => {
    Keyboard.dismiss();
    router.replace('/(tabs)');
  };

  if (loading) {
    return <BrandedLoading variant="launch" dark />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <LinearGradient
        colors={isDark ? ['#07111F', '#0C1627', '#111D31'] : ['#F4F8FD', '#EEF4FC', '#E8F0FA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={[styles.bgGlowTop, !isDark && styles.bgGlowTopLight]} />
      <View pointerEvents="none" style={[styles.bgGlowBottom, !isDark && styles.bgGlowBottomLight]} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/Official logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={[styles.headerWordmark, { color: palette.text }]}>Sideline</Text>
          <Text style={[styles.headerTitle, { color: palette.text }]}>Welcome Back</Text>
          <Text style={[styles.headerSubtitle, { color: palette.subtext }]}>
            Sign in to join live match chats and curated football news.
          </Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: palette.card, borderColor: palette.cardBorder }]}>
          <View style={[styles.inputContainer, { backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}>
            <Ionicons name="mail-outline" size={20} color={palette.icon} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: palette.text }, inputWebStyle]}
              placeholder="Email, username or phone"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={palette.subtext}
              {...inputA11yProps}
            />
          </View>

          <View style={[styles.inputContainer, { backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}>
            <Ionicons name="lock-closed-outline" size={20} color={palette.icon} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: palette.text }, inputWebStyle]}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholderTextColor={palette.subtext}
              {...inputA11yProps}
            />
            <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={palette.icon} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Loading Sideline...' : 'Log In'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.guestButton}
            onPress={continueAsGuest}
            disabled={loading}
            activeOpacity={0.82}
          >
            <Text style={[styles.guestButtonText, { color: palette.link }]}>Continue as Guest</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
            <Text style={[styles.link, { color: palette.subtext }]}>
              Do not have an account? <Text style={[styles.linkBold, { color: palette.link }]}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060B14',
  },
  keyboardWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingBottom: 12,
  },
  bgGlowTop: {
    position: 'absolute',
    top: -120,
    left: '50%',
    marginLeft: -220,
    width: 440,
    height: 440,
    borderRadius: 220,
    backgroundColor: 'rgba(86, 165, 255, 0.12)',
  },
  bgGlowTopLight: {
    backgroundColor: 'rgba(92, 166, 255, 0.10)',
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -120,
    left: '50%',
    marginLeft: -240,
    width: 480,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(33, 64, 112, 0.12)',
  },
  bgGlowBottomLight: {
    backgroundColor: 'rgba(190, 221, 255, 0.20)',
  },
  header: {
    marginBottom: 28,
    alignItems: 'center',
  },
  headerLogo: {
    width: 166,
    height: 166,
    marginBottom: 0,
  },
  headerWordmark: {
    marginTop: -34,
    marginBottom: 22,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.7,
    color: '#DDF2FF',
    textShadowColor: 'rgba(139, 223, 255, 0.22)',
    textShadowRadius: 14,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 420,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: 'rgba(18,29,48,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(76,106,153,0.24)',
    borderRadius: 22,
    padding: 16,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    shadowColor: '#020817',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(24,36,58,0.82)',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(67,95,142,0.28)',
    paddingHorizontal: 12,
    minHeight: 52,
    marginBottom: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#E8F2FF',
  },
  button: {
    backgroundColor: '#1E78E8',
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#1E78E8',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  guestButton: {
    alignItems: 'center',
    paddingVertical: 13,
    marginTop: 6,
  },
  guestButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  link: {
    textAlign: 'center',
    color: '#8FA2BA',
    fontSize: 14,
    marginTop: 8,
  },
  linkBold: {
    color: '#89C0FF',
    fontWeight: '800',
  },
});
