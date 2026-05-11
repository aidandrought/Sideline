import { Match } from './footballApi';
import { getMatchPhase } from './matchPhase';

export type MatchRouteSeed = {
  id: number | string;
  home?: string;
  away?: string;
  homeLogo?: string;
  awayLogo?: string;
  league?: string;
  date?: Date | string | null;
  status?: Match['status'] | string | null;
  score?: string | null;
  minute?: string | null;
};

type MatchRoutePath = '/chat/[id]' | '/matchPreview/[id]' | '/results/[id]';

const normalizeStatus = (status?: Match['status'] | string | null): Match['status'] | undefined => {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return undefined;
  if (value === 'finished' || value === 'ft' || value === 'aet' || value === 'pen') return 'finished';
  if (value === 'live' || value === '1h' || value === '2h' || value === 'ht' || value === 'et') return 'live';
  return 'upcoming';
};

export const getMatchRoutePath = (match: MatchRouteSeed, now = new Date()): MatchRoutePath => {
  const phaseInfo = getMatchPhase({
    kickoffAt: match.date ?? null,
    status: normalizeStatus(match.status),
    statusShort: typeof match.status === 'string' ? match.status : undefined,
    now,
  });
  if (phaseInfo.phase === 'finished' && !phaseInfo.chatOpen) return '/results/[id]';
  if (!phaseInfo.chatOpen) return '/matchPreview/[id]';
  return '/chat/[id]';
};

export const buildMatchRouteDescriptor = (match: MatchRouteSeed, now = new Date()) => ({
  pathname: getMatchRoutePath(match, now),
  params: {
    id: String(match.id),
    home: match.home || '',
    away: match.away || '',
    homeLogo: match.homeLogo || '',
    awayLogo: match.awayLogo || '',
    league: match.league || '',
    kickoff: typeof match.date === 'string' ? match.date : match.date ? match.date.toISOString() : '',
    status: String(match.status || ''),
    score: match.score || '',
    minute: match.minute || '',
  },
});
