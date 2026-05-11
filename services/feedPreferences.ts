import type { Community } from './communityService';
import { formatCompetitionLabel, getCompetitionSearchTerms } from '../constants/footballCompetitions';
import type { Match } from './footballApi';
import type { NewsArticle } from './newsApi';

export type FeedPreferenceShape = {
  followedTeams?: string[];
  followedLeagues?: string[];
  feedTeams?: string[];
  feedLeagues?: string[];
  notificationTeams?: string[];
  notificationLeagues?: string[];
};

export type FeedSelections = {
  teams: string[];
  leagues: string[];
};

const uniqueStrings = (values: string[] = []) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const simplifyTeamName = (value: string) =>
  value
    .replace(/\b(fc|cf|sc|ac|afc|cfc)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalize = (value?: string) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildLeagueVariants = (value?: string) =>
  Array.from(
    new Set(
      [value || '', formatCompetitionLabel(value), ...getCompetitionSearchTerms(value)]
        .map((entry) => normalize(entry))
        .filter(Boolean)
    )
  );

const buildLeagueKeySet = (values: string[]) => new Set(values.flatMap((value) => buildLeagueVariants(value)));

type InternationalCompetitionFamily =
  | 'world_cup';

const getInternationalCompetitionFamily = (value?: string): InternationalCompetitionFamily | null => {
  const league = normalize(value);
  if (!league) return null;
  if (/world cup/.test(league)) return 'world_cup';
  return null;
};

export const getFavoriteSelections = (profile?: FeedPreferenceShape | null): FeedSelections => ({
  teams: uniqueStrings(profile?.followedTeams || []),
  leagues: uniqueStrings(profile?.followedLeagues || []),
});

export const getFeedSelections = (profile?: FeedPreferenceShape | null): FeedSelections => {
  const feedTeams = uniqueStrings(profile?.feedTeams || []);
  const feedLeagues = uniqueStrings(profile?.feedLeagues || []);

  return {
    teams: feedTeams,
    leagues: feedLeagues,
  };
};

export const getNotificationSelections = (profile?: FeedPreferenceShape | null): FeedSelections => {
  const feed = getFeedSelections(profile);
  const feedTeamKeys = new Set(feed.teams.map(normalize));
  const feedLeagueKeys = buildLeagueKeySet(feed.leagues);

  const notificationTeams = uniqueStrings(profile?.notificationTeams || []).filter((team) => feedTeamKeys.has(normalize(team)));
  const notificationLeagues = uniqueStrings(profile?.notificationLeagues || []).filter((league) =>
    buildLeagueVariants(league).some((variant) => feedLeagueKeys.has(variant))
  );

  return {
    teams: notificationTeams,
    leagues: notificationLeagues,
  };
};

export const clampFeedSelectionsToFavorites = (favorites: FeedSelections, nextFeed: FeedSelections): FeedSelections => {
  return {
    teams: uniqueStrings(nextFeed.teams),
    leagues: uniqueStrings(nextFeed.leagues),
  };
};

export const clampNotificationsToFeed = (feed: FeedSelections, nextNotifications: FeedSelections): FeedSelections => {
  const feedTeamKeys = new Set(feed.teams.map(normalize));
  const feedLeagueKeys = buildLeagueKeySet(feed.leagues);

  return {
    teams: uniqueStrings(nextNotifications.teams).filter((team) => feedTeamKeys.has(normalize(team))),
    leagues: uniqueStrings(nextNotifications.leagues).filter((league) =>
      buildLeagueVariants(league).some((variant) => feedLeagueKeys.has(variant))
    ),
  };
};

const matchesTeam = (name: string, teamKeys: Set<string>) => teamKeys.has(normalize(name));
const matchesLeague = (name: string, leagueKeys: Set<string>) =>
  (() => {
    const internationalFamily = getInternationalCompetitionFamily(name);
    if (internationalFamily) {
      for (const key of leagueKeys) {
        if (getInternationalCompetitionFamily(key) === internationalFamily) {
          return true;
        }
      }
      return false;
    }
    return buildLeagueVariants(name).some((variant) => leagueKeys.has(variant));
  })();

const hasFeedSelection = (selections: FeedSelections) => selections.teams.length > 0 || selections.leagues.length > 0;

export const filterMatchesForFeed = <T extends Pick<Match, 'home' | 'away' | 'league'>>(matches: T[], selections: FeedSelections) => {
  if (!hasFeedSelection(selections)) return matches;
  const teamKeys = new Set(selections.teams.map(normalize));
  const leagueKeys = buildLeagueKeySet(selections.leagues);

  return matches.filter((match) => {
    return (
      matchesTeam(match.home, teamKeys) ||
      matchesTeam(match.away, teamKeys) ||
      matchesLeague(match.league, leagueKeys)
    );
  });
};

const articleMatchesFeed = (article: NewsArticle, selections: FeedSelections) => {
  const haystack = normalize(`${article.title} ${article.description || ''} ${article.source || ''} ${article.category || ''}`);
  const teamKeys = selections.teams.map(normalize);
  const leagueKeys = selections.leagues.map(normalize);
  return teamKeys.some((term) => haystack.includes(term)) || leagueKeys.some((term) => haystack.includes(term));
};

export const sortNewsForFeed = (articles: NewsArticle[], selections: FeedSelections) => {
  if (!hasFeedSelection(selections)) return articles;
  return articles
    .slice()
    .sort((a, b) => Number(articleMatchesFeed(b, selections)) - Number(articleMatchesFeed(a, selections)));
};

export const selectNewsForFeed = (articles: NewsArticle[], selections: FeedSelections, minimumMatches: number = 3) => {
  if (!hasFeedSelection(selections)) return articles;
  const matching = articles.filter((article) => articleMatchesFeed(article, selections));
  if (matching.length >= Math.min(minimumMatches, articles.length)) {
    return matching;
  }
  return sortNewsForFeed(articles, selections);
};

export const filterCommunitiesForFeed = (communities: Community[], selections: FeedSelections) => {
  if (!hasFeedSelection(selections)) return communities;
  const teamKeys = new Set(selections.teams.map(normalize));
  const leagueKeys = buildLeagueKeySet(selections.leagues);

  return communities.filter((community) => {
    if (community.type === 'team') {
      return matchesTeam(community.name, teamKeys) || matchesLeague(community.league || '', leagueKeys);
    }
    if (community.type === 'league') {
      return matchesLeague(community.name, leagueKeys);
    }
    return false;
  });
};

export const buildNewsPreferenceQueries = (selections: FeedSelections) => {
  const queries: string[] = [];
  selections.teams.slice(0, 6).forEach((team) => {
    queries.push(`${team} football`);
    queries.push(`${team} soccer`);
    queries.push(`${team} match news`);
    const simplified = simplifyTeamName(team);
    if (simplified && simplified.toLowerCase() !== team.toLowerCase()) {
      queries.push(`${simplified} football`);
      queries.push(`${simplified} soccer`);
    }
  });
  selections.leagues.slice(0, 6).forEach((league) => {
    getCompetitionSearchTerms(league).slice(0, 5).forEach((term) => queries.push(term));
    queries.push(`${league} football`);
    queries.push(`${league} soccer`);
    queries.push(`${league} match news`);
  });
  return uniqueStrings(queries).slice(0, 10);
};
