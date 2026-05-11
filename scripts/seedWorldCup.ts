// scripts/seedWorldCup.ts
// Seed World Cup + national team communities + fixtures into Firestore (Admin SDK)

import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.FOOTBALL_API_KEY;
if (!API_KEY) throw new Error('FOOTBALL_API_KEY env var is required');
const WORLD_CUP_LOGO_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/2026_FIFA_World_Cup_emblem_%28with_wordmark%29.svg/512px-2026_FIFA_World_Cup_emblem_%28with_wordmark%29.svg.png';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
  throw new Error('GOOGLE_APPLICATION_CREDENTIALS must point to a Firebase service account JSON file.');
}

const resolvedPath = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.resolve(process.cwd(), serviceAccountPath);

const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

const WC2026_GROUPS: Record<string, Array<{ name: string; placeholder?: boolean }>> = {
  A: [
    { name: 'Mexico' },
    { name: 'South Africa' },
    { name: 'Korea Republic' },
    { name: 'European Play-Off D winner', placeholder: true },
  ],
  B: [
    { name: 'Canada' },
    { name: 'European Play-Off A winner', placeholder: true },
    { name: 'Qatar' },
    { name: 'Switzerland' },
  ],
  C: [
    { name: 'Brazil' },
    { name: 'Morocco' },
    { name: 'Haiti' },
    { name: 'Scotland' },
  ],
  D: [
    { name: 'United States' },
    { name: 'Paraguay' },
    { name: 'Australia' },
    { name: 'European Play-Off C winner', placeholder: true },
  ],
  E: [
    { name: 'Germany' },
    { name: 'Curaçao' },
    { name: "Côte d'Ivoire" },
    { name: 'Ecuador' },
  ],
  F: [
    { name: 'Netherlands' },
    { name: 'Japan' },
    { name: 'European Play-Off B winner', placeholder: true },
    { name: 'Tunisia' },
  ],
  G: [
    { name: 'Belgium' },
    { name: 'Egypt' },
    { name: 'IR Iran' },
    { name: 'New Zealand' },
  ],
  H: [
    { name: 'Spain' },
    { name: 'Cabo Verde' },
    { name: 'Saudi Arabia' },
    { name: 'Uruguay' },
  ],
  I: [
    { name: 'France' },
    { name: 'Senegal' },
    { name: 'FIFA Play-Off Tournament winner 2', placeholder: true },
    { name: 'Norway' },
  ],
  J: [
    { name: 'Argentina' },
    { name: 'Algeria' },
    { name: 'Austria' },
    { name: 'Jordan' },
  ],
  K: [
    { name: 'Portugal' },
    { name: 'FIFA Play-Off Tournament winner 1', placeholder: true },
    { name: 'Uzbekistan' },
    { name: 'Colombia' },
  ],
  L: [
    { name: 'England' },
    { name: 'Croatia' },
    { name: 'Ghana' },
    { name: 'Panama' },
  ],
};

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const TEAM_NAME_ALIASES: Record<string, string> = {
  'korea republic': 'south korea',
  'cabo verde': 'cape verde',
  "cote d'ivoire": 'ivory coast',
  'cote divoire': 'ivory coast',
  'ir iran': 'iran',
  'curacao': 'curacao',
  'dr congo': 'congo dr',
  'turkiye': 'turkey',
  'czechia': 'czech republic',
};

const fetchApi = async (endpoint: string) => {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'GET',
    headers: {
      'x-apisports-key': API_KEY,
    },
  });
  if (!response.ok) {
    throw new Error(`Football API error ${response.status} for ${endpoint}`);
  }
  return response.json();
};

const pickLeagueCandidate = (responses: any[], name: string) => {
  const normalized = name.toLowerCase();
  const ranked = responses
    .map((entry) => {
      const league = entry?.league;
      const seasons = entry?.seasons || [];
      if (!league?.id || !league?.name) return null;
      const lname = String(league.name).toLowerCase();
      let score = 0;
      if (lname === normalized) score += 5;
      if (lname.includes(normalized)) score += 3;
      if (String(league.country || '').toLowerCase() === 'world') score += 2;
      if (String(league.type || '').toLowerCase() === 'cup') score += 1;
      return { league, seasons, score };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score);

  return ranked[0] || null;
};

const chooseSeason = async (leagueId: number, seasons: Array<{ year: number; current?: boolean }>) => {
  if (!seasons?.length) return null;
  const current = seasons.find(s => s.current)?.year ?? Math.max(...seasons.map(s => s.year));
  const ordered = Array.from(new Set(seasons.map(s => s.year))).sort((a, b) => a - b);

  const hasFutureFixtures = async (season: number) => {
    const data = await fetchApi(`/fixtures?league=${leagueId}&season=${season}`);
    const fixtures: any[] = data?.response || [];
    const now = Date.now();
    return fixtures.some(f => {
      const kickoff = f?.fixture?.date ? new Date(f.fixture.date).getTime() : NaN;
      return Number.isFinite(kickoff) && kickoff > now;
    });
  };

  if (await hasFutureFixtures(current)) return current;

  const next = ordered.find(year => year > current);
  if (next && await hasFutureFixtures(next)) return next;

  return current;
};

const mapStatus = (short: string | null | undefined) => {
  const val = (short || '').toUpperCase();
  const liveStates = new Set(['1H', '2H', 'ET', 'HT', 'LIVE']);
  const finishedStates = new Set(['FT', 'AET', 'PEN']);
  if (finishedStates.has(val)) return 'finished';
  if (liveStates.has(val)) return 'live';
  return 'upcoming';
};

const chunk = <T>(items: T[], size: number) => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

const seed = async () => {
  const searchName = 'World Cup';
  const leaguesData = await fetchApi(`/leagues?search=${encodeURIComponent(searchName)}`);
  const responses: any[] = leaguesData?.response || [];
  if (!responses.length) {
    throw new Error('No leagues found for World Cup.');
  }

  const candidate = pickLeagueCandidate(responses, searchName);
  if (!candidate) {
    throw new Error('No suitable World Cup league found.');
  }

  const leagueId = candidate.league.id as number;
  const season = await chooseSeason(leagueId, candidate.seasons);
  if (!season) {
    throw new Error('Unable to resolve World Cup season.');
  }

  console.log(`Resolved World Cup leagueId=${leagueId} season=${season}`);

  const [teamsData, fixturesData] = await Promise.all([
    fetchApi(`/teams?league=${leagueId}&season=${season}`),
    fetchApi(`/fixtures?league=${leagueId}&season=${season}`),
  ]);

  const teams: any[] = teamsData?.response || [];
  const fixtures: any[] = fixturesData?.response || [];

  const apiTeams = teams
    .map(entry => entry?.team)
    .filter(Boolean)
    .map(team => ({
      id: team.id,
      name: team.name,
      logo: team.logo || '',
      countryCode: team.code || undefined,
    }))
    .filter(team => Number.isFinite(team.id));

  const apiTeamsByName = new Map<string, typeof apiTeams[number]>();
  apiTeams.forEach(team => {
    apiTeamsByName.set(normalizeName(team.name), team);
  });

  const resolveTeamByName = (name: string) => {
    const normalized = normalizeName(name);
    const alias = TEAM_NAME_ALIASES[normalized];
    return apiTeamsByName.get(normalized) || (alias ? apiTeamsByName.get(normalizeName(alias)) : undefined);
  };

  const groupEntries = Object.entries(WC2026_GROUPS);
  const missingGroupTeams: string[] = [];

  const groupDocs = groupEntries.map(([group, teams]) => {
    const teamEntries = teams.map(entry => {
      if (entry.placeholder) {
        return { name: entry.name, placeholder: true };
      }
      const resolved = resolveTeamByName(entry.name);
      if (!resolved) {
        missingGroupTeams.push(entry.name);
        return { name: entry.name, placeholder: true, missing: true };
      }
      return {
        name: resolved.name,
        teamId: resolved.id,
        logo: resolved.logo || '',
        code: resolved.countryCode || null,
        placeholder: false,
      };
    });
    return { group, teams: teamEntries };
  });

  const worldCupDocId = `worldcup_${leagueId}_${season}`;
  const worldCupRef = db.collection('communities').doc(worldCupDocId);
  const worldCupSnap = await worldCupRef.get();
  const worldCupMemberCount = worldCupSnap.data()?.memberCount ?? 0;

  await worldCupRef.set({
    name: candidate.league.name || 'World Cup',
    type: 'worldcup',
    leagueId,
    season,
    logo: candidate.league.logo || WORLD_CUP_LOGO_URL,
    memberCount: worldCupMemberCount,
    updatedAt: FieldValue.serverTimestamp(),
    ...(worldCupSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });

  const requiredGroupTeams = groupDocs
    .flatMap(group => group.teams)
    .filter(team => !team.placeholder && team.teamId)
    .map(team => ({
      id: team.teamId as number,
      name: team.name,
      logo: team.logo || '',
      countryCode: team.code || undefined,
    }));

  const teamMap = new Map<number, { id: number; name: string; logo: string; countryCode?: string }>();
  apiTeams.forEach(team => teamMap.set(team.id, team));
  requiredGroupTeams.forEach(team => teamMap.set(team.id, team));
  const teamWrites = Array.from(teamMap.values());

  const teamBatches = chunk(teamWrites, 450);
  let teamsWritten = 0;
  for (const batchTeams of teamBatches) {
    const batch = db.batch();
    for (const team of batchTeams) {
      const teamDocId = `team_${team.id}`;
      const teamRef = db.collection('communities').doc(teamDocId);
      const existing = await teamRef.get();
      const memberCount = existing.data()?.memberCount ?? 0;
      batch.set(teamRef, {
        name: team.name,
        type: 'team',
        isNationalTeam: true,
        teamId: team.id,
        countryCode: team.countryCode,
        logo: team.logo,
        memberCount,
        updatedAt: FieldValue.serverTimestamp(),
        ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      }, { merge: true });
    }
    await batch.commit();
    teamsWritten += batchTeams.length;
  }

  const fixtureWrites = fixtures
    .map(fixture => {
      const fixtureId = fixture?.fixture?.id;
      const kickoffRaw = fixture?.fixture?.date;
      if (!fixtureId || !kickoffRaw) return { skip: true, fixtureId } as any;
      const kickoffAt = new Date(kickoffRaw);
      if (Number.isNaN(kickoffAt.getTime())) return { skip: true, fixtureId } as any;

      const home = fixture?.teams?.home;
      const away = fixture?.teams?.away;
      return {
        fixtureId,
        kickoffAt,
        status: mapStatus(fixture?.fixture?.status?.short),
        leagueId,
        season,
        isWorldCup: true,
        homeTeam: {
          id: home?.id,
          name: home?.name,
          logo: home?.logo,
        },
        awayTeam: {
          id: away?.id,
          name: away?.name,
          logo: away?.logo,
        },
        homeCommunityId: home?.id ? `team_${home.id}` : null,
        awayCommunityId: away?.id ? `team_${away.id}` : null,
        stage: fixture?.league?.round || null,
        group: fixture?.league?.round && fixture.league.round.includes('Group')
          ? fixture.league.round.split('-')[0].trim()
          : null,
      };
    });

  const skipped = fixtureWrites.filter((f: any) => f?.skip).map((f: any) => f.fixtureId).filter(Boolean);
  const validFixtures = fixtureWrites.filter((f: any) => !f?.skip);

  const fixtureBatches = chunk(validFixtures, 450);
  let fixturesWritten = 0;
  for (const batchFixtures of fixtureBatches) {
    const batch = db.batch();
    for (const fixture of batchFixtures) {
      const matchRef = db.collection('matches').doc(`fixture_${fixture.fixtureId}`);
      batch.set(matchRef, {
        fixtureId: fixture.fixtureId,
        kickoffAt: Timestamp.fromDate(fixture.kickoffAt),
        status: fixture.status,
        leagueId: fixture.leagueId,
        season: fixture.season,
        isWorldCup: fixture.isWorldCup,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        homeCommunityId: fixture.homeCommunityId,
        awayCommunityId: fixture.awayCommunityId,
        stage: fixture.stage,
        group: fixture.group,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    fixturesWritten += batchFixtures.length;
  }

  console.log(`Teams written: ${teamsWritten}`);
  console.log(`Fixtures written: ${fixturesWritten}`);
  console.log(`Groups written: ${groupDocs.length}`);
  if (skipped.length > 0) {
    console.log(`Skipped fixtures (missing kickoff): ${skipped.length}`);
    console.log(skipped.join(', '));
  }
  if (missingGroupTeams.length > 0) {
    console.log(`Missing group teams (not found in API): ${missingGroupTeams.length}`);
    console.log(missingGroupTeams.join(', '));
  }

  const groupBatches = chunk(groupDocs, 400);
  for (const batchGroups of groupBatches) {
    const batch = db.batch();
    for (const groupDoc of batchGroups) {
      const groupRef = worldCupRef.collection('groups').doc(groupDoc.group);
      batch.set(groupRef, {
        group: groupDoc.group,
        teams: groupDoc.teams,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
