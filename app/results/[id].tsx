// app/results/[id].tsx
// Google-style results details screen
// Shows final score, scorers with assists, and match statistics

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { footballAPI } from '../../services/footballApi';

interface MatchData {
  id: number;
  league: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  status: string;
  homeTeamId: number;
  awayTeamId: number;
  homeLogo?: string;
  awayLogo?: string;
}

interface Stats {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  corners: { home: number; away: number };
  fouls: { home: number; away: number };
  offsides: { home: number; away: number };
  yellowCards: { home: number; away: number };
  redCards: { home: number; away: number };
}

interface GoalEvent {
  minute: number;
  extraMinute?: number;
  scorer: string;
  assist?: string;
  team: 'home' | 'away';
}

export default function ResultsDetails() {
  const { id } = useLocalSearchParams();
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [goals, setGoals] = useState<{ home: GoalEvent[]; away: GoalEvent[] }>({ home: [], away: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mapStats = (statsResponse: any[]) => {
    if (!statsResponse || statsResponse.length < 2) return null;
    const homeStats = statsResponse[0]?.statistics || [];
    const awayStats = statsResponse[1]?.statistics || [];
    
    const getStat = (stats: any[], type: string) => {
      const stat = stats.find((s: any) => s.type === type);
      const value = stat?.value;
      if (typeof value === 'string') {
        return parseInt(value.replace('%', '')) || 0;
      }
      return value || 0;
    };

    return {
      possession: { home: getStat(homeStats, 'Ball Possession'), away: getStat(awayStats, 'Ball Possession') },
      shots: { home: getStat(homeStats, 'Total Shots'), away: getStat(awayStats, 'Total Shots') },
      shotsOnTarget: { home: getStat(homeStats, 'Shots on Goal'), away: getStat(awayStats, 'Shots on Goal') },
      corners: { home: getStat(homeStats, 'Corner Kicks'), away: getStat(awayStats, 'Corner Kicks') },
      fouls: { home: getStat(homeStats, 'Fouls'), away: getStat(awayStats, 'Fouls') },
      offsides: { home: getStat(homeStats, 'Offsides'), away: getStat(awayStats, 'Offsides') },
      yellowCards: { home: getStat(homeStats, 'Yellow Cards'), away: getStat(awayStats, 'Yellow Cards') },
      redCards: { home: getStat(homeStats, 'Red Cards'), away: getStat(awayStats, 'Red Cards') },
    } as Stats;
  };

  const extractGoals = (events: any[], matchData: MatchData) => {
    const homeGoals: GoalEvent[] = [];
    const awayGoals: GoalEvent[] = [];

    events.forEach((event) => {
      const type = (event?.type || '').toLowerCase();
      const detail = (event?.detail || '').toLowerCase();
      
      // Check if it's a goal event
      const isGoal = type === 'goal' || detail.includes('goal') || detail.includes('penalty');
      
      if (!isGoal) return;

      const team = event.team?.id === matchData.homeTeamId ? 'home' : 
                    event.team?.id === matchData.awayTeamId ? 'away' : null;
      
      if (!team) return;

      const goalEvent: GoalEvent = {
        minute: event.time?.elapsed || 0,
        extraMinute: event.time?.extra || undefined,
        scorer: event.player?.name || 'Unknown',
        assist: event.assist?.name,
        team
      };

      if (team === 'home') {
        homeGoals.push(goalEvent);
      } else {
        awayGoals.push(goalEvent);
      }
    });

    return { home: homeGoals, away: awayGoals };
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!id) {
        setError('No match ID provided');
        setLoading(false);
        return;
      }

      const fixtureId = Number(id);
      if (Number.isNaN(fixtureId)) {
        setError('Invalid match ID');
        setLoading(false);
        return;
      }

      try {
        const liveData = await footballAPI.getFixtureLive(fixtureId);
        
        if (!liveData.fixture) {
          setError('Match not found');
          setLoading(false);
          return;
        }

        const fixture = liveData.fixture;

        const mappedMatch: MatchData = {
          id: fixture.fixture.id,
          league: fixture.league.name,
          home: fixture.teams.home.name,
          away: fixture.teams.away.name,
          homeScore: fixture.goals.home || 0,
          awayScore: fixture.goals.away || 0,
          status: fixture.fixture?.status?.short || 'FT',
          homeTeamId: fixture.teams.home.id,
          awayTeamId: fixture.teams.away.id,
          homeLogo: fixture.teams.home.logo,
          awayLogo: fixture.teams.away.logo,
        };

        setMatchData(mappedMatch);
        setStats(mapStats(liveData.statistics));
        setGoals(extractGoals(liveData.events, mappedMatch));
        setLoading(false);
      } catch (err) {
        console.error('Error fetching match data:', err);
        setError('Failed to load match data');
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const renderStat = (label: string, homeValue: number, awayValue: number) => {
    const total = homeValue + awayValue;
    const homePercent = total > 0 ? (homeValue / total) * 100 : 50;
    const awayPercent = 100 - homePercent;

    return (
      <View style={styles.statRow}>
        <Text style={styles.statValue}>{homeValue}</Text>
        <View style={styles.statCenter}>
          <Text style={styles.statLabel}>{label}</Text>
          <View style={styles.statBar}>
            <View style={[styles.statBarHome, { width: `${homePercent}%` }]} />
            <View style={[styles.statBarAway, { width: `${awayPercent}%` }]} />
          </View>
        </View>
        <Text style={styles.statValue}>{awayValue}</Text>
      </View>
    );
  };

  const formatMinute = (minute: number, extra?: number) => {
    if (extra) {
      return `${minute}+${extra}'`;
    }
    return `${minute}'`;
  };

  const renderScorers = (scorers: GoalEvent[], alignment: 'left' | 'right') => {
  // Group by scorer to aggregate minutes
  const scorerMap = new Map<string, { minutes: string[]; assists: string[] }>();
  
  scorers.forEach((goal) => {
    const existing = scorerMap.get(goal.scorer);
    const minuteStr = formatMinute(goal.minute, goal.extraMinute);
    
    if (existing) {
      existing.minutes.push(minuteStr);
      if (goal.assist) {
        existing.assists.push(goal.assist);
      }
    } else {
      scorerMap.set(goal.scorer, {
        minutes: [minuteStr],
        assists: goal.assist ? [goal.assist] : []
      });
    }
  });

  return Array.from(scorerMap.entries()).map(([scorer, data], index) => {
    const minutesStr = data.minutes.join(', ');
    const assistStr = data.assists.length > 0 ? ` (${data.assists.join(', ')})` : '';
    
    return (
      <Text 
        key={`${scorer}-${index}`} 
        style={[
          styles.scorerText,
          alignment === 'left' ? styles.scorerTextLeft : styles.scorerTextRight
        ]}
      >
        {scorer} {minutesStr}{assistStr}
      </Text>
    );
  });
};

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#0066CC" />
          <Text style={styles.loadingText}>Loading match results...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !matchData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle" size={64} color="#FF3B30" />
          <Text style={styles.errorText}>{error || 'Match data unavailable'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Match Result</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Google-style result header */}
        <View style={styles.resultHeader}>
          <Text style={styles.leagueText}>{matchData.league}</Text>
          
          {/* Centered scoreline */}
          <View style={styles.scorelineRow}>
            <View style={styles.teamSection}>
              {matchData.homeLogo && (
                <Image source={{ uri: matchData.homeLogo }} style={styles.teamLogo} />
              )}
              <Text style={styles.teamName} numberOfLines={2}>{matchData.home}</Text>
            </View>

            <View style={styles.scorePill}>
              <Text style={styles.scoreText}>{matchData.homeScore}</Text>
              <Text style={styles.scoreDash}>-</Text>
              <Text style={styles.scoreText}>{matchData.awayScore}</Text>
            </View>

            <View style={styles.teamSection}>
              {matchData.awayLogo && (
                <Image source={{ uri: matchData.awayLogo }} style={styles.teamLogo} />
              )}
              <Text style={styles.teamName} numberOfLines={2}>{matchData.away}</Text>
            </View>
          </View>

          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{matchData.status}</Text>
          </View>

          {/* Scorers section */}
          {/* Scorers section */}
{(goals.home.length > 0 || goals.away.length > 0) && (
  <View style={styles.scorersSection}>
    <View style={styles.scorersRow}>
      <View style={styles.scorersColumnLeft}>
        {renderScorers(goals.home, 'left')}
      </View>
      <View style={styles.scorersColumnRight}>
        {renderScorers(goals.away, 'right')}
      </View>
    </View>
  </View>
)}
        </View>

        {/* Stats Section */}
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Match Statistics</Text>
          {stats ? (
            <>
              {renderStat('Possession', stats.possession.home, stats.possession.away)}
              {renderStat('Shots', stats.shots.home, stats.shots.away)}
              {renderStat('Shots on Target', stats.shotsOnTarget.home, stats.shotsOnTarget.away)}
              {renderStat('Corners', stats.corners.home, stats.corners.away)}
              {renderStat('Fouls', stats.fouls.home, stats.fouls.away)}
              {renderStat('Offsides', stats.offsides.home, stats.offsides.away)}
              {renderStat('Yellow Cards', stats.yellowCards.home, stats.yellowCards.away)}
              {renderStat('Red Cards', stats.redCards.home, stats.redCards.away)}
            </>
          ) : (
            <View style={styles.centerContent}>
              <Text style={styles.emptyText}>No statistics available</Text>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#0066CC',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#2C2C2E',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFF',
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    flex: 1,
  },
  resultHeader: {
    padding: 20,
    backgroundColor: '#2C2C2E',
    marginBottom: 12,
  },
  leagueText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 16,
  },
  scorelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  teamLogo: {
    width: 60,
    height: 60,
  },
  teamName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3C3C3E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 80,
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFF',
  },
  scoreDash: {
    fontSize: 28,
    fontWeight: '900',
    color: '#777',
    marginHorizontal: 8,
  },
  statusBadge: {
    alignSelf: 'center',
    backgroundColor: '#3C3C3E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 12,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
  },
  scorersSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#3C3C3E',
  },
  scorersRow: {
    flexDirection: 'row',
    gap: 16,
  },
  scorersColumnLeft: {
  flex: 1,
  gap: 8,
  alignItems: 'flex-start',
},
scorersColumnRight: {
  flex: 1,
  gap: 8,
  alignItems: 'flex-end',
},
scorerText: {
  fontSize: 13,
  color: '#FFF',
  lineHeight: 18,
},
scorerTextLeft: {
  textAlign: 'left',
},
scorerTextRight: {
  textAlign: 'right',
},
  statsContainer: {
    padding: 20,
    backgroundColor: '#1C1C1E',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 20,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    width: 40,
    textAlign: 'center',
  },
  statCenter: {
    flex: 1,
    marginHorizontal: 16,
  },
  statLabel: {
    fontSize: 13,
    color: '#999',
    marginBottom: 8,
    textAlign: 'center',
  },
  statBar: {
    height: 8,
    backgroundColor: '#3C3C3E',
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  statBarHome: {
    backgroundColor: '#0066CC',
  },
  statBarAway: {
    backgroundColor: '#FF3B30',
  },
});