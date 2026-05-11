export type WorldCupTeam = {
  name: string;
  code: string;
  aliases?: string[];
};

export type WorldCupGroup = {
  group: string;
  teams: WorldCupTeam[];
};

export type WorldCupFixture = {
  id: string;
  group: string;
  home: WorldCupTeam;
  away: WorldCupTeam;
};

export const WORLD_CUP_2026_GROUPS: WorldCupGroup[] = [
  { group: 'A', teams: [{ name: 'Mexico', code: 'mx' }, { name: 'South Africa', code: 'za' }, { name: 'South Korea', code: 'kr', aliases: ['Korea Republic'] }, { name: 'Czechia', code: 'cz', aliases: ['Czech Republic'] }] },
  { group: 'B', teams: [{ name: 'Canada', code: 'ca' }, { name: 'Bosnia-Herzegovina', code: 'ba', aliases: ['Bosnia and Herzegovina'] }, { name: 'Qatar', code: 'qa' }, { name: 'Switzerland', code: 'ch' }] },
  { group: 'C', teams: [{ name: 'Brazil', code: 'br' }, { name: 'Morocco', code: 'ma' }, { name: 'Haiti', code: 'ht' }, { name: 'Scotland', code: 'gb-sct' }] },
  { group: 'D', teams: [{ name: 'United States', code: 'us', aliases: ['USA'] }, { name: 'Paraguay', code: 'py' }, { name: 'Australia', code: 'au' }, { name: 'Türkiye', code: 'tr', aliases: ['Turkey'] }] },
  { group: 'E', teams: [{ name: 'Germany', code: 'de' }, { name: 'Curacao', code: 'cw', aliases: ['Curaçao'] }, { name: 'Ivory Coast', code: 'ci', aliases: ["Cote d'Ivoire", 'Côte d’Ivoire'] }, { name: 'Ecuador', code: 'ec' }] },
  { group: 'F', teams: [{ name: 'Netherlands', code: 'nl' }, { name: 'Japan', code: 'jp' }, { name: 'Sweden', code: 'se' }, { name: 'Tunisia', code: 'tn' }] },
  { group: 'G', teams: [{ name: 'Belgium', code: 'be' }, { name: 'Egypt', code: 'eg' }, { name: 'Iran', code: 'ir', aliases: ['IR Iran'] }, { name: 'New Zealand', code: 'nz' }] },
  { group: 'H', teams: [{ name: 'Spain', code: 'es' }, { name: 'Cape Verde', code: 'cv', aliases: ['Cabo Verde'] }, { name: 'Saudi Arabia', code: 'sa' }, { name: 'Uruguay', code: 'uy' }] },
  { group: 'I', teams: [{ name: 'France', code: 'fr' }, { name: 'Senegal', code: 'sn' }, { name: 'Iraq', code: 'iq' }, { name: 'Norway', code: 'no' }] },
  { group: 'J', teams: [{ name: 'Argentina', code: 'ar' }, { name: 'Algeria', code: 'dz' }, { name: 'Austria', code: 'at' }, { name: 'Jordan', code: 'jo' }] },
  { group: 'K', teams: [{ name: 'Portugal', code: 'pt' }, { name: 'Congo DR', code: 'cd', aliases: ['DR Congo', 'Democratic Republic of Congo'] }, { name: 'Uzbekistan', code: 'uz' }, { name: 'Colombia', code: 'co' }] },
  { group: 'L', teams: [{ name: 'England', code: 'gb-eng' }, { name: 'Croatia', code: 'hr' }, { name: 'Ghana', code: 'gh' }, { name: 'Panama', code: 'pa' }] },
];

export const WORLD_CUP_2026_TEAMS = WORLD_CUP_2026_GROUPS.flatMap((group) => group.teams);

export const buildWorldCupGroupFixtures = (): WorldCupFixture[] =>
  WORLD_CUP_2026_GROUPS.flatMap((group) => {
    const [a, b, c, d] = group.teams;
    const pairings: [WorldCupTeam, WorldCupTeam][] = [
      [a, b],
      [c, d],
      [a, c],
      [d, b],
      [d, a],
      [b, c],
    ];
    return pairings.map(([home, away], index) => ({
      id: `${group.group}-${index + 1}`,
      group: group.group,
      home,
      away,
    }));
  });

export const normalizeWorldCupTeamName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
