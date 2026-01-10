// services/matchDetailService.ts
// Detailed match information including player stats, injuries, predictions


export interface PlayerDetail {
  id: number;
  name: string;
  number: number;
  position: string;
  photo: string;
  age: number;
  nationality: string;
  nationalityFlag: string;
  height: string;
  weight: string;
}

export interface PlayerMatchStats {
  playerId: number;
  name: string;
  // Offensive stats
  goals: number;
  assists: number;
  shotsTotal: number;
  shotsOn: number;
  // Passing stats
  passesTotal: number;
  passesAccurate: number;
  passAccuracy: number;
  keyPasses: number;
  // Defensive stats
  tackles: number;
  interceptions: number;
  duelsWon: number;
  duelsTotal: number;
  // Dribbling stats
  dribblesAttempted: number;
  dribblesSuccess: number;
  // Discipline
  foulsDrawn: number;
  foulsCommitted: number;
  yellowCards: number;
  redCards: number;
  // Performance
  rating: number;
}

export interface TeamNews {
  team: string;
  injuries: {
    player: string;
    reason: string;
    expectedReturn?: string;
  }[];
  suspensions: {
    player: string;
    reason: string;
  }[];
  doubtful: {
    player: string;
    reason: string;
  }[];
}

export interface MatchPrediction {
  home: string;
  away: string;
  predictedScore: string;
  homeWinPercentage: number;
  drawPercentage: number;
  awayWinPercentage: number;
  predictedLineup: {
    home: any[];
    away: any[];
  };
}

export interface TeamForm {
  team: string;
  last5: {
    result: 'W' | 'D' | 'L';
    opponent: string;
    score: string;
    date: string;
  }[];
  position: number;
  points: number;
  goalsScored: number;
  goalsConceded: number;
}

export interface MatchStats {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  corners: { home: number; away: number };
  fouls: { home: number; away: number };
  offsides: { home: number; away: number };
  yellowCards: { home: number; away: number };
  redCards: { home: number; away: number };
  saves: { home: number; away: number };
}

class MatchDetailService {
  private baseURL = 'https://v3.football.api-sports.io';
  private apiKey = '7ee562287b3c02ee8426736fd81d032a';

  private async fetch(endpoint: string) {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        headers: {
          'x-apisports-key': this.apiKey
        }
      });
      
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Match detail API error:', error);
    }
    return null;
  }

  /**
   * Get detailed player information
   */
  async getPlayerDetails(playerId: number, season: number = 2024): Promise<PlayerDetail | null> {
    try {
      const data = await this.fetch(`/players?id=${playerId}&season=${season}`);
      
      if (data?.response?.[0]) {
        const player = data.response[0].player;
        return {
          id: player.id,
          name: player.name,
          number: player.number || 0,
          position: player.position || 'Unknown',
          photo: player.photo,
          age: player.age,
          nationality: player.nationality,
          nationalityFlag: `https://flagcdn.com/w40/${this.getCountryCode(player.nationality)}.png`,
          height: player.height || 'N/A',
          weight: player.weight || 'N/A'
        };
      }
    } catch (error) {
      console.error('Error fetching player details:', error);
    }
    return null;
  }

  /**
   * Get player match statistics
   */
  async getPlayerMatchStats(fixtureId: number, playerId: number): Promise<PlayerMatchStats | null> {
    try {
      const data = await this.fetch(`/fixtures/players?fixture=${fixtureId}`);
      
      if (data?.response) {
        // Find the player in the response
        for (const team of data.response) {
          const player = team.players.find((p: any) => p.player.id === playerId);
          if (player) {
            const stats = player.statistics[0];
            return {
              playerId: player.player.id,
              name: player.player.name,
              goals: stats.goals.total || 0,
              assists: stats.goals.assists || 0,
              shotsTotal: stats.shots.total || 0,
              shotsOn: stats.shots.on || 0,
              passesTotal: stats.passes.total || 0,
              passesAccurate: stats.passes.accuracy || 0,
              passAccuracy: stats.passes.accuracy 
                ? Math.round((stats.passes.accuracy / stats.passes.total) * 100) 
                : 0,
              keyPasses: stats.passes.key || 0,
              tackles: stats.tackles.total || 0,
              interceptions: stats.tackles.interceptions || 0,
              duelsWon: stats.duels.won || 0,
              duelsTotal: stats.duels.total || 0,
              dribblesAttempted: stats.dribbles.attempts || 0,
              dribblesSuccess: stats.dribbles.success || 0,
              foulsDrawn: stats.fouls.drawn || 0,
              foulsCommitted: stats.fouls.committed || 0,
              yellowCards: stats.cards.yellow || 0,
              redCards: stats.cards.red || 0,
              rating: parseFloat(stats.games.rating) || 0
            };
          }
        }
      }
    } catch (error) {
      console.error('Error fetching player match stats:', error);
    }
    return null;
  }

  /**
   * Get team injuries and suspensions
   */
  async getTeamNews(teamId: number): Promise<TeamNews> {
    try {
      const data = await this.fetch(`/injuries?team=${teamId}&season=2024`);
      
      if (data?.response) {
        const injuries = data.response.map((inj: any) => ({
          player: inj.player.name,
          reason: inj.player.reason,
          expectedReturn: inj.player.date
        }));

        return {
          team: data.response[0]?.team?.name || 'Team',
          injuries,
          suspensions: [], // Would need different endpoint
          doubtful: []
        };
      }
    } catch (error) {
      console.error('Error fetching team news:', error);
    }
    
    return this.getMockTeamNews();
  }

  /**
   * Get team form (last 5 matches)
   */
  async getTeamForm(teamId: number): Promise<TeamForm> {
    try {
      const data = await this.fetch(`/fixtures?team=${teamId}&last=5`);
      
      if (data?.response) {
        const matches = data.response.map((match: any) => {
          const isHome = match.teams.home.id === teamId;
          const goalsFor = isHome ? match.goals.home : match.goals.away;
          const goalsAgainst = isHome ? match.goals.away : match.goals.home;
          
          let result: 'W' | 'D' | 'L' = 'D';
          if (goalsFor > goalsAgainst) result = 'W';
          if (goalsFor < goalsAgainst) result = 'L';

          return {
            result,
            opponent: isHome ? match.teams.away.name : match.teams.home.name,
            score: `${goalsFor}-${goalsAgainst}`,
            date: match.fixture.date
          };
        });

        return {
          team: data.response[0]?.teams.home.name || 'Team',
          last5: matches,
          position: 0,
          points: 0,
          goalsScored: 0,
          goalsConceded: 0
        };
      }
    } catch (error) {
      console.error('Error fetching team form:', error);
    }
    
    return this.getMockTeamForm();
  }

  /**
   * Get live match statistics
   */
  async getMatchStats(fixtureId: number): Promise<MatchStats | null> {
    try {
      const data = await this.fetch(`/fixtures/statistics?fixture=${fixtureId}`);
      
      if (data?.response && data.response.length >= 2) {
        const homeStats = data.response[0].statistics;
        const awayStats = data.response[1].statistics;

        const getStat = (stats: any[], type: string) => {
          const stat = stats.find((s: any) => s.type === type);
          return parseInt(stat?.value) || 0;
        };

        return {
          possession: {
            home: getStat(homeStats, 'Ball Possession'),
            away: getStat(awayStats, 'Ball Possession')
          },
          shots: {
            home: getStat(homeStats, 'Total Shots'),
            away: getStat(awayStats, 'Total Shots')
          },
          shotsOnTarget: {
            home: getStat(homeStats, 'Shots on Goal'),
            away: getStat(awayStats, 'Shots on Goal')
          },
          corners: {
            home: getStat(homeStats, 'Corner Kicks'),
            away: getStat(awayStats, 'Corner Kicks')
          },
          fouls: {
            home: getStat(homeStats, 'Fouls'),
            away: getStat(awayStats, 'Fouls')
          },
          offsides: {
            home: getStat(homeStats, 'Offsides'),
            away: getStat(awayStats, 'Offsides')
          },
          yellowCards: {
            home: getStat(homeStats, 'Yellow Cards'),
            away: getStat(awayStats, 'Yellow Cards')
          },
          redCards: {
            home: getStat(homeStats, 'Red Cards'),
            away: getStat(awayStats, 'Red Cards')
          },
          saves: {
            home: getStat(homeStats, 'Goalkeeper Saves'),
            away: getStat(awayStats, 'Goalkeeper Saves')
          }
        };
      }
    } catch (error) {
      console.error('Error fetching match stats:', error);
    }
    return null;
  }

  private getCountryCode(nationality: string): string {
    const codes: { [key: string]: string } = {
      'England': 'gb-eng',
      'Spain': 'es',
      'France': 'fr',
      'Germany': 'de',
      'Italy': 'it',
      'Portugal': 'pt',
      'Brazil': 'br',
      'Argentina': 'ar',
      'Netherlands': 'nl',
      'Belgium': 'be',
      'Croatia': 'hr',
      'Poland': 'pl',
      'Norway': 'no',
      'Sweden': 'se',
      'Denmark': 'dk',
      'Uruguay': 'uy',
      'Colombia': 'co',
      'Mexico': 'mx',
      'USA': 'us',
      'Canada': 'ca',
      'Japan': 'jp',
      'South Korea': 'kr',
      'Egypt': 'eg',
      'Senegal': 'sn',
      'Morocco': 'ma',
      'Algeria': 'dz',
      'Nigeria': 'ng',
      'Ghana': 'gh',
    };
    return codes[nationality] || 'un';
  }

  private getMockTeamNews(): TeamNews {
    return {
      team: 'Team',
      injuries: [
        { player: 'Player Name', reason: 'Hamstring', expectedReturn: '2 weeks' }
      ],
      suspensions: [],
      doubtful: []
    };
  }

  private getMockTeamForm(): TeamForm {
    return {
      team: 'Team',
      last5: [
        { result: 'W', opponent: 'Team A', score: '2-1', date: new Date().toISOString() },
        { result: 'D', opponent: 'Team B', score: '1-1', date: new Date().toISOString() },
        { result: 'W', opponent: 'Team C', score: '3-0', date: new Date().toISOString() },
        { result: 'L', opponent: 'Team D', score: '0-2', date: new Date().toISOString() },
        { result: 'W', opponent: 'Team E', score: '1-0', date: new Date().toISOString() },
      ],
      position: 3,
      points: 45,
      goalsScored: 42,
      goalsConceded: 21
    };
  }
}

export const matchDetailService = new MatchDetailService();