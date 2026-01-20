// services/footballApi.ts
// STRICT filtering - Only real top leagues, no youth/reserve teams
// UPDATED: Added community generation methods and league standings

export interface Match {
  id: number;
  home: string;
  away: string;
  score?: string;
  time?: string;
  league: string;
  status: 'live' | 'upcoming' | 'finished';
  minute?: string;
  date: string;
  activeUsers?: number;
  homeLogo?: string;
  awayLogo?: string;
  homeId?: number;  // NEW: for community generation
  awayId?: number;  // NEW: for community generation
  leagueId?: number;  // NEW: for community generation
}

export interface Lineup {
  team: string;
  formation: string;
  startXI: Player[];
  substitutes: Player[];
}

export interface Player {
  name: string;
  number: number;
  position: string;
}

export interface MatchEvent {
  time: string;
  type: 'goal' | 'card' | 'substitution';
  player: string;
  team: string;
  detail?: string;
}

// NEW: Community interfaces
export interface TeamCommunity {
  id: number;
  name: string;
  logo: string;
  leagueId: number;
  leagueName: string;
}

export interface LeagueCommunity {
  id: number;
  name: string;
  logo?: string;
  country: string;
}

export interface LeagueStanding {
  rank: number;
  team: {
    id: number;
    name: string;
    logo: string;
  };
  points: number;
  goalsDiff: number;
  form: string;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface LeagueStandingGroup {
  name: string;
  standings: LeagueStanding[];
}

export interface LeagueStandingsResponse {
  leagueId: number;
  season: number | null;
  groups: LeagueStandingGroup[];
}

export interface FinishedMatch {
  id: number;
  home: string;
  away: string;
  score: string;
  league: string;
  date: string;
  homeLogo?: string;
  awayLogo?: string;
  leagueId?: number;
}

export interface LiveFixtureResponse {
  fixture: any | null;
  events: any[];
  statistics: any[];
  lineups: any[];
}

class FootballAPI {
  private baseURL = 'https://v3.football.api-sports.io';
  private apiKey = '7ee562287b3c02ee8426736fd81d032a';
  private readonly currentSeasonCache = new Map<number, { season: number; expiresAt: number }>();
  private readonly currentSeasonTtlMs = 12 * 60 * 60 * 1000;
  private readonly leagueDetailsCache = new Map<number, { data: LeagueCommunity; expiresAt: number }>();
  private readonly leagueDetailsTtlMs = 6 * 60 * 60 * 1000;

  // EXACT league names from API (must match exactly)
  private allowedLeagueIds = [
    // Top 5 Leagues
    39,   // Premier League (England)
    140,  // La Liga (Spain)
    135,  // Serie A (Italy)
    78,   // Bundesliga (Germany)
    61,   // Ligue 1 (France)
    
    // Major European Competitions
    2,    // UEFA Champions League
    3,    // UEFA Europa League
    848,  // UEFA Europa Conference League
    531,  // UEFA Super Cup
    
    // Major Domestic Cups
    45,   // FA Cup (England)
    143,  // Copa del Rey (Spain)
    137,  // Coppa Italia (Italy)
    81,   // DFB-Pokal (Germany)
    66,   // Coupe de France (France)
    48,   // EFL Cup / Carabao Cup (England)
    528,  // Community Shield (England)
    556,  // Supercopa de España (Spain)
    547,  // Supercoppa Italiana (Italy)
    
    // International Tournaments
    1,    // FIFA World Cup
    4,    // UEFA European Championship
    9,    // Copa America
    15,   // FIFA Club World Cup
    
    // MLS (for Inter Miami)
    253,  // Major League Soccer
  ];

  // Blocked keywords (youth, reserves, etc.)
  private blockedKeywords = [
    'u18', 'u19', 'u20', 'u21', 'u23',
    'youth', 'reserve', 'b team', 'ii',
    'women', 'feminino', 'femenino',
    'premier serie', // Mexican league
    'liga mx', 'ascenso', 
    'segunda', 'third division', 'fourth division',
    'amateur', 'regional'
  ];

  // Priority teams (always show)
  private priorityTeams = [
    'PSG', 'Paris Saint Germain', 'Paris Saint-Germain',
    'Inter Miami', 'Inter Miami CF',
  ];

  private async fetch(endpoint: string) {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'GET',
        headers: {
          'x-apisports-key': this.apiKey
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data;
      } else {
        console.log('API response not ok:', response.status);
      }
    } catch (error) {
      console.log('API fetch error:', error);
    }
    return null;
  }

  private async getLeagueDetails(leagueId: number): Promise<LeagueCommunity | null> {
    const cached = this.leagueDetailsCache.get(leagueId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    try {
      const data = await this.fetch(`/leagues?id=${leagueId}`);
      const league = data?.response?.[0]?.league;
      if (!league) return null;
      const mapped: LeagueCommunity = {
        id: league.id,
        name: league.name,
        logo: league.logo,
        country: league.country
      };
      this.leagueDetailsCache.set(leagueId, {
        data: mapped,
        expiresAt: Date.now() + this.leagueDetailsTtlMs
      });
      return mapped;
    } catch (error) {
      console.error('Error fetching league details:', error);
      return null;
    }
  }

  async getLiveMatches(): Promise<Match[]> {
    try {
      const data = await this.fetch('/fixtures?live=all');
      
      if (data?.response && data.response.length > 0) {
        console.log(`Found ${data.response.length} total live matches`);
        
        // STRICT filtering
        const filtered = data.response.filter((f: any) => {
          // Must be from allowed league ID
          const isAllowedLeague = this.allowedLeagueIds.includes(f.league.id);
          
          // OR must involve a priority team
          const hasPriorityTeam = this.priorityTeams.some(team => 
            f.teams.home.name.toLowerCase().includes(team.toLowerCase()) ||
            f.teams.away.name.toLowerCase().includes(team.toLowerCase())
          );
          
          if (!isAllowedLeague && !hasPriorityTeam) {
            return false;
          }
          
          // Block youth/reserve teams
          const leagueName = f.league.name.toLowerCase();
          const homeName = f.teams.home.name.toLowerCase();
          const awayName = f.teams.away.name.toLowerCase();
          
          const hasBlockedKeyword = this.blockedKeywords.some(keyword =>
            leagueName.includes(keyword) ||
            homeName.includes(keyword) ||
            awayName.includes(keyword)
          );
          
          if (hasBlockedKeyword) {
            console.log(`Blocked: ${f.league.name} - ${f.teams.home.name} vs ${f.teams.away.name}`);
            return false;
          }
          
          return true;
        });
        
        console.log(`Filtered to ${filtered.length} matches from top leagues`);
        
        const formatted = this.formatMatches(filtered, 'live');
        
        // Sort by league importance
        return this.sortByImportance(formatted).slice(0, 60);
      } else {
        console.log('No live matches found');
        return [];
      }
    } catch (error) {
      console.error('Error fetching live matches:', error);
    }
    
    return [];
  }

  async getUpcomingMatches(): Promise<Match[]> {
    try {
      const startDate = new Date();
      const daysAhead = 7;

      // Build array of date strings
      const dateStrings: string[] = [];
      for (let i = 0; i < daysAhead; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        dateStrings.push(d.toISOString().split('T')[0]);
      }

      // Fetch each day individually
      const fixturesArray = await Promise.all(
        dateStrings.map(d =>
          this.fetch(`/fixtures?date=${d}`)
        )
      );

      const allFixtures = fixturesArray.flatMap(data => data?.response || []);

      if (allFixtures.length === 0) return this.getMockUpcomingMatches();

      // STRICT filtering
      const filtered = allFixtures.filter((f: any) => {
        if (f.fixture.status.short !== 'NS') return false;

        const isAllowedLeague = this.allowedLeagueIds.includes(f.league.id);
        const hasPriorityTeam = this.priorityTeams.some(team =>
          f.teams.home.name.toLowerCase().includes(team.toLowerCase()) ||
          f.teams.away.name.toLowerCase().includes(team.toLowerCase())
        );

        if (!isAllowedLeague && !hasPriorityTeam) return false;

        const leagueName = f.league.name.toLowerCase();
        const homeName = f.teams.home.name.toLowerCase();
        const awayName = f.teams.away.name.toLowerCase();

        const hasBlockedKeyword = this.blockedKeywords.some(keyword =>
          leagueName.includes(keyword) ||
          homeName.includes(keyword) ||
          awayName.includes(keyword)
        );

        return !hasBlockedKeyword;
      });

      const formatted = this.formatMatches(filtered, 'upcoming');

      formatted.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return formatted.slice(0, 60);
    } catch (error) {
      console.error('Error fetching upcoming matches:', error);
      return this.getMockUpcomingMatches();
    }
  }

  /**
   * NEW: Extract unique teams and leagues from live + upcoming matches
   */
  async getCommunitiesFromMatches(): Promise<{
    teams: TeamCommunity[];
    leagues: LeagueCommunity[];
  }> {
    try {
      if (__DEV__) {
        console.time('communities.matchesFetch');
      }
      const [liveMatches, upcomingMatches] = await Promise.all([
        this.getLiveMatches(),
        this.getUpcomingMatches()
      ]);
      if (__DEV__) {
        console.timeEnd('communities.matchesFetch');
      }

      const allMatches = [...liveMatches, ...upcomingMatches];

      if (__DEV__) {
        console.time('communities.extract');
      }
      const teamsMap = new Map<number, TeamCommunity>();
      const leaguesMap = new Map<number, LeagueCommunity>();

      for (const match of allMatches) {
        if (match.homeId && match.homeLogo) {
          teamsMap.set(match.homeId, {
            id: match.homeId,
            name: match.home,
            logo: match.homeLogo,
            leagueId: match.leagueId || 0,
            leagueName: match.league
          });
        }
        if (match.awayId && match.awayLogo) {
          teamsMap.set(match.awayId, {
            id: match.awayId,
            name: match.away,
            logo: match.awayLogo,
            leagueId: match.leagueId || 0,
            leagueName: match.league
          });
        }
        if (match.leagueId) {
          leaguesMap.set(match.leagueId, {
            id: match.leagueId,
            name: match.league,
            logo: '',
            country: ''
          });
        }
      }

      if (__DEV__) {
        console.timeEnd('communities.extract');
      }

      const leagueIds = Array.from(leaguesMap.keys());
      if (__DEV__) {
        console.time('communities.leaguesFetch');
      }
      const leagueDetails = await Promise.all(
        leagueIds.map(id => this.getLeagueDetails(id))
      );
      if (__DEV__) {
        console.timeEnd('communities.leaguesFetch');
      }
      leagueDetails.forEach(detail => {
        if (detail) {
          leaguesMap.set(detail.id, detail);
        }
      });

      console.log(`Generated ${teamsMap.size} team communities and ${leaguesMap.size} league communities`);

      return {
        teams: Array.from(teamsMap.values()),
        leagues: Array.from(leaguesMap.values())
      };
    } catch (error) {
      console.error('Error getting communities from matches:', error);
      return { teams: [], leagues: [] };
    }
  }

  /**
   * NEW: Get league standings
   */
  async getLeagueStandings(leagueId: number, season: number = 2024): Promise<LeagueStanding[]> {
    try {
      const data = await this.fetch(`/standings?league=${leagueId}&season=${season}`);
      
      if (data?.response?.[0]?.league?.standings?.[0]) {
        const standings = data.response[0].league.standings[0];
        
        return standings.map((s: any) => ({
          rank: s.rank,
          team: {
            id: s.team.id,
            name: s.team.name,
            logo: s.team.logo
          },
          points: s.points,
          goalsDiff: s.goalsDiff,
          form: s.form,
          played: s.all.played,
          win: s.all.win,
          draw: s.all.draw,
          lose: s.all.lose,
          goalsFor: s.all.goals.for,
          goalsAgainst: s.all.goals.against
        }));
      }
    } catch (error) {
      console.error('Error fetching league standings:', error);
    }
    
    return [];
  }

  private async getCurrentSeasonForLeague(leagueId: number): Promise<number> {
    const cached = this.currentSeasonCache.get(leagueId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.season;
    }

    try {
      const data = await this.fetch(`/leagues?id=${leagueId}`);
      const seasons = data?.response?.[0]?.seasons;
      const currentSeason = seasons?.find((season: any) => season.current === true)?.year;
      const resolvedSeason = typeof currentSeason === 'number' ? currentSeason : new Date().getFullYear();
      this.currentSeasonCache.set(leagueId, {
        season: resolvedSeason,
        expiresAt: Date.now() + this.currentSeasonTtlMs
      });
      return resolvedSeason;
    } catch (error) {
      console.error('Error fetching current season:', error);
    }

    return new Date().getFullYear();
  }

  async getLeagueStandingsByCurrentSeason(leagueId: number): Promise<LeagueStandingsResponse> {
    try {
      const season = await this.getCurrentSeasonForLeague(leagueId);
      const data = await this.fetch(`/standings?league=${leagueId}&season=${season}`);

      const rawStandings = data?.response?.[0]?.league?.standings;
      if (!rawStandings) {
        return { leagueId, season, groups: [] };
      }

      const groups: LeagueStandingGroup[] = rawStandings.map((group: any[]) => {
        const name = group?.[0]?.group || data?.response?.[0]?.league?.name || 'Standings';
        const standings = group.map((s: any) => ({
          rank: s.rank,
          team: {
            id: s.team.id,
            name: s.team.name,
            logo: s.team.logo
          },
          points: s.points,
          goalsDiff: s.goalsDiff,
          form: s.form,
          played: s.all.played,
          win: s.all.win,
          draw: s.all.draw,
          lose: s.all.lose,
          goalsFor: s.all.goals.for,
          goalsAgainst: s.all.goals.against
        }));

        return { name, standings };
      });

      return { leagueId, season, groups };
    } catch (error) {
      console.error('Error fetching league standings:', error);
      return { leagueId, season: null, groups: [] };
    }
  }

  async getFixtureLive(fixtureId: number): Promise<LiveFixtureResponse> {
    try {
      const [fixtureData, eventsData, statsData, lineupsData] = await Promise.all([
        this.fetch(`/fixtures?id=${fixtureId}`),
        this.fetch(`/fixtures/events?fixture=${fixtureId}`),
        this.fetch(`/fixtures/statistics?fixture=${fixtureId}`),
        this.fetch(`/fixtures/lineups?fixture=${fixtureId}`),
      ]);

      return {
        fixture: fixtureData?.response?.[0] ?? null,
        events: eventsData?.response ?? [],
        statistics: statsData?.response ?? [],
        lineups: lineupsData?.response ?? [],
      };
    } catch (error) {
      console.error('Error fetching live fixture:', error);
      return { fixture: null, events: [], statistics: [], lineups: [] };
    }
  }

  /**
   * NEW: Get team's last match result
   */
  async getTeamLastMatch(teamId: number): Promise<FinishedMatch | null> {
    try {
      const data = await this.fetch(`/fixtures?team=${teamId}&last=1`);
      
      if (data?.response?.[0]) {
        const fixture = data.response[0];
        
        return {
          id: fixture.fixture.id,
          home: fixture.teams.home.name,
          away: fixture.teams.away.name,
          score: `${fixture.goals.home}-${fixture.goals.away}`,
          league: fixture.league.name,
          leagueId: fixture.league.id,
          date: fixture.fixture.date,
          homeLogo: fixture.teams.home.logo,
          awayLogo: fixture.teams.away.logo
        };
      }
    } catch (error) {
      console.error('Error fetching team last match:', error);
    }
    
    return null;
  }

  /**
   * NEW: Get team's upcoming matches
   */
  async getTeamUpcomingMatches(teamId: number, limit: number = 5): Promise<Match[]> {
    try {
      const data = await this.fetch(`/fixtures?team=${teamId}&next=${limit}`);
      
      if (data?.response) {
        return this.formatMatches(data.response, 'upcoming');
      }
    } catch (error) {
      console.error('Error fetching team upcoming matches:', error);
    }
    
    return [];
  }

  /**
   * NEW: Get league's recent matches (last N days)
   */
  async getLeagueRecentMatches(leagueId: number, days: number = 6): Promise<FinishedMatch[]> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);
      
      const from = startDate.toISOString().split('T')[0];
      const to = endDate.toISOString().split('T')[0];
      
      const data = await this.fetch(`/fixtures?league=${leagueId}&from=${from}&to=${to}&status=FT`);
      
      if (data?.response) {
        return data.response.map((f: any) => ({
          id: f.fixture.id,
          home: f.teams.home.name,
          away: f.teams.away.name,
          score: `${f.goals.home}-${f.goals.away}`,
          league: f.league.name,
          date: f.fixture.date,
          homeLogo: f.teams.home.logo,
          awayLogo: f.teams.away.logo
        }));
      }
    } catch (error) {
      console.error('Error fetching league recent matches:', error);
    }
    
    return [];
  }

  /**
   * NEW: Get league's upcoming matches
   */
  async getLeagueUpcomingMatches(leagueId: number, limit: number = 10): Promise<Match[]> {
    try {
      const data = await this.fetch(`/fixtures?league=${leagueId}&next=${limit}`);
      
      if (data?.response) {
        return this.formatMatches(data.response, 'upcoming');
      }
    } catch (error) {
      console.error('Error fetching league upcoming matches:', error);
    }
    
    return [];
  }

  /**
   * NEW: Get recent finished matches across all leagues (last N days)
   */
  async getRecentFinishedMatches(days: number = 3): Promise<Match[]> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);
      
      const from = startDate.toISOString().split('T')[0];
      const to = endDate.toISOString().split('T')[0];
      
      // Get finished matches from all allowed leagues
      const allFixtures: any[] = [];
      
      // Fetch from major leagues only to avoid too many API calls
      const majorLeagues = [39, 140, 135, 78, 61, 2, 3]; // PL, La Liga, Serie A, Bundesliga, Ligue 1, UCL, UEL
      
      for (const leagueId of majorLeagues) {
        const data = await this.fetch(`/fixtures?league=${leagueId}&from=${from}&to=${to}&status=FT`);
        if (data?.response) {
          allFixtures.push(...data.response);
        }
      }
      
      if (allFixtures.length === 0) return [];
      
      // Apply strict filtering
      const filtered = allFixtures.filter((f: any) => {
        const leagueName = f.league.name.toLowerCase();
        const homeName = f.teams.home.name.toLowerCase();
        const awayName = f.teams.away.name.toLowerCase();
        
        const hasBlockedKeyword = this.blockedKeywords.some(keyword =>
          leagueName.includes(keyword) ||
          homeName.includes(keyword) ||
          awayName.includes(keyword)
        );
        
        return !hasBlockedKeyword;
      });
      
      const formatted = this.formatMatches(filtered, 'finished');
      
      // Sort by most recent first
      formatted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      return this.sortByImportance(formatted).slice(0, 20);
    } catch (error) {
      console.error('Error fetching recent finished matches:', error);
    }
    
    return [];
  }

  /**
   * Sort matches by league importance
   */
  private sortByImportance(matches: Match[]): Match[] {
    const leagueRanking: { [key: string]: number } = {
      'UEFA Champions League': 1,
      'Premier League': 2,
      'La Liga': 3,
      'Serie A': 4,
      'Bundesliga': 5,
      'Ligue 1': 6,
      'UEFA Europa League': 7,
      'FA Cup': 8,
      'Copa del Rey': 9,
      'FIFA World Cup': 0,
      'UEFA European Championship': 0,
      'Major League Soccer': 10,
      'MLS': 10,
    };

    return matches.sort((a, b) => {
      const rankA = leagueRanking[a.league] ?? 99;
      const rankB = leagueRanking[b.league] ?? 99;
      return rankA - rankB;
    });
  }

  async getMatchLineup(matchId: number): Promise<{ home: Lineup; away: Lineup }> {
    try {
      const data = await this.fetch(`/fixtures/lineups?fixture=${matchId}`);
      
      if (data?.response && data.response.length >= 2) {
        return this.formatLineups(data.response);
      }
    } catch (error) {
      console.error('Error fetching lineup:', error);
    }
    
    return this.getMockLineup();
  }

  async getMatchEvents(matchId: number): Promise<MatchEvent[]> {
    try {
      const data = await this.fetch(`/fixtures/events?fixture=${matchId}`);
      
      if (data?.response && data.response.length > 0) {
        return this.formatEvents(data.response);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
    
    return this.getMockEvents();
  }

  private formatMatches(fixtures: any[], status: Match['status']): Match[] {
    return fixtures.map((f) => {
      const homeGoals = f.goals.home;
      const awayGoals = f.goals.away;
      
      return {
        id: f.fixture.id,
        home: f.teams.home.name,
        away: f.teams.away.name,
        homeLogo: f.teams.home.logo,
        awayLogo: f.teams.away.logo,
        homeId: f.teams.home.id,  // NEW: for communities
        awayId: f.teams.away.id,  // NEW: for communities
        leagueId: f.league.id,    // NEW: for communities
        score: homeGoals !== null ? `${homeGoals}-${awayGoals}` : undefined,
        league: f.league.name,
        status,
        minute: f.fixture.status.elapsed ? `${f.fixture.status.elapsed}'` : undefined,
        date: f.fixture.date,
        time: status === 'upcoming' ? new Date(f.fixture.date).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        }) : undefined,
        activeUsers: Math.floor(Math.random() * 5000) + 1000
      };
    });
  }

  private formatLineups(data: any[]): { home: Lineup; away: Lineup } {
    const home = data[0];
    const away = data[1];

    return {
      home: {
        team: home.team.name,
        formation: home.formation,
        startXI: home.startXI.map((p: any) => ({
          name: p.player.name,
          number: p.player.number,
          position: p.player.pos
        })),
        substitutes: home.substitutes.map((p: any) => ({
          name: p.player.name,
          number: p.player.number,
          position: p.player.pos
        }))
      },
      away: {
        team: away.team.name,
        formation: away.formation,
        startXI: away.startXI.map((p: any) => ({
          name: p.player.name,
          number: p.player.number,
          position: p.player.pos
        })),
        substitutes: away.substitutes.map((p: any) => ({
          name: p.player.name,
          number: p.player.number,
          position: p.player.pos
        }))
      }
    };
  }

  private formatEvents(events: any[]): MatchEvent[] {
    return events.map(e => ({
      time: `${e.time.elapsed}'`,
      type: e.type.toLowerCase() === 'goal' ? 'goal' : 
            e.type.toLowerCase() === 'card' ? 'card' : 'substitution',
      player: e.player.name,
      team: e.team.name,
      detail: e.detail
    }));
  }

  private getMockUpcomingMatches(): Match[] {
    const now = Date.now();
    return [
      { 
        id: 9, 
        home: 'Arsenal', 
        away: 'Chelsea', 
        league: 'Premier League', 
        status: 'upcoming', 
        time: '3:00 PM', 
        date: new Date(now + 7200000).toISOString(),
        activeUsers: 234
      },
      { 
        id: 10, 
        home: 'Real Madrid', 
        away: 'Barcelona', 
        league: 'La Liga', 
        status: 'upcoming', 
        time: '5:30 PM', 
        date: new Date(now + 10800000).toISOString(),
        activeUsers: 456
      },
      { 
        id: 11, 
        home: 'Bayern Munich', 
        away: 'Borussia Dortmund', 
        league: 'Bundesliga', 
        status: 'upcoming', 
        time: '8:00 PM', 
        date: new Date(now + 14400000).toISOString(),
        activeUsers: 189
      },
      { 
        id: 12, 
        home: 'Liverpool', 
        away: 'Manchester United', 
        league: 'Premier League', 
        status: 'upcoming', 
        time: '2:00 PM', 
        date: new Date(now + 18000000).toISOString(),
        activeUsers: 356
      },
    ];
  }

  private getMockLineup(): { home: Lineup; away: Lineup } {
    return {
      home: {
        team: 'Home Team',
        formation: '4-3-3',
        startXI: [
          { name: 'Goalkeeper', number: 1, position: 'GK' },
          { name: 'Right Back', number: 2, position: 'RB' },
          { name: 'Center Back', number: 4, position: 'CB' },
          { name: 'Center Back', number: 5, position: 'CB' },
          { name: 'Left Back', number: 3, position: 'LB' },
          { name: 'Midfielder', number: 6, position: 'CM' },
          { name: 'Midfielder', number: 8, position: 'CM' },
          { name: 'Midfielder', number: 10, position: 'CM' },
          { name: 'Right Wing', number: 7, position: 'RW' },
          { name: 'Striker', number: 9, position: 'ST' },
          { name: 'Left Wing', number: 11, position: 'LW' }
        ],
        substitutes: [
          { name: 'Backup GK', number: 13, position: 'GK' },
          { name: 'Defender', number: 15, position: 'DF' },
          { name: 'Midfielder', number: 16, position: 'MF' }
        ]
      },
      away: {
        team: 'Away Team',
        formation: '4-3-3',
        startXI: [
          { name: 'Goalkeeper', number: 1, position: 'GK' },
          { name: 'Right Back', number: 2, position: 'RB' },
          { name: 'Center Back', number: 4, position: 'CB' },
          { name: 'Center Back', number: 5, position: 'CB' },
          { name: 'Left Back', number: 3, position: 'LB' },
          { name: 'Midfielder', number: 6, position: 'CM' },
          { name: 'Midfielder', number: 8, position: 'CM' },
          { name: 'Midfielder', number: 10, position: 'CM' },
          { name: 'Right Wing', number: 7, position: 'RW' },
          { name: 'Striker', number: 9, position: 'ST' },
          { name: 'Left Wing', number: 11, position: 'LW' }
        ],
        substitutes: [
          { name: 'Backup GK', number: 13, position: 'GK' },
          { name: 'Defender', number: 15, position: 'DF' }
        ]
      }
    };
  }

  private getMockEvents(): MatchEvent[] {
    return [
      { time: "23'", type: 'goal', player: 'Forward', team: 'Home Team' },
      { time: "45'", type: 'card', player: 'Midfielder', team: 'Away Team', detail: 'Yellow Card' },
      { time: "67'", type: 'goal', player: 'Striker', team: 'Away Team' }
    ];
  }
}

export const footballAPI = new FootballAPI();
