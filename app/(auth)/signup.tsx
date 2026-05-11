import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
import { VALIDATION } from '../../constants/config';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../config/firebase';

export default function SignupScreen() {
  const isDark = useColorScheme() !== 'light';
  const palette = isDark
    ? {
        bg: '#060B14',
        card: 'rgba(13,22,38,0.88)',
        cardBorder: '#1F2D44',
        inputBg: '#111D31',
        inputBorder: '#213250',
        text: '#F6FAFF',
        subtext: '#90A2B9',
        icon: '#88A0BE',
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
  const LEGAL_VERSION = '2026-03-02';
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'invalid' | 'checking' | 'taken' | 'available' | 'unverified'>('idle');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { signup } = useAuth();
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

  const normalizePhone = (rawPhone: string) => {
    const digits = rawPhone.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (rawPhone.trim().startsWith('+')) return `+${digits}`;
    return digits;
  };

  const normalizeUsernameKey = (value: string) => value.trim().toLowerCase();
  const isQuotaExceededError = (error: any) => {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return (
      code === 'auth/quota-exceeded' ||
      code === 'quota-exceeded' ||
      code === 'resource-exhausted' ||
      message.includes('quota exceeded') ||
      message.includes('quota has been exceeded')
    );
  };
  const getSignupErrorMessage = (error: any) => {
    if (isQuotaExceededError(error)) {
      return {
        title: 'Signup Temporarily Unavailable',
        message: 'The Firebase project quota has been exceeded. Try again later or increase the project quota in Firebase.',
      };
    }
    switch (error?.code) {
      case 'auth/weak-password':
        return {
          title: 'Weak Password',
          message:
            'Password is too weak. Use 8+ characters with uppercase, lowercase, a number, and a special character.',
        };
      case 'auth/missing-password':
        return {
          title: 'Password Required',
          message: 'Please enter a password to continue.',
        };
      case 'auth/invalid-email':
        return {
          title: 'Invalid Email',
          message: 'Please enter a valid email address.',
        };
      case 'auth/email-already-in-use':
        return {
          title: 'Email Already In Use',
          message: 'That email is already registered. Try logging in instead.',
        };
      case 'auth/network-request-failed':
        return {
          title: 'Network Error',
          message: 'Could not reach the server. Check your connection and try again.',
        };
      case 'auth/too-many-requests':
        return {
          title: 'Too Many Attempts',
          message: 'Too many signup attempts were made from this device or network. Wait a bit and try again.',
        };
      default:
        return {
          title: 'Signup Failed',
          message: error?.message || 'Unable to create account right now.',
        };
    }
  };

  const syncUsernameValidationState = (raw: string) => {
    if (!raw) {
      setUsernameStatus('idle');
      setUsernameError(null);
      return;
    }
    if (
      !VALIDATION.username.pattern.test(raw) ||
      raw.length < VALIDATION.username.minLength ||
      raw.length > VALIDATION.username.maxLength
    ) {
      setUsernameStatus('invalid');
      setUsernameError(VALIDATION.username.message);
      return;
    }
    setUsernameStatus('idle');
    setUsernameError(null);
  };

  const checkUsernameAvailability = async (raw: string) => {
    setUsernameStatus('checking');
    setUsernameError('Checking username...');
    try {
      const snap = await getDoc(doc(db, 'usernames', normalizeUsernameKey(raw)));
      if (snap.exists()) {
        setUsernameStatus('taken');
        setUsernameError('Username is already taken.');
        return false;
      }
      setUsernameStatus('available');
      setUsernameError(null);
      return true;
    } catch (error) {
      setUsernameStatus('unverified');
      setUsernameError(
        isQuotaExceededError(error)
          ? 'Signup is temporarily unavailable because the Firebase quota has been exceeded.'
          : 'Could not verify username right now. We will re-check when you sign up.'
      );
      return true;
    }
  };

  const validateForm = () => {
    if (!username || !email || !password || !confirmPassword) {
      setSubmitError('Please fill in all required fields.');
      Alert.alert('Error', 'Please fill in all required fields');
      return false;
    }

    if (!VALIDATION.username.pattern.test(username)) {
      setSubmitError(VALIDATION.username.message);
      Alert.alert('Invalid Username', VALIDATION.username.message);
      return false;
    }

    if (username.length < VALIDATION.username.minLength || username.length > VALIDATION.username.maxLength) {
      setSubmitError(VALIDATION.username.message);
      Alert.alert('Invalid Username', VALIDATION.username.message);
      return false;
    }
    if (usernameStatus === 'invalid' || usernameStatus === 'taken' || usernameStatus === 'checking') {
      setSubmitError(usernameError || 'Enter an available username to continue.');
      Alert.alert('Username Unavailable', usernameError || 'Enter an available username to continue.');
      return false;
    }

    if (!VALIDATION.password.pattern.test(password)) {
      setSubmitError(VALIDATION.password.message);
      Alert.alert('Weak Password', VALIDATION.password.message);
      return false;
    }

    if (password !== confirmPassword) {
      setSubmitError('Password and Confirm Password must be exactly the same.');
      Alert.alert('Password Mismatch', 'Password and Confirm Password must be exactly the same.');
      return false;
    }

    const normalizedPhone = normalizePhone(phone);
    if (phone && !VALIDATION.phone.pattern.test(normalizedPhone)) {
      setSubmitError(VALIDATION.phone.message);
      Alert.alert('Invalid Phone', VALIDATION.phone.message);
      return false;
    }

    if (!hasAcceptedLegal) {
      setSubmitError('Please agree to the Terms of Service and Privacy Policy to continue.');
      Alert.alert('Terms Required', 'Please agree to the Terms of Service and Privacy Policy to continue.');
      return false;
    }

    setSubmitError(null);
    return true;
  };

  const handleSignup = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setSubmitError(null);
    try {
      const usernameAvailable = await checkUsernameAvailability(username.trim());
      if (!usernameAvailable) {
        setSubmitError('Username is already taken. Please choose a different username.');
        Alert.alert('Username Taken', 'Please choose a different username.');
        return;
      }
      const acceptedAt = new Date().toISOString();
      await signup(
        email.trim(),
        password,
        username.trim(),
        normalizePhone(phone),
        {
          termsAcceptedAt: acceptedAt,
          privacyAcceptedAt: acceptedAt,
          termsVersion: LEGAL_VERSION,
          privacyVersion: LEGAL_VERSION,
        }
      );
      router.replace('/(auth)/setup');
    } catch (error: any) {
      console.error('[signup] handleSignup failed', {
        code: error?.code ?? null,
        message: error?.message ?? null,
        name: error?.name ?? null,
      });
      if (error?.code === 'username-taken') {
        setUsernameStatus('taken');
        setUsernameError('Username is already taken.');
        setSubmitError('Username is already taken. Please choose a different username.');
        Alert.alert('Username Taken', 'Please choose a different username.');
      } else {
        const parsedError = getSignupErrorMessage(error);
        setSubmitError(parsedError.message);
        Alert.alert(parsedError.title, parsedError.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    !loading &&
    hasAcceptedLegal &&
    !!email.trim() &&
    !!password &&
    !!confirmPassword &&
    usernameStatus !== 'invalid' &&
    usernameStatus !== 'taken' &&
    usernameStatus !== 'checking';

  if (loading) {
    return <BrandedLoading variant="launch" dark />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <View pointerEvents="none" style={[styles.bgOrbTop, !isDark && { backgroundColor: 'rgba(39,104,214,0.10)' }]} />
      <View pointerEvents="none" style={[styles.bgOrbBottom, !isDark && { backgroundColor: 'rgba(18,153,142,0.08)' }]} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, !isDark && { backgroundColor: '#EAF3FF', borderColor: '#BFD4EF' }]}>
                <Ionicons name="chevron-back" size={24} color={isDark ? '#C8DCF4' : '#1D4ED8'} />
              </TouchableOpacity>
              <Image source={require('../../assets/images/Official logo.png')} style={styles.headerLogo} resizeMode="contain" />
              <Text style={[styles.headerWordmark, { color: palette.text }]}>Sideline</Text>
              <Text style={[styles.headerTitle, { color: palette.text }]}>Create Account</Text>
              <Text style={[styles.headerSubtitle, { color: palette.subtext }]}>
                Build your football profile and customize your experience.
              </Text>
            </View>

            <View style={[styles.formCard, { backgroundColor: palette.card, borderColor: palette.cardBorder }]}>
              <View style={[styles.inputContainer, { backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}>
                <Ionicons name="person-outline" size={20} color={palette.icon} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: palette.text }, inputWebStyle]}
                placeholder="Username"
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  syncUsernameValidationState(text.trim());
                }}
                  autoCapitalize="none"
                  placeholderTextColor={palette.subtext}
                  {...inputA11yProps}
                />
                {usernameStatus === 'available' && (
                  <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                )}
              </View>
              {!!usernameError && (
                <Text
                  style={[
                    styles.usernameFeedback,
                    usernameStatus === 'taken' || usernameStatus === 'invalid'
                      ? styles.usernameFeedbackError
                      : styles.usernameFeedbackInfo,
                  ]}
                >
                  {usernameError}
                </Text>
              )}

              <View style={[styles.inputContainer, { backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}>
                <Ionicons name="mail-outline" size={20} color={palette.icon} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: palette.text }, inputWebStyle]}
                  placeholder="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={palette.subtext}
                  {...inputA11yProps}
                />
              </View>

              <View style={[styles.inputContainer, { backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}>
                <Ionicons name="call-outline" size={20} color={palette.icon} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: palette.text }, inputWebStyle]}
                  placeholder="Phone (optional)"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
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

              <View style={[styles.inputContainer, { backgroundColor: palette.inputBg, borderColor: palette.inputBorder }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color={palette.icon} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: palette.text }, inputWebStyle]}
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  placeholderTextColor={palette.subtext}
                  {...inputA11yProps}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword((prev) => !prev)}>
                  <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={palette.icon} />
                </TouchableOpacity>
              </View>

              <View style={styles.hintBox}>
                <Ionicons name="information-circle-outline" size={16} color="#89C0FF" />
                <Text style={styles.hint}>
                  Password must be 8+ chars with uppercase, lowercase, number, and special character.
                </Text>
              </View>

              <View style={styles.legalConsentContainer}>
                <TouchableOpacity
                  style={styles.checkboxButton}
                  onPress={() => setHasAcceptedLegal((prev) => !prev)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={hasAcceptedLegal ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={hasAcceptedLegal ? '#4DA3FF' : '#6E85A0'}
                  />
                </TouchableOpacity>
                <View style={styles.legalConsentTextWrap}>
                  <Text style={styles.legalConsentText}>
                    I agree to the{' '}
                    <Text style={styles.legalLink} onPress={() => router.push('/legal/terms' as any)}>
                      Terms of Service
                    </Text>{' '}
                    and{' '}
                    <Text style={styles.legalLink} onPress={() => router.push('/legal/privacy' as any)}>
                      Privacy Policy
                    </Text>
                    .
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.button, (!canSubmit || loading) && styles.buttonDisabled]}
                onPress={handleSignup}
                disabled={!canSubmit || loading}
              >
                <Text style={styles.buttonText}>{loading ? 'Creating Account...' : 'Sign Up'}</Text>
              </TouchableOpacity>
              {!!submitError && <Text style={styles.submitErrorText}>{submitError}</Text>}

              <TouchableOpacity onPress={() => router.back()}>
                <Text style={[styles.link, { color: palette.subtext }]}>
                  Already have an account? <Text style={[styles.linkBold, { color: palette.link }]}>Log In</Text>
                </Text>
              </TouchableOpacity>
            </View>
        </ScrollView>
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
  },
  scroll: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 28,
    alignItems: 'center',
  },
  bgOrbTop: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 160,
    top: -90,
    right: -70,
    backgroundColor: 'rgba(39,104,214,0.12)',
  },
  bgOrbBottom: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 120,
    bottom: -40,
    left: -70,
    backgroundColor: 'rgba(18,153,142,0.08)',
  },
  header: {
    marginBottom: 22,
    paddingTop: 8,
    alignItems: 'center',
    width: '100%',
    maxWidth: 440,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(18,30,50,0.8)',
    borderWidth: 1,
    borderColor: '#22334A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  headerLogo: {
    width: 112,
    height: 112,
    marginBottom: -2,
  },
  headerWordmark: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginBottom: 18,
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
    maxWidth: 340,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: 'rgba(13,22,38,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(73,101,145,0.24)',
    borderRadius: 22,
    padding: 16,
    width: '100%',
    maxWidth: 440,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17,29,49,0.82)',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(71,98,140,0.28)',
    paddingHorizontal: 12,
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
  hintBox: {
    marginTop: 4,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: 'rgba(14,25,42,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(74,101,141,0.24)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  usernameFeedback: {
    fontSize: 12,
    marginTop: -4,
    marginBottom: 10,
    marginLeft: 4,
  },
  usernameFeedbackError: {
    color: '#FFB4B4',
  },
  usernameFeedbackInfo: {
    color: '#89C0FF',
  },
  hint: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#90A2B9',
  },
  legalConsentContainer: {
    marginTop: 4,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  checkboxButton: {
    marginTop: 1,
  },
  legalConsentTextWrap: {
    flex: 1,
  },
  legalConsentText: {
    color: '#9FB2C8',
    fontSize: 12,
    lineHeight: 18,
  },
  legalLink: {
    color: '#8CC4FF',
    fontWeight: '700',
  },
  button: {
    backgroundColor: '#1E78E8',
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: 'center',
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
  link: {
    textAlign: 'center',
    color: '#8FA2BA',
    fontSize: 14,
    marginTop: 16,
  },
  linkBold: {
    color: '#89C0FF',
    fontWeight: '800',
  },
  submitErrorText: {
    marginTop: 10,
    color: '#FFB4B4',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
