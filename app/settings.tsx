import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { shadow } from '../components/styleUtils';
import { useAuth } from '../context/AuthContext';
import { Community, communityService } from '../services/communityService';

export default function SettingsScreen() {
  const router = useRouter();
  const { userProfile, logout, updateUserProfile } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [liveScoresEnabled, setLiveScoresEnabled] = useState(true);
  const [chatNotifications, setChatNotifications] = useState(true);
  const [darkModeAuto, setDarkModeAuto] = useState(true);

  const [favoriteTeams, setFavoriteTeams] = useState<string[]>(userProfile?.followedTeams ?? []);
  const [favoriteLeagues, setFavoriteLeagues] = useState<string[]>(userProfile?.followedLeagues ?? []);
  const [pendingTeams, setPendingTeams] = useState<string[]>([]);
  const [pendingLeagues, setPendingLeagues] = useState<string[]>([]);
  const [teamModalVisible, setTeamModalVisible] = useState(false);
  const [leagueModalVisible, setLeagueModalVisible] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [leagueSearch, setLeagueSearch] = useState('');
  const [allCommunities, setAllCommunities] = useState<Community[]>([]);
  const [loadingCommunities, setLoadingCommunities] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          }
        }
      ]
    );
  };

  useEffect(() => {
    setFavoriteTeams(userProfile?.followedTeams ?? []);
    setFavoriteLeagues(userProfile?.followedLeagues ?? []);
  }, [userProfile]);

  useEffect(() => {
    const cached = communityService.getCachedAllCommunities();
    if (cached?.data.length) {
      setAllCommunities(cached.data);
    }

    let isMounted = true;
    setLoadingCommunities(true);
    communityService.getAllCommunities()
      .then(communities => {
        if (isMounted) {
          setAllCommunities(communities);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingCommunities(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const teamOptions = useMemo(
    () => allCommunities.filter(c => c.type === 'team'),
    [allCommunities]
  );

  const leagueOptions = useMemo(
    () => allCommunities.filter(c => c.type === 'league'),
    [allCommunities]
  );

  const filteredTeams = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();
    if (!query) return teamOptions;
    return teamOptions.filter(team =>
      team.name.toLowerCase().includes(query) ||
      (team.league && team.league.toLowerCase().includes(query))
    );
  }, [teamOptions, teamSearch]);

  const filteredLeagues = useMemo(() => {
    const query = leagueSearch.trim().toLowerCase();
    if (!query) return leagueOptions;
    return leagueOptions.filter(league =>
      league.name.toLowerCase().includes(query) ||
      (league.country && league.country.toLowerCase().includes(query))
    );
  }, [leagueOptions, leagueSearch]);

  const openTeamsModal = () => {
    setPendingTeams(favoriteTeams);
    setTeamSearch('');
    setTeamModalVisible(true);
  };

  const openLeaguesModal = () => {
    setPendingLeagues(favoriteLeagues);
    setLeagueSearch('');
    setLeagueModalVisible(true);
  };

  const togglePendingTeam = (teamName: string) => {
    setPendingTeams(prev =>
      prev.includes(teamName) ? prev.filter(name => name !== teamName) : [...prev, teamName]
    );
  };

  const togglePendingLeague = (leagueName: string) => {
    setPendingLeagues(prev =>
      prev.includes(leagueName) ? prev.filter(name => name !== leagueName) : [...prev, leagueName]
    );
  };

  const saveTeams = async () => {
    if (!userProfile) {
      Alert.alert('Sign in required', 'Please sign in to save favorite teams.');
      return;
    }

    try {
      await updateUserProfile({ followedTeams: pendingTeams });
      setFavoriteTeams(pendingTeams);
      setTeamModalVisible(false);
    } catch (error) {
      console.error('Error saving favorite teams:', error);
      Alert.alert('Unable to save', 'Please try again in a moment.');
    }
  };

  const saveLeagues = async () => {
    if (!userProfile) {
      Alert.alert('Sign in required', 'Please sign in to save favorite leagues.');
      return;
    }

    try {
      await updateUserProfile({ followedLeagues: pendingLeagues });
      setFavoriteLeagues(pendingLeagues);
      setLeagueModalVisible(false);
    } catch (error) {
      console.error('Error saving favorite leagues:', error);
      Alert.alert('Unable to save', 'Please try again in a moment.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* User Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {userProfile?.username?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{userProfile?.username || 'User'}</Text>
            <Text style={styles.profileEmail}>{userProfile?.email || 'user@example.com'}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/profile')}>
            <Ionicons name="chevron-forward" size={24} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Quick Navigation Menu */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Access</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/live')}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#FF3B30' }]}>
                <Ionicons name="radio" size={20} color="#FFF" />
              </View>
              <Text style={styles.menuText}>Live Matches</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/upcoming')}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#0066CC' }]}>
                <Ionicons name="calendar" size={20} color="#FFF" />
              </View>
              <Text style={styles.menuText}>Upcoming Matches</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/news')}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#34C759' }]}>
                <Ionicons name="newspaper" size={20} color="#FFF" />
              </View>
              <Text style={styles.menuText}>Latest News</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="notifications" size={24} color="#0066CC" />
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingText}>Push Notifications</Text>
                <Text style={styles.settingSubtext}>Get notified about matches and updates</Text>
              </View>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#E5E7EB', true: '#0066CC' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="football" size={24} color="#0066CC" />
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingText}>Live Score Alerts</Text>
                <Text style={styles.settingSubtext}>Real-time goal notifications</Text>
              </View>
            </View>
            <Switch
              value={liveScoresEnabled}
              onValueChange={setLiveScoresEnabled}
              trackColor={{ false: '#E5E7EB', true: '#0066CC' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="chatbubbles" size={24} color="#0066CC" />
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingText}>Chat Notifications</Text>
                <Text style={styles.settingSubtext}>Replies and reactions</Text>
              </View>
            </View>
            <Switch
              value={chatNotifications}
              onValueChange={setChatNotifications}
              trackColor={{ false: '#E5E7EB', true: '#0066CC' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Appearance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="moon" size={24} color="#0066CC" />
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingText}>Auto Dark Mode</Text>
                <Text style={styles.settingSubtext}>Match system settings</Text>
              </View>
            </View>
            <Switch
              value={darkModeAuto}
              onValueChange={setDarkModeAuto}
              trackColor={{ false: '#E5E7EB', true: '#0066CC' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="language" size={24} color="#0066CC" />
              <Text style={styles.menuText}>Language</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={styles.menuValue}>English</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="heart" size={24} color="#0066CC" />
              <Text style={styles.menuText}>Favorite Teams</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={styles.menuValue}>3 teams</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="trophy" size={24} color="#0066CC" />
              <Text style={styles.menuText}>Favorite Leagues</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={styles.menuValue}>5 leagues</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="time" size={24} color="#0066CC" />
              <Text style={styles.menuText}>Time Zone</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={styles.menuValue}>Auto</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Account & Security */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account & Security</Text>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => router.push('/profile')}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="person" size={24} color="#0066CC" />
              <Text style={styles.menuText}>Edit Profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="lock-closed" size={24} color="#0066CC" />
              <Text style={styles.menuText}>Change Password</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="shield-checkmark" size={24} color="#0066CC" />
              <Text style={styles.menuText}>Privacy & Security</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Support & About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support & About</Text>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="help-circle" size={24} color="#0066CC" />
              <Text style={styles.menuText}>Help Center</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="chatbubble-ellipses" size={24} color="#0066CC" />
              <Text style={styles.menuText}>Contact Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="document-text" size={24} color="#0066CC" />
              <Text style={styles.menuText}>Terms of Service</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="shield" size={24} color="#0066CC" />
              <Text style={styles.menuText}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <View style={styles.versionItem}>
            <Text style={styles.versionText}>Sideline Version 1.0.0</Text>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Actions</Text>

          <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="log-out" size={24} color="#FF3B30" />
              <Text style={[styles.menuText, { color: '#FF3B30' }]}>Log Out</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="trash" size={24} color="#FF3B30" />
              <Text style={[styles.menuText, { color: '#FF3B30' }]}>Delete Account</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
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
    paddingTop: 60,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  content: {
    flex: 1,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginTop: 20,
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    ...shadow({ y: 2, blur: 8, opacity: 0.08, elevation: 3 }),
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  profileAvatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F7',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginLeft: 0,
  },
  menuValue: {
    fontSize: 17,
    color: '#999',
    marginRight: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F7',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingTextContainer: {
    marginLeft: 15,
    flex: 1,
  },
  settingText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  settingSubtext: {
    fontSize: 13,
    color: '#999',
  },
  versionItem: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 15,
    color: '#999',
  },
});









