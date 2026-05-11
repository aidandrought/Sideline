export type DecorReplacement = { id?: number; name?: string; minute: string };

export type PlayerDecor = {
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  straightRed: number;
  secondYellow: number;
  subbedInMinute?: string;
  subbedOutMinute?: string;
  replacedBy?: DecorReplacement;
  replacedWho?: DecorReplacement;
};

export type UiEventType = 'goal' | 'yellow' | 'red' | 'sub' | 'var' | 'corner' | 'shot' | 'save' | 'foul' | 'penalty' | 'whistle' | 'other';

export type UiEvent = {
  id: string;
  time: string;
  type: UiEventType;
  icon: UiEventType;
  text: string;
  subText?: string;
  sortKey: number;
  teamId?: number;
  teamName?: string;
  playerName?: string;
  synthetic?: boolean;
};

const toMinuteLabel = (elapsed?: number, extra?: number) => {
  if (!elapsed) return '';
  if (extra) return `${elapsed}'+${extra}`;
  return `${elapsed}'`;
};

const buildMinuteLabel = (elapsed?: number, extra?: number) => {
  if (!elapsed) return "0'";
  if (extra) return `${elapsed}'+${extra}`;
  return `${elapsed}'`;
};

const normalizeDetail = (value?: string) => (value || '').toLowerCase();
const normalizePlayerName = (value?: string) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const buildDecorMap = (events: any[]) => {
  const map = new Map<number, PlayerDecor>();

  const get = (playerId?: number) => {
    if (!playerId) return null;
    if (!map.has(playerId)) {
      map.set(playerId, { goals: 0, assists: 0, yellow: 0, red: 0, straightRed: 0, secondYellow: 0 });
    }
    return map.get(playerId) || null;
  };

  events.forEach((event) => {
    const type = normalizeDetail(event?.type);
    const detail = normalizeDetail(event?.detail);
    const elapsed = event?.time?.elapsed ?? 0;
    const extra = event?.time?.extra ?? 0;
    const minute = buildMinuteLabel(elapsed, extra);
    const playerId = event?.player?.id;
    const assistId = event?.assist?.id;

    if (type === 'goal') {
      const decor = get(playerId);
      if (decor) decor.goals += 1;
      const assister = get(assistId);
      if (assister) assister.assists += 1;
      return;
    }

    if (type === 'card') {
      const decor = get(playerId);
      if (!decor) return;
      if (detail.includes('second yellow')) {
        decor.secondYellow += 1;
        decor.yellow += 1;
        decor.red += 1;
        return;
      }
      if (detail.includes('yellow')) decor.yellow += 1;
      if (detail.includes('red')) {
        decor.red += 1;
        decor.straightRed += 1;
      }
      return;
    }

    if (type === 'subst' || type.includes('sub') || detail.includes('substitution')) {
      // API-Football uses player = IN, assist = OUT
      const eventPlayerInId = event?.player?.id;
      const eventPlayerOutId = event?.assist?.id;
      const fallbackInId = event?.substitution?.in?.id;
      const fallbackOutId = event?.substitution?.out?.id;

      const incomingId = eventPlayerInId || fallbackInId;
      const outgoingId = eventPlayerOutId || fallbackOutId;
      const incomingName = event?.player?.name || event?.substitution?.in?.name;
      const outgoingName = event?.assist?.name || event?.substitution?.out?.name;

      const incoming = get(incomingId);
      const outgoing = get(outgoingId);
      if (incoming) {
        incoming.subbedInMinute = minute;
        incoming.replacedWho = {
          id: outgoingId,
          name: outgoingName,
          minute,
        };
      }
      if (outgoing) {
        outgoing.subbedOutMinute = minute;
        outgoing.replacedBy = {
          id: incomingId,
          name: incomingName,
          minute,
        };
      }
    }
  });

  return map;
};

export const buildDecorNameMap = (events: any[]) => {
  const idDecorMap = buildDecorMap(events);
  const map = new Map<string, PlayerDecor>();

  const mergeDecor = (target: PlayerDecor, source: PlayerDecor) => {
    target.goals = Math.max(target.goals, source.goals);
    target.assists = Math.max(target.assists, source.assists);
    target.yellow = Math.max(target.yellow, source.yellow);
    target.red = Math.max(target.red, source.red);
    target.straightRed = Math.max(target.straightRed, source.straightRed);
    target.secondYellow = Math.max(target.secondYellow, source.secondYellow);
    target.subbedInMinute = target.subbedInMinute || source.subbedInMinute;
    target.subbedOutMinute = target.subbedOutMinute || source.subbedOutMinute;
    target.replacedBy = target.replacedBy || source.replacedBy;
    target.replacedWho = target.replacedWho || source.replacedWho;
  };

  events.forEach((event) => {
    const playerName = normalizePlayerName(event?.player?.name);
    const assistName = normalizePlayerName(event?.assist?.name);
    const playerDecor = event?.player?.id ? idDecorMap.get(event.player.id) : null;
    const assistDecor = event?.assist?.id ? idDecorMap.get(event.assist.id) : null;

    if (playerName && playerDecor) {
      const existing = map.get(playerName) || { goals: 0, assists: 0, yellow: 0, red: 0, straightRed: 0, secondYellow: 0 };
      mergeDecor(existing, playerDecor);
      map.set(playerName, existing);
    }

    if (assistName && assistDecor) {
      const existing = map.get(assistName) || { goals: 0, assists: 0, yellow: 0, red: 0, straightRed: 0, secondYellow: 0 };
      mergeDecor(existing, assistDecor);
      map.set(assistName, existing);
    }
  });

  return map;
};

export const findPlayerDecor = (
  player: { id?: number; name?: string } | null | undefined,
  decorMap: Map<number, PlayerDecor>,
  decorNameMap?: Map<string, PlayerDecor>
) => {
  if (!player) return undefined;
  if (player.id) {
    const byId = decorMap.get(player.id);
    if (byId) return byId;
  }
  const normalizedName = normalizePlayerName(player.name);
  if (!normalizedName || !decorNameMap) return undefined;
  return decorNameMap.get(normalizedName);
};

export const normalizeFixtureEvents = (events: any[]) => {
  return events
    .map((event, index) => {
      const type = normalizeDetail(event?.type);
      const detail = normalizeDetail(event?.detail);
      const comments = normalizeDetail(event?.comments);
      const elapsed = event?.time?.elapsed ?? 0;
      const extra = event?.time?.extra ?? 0;
      const minute = buildMinuteLabel(elapsed, extra);
      const team = event?.team?.name || 'Unknown';
      const teamId = event?.team?.id;
      const player = event?.player?.name || 'Unknown';
      const assist = event?.assist?.name;

      let icon: UiEventType = 'other';
      let text = '';

      if (type === 'goal') {
        icon = 'goal';
        const penalty = detail.includes('penalty') ? ' (Pen)' : '';
        const assisted = assist ? ` Assisted by ${assist}.` : '';
        text = `Goal! ${team}. ${player}${penalty}.${assisted}`.trim();
      } else if (type === 'card') {
        if (detail.includes('second yellow')) {
          icon = 'red';
          text = `${player} (${team}) receives a second yellow card and is sent off.`;
        } else if (detail.includes('yellow')) {
          icon = 'yellow';
          text = `${player} (${team}) is shown the yellow card.`;
        } else if (detail.includes('red')) {
          icon = 'red';
          text = `${player} (${team}) is shown the red card.`;
        } else {
          icon = 'yellow';
          text = `${player} (${team}) is booked.`;
        }
      } else if (type === 'subst' || detail.includes('substitution')) {
        icon = 'sub';
        const playerIn = event?.player?.name || 'Player';
        const playerOut = event?.assist?.name || 'Player';
        text = `Substitution for ${team}: ${playerIn} replaces ${playerOut}.`;
      } else if (type === 'corner' || detail.includes('corner')) {
        icon = 'corner';
        text = player && player !== 'Unknown'
          ? `Corner kick — ${team} (${player})`
          : `Corner kick — ${team}`;
      } else if (type === 'foul' || detail.includes('foul') || comments.includes('foul')) {
        icon = 'foul';
        text = player && player !== 'Unknown'
          ? `Foul by ${player} (${team})`
          : `Foul — ${team}`;
      } else if (type === 'shot' || detail.includes('shot')) {
        icon = 'shot';
        if (detail.includes('on target') || detail.includes('on goal')) {
          text = player && player !== 'Unknown'
            ? `${player} (${team}) — shot on goal`
            : `Shot on goal — ${team}`;
        } else if (detail.includes('blocked')) {
          text = player && player !== 'Unknown'
            ? `${player} (${team}) — shot blocked`
            : `Shot blocked — ${team}`;
        } else if (detail.includes('off target') || detail.includes('wide')) {
          text = player && player !== 'Unknown'
            ? `${player} (${team}) — shot off target`
            : `Shot off target — ${team}`;
        } else {
          text = player && player !== 'Unknown'
            ? `${player} (${team}) — shot`
            : `Shot — ${team}`;
        }
      } else if (type === 'save' || detail.includes('save')) {
        icon = 'save';
        text = player && player !== 'Unknown'
          ? `SAVE by ${player} (${team})`
          : `Save — ${team}`;
      } else if (type === 'penalty' || detail.includes('penalty')) {
        icon = 'penalty';
        text = detail.includes('missed')
          ? `Penalty missed by ${player} (${team}).`
          : `${team} are awarded a penalty.`;
      } else if (type === 'var' || detail.includes('var')) {
        icon = 'var';
        text = `VAR check: ${event?.detail || 'decision pending'}.`;
      } else {
        icon = 'other';
        const detailText = event?.detail || event?.comments || event?.type || 'Match event';
        text = `${detailText} (${team})`;
      }

      return {
        id: `${event?.time?.elapsed || 0}-${event?.player?.id || index}-${index}`,
        time: minute,
        type: icon,
        icon,
        text,
        sortKey: (elapsed || 0) * 100 + (extra || 0),
        teamId,
        teamName: team,
        playerName: player,
      } as UiEvent;
    })
    .filter((event) => event.time);
};

export const filterKeyEvents = (events: UiEvent[]) =>
  events.filter((event) => ['goal', 'yellow', 'red', 'sub', 'var', 'corner', 'shot', 'save', 'foul', 'penalty'].includes(event.type));

export const formatMinuteLabel = toMinuteLabel;
