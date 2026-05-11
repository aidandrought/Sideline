// app/allThreads.tsx
// All recent community threads — searchable, taps into community posts

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import {
  CommunityPost,
  getPopularRecentPosts,
  searchRecentPosts,
} from '../services/communityPostsService';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function AllThreadsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();

  const palette = {
    bg: isDark ? '#0B0B0B' : '#F5F5F7',
    card: isDark ? '#1C1C1E' : '#FFFFFF',
    text: isDark ? '#E6E6E9' : '#000000',
    subtext: isDark ? '#A1A1A6' : '#666666',
    accent: isDark ? '#4DA3FF' : '#0066CC',
    border: isDark ? '#2C2C2E' : '#E5E7EB',
    inputBg: isDark ? '#2C2C2E' : '#F0F0F0',
    tagBg: isDark ? 'rgba(77,163,255,0.14)' : 'rgba(0,102,204,0.08)',
  };

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getPopularRecentPosts(50).then((data) => {
      setPosts(data);
      setLoading(false);
    });
  }, []);

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (text.trim().length < 2) {
      setSearching(false);
      getPopularRecentPosts(50).then(setPosts);
      return;
    }

    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await searchRecentPosts(text.trim(), 50);
      setPosts(results);
      setSearching(false);
    }, 400);
  }, []);

  const navigateToThread = (post: CommunityPost) => {
    router.push({
      pathname: '/communityPosts/[id]',
      params: {
        id: post.communityId,
        name: post.communityName,
        type: post.communityType,
        logo: '',
      },
    } as any);
  };

  const renderPost = ({ item }: { item: CommunityPost }) => (
    <TouchableOpacity
      style={[styles.postCard, { backgroundColor: palette.card, borderColor: palette.border }]}
      onPress={() => navigateToThread(item)}
      activeOpacity={0.85}
    >
      <View style={[styles.communityTag, { backgroundColor: palette.tagBg }]}>
        <Ionicons name="people" size={11} color={palette.accent} />
        <Text style={[styles.communityTagText, { color: palette.accent }]} numberOfLines={1}>
          {item.communityName}
        </Text>
      </View>
      <Text style={[styles.postTitle, { color: palette.text }]} numberOfLines={2}>
        {item.title}
      </Text>
      {item.body.trim().length > 0 && (
        <Text style={[styles.postBody, { color: palette.subtext }]} numberOfLines={2}>
          {item.body}
        </Text>
      )}
      <View style={styles.postFooter}>
        <Text style={[styles.postMeta, { color: palette.subtext }]}>
          {item.username} · {timeAgo(item.createdAt)}
        </Text>
        <View style={styles.postStats}>
          <View style={styles.statPill}>
            <Ionicons name="chatbubble-outline" size={13} color={palette.subtext} />
            <Text style={[styles.statText, { color: palette.subtext }]}>{item.commentCount}</Text>
          </View>
          <View style={styles.statPill}>
            <Ionicons name="heart-outline" size={13} color={palette.subtext} />
            <Text style={[styles.statText, { color: palette.subtext }]}>{item.likesCount}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Popular Threads</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search Bar */}
      <View style={[styles.searchBar, { backgroundColor: palette.inputBg, borderColor: palette.border }]}>
        <Ionicons name="search" size={18} color={palette.subtext} />
        <TextInput
          style={[styles.searchInput, { color: palette.text }]}
          placeholder="Search threads, communities..."
          placeholderTextColor={palette.subtext}
          value={searchQuery}
          onChangeText={handleSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searching && <ActivityIndicator size="small" color={palette.accent} />}
      </View>

      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={palette.border} />
              <Text style={[styles.emptyText, { color: palette.subtext }]}>
                {searchQuery.trim().length >= 2 ? 'No threads match your search' : 'No threads in the last 72 hours'}
              </Text>
            </View>
          }
        />
      )}
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  postCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  communityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
    gap: 4,
  },
  communityTagText: {
    fontSize: 11,
    fontWeight: '600',
    maxWidth: 180,
  },
  postTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    marginBottom: 4,
  },
  postBody: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  postFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  postMeta: {
    fontSize: 12,
  },
  postStats: {
    flexDirection: 'row',
    gap: 10,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
  },
  centerLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
});
