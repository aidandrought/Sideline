// services/testData.ts
// Test data for Liverpool vs Arsenal match
// Used for development and testing purposes

import { ChatMessage } from './chatService';
import { Match, MatchEvent } from './footballApi';

// Player image URLs - Premier League official CDN
const PL_PLAYER_IMAGES = {
  // Liverpool
  kelleher: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p243016.png',
  alexanderArnold: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p169187.png',
  konate: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p242905.png',
  vanDijk: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p97032.png',
  robertson: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p122798.png',
  gravenberch: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p469969.png',
  macAllister: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p180190.png',
  szoboszlai: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p243379.png',
  salah: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p118748.png',
  gakpo: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p210868.png',
  diaz: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p446177.png',
  nunez: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p447203.png',
  
  // Arsenal
  raya: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p109533.png',
  white: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p223340.png',
  saliba: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p239958.png',
  gabriel: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p222728.png',
  timber: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p430567.png',
  rice: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p204480.png',
  odegaard: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p184029.png',
  merino: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p221623.png',
  saka: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p223340.png',
  havertz: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p227127.png',
  martinelli: 'https://resources.premierleague.com/premierleague/photos/players/250x250/p444145.png',
};

export interface PlayerWithImage {
  name: string;
  number: number;
  position: string;
  imageUrl?: string;
  hasGoal?: boolean;
  hasAssist?: boolean;
  hasYellowCard?: boolean;
  hasRedCard?: boolean;
  rating?: number;
}

export interface ExtendedLineup {
  team: string;
  teamColor: string;
  formation: string;
  startXI: PlayerWithImage[];
  substitutes: PlayerWithImage[];
}

export interface MatchStats {
  possession: [number, number];
  shots: [number, number];
  shotsOnTarget: [number, number];
  corners: [number, number];
  fouls: [number, number];
  offsides: [number, number];
  yellowCards: [number, number];
  redCards: [number, number];
  passAccuracy: [number, number];
}

// Test Live Match - Liverpool 2-1 Arsenal (recent match)
export const SAMPLE_LIVE_MATCH: Match = {
  id: 999999,
  home: 'Liverpool',
  away: 'Arsenal',
  score: '2-1',
  minute: "67'",
  league: 'Premier League',
  status: 'live',
  date: new Date().toISOString(),
  activeUsers: 12453,
  homeLogo: '🔴',
  awayLogo: '🔴',
};

// Match Events
export const SAMPLE_MATCH_EVENTS: MatchEvent[] = [
  { time: "23'", type: 'goal', player: 'Mohamed Salah', team: 'Liverpool', detail: 'Right foot shot from outside the box. Assisted by Trent Alexander-Arnold.' },
  { time: "34'", type: 'card', player: 'Martin Ødegaard', team: 'Arsenal', detail: 'Yellow Card - Tactical foul' },
  { time: "45+2'", type: 'goal', player: 'Luis Díaz', team: 'Liverpool', detail: 'Header from close range. Assisted by Mohamed Salah.' },
  { time: "56'", type: 'goal', player: 'Bukayo Saka', team: 'Arsenal', detail: 'Penalty - right side' },
  { time: "62'", type: 'substitution', player: 'Darwin Núñez', team: 'Liverpool', detail: 'Replaces Cody Gakpo' },
];

// Extended Lineups with player images
export const SAMPLE_LINEUPS: { home: ExtendedLineup; away: ExtendedLineup } = {
  home: {
    team: 'Liverpool',
    teamColor: '#C8102E',
    formation: '4-3-3',
    startXI: [
      { name: 'Kelleher', number: 62, position: 'GK', imageUrl: PL_PLAYER_IMAGES.kelleher },
      { name: 'Alexander-Arnold', number: 66, position: 'RB', imageUrl: PL_PLAYER_IMAGES.alexanderArnold, hasAssist: true },
      { name: 'Konaté', number: 5, position: 'CB', imageUrl: PL_PLAYER_IMAGES.konate },
      { name: 'Van Dijk', number: 4, position: 'CB', imageUrl: PL_PLAYER_IMAGES.vanDijk },
      { name: 'Robertson', number: 26, position: 'LB', imageUrl: PL_PLAYER_IMAGES.robertson },
      { name: 'Gravenberch', number: 38, position: 'CM', imageUrl: PL_PLAYER_IMAGES.gravenberch },
      { name: 'Mac Allister', number: 10, position: 'CM', imageUrl: PL_PLAYER_IMAGES.macAllister },
      { name: 'Szoboszlai', number: 8, position: 'CM', imageUrl: PL_PLAYER_IMAGES.szoboszlai },
      { name: 'Salah', number: 11, position: 'RW', imageUrl: PL_PLAYER_IMAGES.salah, hasGoal: true, hasAssist: true, rating: 9.2 },
      { name: 'Gakpo', number: 18, position: 'ST', imageUrl: PL_PLAYER_IMAGES.gakpo },
      { name: 'Díaz', number: 7, position: 'LW', imageUrl: PL_PLAYER_IMAGES.diaz, hasGoal: true, rating: 8.5 },
    ],
    substitutes: [
      { name: 'Núñez', number: 9, position: 'ST', imageUrl: PL_PLAYER_IMAGES.nunez },
      { name: 'Jones', number: 17, position: 'CM' },
      { name: 'Endo', number: 3, position: 'CM' },
      { name: 'Bradley', number: 84, position: 'RB' },
      { name: 'Tsimikas', number: 21, position: 'LB' },
    ],
  },
  away: {
    team: 'Arsenal',
    teamColor: '#EF0107',
    formation: '4-3-3',
    startXI: [
      { name: 'Raya', number: 22, position: 'GK', imageUrl: PL_PLAYER_IMAGES.raya },
      { name: 'White', number: 4, position: 'RB', imageUrl: PL_PLAYER_IMAGES.white },
      { name: 'Saliba', number: 2, position: 'CB', imageUrl: PL_PLAYER_IMAGES.saliba },
      { name: 'Gabriel', number: 6, position: 'CB', imageUrl: PL_PLAYER_IMAGES.gabriel },
      { name: 'Timber', number: 12, position: 'LB', imageUrl: PL_PLAYER_IMAGES.timber },
      { name: 'Rice', number: 41, position: 'CM', imageUrl: PL_PLAYER_IMAGES.rice },
      { name: 'Ødegaard', number: 8, position: 'CM', imageUrl: PL_PLAYER_IMAGES.odegaard, hasYellowCard: true },
      { name: 'Merino', number: 23, position: 'CM', imageUrl: PL_PLAYER_IMAGES.merino },
      { name: 'Saka', number: 7, position: 'RW', imageUrl: PL_PLAYER_IMAGES.saka, hasGoal: true, rating: 7.8 },
      { name: 'Havertz', number: 29, position: 'ST', imageUrl: PL_PLAYER_IMAGES.havertz },
      { name: 'Martinelli', number: 11, position: 'LW', imageUrl: PL_PLAYER_IMAGES.martinelli },
    ],
    substitutes: [
      { name: 'Nketiah', number: 14, position: 'ST' },
      { name: 'Kiwior', number: 15, position: 'CB' },
      { name: 'Trossard', number: 19, position: 'LW' },
      { name: 'Partey', number: 5, position: 'CM' },
      { name: 'Zinchenko', number: 35, position: 'LB' },
    ],
  },
};

// Match Statistics
export const SAMPLE_MATCH_STATS: MatchStats = {
  possession: [58, 42],
  shots: [14, 9],
  shotsOnTarget: [6, 4],
  corners: [7, 3],
  fouls: [8, 11],
  offsides: [2, 3],
  yellowCards: [0, 1],
  redCards: [0, 0],
  passAccuracy: [89, 84],
};

// Sample Chat Messages for the match
export const SAMPLE_CHAT_MESSAGES: Partial<ChatMessage>[] = [
  {
    id: 'msg_1',
    userId: 'system',
    username: 'Sideline',
    text: '⚽ Welcome to Liverpool vs Arsenal! Chat opens 45 minutes before kickoff.',
    timestamp: Date.now() - 3600000,
    reactions: {},
    type: 'system',
  },
  {
    id: 'msg_2',
    userId: 'user_abc',
    username: 'KopEnd_Legend',
    text: 'YNWA! Come on Liverpool! 🔴',
    timestamp: Date.now() - 2400000,
    reactions: { '❤️': 24, '🔥': 12 },
    type: 'user',
  },
  {
    id: 'msg_3',
    userId: 'user_def',
    username: 'Gooner4Life',
    text: 'Arsenal are going to win this. Saka is on fire this season 🔥',
    timestamp: Date.now() - 2300000,
    reactions: { '👍': 8, '😂': 5 },
    type: 'user',
  },
  {
    id: 'msg_4',
    userId: 'system',
    username: 'Sideline',
    text: "⚽ GOAL! Salah scores for Liverpool! 1-0 (23')",
    timestamp: Date.now() - 2000000,
    reactions: { '⚽': 156, '🔥': 89, '❤️': 67 },
    type: 'system',
  },
  {
    id: 'msg_5',
    userId: 'user_ghi',
    username: 'AnfieldRoar',
    text: 'SALAAAAHHHH!!! WHAT A GOAL!! THE KING 👑',
    timestamp: Date.now() - 1900000,
    reactions: { '❤️': 45, '🔥': 32, '👑': 28 },
    type: 'user',
  },
  {
    id: 'msg_6',
    userId: 'user_jkl',
    username: 'NorthLondonForever',
    text: 'Defense sleeping there. Come on Arsenal wake up!',
    timestamp: Date.now() - 1800000,
    reactions: { '😢': 12 },
    type: 'user',
  },
  {
    id: 'msg_7',
    userId: 'system',
    username: 'Sideline',
    text: "🟨 Yellow Card - Ødegaard (Arsenal) 34'",
    timestamp: Date.now() - 1500000,
    reactions: {},
    type: 'system',
  },
  {
    id: 'msg_8',
    userId: 'system',
    username: 'Sideline',
    text: "⚽ GOAL! Díaz scores for Liverpool! 2-0 (45+2')",
    timestamp: Date.now() - 1200000,
    reactions: { '⚽': 134, '🔥': 78, '❤️': 56 },
    type: 'system',
  },
  {
    id: 'msg_9',
    userId: 'user_mno',
    username: 'LiverpoolFirst',
    text: 'DIAZ!!! Header from nowhere! 2-0 going into halftime 🔥🔥🔥',
    timestamp: Date.now() - 1100000,
    reactions: { '🔥': 67, '❤️': 34 },
    type: 'user',
  },
  {
    id: 'msg_10',
    userId: 'system',
    username: 'Sideline',
    text: "⚽ GOAL! Saka scores for Arsenal! Penalty. 2-1 (56')",
    timestamp: Date.now() - 800000,
    reactions: { '⚽': 89, '👏': 45 },
    type: 'system',
  },
  {
    id: 'msg_11',
    userId: 'user_pqr',
    username: 'GunnerNation',
    text: 'SAKAAA!! Game on! Come on Arsenal we can do this! 💪',
    timestamp: Date.now() - 700000,
    reactions: { '🔥': 34, '💪': 28 },
    type: 'user',
  },
  {
    id: 'msg_12',
    userId: 'user_stu',
    username: 'RedMenTV',
    text: 'Núñez coming on. Slot going for the kill here. Smart management.',
    timestamp: Date.now() - 500000,
    reactions: { '👍': 23 },
    type: 'user',
  },
];

// Top Reactions for post-match summary
export const TOP_REACTIONS = [
  {
    messageId: 'msg_5',
    text: 'SALAAAAHHHH!!! WHAT A GOAL!! THE KING 👑',
    username: 'AnfieldRoar',
    timestamp: Date.now() - 1900000,
    totalReactions: 105,
  },
  {
    messageId: 'msg_9',
    text: 'DIAZ!!! Header from nowhere! 2-0 going into halftime 🔥🔥🔥',
    username: 'LiverpoolFirst',
    timestamp: Date.now() - 1100000,
    totalReactions: 101,
  },
  {
    messageId: 'msg_11',
    text: 'SAKAAA!! Game on! Come on Arsenal we can do this! 💪',
    username: 'GunnerNation',
    timestamp: Date.now() - 700000,
    totalReactions: 62,
  },
  {
    messageId: 'msg_2',
    text: 'YNWA! Come on Liverpool! 🔴',
    username: 'KopEnd_Legend',
    timestamp: Date.now() - 2400000,
    totalReactions: 36,
  },
  {
    messageId: 'msg_12',
    text: 'Núñez coming on. Slot going for the kill here. Smart management.',
    username: 'RedMenTV',
    timestamp: Date.now() - 500000,
    totalReactions: 23,
  },
];

// Upcoming matches for the week
export const SAMPLE_UPCOMING_MATCHES: Match[] = [
  {
    id: 1001,
    home: 'Manchester City',
    away: 'Chelsea',
    league: 'Premier League',
    status: 'upcoming',
    time: '3:00 PM',
    date: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    activeUsers: 0,
  },
  {
    id: 1002,
    home: 'Real Madrid',
    away: 'Barcelona',
    league: 'La Liga',
    status: 'upcoming',
    time: '9:00 PM',
    date: new Date(Date.now() + 172800000).toISOString(), // 2 days
    activeUsers: 0,
  },
  {
    id: 1003,
    home: 'Bayern Munich',
    away: 'Borussia Dortmund',
    league: 'Bundesliga',
    status: 'upcoming',
    time: '6:30 PM',
    date: new Date(Date.now() + 86400000).toISOString(),
    activeUsers: 0,
  },
  {
    id: 1004,
    home: 'Inter Milan',
    away: 'AC Milan',
    league: 'Serie A',
    status: 'upcoming',
    time: '7:45 PM',
    date: new Date(Date.now() + 259200000).toISOString(), // 3 days
    activeUsers: 0,
  },
  {
    id: 1005,
    home: 'PSG',
    away: 'Marseille',
    league: 'Ligue 1',
    status: 'upcoming',
    time: '8:45 PM',
    date: new Date(Date.now() + 259200000).toISOString(),
    activeUsers: 0,
  },
  {
    id: 1006,
    home: 'Liverpool',
    away: 'Real Madrid',
    league: 'UEFA Champions League',
    status: 'upcoming',
    time: '8:00 PM',
    date: new Date(Date.now() + 345600000).toISOString(), // 4 days
    activeUsers: 0,
  },
  {
    id: 1007,
    home: 'Arsenal',
    away: 'Tottenham',
    league: 'Premier League',
    status: 'upcoming',
    time: '4:30 PM',
    date: new Date(Date.now() + 432000000).toISOString(), // 5 days
    activeUsers: 0,
  },
  {
    id: 1008,
    home: 'Juventus',
    away: 'Napoli',
    league: 'Serie A',
    status: 'upcoming',
    time: '8:00 PM',
    date: new Date(Date.now() + 518400000).toISOString(), // 6 days
    activeUsers: 0,
  },
];

// Results (finished matches) - available for 24 hours
export const SAMPLE_RESULTS: Match[] = [
  {
    id: 999999,
    home: 'Liverpool',
    away: 'Arsenal',
    score: '2-1',
    league: 'Premier League',
    status: 'finished',
    date: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    activeUsers: 0,
  },
  {
    id: 999998,
    home: 'Crystal Palace',
    away: 'Manchester City',
    score: '2-2',
    league: 'Premier League',
    status: 'finished',
    date: new Date(Date.now() - 10800000).toISOString(), // 3 hours ago
    activeUsers: 0,
  },
];