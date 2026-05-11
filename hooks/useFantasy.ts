// hooks/useFantasy.ts
// TanStack Query wrappers and Zustand stores for fantasy system

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../config/firebase';
import type {
  Chip,
  FantasyLeague,
  FantasyLeagueMember,
  Gameweek,
} from '../types/fantasy';
import type { FantasyTeam, FantasyPlayer } from '../services/fantasyService';
import { getPlayerPool } from '../services/fantasyService';
import { create } from 'zustand';

// ─── Helper ───────────────────────────────────────────────────────────────────

function useFirestoreQuery<T>(
  queryFn: () => Promise<T>,
  deps: unknown[],
  staleMs = 30_000,
): { data: T | null; loading: boolean; error: Error | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastFetch, setLastFetch] = useState(0);

  const fetch = async () => {
    if (Date.now() - lastFetch < staleMs && data !== null) return;
    setLoading(true);
    try {
      const result = await queryFn();
      setData(result);
      setLastFetch(Date.now());
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: fetch };
}

// ─── useMyTeams ───────────────────────────────────────────────────────────────

export function useMyTeams(userId: string | undefined) {
  return useFirestoreQuery<FantasyTeam[]>(
    async () => {
      if (!userId) return [];
      const snap = await getDocs(
        query(collection(db, 'fantasyTeams'), where('userId', '==', userId))
      );
      return snap.docs.map((d) => d.data() as FantasyTeam);
    },
    [userId],
    30_000,
  );
}

// ─── useMyLeagues ─────────────────────────────────────────────────────────────

export function useMyLeagues(userId: string | undefined) {
  return useFirestoreQuery<Array<{ league: FantasyLeague; member: FantasyLeagueMember }>>(
    async () => {
      if (!userId) return [];
      const memberSnap = await getDocs(
        query(collection(db, 'fantasyLeagueMembers'), where('userId', '==', userId))
      );
      if (memberSnap.empty) return [];
      const leagueIds = memberSnap.docs.map((d) => d.data().leagueId as string);
      const leagues: FantasyLeague[] = [];
      for (let i = 0; i < leagueIds.length; i += 10) {
        const chunk = leagueIds.slice(i, i + 10);
        const snap = await getDocs(
          query(collection(db, 'fantasyLeagues'), where('__name__', 'in', chunk))
        );
        snap.docs.forEach((d) => leagues.push(d.data() as FantasyLeague));
      }
      return memberSnap.docs.map((d) => {
        const member = d.data() as FantasyLeagueMember;
        const league = leagues.find((l) => l.id === member.leagueId);
        return league ? { league, member } : null;
      }).filter((x): x is { league: FantasyLeague; member: FantasyLeagueMember } => x !== null);
    },
    [userId],
    30_000,
  );
}

// ─── usePlayerPool ────────────────────────────────────────────────────────────

export interface PlayerFilters {
  position?: 'GK' | 'DEF' | 'MID' | 'FWD' | 'ALL';
  maxPrice?: number;
  clubId?: number;
  search?: string;
  sortBy?: 'points' | 'price' | 'form' | 'name';
}

export function usePlayerPool(competitionIds: number[], filters?: PlayerFilters) {
  const [allPlayers, setAllPlayers] = useState<FantasyPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (competitionIds.length === 0) { setLoading(false); return; }
    setLoading(true);
    Promise.all(competitionIds.map((id) => getPlayerPool(id)))
      .then((pools) => {
        const merged = new Map<number, FantasyPlayer>();
        for (const pool of pools) {
          for (const p of pool) {
            if (!merged.has(p.id)) merged.set(p.id, p);
          }
        }
        setAllPlayers(Array.from(merged.values()).sort((a, b) => b.totalPoints - a.totalPoints));
        setError(null);
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [competitionIds.join(',')]);

  const filtered = allPlayers
    .filter((p) => !filters?.position || filters.position === 'ALL' || p.position === filters.position)
    .filter((p) => !filters?.maxPrice || p.price <= filters.maxPrice)
    .filter((p) => !filters?.clubId || p.clubId === filters.clubId)
    .filter((p) => {
      if (!filters?.search) return true;
      const q = filters.search.toLowerCase();
      return `${p.name} ${p.clubName}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (filters?.sortBy) {
        case 'price': return b.price - a.price;
        case 'form': return b.form - a.form;
        case 'name': return a.name.localeCompare(b.name);
        default: return b.totalPoints - a.totalPoints;
      }
    });

  return { data: filtered, allPlayers, loading, error };
}

// ─── useLeagueStandings ───────────────────────────────────────────────────────

export function useLeagueStandings(leagueId: string | undefined, live = false) {
  const [standings, setStandings] = useState<FantasyLeagueMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!leagueId) { setLoading(false); return; }
    if (live) {
      const q = query(
        collection(db, 'fantasyLeagueMembers'),
        where('leagueId', '==', leagueId),
        orderBy('totalPoints', 'desc'),
        limit(100),
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          setStandings(snap.docs.map((d) => d.data() as FantasyLeagueMember));
          setLoading(false);
        },
        (e) => { setError(e); setLoading(false); },
      );
      return unsub;
    } else {
      getDocs(
        query(
          collection(db, 'fantasyLeagueMembers'),
          where('leagueId', '==', leagueId),
          orderBy('totalPoints', 'desc'),
          limit(100),
        )
      ).then((snap) => {
        setStandings(snap.docs.map((d) => d.data() as FantasyLeagueMember));
        setLoading(false);
      }).catch((e) => { setError(e); setLoading(false); });
    }
  }, [leagueId, live]);

  return { data: standings, loading, error };
}

// ─── useGameweek ──────────────────────────────────────────────────────────────

export function useGameweek(competitionGroup: string | undefined) {
  return useFirestoreQuery<Gameweek | null>(
    async () => {
      if (!competitionGroup) return null;
      // Find the active or next upcoming gameweek for this competition group
      const snap = await getDocs(
        query(
          collection(db, 'gameweeks'),
          where('competitionGroup', '==', competitionGroup),
          orderBy('deadline', 'asc'),
          limit(5),
        )
      );
      if (snap.empty) return null;
      const docs = snap.docs.map((d) => d.data() as Gameweek);
      // Prefer live → partial → locked → upcoming
      const priority = ['live', 'partial', 'locked', 'upcoming', 'finalized'] as const;
      for (const status of priority) {
        const found = docs.find((gw) => gw.status === status);
        if (found) return found;
      }
      return docs[0] ?? null;
    },
    [competitionGroup],
    30_000,
  );
}

// ─── useActiveGameweeks ───────────────────────────────────────────────────────

export function useActiveGameweeks() {
  return useFirestoreQuery<Gameweek[]>(
    async () => {
      const snap = await getDocs(
        query(
          collection(db, 'gameweeks'),
          where('status', 'in', ['upcoming', 'locked', 'live', 'partial']),
          orderBy('deadline', 'asc'),
          limit(20),
        )
      );
      return snap.docs.map((d) => d.data() as Gameweek);
    },
    [],
    30_000,
  );
}

// ─── useChips ─────────────────────────────────────────────────────────────────

export function useChips(userId: string | undefined, leagueId: string | undefined) {
  return useFirestoreQuery<Chip | null>(
    async () => {
      if (!userId || !leagueId) return null;
      const snap = await getDoc(doc(db, 'chips', `${userId}_${leagueId}`));
      return snap.exists() ? (snap.data() as Chip) : null;
    },
    [userId, leagueId],
    30_000,
  );
}

// ─── useSystemLeagues ─────────────────────────────────────────────────────────

export function useSystemLeagues() {
  return useFirestoreQuery<FantasyLeague[]>(
    async () => {
      const snap = await getDocs(
        query(
          collection(db, 'fantasyLeagues'),
          where('tier', '==', 'system'),
          orderBy('memberCount', 'desc'),
          limit(20),
        )
      );
      return snap.docs.map((d) => d.data() as FantasyLeague);
    },
    [],
    3_600_000, // static metadata — stale after 1 hour
  );
}

// ─── useWorldCupLeague ────────────────────────────────────────────────────────

export function useWorldCupLeague() {
  return useFirestoreQuery<FantasyLeague | null>(
    async () => {
      const sysSnap = await getDoc(doc(db, 'systemLeagues', '1'));
      if (!sysSnap.exists()) return null;
      const { fantasyLeagueId } = sysSnap.data() as { fantasyLeagueId: string };
      const leagueSnap = await getDoc(doc(db, 'fantasyLeagues', fantasyLeagueId));
      return leagueSnap.exists() ? (leagueSnap.data() as FantasyLeague) : null;
    },
    [],
    3_600_000,
  );
}

// ─── useLeague ────────────────────────────────────────────────────────────────

export function useLeague(leagueId: string | undefined) {
  return useFirestoreQuery<FantasyLeague | null>(
    async () => {
      if (!leagueId) return null;
      const snap = await getDoc(doc(db, 'fantasyLeagues', leagueId));
      return snap.exists() ? (snap.data() as FantasyLeague) : null;
    },
    [leagueId],
    30_000,
  );
}

// ─── Zustand: useCreateLeagueStore ────────────────────────────────────────────

export interface CreateLeagueState {
  // Step 1
  name: string;
  description: string;
  icon: string;
  // Step 2
  competitionPool: number[];
  // Step 3
  visibility: 'public' | 'friends' | 'secret';
  format: 'overall' | 'h2h';
  salaryCap: number | null;
  maxPerClub: number;
  chipsEnabled: {
    wildcard: boolean;
    benchBoost: boolean;
    tripleCaptain: boolean;
    freeHit: boolean;
  };
  // Actions
  setName: (v: string) => void;
  setDescription: (v: string) => void;
  setIcon: (v: string) => void;
  setCompetitionPool: (ids: number[]) => void;
  setVisibility: (v: 'public' | 'friends' | 'secret') => void;
  setFormat: (v: 'overall' | 'h2h') => void;
  setSalaryCap: (v: number | null) => void;
  setMaxPerClub: (v: number) => void;
  setChipsEnabled: (v: Partial<CreateLeagueState['chipsEnabled']>) => void;
  reset: () => void;
}

const DEFAULT_CREATE_STATE = {
  name: '',
  description: '',
  icon: '⚽',
  competitionPool: [39] as number[],
  visibility: 'public' as const,
  format: 'overall' as const,
  salaryCap: 100,
  maxPerClub: 3,
  chipsEnabled: { wildcard: true, benchBoost: true, tripleCaptain: false, freeHit: false },
};

export const useCreateLeagueStore = create<CreateLeagueState>((set) => ({
  ...DEFAULT_CREATE_STATE,
  setName: (v) => set({ name: v }),
  setDescription: (v) => set({ description: v }),
  setIcon: (v) => set({ icon: v }),
  setCompetitionPool: (ids) => set({ competitionPool: ids }),
  setVisibility: (v) => set({ visibility: v }),
  setFormat: (v) => set({ format: v }),
  setSalaryCap: (v) => set({ salaryCap: v }),
  setMaxPerClub: (v) => set({ maxPerClub: v }),
  setChipsEnabled: (v) => set((s) => ({ chipsEnabled: { ...s.chipsEnabled, ...v } })),
  reset: () => set({ ...DEFAULT_CREATE_STATE }),
}));

// ─── Zustand: useSquadStore ───────────────────────────────────────────────────

export interface PendingTransfer {
  out: FantasyPlayer;
  in: FantasyPlayer;
}

export interface SquadStoreState {
  squad: FantasyPlayer[];
  captain: number | null;
  viceCaptain: number | null;
  formation: string;
  pendingTransfers: PendingTransfer[];
  isDraft: boolean;
  setSquad: (players: FantasyPlayer[]) => void;
  setCaptain: (id: number) => void;
  setViceCaptain: (id: number) => void;
  setFormation: (f: string) => void;
  addTransfer: (t: PendingTransfer) => void;
  clearTransfers: () => void;
  confirmTransfers: () => void;
  reset: () => void;
}

export const useSquadStore = create<SquadStoreState>((set) => ({
  squad: [],
  captain: null,
  viceCaptain: null,
  formation: '4-4-2',
  pendingTransfers: [],
  isDraft: false,
  setSquad: (players) => set({ squad: players }),
  setCaptain: (id) => set({ captain: id }),
  setViceCaptain: (id) => set({ viceCaptain: id }),
  setFormation: (f) => set({ formation: f }),
  addTransfer: (t) => set((s) => ({
    pendingTransfers: [...s.pendingTransfers, t],
    squad: s.squad.map((p) => (p.id === t.out.id ? t.in : p)),
    isDraft: true,
  })),
  clearTransfers: () => set((s) => ({
    // Revert squad by undoing all pending transfers
    squad: s.squad.map((p) => {
      const transfer = s.pendingTransfers.find((t) => t.in.id === p.id);
      return transfer ? transfer.out : p;
    }),
    pendingTransfers: [],
    isDraft: false,
  })),
  confirmTransfers: () => set({ pendingTransfers: [], isDraft: false }),
  reset: () => set({ squad: [], captain: null, viceCaptain: null, formation: '4-4-2', pendingTransfers: [], isDraft: false }),
}));
