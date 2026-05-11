// services/communityPostsService.ts
// Community posts and comments — Reddit-style, Firestore-efficient
// Design: flat comments (no nesting), likes as counter, paginated feed

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export const POST_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CommunityPost {
  id: string;
  communityId: string;          // numeric id as string (e.g. "39" for PL)
  communityType: 'team' | 'league' | 'worldcup';
  communityName: string;
  userId: string;
  username: string;
  title: string;
  body: string;
  likesCount: number;
  commentCount: number;
  createdAt: string;            // ISO string
  likedBy?: string[];           // NOT stored in main doc — fetched separately
}

export interface CommunityComment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  text: string;
  likesCount: number;
  createdAt: string;
}

const PAGE_SIZE = 20;

const isPermissionDenied = (error: unknown) =>
  String((error as { code?: unknown } | null)?.code || '').includes('permission-denied') ||
  String((error as { message?: unknown } | null)?.message || '').toLowerCase().includes('permission');

// ─── Posts ────────────────────────────────────────────────────────────────────

export const createPost = async (params: {
  communityId: string;
  communityType: CommunityPost['communityType'];
  communityName: string;
  userId: string;
  username: string;
  title: string;
  body: string;
}): Promise<CommunityPost> => {
  const ref = await addDoc(collection(db, 'communityPosts'), {
    communityId: params.communityId,
    communityType: params.communityType,
    communityName: params.communityName,
    userId: params.userId,
    username: params.username,
    title: params.title.trim(),
    body: params.body.trim(),
    likesCount: 0,
    commentCount: 0,
    createdAt: new Date().toISOString(),
  });
  return { id: ref.id, ...params, likesCount: 0, commentCount: 0, createdAt: new Date().toISOString() };
};

export const deletePost = async (postId: string): Promise<void> => {
  await deleteDoc(doc(db, 'communityPosts', postId));
};

/** Paginated post feed for a single community */
export const getCommunityPosts = async (
  communityId: string,
  afterDoc?: DocumentSnapshot
): Promise<{ posts: CommunityPost[]; lastDoc: DocumentSnapshot | null }> => {
  try {
    const constraints: any[] = [
      where('communityId', '==', communityId),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ];
    if (afterDoc) constraints.push(startAfter(afterDoc));
    const snap = await getDocs(query(collection(db, 'communityPosts'), ...constraints));
    const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityPost));
    return { posts, lastDoc: snap.docs[snap.docs.length - 1] ?? null };
  } catch (error) {
    if (!isPermissionDenied(error)) {
      console.error('Error fetching community posts:', error);
    }
    return { posts: [], lastDoc: null };
  }
};

/** Real-time feed for a community (first page only) */
export const subscribeCommunityPosts = (
  communityId: string,
  onData: (posts: CommunityPost[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'communityPosts'),
    where('communityId', '==', communityId),
    orderBy('createdAt', 'desc'),
    limit(PAGE_SIZE)
  );
  return onSnapshot(q, (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityPost)));
  }, (err) => {
    if (!isPermissionDenied(err)) {
      console.error('[communityPosts] snapshot error:', err.code, err.message);
    }
    onData([]);
  });
};

/** Recent posts across multiple communities (followed communities feed) */
export const getRecentPostsForCommunities = async (
  communityIds: string[],
  maxPosts: number = 15
): Promise<CommunityPost[]> => {
  if (communityIds.length === 0) return [];
  try {
    // Firestore 'in' limit is 30; chunk if needed
    const chunks: string[][] = [];
    for (let i = 0; i < communityIds.length; i += 10) {
      chunks.push(communityIds.slice(i, i + 10));
    }
    const results = await Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(
            collection(db, 'communityPosts'),
            where('communityId', 'in', chunk),
            orderBy('createdAt', 'desc'),
            limit(maxPosts)
          )
        ).then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityPost)))
      )
    );
    return results
      .flat()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, maxPosts);
  } catch (error) {
    if (!isPermissionDenied(error)) {
      console.error('Error fetching community feed:', error);
    }
    return [];
  }
};

export const getPost = async (postId: string): Promise<CommunityPost | null> => {
  try {
    const snap = await getDoc(doc(db, 'communityPosts', postId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as CommunityPost) : null;
  } catch { return null; }
};

// ─── Likes ────────────────────────────────────────────────────────────────────

/** Toggle like on a post — stores a small like doc keyed by userId */
export const togglePostLike = async (
  postId: string,
  userId: string
): Promise<boolean> => {
  const likeRef = doc(db, 'communityPostLikes', `${postId}_${userId}`);
  const snap = await getDoc(likeRef);
  const batch = writeBatch(db);
  const postRef = doc(db, 'communityPosts', postId);
  if (snap.exists()) {
    batch.delete(likeRef);
    batch.update(postRef, { likesCount: increment(-1) });
    await batch.commit();
    return false; // unliked
  } else {
    batch.set(likeRef, { postId, userId, createdAt: new Date().toISOString() });
    batch.update(postRef, { likesCount: increment(1) });
    await batch.commit();
    return true; // liked
  }
};

export const checkPostLiked = async (postId: string, userId: string): Promise<boolean> => {
  try {
    const snap = await getDoc(doc(db, 'communityPostLikes', `${postId}_${userId}`));
    return snap.exists();
  } catch { return false; }
};

// ─── Comments ─────────────────────────────────────────────────────────────────

export const addComment = async (params: {
  postId: string;
  userId: string;
  username: string;
  text: string;
}): Promise<CommunityComment> => {
  const batch = writeBatch(db);
  const commentRef = doc(collection(db, 'communityPosts', params.postId, 'comments'));
  const comment: Omit<CommunityComment, 'id'> = {
    postId: params.postId,
    userId: params.userId,
    username: params.username,
    text: params.text.trim(),
    likesCount: 0,
    createdAt: new Date().toISOString(),
  };
  batch.set(commentRef, comment);
  batch.update(doc(db, 'communityPosts', params.postId), { commentCount: increment(1) });
  await batch.commit();
  return { id: commentRef.id, ...comment };
};

export const deleteComment = async (postId: string, commentId: string): Promise<void> => {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'communityPosts', postId, 'comments', commentId));
  batch.update(doc(db, 'communityPosts', postId), { commentCount: increment(-1) });
  await batch.commit();
};

export const subscribeComments = (
  postId: string,
  onData: (comments: CommunityComment[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'communityPosts', postId, 'comments'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityComment)));
  }, () => onData([]));
};

// ─── Popular Recent Posts ─────────────────────────────────────────────────────

/** Fetch recent posts (within 72h) sorted by comment count — for Popular Threads section */
export const getPopularRecentPosts = async (maxPosts: number = 20): Promise<CommunityPost[]> => {
  try {
    if (!auth.currentUser) return [];
    const cutoff = new Date(Date.now() - POST_TTL_MS).toISOString();
    const snap = await getDocs(
      query(
        collection(db, 'communityPosts'),
        where('createdAt', '>', cutoff),
        orderBy('createdAt', 'desc'),
        limit(50)
      )
    );
    const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommunityPost));
    return posts
      .sort((a, b) => (b.commentCount + b.likesCount) - (a.commentCount + a.likesCount))
      .slice(0, maxPosts);
  } catch (error) {
    if (!isPermissionDenied(error)) {
      console.error('Error fetching popular posts:', error);
    }
    return [];
  }
};

/** Search posts by title or community name within the last 72h */
export const searchRecentPosts = async (q: string, maxPosts: number = 30): Promise<CommunityPost[]> => {
  try {
    const cutoff = new Date(Date.now() - POST_TTL_MS).toISOString();
    const snap = await getDocs(
      query(
        collection(db, 'communityPosts'),
        where('createdAt', '>', cutoff),
        orderBy('createdAt', 'desc'),
        limit(100)
      )
    );
    const lower = q.toLowerCase().trim();
    const posts = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as CommunityPost))
      .filter(
        (p) =>
          p.title.toLowerCase().includes(lower) ||
          p.body.toLowerCase().includes(lower) ||
          p.communityName.toLowerCase().includes(lower) ||
          p.username.toLowerCase().includes(lower)
      );
    return posts
      .sort((a, b) => (b.commentCount + b.likesCount) - (a.commentCount + a.likesCount))
      .slice(0, maxPosts);
  } catch (error) {
    if (!isPermissionDenied(error)) {
      console.error('Error searching posts:', error);
    }
    return [];
  }
};

// ─── Flagging ─────────────────────────────────────────────────────────────────

export type FlagReason = 'spam' | 'hate_speech' | 'misinformation' | 'inappropriate' | 'other';

export const flagPost = async (postId: string, userId: string, reason: FlagReason): Promise<void> => {
  await setDoc(
    doc(db, 'communityPostFlags', `${postId}_${userId}`),
    { postId, userId, reason, createdAt: new Date().toISOString() },
    { merge: true }
  );
};

export const checkPostFlagged = async (postId: string, userId: string): Promise<boolean> => {
  try {
    const snap = await getDoc(doc(db, 'communityPostFlags', `${postId}_${userId}`));
    return snap.exists();
  } catch { return false; }
};

// ─── TTL Cleanup ──────────────────────────────────────────────────────────────

/** Delete posts older than 72h — call once per session from a screen load */
export const purgeExpiredPosts = async (): Promise<void> => {
  // Client users cannot safely delete arbitrary community posts under Firestore
  // rules. Expiry cleanup should run from an admin Cloud Function.
};
