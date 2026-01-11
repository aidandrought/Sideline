// services/communityService.ts
// Community service - PREDEFINED communities for teams and leagues
// Users can search, follow, and unfollow communities

import { doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export interface Community {
  id: string;
  type: 'team' | 'league';
  name: string;
  league?: string;
  icon: string;
  color: string;
  description: string;
  members: string;
  activeNow: string;
  trending: boolean;
  image?: string;
}

export interface UserCommunities {
  followedTeams: string[];
  followedLeagues: string[];
  lastUpdated: string;
}

// PREDEFINED COMMUNITIES
const PREDEFINED_COMMUNITIES: Community[] = [
  // PREMIER LEAGUE TEAMS
  {
    id: 'liverpool_fc',
    type: 'team',
    name: 'Liverpool FC',
    league: 'Premier League',
    icon: '🔴',
    color: '#C8102E',
    description: "You'll Never Walk Alone",
    members: '2.1M',
    activeNow: '38.5K',
    trending: true,
  },
  {
    id: 'arsenal_fc',
    type: 'team',
    name: 'Arsenal',
    league: 'Premier League',
    icon: '🔴',
    color: '#EF0107',
    description: 'The Gunners - North London is Red',
    members: '1.9M',
    activeNow: '35.2K',
    trending: true,
  },
  {
    id: 'manchester_city',
    type: 'team',
    name: 'Manchester City',
    league: 'Premier League',
    icon: '🔵',
    color: '#6CABDD',
    description: 'The Citizens - Sky Blue Army',
    members: '1.7M',
    activeNow: '32.1K',
    trending: true,
  },
  {
    id: 'manchester_united',
    type: 'team',
    name: 'Manchester United',
    league: 'Premier League',
    icon: '🔴',
    color: '#DA291C',
    description: 'The Red Devils - Glory Glory',
    members: '2.3M',
    activeNow: '41.2K',
    trending: true,
  },
  {
    id: 'chelsea_fc',
    type: 'team',
    name: 'Chelsea',
    league: 'Premier League',
    icon: '🔵',
    color: '#034694',
    description: 'The Blues - Pride of London',
    members: '1.8M',
    activeNow: '28.9K',
    trending: false,
  },
  {
    id: 'tottenham',
    type: 'team',
    name: 'Tottenham Hotspur',
    league: 'Premier League',
    icon: '⚪',
    color: '#132257',
    description: 'Come On You Spurs!',
    members: '1.4M',
    activeNow: '22.5K',
    trending: false,
  },

  // LA LIGA TEAMS
  {
    id: 'real_madrid',
    type: 'team',
    name: 'Real Madrid',
    league: 'La Liga',
    icon: '👑',
    color: '#FFFFFF',
    description: 'Hala Madrid - 15x UCL Champions',
    members: '2.8M',
    activeNow: '52.3K',
    trending: true,
  },
  {
    id: 'barcelona',
    type: 'team',
    name: 'FC Barcelona',
    league: 'La Liga',
    icon: '🔵',
    color: '#A50044',
    description: 'Més que un club',
    members: '2.6M',
    activeNow: '48.7K',
    trending: true,
  },
  {
    id: 'atletico_madrid',
    type: 'team',
    name: 'Atlético Madrid',
    league: 'La Liga',
    icon: '🔴',
    color: '#CB3524',
    description: 'Nunca Dejes de Creer',
    members: '1.2M',
    activeNow: '18.3K',
    trending: false,
  },

  // BUNDESLIGA TEAMS
  {
    id: 'bayern_munich',
    type: 'team',
    name: 'Bayern Munich',
    league: 'Bundesliga',
    icon: '🔴',
    color: '#DC052D',
    description: 'Mia San Mia',
    members: '1.9M',
    activeNow: '34.6K',
    trending: true,
  },
  {
    id: 'borussia_dortmund',
    type: 'team',
    name: 'Borussia Dortmund',
    league: 'Bundesliga',
    icon: '🟡',
    color: '#FDE100',
    description: 'Die Schwarzgelben',
    members: '1.3M',
    activeNow: '21.8K',
    trending: false,
  },

  // SERIE A TEAMS
  {
    id: 'juventus',
    type: 'team',
    name: 'Juventus',
    league: 'Serie A',
    icon: '⚪',
    color: '#000000',
    description: 'Fino Alla Fine',
    members: '1.6M',
    activeNow: '26.4K',
    trending: false,
  },
  {
    id: 'inter_milan',
    type: 'team',
    name: 'Inter Milan',
    league: 'Serie A',
    icon: '🔵',
    color: '#010E80',
    description: 'Nerazzurri - Inter Forever',
    members: '1.4M',
    activeNow: '23.1K',
    trending: true,
  },
  {
    id: 'ac_milan',
    type: 'team',
    name: 'AC Milan',
    league: 'Serie A',
    icon: '🔴',
    color: '#FB090B',
    description: 'Rossoneri - Milan è tutto',
    members: '1.5M',
    activeNow: '24.8K',
    trending: false,
  },

  // LIGUE 1 TEAMS
  {
    id: 'psg',
    type: 'team',
    name: 'Paris Saint-Germain',
    league: 'Ligue 1',
    icon: '🔵',
    color: '#004170',
    description: 'Ici c\'est Paris',
    members: '2.2M',
    activeNow: '39.5K',
    trending: true,
  },

  // MLS TEAMS
  {
    id: 'inter_miami',
    type: 'team',
    name: 'Inter Miami CF',
    league: 'MLS',
    icon: '🩷',
    color: '#F5B5C8',
    description: 'Freedom to Dream - Messi\'s Club',
    members: '1.8M',
    activeNow: '45.2K',
    trending: true,
  },

  // LEAGUES
  {
    id: 'premier_league',
    type: 'league',
    name: 'Premier League',
    icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    color: '#3D195B',
    description: 'The best league in the world',
    members: '3.5M',
    activeNow: '92.4K',
    trending: true,
  },
  {
    id: 'la_liga',
    type: 'league',
    name: 'La Liga',
    icon: '🇪🇸',
    color: '#EE8707',
    description: 'Spanish football at its finest',
    members: '2.8M',
    activeNow: '68.3K',
    trending: true,
  },
  {
    id: 'bundesliga',
    type: 'league',
    name: 'Bundesliga',
    icon: '🇩🇪',
    color: '#D20515',
    description: 'German football excellence',
    members: '1.9M',
    activeNow: '42.1K',
    trending: false,
  },
  {
    id: 'serie_a',
    type: 'league',
    name: 'Serie A',
    icon: '🇮🇹',
    color: '#008FD7',
    description: 'Italian football artistry',
    members: '1.7M',
    activeNow: '38.6K',
    trending: false,
  },
  {
    id: 'ligue_1',
    type: 'league',
    name: 'Ligue 1',
    icon: '🇫🇷',
    color: '#DBC429',
    description: 'French football passion',
    members: '1.4M',
    activeNow: '29.8K',
    trending: false,
  },
  {
    id: 'champions_league',
    type: 'league',
    name: 'Champions League',
    icon: '⭐',
    color: '#0066CC',
    description: 'The biggest club competition',
    members: '4.2M',
    activeNow: '125.6K',
    trending: true,
  },
  {
    id: 'europa_league',
    type: 'league',
    name: 'Europa League',
    icon: '🟠',
    color: '#F68E1F',
    description: 'UEFA Europa League',
    members: '1.8M',
    activeNow: '35.2K',
    trending: false,
  },
  {
    id: 'mls',
    type: 'league',
    name: 'MLS',
    icon: '🇺🇸',
    color: '#0B2137',
    description: 'Major League Soccer',
    members: '1.5M',
    activeNow: '32.4K',
    trending: true,
  },
];

// Team name mappings for live match detection
const TEAM_NAME_MAPPINGS: { [communityId: string]: string[] } = {
  'liverpool_fc': ['Liverpool', 'Liverpool FC'],
  'arsenal_fc': ['Arsenal', 'Arsenal FC'],
  'manchester_city': ['Manchester City', 'Man City', 'Man. City'],
  'manchester_united': ['Manchester United', 'Man United', 'Man. United'],
  'chelsea_fc': ['Chelsea', 'Chelsea FC'],
  'tottenham': ['Tottenham', 'Tottenham Hotspur', 'Spurs'],
  'real_madrid': ['Real Madrid', 'Real Madrid CF'],
  'barcelona': ['Barcelona', 'FC Barcelona', 'Barca'],
  'atletico_madrid': ['Atletico Madrid', 'Atlético Madrid', 'Atletico'],
  'bayern_munich': ['Bayern Munich', 'FC Bayern', 'Bayern München'],
  'borussia_dortmund': ['Borussia Dortmund', 'Dortmund', 'BVB'],
  'juventus': ['Juventus', 'Juventus FC'],
  'inter_milan': ['Inter Milan', 'Inter', 'Internazionale'],
  'ac_milan': ['AC Milan', 'Milan'],
  'psg': ['PSG', 'Paris Saint-Germain', 'Paris Saint Germain', 'Paris SG'],
  'inter_miami': ['Inter Miami', 'Inter Miami CF'],
};

class CommunityService {
  /**
   * Get all predefined communities
   */
  getAllCommunities(): Community[] {
    return PREDEFINED_COMMUNITIES;
  }

  /**
   * Search communities by name or league
   */
  searchCommunities(query: string): Community[] {
    const lowerQuery = query.toLowerCase();
    return PREDEFINED_COMMUNITIES.filter(c => 
      c.name.toLowerCase().includes(lowerQuery) ||
      (c.league && c.league.toLowerCase().includes(lowerQuery)) ||
      c.description.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get trending communities
   */
  getTrendingCommunities(): Community[] {
    return PREDEFINED_COMMUNITIES.filter(c => c.trending);
  }

  /**
   * Get community by ID
   */
  getCommunityById(id: string): Community | undefined {
    return PREDEFINED_COMMUNITIES.find(c => c.id === id);
  }

  /**
   * Get communities by type
   */
  getCommunitiesByType(type: 'team' | 'league'): Community[] {
    return PREDEFINED_COMMUNITIES.filter(c => c.type === type);
  }

  /**
   * Follow a community
   */
  async followCommunity(userId: string, communityId: string, type: 'team' | 'league'): Promise<void> {
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
  async unfollowCommunity(userId: string, communityId: string, type: 'team' | 'league'): Promise<void> {
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
  async toggleFollow(userId: string, communityId: string, type: 'team' | 'league'): Promise<boolean> {
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
  async isFollowing(userId: string, communityId: string): Promise<boolean> {
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
    
    const teams = userCommunities.followedTeams
      .map(id => this.getCommunityById(id))
      .filter((c): c is Community => c !== undefined);
    
    const leagues = userCommunities.followedLeagues
      .map(id => this.getCommunityById(id))
      .filter((c): c is Community => c !== undefined);

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
   * Check if a team has a live match
   */
  getTeamNameVariants(communityId: string): string[] {
    return TEAM_NAME_MAPPINGS[communityId] || [];
  }

  /**
   * Get suggested communities for new users
   */
  getSuggestedCommunities(): Community[] {
    return PREDEFINED_COMMUNITIES.filter(c => c.trending).slice(0, 6);
  }
}

export const communityService = new CommunityService();