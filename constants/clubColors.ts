// constants/clubColors.ts
// Primary + secondary kit colors for all clubs across fantasy competitions.
// Used to render original kit SVG tiles on the pitch view.

export interface ClubColors {
  primary: string;
  secondary: string;
  text: string; // text color on kit (white or dark)
}

// Premier League clubs (id: 39)
const PREMIER_LEAGUE_CLUBS: Record<number, ClubColors> = {
  33: { primary: '#DA291C', secondary: '#FBE122', text: '#FFFFFF' },  // Manchester United
  40: { primary: '#6CABDD', secondary: '#1C2C5B', text: '#FFFFFF' },  // Manchester City
  42: { primary: '#EF0107', secondary: '#FFFFFF', text: '#FFFFFF' },  // Arsenal
  47: { primary: '#034694', secondary: '#FFFFFF', text: '#FFFFFF' },  // Chelsea
  49: { primary: '#FFFFFF', secondary: '#132257', text: '#132257' },  // Chelsea (dup — Tottenham)
  50: { primary: '#132257', secondary: '#FFFFFF', text: '#FFFFFF' },  // Tottenham
  51: { primary: '#6CABDD', secondary: '#1C2C5B', text: '#FFFFFF' },  // Brighton (Man City dup)
  52: { primary: '#003399', secondary: '#FFFFFF', text: '#FFFFFF' },  // Crystal Palace
  55: { primary: '#27251F', secondary: '#B71234', text: '#FFFFFF' },  // Brentford
  57: { primary: '#FDB913', secondary: '#1B458F', text: '#1B458F' },  // Wolverhampton
  62: { primary: '#FFCD00', secondary: '#003399', text: '#003399' },  // Watford
  63: { primary: '#EF0107', secondary: '#FFFFFF', text: '#FFFFFF' },  // Fulham
  65: { primary: '#003399', secondary: '#FFFFFF', text: '#FFFFFF' },  // Everton
  66: { primary: '#C8102E', secondary: '#00B2A9', text: '#FFFFFF' },  // Bournemouth
  67: { primary: '#E03A3E', secondary: '#FFFFFF', text: '#FFFFFF' },  // Nottm Forest
  34: { primary: '#0057B8', secondary: '#FFD700', text: '#FFFFFF' },  // Newcastle
  35: { primary: '#A6192E', secondary: '#FFFFFF', text: '#FFFFFF' },  // Ipswich
  36: { primary: '#7A263A', secondary: '#FCB514', text: '#FFFFFF' },  // Aston Villa
  39: { primary: '#00A650', secondary: '#FFFFFF', text: '#FFFFFF' },  // Leicester
  41: { primary: '#D71920', secondary: '#00A8E6', text: '#FFFFFF' },  // Southampton
  45: { primary: '#0046AD', secondary: '#FFFFFF', text: '#FFFFFF' },  // Everton
  46: { primary: '#001C58', secondary: '#C8102E', text: '#FFFFFF' },  // West Ham
  48: { primary: '#FDB913', secondary: '#1B458F', text: '#1B458F' },  // Wolves
  64: { primary: '#122F67', secondary: '#E03A3E', text: '#FFFFFF' },  // Leicester
  71: { primary: '#EF0107', secondary: '#FFFFFF', text: '#FFFFFF' },  // Sheffield United
};

// La Liga clubs (id: 140)
const LA_LIGA_CLUBS: Record<number, ClubColors> = {
  529: { primary: '#004D98', secondary: '#A50044', text: '#FFFFFF' }, // Barcelona
  541: { primary: '#FEBE10', secondary: '#FEBE10', text: '#00529F' }, // Real Madrid
  530: { primary: '#CE3524', secondary: '#FFFFFF', text: '#FFFFFF' }, // Atletico Madrid
  548: { primary: '#E03A3E', secondary: '#FCD000', text: '#FFFFFF' }, // Valencia
  538: { primary: '#004DA1', secondary: '#FFFFFF', text: '#FFFFFF' }, // Villarreal (yellow)
  532: { primary: '#FFE000', secondary: '#1D1D1B', text: '#1D1D1B' }, // Villarreal
  536: { primary: '#CF142B', secondary: '#FFFFFF', text: '#FFFFFF' }, // Sevilla
  540: { primary: '#00529F', secondary: '#FFFFFF', text: '#FFFFFF' }, // Espanyol
  546: { primary: '#004B82', secondary: '#E30D0D', text: '#FFFFFF' }, // Real Sociedad
  547: { primary: '#00529F', secondary: '#FFFFFF', text: '#FFFFFF' }, // Getafe
  533: { primary: '#D01718', secondary: '#FFFFFF', text: '#FFFFFF' }, // Real Betis
  543: { primary: '#005F31', secondary: '#FFD700', text: '#FFFFFF' }, // Real Betis
  531: { primary: '#1F3765', secondary: '#CF142B', text: '#FFFFFF' }, // Athletic Bilbao
};

// Bundesliga clubs (id: 78)
const BUNDESLIGA_CLUBS: Record<number, ClubColors> = {
  157: { primary: '#DC052D', secondary: '#0066B2', text: '#FFFFFF' }, // Bayern Munich
  165: { primary: '#FEDE00', secondary: '#000000', text: '#000000' }, // Borussia Dortmund
  168: { primary: '#E32221', secondary: '#FFFFFF', text: '#FFFFFF' }, // Bayer Leverkusen
  173: { primary: '#D30F4B', secondary: '#FFFFFF', text: '#FFFFFF' }, // RB Leipzig
  161: { primary: '#007F3E', secondary: '#FFFFFF', text: '#FFFFFF' }, // Wolfsburg
  167: { primary: '#E32221', secondary: '#FFFFFF', text: '#FFFFFF' }, // SC Freiburg
  169: { primary: '#005CA9', secondary: '#FFFFFF', text: '#FFFFFF' }, // Eintracht Frankfurt
  163: { primary: '#034694', secondary: '#FFFFFF', text: '#FFFFFF' }, // Hertha
  174: { primary: '#E8000D', secondary: '#FFFFFF', text: '#FFFFFF' }, // Mainz
  172: { primary: '#E32221', secondary: '#FFFFFF', text: '#FFFFFF' }, // Union Berlin
};

// Serie A clubs (id: 135)
const SERIE_A_CLUBS: Record<number, ClubColors> = {
  489: { primary: '#010E80', secondary: '#000000', text: '#FFFFFF' }, // Inter Milan
  496: { primary: '#AC0000', secondary: '#000000', text: '#FFFFFF' }, // AC Milan
  505: { primary: '#000000', secondary: '#FFFFFF', text: '#FFFFFF' }, // Juventus
  497: { primary: '#A66044', secondary: '#FCD000', text: '#FFFFFF' }, // Roma
  499: { primary: '#00579C', secondary: '#FFFFFF', text: '#FFFFFF' }, // Lazio
  492: { primary: '#003591', secondary: '#FFB300', text: '#FFFFFF' }, // Napoli
  500: { primary: '#562082', secondary: '#FFB612', text: '#FFFFFF' }, // Fiorentina
  494: { primary: '#1B4FA4', secondary: '#FFFFFF', text: '#FFFFFF' }, // Udinese
  488: { primary: '#0000FF', secondary: '#000000', text: '#FFFFFF' }, // Atalanta
  501: { primary: '#862633', secondary: '#FFFFFF', text: '#FFFFFF' }, // Bologna
};

// Ligue 1 clubs (id: 61)
const LIGUE_1_CLUBS: Record<number, ClubColors> = {
  85: { primary: '#004170', secondary: '#DA020E', text: '#FFFFFF' },  // Paris Saint-Germain
  80: { primary: '#DA0000', secondary: '#FFFFFF', text: '#FFFFFF' },  // Monaco
  81: { primary: '#0053A1', secondary: '#FFFFFF', text: '#FFFFFF' },  // Marseille
  93: { primary: '#C8102E', secondary: '#FFFFFF', text: '#FFFFFF' },  // Lyon
  79: { primary: '#005CA9', secondary: '#FFFFFF', text: '#FFFFFF' },  // Lille
  91: { primary: '#E0001B', secondary: '#FFC107', text: '#FFFFFF' },  // Rennes
  84: { primary: '#FFDA00', secondary: '#007A3D', text: '#007A3D' },  // Nantes
  94: { primary: '#0079C1', secondary: '#FFFFFF', text: '#FFFFFF' },  // Nice
  111: { primary: '#E03A3E', secondary: '#FFFFFF', text: '#FFFFFF' }, // Strasbourg
  112: { primary: '#003DA5', secondary: '#FFFFFF', text: '#FFFFFF' }, // Toulouse
};

// MLS clubs (id: 253)
const MLS_CLUBS: Record<number, ClubColors> = {
  1599: { primary: '#EF3E42', secondary: '#FFFFFF', text: '#FFFFFF' }, // New York Red Bulls
  1600: { primary: '#003087', secondary: '#EF3E42', text: '#FFFFFF' }, // New York City FC
  1601: { primary: '#041E42', secondary: '#C8102E', text: '#FFFFFF' }, // New England Revolution
  1602: { primary: '#003087', secondary: '#FFD700', text: '#FFFFFF' }, // Columbus Crew
  1605: { primary: '#023474', secondary: '#EF3E42', text: '#FFFFFF' }, // Atlanta United
  1608: { primary: '#C8102E', secondary: '#000000', text: '#FFFFFF' }, // Chicago Fire
  1612: { primary: '#0033A0', secondary: '#FFFFFF', text: '#FFFFFF' }, // LA Galaxy
  1617: { primary: '#CAEB0A', secondary: '#00245D', text: '#00245D' }, // Portland Timbers
  1620: { primary: '#5D9741', secondary: '#D2B150', text: '#FFFFFF' }, // Seattle Sounders
  1622: { primary: '#7CCDEF', secondary: '#E6251D', text: '#FFFFFF' }, // San Jose Earthquakes
  1625: { primary: '#003087', secondary: '#C19C00', text: '#FFFFFF' }, // FC Dallas
  1630: { primary: '#00245D', secondary: '#C8102E', text: '#FFFFFF' }, // Inter Miami
};

// UCL / Europa league club colors (id: 2, 3) - key clubs
const CONTINENTAL_CLUBS: Record<number, ClubColors> = {
  // Same clubs as domestic leagues above; extra IDs for less-known clubs
  559: { primary: '#004899', secondary: '#FFFFFF', text: '#FFFFFF' }, // Porto
  211: { primary: '#E51837', secondary: '#FFFFFF', text: '#FFFFFF' }, // Benfica
  228: { primary: '#DA291C', secondary: '#FFFFFF', text: '#FFFFFF' }, // Celtic
  235: { primary: '#005A8B', secondary: '#FFFFFF', text: '#FFFFFF' }, // Rangers
  569: { primary: '#D4002A', secondary: '#FFFFFF', text: '#FFFFFF' }, // Braga
  566: { primary: '#1C2F5A', secondary: '#C6A32B', text: '#FFFFFF' }, // Sporting CP
  554: { primary: '#003087', secondary: '#C6A32B', text: '#FFFFFF' }, // Ajax
  570: { primary: '#E63929', secondary: '#FFFFFF', text: '#FFFFFF' }, // PSV Eindhoven
  564: { primary: '#B90000', secondary: '#FFFFFF', text: '#FFFFFF' }, // Feyenoord
};

// World Cup / National teams — colors inspired by but not identical to official kits
const NATIONAL_TEAMS: Record<number, ClubColors> = {
  6:    { primary: '#F5F5F5', secondary: '#C8102E', text: '#C8102E' },   // England — white/rose-red
  2:    { primary: '#00277A', secondary: '#E8192C', text: '#FFFFFF' },   // France — deep navy/vivid red
  9:    { primary: '#C8102E', secondary: '#F0C030', text: '#FFFFFF' },   // Spain — crimson/gold
  10:   { primary: '#0D8040', secondary: '#FFFFFF', text: '#FFFFFF' },   // Italy — forest green/white
  5:    { primary: '#1A1A1A', secondary: '#F0C030', text: '#F0C030' },   // Germany — near-black/gold
  1:    { primary: '#007A32', secondary: '#F5D000', text: '#FFFFFF' },   // Brazil — deep green/yellow
  7:    { primary: '#6AAEE0', secondary: '#FFFFFF', text: '#FFFFFF' },   // Argentina — sky blue/white
  3:    { primary: '#CF0A2C', secondary: '#006600', text: '#FFFFFF' },   // Portugal — crimson/green trim
  4:    { primary: '#D52B1E', secondary: '#F0C830', text: '#FFFFFF' },   // Belgium — vivid red/gold
  8:    { primary: '#CC0000', secondary: '#FFFFFF', text: '#FFFFFF' },   // Croatia — bright red/white
  21:   { primary: '#002868', secondary: '#BF0A30', text: '#FFFFFF' },   // USA — navy/red
  22:   { primary: '#006847', secondary: '#CE1126', text: '#FFFFFF' },   // Mexico — deep green/red
  23:   { primary: '#D52B1E', secondary: '#FFFFFF', text: '#FFFFFF' },   // Canada — maple red/white
  25:   { primary: '#CE1126', secondary: '#FFFFFF', text: '#FFFFFF' },   // Switzerland — Swiss red/white
  26:   { primary: '#003580', secondary: '#F0C830', text: '#F0C830' },   // Netherlands — Dutch navy/orange-gold
  27:   { primary: '#003580', secondary: '#F0C830', text: '#F0C830' },   // Netherlands alt ID
  768:  { primary: '#005BBB', secondary: '#FFD700', text: '#FFFFFF' },   // Ukraine — blue/yellow
  29:   { primary: '#00853F', secondary: '#FFD200', text: '#FFFFFF' },   // Senegal — green/yellow
  28:   { primary: '#C1272D', secondary: '#006233', text: '#FFFFFF' },   // Morocco — red/green
  2014: { primary: '#1D3E8F', secondary: '#FFFFFF', text: '#FFFFFF' },  // Japan — deep blue/white
  2024: { primary: '#C8102E', secondary: '#FFFFFF', text: '#FFFFFF' },  // Norway — red/white
  2030: { primary: '#F9D000', secondary: '#003580', text: '#003580' },  // Colombia — yellow/navy
  // Extra WC nations
  30:   { primary: '#006233', secondary: '#FFD200', text: '#FFFFFF' },   // Saudi Arabia
  43:   { primary: '#D52B1E', secondary: '#FFFFFF', text: '#FFFFFF' },   // Ecuador
  2013: { primary: '#003DA5', secondary: '#FFFFFF', text: '#FFFFFF' },  // South Korea
  2015: { primary: '#FFFFFF', secondary: '#003DA5', text: '#003DA5' },  // Australia
};

// Merged lookup: club ID → colors
const ALL_CLUB_COLORS: Record<number, ClubColors> = {
  ...PREMIER_LEAGUE_CLUBS,
  ...LA_LIGA_CLUBS,
  ...BUNDESLIGA_CLUBS,
  ...SERIE_A_CLUBS,
  ...LIGUE_1_CLUBS,
  ...MLS_CLUBS,
  ...CONTINENTAL_CLUBS,
  ...NATIONAL_TEAMS,
};

// Fallback palette — cycle through these when a club ID is unknown
const FALLBACK_PALETTE: ClubColors[] = [
  { primary: '#10B981', secondary: '#FFFFFF', text: '#FFFFFF' },
  { primary: '#3DD9D6', secondary: '#FFFFFF', text: '#0B1220' },
  { primary: '#22C55E', secondary: '#FFFFFF', text: '#FFFFFF' },
  { primary: '#F59E0B', secondary: '#FFFFFF', text: '#FFFFFF' },
  { primary: '#8B5CF6', secondary: '#FFFFFF', text: '#FFFFFF' },
  { primary: '#EF4444', secondary: '#FFFFFF', text: '#FFFFFF' },
  { primary: '#06B6D4', secondary: '#FFFFFF', text: '#FFFFFF' },
  { primary: '#EC4899', secondary: '#FFFFFF', text: '#FFFFFF' },
];

export function getClubColors(clubId: number): ClubColors {
  return ALL_CLUB_COLORS[clubId] ?? FALLBACK_PALETTE[Math.abs(clubId) % FALLBACK_PALETTE.length];
}

export default ALL_CLUB_COLORS;
