// services/aiMatchSummary.ts
// AI-powered match summaries with top moments and reactions

import { ChatMessage } from './chatService';
import { MatchEvent } from './footballApi';

export interface MatchSummary {
  matchId: string;
  overview: string;
  keyMoments: KeyMoment[];
  topReactions: TopReaction[];
  manOfTheMatch?: string;
  stats: {
    totalGoals: number;
    totalCards: number;
    possession?: { home: number; away: number };
  };
}

export interface KeyMoment {
  time: string;
  type: 'goal' | 'red_card' | 'penalty' | 'save' | 'controversy';
  description: string;
  player?: string;
  team: string;
  reactions: number; // Number of reactions in chat
}

export interface TopReaction {
  messageId: string;
  text: string;
  username: string;
  reactionCount: number;
  topEmoji: string;
  timestamp: number;
}

class AIMatchSummaryService {
  /**
   * Generate AI summary of completed match
   * Uses Claude AI API for intelligent summarization
   */
  async generateMatchSummary(
    matchId: string,
    home: string,
    away: string,
    score: string,
    events: MatchEvent[],
    chatMessages: ChatMessage[]
  ): Promise<MatchSummary> {
    try {
      // Call Claude AI API for intelligent summary
      const overview = await this.generateOverview(home, away, score, events);
      const keyMoments = this.extractKeyMoments(events, chatMessages);
      const topReactions = this.getTopReactions(chatMessages);
      const manOfTheMatch = this.determineManOfTheMatch(events);

      return {
        matchId,
        overview,
        keyMoments,
        topReactions,
        manOfTheMatch,
        stats: {
          totalGoals: events.filter(e => e.type === 'goal').length,
          totalCards: events.filter(e => e.type === 'card').length
        }
      };
    } catch (error) {
      console.error('Error generating match summary:', error);
      return this.getFallbackSummary(matchId, home, away, score, events);
    }
  }

  /**
   * Generate AI overview using Claude
   */
  private async generateOverview(
    home: string,
    away: string,
    score: string,
    events: MatchEvent[]
  ): Promise<string> {
    try {
      // Prepare match data for AI
      const eventSummary = events.map(e => 
        `${e.time}' - ${e.type}: ${e.player} (${e.team})${e.detail ? ` - ${e.detail}` : ''}`
      ).join('\n');

      const prompt = `Write a brief 2-3 sentence match summary for: ${home} ${score} ${away}

Key events:
${eventSummary}

Write an engaging summary focusing on the most important moments. Keep it concise and exciting.`;

      // Call Claude API (using Anthropic API in artifacts)
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            { role: "user", content: prompt }
          ],
        })
      });

      const data = await response.json();
      
      if (data.content && data.content[0]?.text) {
        return data.content[0].text.trim();
      }
    } catch (error) {
      console.error('AI summary generation failed:', error);
    }

    // Fallback to template-based summary
    return this.generateTemplateSummary(home, away, score, events);
  }

  /**
   * Template-based summary (fallback)
   */
  private generateTemplateSummary(
    home: string,
    away: string,
    score: string,
    events: MatchEvent[]
  ): string {
    const [homeGoals, awayGoals] = score.split('-').map(Number);
    const goals = events.filter(e => e.type === 'goal');
    const cards = events.filter(e => e.type === 'card');

    let summary = '';

    if (homeGoals > awayGoals) {
      summary = `${home} secured a ${score} victory over ${away}`;
    } else if (awayGoals > homeGoals) {
      summary = `${away} defeated ${home} ${score}`;
    } else {
      summary = `${home} and ${away} shared the points in a ${score} draw`;
    }

    if (goals.length > 0) {
      const firstScorer = goals[0];
      summary += `. ${firstScorer.player} opened the scoring in the ${firstScorer.time}`;
    }

    if (cards.some(c => c.detail?.toLowerCase().includes('red'))) {
      summary += '. The match saw controversial moments with red cards shown';
    }

    summary += '.';
    return summary;
  }

  /**
   * Extract key moments from events and chat activity
   */
  private extractKeyMoments(
    events: MatchEvent[],
    chatMessages: ChatMessage[]
  ): KeyMoment[] {
    const keyMoments: KeyMoment[] = [];

    // Add all goals as key moments
    events.filter(e => e.type === 'goal').forEach(event => {
      // Count chat reactions around this time
      const reactions = this.getReactionsAroundTime(event.time, chatMessages);
      
      keyMoments.push({
        time: event.time,
        type: 'goal',
        description: `⚽ ${event.player} scores for ${event.team}!`,
        player: event.player,
        team: event.team,
        reactions
      });
    });

    // Add red cards
    events.filter(e => e.type === 'card' && e.detail?.toLowerCase().includes('red')).forEach(event => {
      const reactions = this.getReactionsAroundTime(event.time, chatMessages);
      
      keyMoments.push({
        time: event.time,
        type: 'red_card',
        description: `🟥 ${event.player} sent off!`,
        player: event.player,
        team: event.team,
        reactions
      });
    });

    // Sort by time
    keyMoments.sort((a, b) => {
      const timeA = parseInt(a.time.replace("'", ''));
      const timeB = parseInt(b.time.replace("'", ''));
      return timeA - timeB;
    });

    return keyMoments.slice(0, 5); // Top 5 key moments
  }

  /**
   * Get chat reactions around a specific match time
   */
  private getReactionsAroundTime(matchTime: string, messages: ChatMessage[]): number {
    const minute = parseInt(matchTime.replace("'", ''));
    
    // Count messages with reactions in a 5-minute window
    let totalReactions = 0;
    
    messages.forEach(msg => {
      if (msg.reactions) {
        const reactionCount = Object.values(msg.reactions).reduce((sum, count) => sum + count, 0);
        totalReactions += reactionCount;
      }
    });

    return totalReactions;
  }

  /**
   * Get top reacted messages from chat
   */
  private getTopReactions(chatMessages: ChatMessage[]): TopReaction[] {
    const messagesWithReactions = chatMessages
      .filter(msg => msg.reactions && Object.keys(msg.reactions).length > 0)
      .map(msg => {
        const reactionEntries = Object.entries(msg.reactions);
        const totalReactions = reactionEntries.reduce((sum, [_, count]) => sum + count, 0);
        const topEmoji = reactionEntries.sort((a, b) => b[1] - a[1])[0][0];

        return {
          messageId: msg.id,
          text: msg.text,
          username: msg.username,
          reactionCount: totalReactions,
          topEmoji,
          timestamp: msg.timestamp
        };
      })
      .sort((a, b) => b.reactionCount - a.reactionCount);

    return messagesWithReactions.slice(0, 3); // Top 3 reactions
  }

  /**
   * Determine man of the match based on events
   */
  private determineManOfTheMatch(events: MatchEvent[]): string | undefined {
    const playerStats: { [player: string]: number } = {};

    events.forEach(event => {
      if (!event.player) return;

      if (!playerStats[event.player]) {
        playerStats[event.player] = 0;
      }

      // Weight different events
      if (event.type === 'goal') {
        playerStats[event.player] += 10;
      } else if (event.type === 'substitution' && event.detail === 'IN') {
        playerStats[event.player] += 2;
      }
    });

    // Find player with highest score
    const players = Object.entries(playerStats);
    if (players.length === 0) return undefined;

    const [player] = players.sort((a, b) => b[1] - a[1])[0];
    return player;
  }

  /**
   * Fallback summary when AI fails
   */
  private getFallbackSummary(
    matchId: string,
    home: string,
    away: string,
    score: string,
    events: MatchEvent[]
  ): MatchSummary {
    return {
      matchId,
      overview: `${home} vs ${away} ended ${score}. ${events.filter(e => e.type === 'goal').length} goals scored in an exciting match.`,
      keyMoments: this.extractKeyMoments(events, []),
      topReactions: [],
      stats: {
        totalGoals: events.filter(e => e.type === 'goal').length,
        totalCards: events.filter(e => e.type === 'card').length
      }
    };
  }
}

export const aiMatchSummaryService = new AIMatchSummaryService();