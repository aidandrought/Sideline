// app/communityPosts/[id].tsx
// Community posts feed — focused, community-branded view

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  CommunityPost,
  FlagReason,
  checkPostLiked,
  createPost,
  flagPost,
  subscribeCommunityPosts,
  togglePostLike,
} from '../../services/communityPostsService';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

type SortMode = 'hot' | 'new' | 'top';

function sortPosts(posts: CommunityPost[], mode: SortMode): CommunityPost[] {
  if (mode === 'new') {
    return [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  if (mode === 'top') {
    return [...posts].sort((a, b) => b.likesCount - a.likesCount);
  }
  // hot: blend of recency + likes
  const now = Date.now();
  return [...posts].sort((a, b) => {
    const ageA = (now - new Date(a.createdAt).getTime()) / 3600000;
    const ageB = (now - new Date(b.createdAt).getTime()) / 3600000;
    const scoreA = (a.likesCount + a.commentCount * 1.5) / Math.pow(ageA + 2, 1.4);
    const scoreB = (b.likesCount + b.commentCount * 1.5) / Math.pow(ageB + 2, 1.4);
    return scoreB - scoreA;
  });
}

export default function CommunityPostsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();
  const { isDark } = useTheme();

  const communityId = String(Array.isArray(params.id) ? params.id[0] : params.id ?? '');
  const communityName = String(Array.isArray(params.name) ? params.name[0] : params.name ?? 'Community');
  const communityType = String(
    Array.isArray(params.type) ? params.type[0] : params.type ?? 'league'
  ) as CommunityPost['communityType'];
  const communityLogo = String(Array.isArray(params.logo) ? params.logo[0] : params.logo ?? '');

  const palette = useMemo(
    () =>
      isDark
        ? {
            bg: '#0B0B0B',
            card: '#1C1C1E',
            text: '#E6E6E9',
            subtext: '#A1A1A6',
            accent: '#4DA3FF',
            border: '#2C2C2E',
            surface: '#2C2C2E',
            input: '#111113',
            chipActive: '#1B3A66',
            headerBg: '#111214',
          }
        : {
            bg: '#F2F2F7',
            card: '#FFFFFF',
            text: '#000000',
            subtext: '#666666',
            accent: '#0066CC',
            border: '#E5E5E5',
            surface: '#F0F0F5',
            input: '#FFFFFF',
            chipActive: '#D6E8FF',
            headerBg: '#FFFFFF',
          },
    [isDark]
  );

  const [allPosts, setAllPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [showCompose, setShowCompose] = useState(false);
  const [composeTitle, setComposeTitle] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('hot');
  const unsubRef = useRef<(() => void) | null>(null);

  const posts = useMemo(() => sortPosts(allPosts, sortMode), [allPosts, sortMode]);

  const promptAuth = useCallback(() => {
    Alert.alert('Sign in to participate', 'Create an account or log in to post, like, or report community threads.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log In', onPress: () => router.push('/(auth)/login' as any) },
      { text: 'Sign Up', onPress: () => router.push('/(auth)/signup' as any) },
    ]);
  }, [router]);

  useEffect(() => {
    if (!communityId) return;
    setLoading(true);
    unsubRef.current = subscribeCommunityPosts(communityId, (incoming) => {
      setAllPosts(incoming);
      setLoading(false);
    });
    return () => { unsubRef.current?.(); };
  }, [communityId]);

  useEffect(() => {
    if (!userProfile?.uid || allPosts.length === 0) return;
    const uid = userProfile.uid;
    Promise.all(allPosts.map((p) => checkPostLiked(p.id, uid).then((liked) => ({ id: p.id, liked }))))
      .then((results) => {
        const ids = new Set<string>();
        results.forEach((r) => { if (r.liked) ids.add(r.id); });
        setLikedIds(ids);
      })
      .catch(() => {});
  }, [allPosts, userProfile?.uid]);

  const handleLike = useCallback(async (postId: string) => {
    if (!userProfile?.uid) {
      promptAuth();
      return;
    }
    const nowLiked = await togglePostLike(postId, userProfile.uid);
    setLikedIds((prev) => {
      const next = new Set(prev);
      nowLiked ? next.add(postId) : next.delete(postId);
      return next;
    });
  }, [promptAuth, userProfile?.uid]);

  const handleFlag = useCallback((postId: string) => {
    if (!userProfile?.uid) {
      promptAuth();
      return;
    }
    if (flaggedIds.has(postId)) {
      Alert.alert('Already reported', 'You have already reported this post.');
      return;
    }
    const submitFlag = async (reason: FlagReason) => {
      try {
        await flagPost(postId, userProfile.uid, reason);
        setFlaggedIds((prev) => new Set(prev).add(postId));
        Alert.alert('Reported', 'Thank you. Our team will review this post.');
      } catch {
        Alert.alert('Error', 'Could not submit report.');
      }
    };
    Alert.alert('Report post', 'Why are you reporting this?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Spam', onPress: () => submitFlag('spam') },
      { text: 'Hate speech', onPress: () => submitFlag('hate_speech') },
      { text: 'Inappropriate', onPress: () => submitFlag('inappropriate') },
      { text: 'Misinformation', onPress: () => submitFlag('misinformation') },
    ]);
  }, [flaggedIds, promptAuth, userProfile?.uid]);

  const handleSubmitPost = async () => {
    if (!userProfile?.uid) {
      promptAuth();
      return;
    }
    const title = composeTitle.trim();
    const body = composeBody.trim();
    if (title.length < 3) {
      Alert.alert('Title too short', 'Post title must be at least 3 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await createPost({
        communityId,
        communityType,
        communityName,
        userId: userProfile.uid,
        username: userProfile.username,
        title,
        body,
      });
      setComposeTitle('');
      setComposeBody('');
      setShowCompose(false);
    } catch (err) {
      console.error('[createPost] failed:', err);
      Alert.alert('Error', 'Could not post. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderPost = ({ item }: { item: CommunityPost }) => {
    const liked = likedIds.has(item.id);
    const isFlagged = flaggedIds.has(item.id);
    const isOwn = item.userId === userProfile?.uid;
    return (
      <TouchableOpacity
        style={[styles.postCard, { backgroundColor: palette.card, borderColor: palette.border }]}
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: '/communityPost/[id]', params: { id: item.id } } as any)}
      >
        {/* Author row */}
        <View style={styles.postMeta}>
          <View style={[styles.avatarCircle, { backgroundColor: palette.accent + '28' }]}>
            <Text style={[styles.avatarLetter, { color: palette.accent }]}>
              {item.username.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.postUsername, { color: palette.subtext }]}>{item.username}</Text>
          <Text style={[styles.postDot, { color: palette.border }]}>·</Text>
          <Text style={[styles.postTime, { color: palette.subtext }]}>{timeAgo(item.createdAt)}</Text>
        </View>

        {/* Title */}
        <Text style={[styles.postTitle, { color: palette.text }]} numberOfLines={3}>
          {item.title}
        </Text>

        {/* Body preview */}
        {item.body.trim().length > 0 && (
          <Text style={[styles.postBody, { color: palette.subtext }]} numberOfLines={2}>
            {item.body}
          </Text>
        )}

        {/* Actions */}
        <View style={styles.postActions}>
          <TouchableOpacity
            style={[styles.actionBtn, liked && styles.actionBtnLiked]}
            onPress={() => handleLike(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={15}
              color={liked ? '#EF4444' : palette.subtext}
            />
            <Text style={[styles.actionCount, { color: liked ? '#EF4444' : palette.subtext }]}>
              {item.likesCount}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push({ pathname: '/communityPost/[id]', params: { id: item.id } } as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chatbubble-outline" size={14} color={palette.subtext} />
            <Text style={[styles.actionCount, { color: palette.subtext }]}>{item.commentCount}</Text>
          </TouchableOpacity>

          {!isOwn && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleFlag(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={isFlagged ? 'flag' : 'flag-outline'}
                size={14}
                color={isFlagged ? '#FF453A' : palette.subtext}
              />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderListHeader = () => (
    <View style={[styles.sortBar, { borderBottomColor: palette.border }]}>
      {(['hot', 'new', 'top'] as SortMode[]).map((mode) => (
        <TouchableOpacity
          key={mode}
          style={[
            styles.sortChip,
            { borderColor: palette.border },
            sortMode === mode && { backgroundColor: palette.chipActive, borderColor: palette.accent },
          ]}
          onPress={() => setSortMode(mode)}
        >
          <Ionicons
            name={mode === 'hot' ? 'flame' : mode === 'new' ? 'time-outline' : 'trending-up'}
            size={13}
            color={sortMode === mode ? palette.accent : palette.subtext}
          />
          <Text style={[styles.sortChipText, { color: sortMode === mode ? palette.accent : palette.subtext }]}>
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.headerBg, borderBottomColor: palette.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={palette.text} />
        </TouchableOpacity>
        <View style={styles.headerIdentity}>
          {communityLogo ? (
            <Image source={{ uri: communityLogo }} style={styles.headerLogo} resizeMode="contain" />
          ) : (
            <View style={[styles.headerLogoFallback, { backgroundColor: palette.accent + '22' }]}>
              <Ionicons
                name={communityType === 'team' ? 'shield' : 'trophy'}
                size={16}
                color={palette.accent}
              />
            </View>
          )}
          <View>
            <Text style={[styles.headerTitle, { color: palette.text }]} numberOfLines={1}>
              {communityName}
            </Text>
            <Text style={[styles.headerSub, { color: palette.subtext }]}>
              {allPosts.length > 0 ? `${allPosts.length} post${allPosts.length !== 1 ? 's' : ''}` : 'Discussions'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.composeBtn, { backgroundColor: palette.accent }]}
          onPress={() => {
            if (!userProfile?.uid) { Alert.alert('Sign in required'); return; }
            setShowCompose(true);
          }}
        >
          <Ionicons name="create-outline" size={17} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={palette.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          ListHeaderComponent={renderListHeader}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={52} color={palette.subtext} />
              <Text style={[styles.emptyTitle, { color: palette.text }]}>No posts yet</Text>
              <Text style={[styles.emptyDesc, { color: palette.subtext }]}>
                Start a discussion in the {communityName} community.
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: palette.accent }]}
                onPress={() => setShowCompose(true)}
              >
                <Text style={styles.emptyBtnText}>Create Post</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Compose modal */}
      <Modal
        visible={showCompose}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCompose(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowCompose(false)}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalWrapper}
          pointerEvents="box-none"
        >
          <View style={[styles.modalSheet, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIdentity}>
                {communityLogo ? (
                  <Image source={{ uri: communityLogo }} style={styles.modalLogo} resizeMode="contain" />
                ) : null}
                <Text style={[styles.modalTitle, { color: palette.text }]}>Post to {communityName}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCompose(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={palette.subtext} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.titleInput, { backgroundColor: palette.surface, color: palette.text, borderColor: palette.border }]}
              value={composeTitle}
              onChangeText={setComposeTitle}
              placeholder="Title (required)"
              placeholderTextColor={palette.subtext}
              maxLength={200}
              autoFocus
            />
            <TextInput
              style={[styles.bodyInput, { backgroundColor: palette.surface, color: palette.text, borderColor: palette.border }]}
              value={composeBody}
              onChangeText={setComposeBody}
              placeholder="Add more details… (optional)"
              placeholderTextColor={palette.subtext}
              maxLength={2000}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.modalFooter}>
              <Text style={[styles.charCount, { color: palette.subtext }]}>
                {composeTitle.length}/200
              </Text>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: composeTitle.trim().length >= 3 ? palette.accent : palette.surface },
                ]}
                onPress={handleSubmitPost}
                disabled={submitting || composeTitle.trim().length < 3}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[styles.submitBtnText, { color: composeTitle.trim().length >= 3 ? '#fff' : palette.subtext }]}>
                      Post
                    </Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLogo: { width: 32, height: 32, borderRadius: 8 },
  headerLogoFallback: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 1 },
  composeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  sortChipText: { fontSize: 13, fontWeight: '600' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 12, paddingTop: 12 },
  postCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  postMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatarCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 11, fontWeight: '700' },
  postUsername: { fontSize: 12, fontWeight: '500' },
  postDot: { fontSize: 12 },
  postTime: { fontSize: 12 },
  postTitle: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  postBody: { fontSize: 13, lineHeight: 18 },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtnLiked: {},
  actionCount: { fontSize: 13, fontWeight: '500' },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 4,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  modalWrapper: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 12,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  modalIdentity: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalLogo: { width: 24, height: 24, borderRadius: 6 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  titleInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  bodyInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 100,
  },
  modalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  charCount: { fontSize: 11 },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  submitBtnText: { fontSize: 15, fontWeight: '700' },
});
