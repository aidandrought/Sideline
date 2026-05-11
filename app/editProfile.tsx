import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userProfile, updateUserProfile } = useAuth();
  const { isDark } = useTheme();
  const [username, setUsername] = useState(userProfile?.username || '');
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);

  const palette = useMemo(
    () =>
      isDark
        ? { background: '#0B0B0B', card: '#1C1C1E', border: '#2C2C2E', text: '#FFFFFF', subtext: '#A1A1A6', accent: '#4DA3FF' }
        : { background: '#F5F5F7', card: '#FFFFFF', border: '#E5E7EB', text: '#000000', subtext: '#666666', accent: '#0066CC' },
    [isDark]
  );

  const displayPhoto = localPhotoUri || userProfile?.photoURL || null;

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to set a profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setLocalPhotoUri(uri);
    setPhotoUploading(true);

    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const photoRef = ref(storage, `profilePhotos/${userProfile?.uid}/photo.jpg`);
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(photoRef, blob, { contentType: 'image/jpeg' });
        task.on('state_changed', null, reject, () => resolve());
      });
      const downloadURL = await getDownloadURL(photoRef);
      await updateUserProfile({ photoURL: downloadURL });
    } catch (error) {
      console.error('Photo upload failed:', error);
      Alert.alert('Upload failed', 'Could not upload photo. Please try again.');
      setLocalPhotoUri(null);
    } finally {
      setPhotoUploading(false);
    }
  };

  const save = async () => {
    const nextName = username.trim();
    if (!nextName) {
      Alert.alert('Invalid Name', 'Enter a username to continue.');
      return;
    }
    setSaving(true);
    try {
      await updateUserProfile({ username: nextName });
      router.back();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Unable to Save', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['bottom']}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12), backgroundColor: palette.card, borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Edit Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        {/* Photo picker */}
        <View style={styles.photoSection}>
          <TouchableOpacity style={styles.avatarWrap} onPress={pickPhoto} disabled={photoUploading} activeOpacity={0.8}>
            {displayPhoto ? (
              <Image source={{ uri: displayPhoto }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: palette.accent + '22' }]}>
                <Text style={[styles.avatarInitial, { color: palette.accent }]}>
                  {(userProfile?.username?.[0] || 'U').toUpperCase()}
                </Text>
              </View>
            )}
            <View style={[styles.cameraBadge, { backgroundColor: palette.accent }]}>
              {photoUploading
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Ionicons name="camera" size={14} color="#FFF" />}
            </View>
          </TouchableOpacity>
          <Text style={[styles.photoHint, { color: palette.subtext }]}>
            {photoUploading ? 'Uploading…' : 'Tap to change photo'}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.label, { color: palette.subtext }]}>Username</Text>
          <TextInput
            style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            placeholderTextColor={palette.subtext}
            autoCapitalize="none"
          />

          <Text style={[styles.label, { color: palette.subtext }]}>Email</Text>
          <View style={[styles.readOnlyField, { borderColor: palette.border }]}>
            <Text style={[styles.readOnlyText, { color: palette.text }]}>{userProfile?.email || 'No email on file'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.primaryButton, { opacity: saving ? 0.7 : 1 }]} onPress={save} disabled={saving || photoUploading}>
          <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
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
  headerSpacer: { width: 40 },
  content: {
    flex: 1,
    padding: 20,
    gap: 20,
  },
  photoSection: {
    alignItems: 'center',
    paddingTop: 8,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 10,
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: '800',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  photoHint: {
    fontSize: 13,
    fontWeight: '500',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  readOnlyField: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  readOnlyText: {
    fontSize: 15,
    fontWeight: '600',
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
