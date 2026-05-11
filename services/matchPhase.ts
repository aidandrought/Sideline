import { Match } from './footballApi';

export type MatchPhase = 'pregame' | 'live' | 'finished';

export interface MatchPhaseInfo {
  phase: MatchPhase;
  chatOpen: boolean;
  showRedDot: boolean;
  opensAt: Date | null;
  closesAt: Date | null;
  kickoffAt: Date | null;
}

const LIVE_STATUS_SHORT = new Set(['1H', '2H', 'ET', 'HT', 'LIVE']);
const ENDED_STATUS_SHORT = new Set(['FT', 'AET', 'PEN']);
const CHAT_CLOSE_GRACE_MS = 15 * 60 * 1000;
const LIKELY_MATCH_END_MS = 110 * 60 * 1000;

export const getMatchPhase = ({
  kickoffAt,
  statusShort,
  status,
  endedAt,
  now = new Date(),
}: {
  kickoffAt?: Date | string | null;
  statusShort?: string | null;
  status?: Match['status'];
  endedAt?: Date | null;
  now?: Date;
}): MatchPhaseInfo => {
  const kickoffDate = kickoffAt ? new Date(kickoffAt) : null;
  const normalizedStatus = statusShort?.toUpperCase() ?? null;

  let phase: MatchPhase = 'pregame';
  if ((normalizedStatus && ENDED_STATUS_SHORT.has(normalizedStatus)) || status === 'finished') {
    phase = 'finished';
  } else if ((normalizedStatus && LIVE_STATUS_SHORT.has(normalizedStatus)) || status === 'live') {
    phase = 'live';
  }

  let opensAt: Date | null = null;
  let closesAt: Date | null = null;

  if (kickoffDate) {
    opensAt = new Date(kickoffDate.getTime() - 45 * 60 * 1000);
    const fallbackEndedAt = new Date(kickoffDate.getTime() + 2 * 60 * 60 * 1000);
    if (phase === 'finished') {
      const resolvedEndedAt = endedAt ?? fallbackEndedAt;
      closesAt = resolvedEndedAt
        ? new Date(resolvedEndedAt.getTime() + CHAT_CLOSE_GRACE_MS)
        : new Date(fallbackEndedAt.getTime() + CHAT_CLOSE_GRACE_MS);
    } else if (endedAt) {
      closesAt = new Date(endedAt.getTime() + CHAT_CLOSE_GRACE_MS);
    } else {
      closesAt = new Date(fallbackEndedAt.getTime() + CHAT_CLOSE_GRACE_MS);
    }
  }

  // Guardrail for stale provider statuses: never keep a match live beyond the close window.
  if (closesAt && now.getTime() > closesAt.getTime()) {
    phase = 'finished';
  }

  const chatOpen = opensAt ? now.getTime() >= opensAt.getTime() && (!closesAt || now.getTime() <= closesAt.getTime()) : false;
  const showRedDot = chatOpen && phase !== 'finished';

  return {
    phase,
    chatOpen,
    showRedDot,
    opensAt,
    closesAt,
    kickoffAt: kickoffDate,
  };
};

export const isLikelyFinishedFromLive = (
  match: Pick<Match, 'id' | 'date' | 'status'>,
  now: Date = new Date(),
  activeLiveIds?: Set<string>
) => {
  const phaseInfo = getMatchPhase({ kickoffAt: match.date, status: match.status, now });
  if (phaseInfo.phase === 'finished') return true;

  const kickoffAt = new Date(match.date);
  if (Number.isNaN(kickoffAt.getTime())) return false;

  const pastLikelyFullTime = now.getTime() >= kickoffAt.getTime() + LIKELY_MATCH_END_MS;
  if (!pastLikelyFullTime) return false;

  if (!activeLiveIds || activeLiveIds.size === 0) {
    return true;
  }

  return !activeLiveIds.has(String(match.id));
};
