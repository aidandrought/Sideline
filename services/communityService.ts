// services/communityService.ts
// DATA-DRIVEN community service - NO hardcoded communities
// Communities generated dynamically from live + upcoming matches
// Users can search, follow, and unfollow communities

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { Platform } from 'react-native';
import { auth, db } from '../config/firebase';
import {
  FEATURED_TOURNAMENT_COMPETITIONS,
  COMMUNITY_COMPETITION_POOLS,
  formatCompetitionLabel,
  SPOTLIGHT_LEAGUE_NAMES,
} from '../constants/footballCompetitions';
import { footballAPI, LeagueTeamInfo } from './footballApi';
import { WORLD_CUP_2026_TEAMS } from './worldCup2026Data';

const ENABLE_HEAVY_COMMUNITY_ENRICHMENT =
  process.env.EXPO_PUBLIC_ENABLE_HEAVY_COMMUNITY_ENRICHMENT === '1';

// Updated Community interface to work with API data
export interface Community {
  id: number;  // Changed from string to number (teamId or leagueId from API)
  type: 'team' | 'league' | 'worldcup';
  name: string;
  league?: string;  // For teams: which league they play in
  logo: string;     // Team/league logo from API
  color?: string;   // Optional: can be derived from logo if needed
  country?: string; // For leagues
  isNationalTeam?: boolean;
  docId?: string; // Firestore document id when different from numeric id
  // Removed hardcoded fields: icon, description, members, activeNow, trending
}

export interface UserCommunities {
  followedTeams: number[];    // Changed from string[] to number[] (teamIds)
  followedLeagues: number[];  // Changed from string[] to number[] (leagueIds)
  followedWorldcups?: number[];
  lastUpdated: string;
}

class CommunityService {
  private readonly competitionLogoFallbacks: Record<string, string> = {
    'premier league': 'https://media.api-sports.io/football/leagues/39.png',
    'la liga': 'https://media.api-sports.io/football/leagues/140.png',
    'serie a': 'https://media.api-sports.io/football/leagues/135.png',
    'bundesliga': 'https://media.api-sports.io/football/leagues/78.png',
    'ligue 1': 'https://media.api-sports.io/football/leagues/61.png',
    'major league soccer': 'https://media.api-sports.io/football/leagues/253.png',
    mls: 'https://media.api-sports.io/football/leagues/253.png',
    'liga mx': 'https://media.api-sports.io/football/leagues/262.png',
    'primeira liga': 'https://media.api-sports.io/football/leagues/94.png',
    'champions league': 'https://media.api-sports.io/football/leagues/2.png',
    'europa league': 'https://media.api-sports.io/football/leagues/3.png',
    'conference league': 'https://media.api-sports.io/football/leagues/848.png',
    'concacaf champions': 'https://media.api-sports.io/football/leagues/16.png',
    'fa cup': 'https://media.api-sports.io/football/leagues/45.png',
    'league cup': 'https://media.api-sports.io/football/leagues/48.png',
    'efl cup': 'https://media.api-sports.io/football/leagues/48.png',
    'copa del rey': 'https://media.api-sports.io/football/leagues/143.png',
    'coppa italia': 'https://media.api-sports.io/football/leagues/137.png',
    'dfb pokal': 'https://media.api-sports.io/football/leagues/81.png',
    'coupe de france': 'https://media.api-sports.io/football/leagues/66.png',
    'uefa super cup': 'https://media.api-sports.io/football/leagues/531.png',
    'community shield': 'https://media.api-sports.io/football/leagues/528.png',
    'supercopa de espana': 'https://media.api-sports.io/football/leagues/556.png',
    'super cup': 'https://media.api-sports.io/football/leagues/547.png',
  };
  private readonly STORAGE_KEY = 'communityCache:v9';
  private readonly isWeb = Platform.OS === 'web';
  private readonly onlineLeaguePopularityOrder = [
    'Premier League',
    'La Liga',
    'Bundesliga',
    'Serie A',
    'Ligue 1',
    'Major League Soccer',
    'MLS',
    'Liga MX',
    'Primeira Liga',
  ];
  private readonly onlineTournamentPopularityOrder = [
    'Champions League',
    'Europa League',
    'Conference League',
    'Concacaf Champions',
    'FA Cup',
    'Copa del Rey',
    'Coppa Italia',
    'DFB Pokal',
    'Coupe de France',
    'World Cup',
  ];
  private readonly onlineTeamPopularityOrder = [
    'Liverpool',
    'Arsenal',
    'Manchester City',
    'Manchester United',
    'Chelsea',
    'Tottenham Hotspur',
    'Real Madrid',
    'Barcelona',
    'Atletico Madrid',
    'Bayern Munich',
    'Borussia Dortmund',
    'Paris Saint Germain',
    'Juventus',
    'Inter Milan',
    'AC Milan',
    'Club America',
    'Monterrey',
    'Tigres UANL',
    'Inter Miami',
    'LAFC',
    'Philadelphia Union',
    'Benfica',
    'Sporting CP',
    'Porto',
  ];
  // Cache for generated communities (to avoid repeated API calls)
  private communitiesCache: {
    teams: Community[];
    leagues: Community[];
    worldcups: Community[];
    timestamp: number;
  } | null = null;

  private inFlight: Promise<{ teams: Community[]; leagues: Community[]; worldcups: Community[] }> | null = null;

  private readonly STALE_TIME = 10 * 60 * 1000; // 10 minutes
  private readonly CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours
  private cacheHydrated = false;
  private readonly worldCupFallbackTeams = WORLD_CUP_2026_TEAMS;

  private formatCompetitionName(name?: string): string {
    return formatCompetitionLabel(name);
  }

  private normalizeCommunityName(type?: string, name?: string): string {
    if (!name) return '';
    return type === 'league' ? this.formatCompetitionName(name) : name;
  }

  private normalizeCommunityLeague(league?: string | null): string | undefined {
    if (!league) return undefined;
    const formatted = this.formatCompetitionName(league);
    return formatted || league;
  }

  private getCompetitionLogoFallback(name?: string, id?: number): string {
    const formattedName = this.formatCompetitionName(name);
    const normalized = formattedName.toLowerCase();
    if (normalized.includes('world cup')) return '';
    if (this.competitionLogoFallbacks[normalized]) return this.competitionLogoFallbacks[normalized];
    if (id && id !== 1) return `https://media.api-sports.io/football/leagues/${id}.png`;
    return '';
  }

  /**
   * Generate communities dynamically from live + upcoming matches
   */
  async generateCommunitiesFromMatches(): Promise<{ teams: Community[]; leagues: Community[]; worldcups: Community[] }> {
    await this.hydrateCacheFromStorage();
    const cacheSnapshot = this.getCacheSnapshot();
    if (cacheSnapshot) {
      if (cacheSnapshot.isStale) {
        void this.fetchCommunities();
      }
      if (__DEV__) {
        if (__DEV__) console.log('Using cached communities');
      }
      return {
        teams: cacheSnapshot.teams,
        leagues: cacheSnapshot.leagues,
        worldcups: cacheSnapshot.worldcups
      };
    }

    return await this.fetchCommunities();
  }

  /**
   * Get all communities (teams + leagues)
   */
  async getAllCommunities(): Promise<Community[]> {
    const { teams, leagues, worldcups } = await this.generateCommunitiesFromMatches();
    return [...worldcups, ...teams, ...leagues];
  }

  /**
   * Search communities by name or league
   */
  async searchCommunities(query: string): Promise<Community[]> {
    const allCommunities = await this.getAllCommunities();
    const lowerQuery = query.toLowerCase();
    
    return allCommunities.filter(c => 
      c.name.toLowerCase().includes(lowerQuery) ||
      (c.league && c.league.toLowerCase().includes(lowerQuery)) ||
      (c.country && c.country.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get communities by type
   */
  async getCommunitiesByType(type: 'team' | 'league' | 'worldcup'): Promise<Community[]> {
    const { teams, leagues, worldcups } = await this.generateCommunitiesFromMatches();
    if (type === 'team') return teams;
    if (type === 'league') return leagues;
    return worldcups;
  }

  /**
   * Get community by ID
   */
  async getCommunityById(id: number, type: 'team' | 'league' | 'worldcup'): Promise<Community | undefined> {
    const communities = await this.getCommunitiesByType(type);
    return communities.find(c => c.id === id);
  }

  /**
   * Get communities filtered by league (for teams only)
   */
  async getCommunitiesByLeague(leagueName: string): Promise<Community[]> {
    const { teams } = await this.generateCommunitiesFromMatches();
    return teams.filter(t => t.league === leagueName);
  }

  async getTopTeamsByMemberCount(allCommunities?: Community[], max: number = 10): Promise<Community[]> {
    const teams = (allCommunities ?? (await this.getCommunitiesByType('team'))).filter((c) => c.type === 'team');
    return [...teams]
      .sort((a, b) => {
        const rankDiff = this.getOnlineTeamPopularityRank(a.name) - this.getOnlineTeamPopularityRank(b.name);
        if (rankDiff !== 0) return rankDiff;
        const leagueRankDiff = this.getOnlineLeaguePopularityRank(a.league) - this.getOnlineLeaguePopularityRank(b.league);
        if (leagueRankDiff !== 0) return leagueRankDiff;
        return a.name.localeCompare(b.name);
      })
      .slice(0, max);
  }

  async getTopLeaguesByMemberCount(allCommunities?: Community[], max: number = 10): Promise<Community[]> {
    const leagues = (allCommunities ?? (await this.getCommunitiesByType('league')))
      .filter((community) => community.type === 'league' && !this.isTournamentLikeLeagueName(community.name));
    return [...leagues]
      .sort((a, b) => {
        const rankDiff = this.getOnlineLeaguePopularityRank(a.name) - this.getOnlineLeaguePopularityRank(b.name);
        if (rankDiff !== 0) return rankDiff;
        return a.name.localeCompare(b.name);
      })
      .slice(0, Math.min(max, leagues.length));
  }

  async getTopCommunitiesByHeat(allCommunities?: Community[], max: number = 10): Promise<Community[]> {
    const communities = allCommunities ?? (await this.getAllCommunities());
    return [...communities]
      .sort((a, b) => {
        const rankDiff = this.getCommunityPopularityRank(a) - this.getCommunityPopularityRank(b);
        if (rankDiff !== 0) return rankDiff;
        return a.name.localeCompare(b.name);
      })
      .slice(0, Math.min(max, communities.length));
  }

  /**
   * Follow a community
   */
  async followCommunity(
    userId: string,
    communityId: number,
    type: 'team' | 'league' | 'worldcup',
    community?: Community
  ): Promise<void> {
    const userCommunitiesRef = doc(db, 'userCommunities', userId);
    const docSnap = await getDoc(userCommunitiesRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as UserCommunities;
      const field = type === 'team' ? 'followedTeams' : type === 'league' ? 'followedLeagues' : 'followedWorldcups';
      const current = this.normalizeIds(data[field]);

      if (!current.includes(communityId)) {
        await updateDoc(userCommunitiesRef, {
          [field]: [...current, communityId],
          lastUpdated: new Date().toISOString()
        });
      }
    } else {
      const newData: UserCommunities = {
        followedTeams: type === 'team' ? [communityId] : [],
        followedLeagues: type === 'league' ? [communityId] : [],
        followedWorldcups: type === 'worldcup' ? [communityId] : [],
        lastUpdated: new Date().toISOString()
      };
      await setDoc(userCommunitiesRef, newData);
    }

    try {
      await this.joinCommunity(communityId, userId, {
        type,
        docId: community?.docId,
        name: community?.name,
        league: community?.league,
        logo: community?.logo,
        country: community?.country,
        isNationalTeam: community?.isNationalTeam,
      });
    } catch (error) {
      console.error('Follow persisted but joinCommunity sync failed:', error);
    }
  }

  /**
   * Unfollow a community
   */
  async unfollowCommunity(
    userId: string,
    communityId: number,
    type: 'team' | 'league' | 'worldcup',
    community?: Community
  ): Promise<void> {
    const userCommunitiesRef = doc(db, 'userCommunities', userId);
    const docSnap = await getDoc(userCommunitiesRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as UserCommunities;
        const field = type === 'team' ? 'followedTeams' : type === 'league' ? 'followedLeagues' : 'followedWorldcups';
        const current = this.normalizeIds(data[field]);

        await updateDoc(userCommunitiesRef, {
          [field]: current.filter(id => id !== communityId),
          lastUpdated: new Date().toISOString()
        });
      }

    try {
      await this.leaveCommunity(communityId, userId, community?.docId, type);
    } catch (error) {
      console.error('Unfollow persisted but leaveCommunity sync failed:', error);
    }
  }

  async joinCommunity(
    communityId: number,
    userId: string,
    meta?: {
      type?: 'team' | 'league' | 'worldcup';
      username?: string;
      docId?: string;
      name?: string;
      league?: string;
      logo?: string;
      country?: string;
      isNationalTeam?: boolean;
    }
  ): Promise<void> {
    const resolvedType = meta?.type ?? 'team';
    const resolvedDocId = this.resolveCommunityDocId(communityId, resolvedType, meta?.docId);
    const communityRef = doc(db, 'communities', resolvedDocId);
    const memberRef = doc(db, 'communities', resolvedDocId, 'members', userId);

    await runTransaction(db, async (tx) => {
      const [memberSnap, communitySnap] = await Promise.all([
        tx.get(memberRef),
        tx.get(communityRef),
      ]);

      if (!memberSnap.exists()) {
        tx.set(memberRef, {
          userId,
          username: meta?.username || null,
          joinedAt: serverTimestamp(),
        }, { merge: true });
      }

      if (!communitySnap.exists()) {
        tx.set(communityRef, {
          id: communityId,
          name: meta?.type === 'league' ? this.normalizeCommunityName('league', meta?.name || 'Community') : (meta?.name || 'Community'),
          type: resolvedType,
          league: this.normalizeCommunityLeague(meta?.league) ?? null,
          logo: meta?.logo || '',
          country: meta?.country || null,
          isNationalTeam: meta?.isNationalTeam || false,
          memberCount: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastMemberJoinAt: serverTimestamp(),
        }, { merge: true });
      } else if (!memberSnap.exists()) {
        tx.set(communityRef, {
          updatedAt: serverTimestamp(),
          lastMemberJoinAt: serverTimestamp(),
          memberCount: increment(1),
        }, { merge: true });
      } else {
        tx.set(communityRef, {
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    });
  }

  async leaveCommunity(
    communityId: number,
    userId: string,
    docId?: string,
    type: 'team' | 'league' | 'worldcup' = 'team'
  ): Promise<void> {
    const resolvedDocId = this.resolveCommunityDocId(communityId, type, docId);
    const memberRef = doc(db, 'communities', resolvedDocId, 'members', userId);
    const communityRef = doc(db, 'communities', resolvedDocId);
    try {
      await runTransaction(db, async (tx) => {
        const [memberSnap, communitySnap] = await Promise.all([
          tx.get(memberRef),
          tx.get(communityRef),
        ]);
        if (!memberSnap.exists()) return;
        tx.delete(memberRef);
        if (communitySnap.exists()) {
          const currentCount = (communitySnap.data()?.memberCount as number | undefined) ?? 0;
          const nextCount = Math.max(0, currentCount - 1);
          tx.set(communityRef, { memberCount: nextCount, updatedAt: serverTimestamp() }, { merge: true });
        }
      });
    } catch (error) {
      console.error('Error leaving community:', error);
    }
  }

  listenMemberCount(
    communityId: number,
    callback: (count: number) => void,
    docId?: string,
    type: 'team' | 'league' | 'worldcup' = 'team'
  ): () => void {
    const resolvedDocId = docId ?? this.resolveCommunityDocId(communityId, type);
    const communityRef = doc(db, 'communities', resolvedDocId);
    let latestDocCount: number | null = null;

    const unsubscribeDoc = onSnapshot(
      communityRef,
      (snapshot) => {
        const count = snapshot.data()?.memberCount;
        if (typeof count === 'number') {
          latestDocCount = count;
          callback(count);
        }
      },
      () => {
        callback(latestDocCount ?? 0);
      }
    );

    const membersRef = collection(db, 'communities', resolvedDocId, 'members');
    const unsubscribeMembers = onSnapshot(
      membersRef,
      (snapshot) => {
        if (snapshot.size > 0 || latestDocCount === null) {
          callback(snapshot.size);
        }
      },
      () => {
        callback(latestDocCount ?? 0);
      }
    );

    return () => {
      unsubscribeDoc();
      unsubscribeMembers();
    };
  }

  async listMembers(communityId: number, max: number = 20): Promise<{ userId: string; username?: string | null }[]> {
    const membersRef = collection(db, 'communities', `${communityId}`, 'members');
    const q = query(membersRef, orderBy('joinedAt', 'desc'), limit(max));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data() as { userId?: string; username?: string | null };
      return {
        userId: data.userId || docSnap.id,
        username: data.username ?? null,
      };
    });
  }

  /**
   * Toggle follow status
   */
  async toggleFollow(
    userId: string,
    communityId: number,
    type: 'team' | 'league' | 'worldcup',
    community?: Community
  ): Promise<boolean> {
    const isFollowing = await this.isFollowing(userId, communityId);
    
    if (isFollowing) {
      await this.unfollowCommunity(userId, communityId, type, community);
      return false;
    } else {
      await this.followCommunity(userId, communityId, type, community);
      return true;
    }
  }

  /**
   * Check if user is following a community
   */
  async isFollowing(userId: string, communityId: number): Promise<boolean> {
    const userCommunitiesRef = doc(db, 'userCommunities', userId);
    const docSnap = await getDoc(userCommunitiesRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as UserCommunities;
      const teams = this.normalizeIds(data.followedTeams);
      const leagues = this.normalizeIds(data.followedLeagues);
      const worldcups = this.normalizeIds(data.followedWorldcups);
      return (
        teams.includes(communityId) ||
        leagues.includes(communityId) ||
        worldcups.includes(communityId)
      );
    }
    return false;
  }

  /**
   * Get user's followed communities
   */
  async getUserCommunities(userId: string): Promise<UserCommunities> {
    const userCommunitiesRef = doc(db, 'userCommunities', userId);
    const docSnap = await getDoc(userCommunitiesRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as UserCommunities;
      return {
        followedTeams: this.normalizeIds(data.followedTeams),
        followedLeagues: this.normalizeIds(data.followedLeagues),
        followedWorldcups: this.normalizeIds(data.followedWorldcups),
        lastUpdated: data.lastUpdated || new Date().toISOString()
      };
    }
    
    return {
      followedTeams: [],
      followedLeagues: [],
      followedWorldcups: [],
      lastUpdated: new Date().toISOString()
    };
  }

  async ensureMemberships(userId: string, communities: Community[]): Promise<void> {
    for (const community of communities) {
      await this.joinCommunity(community.id, userId, {
        type: community.type,
        docId: community.docId,
        name: community.name,
        league: community.league,
        logo: community.logo,
        country: community.country,
        isNationalTeam: community.isNationalTeam,
      });
    }
  }

  /**
   * Get user's followed communities with full data
   */
  async getMyCommunitiesData(userId: string): Promise<{ teams: Community[]; leagues: Community[]; worldcups: Community[] }> {
    const userCommunities = await this.getUserCommunities(userId);
    const { teams: allTeams, leagues: allLeagues, worldcups: allWorldcups } = await this.generateCommunitiesFromMatches();
    
    // Re-apply user's follows by matching IDs
    const teams = allTeams.filter(t => userCommunities.followedTeams.includes(t.id));
    const leagues = allLeagues.filter(l => userCommunities.followedLeagues.includes(l.id));

    const worldcups = allWorldcups.filter(w => (userCommunities.followedWorldcups || []).includes(w.id));
    return { teams, leagues, worldcups };
  }

  /**
   * Subscribe to user communities changes
   */
  subscribeToUserCommunities(userId: string, callback: (data: UserCommunities) => void): () => void {
    const userCommunitiesRef = doc(db, 'userCommunities', userId);
    
    return onSnapshot(
      userCommunitiesRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as UserCommunities;
          callback({
            followedTeams: this.normalizeIds(data.followedTeams),
            followedLeagues: this.normalizeIds(data.followedLeagues),
            followedWorldcups: this.normalizeIds(data.followedWorldcups),
            lastUpdated: data.lastUpdated || new Date().toISOString()
          });
        } else {
          callback({
            followedTeams: [],
            followedLeagues: [],
            followedWorldcups: [],
            lastUpdated: new Date().toISOString()
          });
        }
      },
      () => {
        callback({
          followedTeams: [],
          followedLeagues: [],
          followedWorldcups: [],
          lastUpdated: new Date().toISOString()
        });
      }
    );
  }

  /**
   * Get suggested communities (based on popular leagues)
   * This replaces the old "trending" logic
   */
  async getSuggestedCommunities(): Promise<Community[]> {
    const { leagues } = await this.generateCommunitiesFromMatches();

    const spotlight = new Set(SPOTLIGHT_LEAGUE_NAMES.map((name) => name.toLowerCase()));
    const suggested = leagues.filter((league) => spotlight.has(league.name.toLowerCase()));

    return suggested.slice(0, 6);
  }

  /**
   * Clear cache (useful for debugging or forcing refresh)
   */
  clearCache(): void {
    this.communitiesCache = null;
    this.inFlight = null;
    if (!this.isWeb) {
      void AsyncStorage.removeItem(this.STORAGE_KEY);
    }
    if (__DEV__) {
      if (__DEV__) console.log('Communities cache cleared');
    }
  }

  getCachedAllCommunities(): { data: Community[]; isStale: boolean; updatedAt: number } | null {
    const cacheSnapshot = this.getCacheSnapshot();
    if (!cacheSnapshot) return null;
    return {
      data: [...cacheSnapshot.worldcups, ...cacheSnapshot.teams, ...cacheSnapshot.leagues],
      isStale: cacheSnapshot.isStale,
      updatedAt: cacheSnapshot.timestamp
    };
  }

  async getCachedAllCommunitiesAsync(): Promise<{ data: Community[]; isStale: boolean; updatedAt: number } | null> {
    await this.hydrateCacheFromStorage();
    return this.getCachedAllCommunities();
  }

  async refreshCommunities(): Promise<{ teams: Community[]; leagues: Community[]; worldcups: Community[] }> {
    this.communitiesCache = null;
    return await this.fetchCommunities();
  }

  async refreshCommunitiesIfStale(): Promise<{ teams: Community[]; leagues: Community[]; worldcups: Community[] } | null> {
    await this.hydrateCacheFromStorage();
    const cacheSnapshot = this.getCacheSnapshot();
    if (!cacheSnapshot || cacheSnapshot.isStale) {
      return await this.fetchCommunities();
    }
    return null;
  }

  prefetchCommunities(): void {
    const cacheSnapshot = this.getCacheSnapshot();
    if (!cacheSnapshot || cacheSnapshot.isStale) {
      void this.fetchCommunities();
    }
  }

  private mergeCommunities(primary: Community[], extras: Community[]): Community[] {
    const merged = new Map<number, Community>();
    primary.forEach(item => merged.set(item.id, item));
    extras.forEach(item => {
      const existing = merged.get(item.id);
      if (!existing) {
        merged.set(item.id, item);
        return;
      }
      const next: Community = { ...existing, ...item };
      if (existing.type === 'team' && item.type === 'team' && existing.league && item.league) {
          const competitionPriority = (name: string) => {
            const value = name.toLowerCase();
            if (
              value.includes('premier league') ||
              value.includes('la liga') ||
              value.includes('serie a') ||
              value.includes('bundesliga') ||
              value.includes('ligue 1') ||
              value.includes('major league soccer') ||
              value.includes('mls') ||
              value.includes('liga mx') ||
              value.includes('primeira liga')
            ) {
              return 10;
            }
          if (value.includes('champions league') || value.includes('europa') || value.includes('world cup')) return 80;
          if (value.includes('cup') || value.includes('copa') || value.includes('pokal')) return 40;
          return 25;
        };
        const existingLeague = this.formatCompetitionName(existing.league);
        const incomingLeague = this.formatCompetitionName(item.league);
        next.league =
          competitionPriority(existingLeague) <= competitionPriority(incomingLeague)
            ? existingLeague
            : incomingLeague;
      }
      if ((!item.logo || item.logo.trim() === '') && existing.logo) {
        next.logo = existing.logo;
      }
      merged.set(item.id, next);
    });
    return Array.from(merged.values());
  }

  private normalizeIds(ids: (number | string)[] | undefined): number[] {
    if (!ids) return [];
    return ids
      .map((id) => (typeof id === 'number' ? id : Number(id)))
      .filter((id) => Number.isFinite(id));
  }

  private isTournamentLikeLeagueName(name?: string): boolean {
    const value = this.formatCompetitionName(name).toLowerCase();
    return (
      value.includes('champions league') ||
      value.includes('europa') ||
      value.includes('conference league') ||
      value.includes('world cup') ||
      value.includes('european championship') ||
      value.includes('concacaf champions') ||
      value.includes('cup') ||
      value.includes('copa') ||
      value.includes('shield') ||
      value.includes('super cup') ||
      value.includes('supercopa') ||
      value.includes('pokal')
    );
  }

  private getOnlineLeaguePopularityRank(name?: string): number {
    const normalized = this.formatCompetitionName(name).toLowerCase();
    const rank = this.onlineLeaguePopularityOrder.findIndex((entry) => entry.toLowerCase() === normalized);
    return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
  }

  private getOnlineTournamentPopularityRank(name?: string): number {
    const normalized = this.formatCompetitionName(name).toLowerCase();
    const rank = this.onlineTournamentPopularityOrder.findIndex((entry) => entry.toLowerCase() === normalized);
    return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
  }

  private getOnlineTeamPopularityRank(name?: string): number {
    const normalized = (name || '').toLowerCase().trim();
    const rank = this.onlineTeamPopularityOrder.findIndex((entry) => entry.toLowerCase() === normalized);
    return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
  }

  private getCommunityPopularityRank(community: Community): number {
    if (community.type === 'league') {
      return this.isTournamentLikeLeagueName(community.name)
        ? 200 + this.getOnlineTournamentPopularityRank(community.name)
        : this.getOnlineLeaguePopularityRank(community.name);
    }

    if (community.type === 'worldcup') {
      return 180 + this.getOnlineTournamentPopularityRank(community.name);
    }

    const teamRank = this.getOnlineTeamPopularityRank(community.name);
    const leagueRank = this.getOnlineLeaguePopularityRank(community.league);
    const tournamentRank = this.getOnlineTournamentPopularityRank(community.league);
    const supportingRank = this.isTournamentLikeLeagueName(community.league)
      ? tournamentRank
      : leagueRank;
    return (teamRank === Number.MAX_SAFE_INTEGER ? 400 : 100 + teamRank) + Math.min(supportingRank, 80);
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  private hashId(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
      hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    return hash === 0 ? -1 : Math.abs(hash) * -1;
  }

  private resolveCommunityDocId(
    communityId: number,
    type: 'team' | 'league' | 'worldcup',
    docId?: string
  ): string {
    if (docId) return docId;
    if (type === 'team') return `team_${communityId}`;
    if (type === 'league') return `league_${communityId}`;
    return `worldcup_${communityId}`;
  }

  private async getFirestoreCommunities(): Promise<Community[]> {
    try {
      const snapshot = await getDocs(collection(db, 'communities'));
      const results: Community[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Partial<Community> & { id?: number; teamId?: number; leagueId?: number };
        const rawId = data.id ?? data.teamId ?? data.leagueId ?? Number(docSnap.id);
        const id = typeof rawId === 'number' ? rawId : Number(rawId);
        if (!Number.isFinite(id)) return;
        if (!data.name || !data.type) return;
        const resolvedLogo =
          data.type === 'worldcup'
            ? ''
            : (data.logo || '');
        results.push({
          id,
          name: this.normalizeCommunityName(data.type, data.name),
          type: data.type,
          league: this.normalizeCommunityLeague(data.league),
          logo: resolvedLogo,
          country: data.country,
          color: data.color,
          isNationalTeam: data.isNationalTeam,
          docId: docSnap.id,
        });
      });
      return results;
    } catch (error) {
      console.error('Error loading Firestore communities:', error);
      return [];
    }
  }

  private getCacheSnapshot(): { teams: Community[]; leagues: Community[]; worldcups: Community[]; timestamp: number; isStale: boolean } | null {
    if (!this.communitiesCache) return null;
    if (
      this.communitiesCache.teams.length === 0 &&
      this.communitiesCache.leagues.length === 0 &&
      this.communitiesCache.worldcups.length === 0
    ) {
      this.communitiesCache = null;
      return null;
    }
    const age = Date.now() - this.communitiesCache.timestamp;
    if (age > this.CACHE_DURATION) {
      this.communitiesCache = null;
      return null;
    }
    return {
      teams: this.communitiesCache.teams,
      leagues: this.communitiesCache.leagues,
      worldcups: this.communitiesCache.worldcups,
      timestamp: this.communitiesCache.timestamp,
      isStale: age > this.STALE_TIME
    };
  }

  private async fetchCommunities(): Promise<{ teams: Community[]; leagues: Community[]; worldcups: Community[] }> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = (async () => {
      if (__DEV__) {
        console.time('communities.fetch');
      }
    if (__DEV__) {
      if (__DEV__) console.log('Generating communities from matches...');
    }

      try {
        const { teams, leagues } = await footballAPI.getCommunitiesFromMatches();
        // Avoid collection-wide Firestore reads/writes from the client.
        // The generated catalog should come from the football API plus per-community
        // membership docs, otherwise a single active tester can exhaust Spark quotas.
        const firestoreExtras: Community[] = [];

        const loadCompetitionTeamsWithFallback = async (
          leagueId: number,
          minExpectedTeams: number
        ): Promise<LeagueTeamInfo[]> => {
          try {
            const currentSeason = await footballAPI.getCurrentSeason(leagueId);
            const currentTeams = await footballAPI.getTeamsByLeague(leagueId, currentSeason);
            if (currentTeams.length >= minExpectedTeams) return currentTeams;

            const previousSeason = currentSeason - 1;
            if (previousSeason <= 0) return currentTeams;
            const previousTeams = await footballAPI.getTeamsByLeague(leagueId, previousSeason);
            const merged = new Map<number, LeagueTeamInfo>();
            currentTeams.forEach((team) => merged.set(team.id, team));
            previousTeams.forEach((team) => {
              if (!merged.has(team.id)) merged.set(team.id, team);
            });
            return Array.from(merged.values());
          } catch (error) {
            console.error(`Error loading league ${leagueId} teams with fallback:`, error);
            return [];
          }
        };

        let championsLeagueTeams: LeagueTeamInfo[] = [];
        let worldCupTeams: LeagueTeamInfo[] = [];
        const companionCompetitionTeams = new Map<number, LeagueTeamInfo[]>();
        if (ENABLE_HEAVY_COMMUNITY_ENRICHMENT) {
          try {
            const championsLeagueId = 2;
            championsLeagueTeams = await loadCompetitionTeamsWithFallback(championsLeagueId, 24);
          } catch (error) {
            console.error('Error loading Champions League teams:', error);
          }
          try {
            const worldCupId = 1;
            worldCupTeams = await loadCompetitionTeamsWithFallback(worldCupId, 16);
          } catch (error) {
            console.error('Error loading World Cup teams:', error);
          }
          await Promise.all(
            COMMUNITY_COMPETITION_POOLS.map(async (competition) => {
              try {
                const teams = await loadCompetitionTeamsWithFallback(
                  competition.id,
                  competition.minExpectedTeams
                );
                companionCompetitionTeams.set(competition.id, teams);
              } catch (error) {
                console.error(`Error loading ${competition.name} teams:`, error);
              }
            })
          );
        }

        // Convert to Community interface
        const teamCommunities: Community[] = teams.map(t => ({
          id: t.id,
          type: 'team' as const,
          name: t.name,
          logo: t.logo,
          league: this.formatCompetitionName(t.leagueName),
          docId: `team_${t.id}`
        }));

        const championsLeagueTeamCommunities: Community[] = championsLeagueTeams.map(t => ({
          id: t.id,
          type: 'team' as const,
          name: t.name,
          logo: t.logo || '',
          league: 'Champions League',
          docId: `team_${t.id}`
        }));
        const worldCupTeamCommunities: Community[] = worldCupTeams.map(t => ({
          id: t.id,
          type: 'team' as const,
          name: t.name,
          logo: t.logo || '',
          league: 'World Cup',
          country: t.country,
          isNationalTeam: true,
          docId: `team_${t.id}`
        }));
        const domesticCupTeamCommunities: Community[] = COMMUNITY_COMPETITION_POOLS.flatMap((competition) =>
          (companionCompetitionTeams.get(competition.id) || []).map((team) => ({
            id: team.id,
            type: 'team' as const,
            name: team.name,
            logo: team.logo || '',
            league: this.formatCompetitionName(competition.name),
            country: team.country,
            docId: `team_${team.id}`,
          }))
        );

        const leagueCommunities: Community[] = leagues
          .filter((l) => {
            const n = (l.name || '').toLowerCase();
            return !n.includes('friendl') && !n.includes('community');
          })
          .map(l => ({
            id: l.id,
            type: 'league' as const,
            name: this.formatCompetitionName(l.name),
            logo: l.logo || this.getCompetitionLogoFallback(l.name, l.id),
            country: l.country,
            docId: `league_${l.id}`
          }));

        let championsLeagueDetails = ENABLE_HEAVY_COMMUNITY_ENRICHMENT
          ? await footballAPI.getLeagueDetailsById(2)
          : null;
        if (!championsLeagueDetails) {
          championsLeagueDetails = { id: 2, name: 'Champions League', logo: '', country: 'Europe' };
        }
        let worldCupDetails = ENABLE_HEAVY_COMMUNITY_ENRICHMENT
          ? await footballAPI.getLeagueDetailsById(1)
          : null;
        if (!worldCupDetails) {
          worldCupDetails = { id: 1, name: 'World Cup', logo: '', country: 'World' };
        }
        const domesticCupCommunities: Community[] = ENABLE_HEAVY_COMMUNITY_ENRICHMENT
          ? await Promise.all(
              COMMUNITY_COMPETITION_POOLS.map(async (competition) => {
                const details = await footballAPI.getLeagueDetailsById(competition.id);
                return {
                  id: details?.id || competition.id,
                  type: 'league' as const,
                  name: this.formatCompetitionName(details?.name || competition.name),
                  logo: details?.logo || this.getCompetitionLogoFallback(details?.name || competition.name, details?.id || competition.id),
                  country: details?.country || competition.country,
                  docId: `league_${details?.id || competition.id}`,
                };
              })
            )
          : COMMUNITY_COMPETITION_POOLS.map((competition) => ({
              id: competition.id,
              type: 'league' as const,
              name: this.formatCompetitionName(competition.name),
              logo: this.getCompetitionLogoFallback(competition.name, competition.id),
              country: competition.country,
              docId: `league_${competition.id}`,
            }));
        const featuredTournamentCommunities: Community[] = ENABLE_HEAVY_COMMUNITY_ENRICHMENT
          ? await Promise.all(
              FEATURED_TOURNAMENT_COMPETITIONS
                .filter((competition) => competition.id !== 1)
                .map(async (competition) => {
                  const details = await footballAPI.getLeagueDetailsById(competition.id);
                  const resolvedId = details?.id || competition.id;
                  const resolvedName = details?.name || competition.name;
                  return {
                    id: resolvedId,
                    type: 'league' as const,
                    name: this.formatCompetitionName(resolvedName),
                    logo: details?.logo || this.getCompetitionLogoFallback(resolvedName, resolvedId),
                    country: details?.country || competition.country,
                    docId: `league_${resolvedId}`,
                  };
                })
            )
          : FEATURED_TOURNAMENT_COMPETITIONS
              .filter((competition) => competition.id !== 1)
              .map((competition) => ({
                id: competition.id,
                type: 'league' as const,
                name: this.formatCompetitionName(competition.name),
                logo: this.getCompetitionLogoFallback(competition.name, competition.id),
                country: competition.country,
                docId: `league_${competition.id}`,
              }));

        const championsLeagueCommunity: Community = {
          id: championsLeagueDetails.id,
          type: 'league',
          name: this.formatCompetitionName(championsLeagueDetails.name),
          logo: championsLeagueDetails.logo || this.getCompetitionLogoFallback(championsLeagueDetails.name, championsLeagueDetails.id),
          country: championsLeagueDetails.country,
          docId: `league_${championsLeagueDetails.id}`
        };
        const worldCupCommunity: Community = {
          id: worldCupDetails.id,
          type: 'worldcup',
          name: worldCupDetails.name?.replace(/fifa\s+/i, '') || 'World Cup',
          logo: '',
          country: worldCupDetails.country,
          docId: `worldcup_${worldCupDetails.id}`
        };

        const extraTeams = firestoreExtras.filter(c => c.type === 'team');
        const extraLeagues = firestoreExtras.filter(c => c.type === 'league');
        const extraWorldcups = firestoreExtras.filter(c => c.type === 'worldcup');
        const hasWorldCupTeamsInFirestore = extraTeams.some(team =>
          team.isNationalTeam || (team.league || '').toLowerCase().includes('world cup')
        );

        const fallbackWorldCupTeams: Community[] = [];
        if (!hasWorldCupTeamsInFirestore && worldCupTeams.length === 0) {
          this.worldCupFallbackTeams.forEach((team) => {
            const slug = this.slugify(team.name);
            const code = team.code;
            const logo = code ? `https://flagcdn.com/w80/${code}.png` : '';
            fallbackWorldCupTeams.push({
              id: this.hashId(`wc-${slug}`),
              type: 'team',
              name: team.name,
              logo,
              league: 'World Cup',
              country: team.name,
              isNationalTeam: true,
              docId: `team_wc_${slug}`
            });
          });
        }

        const mergedTeams = this.mergeCommunities(
          this.mergeCommunities(
            this.mergeCommunities(
              this.mergeCommunities(teamCommunities, championsLeagueTeamCommunities),
              worldCupTeamCommunities
            ),
            this.mergeCommunities(fallbackWorldCupTeams, domesticCupTeamCommunities)
          ),
          extraTeams
        );
        const mergedLeagues = this.mergeCommunities(
          this.mergeCommunities(
            this.mergeCommunities(
              this.mergeCommunities(leagueCommunities, [championsLeagueCommunity]),
              domesticCupCommunities
            ),
            featuredTournamentCommunities
          ),
          extraLeagues
        );
        const worldcups = this.mergeCommunities(extraWorldcups, [worldCupCommunity]);

        // Update cache
        this.communitiesCache = {
          teams: mergedTeams,
          leagues: mergedLeagues,
          worldcups,
          timestamp: Date.now()
        };
        await this.persistCache();

        if (__DEV__) {
          if (__DEV__) console.log(`Generated ${teamCommunities.length} team communities and ${leagueCommunities.length} league communities`);
        }

        return {
          teams: mergedTeams,
          leagues: mergedLeagues,
          worldcups
        };
      } catch (error) {
        console.error('Error generating communities:', error);
        if (this.communitiesCache) {
          return {
            teams: this.communitiesCache.teams,
            leagues: this.communitiesCache.leagues,
            worldcups: this.communitiesCache.worldcups,
          };
        }
        return { teams: [], leagues: [], worldcups: [] };
      } finally {
        if (__DEV__) {
          console.timeEnd('communities.fetch');
        }
      }
    })();

    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async hydrateCacheFromStorage(): Promise<void> {
    if (this.cacheHydrated || this.communitiesCache) {
      this.cacheHydrated = true;
      return;
    }
    if (this.isWeb) {
      this.cacheHydrated = true;
      void AsyncStorage.removeItem(this.STORAGE_KEY);
      return;
    }
    try {
      const raw = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (!raw) {
        this.cacheHydrated = true;
        return;
      }
      const parsed = JSON.parse(raw) as { teams: Community[]; leagues: Community[]; worldcups?: Community[]; timestamp: number };
      if (!parsed?.teams || !parsed?.leagues || !parsed?.timestamp) {
        this.cacheHydrated = true;
        return;
      }
      if (parsed.teams.length === 0 && parsed.leagues.length === 0 && (parsed.worldcups || []).length === 0) {
        this.cacheHydrated = true;
        return;
      }
      const age = Date.now() - parsed.timestamp;
      if (age > this.CACHE_DURATION) {
        this.cacheHydrated = true;
        return;
      }
      this.communitiesCache = {
        teams: parsed.teams,
        leagues: parsed.leagues,
        worldcups: parsed.worldcups || [],
        timestamp: parsed.timestamp,
      };
      this.cacheHydrated = true;
    } catch (error) {
      console.error('Error hydrating communities cache:', error);
      this.cacheHydrated = true;
    }
  }

  private async persistCache(): Promise<void> {
    if (!this.communitiesCache) return;
    if (this.isWeb) return;
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.communitiesCache));
    } catch (error) {
      console.error('Error persisting communities cache:', error);
    }
  }

  private async ensureCommunityDocs(communities: Community[]): Promise<void> {
    if (!auth.currentUser) return;
    if (communities.length === 0) return;
    const batches: Community[][] = [];
    const chunkSize = 400;
    for (let i = 0; i < communities.length; i += chunkSize) {
      batches.push(communities.slice(i, i + chunkSize));
    }
    try {
      for (const chunk of batches) {
        const batch = writeBatch(db);
        chunk.forEach((community) => {
          const docId = this.resolveCommunityDocId(community.id, community.type, community.docId);
          const ref = doc(db, 'communities', docId);
          batch.set(
            ref,
            {
              id: community.id,
              name: community.name,
              type: community.type,
              league: community.league || null,
              logo: community.logo || '',
              country: community.country || null,
              isNationalTeam: community.isNationalTeam || false,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
        await batch.commit();
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('Failed to ensure community docs:', error);
      }
    }
  }
}

export const communityService = new CommunityService();
