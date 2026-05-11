// app/(tabs)/index.tsx
// Home Screen - Production Quality - PL App Style
// Features: Correct match times, full-image hero news, working notifications, RESULTS SECTION
// Updated home feed with editorial news and stronger fallback loading

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Image, InteractionManager, Platform, Pressable, RefreshControl, SectionList, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { NativeViewGestureHandler } from 'react-native-gesture-handler';
import { useAppBootstrap } from '../../context/AppBootstrapContext';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../config/firebase';
import { footballAPI, Match } from '../../services/footballApi';
import { getCachedValueAsync } from '../../services/cacheService';
import { NewsArticle } from '../../services/newsApi';
import { useOpenArticle } from '../../hooks/useOpenArticle';
import { formatKickoffLabel, isPregameWindow } from '../../services/matchTime';
import { getMatchPhase, isLikelyFinishedFromLive } from '../../services/matchPhase';
import { presenceService } from '../../services/presenceService';
import { useTheme } from '../../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotificationPreferences } from '../../context/NotificationPreferencesContext';
import { notificationService } from '../../services/notificationService';
import { analyticsService } from '../../services/analyticsService';
import { monitoringService } from '../../services/monitoringService';
import { buildMatchRouteDescriptor } from '../../services/matchNavigation';
import { prefetchMatchOpenData } from '../../services/matchRoutePrefetch';
import { teamPrimaryColor } from '../../services/teamTint';
import { filterMatchesForFeed, getFeedSelections, selectNewsForFeed, sortNewsForFeed } from '../../services/feedPreferences';
import { NewsImage } from '../../components/NewsImage';
import { BrandedLoading } from '../../components/BrandedLoading';
import { NewsSkeletonCards } from '../../components/NewsSkeletonCards';
import { getCachedHomeExploreNewsAllocation, getHomeExploreNewsAllocation } from '../../services/newsAllocationService';
import { formatCompetitionLabel } from '../../constants/footballCompetitions';
import { getPrefetchedAppData, getPrefetchedNewsAllocation, warmScreenData } from '../../services/prefetchService';
import { ProfileQuickAccessButton } from '../../components/ProfileQuickAccessButton';

const DEFAULT_MATCH_NOTIFY_PREFS = {
  goals: true,
  cards: true,
  halftime: true,
  matchStart: true,
  fulltime: true,
};

const LIVE_CACHE_KEY = 'matches:live:v2';
const UPCOMING_CACHE_KEY = 'matches:upcoming:7d:v14';
const RESULTS_CACHE_KEY = 'matches:finished:7d:v9';
const LIVE_TTL_MS = 20 * 1000;
const UPCOMING_TTL_MS = 10 * 60 * 1000;
const RESULTS_TTL_MS = 30 * 60 * 1000;
const LIVE_FALLBACK_TTL_MS = 12 * 60 * 60 * 1000;
const NEWS_MIN_VISIBLE = 10;
const UPCOMING_PREVIEW_LIMIT = 12;

interface LiveMatch {
  id: string;
  home: string;
  away: string;
  homeShortName?: string;
  awayShortName?: string;
  homeCode?: string;
  awayCode?: string;
  homeIcon?: string;
  awayIcon?: string;
  homeLogo?: string;
  awayLogo?: string;
  score: string;
  minute: string;
  league: string;
  activeUsers?: number;
  date: string;
  kickoffTime: Date;
  status: Match['status'];
  phase: 'live' | 'pregame';
}

interface UpcomingMatch {
  id: string;
  home: string;
  away: string;
  homeShortName?: string;
  awayShortName?: string;
  homeCode?: string;
  awayCode?: string;
  homeIcon?: string;
  awayIcon?: string;
  homeLogo?: string;
  awayLogo?: string;
  league: string;
  date: string;
  kickoff: string;
  kickoffFull: string;
  kickoffTime: Date;
  status: Match['status'];
  venue: string;
}

// Results interface
interface ResultMatch {
  id: string;
  home: string;
  away: string;
  homeShortName?: string;
  awayShortName?: string;
  homeCode?: string;
  awayCode?: string;
  homeLogo?: string;
  awayLogo?: string;
  score: string;
  league: string;
  date: string;
}

type SpotlightCandidate =
  | { kind: 'live'; match: LiveMatch; favorite: boolean }
  | { kind: 'upcoming'; match: UpcomingMatch; favorite: boolean }
  | { kind: 'finished'; match: (ResultMatch & { kickoffTime: Date; status: 'finished' }); favorite: boolean };

const toTeamAbbr = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts
      .map((p) => p[0]?.toUpperCase() || '')
      .join('')
      .slice(0, 5);
  }
  return name.slice(0, 5).toUpperCase();
};

const TEAM_ABBR_MAP: Record<string, string> = {
  'hamburger sv': 'Hamburg',
  hamburger: 'Hamburg',
  bournemouth: 'Bournemouth',
  'afc bournemouth': 'Bournemouth',
  barcelona: 'Barcelona',
  'real madrid': 'Real Madrid',
  'real betis': 'Real Betis',
  'atletico madrid': 'Atletico',
  'manchester city': 'Man City',
  'manchester united': 'Man United',
  'paris saint germain': 'PSG',
  'paris saint-germain': 'PSG',
  liverpool: 'LIV',
  arsenal: 'ARS',
  chelsea: 'CHE',
  tottenham: 'Tottenham',
  'tottenham hotspur': 'Tottenham',
  'bayern munich': 'Bayern',
  'borussia dortmund': 'Dortmund',
  'borussia monchengladbach': 'Gladbach',
  'borussia mgladbach': 'Gladbach',
  'rb leipzig': 'Leipzig',
  'rasenballsport leipzig': 'Leipzig',
  'vfl wolfsburg': 'Wolfsburg',
  galatasaray: 'Gala',
  'inter milan': 'Inter',
  'ac milan': 'Milan',
};

const MAX_TEAM_LINE_CHARS = 16;

const canWrapIntoTwoLines = (value: string, maxCharsPerLine = MAX_TEAM_LINE_CHARS) => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  let lineCount = 1;
  let lineLength = 0;
  for (const word of words) {
    if (word.length >= maxCharsPerLine) return false;
    if (lineLength === 0) {
      lineLength = word.length;
      continue;
    }
    if (lineLength + 1 + word.length <= maxCharsPerLine) {
      lineLength += 1 + word.length;
      continue;
    }
    lineCount += 1;
    if (lineCount > 2) return false;
    lineLength = word.length;
  }
  return true;
};

const formatTeamNameForTwoLines = (value: string, maxCharsPerLine = MAX_TEAM_LINE_CHARS) => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return value;
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    const candidate = `${current} ${word}`;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= 2 && lines.every((line) => line.length <= maxCharsPerLine)) {
    return lines.join('\n');
  }
  return value;
};

const getDisplayTeamName = (team: { name?: string; short_name?: string; code?: string }, options?: { preferFullName?: boolean }) => {
  const fullName = (team?.name ?? '').trim();
  const normalizedFullName = fullName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (normalizedFullName.includes('hamburg')) return 'Hamburg';
  const mapped = options?.preferFullName ? undefined : TEAM_ABBR_MAP[fullName.toLowerCase()];
  if (mapped) return mapped;

  const shortName = (team?.short_name ?? '').trim();
  const code = (team?.code ?? '').trim();

  if (shortName) {
    if (canWrapIntoTwoLines(shortName, MAX_TEAM_LINE_CHARS)) return shortName;
  }

  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      const twoLine = formatTeamNameForTwoLines(fullName, MAX_TEAM_LINE_CHARS);
      if (twoLine !== fullName) return twoLine;
    }

    if (canWrapIntoTwoLines(fullName, MAX_TEAM_LINE_CHARS)) return fullName;

    if (shortName) return shortName;

    if (fullName.length > MAX_TEAM_LINE_CHARS) {
      return toTeamAbbr(fullName);
    }

    return fullName;
  }

  if (code && code.length >= 2 && code.length <= 5) return code;
  if (shortName) return shortName;

  return fullName;
};

const isTomorrowDate = (dateValue?: Date | string) => {
  if (!dateValue) return false;
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(midnight.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);
  return date >= tomorrowStart && date < tomorrowEnd;
};

const UPCOMING_FEED_RESCUE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const UPCOMING_FEED_TOO_FAR_MS = 2 * 24 * 60 * 60 * 1000;

const normalizeLeagueName = (value?: string) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isMarqueeUpcomingMatch = (match: Pick<Match, 'league'>) => {
  const league = normalizeLeagueName(match.league);
  return (
    league.includes('champions league') ||
    league.includes('europa league') ||
    league.includes('conference league') ||
    league.includes('world cup') ||
    league.includes('cup final') ||
    league.includes('cup semi') ||
    league.includes('super cup')
  );
};

const getKickoffTime = (match: { date?: string; kickoffTime?: Date }) =>
  match.kickoffTime instanceof Date ? match.kickoffTime.getTime() : new Date(match.date || '').getTime();

const sortByKickoffAsc = <T extends { date?: string; kickoffTime?: Date }>(matches: T[]) =>
  matches.slice().sort((a, b) => getKickoffTime(a) - getKickoffTime(b));

const mergeUpcomingMatches = <T extends { id: string | number; date?: string; kickoffTime?: Date }>(primary: T[], secondary: T[]) => {
  const byId = new Map<string, T>();
  [...primary, ...secondary].forEach((match) => byId.set(String(match.id), match));
  return sortByKickoffAsc(Array.from(byId.values()));
};

const getDisplayLeagueName = (leagueName: string, leagueDate?: Date | string) => {
  const base = formatCompetitionLabel(leagueName);
  if (
    /concacaf|concacaf champions|concacaf cl|ccl/i.test(leagueName) ||
    /^(CCL|Concacaf Champions|Concacaf CL)$/i.test(base)
  ) {
    return 'CCL';
  }
  // Qualifier name abbreviations — avoid "..." cutoff (only WC qualifiers allowed)
  if (/world.*cup.*qualif/i.test(leagueName)) {
    if (/europe/i.test(leagueName)) return 'WCQ Europe';
    if (/africa/i.test(leagueName)) return 'WCQ Africa';
    if (/asia/i.test(leagueName)) return 'WCQ Asia';
    if (/concacaf/i.test(leagueName)) return 'WCQ CONCACAF';
    if (/south.*america|conmebol/i.test(leagueName)) return 'WCQ S. America';
    if (/ofc|oceania/i.test(leagueName)) return 'WCQ OFC';
    return 'WC Qualifying';
  }
  if (isTomorrowDate(leagueDate) && /^(Champions|Conference) League$/i.test(base)) {
    return base;
  }
  if (isTomorrowDate(leagueDate) && base.length > 16) {
    return base
      .split(' ')
      .map((word) => word[0]?.toUpperCase() || '')
      .slice(0, 3)
      .join('');
  }
  // Abbreviate any remaining very long name to avoid cutoff
  if (base.length > 22) {
    return base
      .split(' ')
      .filter((w) => w.length > 0)
      .map((word) => word[0]?.toUpperCase() || '')
      .slice(0, 4)
      .join('');
  }
  return base;
};

const getHomeUpcomingLeagueName = (leagueName: string, leagueDate?: Date | string, compact?: boolean) => {
  const base = getDisplayLeagueName(leagueName, leagueDate);
  if (/^Conference League$/i.test(base)) {
    return 'Conf. League';
  }
  return base;
};

const getRenderableNews = (articles: NewsArticle[], feedSelections: ReturnType<typeof getFeedSelections>) =>
  selectNewsForFeed(
    (articles || []).filter((item) => item?.title && item?.url),
    feedSelections
  ).slice(0, NEWS_MIN_VISIBLE);

const getNewsAccent = (article: NewsArticle) => {
  const text = `${article.category || ''} ${article.title || ''}`.toLowerCase();
  if (text.includes('breaking')) return { chipBg: 'rgba(255,84,84,0.18)', chipText: '#FF8A8A' };
  if (text.includes('transfer')) return { chipBg: 'rgba(84,224,255,0.18)', chipText: '#88E8FF' };
  if (text.includes('preview')) return { chipBg: 'rgba(125,203,255,0.18)', chipText: '#9FDBFF' };
  if (text.includes('analysis') || text.includes('opinion')) return { chipBg: 'rgba(245,200,104,0.18)', chipText: '#F1CE7E' };
  return { chipBg: 'rgba(154,184,255,0.18)', chipText: '#BFD6FF' };
};
const TEAM_POINTS: Record<string, number> = {
  'real madrid': 100,
  'barcelona': 99,
  'atletico madrid': 89,
  sevilla: 74,
  'real betis': 72,
  villarreal: 71,
  'real sociedad': 70,
  valencia: 69,
  'athletic club': 76,
  girona: 63,
  'celta vigo': 52,
  osasuna: 50,
  getafe: 44,
  espanyol: 45,
  mallorca: 43,
  'las palmas': 39,
  'rayo vallecano': 42,
  alaves: 38,
  leganes: 34,
  valladolid: 33,
  'manchester united': 95,
  liverpool: 96,
  'manchester city': 94,
  arsenal: 90,
  chelsea: 88,
  'tottenham hotspur': 84,
  'newcastle united': 79,
  'aston villa': 76,
  'west ham united': 71,
  everton: 68,
  'leicester city': 64,
  brighton: 63,
  'wolverhampton wanderers': 58,
  'crystal palace': 56,
  'nottingham forest': 57,
  fulham: 52,
  brentford: 51,
  bournemouth: 48,
  southampton: 46,
  burnley: 45,
  'leeds united': 62,
  sunderland: 52,
  'bayern munich': 97,
  'borussia dortmund': 87,
  'bayer leverkusen': 82,
  'rb leipzig': 78,
  'eintracht frankfurt': 72,
  stuttgart: 68,
  'borussia monchengladbach': 66,
  'schalke 04': 65,
  'werder bremen': 63,
  wolfsburg: 61,
  'union berlin': 57,
  freiburg: 56,
  mainz: 49,
  hoffenheim: 48,
  koln: 54,
  hamburg: 60,
  'hertha berlin': 50,
  'st pauli': 47,
  juventus: 86,
  inter: 90,
  'ac milan': 88,
  napoli: 78,
  roma: 77,
  lazio: 73,
  atalanta: 74,
  fiorentina: 67,
  bologna: 61,
  torino: 57,
  sampdoria: 55,
  genoa: 56,
  parma: 53,
  udinese: 49,
  monza: 43,
  cagliari: 42,
  como: 41,
  verona: 40,
  'paris saint germain': 93,
  marseille: 78,
  lyon: 76,
  monaco: 75,
  lille: 71,
  nice: 67,
  lens: 64,
  rennes: 65,
  strasbourg: 52,
  nantes: 56,
  'saint etienne': 58,
  bordeaux: 55,
  montpellier: 47,
  toulouse: 46,
  reims: 45,
  brest: 44,
  auxerre: 42,
  angers: 39,
  benfica: 80,
  porto: 79,
  'sporting cp': 78,
  braga: 66,
  'vitoria guimaraes': 57,
  boavista: 51,
  famalicao: 43,
  'rio ave': 41,
  'gil vicente': 38,
  estoril: 37,
  'urawa red diamonds': 67,
  'yokohama f marinos': 65,
  'kawasaki frontale': 64,
  'kashima antlers': 66,
  'gamba osaka': 61,
  'cerezo osaka': 58,
  'fc tokyo': 56,
  'vissel kobe': 63,
  'sanfrecce hiroshima': 59,
  'nagoya grampus': 57,
  'shonan bellmare': 39,
  'avispa fukuoka': 38,
  'albirex niigata': 40,
  'consadole sapporo': 42,
  'inter miami': 74,
  'la galaxy': 68,
  'los angeles fc': 69,
  'atlanta united': 64,
  'seattle sounders': 66,
  'portland timbers': 60,
  'toronto fc': 61,
  'new york city fc': 60,
  'new york red bulls': 59,
  'columbus crew': 58,
  'austin fc': 52,
  'fc cincinnati': 54,
  'nashville sc': 51,
  'orlando city': 53,
  'philadelphia union': 55,
  'sporting kansas city': 50,
  'st louis city': 48,
  'charlotte fc': 47,
  'cf montreal': 46,
  'san jose earthquakes': 45,
  'chicago fire': 49,
  'dc united': 52,
  'houston dynamo': 50,
  'fc dallas': 49,
  'minnesota united': 47,
  'colorado rapids': 43,
  'vancouver whitecaps': 48,
  'real salt lake': 46,
  'new england revolution': 45,
  'san diego fc': 44,
  ajax: 79,
  psv: 75,
  feyenoord: 73,
  'club brugge': 63,
  anderlecht: 62,
  galatasaray: 72,
  fenerbahce: 71,
  besiktas: 66,
  celtic: 70,
  rangers: 69,
  'shakhtar donetsk': 61,
  'dynamo kyiv': 58,
  olympiacos: 60,
  panathinaikos: 56,
  'red star belgrade': 55,
  'dinamo zagreb': 54,
  salzburg: 58,
  flamengo: 73,
  palmeiras: 72,
  corinthians: 68,
  santos: 63,
  'river plate': 74,
  'boca juniors': 74,
  'al ahly': 67,
  'al nassr': 66,
  'al hilal': 68,
  // National teams — World Cup / international competitions
  brazil: 98,
  argentina: 97,
  france: 96,
  england: 95,
  germany: 94,
  spain: 93,
  portugal: 91,
  netherlands: 90,
  italy: 89,
  belgium: 87,
  croatia: 84,
  uruguay: 83,
  colombia: 82,
  mexico: 81,
  usa: 78,
  japan: 77,
  'south korea': 76,
  morocco: 75,
  senegal: 74,
  'ivory coast': 73,
  nigeria: 72,
  ghana: 70,
  egypt: 70,
  algeria: 68,
  switzerland: 75,
  denmark: 74,
  austria: 72,
  turkey: 71,
  poland: 70,
  ukraine: 69,
  serbia: 67,
  ecuador: 65,
  chile: 68,
  peru: 64,
  scotland: 63,
  wales: 62,
  'czech republic': 64,
  hungary: 61,
  romania: 60,
  iran: 60,
  'saudi arabia': 58,
  cameroon: 64,
  australia: 62,
  tunisia: 59,
  'costa rica': 57,
  panama: 52,
  'united states': 78,
};
const SPOTLIGHT_TEAM_ALIASES: Record<string, string> = {
  psg: 'paris saint germain',
  'paris saint-germain': 'paris saint germain',
  'man united': 'manchester united',
  'man city': 'manchester city',
  tottenham: 'tottenham hotspur',
  inter: 'inter milan',
  milan: 'ac milan',
  bayern: 'bayern munich',
  dortmund: 'borussia dortmund',
  atletico: 'atletico madrid',
  newcastle: 'newcastle united',
  sporting: 'sporting cp',
  psv: 'psv eindhoven',
  'club américa': 'club america',
  'club america': 'club america',
  'club de futbol monterrey': 'monterrey',
  'cf monterrey': 'monterrey',
  'atletico de madrid': 'atletico madrid',
  tigres: 'tigres uanl',
  chivas: 'guadalajara',
  'los angeles galaxy': 'la galaxy',
  lafc: 'los angeles fc',
  'new york red bulls': 'new york red bulls',
  nycfc: 'new york city fc',
  'new york city': 'new york city fc',
  'fenerbahçe': 'fenerbahce',
  'beşiktaş': 'besiktas',
  'são paulo': 'sao paulo',
  'dc united': 'dc united',
  'd c united': 'dc united',
  'st pauli': 'st pauli',
  'st. pauli': 'st pauli',
  'paris sg': 'paris saint germain',
  'inter milan': 'inter',
  'internazionale': 'inter',
  // National team aliases
  'england national': 'england',
  'france national': 'france',
  'germany national': 'germany',
  'spain national': 'spain',
  'brazil national': 'brazil',
  'argentina national': 'argentina',
  'portugal national': 'portugal',
  'netherlands national': 'netherlands',
  'italy national': 'italy',
  'usa national': 'usa',
  'united states national': 'united states',
  'south korea national': 'south korea',
  'japan national': 'japan',
  'mexico national': 'mexico',
  'côte d\'ivoire': 'ivory coast',
  'cote d\'ivoire': 'ivory coast',
};
const normalizeSpotlightTeamName = (teamName: string) => {
  const normalized = teamName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return SPOTLIGHT_TEAM_ALIASES[normalized] || normalized;
};
const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3 ? normalized.split('').map((char) => `${char}${char}`).join('') : normalized;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
const softenCardTintColor = (hex: string) => {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3 ? normalized.split('').map((char) => `${char}${char}`).join('') : normalized;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  if (![r, g, b].every((value) => Number.isFinite(value))) return hex;
  const isBrightGreen = g > r * 1.15 && g > b * 1.15;
  if (!isBrightGreen) return hex;
  const target = { r: 92, g: 116, b: 98 };
  const mix = 0.34;
  const nr = Math.round(r * (1 - mix) + target.r * mix);
  const ng = Math.round(g * (1 - mix) + target.g * mix);
  const nb = Math.round(b * (1 - mix) + target.b * mix);
  return `#${[nr, ng, nb].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
};
const getTeamSpotlightScore = (teamName: string) => {
  const normalized = normalizeSpotlightTeamName(teamName);
  return TEAM_POINTS[normalized] ?? 24;
};
const RIVALRY_BONUS: Record<string, number> = {
  'real madrid|barcelona': 18,
  'barcelona|real madrid': 18,
  'atletico madrid|real madrid': 14,
  'real madrid|atletico madrid': 14,
  'arsenal|tottenham hotspur': 16,
  'tottenham hotspur|arsenal': 16,
  'liverpool|manchester united': 17,
  'manchester united|liverpool': 17,
  'manchester city|manchester united': 16,
  'manchester united|manchester city': 16,
  'liverpool|everton': 14,
  'everton|liverpool': 14,
  'chelsea|arsenal': 12,
  'arsenal|chelsea': 12,
  'inter|ac milan': 17,
  'ac milan|inter': 17,
  'roma|lazio': 16,
  'lazio|roma': 16,
  'juventus|inter': 15,
  'inter|juventus': 15,
  'benfica|porto': 16,
  'porto|benfica': 16,
  'sporting cp|benfica': 15,
  'benfica|sporting cp': 15,
  'porto|sporting cp': 13,
  'sporting cp|porto': 13,
  'celtic|rangers': 18,
  'rangers|celtic': 18,
  'galatasaray|fenerbahce': 18,
  'fenerbahce|galatasaray': 18,
  'boca juniors|river plate': 18,
  'river plate|boca juniors': 18,
  'la galaxy|los angeles fc': 15,
  'los angeles fc|la galaxy': 15,
  'seattle sounders|portland timbers': 15,
  'portland timbers|seattle sounders': 15,
  'new york city fc|new york red bulls': 14,
  'new york red bulls|new york city fc': 14,
};
const getCompetitionSpotlightScore = (leagueName: string) => {
  const value = (leagueName || '').toLowerCase();
  // World Cup — highest priority of all competitions
  if (value.includes('world cup') || value.includes('fifa world cup')) {
    if (value.includes('final') && !value.includes('semi') && !value.includes('quarter')) return 40;
    if (value.includes('semi')) return 38;
    if (value.includes('quarter')) return 36;
    if (value.includes('round of 16') || value.includes('last 16')) return 34;
    return 30; // group stage
  }
  // Continental championships
  if (value.includes('euro') || value.includes('uefa european')) {
    if (value.includes('final') && !value.includes('semi')) return 36;
    if (value.includes('semi')) return 34;
    if (value.includes('quarter')) return 32;
    if (value.includes('round of 16') || value.includes('last 16')) return 28;
    return 22;
  }
  if (value.includes('copa america')) {
    if (value.includes('final') && !value.includes('semi')) return 34;
    if (value.includes('semi')) return 32;
    if (value.includes('quarter')) return 28;
    return 20;
  }
  if (value.includes('africa cup') || value.includes('afcon')) {
    if (value.includes('final') && !value.includes('semi')) return 28;
    if (value.includes('semi')) return 26;
    return 18;
  }
  if (value.includes('nations league') && value.includes('final')) return 22;
  if (value.includes('nations league')) return 14;
  if (value.includes('gold cup') && value.includes('final')) return 20;
  if (value.includes('gold cup')) return 12;
  // Concacaf competitions — must be checked before 'champions league' since CCL name contains that string
  if (value.includes('concacaf')) {
    if (value.includes('final') && !value.includes('semi')) return 8;
    if (value.includes('semi')) return 6;
    return 4;
  }
  // Club competitions — UCL is always highest priority club competition
  if (value.includes('champions league')) {
    if (value.includes('final') && !value.includes('semi') && !value.includes('quarter')) return 70;
    if (value.includes('semi')) return 65;
    if (value.includes('quarter')) return 60;
    if (value.includes('round of 16') || value.includes('last 16') || value.includes('knockout')) return 55;
    return 50; // group / league phase
  }
  if (value.includes('europa league') && (value.includes('knockout') || value.includes('quarter') || value.includes('semi') || value.includes('final'))) return 18;
  if (value.includes('europa league')) return 12;
  if (value.includes('conference league')) return 8;
  if (value.includes('premier league')) return 8;
  if (value.includes('la liga')) return 8;
  if (value.includes('serie a')) return 8;
  if (value.includes('bundesliga')) return 7;
  if (value.includes('ligue 1')) return 6;
  if (value.includes('primeira liga')) return 6;
  if (value.includes('mls')) return 5;
  if (value.includes('fa cup') || value.includes('copa del rey') || value.includes('coppa italia') || value.includes('dfb pokal')) return 5;
  if (value.includes('cup semi')) return 10;
  if (value.includes('cup final') || value.includes('final')) return 14;
  if (value.includes('league cup')) return 4;
  return 0;
};
const getRivalrySpotlightScore = (home: string, away: string) => {
  return RIVALRY_BONUS[`${normalizeSpotlightTeamName(home)}|${normalizeSpotlightTeamName(away)}`] ?? 0;
};
const isSameLocalDay = (dateValue: Date | string, nowValue: Date) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return (
    date.getFullYear() === nowValue.getFullYear() &&
    date.getMonth() === nowValue.getMonth() &&
    date.getDate() === nowValue.getDate()
  );
};
const getLocalDayStart = (dateValue: Date | string) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};
const getLiveMinuteLabel = (
    match: { minute?: string; phase?: 'live' | 'pregame' },
    nowMs: number,
    syncedAtMs: number
  ) => {
    if (match.phase === 'pregame') return '';
    const raw = (match.minute || '').trim();
    if (!raw) return 'Live';
    const lowered = raw.toLowerCase();
    if (lowered === 'ht' || lowered === 'half-time' || lowered === 'halftime' || lowered.includes('half time')) {
      return 'Half Time';
    }
    const baseMinute = Number.parseInt(raw, 10);
    if (!Number.isFinite(baseMinute)) return raw;
    const extraMinutes = Math.floor(Math.max(0, nowMs - syncedAtMs) / 60000);
    return `${baseMinute + extraMinutes}'`;
  };

const ScoreTicker = ({ value, style }: { value: string; style: any }) => {
  const [display, setDisplay] = useState(value);
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (value === display) return;
    Animated.sequence([
      Animated.timing(anim, { toValue: 0, duration: 110, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    setDisplay(value);
  }, [value, display, anim]);

  return (
    <Animated.Text
      style={[
        style,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 0],
              }),
            },
          ],
        },
      ]}
    >
      {display}
    </Animated.Text>
  );
};

const mergeFixtureIntoMatch = (match: Match, fixture: any | null): Match => {
  if (!fixture?.fixture?.id) return match;
  const homeGoals = fixture?.goals?.home;
  const awayGoals = fixture?.goals?.away;
  const hasScore = homeGoals !== null && homeGoals !== undefined && awayGoals !== null && awayGoals !== undefined;
  const statusShort = String(fixture?.fixture?.status?.short || '').toUpperCase();
  const isFinished = ['FT', 'AET', 'PEN'].includes(statusShort);
  const isLive = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(statusShort);

  return {
    ...match,
    home: fixture?.teams?.home?.name || match.home,
    away: fixture?.teams?.away?.name || match.away,
    homeShortName: fixture?.teams?.home?.short_name || fixture?.teams?.home?.shortName || match.homeShortName,
    awayShortName: fixture?.teams?.away?.short_name || fixture?.teams?.away?.shortName || match.awayShortName,
    homeCode: fixture?.teams?.home?.code || match.homeCode,
    awayCode: fixture?.teams?.away?.code || match.awayCode,
    homeLogo: fixture?.teams?.home?.logo || match.homeLogo,
    awayLogo: fixture?.teams?.away?.logo || match.awayLogo,
    homeId: fixture?.teams?.home?.id || match.homeId,
    awayId: fixture?.teams?.away?.id || match.awayId,
    leagueId: fixture?.league?.id || match.leagueId,
    league: fixture?.league?.name || match.league,
    date: fixture?.fixture?.date || match.date,
    score: hasScore ? `${homeGoals}-${awayGoals}` : match.score,
    minute: fixture?.fixture?.status?.elapsed ? `${fixture.fixture.status.elapsed}'` : match.minute,
    status: isFinished ? 'finished' : isLive ? 'live' : match.status,
  };
};

const hydrateLiveScoresFromFixtures = async (matches: Match[]): Promise<Match[]> => {
  const liveLike = matches.filter((match) => {
    const phase = getMatchPhase({ kickoffAt: match.date, status: match.status });
    return phase.phase === 'live';
  });
  if (liveLike.length === 0) return matches;

  const updates = await Promise.allSettled(
    liveLike.slice(0, 12).map(async (match) => {
      const bundle = await footballAPI.getFixtureLive(Number(match.id));
      return [String(match.id), mergeFixtureIntoMatch(match, bundle.fixture)] as const;
    })
  );

  const byId = new Map<string, Match>();
  updates.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    byId.set(result.value[0], result.value[1]);
  });

  if (byId.size === 0) return matches;
  return matches.map((match) => byId.get(String(match.id)) || match);
};

const hydrateResultScoresFromFixtures = async (matches: Match[]): Promise<Match[]> => {
  if (matches.length === 0) return matches;

  const updates = await Promise.allSettled(
    matches.slice(0, 12).map(async (match) => {
      const fixture = await footballAPI.getFixtureById(Number(match.id));
      return [String(match.id), mergeFixtureIntoMatch(match, fixture)] as const;
    })
  );

  const byId = new Map<string, Match>();
  updates.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    byId.set(result.value[0], result.value[1]);
  });

  if (byId.size === 0) return matches;
  return matches.map((match) => byId.get(String(match.id)) || match);
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { openArticle, prefetchArticle } = useOpenArticle();
  const { bootstrapApp, isBootstrapping, showLoadingScreen } = useAppBootstrap();
  const { userProfile } = useAuth();
  const feedSelections = useMemo(() => getFeedSelections(userProfile), [userProfile]);
  const { isDark } = useTheme();
  const { preferences } = useNotificationPreferences();
  const prefetchedAppData = getPrefetchedAppData();
  const prefetchedNews = useMemo(
    () =>
      selectNewsForFeed(
        (prefetchedAppData?.newsAllocation.home || [])
          .filter((item) => item?.imageUrl)
          .slice(0, NEWS_MIN_VISIBLE),
        feedSelections
      ),
    [feedSelections, prefetchedAppData?.completedAt]
  );
  const prefetchedLiveMatches = prefetchedAppData?.liveMatches ?? [];
  const prefetchedUpcomingMatches = prefetchedAppData?.upcomingMatches ?? [];
  const prefetchedResultsMatches = prefetchedAppData?.resultsMatches ?? [];
  const [refreshing, setRefreshing] = useState(false);
  const [homeData, setHomeData] = useState<{
    liveMatches: LiveMatch[];
    upcomingMatches: UpcomingMatch[];
    resultsMatches: ResultMatch[];
    news: NewsArticle[];
  }>({
    liveMatches: [],
    upcomingMatches: [],
    resultsMatches: [],
    news: prefetchedNews,
  });
  const [rawLiveMatches, setRawLiveMatches] = useState<Match[]>(prefetchedLiveMatches);
  const [rawUpcomingMatches, setRawUpcomingMatches] = useState<Match[]>(prefetchedUpcomingMatches);
  const [rawResultsMatches, setRawResultsMatches] = useState<Match[]>(prefetchedResultsMatches);
  const [subscribedMatches, setSubscribedMatches] = useState<Set<string>>(new Set());
  const [loadingNotify, setLoadingNotify] = useState<string | null>(null);
  const [viewerCounts, setViewerCounts] = useState<Record<string, number>>({});
  const [newsLoading, setNewsLoading] = useState(prefetchedNews.length === 0);
  const [resultsLoading, setResultsLoading] = useState(prefetchedResultsMatches.length === 0);
  const [initialHomeReady, setInitialHomeReady] = useState(
    prefetchedLiveMatches.length > 0 ||
      prefetchedUpcomingMatches.length > 0 ||
      prefetchedResultsMatches.length > 0
  );
  const { liveMatches, upcomingMatches, resultsMatches, news } = homeData;
  const isCompactHeader = Platform.OS === 'ios' && width < 395;
  const scopedLiveMatches = useMemo(() => {
    const filtered = filterMatchesForFeed(liveMatches, feedSelections);
    return filtered.length > 0 ? filtered : liveMatches;
  }, [feedSelections, liveMatches]);
  const scopedUpcomingMatches = useMemo(() => {
    const hasFeedSelections = feedSelections.teams.length > 0 || feedSelections.leagues.length > 0;
    const now = Date.now();
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    // Strip matches whose kickoff has already passed — the API can lag behind
    const futureMatches = sortByKickoffAsc(upcomingMatches.filter(m => new Date(m.date).getTime() > now));
    const filtered = sortByKickoffAsc(filterMatchesForFeed(futureMatches, feedSelections));
    const firstFilteredKickoff = filtered[0] ? new Date(filtered[0].date).getTime() : Number.POSITIVE_INFINITY;
    const nearTermMarquee = futureMatches.filter((m) => {
      const kickoff = new Date(m.date).getTime();
      return kickoff <= now + UPCOMING_FEED_RESCUE_WINDOW_MS && isMarqueeUpcomingMatch(m);
    });
    if (hasFeedSelections) {
      if (nearTermMarquee.length > 0 && (filtered.length === 0 || firstFilteredKickoff > now + UPCOMING_FEED_TOO_FAR_MS)) {
        return mergeUpcomingMatches(nearTermMarquee, filtered);
      }
      return filtered;
    }
    // Without feed selections, keep short-term matches visible first.
    const imminent = futureMatches.filter(m => new Date(m.date).getTime() <= now + TWO_DAYS_MS);
    if (imminent.length === 0) {
      return futureMatches;
    }
    const imminentIds = new Set(imminent.map(m => m.id));
    const rest = futureMatches.filter(m => !imminentIds.has(m.id));
    return [...imminent, ...rest];
  }, [feedSelections, upcomingMatches]);
  const hasFeedSelections = feedSelections.teams.length > 0 || feedSelections.leagues.length > 0;
  const scopedResultsMatches = useMemo(() => {
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const filtered = filterMatchesForFeed(resultsMatches, feedSelections);
    const filteredIds = new Set(filtered.map(m => m.id));
    const recentExtra = resultsMatches.filter(
      m => !filteredIds.has(m.id) && now - new Date(m.date).getTime() <= SEVEN_DAYS_MS
    );
    return [...filtered, ...recentExtra].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [feedSelections, resultsMatches]);
  const [nowTs, setNowTs] = useState(Date.now());
  const [liveMinuteTickNow, setLiveMinuteTickNow] = useState(Date.now());
  const [liveMinuteSyncedAt, setLiveMinuteSyncedAt] = useState(Date.now());
  const liveDotOpacity = useRef(new Animated.Value(1)).current;
  const motdDayLockRef = useRef<{ dayStart: number; matchId: string } | null>(null);
  const enableClippedSubviews = Platform.OS === 'android';
  const outerScrollRef = useRef<NativeViewGestureHandler>(null);
  const liveListRef = useRef<NativeViewGestureHandler>(null);
  const upcomingListRef = useRef<NativeViewGestureHandler>(null);
  const resultsListRef = useRef<NativeViewGestureHandler>(null);
  const palette = useMemo(
    () =>
      isDark
        ? {
            background: '#0B0B0B',
            card: '#1C1C1E',
            text: '#FFFFFF',
            subtext: '#A1A1A6',
            link: '#4DA3FF',
            placeholder: '#2C2C2E',
          }
        : {
            background: '#F5F5F7',
            card: '#FFFFFF',
            text: '#000000',
            subtext: '#8E8E93',
            link: '#0066CC',
            placeholder: '#E5E7EB',
          },
    [isDark]
  );

  useEffect(() => {
    if (isBootstrapping) return;

    const latest = getPrefetchedAppData();
    if (latest) {
      const seededNews = getRenderableNews(latest.newsAllocation.home || [], feedSelections);
      setLiveMinuteSyncedAt(Date.now());
      setRawLiveMatches(latest.liveMatches);
      setRawUpcomingMatches(latest.upcomingMatches);
      setRawResultsMatches(latest.resultsMatches);
      setHomeData({
        ...buildMatchState(latest.liveMatches, latest.upcomingMatches, latest.resultsMatches),
        news: seededNews,
      });
      setResultsLoading(latest.resultsMatches.length === 0);
      setNewsLoading(seededNews.length === 0);
      setInitialHomeReady(true);
    }

    const task = InteractionManager.runAfterInteractions(() => {
      void loadData().finally(() => {
        setInitialHomeReady(true);
      });
    });
    return () => {
      task.cancel();
    };
  }, [feedSelections, isBootstrapping]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotOpacity, {
          toValue: 0.2,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(liveDotOpacity, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [liveDotOpacity]);

  useEffect(() => {
    if (userProfile?.uid) {
      loadSubscriptions();
    }
  }, [userProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = setInterval(() => setNowTs(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setLiveMinuteTickNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    void refreshLiveOnly();
    const interval = setInterval(() => {
      void refreshLiveOnly();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useLayoutEffect(() => {
    setHomeData(prev => ({
      ...prev,
      ...buildMatchState(rawLiveMatches, rawUpcomingMatches, rawResultsMatches),
    }));
  }, [rawLiveMatches, rawUpcomingMatches, rawResultsMatches, nowTs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!news.length) return;
    prefetchArticle(news[0]);
    const timeout = setTimeout(() => {
      news.slice(1, 5).forEach((article) => prefetchArticle(article));
    }, 250);
    return () => clearTimeout(timeout);
  }, [news, prefetchArticle]);

  const mapLiveMatches = (liveData: Match[]): LiveMatch[] => {
    const now = new Date(nowTs);
    return liveData
      .map((m) => {
        const phaseInfo = getMatchPhase({
          kickoffAt: m.date,
          status: m.status,
          now,
        });
        return {
          match: m,
          phase: phaseInfo.phase,
        };
      })
      .filter((item) => item.phase === 'live')
      .map(({ match: m }) => ({
        id: m.id.toString(),
        home: m.home,
        away: m.away,
        homeShortName: m.homeShortName,
        awayShortName: m.awayShortName,
        homeCode: m.homeCode,
        awayCode: m.awayCode,
        homeIcon: m.homeLogo,
        awayIcon: m.awayLogo,
        homeLogo: m.homeLogo,
        awayLogo: m.awayLogo,
        score: m.score || '0-0',
        minute: m.minute || 'LIVE',
        league: m.league,
        date: m.date,
        kickoffTime: new Date(m.date),
        status: m.status,
        phase: 'live' as const,
      }));
  };

  const mapPregameMatches = (upcomingData: Match[]): LiveMatch[] => {
    const now = new Date(nowTs);
    const KICKOFF_GRACE_MS = 10 * 60 * 1000; // keep match visible 10 min after kickoff while live API catches up
    return upcomingData
      .filter((m) => {
        const kickoff = new Date(m.date);
        const opensAt = kickoff.getTime() - 45 * 60 * 1000;
        const graceEnd = kickoff.getTime() + KICKOFF_GRACE_MS;
        return now.getTime() >= opensAt && now.getTime() < graceEnd;
      })
      .map((m) => {
        const kickoff = new Date(m.date);
        const isPostKickoff = now.getTime() >= kickoff.getTime();
        return {
          id: m.id.toString(),
          home: m.home,
          away: m.away,
          homeShortName: m.homeShortName,
          awayShortName: m.awayShortName,
          homeCode: m.homeCode,
          awayCode: m.awayCode,
          homeIcon: m.homeLogo,
          awayIcon: m.awayLogo,
          homeLogo: m.homeLogo,
          awayLogo: m.awayLogo,
          score: m.score || '0-0',
          minute: isPostKickoff ? 'LIVE' : 'Pregame',
          league: m.league,
          date: m.date,
          kickoffTime: kickoff,
          status: m.status,
          phase: (isPostKickoff ? 'live' : 'pregame') as 'live' | 'pregame',
        };
      });
  };

  const refreshLiveOnly = async () => {
    try {
      const live = await hydrateLiveScoresFromFixtures(await footballAPI.getLiveMatches({ preferCache: false }));
      if (live.length > 0) {
        setLiveMinuteSyncedAt(Date.now());
        setRawLiveMatches(live);
        return;
      }
      const [cachedLive, cachedExploreLive] = await Promise.all([
        getCachedValueAsync<Match[]>(LIVE_CACHE_KEY, LIVE_FALLBACK_TTL_MS),
        getCachedValueAsync<Match[]>('explore:live:v2', LIVE_FALLBACK_TTL_MS),
      ]);
      if (cachedLive && cachedLive.length > 0) {
        setLiveMinuteSyncedAt(Date.now());
        setRawLiveMatches(await hydrateLiveScoresFromFixtures(cachedLive));
      } else if (cachedExploreLive && cachedExploreLive.length > 0) {
        setLiveMinuteSyncedAt(Date.now());
        setRawLiveMatches(await hydrateLiveScoresFromFixtures(cachedExploreLive));
      } else {
        setLiveMinuteSyncedAt(Date.now());
        setRawLiveMatches([]);
      }
    } catch {
      // Keep current live matches if refresh fails.
    }
  };

  const mapUpcomingMatches = (upcomingData: Match[]): UpcomingMatch[] => (
    upcomingData
      .map(m => ({
      id: m.id.toString(),
      home: m.home,
      away: m.away,
      homeShortName: m.homeShortName,
      awayShortName: m.awayShortName,
      homeCode: m.homeCode,
      awayCode: m.awayCode,
      homeIcon: m.homeLogo,
      awayIcon: m.awayLogo,
      homeLogo: m.homeLogo,
      awayLogo: m.awayLogo,
      league: m.league,
      date: m.date,
      kickoff: formatKickoffLabel(new Date(m.date), new Date(nowTs)),
      kickoffFull: new Date(m.date).toLocaleString(),
      kickoffTime: new Date(m.date),
      status: m.status,
      venue: 'Stadium TBD'
    }))
  );

  const mapResultsMatches = (resultsData: Match[], liveData: Match[] = []): ResultMatch[] => {
    const now = new Date(nowTs);
    const activeLiveIds = new Set(
      liveData
        .filter((match) => !isLikelyFinishedFromLive(match, now))
        .map((match) => String(match.id))
    );
    const forcedFinished = liveData.filter((match) => isLikelyFinishedFromLive(match, now, activeLiveIds));
    const mergedById = new Map<string | number, Match>();
    resultsData.forEach((m) => {
      if (activeLiveIds.has(String(m.id))) return;
      mergedById.set(m.id, m);
    });
    forcedFinished.forEach((m) => mergedById.set(m.id, m));
    return Array.from(mergedById.values())
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(m => ({
      id: m.id.toString(),
      home: m.home,
      away: m.away,
      homeShortName: m.homeShortName,
      awayShortName: m.awayShortName,
      homeCode: m.homeCode,
      awayCode: m.awayCode,
      homeLogo: m.homeLogo,
      awayLogo: m.awayLogo,
      score: m.score || '0-0',
      league: m.league,
      date: m.date
    }));
  };

  const buildMatchState = (liveData: Match[], upcomingData: Match[], resultsData: Match[]) => ({
    liveMatches: (() => {
      const pregame = mapPregameMatches(upcomingData);
      const live = mapLiveMatches(liveData);
      const merged = [...pregame, ...live];
      const byId = new Map<string, LiveMatch>();
      merged.forEach((item) => byId.set(item.id, item));
      return Array.from(byId.values()).sort((a, b) => {
        if (a.phase !== b.phase) return a.phase === 'live' ? -1 : 1;
        return a.kickoffTime.getTime() - b.kickoffTime.getTime();
      });
    })(),
    upcomingMatches: (() => {
      const liveIds = new Set<string>();
      mapPregameMatches(upcomingData).forEach((match) => liveIds.add(match.id));
      mapLiveMatches(liveData).forEach((match) => liveIds.add(match.id));
      const filteredUpcoming = mapUpcomingMatches(upcomingData).filter((match) => !liveIds.has(match.id));
      return filteredUpcoming.length > 0 ? filteredUpcoming : mapUpcomingMatches(upcomingData);
    })(),
    resultsMatches: mapResultsMatches(resultsData, liveData),
  });

  const getFinishedFromLive = (liveData: Match[], activeLiveIds?: Set<string>) => {
    const now = new Date();
    return liveData.filter((match) => isLikelyFinishedFromLive(match, now, activeLiveIds));
  };

  const loadData = async ({ preferCache = true }: { preferCache?: boolean } = {}) => {
    try {
      if (preferCache) {
        void Promise.all([
          getCachedValueAsync<Match[]>(LIVE_CACHE_KEY, LIVE_TTL_MS),
          getCachedValueAsync<Match[]>(UPCOMING_CACHE_KEY, UPCOMING_TTL_MS),
          getCachedValueAsync<Match[]>(RESULTS_CACHE_KEY, RESULTS_TTL_MS),
        ]).then(([cachedLive, cachedUpcoming, cachedResults]) => {
          if (cachedLive || cachedUpcoming || cachedResults) {
            setLiveMinuteSyncedAt(Date.now());
            setRawLiveMatches(cachedLive || []);
            setRawUpcomingMatches(cachedUpcoming || []);
            setRawResultsMatches(cachedResults || []);
            if (cachedResults && cachedResults.length > 0) {
              setResultsLoading(false);
            }
            setHomeData((prev) => ({
              ...prev,
              ...buildMatchState(cachedLive || [], cachedUpcoming || [], cachedResults || []),
            }));
          }
        });
      }

      const [liveSettled, upcomingSettled, resultsSettled] = await Promise.all([
        footballAPI.getLiveMatches().then((data) => ({ ok: true as const, data })).catch(() => ({ ok: false as const, data: [] as Match[] })),
        footballAPI.getUpcomingMatches({ preferCache }).then((data) => ({ ok: true as const, data })).catch(() => ({ ok: false as const, data: [] as Match[] })),
        footballAPI.getRecentFinishedFixtures(80, { preferCache }).then((data) => ({ ok: true as const, data })).catch(() => ({ ok: false as const, data: [] as Match[] })),
      ]);
      let liveData = await hydrateLiveScoresFromFixtures(liveSettled.data);
      if (liveData.length === 0) {
        const [cachedLive, cachedExploreLive] = await Promise.all([
          getCachedValueAsync<Match[]>(LIVE_CACHE_KEY, LIVE_FALLBACK_TTL_MS),
          getCachedValueAsync<Match[]>('explore:live:v2', LIVE_FALLBACK_TTL_MS),
        ]);
        const fallbackLiveData = (cachedLive && cachedLive.length > 0)
          ? cachedLive
          : ((cachedExploreLive && cachedExploreLive.length > 0) ? cachedExploreLive : []);
        liveData = await hydrateLiveScoresFromFixtures(fallbackLiveData);
      }
      let upcomingData = upcomingSettled.data;
      const upcomingHasNearTermMatches = upcomingData.some((match) => {
        const kickoff = new Date(match.date).getTime();
        return kickoff > Date.now() && kickoff <= Date.now() + UPCOMING_FEED_TOO_FAR_MS;
      });
      if (!upcomingHasNearTermMatches) {
        try {
          const freshUpcoming = await footballAPI.getUpcomingMatches({ preferCache: false });
          if (freshUpcoming.length > 0) {
            upcomingData = freshUpcoming;
          }
        } catch {
          // Keep the settled/cached upcoming list if a direct refresh is unavailable.
        }
      }
      const [cachedRecentResults, cachedLiveForResults, cachedExploreLiveForResults] = await Promise.all([
        footballAPI.getCachedRecentResults(120),
        getCachedValueAsync<Match[]>(LIVE_CACHE_KEY, LIVE_FALLBACK_TTL_MS),
        getCachedValueAsync<Match[]>('explore:live:v2', LIVE_FALLBACK_TTL_MS),
      ]);
      const resultsCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recentCachedResults = cachedRecentResults.filter((m) => m?.date && new Date(m.date).getTime() >= resultsCutoff);
      const activeLiveIds = new Set(
        liveData
          .filter((match) => !isLikelyFinishedFromLive(match, new Date(nowTs)))
          .map((match) => String(match.id))
      );
      const forcedFinished = getFinishedFromLive([
        ...liveData,
        ...(cachedLiveForResults ?? []),
        ...(cachedExploreLiveForResults ?? []),
      ], activeLiveIds);
      const fallbackResults = rawResultsMatches.length > 0
        ? rawResultsMatches
        : (prefetchedResultsMatches.length > 0
            ? prefetchedResultsMatches
            : recentCachedResults);
      const mergedResultsData = (resultsSettled.data.length > 0
        ? Array.from(new Map([...resultsSettled.data, ...recentCachedResults, ...forcedFinished].map((match) => [match.id, match])).values())
        : Array.from(new Map([...fallbackResults, ...forcedFinished].map((match) => [match.id, match])).values())
      ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const resultsData = await hydrateResultScoresFromFixtures(
        mergedResultsData.filter((match) => !activeLiveIds.has(String(match.id)))
      );
      const prefetchedAllocation = getPrefetchedNewsAllocation();
      const cachedAllocation = prefetchedAllocation ?? await getCachedHomeExploreNewsAllocation();
      const cachedNews = selectNewsForFeed(
        (cachedAllocation?.home || []).filter((item) => item?.imageUrl).slice(0, NEWS_MIN_VISIBLE),
        feedSelections
      );

      const finalUpcomingData = upcomingData.length > 0 ? upcomingData : (rawUpcomingMatches.length > 0 ? rawUpcomingMatches : prefetchedUpcomingMatches);
      setLiveMinuteSyncedAt(Date.now());
      setRawLiveMatches(liveData);
      setRawUpcomingMatches(finalUpcomingData);
      setRawResultsMatches(resultsData);
      setResultsLoading(false);

      setHomeData({
        ...buildMatchState(liveData, finalUpcomingData, resultsData),
        news: cachedNews,
      });
      setNewsLoading(cachedNews.length === 0);
      try {
        const allocation = await getHomeExploreNewsAllocation(userProfile?.uid, feedSelections);
        const homeCandidates = allocation.home.filter((item) => item?.imageUrl);
        const nextNewsSource = homeCandidates.length >= NEWS_MIN_VISIBLE ? homeCandidates : allocation.home;
        const nextNews = selectNewsForFeed(
          nextNewsSource.slice(0, NEWS_MIN_VISIBLE),
          feedSelections
        );
        setHomeData((prev) => ({ ...prev, news: nextNews }));
      } catch (error) {
        console.error('❌ Error loading home news:', error);
      } finally {
        setNewsLoading(false);
      }
    } catch (error) {
      console.error('❌ Error loading data:', error);
      setResultsLoading(false);
      setHomeData((prev) => ({
        ...prev,
        ...buildMatchState(
          rawLiveMatches,
          rawUpcomingMatches,
          rawResultsMatches.length > 0 ? rawResultsMatches : prefetchedResultsMatches
        ),
      }));
    }
  };

  useEffect(() => {
    if (isBootstrapping) return;
    const latest = getPrefetchedAppData();
    if (!latest) return;

    if (rawLiveMatches.length === 0 && latest.liveMatches.length > 0) {
      setRawLiveMatches(latest.liveMatches);
    }
    if (rawUpcomingMatches.length === 0 && latest.upcomingMatches.length > 0) {
      setRawUpcomingMatches(latest.upcomingMatches);
    }
    if (rawResultsMatches.length === 0 && latest.resultsMatches.length > 0) {
      setRawResultsMatches(latest.resultsMatches);
      setResultsLoading(false);
    }

    const nextNews = selectNewsForFeed(
      (latest.newsAllocation.home || []).filter((item) => item?.imageUrl).slice(0, NEWS_MIN_VISIBLE),
      feedSelections
    );

    setHomeData((prev) => {
      const nextMatches = buildMatchState(
        latest.liveMatches.length > 0 ? latest.liveMatches : rawLiveMatches,
        latest.upcomingMatches.length > 0 ? latest.upcomingMatches : rawUpcomingMatches,
        latest.resultsMatches.length > 0 ? latest.resultsMatches : rawResultsMatches
      );
      return {
        liveMatches: prev.liveMatches.length > 0 ? prev.liveMatches : nextMatches.liveMatches,
        upcomingMatches: prev.upcomingMatches.length > 0 ? prev.upcomingMatches : nextMatches.upcomingMatches,
        resultsMatches: prev.resultsMatches.length > 0 ? prev.resultsMatches : nextMatches.resultsMatches,
        news: prev.news.length > 0 ? prev.news : nextNews,
      };
    });
    if (nextNews.length > 0) {
      setNewsLoading(false);
    }
  }, [feedSelections, isBootstrapping, rawLiveMatches, rawResultsMatches, rawUpcomingMatches]);

  useEffect(() => {
    if (liveMatches.length === 0) return;
    const unsubscribers: (() => void)[] = [];
    const task = InteractionManager.runAfterInteractions(() => {
      liveMatches.forEach(match => {
        const chatId = match.id;
        const unsubscribe = presenceService.listenActiveCount('match', chatId, (count) => {
          setViewerCounts(prev => {
            if (prev[chatId] === count) return prev;
            return { ...prev, [chatId]: count };
          });
        });
        unsubscribers.push(unsubscribe);
      });
    });
    return () => {
      task.cancel();
      unsubscribers.forEach(unsub => unsub());
    };
  }, [liveMatches]);

  useEffect(() => {
    const sendFavoriteLiveAlerts = async () => {
      if (!userProfile?.uid) return;
      if (!preferences.notificationsEnabled || !preferences.liveScoresEnabled) return;
      const favoriteTeams = new Set((userProfile.followedTeams || []).map((t) => t.toLowerCase()));
      if (favoriteTeams.size === 0) return;

      const favoriteLiveMatches = liveMatches.filter(
        (m) =>
          m.phase === 'live' &&
          (favoriteTeams.has(m.home.toLowerCase()) || favoriteTeams.has(m.away.toLowerCase()))
      );
      if (!favoriteLiveMatches.length) return;

      await Promise.all(
        favoriteLiveMatches.map((m) =>
          notificationService.notifyFavoriteTeamLive({
            userId: userProfile.uid,
            matchId: m.id,
            home: m.home,
            away: m.away,
            league: m.league,
          })
        )
      );
    };
    void sendFavoriteLiveAlerts();
  }, [liveMatches, preferences.notificationsEnabled, preferences.liveScoresEnabled, userProfile?.uid, userProfile?.followedTeams]);

  const loadSubscriptions = async () => {
    if (!userProfile?.uid) return;
    
    try {
      const q = query(
        collection(db, 'matchNotifications'),
        where('userId', '==', userProfile.uid)
      );
      const snapshot = await getDocs(q);
      
      const subscribed = new Set<string>();
      snapshot.forEach((doc) => {
        subscribed.add(doc.data().matchId);
      });
      
      setSubscribedMatches(subscribed);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
    }
  };

  const toggleNotification = async (match: UpcomingMatch) => {
    if (!userProfile?.uid) {
      Alert.alert('Sign In Required', 'Please sign in to receive notifications.');
      return;
    }

    setLoadingNotify(match.id);
    const isSubscribed = subscribedMatches.has(match.id);

    try {
      if (isSubscribed) {
        const q = query(
          collection(db, 'matchNotifications'),
          where('userId', '==', userProfile.uid),
          where('matchId', '==', match.id)
        );
        const snapshot = await getDocs(q);
        await Promise.all(snapshot.docs.map((doc) => deleteDoc(doc.ref)));

        setSubscribedMatches((prev) => {
          const updated = new Set(prev);
          updated.delete(match.id);
          return updated;
        });
        analyticsService.track('notification_subscribe_toggled', { matchId: match.id, enabled: false, source: 'home' });

        Alert.alert('Notification Removed', `You won't be notified for ${match.home} vs ${match.away}.`);
      } else {
        await addDoc(collection(db, 'matchNotifications'), {
          userId: userProfile.uid,
          matchId: match.id,
          prefs: DEFAULT_MATCH_NOTIFY_PREFS,
          home: match.home,
          away: match.away,
          league: match.league,
          matchDate: match.date,
          createdAt: new Date().toISOString(),
        });

        setSubscribedMatches((prev) => new Set(prev).add(match.id));
        analyticsService.track('notification_subscribe_toggled', { matchId: match.id, enabled: true, source: 'home' });
        Alert.alert('Notification Set! 🔔', `You'll be notified when ${match.home} vs ${match.away} goes live.`);
      }
    } catch (error) {
      console.error('Error toggling notification:', error);
      monitoringService.error('home_toggle_notification_failed', error, { matchId: match.id });
      Alert.alert('Error', 'Failed to update notification.');
    } finally {
      setLoadingNotify(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData({ preferCache: false });
      if (userProfile?.uid) {
        await loadSubscriptions();
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Format time ago
  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return 'Yesterday';
    
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    return `${month} ${day}`;
  };

  // Format date for results
  const formatResultDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const matchDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (matchDay.getTime() === today.getTime()) return 'Today';
    if (matchDay.getTime() === yesterday.getTime()) return 'Yesterday';

    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    return `${month} ${day}`;
  };

  const formatChatCount = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return `${count}`;
  };
  const formatSpotlightDate = (dateValue: Date | string) => {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };
const formatSpotlightTime = (dateValue: Date | string) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};
const formatUpcomingCardDate = (dateValue: Date | string) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const matchDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (matchDay.getTime() === today.getTime()) return 'Today';
  if (matchDay.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
  const renderSectionBadge = (
    label: string,
    icon: keyof typeof Ionicons.glyphMap | null,
    accent: string,
    live: boolean = false
  ) => (
    <View
      style={[
        styles.sectionBadge,
        {
          backgroundColor: isDark ? '#101923' : '#EDF4FB',
          borderColor: isDark ? '#1C2D40' : '#D8E7F6',
        },
      ]}
    >
      {live ? (
        <Animated.View
          style={[
            styles.sectionBadgeDot,
            {
              backgroundColor: accent,
              opacity: liveDotOpacity,
            },
          ]}
        />
      ) : icon ? (
        <Ionicons name={icon} size={13} color={accent} />
      ) : null}
      <Text style={[styles.sectionBadgeText, { color: isDark ? '#D7E2EE' : '#17324D' }]}>{label}</Text>
    </View>
  );

  // Live match card
  const renderLiveMatch = (match: LiveMatch) => {
    const favoriteTeams = (userProfile?.followedTeams || []).map((t) => t.toLowerCase());
    const isFavoriteLive =
      favoriteTeams.includes(match.home.toLowerCase()) || favoriteTeams.includes(match.away.toLowerCase());
    const showFavoriteStar = isFavoriteLive && match.phase === 'live';
    const isLivePhase = match.phase === 'live';
    const homeColor = teamPrimaryColor(match.home);
    const awayColor = teamPrimaryColor(match.away);
    const liveMinuteLabel = getLiveMinuteLabel(match, liveMinuteTickNow, liveMinuteSyncedAt);
    const statusText = isLivePhase ? (liveMinuteLabel || 'LIVE') : 'CHAT OPEN';
    const chatCount = viewerCounts[match.id] ?? 0;
    return (
    <Pressable
      key={match.id}
      style={({ pressed }) => [
        styles.liveMatchCard,
        {
          backgroundColor: palette.card,
          borderColor: isDark ? '#273244' : '#D7E4F2',
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
      onPress={() => {
        router.push(
          buildMatchRouteDescriptor(
            { ...match, date: match.date, status: match.status },
            new Date(nowTs)
          ) as any
        );
      }}
        onPressIn={() => { void prefetchMatchOpenData({ id: match.id, status: match.status, date: match.date }); }}
    >
      <LinearGradient
        colors={[
          withAlpha(homeColor, isDark ? 0.18 : 0.09),
          withAlpha(homeColor, isDark ? 0.08 : 0.04),
          withAlpha(awayColor, isDark ? 0.07 : 0.03),
          withAlpha(awayColor, isDark ? 0.16 : 0.08),
        ]}
        locations={[0, 0.32, 0.68, 1]}
        start={{ x: 0, y: 0.18 }}
        end={{ x: 1, y: 0.82 }}
        style={styles.liveCardBlend}
      />
      <LinearGradient
        colors={[
          withAlpha(homeColor, isDark ? 0.8 : 0.68),
          withAlpha(awayColor, isDark ? 0.8 : 0.68),
        ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.liveCardAccentBar}
      />
      <View style={styles.liveCardContent}>
      <View style={styles.liveMatchHeader}>
        <View style={styles.liveHeaderMeta}>
          {showFavoriteStar && (
            <View style={styles.favoriteLiveStarBadge}>
              <Ionicons name="star" size={10} color="#DDEEFF" />
            </View>
          )}
          <Text style={[styles.liveLeague, { color: palette.subtext }]} numberOfLines={1}>
            {getDisplayLeagueName(match.league, match.date)}
          </Text>
        </View>
        <View
          style={[
            styles.liveStatusPill,
            {
              backgroundColor: isLivePhase
                ? (isDark ? 'rgba(255,69,58,0.16)' : '#FFF1F0')
                : (isDark ? 'rgba(77,163,255,0.16)' : '#EAF3FF'),
            },
          ]}
        >
          {isLivePhase ? (
            <Animated.View
              style={[
                styles.liveStatusDot,
                {
                  opacity: liveDotOpacity,
                  transform: [
                    {
                      scale: liveDotOpacity.interpolate({
                        inputRange: [0.2, 1],
                        outputRange: [0.88, 1.1],
                      }),
                    },
                  ],
                },
              ]}
            />
          ) : (
            <Ionicons name="chatbubbles" size={10} color={palette.link} />
          )}
          <Text style={[styles.liveStatusPillText, { color: isLivePhase ? '#FF6B5E' : palette.link }]}>
            {statusText}
          </Text>
        </View>
      </View>
      <View style={styles.liveMatchTeams}>
        <View style={styles.liveTeam}>
          {match.homeLogo ? (
            <Image 
              source={{ uri: match.homeLogo }} 
              style={styles.liveTeamLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.liveTeamLogoPlaceholder} />
          )}
            <Text
              style={[styles.liveTeamName, { fontSize: getTeamNameFontSize(), color: palette.text }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {formatTeamNameForTwoLines(getDisplayTeamName({ name: match.home, short_name: match.homeShortName, code: match.homeCode }, { preferFullName: true }))}
          </Text>
        </View>
        <View style={styles.liveScoreContainer}>
          <ScoreTicker value={match.phase === 'pregame' ? 'VS' : match.score} style={[styles.liveScore, { color: palette.text }]} />
        </View>
        <View style={styles.liveTeam}>
          {match.awayLogo ? (
            <Image 
              source={{ uri: match.awayLogo }} 
              style={styles.liveTeamLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.liveTeamLogoPlaceholder} />
          )}
          <Text
            style={[styles.liveTeamName, { fontSize: getTeamNameFontSize(), color: palette.text }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {formatTeamNameForTwoLines(getDisplayTeamName({ name: match.away, short_name: match.awayShortName, code: match.awayCode }, { preferFullName: true }))}
          </Text>
        </View>
      </View>

      <View style={[styles.liveFooterRow, { borderTopColor: isDark ? '#2C2C2E' : '#F0F0F0' }]}>
        <View style={styles.liveFooterMeta}>
          <Ionicons
            name={chatCount > 0 ? 'people-outline' : (isLivePhase ? 'radio-outline' : 'time-outline')}
            size={13}
            color={palette.subtext}
          />
          <Text style={[styles.liveFooterMetaText, { color: palette.subtext }]}>
            {chatCount > 0
              ? `${formatChatCount(chatCount)} chatting`
              : isLivePhase
                ? 'Live now'
                : 'Pregame'}
          </Text>
        </View>
        <View style={styles.liveActionRow}>
          <Text style={[styles.liveActionText, { color: palette.link }]}>{isLivePhase ? 'Join Live Chat' : 'Pregame'}</Text>
          <Ionicons name="chevron-forward" size={14} color={palette.link} />
        </View>
      </View>
      </View>
    </Pressable>
  );
};

  // Upcoming match card
  const getTeamNameFontSize = () => (Platform.OS === 'ios' ? 9 : 9);

  const renderUpcomingMatch = (match: UpcomingMatch) => {
    const homeColor = softenCardTintColor(teamPrimaryColor(match.home));
    const awayColor = softenCardTintColor(teamPrimaryColor(match.away));
    
    return (
      <Pressable 
        key={match.id} 
        style={({ pressed }) => [
          styles.upcomingCard,
          {
            backgroundColor: palette.card,
            borderColor: isDark ? '#273244' : '#D7E4F2',
            transform: [{ scale: pressed ? 0.97 : 1 }],
          },
        ]}
        onPress={() => {
          router.push(
            buildMatchRouteDescriptor(
              { ...match, date: match.kickoffTime, status: match.status },
              new Date(nowTs)
            ) as any
          );
        }}
        onPressIn={() => { void prefetchMatchOpenData({ id: match.id, status: match.status, date: match.kickoffTime.toISOString() }); }}
      >
        <LinearGradient
          colors={[
            withAlpha(homeColor, isDark ? 0.72 : 0.5),
            withAlpha(awayColor, isDark ? 0.64 : 0.46),
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.upcomingCardAccentBar}
        />
        <LinearGradient
          colors={[
            withAlpha(homeColor, isDark ? 0.26 : 0.18),
            'rgba(0,0,0,0)',
            withAlpha(awayColor, isDark ? 0.24 : 0.16),
          ]}
          locations={[0, 0.48, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.upcomingCardTint}
      />
      <View style={styles.upcomingCardContent}>
        <View style={styles.upcomingHeader}>
          <Text style={[styles.upcomingLeagueTop, { color: palette.link }]} numberOfLines={1}>
            {getHomeUpcomingLeagueName(match.league, match.kickoffTime, isCompactHeader)}
          </Text>
        </View>
        <LinearGradient
          colors={[
            withAlpha(homeColor, isDark ? 0.72 : 0.56),
            withAlpha(awayColor, isDark ? 0.72 : 0.56),
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.cardLeagueDivider}
        />
        
        <View style={styles.upcomingTeams}>
          <View style={styles.upcomingTeam}>
            {match.homeLogo ? (
              <Image 
                source={{ uri: match.homeLogo }} 
                style={styles.upcomingTeamLogo}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.upcomingTeamLogoPlaceholder} />
            )}
            <Text
              style={[styles.upcomingTeamName, { color: palette.text, fontSize: getTeamNameFontSize() + 0.5 }, { flexShrink: 1 }]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {formatTeamNameForTwoLines(getDisplayTeamName({ name: match.home, short_name: match.homeShortName, code: match.homeCode }, { preferFullName: true }))}
            </Text>
          </View>
          <Text style={[styles.upcomingVs, { color: palette.subtext }]}>vs</Text>
          <View style={styles.upcomingTeam}>
            {match.awayLogo ? (
              <Image 
                source={{ uri: match.awayLogo }} 
                style={styles.upcomingTeamLogo}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.upcomingTeamLogoPlaceholder} />
            )}
            <Text
              style={[styles.upcomingTeamName, { color: palette.text, fontSize: getTeamNameFontSize() + 0.5 }, { flexShrink: 1 }]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {formatTeamNameForTwoLines(getDisplayTeamName({ name: match.away, short_name: match.awayShortName, code: match.awayCode }, { preferFullName: true }))}
            </Text>
          </View>
        </View>

        <View style={styles.upcomingMetaRow}>
          <Text style={[styles.upcomingBottomDate, { color: palette.subtext }]} numberOfLines={1}>
            {formatUpcomingCardDate(match.kickoffTime)}
          </Text>
          <Text style={[styles.upcomingBottomTime, { color: palette.subtext }]} numberOfLines={1}>
            {formatSpotlightTime(match.kickoffTime)}
          </Text>
        </View>
        </View>
      </Pressable>
    );
  };

  // Results match card
  const renderResultMatch = (match: ResultMatch) => {
    const homeColor = softenCardTintColor(teamPrimaryColor(match.home));
    const awayColor = softenCardTintColor(teamPrimaryColor(match.away));
    return (
    <Pressable
      key={match.id}
      style={({ pressed }) => [
        styles.resultCard,
        {
          backgroundColor: palette.card,
          borderColor: isDark ? '#273244' : '#D7E4F2',
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
      onPress={() =>
        router.push(
          buildMatchRouteDescriptor(
            { ...match, date: match.date, status: 'finished' },
            new Date(nowTs)
          ) as any
        )
      }
      onPressIn={() => { void prefetchMatchOpenData({ id: match.id, status: 'finished', date: match.date }); }}
    >
      <LinearGradient
        colors={[
          withAlpha(homeColor, isDark ? 0.78 : 0.58),
          withAlpha(awayColor, isDark ? 0.72 : 0.54),
        ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.resultCardAccentBar}
      />
      <LinearGradient
        colors={[
          withAlpha(homeColor, isDark ? 0.22 : 0.16),
          'rgba(0,0,0,0)',
          withAlpha(awayColor, isDark ? 0.2 : 0.15),
        ]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.resultCardTint}
      />
      <View style={styles.resultCardContent}>
      <View style={styles.resultHeader}>
        <Text style={[styles.resultLeague, { color: palette.subtext }]} numberOfLines={1}>
          {getDisplayLeagueName(match.league, match.date)}
        </Text>
      </View>
      <LinearGradient
        colors={[
          withAlpha(homeColor, isDark ? 0.72 : 0.56),
          withAlpha(awayColor, isDark ? 0.72 : 0.56),
        ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.cardLeagueDivider}
      />
      
      <View style={styles.resultTeams}>
        <View style={styles.resultLogoSide}>
          {match.homeLogo ? (
            <Image
              source={{ uri: match.homeLogo }}
              style={styles.resultTeamLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.resultTeamLogoPlaceholder, { backgroundColor: palette.placeholder }]} />
          )}
        </View>

        <View style={styles.resultScoreContainer}>
          <Text style={[styles.resultScore, { color: palette.text }]}>{match.score}</Text>
        </View>

        <View style={styles.resultLogoSide}>
          {match.awayLogo ? (
            <Image
              source={{ uri: match.awayLogo }}
              style={styles.resultTeamLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.resultTeamLogoPlaceholder, { backgroundColor: palette.placeholder }]} />
          )}
        </View>
      </View>

      <View style={styles.resultNamesRow}>
        <View style={styles.resultNameSide}>
          <Text
            style={[styles.resultTeamName, { color: palette.text, fontSize: getTeamNameFontSize() }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {formatTeamNameForTwoLines(getDisplayTeamName({ name: match.home, short_name: match.homeShortName, code: match.homeCode }, { preferFullName: true }))}
          </Text>
        </View>
        <View style={styles.resultScoreSpacer} />
        <View style={styles.resultNameSide}>
          <Text
            style={[styles.resultTeamName, { color: palette.text, fontSize: getTeamNameFontSize() }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {formatTeamNameForTwoLines(getDisplayTeamName({ name: match.away, short_name: match.awayShortName, code: match.awayCode }, { preferFullName: true }))}
          </Text>
        </View>
      </View>

      <View style={styles.resultMeta}>
        <Text style={[styles.resultDateBottom, styles.resultMetaLeft, { color: palette.subtext }]}>{formatResultDate(match.date)}</Text>
        <View style={[styles.ftBadge, styles.resultMetaRight, { backgroundColor: isDark ? '#2C2C2E' : '#F5F5F7' }]}>
          <Text style={[styles.ftText, { color: palette.subtext }]}>FT</Text>
        </View>
      </View>
      </View>
    </Pressable>
  );
  };

  // News hero card - FULL IMAGE with gradient overlay (PL App Style)
  const renderHeroNews = (article: NewsArticle) => {
    const accent = getNewsAccent(article);
    return (
      <TouchableOpacity
        style={styles.heroNewsCard}
        onPress={() => {
          openArticle(article);
        }}
        onPressIn={() => {
          prefetchArticle(article);
        }}
        activeOpacity={0.95}
      >
        <NewsImage uri={article.imageUrl} style={styles.heroNewsImage} resizeMode="cover" />
        <View style={styles.heroNewsGradient}>
          <View style={styles.heroNewsTopLabel}>
            <Text style={styles.heroNewsTopLabelText}>Top Story</Text>
            <View style={styles.heroNewsTopLine} />
          </View>
          <View style={[styles.heroNewsBadge, { backgroundColor: accent.chipBg }]}>
            <Text style={[styles.heroNewsBadgeText, { color: accent.chipText }]}>{article.category || 'NEWS'}</Text>
          </View>
          <Text style={styles.heroNewsTitle}>{article.title}</Text>
          <Text style={styles.heroNewsMeta}>{article.source} · {formatTimeAgo(article.publishedAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFeatureNewsCard = (article: NewsArticle, index: number) => {
    const accent = getNewsAccent(article);
    return (
      <TouchableOpacity
        key={article.id}
        style={[
          styles.newsFeatureCard,
          {
            backgroundColor: isDark ? '#111826' : '#FFFFFF',
            borderColor: isDark ? 'rgba(148,184,255,0.14)' : '#D9E6F5',
          },
        ]}
        onPress={() => openArticle(article)}
        onPressIn={() => prefetchArticle(article)}
        activeOpacity={0.88}
      >
        <NewsImage uri={article.imageUrl} style={styles.newsFeatureImage} resizeMode="cover" />
        <View style={styles.newsFeatureOverlay} />
        <View style={styles.newsFeatureBody}>
          <View style={[styles.newsFeatureChip, { backgroundColor: accent.chipBg }]}>
            <Text style={[styles.newsFeatureChipText, { color: accent.chipText }]}>
              {index === 0 ? 'Feature' : 'Watchlist'}
            </Text>
          </View>
          <Text style={styles.newsFeatureTitle} numberOfLines={3}>{article.title}</Text>
          <Text style={styles.newsFeatureMeta}>{article.source} · {formatTimeAgo(article.publishedAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // News list item
  const renderNewsListItem = (article: NewsArticle) => (
    <TouchableOpacity
      key={article.id}
      style={[styles.newsListItem, { backgroundColor: palette.card }]}
      onPress={() => {
        openArticle(article);
      }}
      onPressIn={() => {
        prefetchArticle(article);
      }}
      activeOpacity={0.7}
    >
      <View style={styles.newsListContent}>
        <View style={styles.newsListMeta}>
          <Text style={[styles.newsListSource, { color: palette.link }]}>{article.source}</Text>
          <Text style={[styles.newsListDot, { color: palette.subtext }]}>·</Text>
          <Text style={[styles.newsListTime, { color: palette.subtext }]}>{formatTimeAgo(article.publishedAt)}</Text>
        </View>
        <Text style={[styles.newsListTitle, { color: palette.text }]}>{article.title}</Text>
      </View>
      <NewsImage uri={article.imageUrl} style={styles.newsListImage} resizeMode="cover" />
    </TouchableOpacity>
  );

  const liveMatchesTop = useMemo(() => {
    const favoriteTeams = new Set((userProfile?.followedTeams || []).map((t) => t.toLowerCase()));
    const sorted = [...scopedLiveMatches].sort((a, b) => {
      const aFav = favoriteTeams.has(a.home.toLowerCase()) || favoriteTeams.has(a.away.toLowerCase());
      const bFav = favoriteTeams.has(b.home.toLowerCase()) || favoriteTeams.has(b.away.toLowerCase());
      if (aFav !== bFav) return aFav ? -1 : 1;
      return a.kickoffTime.getTime() - b.kickoffTime.getTime();
    });
    return sorted.slice(0, 8);
  }, [scopedLiveMatches, userProfile?.followedTeams]);
  const upcomingMatchesTop = useMemo(
    () => scopedUpcomingMatches.slice(0, UPCOMING_PREVIEW_LIMIT),
    [scopedUpcomingMatches]
  );
  const displayResultsMatches = (() => {
    if (scopedResultsMatches.length > 0) return scopedResultsMatches;
    const fallbackSource = rawResultsMatches.length > 0 ? rawResultsMatches : prefetchedResultsMatches;
    if (fallbackSource.length === 0) return [];
    const mappedFallback = mapResultsMatches(fallbackSource, rawLiveMatches);
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const filteredFallback = filterMatchesForFeed(mappedFallback, feedSelections);
    const filteredIds = new Set(filteredFallback.map(m => m.id));
    const recentExtra = mappedFallback.filter(
      m => !filteredIds.has(m.id) && now - new Date(m.date).getTime() <= SEVEN_DAYS_MS
    );
    return [...filteredFallback, ...recentExtra].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  })();
  const feedOnlyResultsMatches = useMemo(() => {
    const source = displayResultsMatches.length > 0 ? displayResultsMatches : resultsMatches;
    const filtered = filterMatchesForFeed(source, feedSelections);
    return hasFeedSelections ? filtered : source;
  }, [displayResultsMatches, feedSelections, hasFeedSelections, resultsMatches]);
  const resultsMatchesTop = useMemo(() => {
    const now = new Date(nowTs);
    const sorted = [...displayResultsMatches]
      .sort((a, b) => {
        const aToday = isSameLocalDay(a.date, now) ? 1 : 0;
        const bToday = isSameLocalDay(b.date, now) ? 1 : 0;
        if (aToday !== bToday) return bToday - aToday;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
    const seenLeagues = new Set<string>();
    const diversified: ResultMatch[] = [];
    for (const match of sorted) {
      const leagueKey = (match.league || '').toLowerCase().trim();
      if (!leagueKey || seenLeagues.has(leagueKey)) continue;
      diversified.push(match);
      seenLeagues.add(leagueKey);
      if (diversified.length >= 8) return diversified;
    }
    for (const match of sorted) {
      if (diversified.length >= 8) break;
      if (diversified.some((existing) => existing.id === match.id)) continue;
      diversified.push(match);
    }
    return diversified;
  }, [displayResultsMatches, nowTs]);
  const favoriteTeamSet = useMemo(
    () => new Set((userProfile?.followedTeams || []).map((team) => team.toLowerCase())),
    [userProfile?.followedTeams]
  );
  const scoreSpotlightCandidate = (candidate: SpotlightCandidate, now: Date) => {
    const homeScore = getTeamSpotlightScore(candidate.match.home);
    const awayScore = getTeamSpotlightScore(candidate.match.away);
    const closenessBonus = Math.max(0, 20 - Math.abs(homeScore - awayScore));
    const competitionBonus = getCompetitionSpotlightScore(candidate.match.league);
    const rivalryBonus = getRivalrySpotlightScore(candidate.match.home, candidate.match.away);
    const weekendBonus = candidate.match.kickoffTime.getDay() === 0 || candidate.match.kickoffTime.getDay() === 6 ? 3 : 0;
    const todayBonus = isSameLocalDay(candidate.match.kickoffTime, now) ? 2 : 0;
    const favoriteBonus = candidate.favorite ? 4 : 0;
    // liveBonus intentionally removed — MOTD is locked for the full calendar day by prestige score only
    return homeScore + awayScore + closenessBonus + competitionBonus + rivalryBonus + weekendBonus + todayBonus + favoriteBonus;
  };
  const spotlightSelection = useMemo<{ candidate: SpotlightCandidate | null; mode: 'day' | 'week' | 'twoWeeks' | 'threeWeeks' | 'fourWeeks' }>(() => {
    const now = new Date(nowTs);
    const todayStart = getLocalDayStart(now);
    const fallbackUpcomingSource = rawUpcomingMatches.length > 0 ? rawUpcomingMatches : prefetchedUpcomingMatches;
    const fallbackUpcomingMatches = sortByKickoffAsc(mapUpcomingMatches(fallbackUpcomingSource));
    const feedScopedFallbackUpcomingMatches = sortByKickoffAsc(filterMatchesForFeed(fallbackUpcomingMatches, feedSelections));
    const nearTermMarqueeFallbackMatches = fallbackUpcomingMatches.filter((match) => {
      const kickoff = match.kickoffTime.getTime();
      return kickoff > now.getTime() && kickoff <= now.getTime() + UPCOMING_FEED_RESCUE_WINDOW_MS && isMarqueeUpcomingMatch(match);
    });
    // Base pool: feed-scoped if user has selections, else all
    const baseFeedPool =
      fallbackUpcomingMatches.length > 0
        ? (hasFeedSelections ? feedScopedFallbackUpcomingMatches : fallbackUpcomingMatches)
        : scopedUpcomingMatches;
    // Always include matches happening within the next 48 h (international break coverage)
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    const imminentAll = fallbackUpcomingMatches.filter(m => {
      const t = m.kickoffTime.getTime();
      return t > now.getTime() && t <= now.getTime() + TWO_DAYS_MS;
    });
    const basePoolIds = new Set(baseFeedPool.map(m => m.id));
    const fullUpcomingPool = hasFeedSelections
      ? mergeUpcomingMatches(
          nearTermMarqueeFallbackMatches.length > 0 &&
            (baseFeedPool.length === 0 || baseFeedPool[0].kickoffTime.getTime() > now.getTime() + UPCOMING_FEED_TOO_FAR_MS)
            ? nearTermMarqueeFallbackMatches
            : [],
          baseFeedPool
        )
      : [
          ...baseFeedPool,
          ...imminentAll.filter(m => !basePoolIds.has(m.id)),
        ];
    const upcomingPool = fullUpcomingPool.length > 0 ? fullUpcomingPool : scopedUpcomingMatches;
    const candidates: SpotlightCandidate[] = [
      ...scopedLiveMatches.slice(0, 16).map((match) => ({
        kind: 'live' as const,
        match,
        favorite: favoriteTeamSet.has(match.home.toLowerCase()) || favoriteTeamSet.has(match.away.toLowerCase()),
      })),
      ...upcomingPool
        .filter((match) => match.kickoffTime.getTime() > now.getTime())
        .slice(0, 48).map((match) => ({
        kind: 'upcoming' as const,
        match,
        favorite: favoriteTeamSet.has(match.home.toLowerCase()) || favoriteTeamSet.has(match.away.toLowerCase()),
      })),
      ...feedOnlyResultsMatches
        .filter((match) => isSameLocalDay(match.date, now))
        .slice(0, 16)
        .map((match) => ({
          kind: 'finished' as const,
          match: {
            ...match,
            kickoffTime: new Date(match.date),
            status: 'finished' as const,
          },
        favorite: favoriteTeamSet.has(match.home.toLowerCase()) || favoriteTeamSet.has(match.away.toLowerCase()),
      })),
    ];
    if (candidates.length === 0) return { candidate: null, mode: 'day' };
    const dayCandidates = candidates.filter(
      (candidate) => getLocalDayStart(candidate.match.kickoffTime) === todayStart
    );
    if (dayCandidates.length === 0) {
      const pickBestUpcomingWithinDays = (daysAhead: number) => {
        const windowEnd = new Date(now);
        windowEnd.setDate(now.getDate() + daysAhead);
        const windowCandidates: SpotlightCandidate[] = fullUpcomingPool
          .filter((match) => {
            const kickoff = match.kickoffTime;
            return kickoff.getTime() > now.getTime() && kickoff.getTime() <= windowEnd.getTime();
          })
          .map((match) => ({
            kind: 'upcoming' as const,
            match,
            favorite: favoriteTeamSet.has(match.home.toLowerCase()) || favoriteTeamSet.has(match.away.toLowerCase()),
          }));
        return windowCandidates
          .slice()
          .sort((a, b) => {
            const aScore = scoreSpotlightCandidate(a, now);
            const bScore = scoreSpotlightCandidate(b, now);
            if (aScore !== bScore) return bScore - aScore;
            return a.match.kickoffTime.getTime() - b.match.kickoffTime.getTime();
          })[0] ?? null;
      };

      // Try nearest match first (next 3 days), then widen progressively
      const threeDayCandidate = pickBestUpcomingWithinDays(3);
      if (threeDayCandidate) return { candidate: threeDayCandidate, mode: 'week' };

      const weeklyCandidate = pickBestUpcomingWithinDays(10);
      if (weeklyCandidate) return { candidate: weeklyCandidate, mode: 'week' };

      const twoWeekCandidate = pickBestUpcomingWithinDays(14);
      if (twoWeekCandidate) return { candidate: twoWeekCandidate, mode: 'twoWeeks' };

      const threeWeekCandidate = pickBestUpcomingWithinDays(21);
      if (threeWeekCandidate) return { candidate: threeWeekCandidate, mode: 'threeWeeks' };

      const fourWeekCandidate = pickBestUpcomingWithinDays(28);
      if (fourWeekCandidate) return { candidate: fourWeekCandidate, mode: 'fourWeeks' };

      return { candidate: null, mode: 'fourWeeks' };
    }
    // If we already picked a MOTD for today, keep it — unless a live match outscores it by
    // a large margin (e.g. UCL goes live while a lower-tier match was locked earlier).
    if (motdDayLockRef.current?.dayStart === todayStart) {
      const lockedId = motdDayLockRef.current.matchId;
      const locked = dayCandidates.find(c => String(c.match.id) === lockedId);
      if (locked) {
        const lockedScore = scoreSpotlightCandidate(locked, now);
        const bestLive = dayCandidates
          .filter(c => c.kind === 'live')
          .sort((a, b) => scoreSpotlightCandidate(b, now) - scoreSpotlightCandidate(a, now))[0];
        if (bestLive) {
          const liveScore = scoreSpotlightCandidate(bestLive, now);
          if (liveScore > lockedScore + 15) {
            // A significantly higher-prestige live match appeared — break the lock
            motdDayLockRef.current = { dayStart: todayStart, matchId: String(bestLive.match.id) };
            return { candidate: bestLive, mode: 'day' };
          }
        }
        return { candidate: locked, mode: 'day' };
      }
    }
    // First pick of the day — sort by prestige and lock
    const topCandidate = dayCandidates
      .slice()
      .sort((a, b) => {
        const aScore = scoreSpotlightCandidate(a, now);
        const bScore = scoreSpotlightCandidate(b, now);
        if (aScore !== bScore) return bScore - aScore;
        return a.match.kickoffTime.getTime() - b.match.kickoffTime.getTime();
      })[0] ?? null;
    if (topCandidate) {
      motdDayLockRef.current = { dayStart: todayStart, matchId: String(topCandidate.match.id) };
    }
    return { candidate: topCandidate, mode: 'day' };
  }, [favoriteTeamSet, feedOnlyResultsMatches, feedSelections, hasFeedSelections, nowTs, prefetchedUpcomingMatches, rawUpcomingMatches, scopedLiveMatches, scopedUpcomingMatches]);
  const spotlightMatch = spotlightSelection.candidate;
  useEffect(() => {
    if (spotlightMatch) {
      void prefetchMatchOpenData({
        id: spotlightMatch.match.id,
        status: spotlightMatch.match.status,
        date: spotlightMatch.match.kickoffTime.toISOString(),
        homeLogo: spotlightMatch.match.homeLogo,
        awayLogo: spotlightMatch.match.awayLogo,
      } as any);
    }
    liveMatchesTop.slice(0, 4).forEach((match) => {
      void prefetchMatchOpenData({
        id: match.id,
        status: match.status,
        date: match.date,
        homeLogo: match.homeLogo,
        awayLogo: match.awayLogo,
      } as any);
    });
    upcomingMatchesTop.slice(0, 4).forEach((match) => {
      void prefetchMatchOpenData({
        id: match.id,
        status: match.status,
        date: match.kickoffTime.toISOString(),
        homeLogo: match.homeLogo,
        awayLogo: match.awayLogo,
      } as any);
    });
    displayResultsMatches.slice(0, 4).forEach((match) => {
      void prefetchMatchOpenData({
        id: match.id,
        status: 'finished',
        date: match.date,
        homeLogo: match.homeLogo,
        awayLogo: match.awayLogo,
      } as any);
    });
  }, [displayResultsMatches, liveMatchesTop, spotlightMatch, upcomingMatchesTop]);
  const displayNews = useMemo(() => {
    const candidates = news.filter((item) => item?.title && item?.imageUrl).slice(0, NEWS_MIN_VISIBLE);
    const selected = selectNewsForFeed(candidates, feedSelections);
    if (selected.length >= 6) return selected;
    // Not enough matching articles — use all candidates sorted by preference
    return sortNewsForFeed(candidates, feedSelections).slice(0, NEWS_MIN_VISIBLE);
  }, [feedSelections, news]);
  const heroArticle = useMemo(() => displayNews[0], [displayNews]);
  const featureArticles = useMemo(() => displayNews.slice(1, 3), [displayNews]);
  const newsList = useMemo(() => displayNews.slice(3, NEWS_MIN_VISIBLE), [displayNews]);

  const sections = useMemo(() => {
    const next: { key: string; data: { key: string }[] }[] = [];
    if (spotlightMatch) {
      next.push({ key: 'spotlight', data: [{ key: 'spotlight' }] });
    }
    if (liveMatchesTop.length > 0) {
      next.push({ key: 'live', data: [{ key: 'live' }] });
    }
    next.push({ key: 'upcoming', data: [{ key: 'upcoming' }] });
    if (resultsLoading || displayResultsMatches.length > 0) {
      next.push({ key: 'results', data: [{ key: 'results' }] });
    }
    if (heroArticle || featureArticles.length > 0 || newsList.length > 0 || newsLoading) {
      next.push({ key: 'news', data: [{ key: 'news' }] });
    }
    return next;
  }, [displayResultsMatches.length, featureArticles.length, heroArticle, liveMatchesTop.length, newsList.length, newsLoading, resultsLoading, spotlightMatch]);
  const headerActionTop = Math.max(insets.top + 2, 12);
  const headerProfileSize = isCompactHeader ? 34 : 38;
  const headerBrandSize = isCompactHeader ? 38 : 44;
  const headerBrandTop = headerActionTop + (headerProfileSize - headerBrandSize) / 2;

  const renderSpotlightMatch = (candidate: SpotlightCandidate) => {
    const match = candidate.match;
    const homeColor = teamPrimaryColor(match.home);
    const awayColor = teamPrimaryColor(match.away);
    const route = buildMatchRouteDescriptor(
      { ...match, date: match.kickoffTime, status: match.status },
      new Date(nowTs)
    );
    const isLiveSpotlight = candidate.kind === 'live';
    const isFinishedSpotlight = candidate.kind === 'finished';
    const liveSpotlightMatch = candidate.kind === 'live' ? candidate.match : null;
    const centerTop = formatSpotlightDate(match.kickoffTime);
    const isPregameSpotlight = isLiveSpotlight && liveSpotlightMatch?.phase === 'pregame';
    const centerMain = isLiveSpotlight
      ? (isPregameSpotlight ? formatSpotlightTime(match.kickoffTime) : (liveSpotlightMatch?.score || '0-0'))
      : isFinishedSpotlight
        ? (candidate.match.score || '0-0')
        : formatSpotlightTime(match.kickoffTime);
    const centerBottom = isLiveSpotlight
      ? (isPregameSpotlight ? 'Pregame' : (liveSpotlightMatch ? (getLiveMinuteLabel(liveSpotlightMatch, liveMinuteTickNow, liveMinuteSyncedAt) || 'Live now') : 'Live now'))
      : isFinishedSpotlight
        ? 'Full Time'
        : 'Kickoff';
    const kicker =
      spotlightSelection.mode === 'day'
        ? 'Match of the Day'
        : spotlightSelection.mode === 'week'
          ? 'Game of the Week'
          : spotlightSelection.mode === 'twoWeeks'
            ? 'Featured Match Ahead'
            : spotlightSelection.mode === 'threeWeeks'
              ? 'Featured Match Ahead'
              : 'Featured Match Ahead';

    return (
      <TouchableOpacity
        style={[
          styles.spotlightCard,
          {
            backgroundColor: isDark ? '#11161D' : '#F7FAFE',
            borderColor: isDark ? '#1D2A38' : '#D6E4F3',
          },
        ]}
        onPress={() => router.push(route as any)}
        onPressIn={() => { void prefetchMatchOpenData({ id: match.id, status: match.status, date: match.kickoffTime.toISOString() }); }}
        activeOpacity={0.92}
      >
        <LinearGradient
          colors={[
            withAlpha(homeColor, isDark ? 0.58 : 0.34),
            withAlpha(homeColor, isDark ? 0.3 : 0.18),
            withAlpha(awayColor, isDark ? 0.26 : 0.16),
            withAlpha(awayColor, isDark ? 0.54 : 0.3),
          ]}
          locations={[0, 0.34, 0.66, 1]}
          start={{ x: 0, y: 0.22 }}
          end={{ x: 1, y: 0.78 }}
          style={styles.spotlightBlend}
        />
        <LinearGradient
          colors={[
            withAlpha(homeColor, isDark ? 0.56 : 0.3),
            'rgba(0,0,0,0)',
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.spotlightSideTint, styles.spotlightSideTintLeft]}
        />
        <LinearGradient
          colors={[
            'rgba(0,0,0,0)',
            withAlpha(awayColor, isDark ? 0.52 : 0.28),
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.spotlightSideTint, styles.spotlightSideTintRight]}
        />
        <LinearGradient
          colors={[
            isDark ? 'rgba(2,6,10,0.04)' : 'rgba(255,255,255,0.05)',
            isDark ? 'rgba(5,10,16,0.18)' : 'rgba(247,250,254,0.16)',
            isDark ? 'rgba(5,10,16,0.68)' : 'rgba(247,250,254,0.58)',
            isDark ? 'rgba(5,10,16,0.9)' : 'rgba(247,250,254,0.84)',
          ]}
          locations={[0, 0.36, 0.72, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.spotlightCoreFade}
        />

        <View style={styles.spotlightTopRow}>
          <View style={styles.spotlightHeading}>
            <Text style={[styles.spotlightKicker, { color: candidate.favorite ? '#8CC4FF' : '#9DB9D8' }]} numberOfLines={1}>
              {kicker}
            </Text>
          </View>
          <View
            style={[
              styles.spotlightStatusPill,
              {
                backgroundColor: (isLiveSpotlight && !isPregameSpotlight)
                  ? (isDark ? 'rgba(255,69,58,0.14)' : '#FFF1F0')
                  : isFinishedSpotlight
                    ? (isDark ? 'rgba(94,234,212,0.14)' : '#E8FFFA')
                    : (isDark ? 'rgba(77,163,255,0.14)' : '#EAF3FF'),
              },
            ]}
          >
            {(isLiveSpotlight && !isPregameSpotlight) ? <Animated.View style={[styles.sectionBadgeDot, { backgroundColor: '#FF5C54', opacity: liveDotOpacity }]} /> : null}
            <Text
              style={[
                styles.spotlightStatusText,
                { color: (isLiveSpotlight && !isPregameSpotlight) ? '#FF847D' : isFinishedSpotlight ? '#5EEAD4' : palette.link },
              ]}
            >
              {(isLiveSpotlight && !isPregameSpotlight) ? 'LIVE' : isFinishedSpotlight ? 'FINAL' : 'UPCOMING'}
            </Text>
          </View>
        </View>

        <View style={styles.spotlightBody}>
          <View style={styles.spotlightTeamCol}>
            {match.homeLogo ? <Image source={{ uri: match.homeLogo }} style={styles.spotlightTeamLogo} resizeMode="contain" /> : <View style={[styles.spotlightTeamLogoPlaceholder, { backgroundColor: isDark ? '#18212C' : '#E6EEF7' }]} />}
            <Text
              style={[styles.spotlightTeamName, { color: isDark ? '#F4F7FB' : '#0F2742' }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              allowFontScaling
            >
              {formatTeamNameForTwoLines(getDisplayTeamName({ name: match.home, short_name: match.homeShortName, code: match.homeCode }, { preferFullName: true }), 12)}
            </Text>
          </View>

          <View style={styles.spotlightCenterCol}>
            <Text style={[styles.spotlightCenterTop, { color: isDark ? '#C7D5E4' : '#4A6886' }]}>{centerTop}</Text>
            <Text style={[styles.spotlightCenterMain, { color: isDark ? '#F7FAFD' : '#0D2238' }]}>{centerMain}</Text>
            <Text style={[styles.spotlightCenterBottom, { color: isDark ? '#8FB7E0' : '#3A78BE' }]}>{centerBottom}</Text>
          </View>

          <View style={styles.spotlightTeamCol}>
            {match.awayLogo ? <Image source={{ uri: match.awayLogo }} style={styles.spotlightTeamLogo} resizeMode="contain" /> : <View style={[styles.spotlightTeamLogoPlaceholder, { backgroundColor: isDark ? '#18212C' : '#E6EEF7' }]} />}
            <Text
              style={[styles.spotlightTeamName, { color: isDark ? '#F4F7FB' : '#0F2742' }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              allowFontScaling
            >
              {formatTeamNameForTwoLines(getDisplayTeamName({ name: match.away, short_name: match.awayShortName, code: match.awayCode }, { preferFullName: true }), 12)}
            </Text>
          </View>
        </View>

        <View style={[styles.spotlightFooter, { borderTopColor: isDark ? '#243241' : '#D9E7F4' }]}>
          <Text style={[styles.spotlightLeagueBottom, { color: isDark ? '#DCE8F5' : '#17324D' }]} numberOfLines={1}>
            {getDisplayLeagueName(match.league, match.kickoffTime)}
          </Text>
          <View style={styles.spotlightActionRow}>
            <Text style={[styles.spotlightActionText, { color: palette.link }]}>
              {isLiveSpotlight ? 'Open Match Chat' : isFinishedSpotlight ? 'Open Match Results' : 'Open Match Center'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={palette.link} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionItem = ({ section }: { section: { key: string } }) => {
    switch (section.key) {
      case 'spotlight':
        return spotlightMatch ? <View style={styles.spotlightSection}>{renderSpotlightMatch(spotlightMatch)}</View> : null;
      case 'live':
        return (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>{renderSectionBadge('Live Now', null, '#FF5C54', true)}</View>
              <TouchableOpacity onPressIn={() => { void warmScreenData('live'); }} onPress={() => router.push('/live' as any)}>
                <Text style={[styles.seeAllText, { color: palette.link }]}>See All</Text>
              </TouchableOpacity>
            </View>
            
            <NativeViewGestureHandler ref={liveListRef} simultaneousHandlers={outerScrollRef}>
              <FlatList
                horizontal
                data={liveMatchesTop}
                renderItem={({ item }) => renderLiveMatch(item)}
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScroll}
                decelerationRate="fast"
                initialNumToRender={4}
                windowSize={5}
                maxToRenderPerBatch={6}
                updateCellsBatchingPeriod={50}
                removeClippedSubviews={enableClippedSubviews}
              />
            </NativeViewGestureHandler>
          </View>
        );
      case 'upcoming':
        return (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              {renderSectionBadge('Upcoming', null, palette.link)}
              <TouchableOpacity onPressIn={() => { void warmScreenData('upcoming'); }} onPress={() => router.push('/upcoming' as any)}>
                <Text style={[styles.seeAllText, { color: palette.link }]}>See All</Text>
              </TouchableOpacity>
            </View>

            <NativeViewGestureHandler ref={upcomingListRef} simultaneousHandlers={outerScrollRef}>
              <FlatList
                horizontal
                data={upcomingMatchesTop}
                renderItem={({ item }) => renderUpcomingMatch(item)}
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScroll}
                decelerationRate="fast"
                initialNumToRender={4}
                windowSize={5}
                maxToRenderPerBatch={6}
                updateCellsBatchingPeriod={50}
                removeClippedSubviews={enableClippedSubviews}
              />
            </NativeViewGestureHandler>
          </View>
        );
      case 'results':
        return (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              {renderSectionBadge('Results', 'checkmark-circle-outline', palette.link)}
              <TouchableOpacity onPressIn={() => { void warmScreenData('results'); }} onPress={() => router.push('/results' as any)}>
                <Text style={[styles.seeAllText, { color: palette.link }]}>See All</Text>
              </TouchableOpacity>
            </View>

            {resultsLoading && displayResultsMatches.length === 0 ? (
              <View style={styles.resultsLoadingCard}>
                <Animated.View style={[styles.liveIndicator, { opacity: liveDotOpacity }]} />
                <Text style={[styles.newsLoadingText, { color: palette.subtext }]}>Loading results...</Text>
              </View>
            ) : displayResultsMatches.length === 0 ? null : (
              <NativeViewGestureHandler ref={resultsListRef} simultaneousHandlers={outerScrollRef}>
                <FlatList
                  horizontal
                  data={resultsMatchesTop}
                  renderItem={({ item }) => renderResultMatch(item)}
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalScroll}
                  decelerationRate="fast"
                  initialNumToRender={4}
                  windowSize={5}
                  maxToRenderPerBatch={6}
                  updateCellsBatchingPeriod={50}
                  removeClippedSubviews={enableClippedSubviews}
                />
              </NativeViewGestureHandler>
            )}
          </View>
        );
      default:
        return (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              {renderSectionBadge('Latest News', 'newspaper-outline', palette.link)}
              <TouchableOpacity onPressIn={() => { void warmScreenData('news'); }} onPress={() => router.push('/news' as any)}>
                <Text style={[styles.seeAllText, { color: palette.link }]}>View All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.newsContainer}>
              {heroArticle ? (
                <>
                  {renderHeroNews(heroArticle)}
                  {featureArticles.length > 0 ? (
                    <View style={styles.newsFeatureGrid}>
                      {featureArticles.map((article, index) => renderFeatureNewsCard(article, index))}
                    </View>
                  ) : null}
                  <View style={styles.newsListSection}>
                    <FlatList
                      data={newsList}
                      renderItem={({ item }) => renderNewsListItem(item)}
                      keyExtractor={(item) => item.id}
                      scrollEnabled={false}
                      initialNumToRender={6}
                      windowSize={5}
                      maxToRenderPerBatch={8}
                      updateCellsBatchingPeriod={50}
                      removeClippedSubviews={enableClippedSubviews}
                    />
                  </View>
                </>
              ) : newsLoading ? (
                <NewsSkeletonCards isDark={isDark} count={3} />
              ) : null}
            </View>
          </View>
        );
    }
  };

  if (showLoadingScreen || !initialHomeReady) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: palette.background,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <BrandedLoading variant="launch" dark />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? '#101317' : palette.card,
            borderBottomColor: isDark ? '#17304A' : '#D9E8F7',
            paddingTop: Math.max(insets.top + (isCompactHeader ? 1 : 4), isCompactHeader ? 20 : 30),
            minHeight: isCompactHeader ? 94 : 104,
            paddingBottom: isCompactHeader ? 6 : 8,
          },
        ]}
      >
        <View
          style={[
            styles.headerCenteredBrand,
            {
              top: headerBrandTop,
              height: headerBrandSize,
            },
          ]}
        >
          <Image
            source={require('../../assets/images/Official logo.png')}
            style={[
              styles.headerBrandLogo,
              {
                width: headerBrandSize,
                height: headerBrandSize,
              },
            ]}
            resizeMode="contain"
          />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.greeting, { color: isDark ? '#F3F7FC' : '#0F2742' }]}>
            Hey, {userProfile?.username || 'Fan'}!
          </Text>
          <Text style={[styles.subtitle, { color: isDark ? '#5D98D8' : '#3A78BE' }]}>What is happening in football</Text>
        </View>
        <View
          style={[
            styles.headerAction,
            {
              top: headerActionTop,
              right: isCompactHeader ? 14 : 18,
            },
          ]}
        >
          <ProfileQuickAccessButton
            initial={(userProfile?.username || 'U')[0] || 'U'}
            dark={isDark}
            size={headerProfileSize}
          />
        </View>
      </View>

      <NativeViewGestureHandler ref={outerScrollRef}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.key}
          renderItem={renderSectionItem}
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.link}
              colors={[palette.link]}
              progressBackgroundColor={palette.card}
            />
          }
          initialNumToRender={4}
          windowSize={7}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={enableClippedSubviews}
          ListFooterComponent={<View style={{ height: 40 }} />}
        />
      </NativeViewGestureHandler>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    position: 'relative',
    borderBottomWidth: 1,
    minHeight: 104,
  },
  headerCopy: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingRight: 72,
    maxWidth: '66%',
  },
  headerCenteredBrand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  headerBrandLogo: {
    width: 44,
    height: 44,
  },
  greeting: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
    color: '#000',
    letterSpacing: -0.2,
    textAlign: 'left',
  },
  subtitle: {
    fontSize: 10,
    lineHeight: 13,
    color: '#8E8E93',
    marginTop: 2,
    textAlign: 'left',
  },
  headerAction: {
    position: 'absolute',
    right: 18,
    top: 12,
  },
  resultsLoadingCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  content: {
    flex: 1,
  },
  spotlightSection: {
    marginTop: 14,
    paddingHorizontal: 20,
  },
  spotlightCard: {
    borderRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 14,
    position: 'relative',
  },
  spotlightBlend: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  spotlightSideTint: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '64%',
  },
  spotlightSideTintLeft: {
    left: 0,
  },
  spotlightSideTintRight: {
    right: 0,
  },
  spotlightCoreFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  spotlightTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  spotlightHeading: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  spotlightKicker: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.72,
  },
  spotlightStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  spotlightStatusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  spotlightBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 18,
  },
  spotlightTeamCol: {
    flex: 1.15,
    alignItems: 'center',
    minWidth: 0,
  },
  spotlightTeamLogo: {
    width: 62,
    height: 62,
    marginBottom: 10,
  },
  spotlightTeamLogoPlaceholder: {
    width: 62,
    height: 62,
    borderRadius: 31,
    marginBottom: 10,
  },
  spotlightTeamName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
    minWidth: 0,
    flexShrink: 1,
    width: '112%',
  },
  spotlightCenterCol: {
    minWidth: 104,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  spotlightCenterTop: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  spotlightCenterMain: {
    marginTop: 6,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: -1,
  },
  spotlightCenterBottom: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  spotlightFooter: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  spotlightLeagueBottom: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  spotlightActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  spotlightActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  section: {
    marginTop: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sectionBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0066CC',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  horizontalScroll: {
    paddingHorizontal: 20,
  },
  worldCupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  worldCupBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  worldCupInfo: {
    flex: 1,
  },
  worldCupTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000',
  },
  worldCupSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 2,
  },
  worldCupNewsList: {
    paddingHorizontal: 20,
  },

  // Live Match Card
  liveMatchCard: {
    width: 214,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingTop: 11,
    paddingHorizontal: 12,
    paddingBottom: 7,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#23252B',
    position: 'relative',
  },
  liveCardBlend: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  liveCardAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  liveCardContent: {
    position: 'relative',
    zIndex: 1,
  },
  liveMatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  liveHeaderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  liveStatusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    shadowColor: '#FF3B30',
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  liveStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  liveLeague: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8E8E93',
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  liveFavoriteCard: {
    borderWidth: 1,
    borderColor: '#4DA3FF',
    shadowColor: '#4DA3FF',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  favoriteLiveStarBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2D6FD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveStatusPillText: {
    fontSize: 9,
    fontWeight: '700',
  },
  liveMatchTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    gap: 4,
  },
  liveTeam: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  liveTeamName: {
    fontSize: 9,
    lineHeight: 11,
    minHeight: 22,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    flexShrink: 1,
    width: '100%',
  },
  liveScoreContainer: {
    alignItems: 'center',
    minWidth: 56,
    paddingHorizontal: 8,
  },
  liveScore: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.4,
  },
  liveMinute: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 2,
  },
  liveFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  liveFooterMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  liveFooterMetaText: {
    fontSize: 10,
    fontWeight: '600',
  },
  liveActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  liveActionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  upcomingTeamLogo: {
    width: 39,
    height: 39,
    marginBottom: 6,
  },
  upcomingTeamLogoPlaceholder: {
    width: 39,
    height: 39,
    borderRadius: 19.5,
    backgroundColor: '#E5E7EB',
    marginBottom: 6,
  },

  // Upcoming Cards
  upcomingCard: {
    width: 214,
    backgroundColor: '#FFF',
    borderRadius: 14,
    minHeight: 138,
    paddingTop: 8,
    paddingHorizontal: 11,
    paddingBottom: 2,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#23252B',
    position: 'relative',
  },
  upcomingCardAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  upcomingCardTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  upcomingCardContent: {
    position: 'relative',
    zIndex: 1,
  },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
    gap: 6,
  },
  upcomingLeagueTop: {
    fontSize: 11.5,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
    letterSpacing: 0.1,
  },
  upcomingHeaderDate: {
    fontSize: 9.5,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  upcomingLeague: {
    fontSize: 8,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    flex: 1,
    marginRight: 8,
  },
  upcomingKickoff: {
    fontSize: 9.5,
    fontWeight: '600',
    textAlign: 'right',
    minWidth: 58,
  },
  upcomingTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 3,
  },
  upcomingTeam: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  upcomingTeamName: {
    fontSize: 12,
    lineHeight: 14,
    minHeight: 28,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    flexShrink: 1,
    width: '100%',
    maxWidth: 102,
  },
  upcomingVs: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginHorizontal: 6,
  },
  cardLeagueDivider: {
    height: 2,
    width: '82%',
    alignSelf: 'center',
    borderRadius: 999,
    marginTop: 3,
    marginBottom: 2,
    opacity: 0.95,
  },
  upcomingLeagueBottom: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 0,
  },
  upcomingMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
  },
  upcomingBottomDate: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  upcomingBottomTime: {
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'right',
  },
  joinChatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    gap: 6,
  },
  joinChatText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066CC',
  },
  notifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F7',
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  notifyButtonActive: {
    backgroundColor: '#0066CC',
  },
  notifyButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0066CC',
  },
  notifyButtonTextActive: {
    color: '#FFF',
  },
  liveTeamLogo: {
    width: 32,
    height: 32,
    marginBottom: 4,
  },
  liveTeamLogoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2C2C2E',
    marginBottom: 4,
  },

  // Results Cards
  resultCard: {
    width: 214,
    backgroundColor: '#FFF',
    borderRadius: 14,
    minHeight: 138,
    paddingTop: 8,
    paddingHorizontal: 11,
    paddingBottom: 1,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#23252B',
    position: 'relative',
  },
  resultCardAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  resultCardTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  resultCardContent: {
    position: 'relative',
    zIndex: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 3,
  },
  resultLeague: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#8E8E93',
    letterSpacing: 0.1,
    textAlign: 'center',
    width: '100%',
  },
  resultHeaderDate: {
    fontSize: 9,
    fontWeight: '600',
    color: '#8E8E93',
    marginLeft: 8,
  },
  ftBadge: {
    backgroundColor: '#F5F5F7',
    paddingHorizontal: 6,
    paddingVertical: 3,
    minHeight: 19,
    borderRadius: 5,
    marginTop: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ftText: {
    fontSize: 9.5,
    lineHeight: 10,
    fontWeight: '800',
    color: '#8E8E93',
    textAlign: 'center',
  },
  resultTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 0,
    gap: 4,
  },
  resultLogoSide: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTeamLogo: {
    width: 39,
    height: 39,
  },
  resultTeamLogoPlaceholder: {
    width: 39,
    height: 39,
    borderRadius: 19.5,
    backgroundColor: '#E5E7EB',
  },
  resultNamesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 2,
    marginBottom: 0,
    gap: 4,
  },
  resultNameSide: {
    width: 68,
    alignItems: 'center',
    minWidth: 0,
  },
  resultTeamName: {
    fontSize: 11.5,
    lineHeight: 14,
    minHeight: 28,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    flexShrink: 1,
    width: '100%',
  },
  resultScoreContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginTop: 5,
  },
  resultScoreSpacer: {
    width: 32,
  },
  resultScore: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000',
  },
  resultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 12,
    marginTop: 0,
  },
  resultDateBottom: {
    marginBottom: 0,
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'left',
  },
  resultMetaLeft: {
    flex: 1,
  },
  resultMetaRight: {
    marginTop: 0,
  },

  // News Section
  newsContainer: {
    paddingHorizontal: 20,
  },

  // Hero News Card - FULL IMAGE (PL App Style)
  heroNewsCard: {
    width: '100%',
    height: 320,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#111826',
    borderWidth: 1,
    borderColor: 'rgba(156, 202, 255, 0.12)',
  },
  heroNewsImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  heroNewsGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 140,
    backgroundColor: 'transparent',
  },
  heroNewsTopLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  heroNewsTopLabelText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D9F1FF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroNewsTopLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(218, 241, 255, 0.28)',
  },
  heroNewsBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 10,
  },
  heroNewsBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroNewsTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFF',
    lineHeight: 32,
    marginBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroNewsMeta: {
    fontSize: 13,
    color: 'rgba(232,244,255,0.88)',
    fontWeight: '700',
  },
  newsFeatureGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  newsFeatureCard: {
    flex: 1,
    minHeight: 188,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
  },
  newsFeatureImage: {
    width: '100%',
    height: 188,
  },
  newsFeatureOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 12, 22, 0.48)',
  },
  newsFeatureBody: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
  },
  newsFeatureChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },
  newsFeatureChipText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  newsFeatureTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  newsFeatureMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(231, 241, 255, 0.88)',
  },

  // News List
  newsListSection: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(14, 104, 204, 0.08)',
  },
  newsLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 42,
    paddingHorizontal: 8,
  },
  newsLoadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  newsListItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  newsListContent: {
    flex: 1,
    marginRight: 12,
    justifyContent: 'center',
  },
  newsListMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  newsListSource: {
    fontSize: 11,
    fontWeight: '700',
    color: '#37003C',
  },
  newsListDot: {
    fontSize: 11,
    color: '#8E8E93',
    marginHorizontal: 5,
  },
  newsListTime: {
    fontSize: 11,
    color: '#8E8E93',
  },
  newsListTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
    lineHeight: 21,
  },
  newsListImage: {
    width: 84,
    height: 84,
    borderRadius: 16,
    backgroundColor: '#F5F5F7',
  },
});
