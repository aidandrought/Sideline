// app/fantasy/team/[id].tsx
// Sideline Fantasy squad builder — hidden behind the fantasy feature flag.

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KitSvg } from '../../../components/KitSvg';
import { PitchSvg } from '../../../components/PitchSvg';
import { getClubColors } from '../../../constants/clubColors';
import { useAuth } from '../../../context/AuthContext';
import { useTheme } from '../../../context/ThemeContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import {
  BUDGET_MILLIONS,
  SQUAD_SIZE,
  FantasyPlayer,
  PlayerPosition,
  getMyTeam,
  getPlayerPool,
  saveTeam,
} from '../../../services/fantasyService';

// Fallback pool when the league doc can't be read (all major competitions)
const DEFAULT_POOL_IDS = [1, 39, 140, 78, 135, 61, 253, 2, 3];
const POSITIONS: PlayerPosition[] = ['GK', 'DEF', 'MID', 'FWD'];
const MARKET_TABS: Array<PlayerPosition | 'ALL'> = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];
const FORMATIONS = ['4-4-2', '4-3-3', '3-5-2', '3-4-3', '5-3-2', '4-5-1'] as const;
const SORT_OPTIONS = ['points', 'form', 'price', 'name'] as const;

// Flexible squad rules — bench can hold any position mix.
// min = must always have at least this many to be valid.
// max = hard ceiling per position.
// target = soft display goal shown in the progress bar.
const POSITION_RULES: Record<PlayerPosition, { min: number; max: number; target: number }> = {
  GK:  { min: 1, max: 3,  target: 2 },
  DEF: { min: 3, max: 8,  target: 5 },
  MID: { min: 2, max: 8,  target: 5 },
  FWD: { min: 1, max: 6,  target: 4 },
};
const BENCH_SIZE = SQUAD_SIZE - 11; // 5 with a 16-man squad

const FORMATION_COUNTS: Record<string, Record<PlayerPosition, number>> = {
  '4-4-2': { GK: 1, DEF: 4, MID: 4, FWD: 2 },
  '4-3-3': { GK: 1, DEF: 4, MID: 3, FWD: 3 },
  '3-5-2': { GK: 1, DEF: 3, MID: 5, FWD: 2 },
  '3-4-3': { GK: 1, DEF: 3, MID: 4, FWD: 3 },
  '5-3-2': { GK: 1, DEF: 5, MID: 3, FWD: 2 },
  '4-5-1': { GK: 1, DEF: 4, MID: 5, FWD: 1 },
};

const POS_COLORS: Record<PlayerPosition, string> = {
  GK: '#F59E0B',
  DEF: '#38BDF8',
  MID: '#22C55E',
  FWD: '#38BDF8',
};

const POS_LABELS: Record<PlayerPosition, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
};

const POS_RULES_TEXT: Record<PlayerPosition, string> = {
  GK: '2 GK in squad',
  DEF: '5 DEF in squad',
  MID: '5 MID in squad',
  FWD: '3 FWD in squad',
};

const KIT_PATTERNS = ['#10B981', '#38BDF8', '#F59E0B', '#38BDF8', '#EF4444', '#8B5CF6'];

// Basic client-side team name guard. Production should call a moderation API.
const BLOCKED_TERMS = [
  'nigger','nigga','faggot','fag','retard','kike','spic','chink','gook','tranny',
  'cunt','whore','bitch','slut','nazi','kkk','isis','rapist','rape',
];
function isTeamNameClean(name: string): boolean {
  const lower = name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  return !BLOCKED_TERMS.some((t) => lower.split(/\s+/).includes(t) || lower.includes(t));
}

const shortClub = (name?: string) =>
  (name || 'FA')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

const initials = (name?: string) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

const kitColorFor = (player: FantasyPlayer) => KIT_PATTERNS[Math.abs(player.clubId || player.id) % KIT_PATTERNS.length];

// ─── Local WC 2026 placeholder pool ─────────────────────────────────────────
// Used when Firestore is empty (seed script not yet run) — enables full UI testing

// Prices tuned so cheapest 16-player squad ≈ £72m (fits £100m budget comfortably).
// Elite tier £11-13m, premium £8-10m, standard £5.5-7.5m, budget £4.0-5.0m.
const WC_PLACEHOLDER_PLAYERS: FantasyPlayer[] = [
  // ── Goalkeepers ──────────────────────────────────────────────────────────
  { id: 80001, name: 'Pickford',     shortName: 'Pickford',    position: 'GK',  clubId: 6,    clubName: 'England',       leagueId: 1, price: 5.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80002, name: 'E. Martínez',  shortName: 'E. Martínez', position: 'GK',  clubId: 7,    clubName: 'Argentina',     leagueId: 1, price: 6.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80003, name: 'Maignan',      shortName: 'Maignan',     position: 'GK',  clubId: 2,    clubName: 'France',        leagueId: 1, price: 5.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80004, name: 'Alisson',      shortName: 'Alisson',     position: 'GK',  clubId: 1,    clubName: 'Brazil',        leagueId: 1, price: 6.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80005, name: 'Unai Simón',   shortName: 'U. Simón',    position: 'GK',  clubId: 9,    clubName: 'Spain',         leagueId: 1, price: 5.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80006, name: 'Neuer',        shortName: 'Neuer',       position: 'GK',  clubId: 5,    clubName: 'Germany',       leagueId: 1, price: 5.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80007, name: 'D. Costa',     shortName: 'D. Costa',    position: 'GK',  clubId: 3,    clubName: 'Portugal',      leagueId: 1, price: 5.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80008, name: 'Flekken',      shortName: 'Flekken',     position: 'GK',  clubId: 26,   clubName: 'Netherlands',   leagueId: 1, price: 4.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80009, name: 'Casteels',     shortName: 'Casteels',    position: 'GK',  clubId: 4,    clubName: 'Belgium',       leagueId: 1, price: 4.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80010, name: 'Turner',       shortName: 'Turner',      position: 'GK',  clubId: 21,   clubName: 'United States', leagueId: 1, price: 4.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80011, name: 'Ochoa',        shortName: 'Ochoa',       position: 'GK',  clubId: 22,   clubName: 'Mexico',        leagueId: 1, price: 4.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80012, name: 'Nyland',       shortName: 'Nyland',      position: 'GK',  clubId: 2024, clubName: 'Norway',        leagueId: 1, price: 4.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  // ── Defenders ────────────────────────────────────────────────────────────
  { id: 80101, name: 'Alexander-Arnold', shortName: 'T. Arnold', position: 'DEF', clubId: 6,  clubName: 'England',       leagueId: 1, price: 7.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80102, name: 'Stones',        shortName: 'Stones',      position: 'DEF', clubId: 6,   clubName: 'England',       leagueId: 1, price: 5.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80103, name: 'Walker',        shortName: 'Walker',      position: 'DEF', clubId: 6,   clubName: 'England',       leagueId: 1, price: 4.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80104, name: 'Romero',        shortName: 'Romero',      position: 'DEF', clubId: 7,   clubName: 'Argentina',     leagueId: 1, price: 5.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80105, name: 'Tagliafico',    shortName: 'Tagliafico',  position: 'DEF', clubId: 7,   clubName: 'Argentina',     leagueId: 1, price: 4.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80106, name: 'T. Hernández',  shortName: 'T. Hernández',position: 'DEF', clubId: 2,   clubName: 'France',        leagueId: 1, price: 6.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80107, name: 'Saliba',        shortName: 'Saliba',      position: 'DEF', clubId: 2,   clubName: 'France',        leagueId: 1, price: 5.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80108, name: 'Koundé',        shortName: 'Koundé',      position: 'DEF', clubId: 2,   clubName: 'France',        leagueId: 1, price: 5.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80109, name: 'Marquinhos',    shortName: 'Marquinhos',  position: 'DEF', clubId: 1,   clubName: 'Brazil',        leagueId: 1, price: 5.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80110, name: 'Militão',       shortName: 'Militão',     position: 'DEF', clubId: 1,   clubName: 'Brazil',        leagueId: 1, price: 5.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80111, name: 'Carvajal',      shortName: 'Carvajal',    position: 'DEF', clubId: 9,   clubName: 'Spain',         leagueId: 1, price: 5.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80112, name: 'Laporte',       shortName: 'Laporte',     position: 'DEF', clubId: 9,   clubName: 'Spain',         leagueId: 1, price: 4.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80113, name: 'Rüdiger',       shortName: 'Rüdiger',     position: 'DEF', clubId: 5,   clubName: 'Germany',       leagueId: 1, price: 5.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80114, name: 'Schlotterbeck', shortName: 'Schlotterbeck',position: 'DEF',clubId: 5,   clubName: 'Germany',       leagueId: 1, price: 4.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80115, name: 'Cancelo',       shortName: 'Cancelo',     position: 'DEF', clubId: 3,   clubName: 'Portugal',      leagueId: 1, price: 6.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80116, name: 'N. Mendes',     shortName: 'N. Mendes',   position: 'DEF', clubId: 3,   clubName: 'Portugal',      leagueId: 1, price: 5.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80117, name: 'V. Dijk',       shortName: 'V. Dijk',     position: 'DEF', clubId: 26,  clubName: 'Netherlands',   leagueId: 1, price: 6.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80118, name: 'Dumfries',      shortName: 'Dumfries',    position: 'DEF', clubId: 26,  clubName: 'Netherlands',   leagueId: 1, price: 4.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80119, name: 'Vertonghen',    shortName: 'Vertonghen',  position: 'DEF', clubId: 4,   clubName: 'Belgium',       leagueId: 1, price: 4.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80120, name: 'Castagne',      shortName: 'Castagne',    position: 'DEF', clubId: 4,   clubName: 'Belgium',       leagueId: 1, price: 4.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80121, name: 'Dest',          shortName: 'Dest',        position: 'DEF', clubId: 21,  clubName: 'United States', leagueId: 1, price: 4.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80122, name: 'Hakimi',        shortName: 'Hakimi',      position: 'DEF', clubId: 28,  clubName: 'Morocco',       leagueId: 1, price: 5.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80123, name: 'Gvardiol',      shortName: 'Gvardiol',    position: 'DEF', clubId: 8,   clubName: 'Croatia',       leagueId: 1, price: 5.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80124, name: 'Ryerson',       shortName: 'Ryerson',     position: 'DEF', clubId: 2024,clubName: 'Norway',         leagueId: 1, price: 4.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80125, name: 'Davies A.',     shortName: 'Davies',      position: 'DEF', clubId: 23,  clubName: 'Canada',        leagueId: 1, price: 5.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  // ── Midfielders ──────────────────────────────────────────────────────────
  { id: 80201, name: 'Bellingham',    shortName: 'Bellingham',  position: 'MID', clubId: 6,   clubName: 'England',       leagueId: 1, price: 11.0, totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80202, name: 'Saka',          shortName: 'Saka',        position: 'MID', clubId: 6,   clubName: 'England',       leagueId: 1, price: 9.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80203, name: 'Foden',         shortName: 'Foden',       position: 'MID', clubId: 6,   clubName: 'England',       leagueId: 1, price: 8.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80204, name: 'De Paul',       shortName: 'De Paul',     position: 'MID', clubId: 7,   clubName: 'Argentina',     leagueId: 1, price: 6.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80205, name: 'Mac Allister',  shortName: 'Mac Allister',position: 'MID', clubId: 7,   clubName: 'Argentina',     leagueId: 1, price: 6.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80206, name: 'Enz. Fernández',shortName: 'E. Fernández',position: 'MID', clubId: 7,   clubName: 'Argentina',     leagueId: 1, price: 7.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80207, name: 'Griezmann',     shortName: 'Griezmann',   position: 'MID', clubId: 2,   clubName: 'France',        leagueId: 1, price: 7.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80208, name: 'Tchouaméni',    shortName: 'Tchouaméni',  position: 'MID', clubId: 2,   clubName: 'France',        leagueId: 1, price: 6.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80209, name: 'L. Paquetá',    shortName: 'Paquetá',     position: 'MID', clubId: 1,   clubName: 'Brazil',        leagueId: 1, price: 7.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80210, name: 'Rodrygo',       shortName: 'Rodrygo',     position: 'MID', clubId: 1,   clubName: 'Brazil',        leagueId: 1, price: 7.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80211, name: 'Pedri',         shortName: 'Pedri',       position: 'MID', clubId: 9,   clubName: 'Spain',         leagueId: 1, price: 9.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80212, name: 'Lamine Yamal',  shortName: 'Yamal',       position: 'MID', clubId: 9,   clubName: 'Spain',         leagueId: 1, price: 10.0, totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80213, name: 'Gavi',          shortName: 'Gavi',        position: 'MID', clubId: 9,   clubName: 'Spain',         leagueId: 1, price: 6.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80214, name: 'Wirtz',         shortName: 'Wirtz',       position: 'MID', clubId: 5,   clubName: 'Germany',       leagueId: 1, price: 10.0, totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80215, name: 'Musiala',       shortName: 'Musiala',     position: 'MID', clubId: 5,   clubName: 'Germany',       leagueId: 1, price: 9.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80216, name: 'B. Fernandes',  shortName: 'B. Fernandes',position: 'MID', clubId: 3,   clubName: 'Portugal',      leagueId: 1, price: 8.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80217, name: 'Bernardo',      shortName: 'Bernardo',    position: 'MID', clubId: 3,   clubName: 'Portugal',      leagueId: 1, price: 7.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80218, name: 'F. De Jong',    shortName: 'F. De Jong',  position: 'MID', clubId: 26,  clubName: 'Netherlands',   leagueId: 1, price: 7.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80219, name: 'Koopmeiners',   shortName: 'Koopmeiners', position: 'MID', clubId: 26,  clubName: 'Netherlands',   leagueId: 1, price: 6.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80220, name: 'De Bruyne',     shortName: 'De Bruyne',   position: 'MID', clubId: 4,   clubName: 'Belgium',       leagueId: 1, price: 10.5, totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80221, name: 'Doku',          shortName: 'Doku',        position: 'MID', clubId: 4,   clubName: 'Belgium',       leagueId: 1, price: 7.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80222, name: 'Pulisic',       shortName: 'Pulisic',     position: 'MID', clubId: 21,  clubName: 'United States', leagueId: 1, price: 7.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80223, name: 'Ødegaard',      shortName: 'Ødegaard',    position: 'MID', clubId: 2024,clubName: 'Norway',         leagueId: 1, price: 9.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80224, name: 'Ziyech',        shortName: 'Ziyech',      position: 'MID', clubId: 28,  clubName: 'Morocco',       leagueId: 1, price: 5.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80225, name: 'Modrić',        shortName: 'Modrić',      position: 'MID', clubId: 8,   clubName: 'Croatia',       leagueId: 1, price: 6.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80226, name: 'Kovačić',       shortName: 'Kovačić',     position: 'MID', clubId: 8,   clubName: 'Croatia',       leagueId: 1, price: 5.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80227, name: 'McKennie',      shortName: 'McKennie',    position: 'MID', clubId: 21,  clubName: 'United States', leagueId: 1, price: 5.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80228, name: 'Musah',         shortName: 'Musah',       position: 'MID', clubId: 21,  clubName: 'United States', leagueId: 1, price: 5.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80229, name: 'James',         shortName: 'James R.',    position: 'MID', clubId: 2030,clubName: 'Colombia',       leagueId: 1, price: 7.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80230, name: 'Kubo',          shortName: 'Kubo',        position: 'MID', clubId: 2014,clubName: 'Japan',          leagueId: 1, price: 6.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  // ── Forwards ─────────────────────────────────────────────────────────────
  { id: 80301, name: 'Haaland',       shortName: 'Haaland',     position: 'FWD', clubId: 2024,clubName: 'Norway',         leagueId: 1, price: 13.0, totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80302, name: 'Mbappé',        shortName: 'Mbappé',      position: 'FWD', clubId: 2,   clubName: 'France',        leagueId: 1, price: 12.5, totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80303, name: 'Messi',         shortName: 'Messi',       position: 'FWD', clubId: 7,   clubName: 'Argentina',     leagueId: 1, price: 12.0, totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80304, name: 'Vinícius Jr',   shortName: 'Vinícius',    position: 'FWD', clubId: 1,   clubName: 'Brazil',        leagueId: 1, price: 11.5, totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80305, name: 'Kane',          shortName: 'Kane',        position: 'FWD', clubId: 6,   clubName: 'England',       leagueId: 1, price: 10.0, totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80306, name: 'Ronaldo',       shortName: 'Ronaldo',     position: 'FWD', clubId: 3,   clubName: 'Portugal',      leagueId: 1, price: 9.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80307, name: 'Lukaku',        shortName: 'Lukaku',      position: 'FWD', clubId: 4,   clubName: 'Belgium',       leagueId: 1, price: 8.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80308, name: 'L. Martínez',   shortName: 'L. Martínez', position: 'FWD', clubId: 7,   clubName: 'Argentina',     leagueId: 1, price: 7.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80309, name: 'J. Álvarez',    shortName: 'J. Álvarez',  position: 'FWD', clubId: 7,   clubName: 'Argentina',     leagueId: 1, price: 7.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80310, name: 'Raphinha',      shortName: 'Raphinha',    position: 'FWD', clubId: 1,   clubName: 'Brazil',        leagueId: 1, price: 7.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80311, name: 'Dembélé',       shortName: 'Dembélé',     position: 'FWD', clubId: 2,   clubName: 'France',        leagueId: 1, price: 7.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80312, name: 'M. Thuram',     shortName: 'M. Thuram',   position: 'FWD', clubId: 2,   clubName: 'France',        leagueId: 1, price: 6.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80313, name: 'Morata',        shortName: 'Morata',      position: 'FWD', clubId: 9,   clubName: 'Spain',         leagueId: 1, price: 6.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80314, name: 'Füllkrug',      shortName: 'Füllkrug',    position: 'FWD', clubId: 5,   clubName: 'Germany',       leagueId: 1, price: 6.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80315, name: 'Leão',          shortName: 'Leão',        position: 'FWD', clubId: 3,   clubName: 'Portugal',      leagueId: 1, price: 7.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80316, name: 'Depay',         shortName: 'Depay',       position: 'FWD', clubId: 26,  clubName: 'Netherlands',   leagueId: 1, price: 6.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80317, name: 'Gakpo',         shortName: 'Gakpo',       position: 'FWD', clubId: 26,  clubName: 'Netherlands',   leagueId: 1, price: 6.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80318, name: 'Openda',        shortName: 'Openda',      position: 'FWD', clubId: 4,   clubName: 'Belgium',       leagueId: 1, price: 6.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80319, name: 'Rashford',      shortName: 'Rashford',    position: 'FWD', clubId: 6,   clubName: 'England',       leagueId: 1, price: 6.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80320, name: 'En-Nesyri',     shortName: 'En-Nesyri',   position: 'FWD', clubId: 28,  clubName: 'Morocco',       leagueId: 1, price: 5.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80321, name: 'Sørloth',       shortName: 'Sørloth',     position: 'FWD', clubId: 2024,clubName: 'Norway',         leagueId: 1, price: 6.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80322, name: 'David J.',      shortName: 'J. David',    position: 'FWD', clubId: 23,  clubName: 'Canada',        leagueId: 1, price: 6.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80323, name: 'Jiménez',       shortName: 'Jiménez',     position: 'FWD', clubId: 22,  clubName: 'Mexico',        leagueId: 1, price: 5.5,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80324, name: 'Mané',          shortName: 'Mané',        position: 'FWD', clubId: 29,  clubName: 'Senegal',       leagueId: 1, price: 7.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80325, name: 'Kramarić',      shortName: 'Kramarić',    position: 'FWD', clubId: 8,   clubName: 'Croatia',       leagueId: 1, price: 6.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80326, name: 'Maeda',         shortName: 'Maeda',       position: 'FWD', clubId: 2014,clubName: 'Japan',          leagueId: 1, price: 5.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80327, name: 'Durán',         shortName: 'Durán',       position: 'FWD', clubId: 2030,clubName: 'Colombia',       leagueId: 1, price: 6.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
  { id: 80328, name: 'Pepi',          shortName: 'Pepi',        position: 'FWD', clubId: 21,  clubName: 'United States', leagueId: 1, price: 5.0,  totalPoints: 0, gameweekPoints: 0, form: 0 },
];

const DEV_SAMPLE_PLAYERS: FantasyPlayer[] = [
  { id: 9001, name: 'Atlas Ward', shortName: 'Ward', position: 'GK', clubId: 101, clubName: 'Northbank', leagueId: 39, price: 5.0, totalPoints: 86, gameweekPoints: 6, form: 4.8 },
  { id: 9002, name: 'Milo Cross', shortName: 'Cross', position: 'GK', clubId: 102, clubName: 'Harbor City', leagueId: 39, price: 4.0, totalPoints: 44, gameweekPoints: 0, form: 2.6 },
  { id: 9003, name: 'Jude Stone', shortName: 'Stone', position: 'DEF', clubId: 103, clubName: 'Metro Albion', leagueId: 39, price: 6.2, totalPoints: 112, gameweekPoints: 8, form: 5.9 },
  { id: 9004, name: 'Nico Vale', shortName: 'Vale', position: 'DEF', clubId: 104, clubName: 'Royal Union', leagueId: 140, price: 5.5, totalPoints: 97, gameweekPoints: 2, form: 4.7 },
  { id: 9005, name: 'Theo Flint', shortName: 'Flint', position: 'DEF', clubId: 105, clubName: 'Eastside', leagueId: 78, price: 4.7, totalPoints: 72, gameweekPoints: 1, form: 3.3 },
  { id: 9006, name: 'Owen Pierce', shortName: 'Pierce', position: 'DEF', clubId: 106, clubName: 'Capital FC', leagueId: 135, price: 4.5, totalPoints: 66, gameweekPoints: 0, form: 3.1 },
  { id: 9007, name: 'Rafi Lane', shortName: 'Lane', position: 'DEF', clubId: 102, clubName: 'Harbor City', leagueId: 39, price: 4.2, totalPoints: 50, gameweekPoints: 0, form: 2.4, injured: true },
  { id: 9008, name: 'Eli Mercer', shortName: 'Mercer', position: 'MID', clubId: 101, clubName: 'Northbank', leagueId: 39, price: 9.6, totalPoints: 154, gameweekPoints: 11, form: 7.4 },
  { id: 9009, name: 'Kai Torres', shortName: 'Torres', position: 'MID', clubId: 107, clubName: 'River Plateaux', leagueId: 61, price: 8.2, totalPoints: 132, gameweekPoints: 5, form: 6.1 },
  { id: 9010, name: 'Samir Holt', shortName: 'Holt', position: 'MID', clubId: 108, clubName: 'Lakeside', leagueId: 253, price: 7.3, totalPoints: 116, gameweekPoints: 7, form: 5.7 },
  { id: 9011, name: 'Cal Reid', shortName: 'Reid', position: 'MID', clubId: 109, clubName: 'Western Stars', leagueId: 2, price: 6.1, totalPoints: 88, gameweekPoints: 3, form: 4.0 },
  { id: 9012, name: 'Luca Niven', shortName: 'Niven', position: 'MID', clubId: 103, clubName: 'Metro Albion', leagueId: 39, price: 5.0, totalPoints: 64, gameweekPoints: 1, form: 3.2 },
  { id: 9013, name: 'Aron Fox', shortName: 'Fox', position: 'FWD', clubId: 104, clubName: 'Royal Union', leagueId: 140, price: 10.8, totalPoints: 168, gameweekPoints: 13, form: 8.0 },
  { id: 9014, name: 'Dane Moss', shortName: 'Moss', position: 'FWD', clubId: 106, clubName: 'Capital FC', leagueId: 135, price: 8.5, totalPoints: 126, gameweekPoints: 4, form: 5.6 },
  { id: 9015, name: 'Jon Bell', shortName: 'Bell', position: 'FWD', clubId: 110, clubName: 'South Coast', leagueId: 3, price: 6.4, totalPoints: 82, gameweekPoints: 2, form: 3.9 },
];

type SortKey = typeof SORT_OPTIONS[number];
type ActionPlayer = FantasyPlayer | null;

export default function TeamBuilderScreen() {
  const { id: leagueId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { userProfile } = useAuth();
  const { isDark } = useTheme();
  const pitchWidth = screenWidth - 24; // marginHorizontal: 12 each side

  const palette = useMemo(
    () => ({
      background: '#080E1A',
      surface: '#0F1828',
      surface2: '#1A2540',
      card: '#0F1828',
      text: '#FFFFFF',
      subtext: '#8896A8',
      border: 'rgba(255,255,255,0.09)',
      primary: '#10B981',
      secondary: '#38BDF8',
      pitchA: '#1F8A4C',
      pitchB: '#1A7A41',
      line: 'rgba(255,255,255,0.60)',
      danger: '#EF4444',
      warning: '#F59E0B',
      success: '#22C55E',
    }),
    [isDark]
  );

  const [loadingPool, setLoadingPool] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playerPool, setPlayerPool] = useState<FantasyPlayer[]>([]);
  const [squad, setSquad] = useState<FantasyPlayer[]>([]);
  const [captain, setCaptain] = useState<number | null>(null);
  const [viceCaptain, setViceCaptain] = useState<number | null>(null);
  const [teamName, setTeamName] = useState('My Team');
  const [formation, setFormation] = useState<typeof FORMATIONS[number]>('4-4-2');
  const [marketTab, setMarketTab] = useState<PlayerPosition | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [clubFilter, setClubFilter] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('points');
  const [selectedForSub, setSelectedForSub] = useState<number | null>(null);
  const [actionPlayer, setActionPlayer] = useState<ActionPlayer>(null);
  const [detailPlayer, setDetailPlayer] = useState<ActionPlayer>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<PlayerPosition | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  // Tracks which player IDs are explicitly on the bench (vs starting XI)
  const [benchIds, setBenchIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!leagueId) return;
    if (!userProfile?.uid && __DEV__) {
      setPlayerPool(DEV_SAMPLE_PLAYERS);
      setSquad(DEV_SAMPLE_PLAYERS);
      setCaptain(9013);
      setViceCaptain(9008);
      setTeamName('Sideline Dev XI');
      setLoadingPool(false);
      return;
    }
    if (!userProfile?.uid) {
      setLoadingPool(false);
      return;
    }
    const init = async () => {
      setLoadingPool(true);
      try {
        // Resolve competition pool from the league doc; fall back to defaults
        let competitionIds = DEFAULT_POOL_IDS;
        try {
          const leagueSnap = await getDoc(doc(db, 'fantasyLeagues', leagueId));
          const pool = leagueSnap.data()?.rulesConfig?.competitionPool
            ?? leagueSnap.data()?.competitionPool;
          if (Array.isArray(pool) && pool.length > 0) {
            competitionIds = pool as number[];
          }
        } catch {
          // non-fatal — use defaults
        }

        // Fetch player pool; fall back to local WC placeholders on any error or empty result
        let resolvedPool: FantasyPlayer[] = [];
        try {
          const pools = await Promise.all(competitionIds.map((lid) => getPlayerPool(lid)));
          const merged = new Map<number, FantasyPlayer>();
          for (const pool of pools) {
            for (const player of pool) {
              if (!merged.has(player.id)) merged.set(player.id, player);
            }
          }
          resolvedPool = Array.from(merged.values()).sort((a, b) => b.totalPoints - a.totalPoints);
        } catch {
          // Firestore unavailable or permissions error — use local placeholders
        }

        // Always show something — use local WC placeholder squad if Firestore returned nothing
        if (resolvedPool.length === 0) {
          resolvedPool = WC_PLACEHOLDER_PLAYERS;
        }
        setPlayerPool(resolvedPool);

        // Load existing saved team if any
        const existingTeam = await getMyTeam(userProfile.uid, leagueId).catch(() => null);
        if (existingTeam) {
          setSquad(existingTeam.players);
          setCaptain(existingTeam.captain);
          setViceCaptain(existingTeam.viceCaptain);
          setTeamName(existingTeam.teamName);
          if (FORMATIONS.includes(existingTeam.formation as any)) {
            setFormation(existingTeam.formation as typeof FORMATIONS[number]);
          }
        } else {
          setTeamName(userProfile.username ? `${userProfile.username}'s XI` : 'My Team');
        }
      } catch (err) {
        console.error('Error loading team builder:', err);
        // Ensure the UI always has players to show even on full failure
        setPlayerPool((prev) => prev.length > 0 ? prev : WC_PLACEHOLDER_PLAYERS);
        setTeamName(userProfile.username ? `${userProfile.username}'s XI` : 'My Team');
      } finally {
        setLoadingPool(false);
      }
    };
    void init();
  }, [userProfile?.uid, leagueId]);

  const budgetSpent = useMemo(() => squad.reduce((sum, p) => sum + p.price, 0), [squad]);
  const budgetRemaining = BUDGET_MILLIONS - budgetSpent;

  const squadByPosition = useMemo(() => {
    const map: Record<PlayerPosition, FantasyPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const player of squad) map[player.position].push(player);
    return map;
  }, [squad]);

  const startersByPosition = useMemo(() => {
    const counts = FORMATION_COUNTS[formation];
    return Object.fromEntries(
      POSITIONS.map((pos) => [
        pos,
        // Explicit bench players are excluded from starting XI
        squadByPosition[pos].filter((p) => !benchIds.has(p.id)).slice(0, counts[pos]),
      ])
    ) as Record<PlayerPosition, FantasyPlayer[]>;
  }, [formation, squadByPosition, benchIds]);

  const benchPlayers = useMemo(() => {
    const starterSet = new Set(
      POSITIONS.flatMap((pos) => startersByPosition[pos].map((p) => p.id))
    );
    return squad.filter((p) => !starterSet.has(p.id));
  }, [squad, startersByPosition]);

  const starterIds = useMemo(
    () => new Set(POSITIONS.flatMap((pos) => startersByPosition[pos].map((player) => player.id))),
    [startersByPosition]
  );

  const clubs = useMemo(() => {
    const byId = new Map<number, string>();
    playerPool.forEach((player) => {
      if (player.clubId) byId.set(player.clubId, player.clubName || shortClub(player.clubName));
    });
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 24);
  }, [playerPool]);

  const filteredPool = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return playerPool
      .filter((player) => marketTab === 'ALL' || player.position === marketTab)
      .filter((player) => !clubFilter || player.clubId === clubFilter)
      .filter((player) => !maxPrice || player.price <= maxPrice)
      .filter((player) => {
        if (!query) return true;
        return `${player.name} ${player.clubName} ${shortClub(player.clubName)}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        if (sortKey === 'price') return b.price - a.price;
        if (sortKey === 'form') return b.form - a.form;
        if (sortKey === 'name') return a.name.localeCompare(b.name);
        return b.totalPoints - a.totalPoints;
      });
  }, [clubFilter, marketTab, maxPrice, playerPool, searchQuery, sortKey]);

  const isSquadValid = useMemo(() => {
    if (squad.length !== SQUAD_SIZE) return false;
    if (budgetRemaining < 0) return false;
    // Each formation position must be fillable from non-bench players
    const counts = FORMATION_COUNTS[formation];
    for (const pos of POSITIONS) {
      const nonBench = squadByPosition[pos].filter((p) => !benchIds.has(p.id));
      if (nonBench.length < counts[pos]) return false;
      if (squadByPosition[pos].length < POSITION_RULES[pos].min) return false;
    }
    return captain !== null && viceCaptain !== null && captain !== viceCaptain;
  }, [benchIds, budgetRemaining, captain, formation, squad.length, squadByPosition, viceCaptain]);

  const addPlayer = useCallback((player: FantasyPlayer, toBench = false) => {
    if (squad.some((item) => item.id === player.id)) return;
    if (squad.length >= SQUAD_SIZE) {
      Alert.alert('Squad full', `Squad must contain ${SQUAD_SIZE} players.`);
      return;
    }
    if (!toBench) {
      // Pitch add: can't exceed formation starter slots for this position
      const nonBenchCount = squadByPosition[player.position].filter((p) => !benchIds.has(p.id)).length;
      const formationSlots = FORMATION_COUNTS[formation][player.position];
      if (nonBenchCount >= formationSlots) {
        Alert.alert(
          'Pitch slots full',
          `${formation} only has ${formationSlots} ${player.position} spot${formationSlots !== 1 ? 's' : ''}. Use a bench slot to add more.`
        );
        return;
      }
    } else if (squadByPosition[player.position].length >= POSITION_RULES[player.position].max) {
      Alert.alert('Position limit', `Maximum ${POSITION_RULES[player.position].max} ${player.position}s allowed.`);
      return;
    }
    if (budgetRemaining < player.price) {
      Alert.alert('Over budget', `You need £${(player.price - budgetRemaining).toFixed(1)}m more.`);
      return;
    }
    if (squad.filter((item) => item.clubId === player.clubId).length >= 3) {
      Alert.alert('Club limit', 'Maximum 3 players from one club.');
      return;
    }
    setSquad((prev) => [...prev, player]);
    if (toBench) setBenchIds((prev) => new Set([...prev, player.id]));
  }, [benchIds, budgetRemaining, formation, squad, squadByPosition]);

  const removePlayer = useCallback((playerId: number) => {
    setSquad((prev) => prev.filter((item) => item.id !== playerId));
    setBenchIds((prev) => { const n = new Set(prev); n.delete(playerId); return n; });
    if (captain === playerId) setCaptain(null);
    if (viceCaptain === playerId) setViceCaptain(null);
    if (selectedForSub === playerId) setSelectedForSub(null);
  }, [captain, selectedForSub, viceCaptain]);

  const clearSquad = useCallback(() => {
    Alert.alert('Clear Squad', 'Remove all players from your squad?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: () => {
        setSquad([]);
        setBenchIds(new Set());
        setCaptain(null);
        setViceCaptain(null);
        setSelectedForSub(null);
      }},
    ]);
  }, []);

  const swapPlayers = useCallback((a: FantasyPlayer, b: FantasyPlayer) => {
    if (a.position !== b.position) {
      Alert.alert('Invalid substitution', 'Substitutions must be the same position.');
      return;
    }
    // Toggle bench membership: if one is bench and the other isn't, swap their roles
    setBenchIds((prev) => {
      const next = new Set(prev);
      const aIsBench = next.has(a.id);
      const bIsBench = next.has(b.id);
      if (aIsBench && !bIsBench) { next.delete(a.id); next.add(b.id); }
      else if (!aIsBench && bIsBench) { next.delete(b.id); next.add(a.id); }
      return next;
    });
    setSelectedForSub(null);
  }, []);

  const handleSquadPlayerPress = (player: FantasyPlayer) => {
    const selected = squad.find((item) => item.id === selectedForSub);
    if (selected && selected.id !== player.id) {
      swapPlayers(selected, player);
      return;
    }
    setActionPlayer(player);
  };

  const handleSave = async () => {
    const trimmedName = teamName.trim();
    if (!trimmedName) {
      Alert.alert('Team name required', 'Give your team a name before saving.');
      return;
    }
    if (!isTeamNameClean(trimmedName)) {
      Alert.alert('Invalid team name', 'Your team name contains inappropriate language. Please choose a different name.');
      return;
    }
    if (!isSquadValid) {
      const issues: string[] = [];
      if (squad.length !== SQUAD_SIZE) issues.push(`Pick ${SQUAD_SIZE} players.`);
      if (budgetRemaining < 0) issues.push('Reduce squad cost below 100M.');
      const fmCounts = FORMATION_COUNTS[formation];
      POSITIONS.forEach((pos) => {
        const nonBench = squadByPosition[pos].filter((p) => !benchIds.has(p.id)).length;
        if (nonBench < fmCounts[pos]) issues.push(`Need ${fmCounts[pos]} ${pos}s to start (have ${nonBench}).`);
        if (squadByPosition[pos].length < POSITION_RULES[pos].min) issues.push(`Need at least ${POSITION_RULES[pos].min} ${pos} total.`);
      });
      if (!captain) issues.push('Choose a captain.');
      if (!viceCaptain) issues.push('Choose a vice-captain.');
      Alert.alert('Team incomplete', issues.join('\n'));
      return;
    }
    if (!userProfile?.uid || !leagueId) {
      Alert.alert('Sign in required', 'This preview is local only. Sign in before saving a real fantasy squad.');
      return;
    }
    setSaving(true);
    try {
      await saveTeam({
        id: `${userProfile.uid}_${leagueId}`,
        userId: userProfile.uid,
        leagueId,
        teamName: teamName.trim() || 'My Team',
        players: squad,
        captain: captain!,
        viceCaptain: viceCaptain!,
        formation,
        totalPoints: 0,
        gameweekPoints: 0,
        budgetRemaining,
        transfersRemaining: 1,
        transfersUsed: 0,
      });
      Alert.alert('Saved', 'Your fantasy squad has been saved.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Save failed', 'Unable to save your team right now.');
    } finally {
      setSaving(false);
    }
  };


  const closeActionSheet = () => setActionPlayer(null);

  const replacePlayer = useCallback((player: FantasyPlayer) => {
    const isBenchPlayer = benchIds.has(player.id);
    removePlayer(player.id);
    setActionPlayer(null);
    // Bench replacements use any-position bench picker; starters use position picker
    setPickerPosition(isBenchPlayer ? null : player.position);
    setPickerSearch('');
    setPickerVisible(true);
  }, [benchIds, removePlayer]);

  const makeCaptain = (player: FantasyPlayer) => {
    setCaptain(player.id);
    if (viceCaptain === player.id) setViceCaptain(null);
    closeActionSheet();
  };

  const makeViceCaptain = (player: FantasyPlayer) => {
    setViceCaptain(player.id);
    if (captain === player.id) setCaptain(null);
    closeActionSheet();
  };

  const startSubstitution = (player: FantasyPlayer) => {
    setSelectedForSub(player.id);
    closeActionSheet();
  };

  const renderKit = (player: FantasyPlayer, size: 'small' | 'large' = 'large') => {
    const isCap = captain === player.id;
    const isVice = viceCaptain === player.id;
    const colors = getClubColors(player.clubId ?? player.id);
    const kitSize = size === 'large' ? 48 : 36;
    return (
      <KitSvg
        primary={colors.primary}
        secondary={colors.secondary}
        textColor={colors.text}
        initials={initials(player.shortName || player.name)}
        size={kitSize}
        isCaptain={isCap}
        isVice={isVice}
        injured={player.injured}
      />
    );
  };

  const renderPlayerTile = (player: FantasyPlayer, isBench = false, benchIndex?: number) => {
    const selected = selectedForSub === player.id;
    return (
      <Pressable
        key={player.id}
        style={[styles.playerTile, isBench && styles.benchTile, selected && { borderColor: palette.primary, borderWidth: 2 }]}
        onPress={() => handleSquadPlayerPress(player)}
      >
        {renderKit(player)}
        <Text style={[styles.tileName, { color: palette.text }]} numberOfLines={1}>
          {player.shortName || player.name.split(' ').slice(-1)[0]}
        </Text>
        <Text style={[styles.tileMeta, { color: isBench ? palette.subtext : palette.secondary }]}>
          {benchIndex != null ? `B${benchIndex + 1}` : `£${player.price.toFixed(1)}`}
        </Text>
      </Pressable>
    );
  };

  const openPicker = (pos: PlayerPosition) => {
    setPickerPosition(pos);
    setPickerSearch('');
    setPickerVisible(true);
  };

  const openBenchPicker = () => {
    setPickerPosition(null); // null = any position (bench mode)
    setPickerSearch('');
    setPickerVisible(true);
  };

  const renderPitchRow = (pos: PlayerPosition) => {
    const players = startersByPosition[pos];
    const needed = FORMATION_COUNTS[formation][pos];
    const emptySlots = needed - players.length;
    return (
      <View key={pos} style={styles.pitchRow}>
        {players.map((player) => renderPlayerTile(player))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <TouchableOpacity
            key={`empty-${pos}-${i}`}
            style={[styles.emptySlot, { borderColor: POS_COLORS[pos] + '70' }]}
            onPress={() => openPicker(pos)}
            activeOpacity={0.7}
          >
            <View style={[styles.emptySlotCircle, { backgroundColor: POS_COLORS[pos] + '28' }]}>
              <Ionicons name="add" size={18} color={POS_COLORS[pos]} />
            </View>
            <Text style={[styles.emptySlotText, { color: POS_COLORS[pos] }]}>{pos}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderMarketPlayer = ({ item }: { item: FantasyPlayer }) => {
    const inSquad = squad.some((player) => player.id === item.id);
    const sameClub = squad.filter((player) => player.clubId === item.clubId).length;
    const positionFull = squadByPosition[item.position].length >= POSITION_RULES[item.position].max;
    const blocked = !inSquad && (sameClub >= 3 || positionFull || budgetRemaining < item.price || squad.length >= SQUAD_SIZE);
    return (
      <Pressable
        style={[styles.marketRow, { borderColor: inSquad ? palette.primary : palette.border, backgroundColor: palette.card }]}
        onPress={() => setDetailPlayer(item)}
      >
        {renderKit(item, 'small')}
        <View style={styles.marketInfo}>
          <View style={styles.marketNameLine}>
            <Text style={[styles.marketName, { color: palette.text }]} numberOfLines={1}>{item.name}</Text>
            <View style={[styles.positionBadge, { backgroundColor: POS_COLORS[item.position] + '22' }]}>
              <Text style={[styles.positionBadgeText, { color: POS_COLORS[item.position] }]}>{item.position}</Text>
            </View>
          </View>
          <Text style={[styles.marketClub, { color: palette.subtext }]}>{shortClub(item.clubName)} · Form {item.form.toFixed(1)}</Text>
        </View>
        <View style={styles.marketStats}>
          <Text style={[styles.marketPoints, { color: palette.text }]}>{item.totalPoints}</Text>
          <Text style={[styles.marketPrice, { color: budgetRemaining >= item.price || inSquad ? palette.secondary : palette.danger }]}>
            £{item.price.toFixed(1)}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.addButton,
            inSquad
              ? { borderColor: palette.danger, backgroundColor: palette.danger + '22' }
              : blocked
                ? { borderColor: palette.border, backgroundColor: palette.surface2 }
                : { borderColor: palette.primary, backgroundColor: palette.primary + '22' },
          ]}
          onPress={() => inSquad ? removePlayer(item.id) : addPlayer(item)}
          disabled={blocked && !inSquad}
        >
          <Ionicons name={inSquad ? 'remove' : 'add'} size={18} color={inSquad ? palette.danger : blocked ? palette.subtext : palette.primary} />
        </TouchableOpacity>
      </Pressable>
    );
  };

  if (loadingPool) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={palette.primary} size="large" />
          <Text style={[styles.loadingText, { color: palette.subtext }]}>Loading fantasy player pool...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <TextInput
          value={teamName}
          onChangeText={setTeamName}
          placeholder="Team name"
          placeholderTextColor={palette.subtext}
          style={[styles.teamName, { color: palette.text }]}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => setShowHelp(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <View style={[styles.helpBtn, { borderColor: 'rgba(255,255,255,0.25)' }]}>
              <Text style={[styles.helpBtnText, { color: palette.text }]}>?</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, isSquadValid
              ? { backgroundColor: palette.primary }
              : { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 18 }}>
        {/* Squad progress bar */}
        <View style={[styles.progressContainer, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: palette.text }]}>Squad Progress</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {squad.length > 0 && (
                <TouchableOpacity onPress={clearSquad}>
                  <Text style={{ color: palette.danger, fontSize: 12, fontWeight: '700' }}>Clear</Text>
                </TouchableOpacity>
              )}
              <Text style={[styles.progressCount, { color: squad.length === SQUAD_SIZE ? palette.success : palette.primary }]}>
                {squad.length}/{SQUAD_SIZE} players
              </Text>
            </View>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: palette.border }]}>
            <View style={[styles.progressFill, { width: `${(squad.length / SQUAD_SIZE) * 100}%`, backgroundColor: squad.length === SQUAD_SIZE ? palette.success : palette.primary }]} />
          </View>
          <View style={styles.progressPositions}>
            {POSITIONS.map((pos) => {
              const have = squadByPosition[pos].length;
              const min = POSITION_RULES[pos].min;
              return (
                <View key={pos} style={styles.progressPos}>
                  <Text style={[styles.progressPosCount, { color: have >= min ? palette.success : palette.subtext }]}>
                    {have}
                  </Text>
                  <Text style={[styles.progressPosLabel, { color: POS_COLORS[pos] }]}>{pos}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={[styles.summaryRow, { marginTop: 8 }]}>
          {[
            ['Budget', `£${budgetRemaining.toFixed(1)}m`, budgetRemaining < 0 ? palette.danger : palette.secondary],
            ['Free Transfers', '1', palette.primary],
            ['GW Points', '0 pts', palette.text],
          ].map(([label, value, color]) => (
            <View
              key={label}
              style={[
                styles.summaryCard,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            >
              <Text style={[styles.summaryValue, { color }]}>{value}</Text>
              <Text style={[styles.summaryLabel, { color: palette.subtext }]}>{label}</Text>
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.formationStrip}>
          {FORMATIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.formationChip,
                { borderColor: formation === option ? palette.primary : palette.border, backgroundColor: formation === option ? palette.primary + '22' : palette.surface },
              ]}
              onPress={() => setFormation(option)}
            >
              <Text style={[styles.formationChipText, { color: formation === option ? palette.primary : palette.subtext }]}>{option}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.pitch}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <PitchSvg width={pitchWidth} height={520} />
          </View>
          <View style={styles.pitchContent}>
            {(['FWD', 'MID', 'DEF', 'GK'] as PlayerPosition[]).map(renderPitchRow)}
          </View>
        </View>

        <View style={[styles.benchPanel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.benchHeader}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Bench</Text>
            <Text style={[styles.sectionMeta, { color: palette.subtext }]}>
              {benchPlayers.length}/{BENCH_SIZE} · any position
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.benchRow}>
            {benchPlayers.map((player, index) => renderPlayerTile(player, true, index))}
            {Array.from({ length: Math.max(0, BENCH_SIZE - benchPlayers.length) }).map((_, i) => (
              <TouchableOpacity
                key={`bench-empty-${i}`}
                style={[styles.emptySlot, { borderColor: palette.border }]}
                onPress={openBenchPicker}
                activeOpacity={0.7}
              >
                <View style={[styles.emptySlotCircle, { backgroundColor: palette.surface2 }]}>
                  <Ionicons name="add" size={18} color={palette.subtext} />
                </View>
                <Text style={[styles.emptySlotText, { color: palette.subtext }]}>Bench</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>


        {squad.length >= SQUAD_SIZE && (
        <View style={[styles.marketPanel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.marketHeader}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Transfer Market</Text>
            <TouchableOpacity onPress={() => { setClubFilter(null); setMaxPrice(null); setSearchQuery(''); }}>
              <Text style={[styles.resetText, { color: palette.primary }]}>Reset</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.searchBar, { backgroundColor: palette.surface2, borderColor: palette.border }]}>
            <Ionicons name="search-outline" size={16} color={palette.subtext} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search players or clubs"
              placeholderTextColor={palette.subtext}
              style={[styles.searchInput, { color: palette.text }]}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip}>
            {MARKET_TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.filterChip, { backgroundColor: marketTab === tab ? palette.primary : palette.surface2, borderColor: marketTab === tab ? palette.primary : palette.border }]}
                onPress={() => setMarketTab(tab)}
              >
                <Text style={[styles.filterText, { color: marketTab === tab ? '#101010' : palette.subtext }]}>{tab}</Text>
              </TouchableOpacity>
            ))}
            {[5, 7.5, 10].map((price) => (
              <TouchableOpacity
                key={price}
                style={[styles.filterChip, { backgroundColor: maxPrice === price ? palette.secondary : palette.surface2, borderColor: maxPrice === price ? palette.secondary : palette.border }]}
                onPress={() => setMaxPrice(maxPrice === price ? null : price)}
              >
                <Text style={[styles.filterText, { color: maxPrice === price ? '#06110B' : palette.subtext }]}>≤£{price}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip}>
            {SORT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.sortChip, { borderColor: sortKey === option ? palette.primary : palette.border }]}
                onPress={() => setSortKey(option)}
              >
                <Text style={[styles.sortText, { color: sortKey === option ? palette.primary : palette.subtext }]}>
                  {option === 'points' ? 'Total Points' : option[0].toUpperCase() + option.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip}>
            {clubs.map((club) => (
              <TouchableOpacity
                key={club.id}
                style={[styles.clubChip, { borderColor: clubFilter === club.id ? palette.secondary : palette.border }]}
                onPress={() => setClubFilter(clubFilter === club.id ? null : club.id)}
              >
                <Text style={[styles.clubText, { color: clubFilter === club.id ? palette.secondary : palette.subtext }]}>{shortClub(club.name)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={filteredPool}
            key={sortKey}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderMarketPlayer}
            scrollEnabled={false}
            initialNumToRender={18}
            maxToRenderPerBatch={18}
            windowSize={7}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListEmptyComponent={<Text style={[styles.emptyMarket, { color: palette.subtext }]}>No players match your filters.</Text>}
          />
        </View>
        )}
      </ScrollView>

      <PlayerActionModal
        player={actionPlayer}
        palette={palette}
        starterIds={starterIds}
        onClose={closeActionSheet}
        onInfo={(player) => { setDetailPlayer(player); closeActionSheet(); }}
        onReplace={replacePlayer}
        onSubstitute={startSubstitution}
        onCaptain={makeCaptain}
        onVice={makeViceCaptain}
        onRemove={(player) => { removePlayer(player.id); closeActionSheet(); }}
      />

      <PlayerDetailModal
        player={detailPlayer}
        palette={palette}
        onClose={() => setDetailPlayer(null)}
      />

      <PlayerPickerModal
        visible={pickerVisible}
        position={pickerPosition}
        players={playerPool}
        squad={squad}
        budgetRemaining={budgetRemaining}
        squadByPosition={squadByPosition}
        benchIds={benchIds}
        pitchLimit={pickerPosition !== null ? FORMATION_COUNTS[formation][pickerPosition] : SQUAD_SIZE}
        starterCount={pickerPosition !== null
          ? squadByPosition[pickerPosition].filter((p) => !benchIds.has(p.id)).length
          : squad.length}
        onAdd={(player) => {
          addPlayer(player, pickerPosition === null);
          if (pickerPosition === null) setPickerVisible(false);
          // Formation mode: stay open so user can fill all slots for this position
        }}
        onRemove={removePlayer}
        onClose={() => setPickerVisible(false)}
        onPositionChange={(pos) => { setPickerPosition(pos); setPickerSearch(''); }}
        palette={palette}
        search={pickerSearch}
        onSearchChange={setPickerSearch}
      />

      <Modal visible={showHelp} animationType="slide" transparent onRequestClose={() => setShowHelp(false)}>
        <View style={styles.helpOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowHelp(false)} />
          <View style={[styles.helpSheet, { backgroundColor: palette.surface }]}>
            <View style={[styles.helpHandle, { backgroundColor: palette.border }]} />
            <Text style={[styles.helpTitle, { color: palette.text }]}>How to Build Your Squad</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: 24 }}>
              {[
                { icon: 'person-add-outline', heading: 'Pick 16 Players', body: 'Tap any empty slot on the pitch to add a starting player. Tap a bench slot to add a substitute. Your squad needs 1 GK, 3 or more DEF, 2 or more MID, and 1 or more FWD.' },
                { icon: 'cash-outline', heading: 'Budget is £100m', body: 'Each player has a price. Your total squad cost must stay at or below £100m. Cheaper budget picks leave room for the stars.' },
                { icon: 'trophy-outline', heading: 'Your Starting 11', body: 'The 11 players on the pitch score points each gameweek. The 5 on the bench only score if you activate Bench Boost, which you can do from the Gameweek screen once your squad is saved.' },
                { icon: 'shirt-outline', heading: 'Choose a Formation', body: 'Swipe the formation bar to choose 4-4-2, 4-3-3, and others. The pitch rearranges instantly. You can change it any time before saving.' },
                { icon: 'star-outline', heading: 'Captain and Vice Captain', body: 'Tap any player on the pitch to set them as Captain (scores 2x) or Vice Captain (covers if Captain does not play). Do this before saving.' },
                { icon: 'swap-horizontal-outline', heading: 'Transfers Each Week', body: 'After your squad is saved, you get 1 free transfer per gameweek. You can make more but each extra costs 4 points. Use the Transfer Market once your squad is complete.' },
                { icon: 'create-outline', heading: 'Team Name', body: 'Tap your team name at the top to edit it. Pick something good. You can change it later from your team settings.' },
              ].map(({ icon, heading, body }) => (
                <View key={heading} style={styles.helpItem}>
                  <View style={[styles.helpIconWrap, { backgroundColor: palette.primary + '22' }]}>
                    <Ionicons name={icon as any} size={20} color={palette.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.helpItemHeading, { color: palette.text }]}>{heading}</Text>
                    <Text style={[styles.helpItemBody, { color: palette.subtext }]}>{body}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.helpClose, { backgroundColor: palette.primary }]}
              onPress={() => setShowHelp(false)}
            >
              <Text style={styles.helpCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PlayerActionModal({
  player,
  palette,
  starterIds,
  onClose,
  onInfo,
  onReplace,
  onSubstitute,
  onCaptain,
  onVice,
  onRemove,
}: {
  player: ActionPlayer;
  palette: any;
  starterIds: Set<number>;
  onClose: () => void;
  onInfo: (player: FantasyPlayer) => void;
  onReplace: (player: FantasyPlayer) => void;
  onSubstitute: (player: FantasyPlayer) => void;
  onCaptain: (player: FantasyPlayer) => void;
  onVice: (player: FantasyPlayer) => void;
  onRemove: (player: FantasyPlayer) => void;
}) {
  if (!player) return null;
  const isStarter = starterIds.has(player.id);
  const actions = [
    { label: 'View info', icon: 'information-circle-outline', fn: onInfo },
    { label: 'Replace player', icon: 'refresh-outline', fn: onReplace },
    ...(isStarter ? [{ label: 'Substitute', icon: 'swap-horizontal-outline', fn: onSubstitute }] : []),
    { label: 'Make Captain', icon: 'ribbon-outline', fn: onCaptain },
    { label: 'Make Vice-Captain', icon: 'ellipse-outline', fn: onVice },
    { label: 'Remove from squad', icon: 'trash-outline', fn: onRemove, danger: true },
  ];
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.actionSheet, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.actionTitle, { color: palette.text }]}>{player.name}</Text>
          <Text style={[styles.actionMeta, { color: palette.subtext }]}>{player.clubName} · {player.position} · £{player.price.toFixed(1)}</Text>
          {actions.map((action) => (
            <TouchableOpacity key={action.label} style={styles.actionRow} onPress={() => action.fn(player)}>
              <Ionicons name={action.icon as any} size={19} color={action.danger ? palette.danger : palette.secondary} />
              <Text style={[styles.actionText, { color: action.danger ? palette.danger : palette.text }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PlayerPickerModal({
  visible,
  position,
  players,
  squad,
  budgetRemaining,
  squadByPosition,
  benchIds,
  pitchLimit,
  starterCount,
  onAdd,
  onRemove,
  onClose,
  onPositionChange,
  palette,
  search,
  onSearchChange,
}: {
  visible: boolean;
  position: PlayerPosition | null;
  players: FantasyPlayer[];
  squad: FantasyPlayer[];
  budgetRemaining: number;
  squadByPosition: Record<PlayerPosition, FantasyPlayer[]>;
  benchIds: Set<number>;
  pitchLimit: number;
  starterCount: number;
  onAdd: (p: FantasyPlayer) => void;
  onRemove: (id: number) => void;
  onClose: () => void;
  onPositionChange?: (pos: PlayerPosition) => void;
  palette: any;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  const isBenchMode = position === null;
  const [pickerSort, setPickerSort] = useState<'points' | 'price' | 'name'>('points');
  const [pickerSortDir, setPickerSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSortPress = useCallback((opt: 'points' | 'price' | 'name') => {
    if (pickerSort === opt) {
      setPickerSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setPickerSort(opt);
      setPickerSortDir(opt === 'name' ? 'asc' : 'desc');
    }
  }, [pickerSort]);

  const posIndex = !isBenchMode ? POSITIONS.indexOf(position!) : -1;
  const prevPos = posIndex > 0 ? POSITIONS[posIndex - 1] : null;
  const nextPos = posIndex >= 0 && posIndex < POSITIONS.length - 1 ? POSITIONS[posIndex + 1] : null;

  const pool = useMemo(() => {
    if (!visible) return [];
    const q = search.trim().toLowerCase();
    return players
      .filter((p) => isBenchMode || p.position === position)
      .filter((p) => !q || `${p.name} ${p.clubName ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => {
        let cmp = 0;
        if (pickerSort === 'price') cmp = b.price - a.price;
        else if (pickerSort === 'name') cmp = a.name.localeCompare(b.name);
        else cmp = b.totalPoints - a.totalPoints;
        return pickerSortDir === 'asc' ? -cmp : cmp;
      });
  }, [visible, players, position, isBenchMode, search, pickerSort, pickerSortDir]);

  if (!visible) return null;

  // Pitch mode: spots left = formation slots - current starters
  // Bench mode: spots left = squad remaining
  const spotsLeft = pitchLimit - starterCount;

  return (
    <PickerSheet palette={palette} onClose={onClose}>
          <View style={[styles.pickerHeader, { borderBottomColor: palette.border }]}>
            <View style={styles.pickerHeaderLeft}>
              <View style={[styles.pickerPosBadge, { backgroundColor: isBenchMode ? palette.subtext : POS_COLORS[position!] }]}>
                <Text style={styles.pickerPosBadgeText}>{isBenchMode ? 'BENCH' : position}</Text>
              </View>
              <View>
                <Text style={[styles.pickerHeaderTitle, { color: palette.text }]}>
                  {isBenchMode ? 'Add Bench Player' : `Pick a ${POS_LABELS[position!]}`}
                </Text>
                <Text style={[styles.pickerHeaderSub, { color: palette.subtext }]}>
                  {isBenchMode
                    ? `${squad.length}/${SQUAD_SIZE} in squad`
                    : `${starterCount}/${pitchLimit} in XI`
                  } · {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left` : 'slots full'} · £{budgetRemaining.toFixed(1)}m left
                </Text>
              </View>
            </View>
            <View style={styles.pickerHeaderActions}>
              {!isBenchMode && onPositionChange && (
                <>
                  <TouchableOpacity
                    onPress={() => { if (prevPos) { onPositionChange(prevPos); onSearchChange(''); } }}
                    disabled={!prevPos}
                    style={[styles.pickerNavBtn, !prevPos && styles.pickerNavBtnDisabled]}
                  >
                    <Ionicons name="chevron-back" size={20} color={prevPos ? palette.text : palette.border} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { if (nextPos) { onPositionChange(nextPos); onSearchChange(''); } }}
                    disabled={!nextPos}
                    style={[styles.pickerNavBtn, !nextPos && styles.pickerNavBtnDisabled]}
                  >
                    <Ionicons name="chevron-forward" size={20} color={nextPos ? palette.text : palette.border} />
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity onPress={onClose} style={styles.pickerCloseBtn}>
                <Ionicons name="close" size={22} color={palette.subtext} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Budget / Rule hint */}
          <View style={[styles.pickerRuleBar, { backgroundColor: palette.surface }]}>
            <Ionicons name="information-circle-outline" size={14} color={palette.subtext} />
            <Text style={[styles.pickerRuleText, { color: palette.subtext }]}>
              {isBenchMode ? 'Any position · ' : `${POS_RULES_TEXT[position!]} · `}Max 3 players per country · Budget £{budgetRemaining.toFixed(1)}m
            </Text>
          </View>

          {/* Search */}
          <View style={[styles.pickerSearch, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Ionicons name="search-outline" size={16} color={palette.subtext} />
            <TextInput
              value={search}
              onChangeText={onSearchChange}
              placeholder={isBenchMode ? 'Search all players…' : `Search ${POS_LABELS[position!]}s…`}
              placeholderTextColor={palette.subtext}
              style={[styles.pickerSearchInput, { color: palette.text }]}
              returnKeyType="search"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => onSearchChange('')}>
                <Ionicons name="close-circle" size={16} color={palette.subtext} />
              </TouchableOpacity>
            )}
          </View>

          {/* Sort chips */}
          <View style={styles.pickerSortStrip}>
            {(['points', 'price', 'name'] as const).map((opt) => {
              const active = pickerSort === opt;
              const label = opt === 'points' ? 'Points' : opt === 'price' ? 'Price' : 'A–Z';
              const dirIcon = pickerSortDir === 'asc'
                ? 'arrow-up' as const
                : 'arrow-down' as const;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.pickerSortChip,
                    active
                      ? { backgroundColor: palette.primary, borderColor: palette.primary }
                      : { backgroundColor: palette.surface2, borderColor: 'rgba(255,255,255,0.18)' },
                  ]}
                  onPress={() => handleSortPress(opt)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.pickerSortText, { color: active ? '#fff' : palette.subtext }]}>
                    {label}
                  </Text>
                  {active && (
                    <Ionicons name={dirIcon} size={11} color="#fff" style={{ marginLeft: 3 }} />
                  )}
                </TouchableOpacity>
              );
            })}
            <Text style={[styles.pickerSortLabel, { color: palette.subtext }]}>
              {pool.length} player{pool.length !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* List */}
          <FlatList
            data={pool}
            key={pickerSort}
            keyExtractor={(item) => String(item.id)}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.pickerEmpty}>
                {search ? (
                  <Text style={[styles.pickerEmptyText, { color: palette.subtext }]}>
                    No players match "{search}"
                  </Text>
                ) : players.length === 0 ? (
                  <View style={styles.pickerEmptyInner}>
                    <Ionicons name="alert-circle-outline" size={36} color={palette.subtext} />
                    <Text style={[styles.pickerEmptyText, { color: palette.text }]}>No players loaded yet</Text>
                    <Text style={[styles.pickerEmptyHint, { color: palette.subtext }]}>
                      Run the seed script to populate WC 2026 players:{'\n'}
                      cd scripts && npm run seed:wc
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.pickerEmptyText, { color: palette.subtext }]}>
                    No {isBenchMode ? 'players' : `${POS_LABELS[position!]}s`} available
                  </Text>
                )}
              </View>
            }
            renderItem={({ item }) => {
              const inSquad = squad.some((p) => p.id === item.id);
              const tooExpensive = !inSquad && budgetRemaining < item.price;
              const clubCount = squad.filter((p) => p.clubId === item.clubId).length;
              const clubFull = !inSquad && clubCount >= 3;
              const itemPosFull = !inSquad && (isBenchMode
                // Bench: limit by total position max
                ? squadByPosition[item.position].length >= POSITION_RULES[item.position].max
                // Pitch: limit by formation slots for this position (already pre-computed)
                : starterCount >= pitchLimit);
              const squadFull = !inSquad && squad.length >= SQUAD_SIZE;
              const blocked = tooExpensive || clubFull || itemPosFull || squadFull;
              const posColor = POS_COLORS[item.position];
              const colors = getClubColors(item.clubId ?? item.id);

              return (
                <Pressable
                  style={[
                    styles.pickerRow,
                    { borderBottomColor: palette.border },
                    inSquad && { backgroundColor: posColor + '10' },
                  ]}
                  onPress={() => {
                    if (inSquad) onRemove(item.id);
                    else if (!blocked) onAdd(item);
                  }}
                >
                  <KitSvg
                    primary={colors.primary}
                    secondary={colors.secondary}
                    textColor={colors.text}
                    initials={initials(item.shortName || item.name)}
                    size={44}
                  />
                  <View style={styles.pickerRowInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text
                        style={[styles.pickerRowName, { color: inSquad ? posColor : palette.text }]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      {isBenchMode && (
                        <View style={[styles.pickerPosBadge, { backgroundColor: posColor, paddingHorizontal: 4, paddingVertical: 1 }]}>
                          <Text style={[styles.pickerPosBadgeText, { fontSize: 9 }]}>{item.position}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.pickerRowMeta, { color: palette.subtext }]} numberOfLines={1}>
                      {item.clubName} · {item.totalPoints} pts
                    </Text>
                    {clubFull && (
                      <Text style={[styles.pickerRowWarn, { color: palette.warning }]}>
                        Max 3 from {item.clubName}
                      </Text>
                    )}
                    {itemPosFull && !clubFull && (
                      <Text style={[styles.pickerRowWarn, { color: palette.warning }]}>
                        {isBenchMode ? `${item.position} limit reached` : 'Pitch slots full — use bench'}
                      </Text>
                    )}
                  </View>
                  <View style={styles.pickerRowRight}>
                    <Text style={[styles.pickerRowPrice, { color: tooExpensive ? palette.danger : palette.secondary }]}>
                      £{item.price.toFixed(1)}m
                    </Text>
                    <View style={[
                      styles.pickerRowBtn,
                      inSquad
                        ? { backgroundColor: '#22C55E' }
                        : blocked
                          ? { backgroundColor: palette.surface2 ?? palette.surface, borderWidth: 1, borderColor: palette.border }
                          : { backgroundColor: posColor },
                    ]}>
                      <Ionicons
                        name={inSquad ? 'checkmark' : 'add'}
                        size={16}
                        color={blocked && !inSquad ? palette.subtext : '#fff'}
                      />
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
    </PickerSheet>
  );
}

// Drag-to-dismiss bottom sheet wrapper used by PlayerPickerModal
function PickerSheet({ children, palette, onClose }: { children: React.ReactNode; palette: any; onClose: () => void }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 0 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          Animated.timing(translateY, { toValue: 700, duration: 180, useNativeDriver: true }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
    })
  ).current;

  useEffect(() => { translateY.setValue(0); }, [translateY]);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.pickerOverlay}>
        <Pressable style={styles.pickerBackdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.pickerSheet,
            { backgroundColor: palette.background, paddingBottom: insets.bottom, transform: [{ translateY }] },
          ]}
        >
          <View {...panResponder.panHandlers} style={styles.pickerHandleZone}>
            <View style={[styles.pickerHandle, { backgroundColor: palette.border }]} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

function PlayerDetailModal({ player, palette, onClose }: { player: ActionPlayer; palette: any; onClose: () => void }) {
  if (!player) return null;
  const fdr = [2, 3, 4, 1, 5];
  const fdrColors = ['#1B7B3C', '#0DAA45', '#E5E5E5', '#F59E0B', '#A11B23'];
  const ownership = Math.min(65, Math.max(1, Math.round(player.totalPoints / 6)));
  return (
    <Modal animationType="slide" visible onRequestClose={onClose}>
      <SafeAreaView style={[styles.detailRoot, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
        <View style={[styles.detailHeader, { borderBottomColor: palette.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={palette.text} />
          </TouchableOpacity>
          <Text style={[styles.detailTitle, { color: palette.text }]}>Player Info</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={styles.detailContent}>
          <View style={[styles.detailHero, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={[styles.detailAvatar, { backgroundColor: kitColorFor(player) }]}>
              <Text style={styles.detailAvatarText}>{initials(player.name)}</Text>
            </View>
            <Text style={[styles.detailName, { color: palette.text }]}>{player.name}</Text>
            <Text style={[styles.detailClub, { color: palette.subtext }]}>{player.clubName} · {player.position}</Text>
          </View>

          <View style={styles.detailGrid}>
            {[
              ['Price', `£${player.price.toFixed(1)}m`, palette.secondary],
              ['Form', player.form.toFixed(1), palette.text],
              ['PPG', Math.max(0, player.form).toFixed(1), palette.text],
              ['Total', String(player.totalPoints), palette.primary],
              ['Selected by', `${ownership}%`, palette.text],
              ['ICT', String(Math.round(player.totalPoints * 1.8)), palette.text],
            ].map(([label, value, color]) => (
              <View key={label} style={[styles.detailStat, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <Text style={[styles.detailStatValue, { color }]}>{value}</Text>
                <Text style={[styles.detailStatLabel, { color: palette.subtext }]}>{label}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.detailSection, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.detailSectionTitle, { color: palette.text }]}>Next 5 Fixtures</Text>
            <View style={styles.fdrRow}>
              {fdr.map((difficulty, index) => (
                <View key={`${difficulty}-${index}`} style={[styles.fdrBox, { backgroundColor: fdrColors[difficulty - 1] }]}>
                  <Text style={[styles.fdrText, { color: difficulty === 3 ? '#111827' : '#FFFFFF' }]}>{difficulty}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.detailSection, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.detailSectionTitle, { color: palette.text }]}>Gameweek Breakdown Preview</Text>
            {[
              ['Played 60+ minutes', '+2 pts'],
              [`Goal scored (${player.position})`, player.position === 'GK' ? '+10 pts' : '+6 pts'],
              ['Assist', '+3 pts'],
              ['Bonus', '+1 to +3 pts'],
            ].map(([label, value], index, arr) => (
              <View key={label} style={[styles.breakdownRow, index < arr.length - 1 && { borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.breakdownLabel, { color: palette.text }]}>{label}</Text>
                <Text style={[styles.breakdownValue, { color: palette.secondary }]}>{value}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontWeight: '700' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  teamName: { flex: 1, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  saveButton: { minWidth: 66, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },

  progressContainer: { margin: 12, marginBottom: 0, borderWidth: 1, borderRadius: 10, padding: 12 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressLabel: { fontSize: 13, fontWeight: '800' },
  progressCount: { fontSize: 13, fontWeight: '900' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressPositions: { flexDirection: 'row', justifyContent: 'space-around' },
  progressPos: { alignItems: 'center', gap: 2 },
  progressPosCount: { fontSize: 13, fontWeight: '900' },
  progressPosLabel: { fontSize: 10, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12 },
  summaryCard: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 },
  summaryValue: { fontSize: 15, fontWeight: '900' },
  summaryLabel: { fontSize: 9, fontWeight: '800', marginTop: 2, textTransform: 'uppercase' },
  formationStrip: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  formationChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  formationChipText: { fontSize: 13, fontWeight: '900' },
  pitch: { marginHorizontal: 12, height: 520, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  pitchStripe: { position: 'absolute', left: 0, right: 0, height: '25%' },
  halfLine: { position: 'absolute', top: '50%', left: 0, right: 0, borderTopWidth: 1 },
  centerCircle: { position: 'absolute', top: '42%', alignSelf: 'center', width: 72, height: 72, borderRadius: 36, borderWidth: 1 },
  boxTop: { position: 'absolute', top: 0, alignSelf: 'center', width: 170, height: 54, borderWidth: 1, borderTopWidth: 0 },
  boxBottom: { position: 'absolute', bottom: 0, alignSelf: 'center', width: 170, height: 54, borderWidth: 1, borderBottomWidth: 0 },
  pitchContent: { flex: 1, justifyContent: 'space-around', paddingVertical: 18 },
  pitchRow: { minHeight: 88, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 6 },
  playerTile: { width: 72, alignItems: 'center', borderRadius: 8, paddingVertical: 3, borderColor: 'transparent' },
  benchTile: { opacity: 0.78 },
  kit: { width: 48, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  kitSmall: { width: 38, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  kitSleeveLeft: { position: 'absolute', left: -7, top: 8, width: 12, height: 20, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.20)' },
  kitSleeveRight: { position: 'absolute', right: -7, top: 8, width: 12, height: 20, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.20)' },
  kitInitials: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  kitInitialsSmall: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  roleBadge: { position: 'absolute', right: -8, top: -7, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  roleBadgeText: { fontSize: 11, fontWeight: '900' },
  statusDot: { position: 'absolute', left: -5, top: -5, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#080E1A' },
  tileName: { marginTop: 4, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  tileMeta: { fontSize: 10, fontWeight: '800', marginTop: 1 },
  emptySlot: { width: 68, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(11,18,32,0.25)', borderWidth: 1.5, borderStyle: 'dashed' },
  emptySlotCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  miniEmptySlot: { width: 58, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(11,18,32,0.18)' },
  emptySlotText: { fontSize: 10, fontWeight: '900' },
  // Picker modal styles
  pickerOverlay: { flex: 1, justifyContent: 'flex-end' },
  pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  pickerSheet: { height: '86%', borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  pickerHandleZone: { paddingVertical: 14, alignItems: 'center' },
  pickerHandle: { width: 44, height: 5, borderRadius: 3 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  pickerHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pickerNavBtn: { padding: 6, borderRadius: 8 },
  pickerNavBtnDisabled: { opacity: 0.25 },
  pickerPosBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  pickerPosBadgeText: { fontSize: 12, fontWeight: '900', color: '#080E1A' },
  pickerHeaderTitle: { fontSize: 18, fontWeight: '900' },
  pickerHeaderSub: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  pickerCloseBtn: { padding: 6 },
  pickerRuleBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8 },
  pickerRuleText: { fontSize: 11, fontWeight: '700', flex: 1 },
  pickerSearch: { margin: 12, marginTop: 8, marginBottom: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerSearchInput: { flex: 1, fontSize: 14, fontWeight: '700' },
  pickerCount: { paddingHorizontal: 14, paddingBottom: 6, fontSize: 11, fontWeight: '700' },
  pickerSortStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 10, paddingTop: 2 },
  pickerSortChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, flexDirection: 'row', alignItems: 'center' },
  pickerSortText: { fontSize: 12, fontWeight: '800' },
  pickerSortLabel: { fontSize: 11, fontWeight: '700', marginLeft: 4 },
  pickerEmpty: { paddingVertical: 48, paddingHorizontal: 20, alignItems: 'center' },
  pickerEmptyInner: { alignItems: 'center', gap: 10 },
  pickerEmptyText: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  pickerEmptyHint: { fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 18, marginTop: 4 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerRowInfo: { flex: 1 },
  pickerRowName: { fontSize: 15, fontWeight: '900' },
  pickerRowMeta: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  pickerRowWarn: { fontSize: 10, fontWeight: '800', marginTop: 2 },
  pickerRowRight: { alignItems: 'flex-end', gap: 5 },
  pickerRowPrice: { fontSize: 12, fontWeight: '900' },
  pickerRowBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  benchPanel: { margin: 12, borderWidth: 1, borderRadius: 8, padding: 12 },
  benchHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '900' },
  sectionMeta: { fontSize: 11, fontWeight: '700', alignSelf: 'center' },
  benchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 4, paddingVertical: 4, minHeight: 82, alignItems: 'center' },
  emptyBenchText: { fontSize: 13, fontWeight: '700', paddingVertical: 24 },
  marketPanel: { marginHorizontal: 12, borderWidth: 1, borderRadius: 8, padding: 12 },
  marketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resetText: { fontSize: 12, fontWeight: '900' },
  searchBar: { marginTop: 10, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 42, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '700' },
  filterStrip: { gap: 8, paddingVertical: 10 },
  filterChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  filterText: { fontSize: 12, fontWeight: '900' },
  sortChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  sortText: { fontSize: 12, fontWeight: '800' },
  clubChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  clubText: { fontSize: 11, fontWeight: '900' },
  marketRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 8, padding: 10 },
  marketInfo: { flex: 1 },
  marketNameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  marketName: { flex: 1, fontSize: 13, fontWeight: '900' },
  positionBadge: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  positionBadgeText: { fontSize: 10, fontWeight: '900' },
  marketClub: { marginTop: 3, fontSize: 11, fontWeight: '700' },
  marketStats: { alignItems: 'flex-end' },
  marketPoints: { fontSize: 15, fontWeight: '900' },
  marketPrice: { fontSize: 11, fontWeight: '900', marginTop: 2 },
  addButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyMarket: { textAlign: 'center', paddingVertical: 24, fontSize: 13, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'flex-end' },
  actionSheet: { borderTopLeftRadius: 12, borderTopRightRadius: 12, borderWidth: 1, padding: 18, paddingBottom: 28 },
  actionTitle: { fontSize: 20, fontWeight: '900' },
  actionMeta: { fontSize: 13, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  actionRow: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionText: { fontSize: 15, fontWeight: '900' },
  detailRoot: { flex: 1 },
  detailHeader: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  detailTitle: { fontSize: 17, fontWeight: '900' },
  detailContent: { padding: 16, gap: 12 },
  detailHero: { borderWidth: 1, borderRadius: 8, padding: 18, alignItems: 'center' },
  detailAvatar: { width: 86, height: 86, borderRadius: 43, alignItems: 'center', justifyContent: 'center' },
  detailAvatarText: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
  detailName: { fontSize: 24, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  detailClub: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailStat: { width: '31.8%', borderWidth: 1, borderRadius: 8, padding: 12 },
  detailStatValue: { fontSize: 18, fontWeight: '900' },
  detailStatLabel: { fontSize: 10, fontWeight: '800', marginTop: 3, textTransform: 'uppercase' },
  detailSection: { borderWidth: 1, borderRadius: 8, padding: 14 },
  detailSectionTitle: { fontSize: 15, fontWeight: '900', marginBottom: 10 },
  fdrRow: { flexDirection: 'row', gap: 8 },
  fdrBox: { width: 42, height: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  fdrText: { fontSize: 15, fontWeight: '900' },
  breakdownRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  breakdownLabel: { fontSize: 13, fontWeight: '800' },
  breakdownValue: { fontSize: 13, fontWeight: '900' },
  helpBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  helpBtnText: { fontSize: 15, fontWeight: '900' },
  helpOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  helpSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, height: '85%' },
  helpHandle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  helpTitle: { fontSize: 20, fontWeight: '900', marginBottom: 20 },
  helpItem: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  helpIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  helpItemHeading: { fontSize: 14, fontWeight: '800' },
  helpItemBody: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  helpClose: { borderRadius: 14, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  helpCloseText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
