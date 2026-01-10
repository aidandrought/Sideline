// services/communityService.ts
// Manages communities - teams, leagues, and custom communities

import { get, off, onValue, ref, remove, set } from 'firebase/database';
import { realtimeDb } from '../firebaseConfig';

export type CommunityType = 'team' | 'league' | 'custom';

export interface Community {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  type: CommunityType;
  league?: string;
  members: string;
  activeNow?: string;
  trending?: boolean;
  hasLiveMatch?: boolean;
  createdAt?: number;
}

// Pre-defined team communities for top leagues
const TEAM_COMMUNITIES: Community[] = [
  // Premier League
  { id: 'team-liverpool', name: 'Liverpool FC', description: 'You\'ll Never Walk Alone - Official Liverpool fans community', icon: '🔴', color: '#C8102E', type: 'team', league: 'Premier League', members: '2.1M' },
  { id: 'team-arsenal', name: 'Arsenal', description: 'The Gunners - Arsenal fans unite', icon: '🔴', color: '#EF0107', type: 'team', league: 'Premier League', members: '1.8M' },
  { id: 'team-mancity', name: 'Manchester City', description: 'The Citizens - Manchester City community', icon: '🔵', color: '#6CABDD', type: 'team', league: 'Premier League', members: '1.5M' },
  { id: 'team-manutd', name: 'Manchester United', description: 'Red Devils forever - Man United fans', icon: '🔴', color: '#DA291C', type: 'team', league: 'Premier League', members: '2.3M' },
  { id: 'team-chelsea', name: 'Chelsea FC', description: 'The Blues - Chelsea supporters worldwide', icon: '🔵', color: '#034694', type: 'team', league: 'Premier League', members: '1.6M' },
  { id: 'team-tottenham', name: 'Tottenham Hotspur', description: 'Spurs fans community - Come on you Spurs!', icon: '⚪', color: '#132257', type: 'team', league: 'Premier League', members: '1.2M' },
  
  // La Liga
  { id: 'team-realmadrid', name: 'Real Madrid', description: 'Hala Madrid! The greatest club in the world', icon: '⚪', color: '#FEBE10', type: 'team', league: 'La Liga', members: '3.5M' },
  { id: 'team-barcelona', name: 'FC Barcelona', description: 'Més que un club - Culers worldwide', icon: '🔵', color: '#A50044', type: 'team', league: 'La Liga', members: '3.2M' },
  { id: 'team-atletico', name: 'Atletico Madrid', description: 'Los Colchoneros - Atleti till I die', icon: '🔴', color: '#CB3524', type: 'team', league: 'La Liga', members: '890K' },
  
  // Serie A
  { id: 'team-juventus', name: 'Juventus', description: 'Fino Alla Fine - Bianconeri fans', icon: '⚪', color: '#000000', type: 'team', league: 'Serie A', members: '1.4M' },
  { id: 'team-acmilan', name: 'AC Milan', description: 'Rossoneri - Forza Milan sempre', icon: '🔴', color: '#FB090B', type: 'team', league: 'Serie A', members: '1.3M' },
  { id: 'team-inter', name: 'Inter Milan', description: 'Nerazzurri - Inter forever', icon: '🔵', color: '#010E80', type: 'team', league: 'Serie A', members: '1.1M' },
  
  // Bundesliga
  { id: 'team-bayern', name: 'Bayern Munich', description: 'Mia san Mia - FC Bayern fans', icon: '🔴', color: '#DC052D', type: 'team', league: 'Bundesliga', members: '1.9M' },
  { id: 'team-dortmund', name: 'Borussia Dortmund', description: 'BVB - The Yellow Wall community', icon: '🟡', color: '#FDE100', type: 'team', league: 'Bundesliga', members: '1.2M' },
  
  // Ligue 1
  { id: 'team-psg', name: 'Paris Saint-Germain', description: 'Ici c\'est Paris - PSG worldwide', icon: '🔵', color: '#004170', type: 'team', league: 'Ligue 1', members: '2.0M' },
  
  // MLS
  { id: 'team-intermiami', name: 'Inter Miami CF', description: 'The Herons - Inter Miami community', icon: '🩷', color: '#F5B5C8', type: 'team', league: 'MLS', members: '1.8M' },
];

// Pre-defined league communities
const LEAGUE_COMMUNITIES: Community[] = [
  { id: 'league-premierleague', name: 'Premier League', description: 'The best league in the world - All PL discussion', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#3D195B', type: 'league', members: '4.5M', trending: true },
  { id: 'league-laliga', name: 'La Liga', description: 'Spanish football at its finest', icon: '🇪🇸', color: '#EE8707', type: 'league', members: '3.2M' },
  { id: 'league-seriea', name: 'Serie A', description: 'Italian football artistry and passion', icon: '🇮🇹', color: '#008C45', type: 'league', members: '2.1M' },
  { id: 'league-bundesliga', name: 'Bundesliga', description: 'German football excellence', icon: '🇩🇪', color: '#D00027', type: 'league', members: '1.8M' },
  { id: 'league-ligue1', name: 'Ligue 1', description: 'French football discussion', icon: '🇫🇷', color: '#091C3E', type: 'league', members: '1.2M' },
  { id: 'league-ucl', name: 'Champions League', description: 'The biggest club competition in the world', icon: '⭐', color: '#0066CC', type: 'league', members: '5.2M', trending: true },
  { id: 'league-uel', name: 'Europa League', description: 'UEFA Europa League discussion', icon: '🧡', color: '#F26522', type: 'league', members: '1.5M' },
  { id: 'league-mls', name: 'Major League Soccer', description: 'American soccer community', icon: '🇺🇸', color: '#DA291C', type: 'league', members: '980K' },
];

class CommunityService {
  /**
   * Get all pre-defined communities (teams + leagues)
   */
  async getAllCommunities(): Promise<Community[]> {
    return [...TEAM_COMMUNITIES, ...LEAGUE_COMMUNITIES];
  }

  /**
   * Get trending communities
   */
  async getTrendingCommunities(): Promise<Community[]> {
    // Return communities marked as trending or with high activity
    const trending = [...TEAM_COMMUNITIES, ...LEAGUE_COMMUNITIES].filter(c => c.trending);
    
    // Also add some popular teams
    const popularTeams = TEAM_COMMUNITIES
      .sort((a, b) => {
        const membersA = parseFloat(a.members.replace('M', '').replace('K', '')) * (a.members.includes('M') ? 1000 : 1);
        const membersB = parseFloat(b.members.replace('M', '').replace('K', '')) * (b.members.includes('M') ? 1000 : 1);
        return membersB - membersA;
      })
      .slice(0, 4);

    return [...trending, ...popularTeams].slice(0, 6);
  }

  /**
   * Search communities by name
   */
  async searchCommunities(query: string): Promise<Community[]> {
    const all = [...TEAM_COMMUNITIES, ...LEAGUE_COMMUNITIES];
    const lowerQuery = query.toLowerCase();
    
    return all.filter(c => 
      c.name.toLowerCase().includes(lowerQuery) ||
      c.description.toLowerCase().includes(lowerQuery) ||
      c.league?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get communities a user has joined
   */
  async getUserCommunities(userId: string): Promise<Community[]> {
    try {
      const userCommunitiesRef = ref(realtimeDb, `users/${userId}/communities`);
      const snapshot = await get(userCommunitiesRef);
      
      if (snapshot.exists()) {
        const joinedIds: string[] = Object.keys(snapshot.val());
        const all = [...TEAM_COMMUNITIES, ...LEAGUE_COMMUNITIES];
        return all.filter(c => joinedIds.includes(c.id));
      }
      
      return [];
    } catch (error) {
      console.error('Error getting user communities:', error);
      return [];
    }
  }

  /**
   * Join a community
   */
  async joinCommunity(userId: string, communityId: string): Promise<boolean> {
    try {
      const userCommunityRef = ref(realtimeDb, `users/${userId}/communities/${communityId}`);
      await set(userCommunityRef, {
        joinedAt: Date.now(),
        notifications: true
      });
      
      // Also add user to community members list
      const communityMemberRef = ref(realtimeDb, `communities/${communityId}/members/${userId}`);
      await set(communityMemberRef, {
        joinedAt: Date.now()
      });
      
      return true;
    } catch (error) {
      console.error('Error joining community:', error);
      return false;
    }
  }

  /**
   * Leave a community
   */
  async leaveCommunity(userId: string, communityId: string): Promise<boolean> {
    try {
      const userCommunityRef = ref(realtimeDb, `users/${userId}/communities/${communityId}`);
      await remove(userCommunityRef);
      
      const communityMemberRef = ref(realtimeDb, `communities/${communityId}/members/${userId}`);
      await remove(communityMemberRef);
      
      return true;
    } catch (error) {
      console.error('Error leaving community:', error);
      return false;
    }
  }

  /**
   * Check if user is member of a community
   */
  async isMember(userId: string, communityId: string): Promise<boolean> {
    try {
      const userCommunityRef = ref(realtimeDb, `users/${userId}/communities/${communityId}`);
      const snapshot = await get(userCommunityRef);
      return snapshot.exists();
    } catch (error) {
      console.error('Error checking membership:', error);
      return false;
    }
  }

  /**
   * Get community by ID
   */
  getCommunityById(communityId: string): Community | undefined {
    return [...TEAM_COMMUNITIES, ...LEAGUE_COMMUNITIES].find(c => c.id === communityId);
  }

  /**
   * Get team community for a specific team name
   */
  getTeamCommunity(teamName: string): Community | undefined {
    const lowerName = teamName.toLowerCase();
    return TEAM_COMMUNITIES.find(c => 
      c.name.toLowerCase().includes(lowerName) ||
      lowerName.includes(c.name.toLowerCase().split(' ')[0])
    );
  }

  /**
   * Get league community by league name
   */
  getLeagueCommunity(leagueName: string): Community | undefined {
    const lowerName = leagueName.toLowerCase();
    return LEAGUE_COMMUNITIES.find(c =>
      c.name.toLowerCase().includes(lowerName) ||
      lowerName.includes(c.name.toLowerCase())
    );
  }

  /**
   * Mark community as having a live match
   */
  async setLiveMatchStatus(communityId: string, hasLive: boolean): Promise<void> {
    try {
      const statusRef = ref(realtimeDb, `communities/${communityId}/liveStatus`);
      await set(statusRef, {
        hasLiveMatch: hasLive,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Error setting live status:', error);
    }
  }

  /**
   * Subscribe to community updates
   */
  subscribeToCommunity(communityId: string, callback: (data: any) => void): () => void {
    const communityRef = ref(realtimeDb, `communities/${communityId}`);
    
    const unsubscribe = onValue(communityRef, (snapshot) => {
      callback(snapshot.val());
    });

    return () => off(communityRef);
  }
}

export const communityService = new CommunityService();