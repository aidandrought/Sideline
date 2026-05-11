export interface CompetitionDefinition {
  id: number;
  name: string;
  country: string;
  shortName?: string;
  aliases?: string[];
}

export interface CommunityCompetitionDefinition extends CompetitionDefinition {
  minExpectedTeams: number;
}

export const CORE_LEAGUE_COMPETITIONS: CompetitionDefinition[] = [
  { id: 39, name: 'Premier League', country: 'England' },
  {
    id: 140,
    name: 'La Liga',
    country: 'Spain',
    aliases: ['Primera Division', 'Primera División', 'LaLiga', 'LaLiga EA Sports', 'LALIGA EA SPORTS'],
  },
  { id: 135, name: 'Serie A', country: 'Italy' },
  { id: 78, name: 'Bundesliga', country: 'Germany' },
  { id: 61, name: 'Ligue 1', country: 'France' },
  {
    id: 253,
    name: 'Major League Soccer',
    shortName: 'MLS',
    country: 'USA',
    aliases: ['MLS', 'MLS Soccer', 'MLS Cup', 'Major League Soccer'],
  },
  {
    id: 262,
    name: 'Liga MX',
    country: 'Mexico',
    aliases: ['Mexican League', 'Liga BBVA MX', 'LigaMX', 'Liga MX Clausura', 'Liga MX Apertura'],
  },
  {
    id: 94,
    name: 'Primeira Liga',
    country: 'Portugal',
    aliases: ['Portuguese League', 'Liga Portugal', 'Liga Portugal Betclic', 'Portuguese Primera Liga'],
  },
];

export const FEATURED_TOURNAMENT_COMPETITIONS: CompetitionDefinition[] = [
  { id: 2, name: 'UEFA Champions League', shortName: 'Champions League', country: 'Europe' },
  { id: 3, name: 'UEFA Europa League', shortName: 'Europa League', country: 'Europe' },
  // AFCON (id: 12) removed — not shown in app per product decision
  {
    id: 848,
    name: 'UEFA Europa Conference League',
    shortName: 'Conference League',
    country: 'Europe',
    aliases: ['Europa Conference League'],
  },
  { id: 45, name: 'FA Cup', country: 'England' },
  { id: 48, name: 'League Cup', shortName: 'EFL Cup', country: 'England', aliases: ['Carabao Cup'] },
  { id: 143, name: 'Copa del Rey', country: 'Spain' },
  { id: 137, name: 'Coppa Italia', country: 'Italy' },
  { id: 81, name: 'DFB Pokal', country: 'Germany', aliases: ['DFB-Pokal'] },
  { id: 66, name: 'Coupe de France', country: 'France' },
  { id: 16, name: 'CONCACAF Champions League', shortName: 'Concacaf Champions', country: 'World', aliases: ['CONCACAF Champions Cup', 'Concacaf Champions League', 'Concacaf Champions Cup'] },
  { id: 531, name: 'UEFA Super Cup', country: 'World' },
  { id: 528, name: 'Community Shield', country: 'England' },
  { id: 556, name: 'Supercopa de Espana', country: 'Spain' },
  { id: 547, name: 'Super Cup', shortName: 'Supercoppa Italiana', country: 'Italy', aliases: ['Supercoppa Italiana'] },
  { id: 1, name: 'FIFA World Cup', shortName: 'World Cup', country: 'World' },
  { id: 15, name: 'FIFA Club World Cup', shortName: 'Club World Cup', country: 'World' },
  // Note: International Friendlies (id:667) excluded — friendly matches removed from app per product decision
  {
    id: 10,
    name: 'AFC Champions League',
    shortName: 'AFC Champions',
    country: 'Asia',
    aliases: ['AFC Champions League Elite', 'AFC CL'],
  },
];

export const COMMUNITY_COMPETITION_POOLS: CommunityCompetitionDefinition[] = [
  { id: 39, name: 'Premier League', country: 'England', minExpectedTeams: 16 },
  {
    id: 140,
    name: 'La Liga',
    country: 'Spain',
    minExpectedTeams: 16,
    aliases: ['Primera Division', 'Primera División', 'LaLiga', 'LaLiga EA Sports', 'LALIGA EA SPORTS'],
  },
  { id: 135, name: 'Serie A', country: 'Italy', minExpectedTeams: 16 },
  { id: 78, name: 'Bundesliga', country: 'Germany', minExpectedTeams: 16 },
  { id: 61, name: 'Ligue 1', country: 'France', minExpectedTeams: 14 },
  { id: 253, name: 'Major League Soccer', shortName: 'MLS', country: 'USA', minExpectedTeams: 18, aliases: ['MLS'] },
  { id: 262, name: 'Liga MX', country: 'Mexico', minExpectedTeams: 18, aliases: ['Mexican League'] },
  { id: 94, name: 'Primeira Liga', country: 'Portugal', minExpectedTeams: 12, aliases: ['Portuguese League', 'Liga Portugal'] },
  { id: 143, name: 'Copa del Rey', country: 'Spain', minExpectedTeams: 12 },
  { id: 137, name: 'Coppa Italia', country: 'Italy', minExpectedTeams: 12 },
  { id: 81, name: 'DFB Pokal', country: 'Germany', minExpectedTeams: 12, aliases: ['DFB-Pokal'] },
  { id: 66, name: 'Coupe de France', country: 'France', minExpectedTeams: 12 },
  { id: 45, name: 'FA Cup', country: 'England', minExpectedTeams: 12 },
  { id: 48, name: 'League Cup', shortName: 'EFL Cup', country: 'England', minExpectedTeams: 12, aliases: ['Carabao Cup'] },
  { id: 3, name: 'UEFA Europa League', shortName: 'Europa League', country: 'Europe', minExpectedTeams: 16 },
  // AFCON removed from community pools per product decision
  {
    id: 848,
    name: 'UEFA Europa Conference League',
    shortName: 'Conference League',
    country: 'Europe',
    minExpectedTeams: 16,
    aliases: ['Europa Conference League'],
  },
  { id: 16, name: 'CONCACAF Champions League', shortName: 'Concacaf Champions', country: 'World', minExpectedTeams: 12, aliases: ['CONCACAF Champions Cup', 'Concacaf Champions Cup'] },
];

export const ALLOWED_COMPETITION_IDS = [
  ...new Set([
    ...CORE_LEAGUE_COMPETITIONS.map((competition) => competition.id),
    ...FEATURED_TOURNAMENT_COMPETITIONS.map((competition) => competition.id),
  ]),
];

export const RESULTS_COMPETITION_IDS = [
  ...new Set([
    ...CORE_LEAGUE_COMPETITIONS.map((competition) => competition.id),
    ...FEATURED_TOURNAMENT_COMPETITIONS.map((competition) => competition.id),
  ]),
];

/**
 * Virtual feed leagues that don't correspond to a single Firestore community but
 * represent grouped or abstract selections. Injected into the settings feed builder UI.
 */
export const VIRTUAL_FEED_LEAGUES: Array<{
  id: number;
  type: 'league';
  name: string;
  logo: string;
  country: string;
}> = [];

export const SPOTLIGHT_LEAGUE_NAMES = [
  'Premier League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'Champions League',
  'Europa League',
  'Conference League',
  'MLS',
  'Liga MX',
  'Primeira Liga',
  'Concacaf Champions',
];

export const POPULAR_TEAM_LEAGUE_NAMES = [
  'Premier League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'MLS',
  'Liga MX',
  'Primeira Liga',
  'Champions League',
];

export const CHAT_PRIORITY_LEAGUE_NAMES = [
  'Premier League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'MLS',
  'Liga MX',
  'Primeira Liga',
];

export const NEWS_FILTER_LEAGUES = [
  'All',
  'Premier League',
  'Champions League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'MLS',
  'Liga MX',
  'Primeira Liga',
  'Concacaf Champions',
  'FA Cup',
  'Europa League',
  'World Cup',
] as const;

export const NEWS_DISCOVERY_QUERIES = [
  'football soccer premier league champions league',
  'la liga serie a bundesliga ligue 1 football',
  'major league soccer mls liga mx primeira liga football',
  'transfer news football mls liga mx primeira liga',
];

const COMPETITION_CATALOG = [...CORE_LEAGUE_COMPETITIONS, ...FEATURED_TOURNAMENT_COMPETITIONS];

const normalizeCompetitionKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/^uefa\s+/i, '')
    .replace(/^fifa\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const competitionKeyMap = new Map<string, CompetitionDefinition>();

COMPETITION_CATALOG.forEach((competition) => {
  [competition.name, competition.shortName, ...(competition.aliases || [])]
    .filter(Boolean)
    .forEach((value) => {
      competitionKeyMap.set(normalizeCompetitionKey(value as string), competition);
    });
});

export const formatCompetitionLabel = (value?: string): string => {
  if (!value) return '';
  const normalized = normalizeCompetitionKey(value);
  const match = competitionKeyMap.get(normalized);
  if (match?.shortName) return match.shortName;
  const stripped = value
    .replace(/^UEFA\s+/i, '')
    .replace(/^FIFA\s+/i, '')
    .trim();
  if (/^Major League Soccer$/i.test(stripped)) return 'MLS';
  if (/^Europa Conference League$/i.test(stripped)) return 'Conference League';
  if (/^CONCACAF Champions( Cup| League)?$/i.test(stripped)) return 'CCL';
  if (/^Concacaf Champions(?: Cup| League)?$/i.test(stripped)) return 'CCL';
  return stripped;
};

export const getCompetitionIdByName = (value?: string): number | null => {
  if (!value) return null;
  return competitionKeyMap.get(normalizeCompetitionKey(value))?.id ?? null;
};

export const getCompetitionSearchTerms = (value?: string): string[] => {
  if (!value) return [];
  const match = competitionKeyMap.get(normalizeCompetitionKey(value));
  const base = formatCompetitionLabel(value);
  const terms = new Set<string>();
  const add = (term?: string) => {
    if (!term) return;
    const cleaned = term.trim();
    if (!cleaned) return;
    terms.add(cleaned);
  };

  if (base) {
    add(base);
    add(`${base} latest`);
    add(`${base} soccer`);
    add(`${base} football`);
    add(`${base} match news`);
  }

  add(match?.name);
  add(match?.shortName);
  (match?.aliases || []).forEach((alias) => {
    add(alias);
    add(`${alias} soccer`);
    add(`${alias} football`);
  });

  return Array.from(terms).filter(Boolean).slice(0, 14);
};
