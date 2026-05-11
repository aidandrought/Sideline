// types/fantasy.ts
// Canonical Firestore document shapes for the fantasy system.

import { Timestamp } from 'firebase/firestore';

// ─── User (/users/{uid}) ──────────────────────────────────────────────────────

export interface User {
  uid: string;
  username: string;
  email: string;
  phone?: string;
  photoURL?: string;
  teams: string[];
  xp: number;
  predictionStreak: number;
  followedTeams: string[];
  followedLeagues: string[];
  fcmTokens?: string[];
  onboardingCompleted?: boolean;
  createdAt: string;
}

// ─── Core enums ───────────────────────────────────────────────────────────────

export type PlayerPosition = 'GK' | 'DEF' | 'MID' | 'FWD';
export type LeagueTier = 'system' | 'community' | 'private';
export type LeagueVisibility = 'public' | 'friends' | 'secret';
export type LeagueFormat = 'overall' | 'h2h';
export type GameweekStructure = 'weekly' | 'matchday';
export type GameweekStatus = 'upcoming' | 'locked' | 'live' | 'partial' | 'finalized';

export type Formation =
  | '4-3-3'
  | '4-4-2'
  | '3-5-2'
  | '3-4-3'
  | '5-3-2'
  | '4-5-1'
  | '4-2-3-1'
  | '3-6-1';

// Legacy type kept for backward compat
export type LeagueType = 'global' | 'friends' | 'cl' | 'worldcup';

// ─── Rules & config ───────────────────────────────────────────────────────────

export interface RulesConfig {
  competitionPool: number[];
  salaryCap: number | null;
  maxPerClub: number;
  squadSize: number;
  positionRequirements: {
    GK: [number, number];
    DEF: [number, number];
    MID: [number, number];
    FWD: [number, number];
  };
  tournamentBonus: boolean;
  chipsEnabled: {
    wildcard: boolean;
    benchBoost: boolean;
    tripleCaptain: boolean;
    freeHit: boolean;
  };
  gameweekStructure: GameweekStructure;
  format: LeagueFormat;
}

export interface ScoringRules {
  captainMultiplier: number;
  viceCaptainMultiplier: number;
  transferPenalty: number;
  freeTransfersPerGW: number;
}

export const DEFAULT_RULES_CONFIG: RulesConfig = {
  competitionPool: [39],
  salaryCap: 100,
  maxPerClub: 3,
  squadSize: 15,
  positionRequirements: { GK: [1, 1], DEF: [3, 5], MID: [3, 5], FWD: [1, 3] },
  tournamentBonus: false,
  chipsEnabled: { wildcard: true, benchBoost: true, tripleCaptain: true, freeHit: false },
  gameweekStructure: 'weekly',
  format: 'overall',
};

export const TOURNAMENT_RULES_CONFIG: RulesConfig = {
  ...DEFAULT_RULES_CONFIG,
  tournamentBonus: true,
  gameweekStructure: 'matchday',
};

// ─── FantasyLeague (/fantasyLeagues/{id}) ─────────────────────────────────────

export interface FantasyLeague {
  id: string;
  tier: LeagueTier;
  name: string;
  description?: string;
  competitionId?: number;
  competitionPool: number[];
  visibility: LeagueVisibility;
  format: LeagueFormat;
  inviteCode?: string;
  createdBy: string;
  createdAt: Timestamp | string;
  memberCount: number;
  maxMembers: number | null;
  rulesConfig: RulesConfig;
  currentGameweek: number;
  status: 'pre_season' | 'active' | 'finished';
  iconUrl?: string;
  searchableName?: string;
  // Legacy fields kept for backward compat
  type?: LeagueType;
  ownerId?: string;
  ownerUsername?: string;
  isPrivate?: boolean;
  members?: string[];
  standings?: Record<string, Standing>;
  season?: string;
  emoji?: string;
  scoringRules?: ScoringRules;
  competition?: string;
  updatedAt?: Timestamp | string;
}

export interface SystemLeague {
  competitionId: number;
  apiSeason: number;
  fantasyLeagueId: string;
  rulesPreset: 'standard' | 'tournament';
  iconUrl: string;
  active: boolean;
}

// ─── FantasyLeagueMember (/fantasyLeagueMembers/{leagueId}_{uid}) ─────────────

export interface Standing {
  userId: string;
  username: string;
  teamName: string;
  totalPoints: number;
  gameweekPoints: number;
  rank: number;
  previousRank: number;
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
  joinedAt: Timestamp | string;
}

// ─── Gameweek (/gameweeks/{competitionGroup}_{n}) ─────────────────────────────

export interface Gameweek {
  competitionGroup: string;
  number: number;
  apiRoundLabel: string;
  firstFixtureKickoff: Timestamp;
  lastFixtureKickoff: Timestamp;
  deadline: Timestamp;
  status: GameweekStatus;
  fixtureIds: number[];
  apiSeason: number;
}

// ─── Team (/fantasyTeams/{teamId}) ───────────────────────────────────────────

export interface TeamPlayer {
  id: number;
  name: string;
  shortName: string;
  position: PlayerPosition;
  clubId: number;
  clubName: string;
  leagueId: number;
  price: number;
  totalPoints: number;
  gameweekPoints: number;
  photo?: string;
  injured?: boolean;
}

export interface Team {
  id: string;
  ownerId: string;
  competition: string;
  players: TeamPlayer[];
  formation: Formation;
  captainId: number;
  viceCaptainId: number;
  teamName: string;
  totalPoints: number;
  gameweekPoints: number;
  budgetRemaining: number;
  transfersRemaining: number;
  updatedAt: string;
}

// ─── SquadSnapshot (/gameweeks/{gw}/squadSnapshots/{teamId}) ─────────────────

export interface SquadSnapshotPlayer {
  playerId: string;
  isCaptain: boolean;
  isVice: boolean;
  multiplier: number;
}

export interface SquadSnapshotBenchPlayer {
  playerId: string;
  order: number;
}

export interface SquadSnapshot {
  teamId: string;
  userId: string;
  starters: SquadSnapshotPlayer[];
  bench: SquadSnapshotBenchPlayer[];
  formation: string;
  chipActive?: 'benchBoost' | 'tripleCaptain' | 'freeHit' | 'wildcard';
}

// ─── Chip (/chips/{userId}_{leagueId}) ───────────────────────────────────────

export interface Chip {
  userId: string;
  leagueId: string;
  wildcardUsedGw?: number;
  benchBoostUsedGw?: number;
  tripleCaptainUsedGw?: number;
  freeHitUsedGw?: number;
  activeChip?: 'wildcard' | 'benchBoost' | 'tripleCaptain' | 'freeHit';
}

// ─── InviteCodeIndex (/inviteCodes/{code}) ────────────────────────────────────

export interface InviteCodeIndex {
  code: string;
  leagueId: string;
  createdAt: Timestamp;
}

// ─── NotificationLimit (/notificationLimits/{userId}_{chatId}) ───────────────

export interface NotificationLimit {
  lastSentAt: Timestamp;
}

// ─── H2H (/fantasyLeagues/{id}/h2hFixtures/{gw}) ─────────────────────────────

export interface H2HPairing {
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  winner?: string | 'draw';
}

// ─── PlayerCache (/players/{competitionId}_{playerId}) ───────────────────────

export interface PlayerCache {
  id: number;
  name: string;
  shortName: string;
  position: PlayerPosition;
  club: string;
  clubId: number;
  clubLogo?: string;
  competition: string;
  competitionId: number;
  currentPrice: number;
  totalPoints: number;
  photo?: string;
  photoThumbUrl?: string;
  injured?: boolean;
  injuryStatus?: 'doubtful' | 'out' | null;
  form: number;
  searchKey: string;
  cachedAt: number;
  _stats?: {
    appearances: number;
    goals: number;
    assists: number;
    minutesPerGame: number;
  };
}

// ─── Competition catalog ──────────────────────────────────────────────────────

export interface CompetitionEntry {
  key: string;
  id: number | null;
  name: string;
  group: 'tournament' | 'continental' | 'league';
  emoji: string;
}

export const COMPETITION_CATALOG: CompetitionEntry[] = [
  { key: 'WC',   id: 1,    name: 'World Cup',             group: 'tournament',  emoji: '🌍' },
  { key: 'EURO', id: null, name: 'Euro Championship',     group: 'tournament',  emoji: '🏆' },
  { key: 'COPA', id: null, name: 'Copa America',          group: 'tournament',  emoji: '🏆' },
  { key: 'UCL',  id: 2,    name: 'UEFA Champions League', group: 'continental', emoji: '⭐' },
  { key: 'EL',   id: 3,    name: 'UEFA Europa League',    group: 'continental', emoji: '🟠' },
  { key: 'ECL',  id: 4,    name: 'Conference League',     group: 'continental', emoji: '🟢' },
  { key: 'PL',   id: 39,   name: 'Premier League',        group: 'league',      emoji: '🦁' },
  { key: 'LL',   id: 140,  name: 'La Liga',               group: 'league',      emoji: '🇪🇸' },
  { key: 'BL',   id: 78,   name: 'Bundesliga',            group: 'league',      emoji: '🦅' },
  { key: 'SA',   id: 135,  name: 'Serie A',               group: 'league',      emoji: '🇮🇹' },
  { key: 'L1',   id: 61,   name: 'Ligue 1',               group: 'league',      emoji: '🇫🇷' },
  { key: 'MLS',  id: 253,  name: 'MLS',                   group: 'league',      emoji: '🇺🇸' },
];

export const POOL_LEAGUE_IDS = [39, 140, 78, 135, 61, 2, 3, 253];
