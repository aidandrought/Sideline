// services/chatAccessControl.ts
// Controls which matches get live chats based on popularity and importance

import { CHAT_PRIORITY_LEAGUE_NAMES } from '../constants/footballCompetitions';

export interface ChatAccessConfig {
  isChatEnabled: boolean;
  opensAt: Date | null; // When chat becomes available
  closesAt: Date | null; // When chat closes
  reason?: string; // Why chat is/isn't enabled
}

class ChatAccessController {
  // Top leagues that ALWAYS get chats (all matches)
  private topLeagues = CHAT_PRIORITY_LEAGUE_NAMES;

  // Major tournaments (all matches)
  private majorTournaments = [
    'UEFA Champions League',
    'UEFA Europa League',
    'UEFA Europa Conference League',
    'FIFA World Cup',
    'FA Cup',
    'Copa del Rey',
    'Coppa Italia',
    'DFB-Pokal',
    'Coupe de France',
    'UEFA Super Cup',
    'FIFA Club World Cup',
    'Supercopa de España',
    'Community Shield',
    'CONCACAF Champions League',
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
    'Club America',
    'Chivas',
    'Cruz Azul',
    'Pumas',
    'Monterrey',
    'Tigres',
    'Porto',
    'Benfica',
    'Sporting',
    'Urawa Reds',
    'Yokohama F. Marinos',
    'Kawasaki Frontale',
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
    endedAt?: Date | null;
  }): ChatAccessConfig {
    const matchDate = new Date(match.date);
    const now = new Date();

    // Don't enable chat for finished matches beyond the post-match grace window.
    if (match.status === 'finished') {
      const fallbackClose = new Date(matchDate.getTime() + 135 * 60000);
      const closeAt = match.endedAt
        ? new Date(match.endedAt.getTime() + 15 * 60000)
        : fallbackClose;
      if (now > closeAt) {
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
      return this.calculateChatTiming(matchDate, match.status, 'Top league match', match.endedAt);
    }

    // Check if it's a major tournament
    if (this.isMajorTournament(match.league)) {
      return this.calculateChatTiming(matchDate, match.status, 'Major tournament', match.endedAt);
    }

    // Check if it involves a priority team
    if (this.hasPriorityTeam(match.home, match.away)) {
      return this.calculateChatTiming(matchDate, match.status, 'Priority team', match.endedAt);
    }

    // Check if it's a classic rivalry
    if (this.isRivalry(match.home, match.away)) {
      return this.calculateChatTiming(matchDate, match.status, 'Classic rivalry', match.endedAt);
    }

    // For other matches, only enable if high profile
    if (this.isHighProfileMatch(match)) {
      return this.calculateChatTiming(matchDate, match.status, 'High profile match', match.endedAt);
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
    reason: string,
    endedAt?: Date | null
  ): ChatAccessConfig {
    const now = new Date();
    
    // Chat opens 45 minutes before kickoff
    const opensAt = new Date(matchDate.getTime() - 45 * 60000);
    
    // Chat closes 15 minutes after match end when known, otherwise fallback to kickoff + 135m.
    const isEnded = status === 'finished';
    const closesAt = isEnded && endedAt
      ? new Date(endedAt.getTime() + 15 * 60000)
      : new Date(matchDate.getTime() + 135 * 60000);

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

    const ligaMxTop = ['Club America', 'Chivas', 'Cruz Azul', 'Pumas', 'Monterrey', 'Tigres'];
    const isLigaMxHigh = ligaMxTop.some(team =>
      match.home.includes(team) || match.away.includes(team)
    );

    const primeiraLigaTop = ['Benfica', 'Porto', 'Sporting'];
    const isPrimeiraLigaHigh = primeiraLigaTop.some(team =>
      match.home.includes(team) || match.away.includes(team)
    );

    const jLeagueTop = ['Urawa Reds', 'Yokohama F. Marinos', 'Kawasaki Frontale', 'Vissel Kobe'];
    const isJLeagueHigh = jLeagueTop.some(team =>
      match.home.includes(team) || match.away.includes(team)
    );

    return isLigue1High || isMlsHigh || isLigaMxHigh || isPrimeiraLigaHigh || isJLeagueHigh;
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
