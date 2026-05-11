// services/fantasyService.ts
// Cross-league fantasy football — Firestore-efficient design
// Free: 1 team, 2 leagues | Pro: unlimited teams, unlimited leagues

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── Constants ───────────────────────────────────────────────────────────────

export const FREE_TEAM_LIMIT = 1;
export const FREE_LEAGUE_LIMIT = 2;
export const PRO_MONTHLY_PRICE = '$2.99';
export const PRO_ANNUAL_PRICE = '$19.99';
export const PRO_ANNUAL_SAVINGS = 'Save 44%';

export const SQUAD_SIZE = 16;
export const STARTING_XI = 11;
export const BUDGET_MILLIONS = 100; // £100m starting budget

// Points scoring system — matches server-side scoring.ts exactly
export const SCORING = {
  appearance: 1,
  appearance_60: 2,
  goal_fw: 6,   // per spec: FWD=6pts
  goal_mf: 6,   // per spec: MID=6pts
  goal_df: 6,   // DEF=6pts
  goal_gk: 10,  // GK=10pts
  assist: 3,
  clean_sheet_df: 4,
  clean_sheet_gk: 4,
  clean_sheet_mf: 1,
  saves_3: 1,          // per 3 saves
  penalty_saved: 5,
  penalty_missed: -2,
  yellow_card: -1,
  red_card: -3,
  own_goal: -2,
  bonus: 1,            // per bonus point (top performers)
};

// Special league types
export const LEAGUE_TYPES = {
  GLOBAL: 'global',         // public global league per competition
  FRIENDS: 'friends',       // private invite-only
  CHAMPIONS_LEAGUE: 'cl',   // special CL-only fantasy
  WORLD_CUP: 'worldcup',    // special WC fantasy (when active)
} as const;

export type LeagueType = typeof LEAGUE_TYPES[keyof typeof LEAGUE_TYPES];

export const SPECIAL_LEAGUES = [
  { id: 'cl', name: 'Champions League Fantasy', competitionId: 2, emoji: '⭐', active: true },
  { id: 'worldcup', name: 'World Cup Fantasy', competitionId: 1, emoji: '🌍', active: false },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlayerPosition = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface FantasyPlayer {
  id: number;
  name: string;
  shortName: string;
  position: PlayerPosition;
  clubId: number;
  clubName: string;
  clubLogo?: string;
  leagueId: number;
  price: number;         // in millions e.g. 9.5
  totalPoints: number;
  gameweekPoints: number;
  photo?: string;
  injured?: boolean;
  form: number;          // avg pts last 5 gws
}

export interface FantasyTeam {
  id: string;            // userId_leagueId
  userId: string;
  leagueId: string;
  teamName: string;
  players: FantasyPlayer[];   // 15 players stored inline
  captain: number;       // player id (2× points)
  viceCaptain: number;   // player id (1.5× points)
  formation: string;     // e.g. "4-3-3"
  totalPoints: number;
  gameweekPoints: number;
  budgetRemaining: number;
  transfersRemaining: number;
  transfersUsed: number;
  updatedAt: string;
}

export interface FantasyLeague {
  id: string;
  name: string;
  type: LeagueType;
  competitionId?: number;
  competitionName?: string;
  inviteCode?: string;    // 6-char, friends leagues only
  ownerId?: string;
  ownerUsername?: string;
  isPrivate: boolean;
  memberCount: number;
  /** Flat member uid list for quick membership checks */
  members: string[];
  currentGameweek: number;
  season: string;
  emoji?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FantasyLeagueMember {
  leagueId: string;
  userId: string;
  username: string;
  teamName: string;
  totalPoints: number;
  lastGameweekPoints: number;
  rank: number;
  previousRank: number;
  joinedAt: string;
}

export interface FantasyGameweek {
  number: number;
  deadline: string;
  status: 'upcoming' | 'active' | 'scoring' | 'complete';
  playerScores?: Record<number, number>;  // playerId → points
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLAYER_CACHE_KEY = (competitionId: number) => `fantasy:players:${competitionId}:v1`;
const PLAYER_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 1 week

const generateInviteCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const getCurrentSeason = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 7 ? `${year}` : `${year - 1}`;
};

// ─── Player Pool ─────────────────────────────────────────────────────────────

/**
 * Read players for a competition from the Firestore `players` collection
 * (seeded by scripts/seedPlayers.js).  Falls back gracefully to an empty
 * array if the collection hasn't been seeded yet.
 *
 * Results are cached locally for PLAYER_CACHE_TTL (1 week) so the app
 * only hits Firestore once per device per week.
 */
export const getPlayerPool = async (
  competitionId: number,
): Promise<FantasyPlayer[]> => {
  const cacheKey = PLAYER_CACHE_KEY(competitionId);

  // 1. Try local cache first
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const { data, updatedAt } = JSON.parse(raw) as { data: FantasyPlayer[]; updatedAt: number };
      if (Date.now() - updatedAt < PLAYER_CACHE_TTL) return data;
    }
  } catch { /* ignore */ }

  // 2. Read from Firestore `players` collection
  try {
    const snap = await getDocs(
      query(
        collection(db, 'players'),
        where('competitionId', '==', competitionId),
      )
    );

    const players: FantasyPlayer[] = snap.docs.map((d) => {
      const p = d.data() as any;
      return {
        id:            p.id            ?? 0,
        name:          p.name          ?? 'Unknown',
        shortName:     p.shortName     ?? (p.name ?? 'Unknown').split(' ').pop() ?? 'Unknown',
        position:      p.position      ?? 'MID',
        clubId:        p.clubId        ?? 0,
        clubName:      p.club          ?? '',
        clubLogo:      p.clubLogo      ?? undefined,
        leagueId:      p.competitionId ?? competitionId,
        price:         p.currentPrice  ?? 5.0,
        totalPoints:   p.totalPoints   ?? 0,
        gameweekPoints: 0,
        photo:         p.photo         ?? undefined,
        injured:       p.injured       ?? false,
        form:          parseFloat(((p.totalPoints ?? 0) / Math.max(p._stats?.appearances ?? 1, 1)).toFixed(1)),
      } as FantasyPlayer;
    });

    await AsyncStorage.setItem(cacheKey, JSON.stringify({ data: players, updatedAt: Date.now() }));
    return players;
  } catch (error) {
    console.error('Error fetching player pool from Firestore:', error);
    return [];
  }
};

// ─── Team Operations ──────────────────────────────────────────────────────────

export const getMyTeam = async (userId: string, leagueId: string): Promise<FantasyTeam | null> => {
  try {
    const snap = await getDoc(doc(db, 'fantasyTeams', `${userId}_${leagueId}`));
    return snap.exists() ? (snap.data() as FantasyTeam) : null;
  } catch (error) {
    console.error('Error fetching fantasy team:', error);
    return null;
  }
};

export const saveTeam = async (team: Omit<FantasyTeam, 'updatedAt'>): Promise<void> => {
  const teamId = `${team.userId}_${team.leagueId}`;
  await setDoc(doc(db, 'fantasyTeams', teamId), {
    ...team,
    id: teamId,
    updatedAt: new Date().toISOString(),
  });
};

export const getUserTeamCount = async (userId: string): Promise<number> => {
  try {
    const snap = await getDocs(
      query(collection(db, 'fantasyTeams'), where('userId', '==', userId))
    );
    return snap.size;
  } catch { return 0; }
};

// ─── League Operations ────────────────────────────────────────────────────────

export const createLeague = async (params: {
  name: string;
  type: LeagueType;
  competitionId?: number;
  competitionName?: string;
  ownerId: string;
  ownerUsername: string;
  isPrivate: boolean;
  emoji?: string;
}): Promise<FantasyLeague> => {
  const id = `${params.ownerId}_${Date.now()}`;
  const inviteCode = params.isPrivate ? generateInviteCode() : undefined;
  const now = new Date().toISOString();
  const league: FantasyLeague = {
    id,
    name: params.name,
    type: params.type,
    competitionId: params.competitionId,
    competitionName: params.competitionName,
    inviteCode,
    ownerId: params.ownerId,
    ownerUsername: params.ownerUsername,
    isPrivate: params.isPrivate,
    memberCount: 0,
    members: [],
    currentGameweek: 1,
    season: getCurrentSeason(),
    emoji: params.emoji ?? '⚽',
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'fantasyLeagues', id), league);
  // Auto-join creator
  await joinLeague(id, params.ownerId, params.ownerUsername, `${params.ownerUsername}'s Team`);
  return league;
};

export const joinLeagueByCode = async (
  inviteCode: string,
  userId: string,
  username: string
): Promise<FantasyLeague | null> => {
  try {
    const snap = await getDocs(
      query(collection(db, 'fantasyLeagues'), where('inviteCode', '==', inviteCode.toUpperCase()), limit(1))
    );
    if (snap.empty) return null;
    const league = snap.docs[0].data() as FantasyLeague;
    await joinLeague(league.id, userId, username, `${username}'s Team`);
    return league;
  } catch (error) {
    console.error('Error joining league by code:', error);
    return null;
  }
};

export const joinLeague = async (
  leagueId: string,
  userId: string,
  username: string,
  teamName: string
): Promise<void> => {
  const batch = writeBatch(db);
  batch.set(doc(db, 'fantasyLeagueMembers', `${leagueId}_${userId}`), {
    leagueId,
    userId,
    username,
    teamName,
    totalPoints: 0,
    lastGameweekPoints: 0,
    rank: 0,
    previousRank: 0,
    joinedAt: new Date().toISOString(),
  } as FantasyLeagueMember);
  batch.set(doc(db, 'fantasyLeagues', leagueId), {
    memberCount: increment(1),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  await batch.commit();
};

export const leaveLeague = async (leagueId: string, userId: string): Promise<void> => {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'fantasyLeagueMembers', `${leagueId}_${userId}`));
  batch.delete(doc(db, 'fantasyTeams', `${userId}_${leagueId}`));
  batch.update(doc(db, 'fantasyLeagues', leagueId), {
    memberCount: increment(-1),
    updatedAt: new Date().toISOString(),
  });
  await batch.commit();
};

export const getUserLeagues = async (userId: string): Promise<FantasyLeague[]> => {
  try {
    const memberSnap = await getDocs(
      query(collection(db, 'fantasyLeagueMembers'), where('userId', '==', userId))
    );
    if (memberSnap.empty) return [];
    const leagueIds = memberSnap.docs.map((d) => d.data().leagueId as string);
    const leagues: FantasyLeague[] = [];
    // Fetch in batches of 10 (Firestore limit for 'in' queries)
    for (let i = 0; i < leagueIds.length; i += 10) {
      const batch = leagueIds.slice(i, i + 10);
      const snap = await getDocs(
        query(collection(db, 'fantasyLeagues'), where('__name__', 'in', batch))
      );
      snap.docs.forEach((d) => leagues.push(d.data() as FantasyLeague));
    }
    return leagues;
  } catch (error) {
    console.error('Error fetching user leagues:', error);
    return [];
  }
};

export const getLeagueStandings = async (
  leagueId: string,
  topN: number = 50
): Promise<FantasyLeagueMember[]> => {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'fantasyLeagueMembers'),
        where('leagueId', '==', leagueId),
        orderBy('totalPoints', 'desc'),
        limit(topN)
      )
    );
    return snap.docs.map((d, idx) => ({ ...d.data(), rank: idx + 1 } as FantasyLeagueMember));
  } catch (error) {
    console.error('Error fetching standings:', error);
    return [];
  }
};

export const getPublicGlobalLeagues = async (): Promise<FantasyLeague[]> => {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'fantasyLeagues'),
        where('isPrivate', '==', false),
        orderBy('memberCount', 'desc'),
        limit(20)
      )
    );
    return snap.docs.map((d) => d.data() as FantasyLeague);
  } catch (error) {
    console.error('Error fetching public leagues:', error);
    return [];
  }
};

// ─── Scoring (client-side, called after gameweek ends) ───────────────────────

export const scorePlayerGameweek = (
  player: FantasyPlayer,
  stats: {
    appeared: boolean;
    minutesPlayed?: number;
    goals: number;
    assists: number;
    cleanSheet: boolean;
    yellowCards: number;
    redCards: number;
    saves: number;
    penaltySaved: boolean;
    penaltyMissed: boolean;
    ownGoals: number;
    bonusPoints: number;
  }
): number => {
  let pts = 0;
  if (!stats.appeared) return 0;
  pts += (stats.minutesPlayed ?? 0) >= 60 ? SCORING.appearance_60 : SCORING.appearance;
  const goalPts = player.position === 'GK' || player.position === 'DEF'
    ? SCORING.goal_df
    : player.position === 'MID' ? SCORING.goal_mf : SCORING.goal_fw;
  pts += stats.goals * goalPts;
  pts += stats.assists * SCORING.assist;
  if (stats.cleanSheet) {
    if (player.position === 'GK' || player.position === 'DEF') pts += SCORING.clean_sheet_gk;
    if (player.position === 'MID') pts += SCORING.clean_sheet_mf;
  }
  pts += Math.floor(stats.saves / 3) * SCORING.saves_3;
  if (stats.penaltySaved) pts += SCORING.penalty_saved;
  if (stats.penaltyMissed) pts += SCORING.penalty_missed;
  pts += stats.yellowCards * SCORING.yellow_card;
  pts += stats.redCards * SCORING.red_card;
  pts += stats.ownGoals * SCORING.own_goal;
  pts += stats.bonusPoints * SCORING.bonus;
  return pts;
};

export const computeTeamGameweekScore = (
  team: FantasyTeam,
  playerScores: Record<number, number>
): number => {
  // Only starting 11 score (sorted by position: GK, DEF, MID, FWD)
  const posOrder: Record<PlayerPosition, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const sorted = [...team.players].sort((a, b) => posOrder[a.position] - posOrder[b.position]);
  const starters = sorted.slice(0, STARTING_XI);

  let total = 0;
  for (const player of starters) {
    const pts = playerScores[player.id] ?? 0;
    const isCaptain = player.id === team.captain;
    const isViceCaptain = player.id === team.viceCaptain;
    total += isCaptain ? pts * 2 : isViceCaptain ? Math.round(pts * 1.5) : pts;
  }
  return total;
};

// ─── Pro subscription helpers (UI only — RevenueCat wired in future) ─────────

export const canCreateTeam = (currentTeamCount: number, isPro: boolean): boolean => {
  if (isPro) return true;
  return currentTeamCount < FREE_TEAM_LIMIT;
};

export const canJoinLeague = (currentLeagueCount: number, isPro: boolean): boolean => {
  if (isPro) return true;
  return currentLeagueCount < FREE_LEAGUE_LIMIT;
};

export const getUpgradeReason = (context: 'team' | 'league'): string => {
  if (context === 'team') return `Free plan includes ${FREE_TEAM_LIMIT} team. Go Pro for unlimited teams.`;
  return `Free plan includes ${FREE_LEAGUE_LIMIT} leagues. Go Pro to join unlimited leagues.`;
};
