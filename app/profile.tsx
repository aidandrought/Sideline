import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function ProfileScreen() {
  const router = useRouter();
  const { userProfile, logout } = useAuth();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const palette = isDark
    ? {
        background: '#0B0B0B',
        card: '#1C1C1E',
        text: '#FFFFFF',
        subtext: '#A1A1A6',
        mutedCard: '#2C2C2E',
        border: '#2C2C2E',
        accent: '#4DA3FF',
      }
    : {
        background: '#F5F5F7',
        card: '#FFFFFF',
        text: '#000000',
        subtext: '#666666',
        mutedCard: '#F5F5F7',
        border: '#F5F5F7',
        accent: '#0066CC',
      };

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['bottom']}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16), backgroundColor: palette.card }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Profile</Text>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={28} color={palette.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.profileSection, { backgroundColor: palette.card }]}>
          {userProfile?.photoURL ? (
            <Image source={{ uri: userProfile.photoURL }} style={styles.avatarPhoto} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {userProfile?.username?.[0]?.toUpperCase() || 'U'}
              </Text>
            </View>
          )}
          <Text style={[styles.username, { color: palette.text }]}>{userProfile?.username || 'User'}</Text>
          <Text style={[styles.email, { color: palette.subtext }]}>{userProfile?.email || 'user@example.com'}</Text>
        </View>

        <View style={[styles.statsSection, { backgroundColor: palette.card }]}>
          <View style={[styles.statCard, { backgroundColor: palette.mutedCard }]}>
            <Text style={[styles.statNumber, { color: palette.accent }]}>{userProfile?.followedTeams?.length ?? 0}</Text>
            <Text style={[styles.statLabel, { color: palette.subtext }]}>Teams</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: palette.mutedCard }]}>
            <Text style={[styles.statNumber, { color: palette.accent }]}>{userProfile?.followedLeagues?.length ?? 0}</Text>
            <Text style={[styles.statLabel, { color: palette.subtext }]}>Leagues</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: palette.mutedCard }]}>
            <Text style={[styles.statNumber, { color: palette.accent }]}>
              {(userProfile?.followedTeams?.length ?? 0) + (userProfile?.followedLeagues?.length ?? 0)}
            </Text>
            <Text style={[styles.statLabel, { color: palette.subtext }]}>Following</Text>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: palette.card }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Favorite Teams</Text>
          <View style={styles.teamsList}>
            {(userProfile?.followedTeams || []).length === 0 ? (
              <Text style={[styles.email, { color: palette.subtext }]}>No teams yet.</Text>
            ) : (
              (userProfile?.followedTeams || []).map((team) => (
                <View key={team} style={[styles.teamChip, { backgroundColor: palette.accent }]}>
                  <Text style={styles.teamText}>{team}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: palette.card }]}>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemDivider, { borderBottomColor: palette.border }]} onPress={() => router.push('/settings')}>
            <Ionicons name="notifications-outline" size={24} color="#0066CC" />
            <Text style={[styles.menuText, { color: palette.text }]}>Notifications</Text>
            <Ionicons name="chevron-forward" size={20} color={palette.subtext} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, styles.menuItemDivider, { borderBottomColor: palette.border }]} onPress={() => router.push({ pathname: '/legal/privacy' } as any)}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#0066CC" />
            <Text style={[styles.menuText, { color: palette.text }]}>Privacy</Text>
            <Ionicons name="chevron-forward" size={20} color={palette.subtext} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
            <Text style={[styles.menuText, { color: '#FF3B30' }]}>Log Out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  content: {
    flex: 1,
  },
  profileSection: {
    backgroundColor: '#FFFFFF',
    padding: 30,
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  avatarPhoto: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 15,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  username: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    marginBottom: 5,
  },
  email: {
    fontSize: 15,
    color: '#666',
  },
  statsSection: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 20,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#F5F5F7',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0066CC',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 15,
  },
  teamsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  teamChip: {
    backgroundColor: '#0066CC',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  teamText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
  },
  menuItemDivider: {
    borderBottomWidth: 1,
  },
  menuText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginLeft: 15,
  },
});
