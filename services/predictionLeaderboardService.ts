// services/predictionLeaderboardService.ts
// Handles scoring predictions against match results and building leaderboards

import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  setDoc,
  updateDoc,
  where,
  orderBy,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface LeaderboardEntry {
  userId: string;
  username: string;
  photoURL?: string;
  totalPoints: number;
  totalPredictions: number;
  correctPredictions: number;
  weeklyPoints: number;
  weeklyPredictions: number;
  weeklyCorrect: number;
  accuracy: number; // 0-100
  streak: number;
  rank?: number;
}

export interface PredictionRecord {
  userId: string;
  matchId: string;
  prediction: 'home' | 'draw' | 'away';
  result?: 'home' | 'draw' | 'away' | null; // filled in when match finishes
  points?: number; // 3 = correct, 0 = wrong
  scoredAt?: string;
  createdAt?: string;
  updatedAt?: string;
  homeTeam?: string;
  awayTeam?: string;
  matchDate?: string;
}

// Determine result from final score
export const getMatchResult = (
  homeGoals: number,
  awayGoals: number
): 'home' | 'draw' | 'away' => {
  if (homeGoals > awayGoals) return 'home';
  if (awayGoals > homeGoals) return 'away';
  return 'draw';
};

// Get the current ISO week key e.g. "2024-W12"
export const getWeekKey = (date: Date = new Date()): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

/**
 * Score a finished match — called after a match ends.
 * Finds all predictions for the match and awards points.
 */
export const scoreMatchPredictions = async (
  matchId: string,
  homeGoals: number,
  awayGoals: number,
  homeTeam: string,
  awayTeam: string,
  matchDate: string
): Promise<void> => {
  try {
    const result = getMatchResult(homeGoals, awayGoals);
    const weekKey = getWeekKey(new Date(matchDate));

    // Get all predictions for this match
    const predsSnap = await getDocs(
      query(collection(db, 'matchPredictions'), where('matchId', '==', matchId))
    );

    if (predsSnap.empty) return;

    const batch = writeBatch(db);

    for (const predDoc of predsSnap.docs) {
      const data = predDoc.data() as PredictionRecord;

      // Skip already scored
      if (data.scoredAt) continue;

      const correct = data.prediction === result;
      const points = correct ? 3 : 0;

      // Update the prediction doc with result
      batch.update(predDoc.ref, {
        result,
        points,
        scoredAt: new Date().toISOString(),
        homeTeam,
        awayTeam,
        matchDate,
      });

      // Update user leaderboard stats
      const leaderboardRef = doc(db, 'predictionLeaderboard', data.userId);
      const weeklyRef = doc(db, 'predictionLeaderboardWeekly', `${data.userId}_${weekKey}`);

      // All-time stats
      batch.set(
        leaderboardRef,
        {
          userId: data.userId,
          totalPoints: increment(points),
          totalPredictions: increment(1),
          correctPredictions: increment(correct ? 1 : 0),
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );

      // Weekly stats
      batch.set(
        weeklyRef,
        {
          userId: data.userId,
          weekKey,
          weeklyPoints: increment(points),
          weeklyPredictions: increment(1),
          weeklyCorrect: increment(correct ? 1 : 0),
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    await batch.commit();
  } catch (error) {
    console.error('Error scoring match predictions:', error);
  }
};

/**
 * Get top N all-time leaderboard entries with usernames
 */
export const getAllTimeLeaderboard = async (topN: number = 50): Promise<LeaderboardEntry[]> => {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'predictionLeaderboard'),
        orderBy('totalPoints', 'desc'),
        limit(topN)
      )
    );

    const entries: LeaderboardEntry[] = [];
    let rank = 1;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      // Fetch username from users collection
      const userSnap = await getDoc(doc(db, 'users', data.userId));
      const username = (userSnap.data() as { username?: string } | undefined)?.username ?? 'Unknown';
      const photoURL = (userSnap.data() as { photoURL?: string } | undefined)?.photoURL;

      const total = data.totalPredictions ?? 0;
      entries.push({
        userId: data.userId,
        username,
        photoURL,
        totalPoints: data.totalPoints ?? 0,
        totalPredictions: total,
        correctPredictions: data.correctPredictions ?? 0,
        weeklyPoints: 0,
        weeklyPredictions: 0,
        weeklyCorrect: 0,
        accuracy: total > 0 ? Math.round(((data.correctPredictions ?? 0) / total) * 100) : 0,
        streak: data.streak ?? 0,
        rank: rank++,
      });
    }

    return entries;
  } catch (error) {
    console.error('Error fetching all-time leaderboard:', error);
    return [];
  }
};

/**
 * Get top N weekly leaderboard entries for the current week
 */
export const getWeeklyLeaderboard = async (topN: number = 50): Promise<LeaderboardEntry[]> => {
  try {
    const weekKey = getWeekKey();

    const snap = await getDocs(
      query(
        collection(db, 'predictionLeaderboardWeekly'),
        where('weekKey', '==', weekKey),
        orderBy('weeklyPoints', 'desc'),
        limit(topN)
      )
    );

    const entries: LeaderboardEntry[] = [];
    let rank = 1;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const userSnap = await getDoc(doc(db, 'users', data.userId));
      const username = (userSnap.data() as { username?: string } | undefined)?.username ?? 'Unknown';
      const photoURL = (userSnap.data() as { photoURL?: string } | undefined)?.photoURL;

      const total = data.weeklyPredictions ?? 0;
      entries.push({
        userId: data.userId,
        username,
        photoURL,
        totalPoints: 0,
        totalPredictions: 0,
        correctPredictions: 0,
        weeklyPoints: data.weeklyPoints ?? 0,
        weeklyPredictions: total,
        weeklyCorrect: data.weeklyCorrect ?? 0,
        accuracy: total > 0 ? Math.round(((data.weeklyCorrect ?? 0) / total) * 100) : 0,
        streak: 0,
        rank: rank++,
      });
    }

    return entries;
  } catch (error) {
    console.error('Error fetching weekly leaderboard:', error);
    return [];
  }
};

/**
 * Get a single user's stats and rank
 */
export const getUserPredictionStats = async (
  userId: string
): Promise<{ allTime: Partial<LeaderboardEntry>; weekly: Partial<LeaderboardEntry> }> => {
  try {
    const weekKey = getWeekKey();

    const [allTimeSnap, weeklySnap] = await Promise.all([
      getDoc(doc(db, 'predictionLeaderboard', userId)),
      getDoc(doc(db, 'predictionLeaderboardWeekly', `${userId}_${weekKey}`)),
    ]);

    const allTimeData = allTimeSnap.data() ?? {};
    const weeklyData = weeklySnap.data() ?? {};

    const allTimeTotal = allTimeData.totalPredictions ?? 0;
    const weeklyTotal = weeklyData.weeklyPredictions ?? 0;

    return {
      allTime: {
        totalPoints: allTimeData.totalPoints ?? 0,
        totalPredictions: allTimeTotal,
        correctPredictions: allTimeData.correctPredictions ?? 0,
        accuracy: allTimeTotal > 0
          ? Math.round(((allTimeData.correctPredictions ?? 0) / allTimeTotal) * 100)
          : 0,
      },
      weekly: {
        weeklyPoints: weeklyData.weeklyPoints ?? 0,
        weeklyPredictions: weeklyTotal,
        weeklyCorrect: weeklyData.weeklyCorrect ?? 0,
        accuracy: weeklyTotal > 0
          ? Math.round(((weeklyData.weeklyCorrect ?? 0) / weeklyTotal) * 100)
          : 0,
      },
    };
  } catch (error) {
    console.error('Error fetching user prediction stats:', error);
    return { allTime: {}, weekly: {} };
  }
};

/**
 * Get a user's prediction history (last N predictions)
 */
export const getUserPredictionHistory = async (
  userId: string,
  limitCount: number = 20
): Promise<PredictionRecord[]> => {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'matchPredictions'),
        where('userId', '==', userId),
        orderBy('updatedAt', 'desc'),
        limit(limitCount)
      )
    );
    return snap.docs.map((d) => d.data() as PredictionRecord);
  } catch (error) {
    console.error('Error fetching prediction history:', error);
    return [];
  }
};
