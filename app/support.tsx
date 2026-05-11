import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { usePathname, useRouter } from 'expo-router';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { db, storage } from '../config/firebase';

type SupportCategory = 'Bug' | 'Account' | 'Notifications' | 'Match data' | 'Billing' | 'Other';

const CATEGORY_OPTIONS: SupportCategory[] = ['Bug', 'Account', 'Notifications', 'Match data', 'Billing', 'Other'];
const SUPPORT_DISPLAY_EMAIL = 'support@sideline.app';
const SUPPORT_ALERT_EMAIL = 'aidancdrought@gmail.com';
const SUPPORT_WEBHOOK_URL = process.env.EXPO_PUBLIC_SUPPORT_WEBHOOK_URL || '';
const SUPPORT_WEBHOOK_TOKEN = process.env.EXPO_PUBLIC_SUPPORT_WEBHOOK_TOKEN || '';

type TicketSummary = {
  id: string;
  category?: string;
  status?: string;
  createdAt?: string;
};

export default function SupportScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { user, userProfile } = useAuth();
  const { isDark } = useTheme();

  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [message, setMessage] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email || '');
  const [contactPhone, setContactPhone] = useState(userProfile?.phone || '');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [attachments, setAttachments] = useState<{ uri: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [ticketEmailWarning, setTicketEmailWarning] = useState<string | null>(null);
  const [recentTickets, setRecentTickets] = useState<TicketSummary[]>([]);

  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#0B0B0B',
            card: '#1C1C1E',
            border: '#2C2C2E',
            text: '#FFFFFF',
            subtext: '#A1A1A6',
            accent: '#4DA3FF',
            danger: '#FF453A',
          }
        : {
            background: '#F5F5F7',
            card: '#FFFFFF',
            border: '#E5E7EB',
            text: '#000000',
            subtext: '#666666',
            accent: '#0066CC',
            danger: '#FF3B30',
          },
    [isDark]
  );

  useEffect(() => {
    if (!user?.uid) {
      setRecentTickets([]);
      return;
    }

    const q = query(
      collection(db, 'supportTickets'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const rows = snapshot.docs.map((snap) => {
          const data = snap.data() as { category?: string; status?: string; createdAt?: { toDate?: () => Date } };
          return {
            id: snap.id,
            category: data.category,
            status: data.status,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : undefined,
          };
        });
        setRecentTickets(rows);
      },
      () => setRecentTickets([])
    );

    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    setContactEmail(user?.email || '');
    setContactPhone(userProfile?.phone || '');
  }, [user?.email, userProfile?.phone]);

  const validate = () => {
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in to submit a support ticket.');
      return false;
    }
    if (!category) {
      Alert.alert('Category required', 'Please choose a support category.');
      return false;
    }
    if (message.trim().length < 10) {
      Alert.alert('More details needed', 'Please provide at least 10 characters describing the issue.');
      return false;
    }
    if (!contactEmail.trim() && !contactPhone.trim()) {
      Alert.alert('Contact required', 'Please provide an email or phone number so we can reply.');
      return false;
    }
    if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      Alert.alert('Invalid email', 'Please enter a valid contact email.');
      return false;
    }
    return true;
  };

  const sendWebhookEmail = async (payload: {
    ticketId: string;
    category: string;
    message: string;
    contactEmail: string;
    contactPhone: string;
    attachmentUrls: string[];
    userId: string;
    username: string;
  }) => {
    if (!SUPPORT_WEBHOOK_URL) {
      return { ok: false, reason: 'missing_webhook' as const };
    }
    const response = await fetch(SUPPORT_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SUPPORT_WEBHOOK_TOKEN ? { 'x-sideline-token': SUPPORT_WEBHOOK_TOKEN } : {}),
      },
      body: JSON.stringify({
        to: SUPPORT_ALERT_EMAIL,
        app: 'Sideline',
        ...payload,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Webhook request failed (${response.status}). ${body}`.trim());
    }
    return { ok: true as const };
  };

  const submitTicket = async () => {
    if (!validate()) return;

    setSubmitting(true);

    try {
      const selectedCategory = category as SupportCategory;
      const supportRef = doc(collection(db, 'supportTickets'));
      const nextTicketId = supportRef.id;
      const uploaded = { urls: [] as string[], paths: [] as string[] };

      if (attachments.length > 0 && user?.uid) {
        for (const att of attachments) {
          const response = await fetch(att.uri);
          const blob = await response.blob();
          const storagePath = `supportAttachments/${user.uid}/${nextTicketId}/${att.name}`;
          const storageRef = ref(storage, storagePath);
          await new Promise<void>((resolve, reject) => {
            const task = uploadBytesResumable(storageRef, blob);
            task.on('state_changed', undefined, reject, async () => {
              const url = await getDownloadURL(task.snapshot.ref);
              uploaded.urls.push(url);
              uploaded.paths.push(storagePath);
              resolve();
            });
          });
        }
      }

      const appVersion = includeDiagnostics ? Constants.expoConfig?.version || null : null;
      const build = includeDiagnostics
        ? String(Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || '')
        : null;

      await setDoc(supportRef, {
        userId: user?.uid || null,
        email: user?.email || null,
        username: userProfile?.username || null,
        category: selectedCategory,
        message: message.trim(),
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        status: 'open',
        createdAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp(),
        app: includeDiagnostics
          ? {
              version: appVersion,
              build: build || null,
            }
          : {
              version: null,
              build: null,
            },
        device: includeDiagnostics
          ? {
              os: Platform.OS || null,
              osVersion: String(Platform.Version || ''),
              model: Constants.deviceName || null,
            }
          : {
              os: null,
              osVersion: null,
              model: null,
        },
        attachmentUrls: uploaded.urls,
        attachmentPaths: uploaded.paths,
        debugContext: {
          route: includeDiagnostics ? pathname : null,
          matchId: null,
        },
      });
      try {
        const webhookResult = await sendWebhookEmail({
          ticketId: nextTicketId,
          category: selectedCategory,
          message: message.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
          attachmentUrls: uploaded.urls,
          userId: user?.uid || '',
          username: userProfile?.username || '',
        });
        setTicketEmailWarning(webhookResult.ok ? null : 'Ticket saved. Email alert is not configured yet.');
      } catch (webhookError: any) {
        console.warn('Support webhook email failed:', webhookError);
        setTicketEmailWarning('Ticket saved, but email alert failed. Please check webhook configuration.');
      }

      setTicketId(nextTicketId);
      setCategory(null);
      setMessage('');
      setContactEmail(user?.email || '');
      setContactPhone(userProfile?.phone || '');
      setAttachments([]);
      setIncludeDiagnostics(true);
    } catch (error: any) {
      console.error('Error submitting support ticket:', error);
      Alert.alert('Unable to send', error?.message || 'Something went wrong while submitting your ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const pickAttachment = async () => {
    if (attachments.length >= 3) {
      Alert.alert('Max 3 screenshots', 'You can attach up to 3 screenshots per ticket.');
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo access in Settings to attach screenshots.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setAttachments(prev => [...prev, { uri: asset.uri, name: `screenshot_${Date.now()}.jpg` }]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const openEmailFallback = async () => {
    const subject = encodeURIComponent(`Sideline Support${category ? ` - ${category}` : ''}`);
    const body = encodeURIComponent(
      `Describe the issue...\n\n` +
      (ticketId ? `Ticket ID: ${ticketId}\n` : '') +
      `Platform: ${Platform.OS}\n`
    );
    const url = `mailto:${SUPPORT_DISPLAY_EMAIL}?subject=${subject}&body=${body}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('No email app found', `Please email us at ${SUPPORT_DISPLAY_EMAIL}.`);
      return;
    }
    await Linking.openURL(url);
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['left', 'right']}>
        <View
          style={[
            styles.header,
            { backgroundColor: palette.card, borderBottomColor: palette.border, paddingTop: Math.max(insets.top + 6, 44) },
          ]}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={palette.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: palette.text }]}>Contact Support</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.title, { color: palette.text }]}>Contact Support</Text>
            <Text style={[styles.subtitle, { color: palette.subtext }]}>We&apos;ll reply within 24 hours.</Text>

            <Text style={[styles.label, { color: palette.subtext }]}>Category</Text>
            <TouchableOpacity
              style={[styles.selector, { backgroundColor: palette.background, borderColor: palette.border }]}
              onPress={() => setCategoryModalVisible(true)}
            >
              <Text style={[styles.selectorText, { color: category ? palette.text : palette.subtext }]}>
                {category || 'Choose category'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={palette.subtext} />
            </TouchableOpacity>

            <Text style={[styles.label, { color: palette.subtext }]}>Contact</Text>
            <TextInput
              style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.background }]}
              placeholder="Contact email"
              placeholderTextColor={palette.subtext}
              keyboardType="email-address"
              autoCapitalize="none"
              value={contactEmail}
              onChangeText={setContactEmail}
            />
            <TextInput
              style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.background }]}
              placeholder="Contact phone (optional)"
              placeholderTextColor={palette.subtext}
              keyboardType="phone-pad"
              value={contactPhone}
              onChangeText={setContactPhone}
            />

            <Text style={[styles.label, { color: palette.subtext }]}>Message</Text>
            <TextInput
              style={[styles.textarea, { color: palette.text, borderColor: palette.border, backgroundColor: palette.background }]}
              placeholder="Describe the issue..."
              placeholderTextColor={palette.subtext}
              multiline
              value={message}
              onChangeText={setMessage}
              textAlignVertical="top"
              maxLength={2000}
            />
            <Text style={[styles.counter, { color: palette.subtext }]}>{message.length}/2000</Text>

            <Text style={[styles.label, { color: palette.subtext }]}>Attachments (optional)</Text>
            <View style={styles.attachRow}>
              {attachments.map((att, index) => (
                <View key={index} style={styles.attachThumb}>
                  <Image source={{ uri: att.uri }} style={styles.attachImg} />
                  <TouchableOpacity style={styles.attachRemove} onPress={() => removeAttachment(index)}>
                    <Ionicons name="close-circle" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              ))}
              {attachments.length < 3 && (
                <TouchableOpacity
                  style={[styles.attachAdd, { borderColor: palette.border, backgroundColor: palette.background }]}
                  onPress={pickAttachment}
                  disabled={submitting}
                >
                  <Ionicons name="image-outline" size={22} color={palette.subtext} />
                  <Text style={[styles.attachAddText, { color: palette.subtext }]}>
                    {attachments.length === 0 ? 'Add screenshot' : 'Add another'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.toggleRow, { borderColor: palette.border }]}>
              <View style={styles.toggleCopy}>
                <Text style={[styles.toggleTitle, { color: palette.text }]}>Include diagnostics</Text>
                <Text style={[styles.toggleSubtitle, { color: palette.subtext }]}>
                  Include app/device info to help us debug faster.
                </Text>
              </View>
              <Switch
                value={includeDiagnostics}
                onValueChange={setIncludeDiagnostics}
                trackColor={{ false: palette.border, true: palette.accent }}
                thumbColor="#FFFFFF"
                disabled={submitting}
              />
            </View>

            {submitting && (
              <View style={styles.progressRow}>
                <ActivityIndicator size="small" color={palette.accent} />
                <Text style={[styles.progressText, { color: palette.subtext }]}>
                  {attachments.length > 0 ? 'Uploading attachments...' : 'Sending ticket...'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: palette.accent }, submitting && styles.sendButtonDisabled]}
              onPress={submitTicket}
              disabled={submitting}
            >
              <Text style={styles.sendButtonText}>{submitting ? 'Sending...' : 'Send'}</Text>
            </TouchableOpacity>
          </View>

          {recentTickets.length > 0 && (
            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.title, { color: palette.text, fontSize: 18 }]}>Recent Tickets</Text>
              {recentTickets.map((ticket) => (
                <View key={ticket.id} style={[styles.ticketRow, { borderBottomColor: palette.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.ticketId, { color: palette.text }]}>#{ticket.id.slice(0, 8)}</Text>
                    <Text style={[styles.ticketMeta, { color: palette.subtext }]}>
                      {ticket.category || 'General'} · {ticket.status || 'open'}
                    </Text>
                  </View>
                  <Text style={[styles.ticketDate, { color: palette.subtext }]}>{ticket.createdAt || ''}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 30 }} />
          <TouchableOpacity style={styles.emailFallbackBtn} onPress={() => void openEmailFallback()}>
            <Text style={[styles.emailFallbackText, { color: palette.accent }]}>Prefer email? Open email app</Text>
          </TouchableOpacity>
          <View style={{ height: 30 }} />
        </ScrollView>

        {ticketId && (
          <View style={styles.confirmOverlay}>
            <View style={[styles.confirmCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Ionicons name="checkmark-circle" size={38} color="#30D158" />
              <Text style={[styles.confirmTitle, { color: palette.text }]}>Thanks! Ticket submitted.</Text>
              <Text style={[styles.confirmText, { color: palette.subtext }]}>Ticket ID: {ticketId}</Text>
              <Text style={[styles.confirmText, { color: palette.subtext }]}>We&apos;ll reply within 24 hours.</Text>
              {ticketEmailWarning ? (
                <Text style={[styles.confirmWarn, { color: palette.subtext }]}>{ticketEmailWarning}</Text>
              ) : null}
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: palette.accent }]} onPress={() => setTicketId(null)}>
                <Text style={styles.confirmBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {categoryModalVisible && (
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Choose Category</Text>
              {CATEGORY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.modalItem, { borderBottomColor: palette.border }]}
                  onPress={() => {
                    setCategory(option);
                    setCategoryModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, { color: palette.text }]}>{option}</Text>
                  {category === option ? <Ionicons name="checkmark" size={18} color={palette.accent} /> : null}
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.modalClose} onPress={() => setCategoryModalVisible(false)}>
                <Text style={[styles.modalCloseText, { color: palette.accent }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </TouchableWithoutFeedback>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  selector: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorText: {
    fontSize: 15,
    fontWeight: '600',
  },
  textarea: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    fontSize: 15,
  },
  counter: {
    textAlign: 'right',
    marginTop: 4,
    fontSize: 12,
  },
  attachRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  attachThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: 'visible',
  },
  attachImg: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  attachRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  attachAdd: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  attachAddText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  toggleRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  toggleCopy: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  toggleSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  progressRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressText: {
    fontSize: 12,
  },
  sendButton: {
    minHeight: 46,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  ticketRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
  },
  ticketId: {
    fontSize: 14,
    fontWeight: '700',
  },
  ticketMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  ticketDate: {
    fontSize: 11,
    maxWidth: 130,
    textAlign: 'right',
  },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmText: {
    fontSize: 14,
    lineHeight: 20,
  },
  confirmWarn: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  confirmBtn: {
    marginTop: 14,
    minHeight: 42,
    borderRadius: 10,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  modalItem: {
    minHeight: 44,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalClose: {
    marginTop: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emailFallbackBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  emailFallbackText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
