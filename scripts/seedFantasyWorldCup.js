/* eslint-disable no-console */
/**
 * scripts/seedFantasyWorldCup.js
 *
 * Seeds Firestore with everything needed to test the WC 2026 fantasy flow:
 *   - systemLeagues/1          → points to the fantasy league doc
 *   - fantasyLeagues/wc2026    → the global WC league
 *   - gameweeks/wc2026_1..7    → group-stage matchday deadlines
 *   - players/{id}             → 26 players × 48 teams (1,248 total)
 *
 * Top 18 teams use real squad player names. Others use realistic placeholders.
 * Prices are varied by position and team tier.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/seedFantasyWorldCup.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

// ─── Firebase init ─────────────────────────────────────────────────────────────

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
  throw new Error('GOOGLE_APPLICATION_CREDENTIALS must be set to your Firebase service-account JSON path.');
}
const resolvedPath = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.resolve(process.cwd(), serviceAccountPath);
if (!fs.existsSync(resolvedPath)) {
  throw new Error(`Service account file not found: ${resolvedPath}`);
}
const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

// ─── WC 2026 teams (groups A-L, 4 teams each = 48) ───────────────────────────

const WC_TEAMS = [
  // Group A
  { id: 22,   short: 'MEX', name: 'Mexico',           tier: 2, group: 'A' },
  { id: 2001, short: 'RSA', name: 'South Africa',     tier: 3, group: 'A' },
  { id: 2002, short: 'KOR', name: 'Korea Republic',   tier: 2, group: 'A' },
  { id: 2003, short: 'TBD', name: 'TBD (Play-Off D)', tier: 3, group: 'A' },
  // Group B
  { id: 23,   short: 'CAN', name: 'Canada',           tier: 2, group: 'B' },
  { id: 2004, short: 'TBD', name: 'TBD (Play-Off A)', tier: 3, group: 'B' },
  { id: 2005, short: 'QAT', name: 'Qatar',            tier: 3, group: 'B' },
  { id: 25,   short: 'SUI', name: 'Switzerland',      tier: 2, group: 'B' },
  // Group C
  { id: 1,    short: 'BRA', name: 'Brazil',           tier: 1, group: 'C' },
  { id: 28,   short: 'MAR', name: 'Morocco',          tier: 2, group: 'C' },
  { id: 2006, short: 'HAI', name: 'Haiti',            tier: 3, group: 'C' },
  { id: 2007, short: 'SCO', name: 'Scotland',         tier: 2, group: 'C' },
  // Group D
  { id: 21,   short: 'USA', name: 'United States',    tier: 2, group: 'D' },
  { id: 2008, short: 'PAR', name: 'Paraguay',         tier: 3, group: 'D' },
  { id: 2009, short: 'AUS', name: 'Australia',        tier: 2, group: 'D' },
  { id: 2010, short: 'TBD', name: 'TBD (Play-Off C)', tier: 3, group: 'D' },
  // Group E
  { id: 5,    short: 'GER', name: 'Germany',          tier: 1, group: 'E' },
  { id: 2011, short: 'CUR', name: 'Curaçao',          tier: 3, group: 'E' },
  { id: 2012, short: 'CIV', name: "Côte d'Ivoire",    tier: 2, group: 'E' },
  { id: 2013, short: 'ECU', name: 'Ecuador',          tier: 2, group: 'E' },
  // Group F
  { id: 26,   short: 'NED', name: 'Netherlands',      tier: 1, group: 'F' },
  { id: 2014, short: 'JPN', name: 'Japan',            tier: 2, group: 'F' },
  { id: 2015, short: 'TBD', name: 'TBD (Play-Off B)', tier: 3, group: 'F' },
  { id: 2016, short: 'TUN', name: 'Tunisia',          tier: 3, group: 'F' },
  // Group G
  { id: 4,    short: 'BEL', name: 'Belgium',          tier: 1, group: 'G' },
  { id: 2017, short: 'EGY', name: 'Egypt',            tier: 2, group: 'G' },
  { id: 2018, short: 'IRN', name: 'IR Iran',          tier: 2, group: 'G' },
  { id: 2019, short: 'NZL', name: 'New Zealand',      tier: 3, group: 'G' },
  // Group H
  { id: 9,    short: 'ESP', name: 'Spain',            tier: 1, group: 'H' },
  { id: 2020, short: 'CPV', name: 'Cabo Verde',       tier: 3, group: 'H' },
  { id: 2021, short: 'KSA', name: 'Saudi Arabia',     tier: 2, group: 'H' },
  { id: 2022, short: 'URU', name: 'Uruguay',          tier: 2, group: 'H' },
  // Group I
  { id: 2,    short: 'FRA', name: 'France',           tier: 1, group: 'I' },
  { id: 29,   short: 'SEN', name: 'Senegal',          tier: 2, group: 'I' },
  { id: 2023, short: 'TBD', name: 'TBD (Play-Off 2)', tier: 3, group: 'I' },
  { id: 2024, short: 'NOR', name: 'Norway',           tier: 2, group: 'I' },
  // Group J
  { id: 7,    short: 'ARG', name: 'Argentina',        tier: 1, group: 'J' },
  { id: 2025, short: 'ALG', name: 'Algeria',          tier: 2, group: 'J' },
  { id: 2026, short: 'AUT', name: 'Austria',          tier: 2, group: 'J' },
  { id: 2027, short: 'JOR', name: 'Jordan',           tier: 3, group: 'J' },
  // Group K
  { id: 3,    short: 'POR', name: 'Portugal',         tier: 1, group: 'K' },
  { id: 2028, short: 'TBD', name: 'TBD (Play-Off 1)', tier: 3, group: 'K' },
  { id: 2029, short: 'UZB', name: 'Uzbekistan',       tier: 3, group: 'K' },
  { id: 2030, short: 'COL', name: 'Colombia',         tier: 2, group: 'K' },
  // Group L
  { id: 6,    short: 'ENG', name: 'England',          tier: 1, group: 'L' },
  { id: 8,    short: 'CRO', name: 'Croatia',          tier: 2, group: 'L' },
  { id: 2031, short: 'GHA', name: 'Ghana',            tier: 2, group: 'L' },
  { id: 2032, short: 'PAN', name: 'Panama',           tier: 3, group: 'L' },
];

// ─── Real squad data for top 18 teams ─────────────────────────────────────────
// Format: { GK: [name, name, name], DEF: [9 names], MID: [9 names], FWD: [5 names] }
// First player in each position = highest price (star player)

const NAMED_SQUADS = {
  ENG: {
    GK:  ['Pickford', 'Ramsdale', 'Henderson D.'],
    DEF: ['Alexander-Arnold', 'Walker', 'Trippier', 'Stones', 'Maguire', 'Gomez', 'Chilwell', 'Dier', 'Colwill'],
    MID: ['Bellingham', 'Saka', 'Foden', 'Rice', 'Gallagher', 'Maddison', 'Ward-Prowse', 'Bowen', 'Mainoo'],
    FWD: ['Kane', 'Rashford', 'Watkins', 'Toney', 'Gordon'],
  },
  ARG: {
    GK:  ['E. Martínez', 'G. Rulli', 'J. Musso'],
    DEF: ['Romero', 'Otamendi', 'Tagliafico', 'Molina', 'L. Martínez', 'Montiel', 'Acuña', 'Pezzella', 'Quarta'],
    MID: ['De Paul', 'Enz. Fernández', 'Mac Allister', 'Paredes', 'Lo Celso', 'G. Rodríguez', 'Almada', 'Paz', 'Palacios'],
    FWD: ['Messi', 'L. Martínez', 'J. Álvarez', 'Dybala', 'N. González'],
  },
  FRA: {
    GK:  ['Maignan', 'Lloris', 'Samba'],
    DEF: ['T. Hernández', 'Pavard', 'Saliba', 'Upamecano', 'Koundé', 'Clauss', 'Digne', 'Konate', 'Disasi'],
    MID: ['Tchouaméni', 'Griezmann', 'Camavinga', 'Coman', 'Guendouzi', 'Zaïre-Emery', 'Fofana', 'Rabiot', 'Kanté'],
    FWD: ['Mbappé', 'Dembélé', 'M. Thuram', 'Nkunku', 'Giroud'],
  },
  BRA: {
    GK:  ['Alisson', 'Ederson', 'Weverton'],
    DEF: ['Danilo', 'Militão', 'Marquinhos', 'T. Silva', 'Alex Sandro', 'Bremer', 'R. Lodi', 'G. Magalhães', 'Arana'],
    MID: ['Casemiro', 'Rodrygo', 'L. Paquetá', 'Fred', 'Gerson', 'D. Luiz', 'A. Pereira', 'B. Guimarães', 'Endrick'],
    FWD: ['Vinícius Jr', 'Raphinha', 'G. Jesus', 'Richarlison', 'Pedro'],
  },
  ESP: {
    GK:  ['Unai Simón', 'Raya', 'Remiro'],
    DEF: ['Carvajal', 'Laporte', 'Nacho', 'Gayà', 'Marcos Llorente', 'Torres P.', 'Guillamón', 'Baena', 'Miranda'],
    MID: ['Pedri', 'Gavi', 'Busquets', 'Koke', 'Olmo', 'Fabián', 'Merino', 'Asensio', 'Lamine Yamal'],
    FWD: ['Morata', 'Oyarzabal', 'Ferran Torres', 'Pino', 'Joselu'],
  },
  GER: {
    GK:  ['Neuer', 'Flekken', 'Ter Stegen'],
    DEF: ['Rüdiger', 'Schlotterbeck', 'Tah', 'Raum', 'Klostermann', 'Süle', 'Henrichs', 'Kehrer', 'Ginter'],
    MID: ['Kimmich', 'Goretzka', 'Havertz', 'Wirtz', 'Musiala', 'Gündogan', 'Gnabry', 'Müller', 'Sanè'],
    FWD: ['Füllkrug', 'Werner', 'Adeyemi', 'Undav', 'Nmecha'],
  },
  POR: {
    GK:  ['D. Costa', 'Patrício', 'Sá'],
    DEF: ['Cancelo', 'Pepe', 'Dias', 'N. Mendes', 'Semedo', 'Dalot', 'Inácio', 'A. Silva', 'M. Carvalho'],
    MID: ['B. Fernandes', 'Bernardo', 'Palhinha', 'V. Carvalho', 'Moutinho', 'Neves', 'Joao Félix', 'Vitinha', 'Jota'],
    FWD: ['Ronaldo', 'R. Horta', 'Leão', 'Guedes', 'Gonçalves'],
  },
  NED: {
    GK:  ['Flekken', 'Bijlow', 'Verbruggen'],
    DEF: ['Dumfries', 'De Vrij', 'V. Dijk', 'De Ligt', 'Blind', 'Aké', 'Timber', 'Hateboer', 'Geertruida'],
    MID: ['F. De Jong', 'Koopmeiners', 'Reijnders', 'Simons', 'Wijnaldum', 'Schouten', 'Berghuis', 'Malen', 'Veerman'],
    FWD: ['Depay', 'Gakpo', 'Weghorst', 'Zirkzee', 'Lang'],
  },
  BEL: {
    GK:  ['Casteels', 'Mignolet', 'Kaminski'],
    DEF: ['Castagne', 'Vertonghen', 'Alderweireld', 'Theate', 'T. Hazard', 'De Cuyper', 'Faes', 'Debast', 'Mechele'],
    MID: ['De Bruyne', 'Doku', 'Trossard', 'Onana', 'De Ketelaere', 'Witsel', 'Mangala', 'Praet', 'Vanaken'],
    FWD: ['Lukaku', 'Openda', 'Benteke', 'Batshuayi', 'E. Hazard'],
  },
  USA: {
    GK:  ['Turner', 'Steffen', 'Horvath'],
    DEF: ['Dest', 'Ream', 'Richards', 'Long', 'Trusty', 'Scally', 'Tolkin', 'Carter-Vickers', 'Moore'],
    MID: ['McKennie', 'Adams T.', 'Musah', 'Reyna', 'Pulisic', 'Weah', 'Sargent', 'Acosta', 'Aaronson'],
    FWD: ['Ferreira', 'Pepi', 'Wright', 'Morris', 'Mihailovic'],
  },
  MEX: {
    GK:  ['Ochoa', 'Cota', 'Talavera'],
    DEF: ['Araújo', 'Vásquez', 'Montes', 'Gallardo', 'Moreno', 'Sánchez', 'Álvarez J.', 'Rodríguez E.', 'Reyes'],
    MID: ['Guardado', 'Herrera', 'Antuna', 'Lainez', 'Vega H.', 'Romo', 'Alvarado', 'Ponce', 'Lozano'],
    FWD: ['Jiménez', 'Martín', 'Quiñones', 'Tecatito', 'Angulo'],
  },
  CAN: {
    GK:  ['Borjan', 'Crepeau', 'St. Clair'],
    DEF: ['Johnston S.', 'Vitória', 'Adekugbe', 'Laryea', 'Bombito', 'Henry', 'Morrison', 'Miller D.', 'Campbell'],
    MID: ['Davies A.', 'Buchanan', 'Eustaquio', 'Piette', 'Hoilett', 'Millar L.', 'Ugbo', 'Ahmed I.', 'Forge'],
    FWD: ['David J.', 'Larin', 'Cavallini', 'Kofi H.', 'Hutchinson'],
  },
  MAR: {
    GK:  ['Bono', 'Munir', 'Erraji'],
    DEF: ['Hakimi', 'Saïss', 'Aguerd', 'Attiyat Allah', 'Masina', 'Dari', 'Benoun', 'El Yamiq', 'Hariss'],
    MID: ['Amrabat', 'Boufal', 'Ounahi', 'Ziyech', 'Louza', 'Aouad', 'Touzghar', 'El Khannouss', 'Bentaleb'],
    FWD: ['En-Nesyri', 'Aboukhlal', 'Ez Abde', 'Sabiri', 'Benrahma'],
  },
  JPN: {
    GK:  ['Gonda', 'Kawashima', 'Schmidt D.'],
    DEF: ['Nagatomo', 'Yoshida', 'Itakura', 'Sakai H.', 'Tanaka Ko.', 'Tomiyasu', 'Hashioka', 'Maya', 'Shiroki'],
    MID: ['Endo W.', 'Kamada', 'Kubo', 'Doan', 'Morita', 'Minamino', 'Tanaka J.', 'Mitoma', 'Soma'],
    FWD: ['Maeda', 'Asano', 'Ueda A.', 'Furuhashi', 'Ito H.'],
  },
  SEN: {
    GK:  ['Mendy E.', 'Diatta C.', 'Gomis'],
    DEF: ['Sabaly', 'Koulibaly', 'Diallo A.', 'Diallo K.', 'Mendy F.', 'Niakhaté', 'Jakobs', 'Sarr B.', 'Ciss'],
    MID: ['Gueye I.', 'Kouyaté', 'Diatta N.', 'Sarr I.', 'Ndiaye P.', 'Mendy L.', 'Touré', 'Dieng O.', 'Diedhiou A.'],
    FWD: ['Mané', 'Dia C.', 'Diatta L.', 'Niang M.', 'Jackson N.'],
  },
  NOR: {
    GK:  ['Nyland', 'Hansen R.', 'Sandberg'],
    DEF: ['Ryerson', 'Hanche-Olsen', 'Østigård', 'Pedersen M.', 'Amundsen', 'Ulstein', 'Semb', 'Reginiussen', 'Solberg E.'],
    MID: ['Ødegaard', 'Elyounoussi', 'Nusa', 'Thorstvedt', 'Berge S.', 'Solbakken', 'Bobb', 'Aursnes', 'Dahle'],
    FWD: ['Haaland', 'Sørloth', 'King J.', 'Botheim', 'Hauge J.'],
  },
  COL: {
    GK:  ['Vargas D.', 'Ospina', 'Camargo'],
    DEF: ['Muñoz D.', 'Sánchez Y.', 'Lucumí', 'Mojica', 'Machado', 'Cuesta', 'Mina Y.', 'Borja C.', 'Cañas'],
    MID: ['James', 'Cuadrado', 'Barrios W.', 'Uribe M.', 'Arias J.', 'Díaz L.', 'Castaño A.', 'Pérez G.', 'Arango'],
    FWD: ['Córdoba', 'Morelos', 'Borja M.', 'Sinisterra', 'Durán'],
  },
  CRO: {
    GK:  ['Livaković', 'Grbić I.', 'Sluga'],
    DEF: ['Juranović', 'Gvardiol', 'Lovren', 'Sosa B.', 'Šutalo', 'Stanišić', 'Erlic', 'Perić', 'Vida'],
    MID: ['Modrić', 'Kovačić', 'Brozović', 'Majer', 'Pašalić', 'Ivanušec', 'Sučić', 'Vlašić', 'Jakić'],
    FWD: ['Perišić', 'Kramarić', 'Budimir', 'Livaja', 'Oršić'],
  },
};

// ─── Generic name pools for teams without real squad data ─────────────────────
// Draws from realistic football name pools by region

const GENERIC_NAMES = {
  // South American style names
  SA: {
    GK:  ['Rodríguez G.', 'Suárez M.', 'Vargas A.'],
    DEF: ['González J.', 'Morales R.', 'Hernández C.', 'Torres L.', 'Ramírez F.', 'López D.', 'Flores A.', 'Mendoza P.', 'Vega S.'],
    MID: ['García E.', 'Martínez N.', 'Rojas K.', 'Silva W.', 'Reyes M.', 'Díaz C.', 'Castro J.', 'Ruiz F.', 'Peres L.'],
    FWD: ['Sánchez V.', 'Jiménez A.', 'Cruz R.', 'Peña E.', 'Ríos M.'],
  },
  // European style names
  EU: {
    GK:  ['Hoffmann L.', 'Berger M.', 'Andersen T.'],
    DEF: ['Nielsen J.', 'Müller P.', 'Schmidt K.', 'Weber D.', 'Fischer H.', 'Olsen A.', 'Jensen C.', 'Hansen N.', 'Larsen S.'],
    MID: ['Johansson E.', 'Eriksson M.', 'Lindqvist A.', 'Svensson J.', 'Dahl R.', 'Berg T.', 'Holm P.', 'Strand K.', 'Nygaard L.'],
    FWD: ['Petersen O.', 'Christensen B.', 'Andersen C.', 'Hansen E.', 'Olsen F.'],
  },
  // African style names
  AF: {
    GK:  ['Diallo M.', 'Traoré B.', 'Koné S.'],
    DEF: ['Camara I.', 'Touré A.', 'Konaté D.', 'Coulibaly M.', 'Diabaté F.', 'Fofana K.', 'Diarra N.', 'Sidibé O.', 'Bah L.'],
    MID: ['Cissé O.', 'Barry M.', 'Keïta S.', 'Doumbia I.', 'Sylla D.', 'Kouyaté A.', 'Dembélé F.', 'Camara B.', 'Diakité N.'],
    FWD: ['Traoré O.', 'Keïta M.', 'Coulibaly S.', 'Diallo K.', 'Touré C.'],
  },
  // Asian style names
  AS: {
    GK:  ['Park J.', 'Kim S.', 'Lee H.'],
    DEF: ['Choi M.', 'Jung D.', 'Son K.', 'Hwang S.', 'Na J.', 'Oh H.', 'Yoon T.', 'Im S.', 'Kwon D.'],
    MID: ['Han J.', 'Cho H.', 'Shin S.', 'Moon K.', 'Ahn D.', 'Jeon H.', 'Go Y.', 'Song M.', 'Yang S.'],
    FWD: ['Jeong K.', 'Bae H.', 'Lim S.', 'Kang J.', 'Yoo H.'],
  },
  // Caribbean/CONCACAF style names
  CA: {
    GK:  ['Williams R.', 'Brown A.', 'Johnson D.'],
    DEF: ['Thompson K.', 'Campbell R.', 'Edwards J.', 'Morris D.', 'Clarke A.', 'Davis M.', 'Wilson T.', 'Taylor N.', 'Jackson R.'],
    MID: ['Brown T.', 'Smith K.', 'Williams A.', 'Jones D.', 'Harris M.', 'Thomas R.', 'Moore J.', 'Martin K.', 'Lee T.'],
    FWD: ['Anderson D.', 'White R.', 'Lewis A.', 'Robinson K.', 'Allen M.'],
  },
};

// Map team short code to region pool
const REGION_MAP = {
  PAR: 'SA', AUS: 'SA', ECU: 'SA', URU: 'SA', ALG: 'AF', AUT: 'EU',
  SCO: 'EU', SUI: 'EU', CRO: 'EU', GHA: 'AF', NZL: 'CA', HAI: 'CA',
  PAN: 'CA', CUR: 'CA', KSA: 'AS', KOR: 'AS', JPN: 'AS', UZB: 'AS',
  QAT: 'AS', IRN: 'AS', TUN: 'AF', EGY: 'AF', CPV: 'AF', CIV: 'AF',
  SEN: 'AF', RSA: 'AF', MAR: 'AF', JOR: 'AS',
};

// ─── Squad template: 26 players per team ─────────────────────────────────────

const SQUAD_SLOTS = [
  ...Array(3).fill('GK'),
  ...Array(9).fill('DEF'),
  ...Array(9).fill('MID'),
  ...Array(5).fill('FWD'),
];

// Price ranges by [tier][position]: [min, max]
const PRICE_RANGE = {
  GK:  { 1: [5.5, 8.0], 2: [4.5, 6.5], 3: [4.0, 5.5] },
  DEF: { 1: [5.5, 9.0], 2: [4.5, 7.5], 3: [4.0, 6.0] },
  MID: { 1: [7.0, 13.0], 2: [5.5, 10.0], 3: [4.5, 7.5] },
  FWD: { 1: [8.0, 14.5], 2: [6.0, 11.0], 3: [5.0, 8.0] },
};

let playerIdCounter = 90001;

function getPlayerName(team, pos, n) {
  // Use real squad data if available
  const realSquad = NAMED_SQUADS[team.short];
  if (realSquad && realSquad[pos] && realSquad[pos][n - 1]) {
    return {
      name: realSquad[pos][n - 1],
      shortName: realSquad[pos][n - 1].split(' ').pop(),
    };
  }

  // Use regional generic names, cycling through the pool
  const regionKey = REGION_MAP[team.short] || 'EU';
  const pool = GENERIC_NAMES[regionKey][pos];
  const nameEntry = pool[(n - 1) % pool.length];
  // Add country prefix to distinguish players from different teams
  const fullName = `${nameEntry}`;

  return {
    name: fullName,
    shortName: nameEntry.split(' ').pop() || nameEntry,
  };
}

function generatePlayers(team) {
  const players = [];
  const posCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

  for (const pos of SQUAD_SLOTS) {
    posCounts[pos]++;
    const n = posCounts[pos];
    const [minP, maxP] = PRICE_RANGE[pos][team.tier];

    const totalForPos = SQUAD_SLOTS.filter(p => p === pos).length;
    const fraction = 1 - (n - 1) / totalForPos;
    const rawPrice = minP + (maxP - minP) * fraction;
    const price = Math.round(rawPrice * 2) / 2;

    const { name, shortName } = getPlayerName(team, pos, n);

    players.push({
      id: playerIdCounter++,
      name,
      shortName,
      position: pos,
      clubId: team.id,
      club: team.name,
      clubName: team.name,
      competitionId: 1,         // World Cup 2026
      currentPrice: price,
      totalPoints: 0,
      form: 0,
      gameweekPoints: 0,
      _stats: { appearances: 0 },
    });
  }
  return players;
}

// ─── Gameweek group-stage matchday dates ─────────────────────────────────────

const GW_SCHEDULE = [
  { n: 1, label: 'Group Stage - Matchday 1', kickoff: '2026-06-11T16:00:00Z', deadline: '2026-06-11T14:00:00Z' },
  { n: 2, label: 'Group Stage - Matchday 2', kickoff: '2026-06-15T16:00:00Z', deadline: '2026-06-15T14:00:00Z' },
  { n: 3, label: 'Group Stage - Matchday 3', kickoff: '2026-06-19T16:00:00Z', deadline: '2026-06-19T14:00:00Z' },
  { n: 4, label: 'Round of 32',              kickoff: '2026-06-28T16:00:00Z', deadline: '2026-06-28T14:00:00Z' },
  { n: 5, label: 'Round of 16',              kickoff: '2026-07-05T16:00:00Z', deadline: '2026-07-05T14:00:00Z' },
  { n: 6, label: 'Quarter-finals',           kickoff: '2026-07-11T16:00:00Z', deadline: '2026-07-11T14:00:00Z' },
  { n: 7, label: 'Semi-finals & Final',      kickoff: '2026-07-14T16:00:00Z', deadline: '2026-07-14T14:00:00Z' },
];

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const seed = async () => {
  console.log('⚽  Seeding WC 2026 fantasy data...\n');

  // 1. systemLeagues/1
  await db.collection('systemLeagues').doc('1').set({
    competitionId: 1,
    apiSeason: 2026,
    fantasyLeagueId: 'wc2026',
    rulesPreset: 'tournament',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/2026_FIFA_World_Cup_emblem_%28with_wordmark%29.svg/512px-2026_FIFA_World_Cup_emblem_%28with_wordmark%29.svg.png',
    active: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log('✅  systemLeagues/1');

  // 2. fantasyLeagues/wc2026
  const leagueSnap = await db.collection('fantasyLeagues').doc('wc2026').get();
  await db.collection('fantasyLeagues').doc('wc2026').set({
    id: 'wc2026',
    tier: 'system',
    name: 'FIFA World Cup 2026',
    description: 'The global Sideline fantasy league for FIFA World Cup 2026 — USA, Canada & Mexico.',
    emoji: '🌍',
    competitionId: 1,
    competitionPool: [1],
    visibility: 'public',
    format: 'overall',
    createdBy: 'system',
    createdAt: leagueSnap.exists ? leagueSnap.data().createdAt : FieldValue.serverTimestamp(),
    memberCount: leagueSnap.exists ? (leagueSnap.data().memberCount ?? 0) : 0,
    maxMembers: null,
    currentGameweek: 1,
    status: 'pre_season',
    rulesConfig: {
      competitionPool: [1],
      salaryCap: 100,
      maxPerClub: 3,
      transfersPerGameweek: 1,
      transferCost: 4,
      gameweekStructure: 'matchday',
      chipsEnabled: {
        wildcard: true,
        benchBoost: true,
        tripleCaptain: true,
        freeHit: true,
      },
    },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log('✅  fantasyLeagues/wc2026');

  // 3. Gameweeks
  for (const gw of GW_SCHEDULE) {
    const kickoff = new Date(gw.kickoff);
    const deadline = new Date(gw.deadline);
    await db.collection('gameweeks').doc(`wc2026_${gw.n}`).set({
      competitionGroup: 'wc2026',
      number: gw.n,
      apiRoundLabel: gw.label,
      firstFixtureKickoff: Timestamp.fromDate(kickoff),
      lastFixtureKickoff: Timestamp.fromDate(kickoff),
      deadline: Timestamp.fromDate(deadline),
      status: 'upcoming',
      fixtureIds: [],
      apiSeason: 2026,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  console.log(`✅  ${GW_SCHEDULE.length} gameweeks (wc2026_1 … wc2026_${GW_SCHEDULE.length})`);

  // 4. Players — 26 per team × 48 teams = 1,248 docs
  const namedCount = Object.keys(NAMED_SQUADS).length;
  console.log(`\n📋  Generating players (real names for ${namedCount} top teams)...`);
  let totalPlayers = 0;

  for (const team of WC_TEAMS) {
    const players = generatePlayers(team);
    const hasRealNames = !!NAMED_SQUADS[team.short];

    const batch = db.batch();
    for (const p of players) {
      const ref = db.collection('players').doc(String(p.id));
      batch.set(ref, p, { merge: true });
    }
    await batch.commit();
    totalPlayers += players.length;
    process.stdout.write(`  ${team.short} (${players.length}) ${hasRealNames ? '⭐' : '✓'}\n`);
  }

  console.log(`\n✅  ${totalPlayers} players across ${WC_TEAMS.length} teams`);
  console.log(`   ⭐ = real player names  ✓ = placeholder names`);
  console.log('\n🏁  Done! You can now:');
  console.log('    1. Open the app → Fantasy tab → BUILD SQUAD');
  console.log('    2. Tap any position slot on the pitch → player picker opens');
  console.log('    3. Build a 15-player squad and test the full flow');
};

seed().catch((err) => {
  console.error('\n❌  Seed failed:', err);
  process.exit(1);
});
