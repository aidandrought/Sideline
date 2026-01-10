import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { off, onValue, push, ref, set } from 'firebase/database';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { realtimeDb } from '../../firebaseConfig';
import { newsAPI, NewsArticle } from '../../services/newsApi';

interface Comment {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  likes: number;
}

export default function NewsDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { userProfile } = useAuth();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    loadArticle();
    const unsubscribe = loadComments();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [id]);

  const loadArticle = async () => {
    try {
      const news = await newsAPI.getSoccerNews();
      const found = news.find(n => n.id === decodeURIComponent(id as string));
      if (found) setArticle(found);
    } catch (error) {
      console.error('Error loading article:', error);
    }
  };

  const loadComments = () => {
    const commentsRef = ref(realtimeDb, `newsComments/${id}`);

    onValue(commentsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const commentsList = Object.entries(data).map(([id, comment]: [string, any]) => ({
          id,
          ...comment
        }));
        commentsList.sort((a, b) => b.timestamp - a.timestamp);
        setComments(commentsList);
      } else {
        setComments([]);
      }
    });

    return () => off(commentsRef);
  };

  const postComment = async () => {
    if (!commentText.trim() || !userProfile) return;

    const commentsRef = ref(realtimeDb, `newsComments/${id}`);
    const newCommentRef = push(commentsRef);

    await set(newCommentRef, {
      userId: userProfile.uid,
      username: userProfile.username,
      text: commentText,
      timestamp: Date.now(),
      likes: 0
    });

    setCommentText('');
  };

  if (!article) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#000" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity>
          <Ionicons name="share-outline" size={28} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Article */}
        <View style={styles.article}>
          {article.imageUrl && (
            <View style={styles.articleImage}>
              <Ionicons name="image-outline" size={64} color="#8E8E93" />
            </View>
          )}

          <View style={styles.articleHeader}>
            <View>
              <Text style={styles.source}>{article.source}</Text>
              {article.author && (
                <Text style={styles.author}>By {article.author}</Text>
              )}
            </View>
            <Text style={styles.date}>
              {new Date(article.publishedAt).toLocaleDateString()}
            </Text>
          </View>

          <Text style={styles.title}>{article.title}</Text>
          <Text style={styles.description}>{article.description}</Text>
          <Text style={styles.articleContent}>{article.content}</Text>
        </View>

        {/* Comments Section */}
        <View style={styles.commentsSection}>
          <Text style={styles.commentsTitle}>Discussion ({comments.length})</Text>

          {comments.length === 0 ? (
            <View style={styles.emptyComments}>
              <Ionicons name="chatbubbles-outline" size={48} color="#E5E7EB" />
              <Text style={styles.emptyCommentsText}>No comments yet</Text>
              <Text style={styles.emptyCommentsSubtext}>Be the first to share your thoughts</Text>
            </View>
          ) : (
            comments.map(comment => (
              <View key={comment.id} style={styles.comment}>
                <View style={styles.commentHeader}>
                  <View style={styles.commentAvatar}>
                    <Text style={styles.commentAvatarText}>
                      {comment.username[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.commentInfo}>
                    <Text style={styles.commentUsername}>{comment.username}</Text>
                    <Text style={styles.commentTime}>
                      {new Date(comment.timestamp).toLocaleTimeString()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.commentText}>{comment.text}</Text>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Comment Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.commentInputContainer}
      >
        <TextInput
          style={styles.commentInput}
          placeholder="Share your thoughts..."
          value={commentText}
          onChangeText={setCommentText}
          multiline
          placeholderTextColor="#999"
        />
        <TouchableOpacity
          style={[styles.sendButton, !commentText.trim() && styles.sendButtonDisabled]}
          onPress={postComment}
          disabled={!commentText.trim()}
        >
          <Ionicons name="send" size={20} color={commentText.trim() ? "#0066CC" : "#999"} />
        </TouchableOpacity>
      </KeyboardAvoidingView>
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
  },
  content: {
    flex: 1,
  },
  article: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 15,
  },
  articleImage: {
    width: '100%',
    height: 250,
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  articleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  source: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0066CC',
  },
  author: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  date: {
    fontSize: 13,
    color: '#999',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    marginBottom: 15,
    lineHeight: 32,
  },
  description: {
    fontSize: 17,
    color: '#666',
    lineHeight: 26,
    marginBottom: 15,
  },
  articleContent: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  commentsSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  commentsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 20,
  },
  emptyComments: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyCommentsText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#999',
    marginTop: 15,
  },
  emptyCommentsSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 6,
  },
  comment: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F7',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  commentAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  commentInfo: {},
  commentUsername: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  commentTime: {
    fontSize: 12,
    color: '#999',
  },
  commentText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 10,
  },
  commentActions: {
    flexDirection: 'row',
    gap: 20,
  },
  commentAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commentActionText: {
    fontSize: 14,
    color: '#666',
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#F5F5F7',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    color: '#000',
    maxHeight: 100,
    marginRight: 10,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
  },
});