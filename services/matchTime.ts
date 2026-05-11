export type MatchPhaseSimple = 'pregame' | 'live' | 'upcoming';

const PREGAME_WINDOW_MINUTES = 45;

export const isPregameWindow = (kickoff: Date, now: Date = new Date()): boolean => {
  const opensAt = kickoff.getTime() - PREGAME_WINDOW_MINUTES * 60 * 1000;
  return now.getTime() >= opensAt && now.getTime() < kickoff.getTime();
};

export const getMatchPhase = (
  kickoffIso: string | Date,
  status?: 'live' | 'upcoming' | 'finished' | string,
  now: Date = new Date()
): MatchPhaseSimple => {
  const kickoff = kickoffIso instanceof Date ? kickoffIso : new Date(kickoffIso);
  if (Number.isNaN(kickoff.getTime())) return 'upcoming';
  const normalizedStatus = (status || '').toLowerCase();

  if (normalizedStatus === 'finished') return 'upcoming';
  if (normalizedStatus === 'live') return 'live';
  if (now.getTime() >= kickoff.getTime() && normalizedStatus !== 'finished') return 'live';
  if (isPregameWindow(kickoff, now)) return 'pregame';
  return 'upcoming';
};

export const formatKickoffLabel = (kickoffDate: Date, now: Date = new Date()): string => {
  const kickoffDay = new Date(kickoffDate);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const kickoffDayStart = new Date(kickoffDay);
  kickoffDayStart.setHours(0, 0, 0, 0);

  const time = kickoffDay.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (kickoffDayStart.getTime() === today.getTime()) {
    return `Today ${time}`;
  }
  if (kickoffDayStart.getTime() === tomorrow.getTime()) {
    return `Tomorrow ${time}`;
  }
  const dateLabel = kickoffDay.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `${dateLabel} ${time}`;
};
