// services/testData.ts
// Test data for development - Includes sample Liverpool vs Arsenal live game

import { Lineup, Match, MatchEvent } from './footballApi';

// Sample Liverpool vs Arsenal live game for testing
export const SAMPLE_LIVE_MATCH: Match = {
  id: 99999, // Unique test ID
  home: 'Liverpool',
  away: 'Arsenal',
  score: '2-0',
  time: '15:00',
  league: 'Premier League',
  status: 'live',
  minute: '67\'',
  date: new Date().toISOString(),
  activeUsers: 12453,
  homeLogo: 'https://media.api-sports.io/football/teams/40.png',
  awayLogo: 'https://media.api-sports.io/football/teams/42.png'
};

// Sample events for the Liverpool vs Arsenal match
export const SAMPLE_MATCH_EVENTS: MatchEvent[] = [
  {
    time: '23\'',
    type: 'goal',
    player: 'Mohamed Salah',
    team: 'Liverpool',
    detail: 'Right-footed shot from outside the box'
  },
  {
    time: '41\'',
    type: 'card',
    player: 'Gabriel',
    team: 'Arsenal',
    detail: 'Yellow Card - Foul'
  },
  {
    time: '55\'',
    type: 'goal',
    player: 'Cody Gakpo',
    team: 'Liverpool',
    detail: 'Header from corner'
  },
  {
    time: '62\'',
    type: 'substitution',
    player: 'Darwin Nunez',
    team: 'Liverpool',
    detail: 'Replaces Luis Diaz'
  }
];

// Sample lineups
export const SAMPLE_LINEUPS: { home: Lineup; away: Lineup } = {
  home: {
    team: 'Liverpool',
    formation: '4-3-3',
    startXI: [
      { name: 'Alisson', number: 1, position: 'G' },
      { name: 'Alexander-Arnold', number: 66, position: 'D' },
      { name: 'Konaté', number: 5, position: 'D' },
      { name: 'Van Dijk', number: 4, position: 'D' },
      { name: 'Robertson', number: 26, position: 'D' },
      { name: 'Szoboszlai', number: 8, position: 'M' },
      { name: 'Mac Allister', number: 10, position: 'M' },
      { name: 'Gravenberch', number: 38, position: 'M' },
      { name: 'Salah', number: 11, position: 'F' },
      { name: 'Gakpo', number: 18, position: 'F' },
      { name: 'Diaz', number: 7, position: 'F' }
    ],
    substitutes: [
      { name: 'Kelleher', number: 62, position: 'G' },
      { name: 'Gomez', number: 2, position: 'D' },
      { name: 'Nunez', number: 9, position: 'F' },
      { name: 'Jones', number: 17, position: 'M' },
      { name: 'Elliott', number: 19, position: 'M' }
    ]
  },
  away: {
    team: 'Arsenal',
    formation: '4-3-3',
    startXI: [
      { name: 'Raya', number: 22, position: 'G' },
      { name: 'White', number: 4, position: 'D' },
      { name: 'Saliba', number: 2, position: 'D' },
      { name: 'Gabriel', number: 6, position: 'D' },
      { name: 'Timber', number: 12, position: 'D' },
      { name: 'Rice', number: 41, position: 'M' },
      { name: 'Odegaard', number: 8, position: 'M' },
      { name: 'Havertz', number: 29, position: 'M' },
      { name: 'Saka', number: 7, position: 'F' },
      { name: 'Jesus', number: 9, position: 'F' },
      { name: 'Martinelli', number: 11, position: 'F' }
    ],
    substitutes: [
      { name: 'Ramsdale', number: 1, position: 'G' },
      { name: 'Kiwior', number: 15, position: 'D' },
      { name: 'Trossard', number: 19, position: 'F' },
      { name: 'Jorginho', number: 20, position: 'M' },
      { name: 'Nketiah', number: 14, position: 'F' }
    ]
  }
};

// Sample chat messages for the Liverpool vs Arsenal match
export const SAMPLE_CHAT_MESSAGES = [
  {
    id: 'test-1',
    odId: 'user-1',
    username: 'RedsFan92',
    text: 'What a goal by Salah! 🔥🔥🔥',
    timestamp: Date.now() - 2400000,
    reactions: { '❤️': 23, '🔥': 15 },
    type: 'user'
  },
  {
    id: 'test-2',
    odId: 'system',
    username: 'System',
    text: '⚽ GOAL! Mohamed Salah (Liverpool) 1-0',
    timestamp: Date.now() - 2340000,
    reactions: {},
    type: 'system'
  },
  {
    id: 'test-3',
    odId: 'user-2',
    username: 'GunnersPride',
    text: 'Come on Arsenal! We can still do this',
    timestamp: Date.now() - 1800000,
    reactions: { '👍': 8 },
    type: 'user'
  },
  {
    id: 'test-4',
    odId: 'user-3',
    username: 'LFCYorker',
    text: 'Anfield is BOUNCING right now!',
    timestamp: Date.now() - 1200000,
    reactions: { '❤️': 12, '🔥': 5 },
    type: 'user'
  },
  {
    id: 'test-5',
    odId: 'system',
    username: 'System',
    text: '⚽ GOAL! Cody Gakpo (Liverpool) 2-0',
    timestamp: Date.now() - 720000,
    reactions: {},
    type: 'system'
  },
  {
    id: 'test-6',
    odId: 'user-4',
    username: 'FootballFanatic99',
    text: 'Liverpool looking unstoppable today! YNWA',
    timestamp: Date.now() - 300000,
    reactions: { '❤️': 7, '⚽': 3 },
    type: 'user'
  }
];

// Flag to enable/disable test mode
export const TEST_MODE = true;

// Function to check if we should use test data
export const shouldUseTestData = (): boolean => {
  return TEST_MODE;
};

// Function to get test live matches
export const getTestLiveMatches = (): Match[] => {
  if (!TEST_MODE) return [];
  return [SAMPLE_LIVE_MATCH];
};

// Function to merge test matches with real data
export const mergeWithTestData = (realMatches: Match[]): Match[] => {
  if (!TEST_MODE) return realMatches;
  
  // Add test match if not already live matches
  const hasTestMatch = realMatches.some(m => m.id === SAMPLE_LIVE_MATCH.id);
  if (!hasTestMatch) {
    return [SAMPLE_LIVE_MATCH, ...realMatches];
  }
  return realMatches;
};