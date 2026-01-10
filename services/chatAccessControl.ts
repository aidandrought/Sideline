// services/chatAccessControl.ts
// Controls which matches get live chats based on popularity and importance

export interface ChatAccessConfig {
  isChatEnabled: boolean;
  opensAt: Date | null; // When chat becomes available
  closesAt: Date | null; // When chat closes
  reason?: string; // Why chat is/isn't enabled
}

class ChatAccessController {
  // Top leagues that ALWAYS get chats (all matches)
  private topLeagues = [
    'Premier League',
    'La Liga',
    'Serie A',
    'Bundesliga',
  ];

  // Major tournaments (all matches)
  private majorTournaments = [
    'UEFA Champions League',
    'UEFA Europa League',
    'UEFA Europa Conference League',
    'FIFA World Cup',
    'UEFA European Championship',
    'Copa America',
    'FA Cup',
    'Copa del Rey',
    'Coppa Italia',
    'DFB-Pokal',
    'Coupe de France',
    'UEFA Super Cup',
    'FIFA Club World Cup',
    'Supercopa de España',
    'Community Shield',
  ];

  // Teams that ALWAYS get chats (regardless of league)
  private priorityTeams = [
    'PSG', 'Paris Saint Germain', 'Paris Saint-Germain',
    'Inter Miami', 'Inter Miami CF',
    'Real Madrid',
    'Barcelona',
    'Manchester United',
    'Liverpool',
    'Manchester City',
    'Bayern Munich',
    'Juventus',
    'AC Milan',
    'Inter Milan',
    'Arsenal',
    'Chelsea',
    'Tottenham',
    'Atletico Madrid',
  ];

  // Classic rivalries/derbies (always get chats)
  private rivalries = [
    ['Real Madrid', 'Barcelona'], // El Clásico
    ['Liverpool', 'Manchester United'],
    ['Manchester United', 'Manchester City'], // Manchester Derby
    ['Arsenal', 'Tottenham'], // North London Derby
    ['AC Milan', 'Inter Milan'], // Derby della Madonnina
    ['Juventus', 'Inter Milan'], // Derby d\'Italia
    ['Bayern Munich', 'Borussia Dortmund'], // Der Klassiker
    ['PSG', 'Marseille'], // Le Classique
    ['Atletico Madrid', 'Real Madrid'], // Madrid Derby
    ['Barcelona', 'Espanyol'], // Barcelona Derby
    ['Roma', 'Lazio'], // Derby della Capitale
    ['Celtic', 'Rangers'], // Old Firm
    ['Boca Juniors', 'River Plate'], // Superclásico
  ];

  /**
   * Check if a match should have a live chat
   */
  canEnableChat(match: {
    league: string;
    home: string;
    away: string;
    date: string;
    status: 'live' | 'upcoming' | 'finished';
  }): ChatAccessConfig {
    const matchDate = new Date(match.date);
    const now = new Date();

    // Don't enable chat for finished matches (except for 10 min after)
    if (match.status === 'finished') {
      const tenMinutesAfter = new Date(matchDate.getTime() + 120 * 60000); // 120 min match + 10 min
      if (now > tenMinutesAfter) {
        return {
          isChatEnabled: false,
          opensAt: null,
          closesAt: null,
          reason: 'Match finished'
        };
      }
    }

    // Check if it's a top league match
    if (this.isTopLeague(match.league)) {
      return this.calculateChatTiming(matchDate, match.status, 'Top league match');
    }

    // Check if it's a major tournament
    if (this.isMajorTournament(match.league)) {
      return this.calculateChatTiming(matchDate, match.status, 'Major tournament');
    }

    // Check if it involves a priority team
    if (this.hasPriorityTeam(match.home, match.away)) {
      return this.calculateChatTiming(matchDate, match.status, 'Priority team');
    }

    // Check if it's a classic rivalry
    if (this.isRivalry(match.home, match.away)) {
      return this.calculateChatTiming(matchDate, match.status, 'Classic rivalry');
    }

    // For other matches (Ligue 1, MLS, etc.), only enable if high profile
    if (this.isHighProfileMatch(match)) {
      return this.calculateChatTiming(matchDate, match.status, 'High profile match');
    }

    // Default: no chat
    return {
      isChatEnabled: false,
      opensAt: null,
      closesAt: null,
      reason: 'Not a priority match'
    };
  }

  /**
   * Calculate when chat opens and closes
   */
  private calculateChatTiming(
    matchDate: Date,
    status: string,
    reason: string
  ): ChatAccessConfig {
    const now = new Date();
    
    // Chat opens 45 minutes before kickoff
    const opensAt = new Date(matchDate.getTime() - 45 * 60000);
    
    // Chat closes 10 minutes after match end (assume 120 min for match duration)
    const closesAt = new Date(matchDate.getTime() + 130 * 60000);

    // Check if we're in the chat window
    const isChatEnabled = now >= opensAt && now <= closesAt;

    return {
      isChatEnabled,
      opensAt,
      closesAt,
      reason
    };
  }

  private isTopLeague(league: string): boolean {
    return this.topLeagues.some(top => 
      league.toLowerCase().includes(top.toLowerCase())
    );
  }

  private isMajorTournament(league: string): boolean {
    return this.majorTournaments.some(tournament => 
      league.toLowerCase().includes(tournament.toLowerCase())
    );
  }

  private hasPriorityTeam(home: string, away: string): boolean {
    return this.priorityTeams.some(team => 
      home.toLowerCase().includes(team.toLowerCase()) ||
      away.toLowerCase().includes(team.toLowerCase())
    );
  }

  private isRivalry(home: string, away: string): boolean {
    return this.rivalries.some(([team1, team2]) => {
      const matchTeams = [home.toLowerCase(), away.toLowerCase()];
      return matchTeams.includes(team1.toLowerCase()) && 
             matchTeams.includes(team2.toLowerCase());
    });
  }

  private isHighProfileMatch(match: any): boolean {
    // Check for Ligue 1 top teams
    const ligue1Top = ['PSG', 'Marseille', 'Lyon', 'Monaco', 'Nice'];
    const isLigue1High = ligue1Top.some(team =>
      match.home.includes(team) || match.away.includes(team)
    );

    // Check for MLS high profile (Inter Miami, LAFC, LA Galaxy, etc.)
    const mlsTop = ['Inter Miami', 'LAFC', 'LA Galaxy', 'Atlanta United', 'Seattle Sounders'];
    const isMlsHigh = mlsTop.some(team =>
      match.home.includes(team) || match.away.includes(team)
    );

    return isLigue1High || isMlsHigh;
  }

  /**
   * Get time until chat opens (for display)
   */
  getTimeUntilChatOpens(opensAt: Date): string {
    const now = new Date();
    const diff = opensAt.getTime() - now.getTime();
    
    if (diff < 0) return 'Chat is open';
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `Chat opens in ${hours}h ${minutes % 60}m`;
    }
    return `Chat opens in ${minutes}m`;
  }
}

export const chatAccessController = new ChatAccessController();