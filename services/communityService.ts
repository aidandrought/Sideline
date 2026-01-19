// services/communityService.ts
// DATA-DRIVEN community service - NO hardcoded communities
// Communities generated dynamically from live + upcoming matches
// Users can search, follow, and unfollow communities

import { doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { footballAPI } from './footballApi';

// Updated Community interface to work with API data
export interface Community {
  id: number;  // Changed from string to number (teamId or leagueId from API)
  type: 'team' | 'league';
  name: string;
  league?: string;  // For teams: which league they play in
  logo: string;     // Team/league logo from API
  color?: string;   // Optional: can be derived from logo if needed
  country?: string; // For leagues
  // Removed hardcoded fields: icon, description, members, activeNow, trending
}

export interface UserCommunities {
  followedTeams: number[];    // Changed from string[] to number[] (teamIds)
  followedLeagues: number[];  // Changed from string[] to number[] (leagueIds)
  lastUpdated: string;
}

class CommunityService {
  // Cache for generated communities (to avoid repeated API calls)
  private communitiesCache: {
    teams: Community[];
    leagues: Community[];
    timestamp: number;
  } | null = null;

  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

  /**
   * Generate communities dynamically from live + upcoming matches
   */
  async generateCommunitiesFromMatches(): Promise<{ teams: Community[]; leagues: Community[] }> {
    // Check cache first
    if (this.communitiesCache && Date.now() - this.communitiesCache.timestamp < this.CACHE_DURATION) {
      console.log('Using cached communities');
      return {
        teams: this.communitiesCache.teams,
        leagues: this.communitiesCache.leagues
      };
    }

    console.log('Generating communities from matches...');
    
    try {
      const { teams, leagues } = await footballAPI.getCommunitiesFromMatches();
      
      // Convert to Community interface
      const teamCommunities: Community[] = teams.map(t => ({
        id: t.id,
        type: 'team' as const,
        name: t.name,
        logo: t.logo,
        league: t.leagueName
      }));

      const leagueCommunities: Community[] = leagues.map(l => ({
        id: l.id,
        type: 'league' as const,
        name: l.name,
        logo: l.logo || '',
        country: l.country
      }));

      // Update cache
      this.communitiesCache = {
        teams: teamCommunities,
        leagues: leagueCommunities,
        timestamp: Date.now()
      };

      console.log(`Generated ${teamCommunities.length} team communities and ${leagueCommunities.length} league communities`);

      return {
        teams: teamCommunities,
        leagues: leagueCommunities
      };
    } catch (error) {
      console.error('Error generating communities:', error);
      return { teams: [], leagues: [] };
    }
  }

  /**
   * Get all communities (teams + leagues)
   */
  async getAllCommunities(): Promise<Community[]> {
    const { teams, leagues } = await this.generateCommunitiesFromMatches();
    return [...teams, ...leagues];
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
  async getCommunitiesByType(type: 'team' | 'league'): Promise<Community[]> {
    const { teams, leagues } = await this.generateCommunitiesFromMatches();
    return type === 'team' ? teams : leagues;
  }

  /**
   * Get community by ID
   */
  async getCommunityById(id: number, type: 'team' | 'league'): Promise<Community | undefined> {
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

  /**
   * Follow a community
   */
  async followCommunity(userId: string, communityId: number, type: 'team' | 'league'): Promise<void> {
    const userCommunitiesRef = doc(db, 'userCommunities', userId);
    const docSnap = await getDoc(userCommunitiesRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as UserCommunities;
      const field = type === 'team' ? 'followedTeams' : 'followedLeagues';
      const current = data[field] || [];
      
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
        lastUpdated: new Date().toISOString()
      };
      await setDoc(userCommunitiesRef, newData);
    }
  }

  /**
   * Unfollow a community
   */
  async unfollowCommunity(userId: string, communityId: number, type: 'team' | 'league'): Promise<void> {
    const userCommunitiesRef = doc(db, 'userCommunities', userId);
    const docSnap = await getDoc(userCommunitiesRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as UserCommunities;
      const field = type === 'team' ? 'followedTeams' : 'followedLeagues';
      const current = data[field] || [];
      
      await updateDoc(userCommunitiesRef, {
        [field]: current.filter(id => id !== communityId),
        lastUpdated: new Date().toISOString()
      });
    }
  }

  /**
   * Toggle follow status
   */
  async toggleFollow(userId: string, communityId: number, type: 'team' | 'league'): Promise<boolean> {
    const isFollowing = await this.isFollowing(userId, communityId);
    
    if (isFollowing) {
      await this.unfollowCommunity(userId, communityId, type);
      return false;
    } else {
      await this.followCommunity(userId, communityId, type);
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
      return (
        (data.followedTeams || []).includes(communityId) ||
        (data.followedLeagues || []).includes(communityId)
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
      return docSnap.data() as UserCommunities;
    }
    
    return {
      followedTeams: [],
      followedLeagues: [],
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Get user's followed communities with full data
   */
  async getMyCommunitiesData(userId: string): Promise<{ teams: Community[]; leagues: Community[] }> {
    const userCommunities = await this.getUserCommunities(userId);
    const { teams: allTeams, leagues: allLeagues } = await this.generateCommunitiesFromMatches();
    
    // Re-apply user's follows by matching IDs
    const teams = allTeams.filter(t => userCommunities.followedTeams.includes(t.id));
    const leagues = allLeagues.filter(l => userCommunities.followedLeagues.includes(l.id));

    return { teams, leagues };
  }

  /**
   * Subscribe to user communities changes
   */
  subscribeToUserCommunities(userId: string, callback: (data: UserCommunities) => void): () => void {
    const userCommunitiesRef = doc(db, 'userCommunities', userId);
    
    return onSnapshot(userCommunitiesRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data() as UserCommunities);
      } else {
        callback({
          followedTeams: [],
          followedLeagues: [],
          lastUpdated: new Date().toISOString()
        });
      }
    });
  }

  /**
   * Get suggested communities (based on popular leagues)
   * This replaces the old "trending" logic
   */
  async getSuggestedCommunities(): Promise<Community[]> {
    const { leagues } = await this.generateCommunitiesFromMatches();
    
    // Suggest major leagues
    const majorLeagues = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Champions League'];
    const suggested = leagues.filter(l => majorLeagues.includes(l.name));
    
    return suggested.slice(0, 6);
  }

  /**
   * Clear cache (useful for debugging or forcing refresh)
   */
  clearCache(): void {
    this.communitiesCache = null;
    console.log('Communities cache cleared');
  }
}

export const communityService = new CommunityService();