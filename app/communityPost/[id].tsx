// app/communityPost/[id].tsx
// Single community post with comments — focused, community-branded

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  CommunityComment,
  CommunityPost,
  FlagReason,
  addComment,
  checkPostFlagged,
  checkPostLiked,
  deleteComment,
  deletePost,
  flagPost,
  getPost,
  subscribeComments,
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

export default function CommunityPostScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();
  const { isDark } = useTheme();

  const postId = String(Array.isArray(params.id) ? params.id[0] : params.id ?? '');

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
            inputBg: '#111113',
            divider: '#232325',
          }
        : {
            bg: '#F2F2F7',
            card: '#FFFFFF',
            text: '#000000',
            subtext: '#666666',
            accent: '#0066CC',
            border: '#E5E5E5',
            surface: '#F0F0F5',
            inputBg: '#FFFFFF',
            divider: '#EBEBED',
          },
    [isDark]
  );

  const [post, setPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingToName, setReplyingToName] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!postId) return;
    getPost(postId).then((p) => {
      setPost(p);
      setLoading(false);
    });
    unsubRef.current = subscribeComments(postId, setComments);
    return () => { unsubRef.current?.(); };
  }, [postId]);

  useEffect(() => {
    if (!post || !userProfile?.uid) return;
    checkPostLiked(post.id, userProfile.uid).then(setLiked);
    checkPostFlagged(post.id, userProfile.uid).then(setFlagged);
  }, [post?.id, userProfile?.uid]);

  const promptAuth = useCallback(() => {
    Alert.alert('Sign in to participate', 'Create an account or log in to comment, like, or report community threads.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log In', onPress: () => router.push('/(auth)/login' as any) },
      { text: 'Sign Up', onPress: () => router.push('/(auth)/signup' as any) },
    ]);
  }, [router]);

  const handleLike = async () => {
    if (!post) return;
    if (!userProfile?.uid) {
      promptAuth();
      return;
    }
    const nowLiked = await togglePostLike(post.id, userProfile.uid);
    setLiked(nowLiked);
    setPost((prev) =>
      prev ? { ...prev, likesCount: prev.likesCount + (nowLiked ? 1 : -1) } : prev
    );
  };

  const handleAddComment = async () => {
    if (!post) return;
    if (!userProfile?.uid) {
      promptAuth();
      return;
    }
    const text = commentText.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const finalText = replyingToName ? `@${replyingToName} ${text}` : text;
      await addComment({ postId: post.id, userId: userProfile.uid, username: userProfile.username, text: finalText });
      setCommentText('');
      setReplyingToName(null);
      setPost((prev) => prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev);
    } catch {
      Alert.alert('Error', 'Could not post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = useCallback((comment: CommunityComment) => {
    if (!post) return;
    Alert.alert('Delete comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteComment(post.id, comment.id);
          setPost((prev) => prev ? { ...prev, commentCount: Math.max(0, prev.commentCount - 1) } : prev);
        },
      },
    ]);
  }, [post]);

  const handleDeletePost = () => {
    if (!post) return;
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePost(post.id);
          router.back();
        },
      },
    ]);
  };

  const handleFlag = () => {
    if (!post) return;
    if (!userProfile?.uid) {
      promptAuth();
      return;
    }
    if (flagged) {
      Alert.alert('Already reported', 'You have already reported this post.');
      return;
    }
    Alert.alert(
      'Report post',
      'Why are you reporting this?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Spam', onPress: () => submitFlag('spam') },
        { text: 'Hate speech', onPress: () => submitFlag('hate_speech') },
        { text: 'Inappropriate', onPress: () => submitFlag('inappropriate') },
        { text: 'Misinformation', onPress: () => submitFlag('misinformation') },
      ]
    );
  };

  const submitFlag = async (reason: FlagReason) => {
    if (!post || !userProfile?.uid) return;
    try {
      await flagPost(post.id, userProfile.uid, reason);
      setFlagged(true);
      Alert.alert('Reported', 'Thank you. Our team will review this post.');
    } catch {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    }
  };

  const handleReply = (username: string) => {
    setReplyingToName(username);
    inputRef.current?.focus();
  };

  const renderComment = ({ item }: { item: CommunityComment }) => {
    const isOwn = item.userId === userProfile?.uid;
    return (
      <View style={[styles.commentRow, { borderBottomColor: palette.divider }]}>
        <View style={[styles.commentAvatar, { backgroundColor: palette.accent + '20' }]}>
          <Text style={[styles.commentAvatarLetter, { color: palette.accent }]}>
            {item.username.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.commentBody}>
          <View style={styles.commentMeta}>
            <Text style={[styles.commentUsername, { color: palette.text }]}>{item.username}</Text>
            <Text style={[styles.commentTime, { color: palette.subtext }]}>{timeAgo(item.createdAt)}</Text>
            <View style={styles.commentActions}>
              <TouchableOpacity
                onPress={() => handleReply(item.username)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.replyBtn, { color: palette.accent }]}>Reply</Text>
              </TouchableOpacity>
              {isOwn && (
                <TouchableOpacity
                  onPress={() => handleDeleteComment(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={13} color={palette.subtext} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <Text style={[styles.commentText, { color: palette.text }]}>{item.text}</Text>
        </View>
      </View>
    );
  };

  const renderPostHeader = () => {
    if (!post) return null;
    const isOwn = post.userId === userProfile?.uid;
    return (
      <View style={[styles.postCard, { backgroundColor: palette.card }]}>
        {/* Community tag */}
        {post.communityName ? (
          <View style={[styles.communityTag, { backgroundColor: palette.accent + '18' }]}>
            <Ionicons name="people" size={11} color={palette.accent} />
            <Text style={[styles.communityTagText, { color: palette.accent }]}>{post.communityName}</Text>
          </View>
        ) : null}

        {/* Author row */}
        <View style={styles.postMeta}>
          <View style={[styles.avatarCircle, { backgroundColor: palette.accent + '22' }]}>
            <Text style={[styles.avatarLetter, { color: palette.accent }]}>
              {post.username.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.postUsername, { color: palette.text }]}>{post.username}</Text>
            <Text style={[styles.postTime, { color: palette.subtext }]}>{timeAgo(post.createdAt)}</Text>
          </View>
          {isOwn ? (
            <TouchableOpacity
              onPress={handleDeletePost}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="trash-outline" size={17} color={palette.subtext} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleFlag}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={flagged ? 'flag' : 'flag-outline'}
                size={17}
                color={flagged ? '#FF453A' : palette.subtext}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Title */}
        <Text style={[styles.postTitle, { color: palette.text }]}>{post.title}</Text>

        {/* Body */}
        {post.body.trim().length > 0 && (
          <Text style={[styles.postBody, { color: palette.text }]}>{post.body}</Text>
        )}

        {/* Actions */}
        <View style={[styles.postActions, { borderTopColor: palette.divider }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={18}
              color={liked ? '#EF4444' : palette.subtext}
            />
            <Text style={[styles.actionCount, { color: liked ? '#EF4444' : palette.subtext }]}>
              {post.likesCount}
            </Text>
          </TouchableOpacity>

          <View style={styles.actionBtn}>
            <Ionicons name="chatbubble-outline" size={17} color={palette.subtext} />
            <Text style={[styles.actionCount, { color: palette.subtext }]}>{post.commentCount}</Text>
          </View>
        </View>

        {/* Comments header */}
        <View style={[styles.commentsSection, { borderTopColor: palette.divider }]}>
          <Text style={[styles.commentsLabel, { color: palette.text }]}>
            {comments.length} {comments.length === 1 ? 'Comment' : 'Comments'}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: palette.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={22} color={palette.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: palette.text }]}>Post</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={palette.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]} numberOfLines={1}>
          {post?.communityName ?? 'Post'}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={renderComment}
          ListHeaderComponent={renderPostHeader}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            post ? (
              <View style={styles.noComments}>
                <Text style={[styles.noCommentsText, { color: palette.subtext }]}>
                  Be the first to comment.
                </Text>
              </View>
            ) : null
          }
        />

        {/* Reply indicator */}
        {replyingToName ? (
          <View style={[styles.replyIndicator, { backgroundColor: palette.surface, borderTopColor: palette.border }]}>
            <Ionicons name="return-down-forward" size={14} color={palette.accent} />
            <Text style={[styles.replyIndicatorText, { color: palette.subtext }]}>
              Replying to <Text style={{ color: palette.accent }}>@{replyingToName}</Text>
            </Text>
            <TouchableOpacity
              onPress={() => setReplyingToName(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={15} color={palette.subtext} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Comment input bar */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: palette.card,
              borderTopColor: palette.border,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <View style={[styles.commentAvatar, { backgroundColor: palette.accent + '20' }]}>
            <Text style={[styles.commentAvatarLetter, { color: palette.accent }]}>
              {userProfile?.username?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <TextInput
            ref={inputRef}
            style={[styles.commentInput, { backgroundColor: palette.surface, color: palette.text }]}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Add a comment…"
            placeholderTextColor={palette.subtext}
            multiline
            maxLength={500}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: commentText.trim() ? palette.accent : palette.surface },
            ]}
            onPress={handleAddComment}
            disabled={!commentText.trim() || submitting}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={15} color={commentText.trim() ? '#fff' : palette.subtext} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 0, paddingTop: 0 },
  postCard: { padding: 16, marginBottom: 8 },
  communityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 10,
  },
  communityTagText: { fontSize: 11, fontWeight: '600' },
  postMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 15, fontWeight: '700' },
  postUsername: { fontSize: 14, fontWeight: '600' },
  postTime: { fontSize: 12, marginTop: 2 },
  postTitle: { fontSize: 20, fontWeight: '800', lineHeight: 28, marginBottom: 10 },
  postBody: { fontSize: 15, lineHeight: 23, marginBottom: 14, opacity: 0.85 },
  postActions: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 14,
    marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { fontSize: 14, fontWeight: '600' },
  commentsSection: {
    paddingTop: 14,
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentsLabel: { fontSize: 15, fontWeight: '700' },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  commentAvatarLetter: { fontSize: 12, fontWeight: '700' },
  commentBody: { flex: 1 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  commentUsername: { fontSize: 13, fontWeight: '600' },
  commentTime: { fontSize: 12 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 'auto' },
  replyBtn: { fontSize: 12, fontWeight: '600' },
  commentText: { fontSize: 14, lineHeight: 20 },
  noComments: { paddingTop: 32, alignItems: 'center', paddingHorizontal: 16 },
  noCommentsText: { fontSize: 14 },
  replyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  replyIndicatorText: { flex: 1, fontSize: 12 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  commentInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
});
