const TEAM_PRIMARY_COLORS: Record<string, string> = {
  // Premier League
  arsenal: '#EF0107',
  'aston villa': '#670E36',
  bournemouth: '#DA291C',
  brentford: '#E30613',
  brighton: '#0057B8',
  chelsea: '#034694',
  'crystal palace': '#1B458F',
  everton: '#003399',
  fulham: '#111111',
  ipswich: '#0057B8',
  leicester: '#003090',
  liverpool: '#C8102E',
  'manchester city': '#6CABDD',
  'manchester united': '#DA291C',
  newcastle: '#241F20',
  'nottingham forest': '#DD0000',
  southampton: '#D71920',
  tottenham: '#132257',
  'west ham': '#6A1F2B',
  wolves: '#FDB913',
  'wolverhampton wanderers': '#FDB913',

  // La Liga
  'real madrid': '#F3F4F6',
  barcelona: '#A50044',
  'atletico madrid': '#C4122E',
  'athletic club': '#EE2523',
  'real sociedad': '#005BAC',
  'real betis': '#00954C',
  sevilla: '#D71920',
  valencia: '#F18F01',
  villarreal: '#FDE100',
  girona: '#CC2031',
  mallorca: '#E31E24',
  osasuna: '#B4121B',
  'celta vigo': '#7FC7FF',
  getafe: '#0057B8',
  'rayo vallecano': '#E30613',
  'las palmas': '#FFD100',
  espanyol: '#0067B1',
  alaves: '#0054A6',
  leganes: '#0057B8',
  valladolid: '#6A0DAD',

  // Serie A
  juventus: '#111111',
  'inter milan': '#0068A8',
  'ac milan': '#FB090B',
  napoli: '#008CDA',
  roma: '#9D1832',
  lazio: '#87CEEB',
  atalanta: '#005CA9',
  fiorentina: '#5B2C83',
  bologna: '#A91A2F',
  torino: '#7C1F2D',
  udinese: '#111111',
  cagliari: '#B4121B',
  empoli: '#005BAC',
  monza: '#E30613',
  genoa: '#A71930',
  lecce: '#D60A2E',
  verona: '#F0D000',
  parma: '#F8D000',
  venezia: '#008A4E',
  como: '#0057B8',
  sassuolo: '#1E8A3E',

  // MLS
  'inter miami': '#F7A3C4',
  'atlanta united': '#A71930',
  charlotte: '#1A85C8',
  'fc cincinnati': '#FC4C02',
  'columbus crew': '#FFCD00',
  'dc united': '#111111',
  nashville: '#F7E214',
  'new england revolution': '#0C2340',
  'new york city': '#6CADDF',
  'new york red bulls': '#ED1E36',
  'orlando city': '#633492',
  'philadelphia union': '#0B1F41',
  toronto: '#C8102E',
  montreal: '#0F2340',
  chicago: '#6BA4D9',
  austin: '#00B140',
  dallas: '#B22234',
  houston: '#F15A22',
  'sporting kansas city': '#7AB2E1',
  'st louis city': '#D22630',
  minnesota: '#8C8D8F',
  portland: '#004812',
  'real salt lake': '#A6192E',
  seattle: '#5D9732',
  'san jose earthquakes': '#0051BA',
  vancouver: '#002F87',
  'la galaxy': '#00245D',
  lafc: '#C39E6D',
  'los angeles fc': '#C39E6D',
  colorado: '#862633',
  'san diego': '#041E42',

  // Liga MX
  'club america': '#F7E214',
  guadalajara: '#D71920',
  monterrey: '#002B7F',
  'tigres uanl': '#FDD000',
  'cruz azul': '#0054A6',
  'pumas unam': '#0B1F41',
  toluca: '#C41230',
  pachuca: '#005BAC',
  leon: '#006847',
  'santos laguna': '#0B9444',
  necaxa: '#DA291C',
  puebla: '#005BAC',
  juarez: '#77BC1F',
  atlas: '#D71920',
  queretaro: '#0B1F41',
  tijuana: '#C8102E',
  mazatlan: '#7A1FA2',
  'atletico san luis': '#C4122E',

  // J1 League + Japan second-tier clubs that surface in cross-competition fixtures
  'yokohama f marinos': '#003B7A',
  'kashima antlers': '#B5121B',
  'kawasaki frontale': '#4CB7E8',
  'urawa red diamonds': '#E60012',
  'gamba osaka': '#005BAC',
  'cerezo osaka': '#E4007F',
  'nagoya grampus': '#D71920',
  'sanfrecce hiroshima': '#5A2D81',
  'fc tokyo': '#003B7A',
  'tokyo verdy': '#00823F',
  'vissel kobe': '#900028',
  'albirex niigata': '#F36C21',
  'kyoto sanga': '#5B2C83',
  'avispa fukuoka': '#002B5C',
  'machida zelvia': '#0052A4',
  'kashiwa reysol': '#FCD400',
  'shimizu s pulse': '#FF7F00',
  'shonan bellmare': '#73BE44',
  'fagiano okayama': '#C4122E',
  'jef united chiba': '#F0C700',
  'mito hollyhock': '#005BAC',

  // Primeira Liga
  braga: '#D71920',
  'vitoria guimaraes': '#111111',
  boavista: '#111111',
  famalicao: '#0057B8',
  estoril: '#FFD100',
  'rio ave': '#00994D',
  'casa pia': '#111111',
  nacional: '#111111',
  moreirense: '#00994D',
  'santa clara': '#C8102E',
  arouca: '#F6C700',
  farense: '#111111',

  // Bundesliga
  'bayern munich': '#DC052D',
  'borussia dortmund': '#FDE100',
  'rb leipzig': '#E30613',
  'bayer leverkusen': '#E32221',
  stuttgart: '#E30613',
  wolfsburg: '#65B32E',
  'eintracht frankfurt': '#111111',
  hoffenheim: '#005BAC',
  'werder bremen': '#008A56',
  freiburg: '#D22630',
  mainz: '#C4122E',
  'union berlin': '#D10A11',
  'borussia monchengladbach': '#111111',
  augsburg: '#BB1E10',
  bochum: '#005AA9',
  'st pauli': '#5A2D0C',
  heidenheim: '#D71920',
  'holstein kiel': '#005CA9',

  // Ligue 1
  psg: '#004170',
  'paris saint germain': '#004170',
  marseille: '#00AEEF',
  lyon: '#0055A4',
  monaco: '#E30613',
  lille: '#D71920',
  rennes: '#D71920',
  lens: '#D71920',
  nice: '#D71920',
  nantes: '#F8D800',
  montpellier: '#0057B8',
  strasbourg: '#005BAC',
  toulouse: '#5B2C83',
  reims: '#D71920',
  brest: '#D71920',
  angers: '#111111',
  'le havre': '#005BAC',
  'saint etienne': '#00994D',
  auxerre: '#0057B8',

  // Europe + cups
  galatasaray: '#A71930',
  fenerbahce: '#0033A0',
  besiktas: '#111111',
  ajax: '#D71920',
  psv: '#D71920',
  feyenoord: '#D71920',
  benfica: '#D71920',
  porto: '#005BAC',
  'sporting cp': '#00994D',
  celtic: '#00994D',
  rangers: '#0057B8',
  'club brugge': '#0057B8',
  anderlecht: '#5B2C83',
  'shakhtar donetsk': '#F18F01',
  'dynamo kyiv': '#0057B8',
  salzburg: '#D71920',
  'young boys': '#FFD100',
  olympiacos: '#D71920',
  paok: '#111111',
  'slavia prague': '#D71920',
  'sparta prague': '#8B0000',
  ferencvaros: '#00994D',
  'aek larnaca': '#F7E214',
  'aek athens': '#F7C600',
  celje: '#1EB6E8',
  'sigma olomouc': '#005BAC',
  'rakow czestochowa': '#C4122E',

  // National teams
  argentina: '#6CB4EE',
  brazil: '#F7D117',
  uruguay: '#56A7E1',
  colombia: '#FCD116',
  chile: '#D52B1E',
  peru: '#D91023',
  ecuador: '#F7D117',
  paraguay: '#D52B1E',
  venezuela: '#8A1538',
  bolivia: '#007A33',
  england: '#CF142B',
  scotland: '#005EB8',
  wales: '#D30731',
  ireland: '#169B62',
  france: '#0055A4',
  spain: '#C60B1E',
  portugal: '#006600',
  germany: '#111111',
  italy: '#009246',
  netherlands: '#F36C21',
  belgium: '#111111',
  croatia: '#C8102E',
  switzerland: '#D52B1E',
  austria: '#ED2939',
  denmark: '#C60C30',
  sweden: '#006AA7',
  norway: '#BA0C2F',
  poland: '#DC143C',
  'czech republic': '#11457E',
  slovakia: '#0B4EA2',
  hungary: '#CD2A3E',
  romania: '#FCD116',
  serbia: '#C6363C',
  slovenia: '#005DA4',
  greece: '#0D5EAF',
  turkey: '#E30A17',
  ukraine: '#0057B8',
  usa: '#3C3B6E',
  mexico: '#006847',
  canada: '#D80621',
  'costa rica': '#0038A8',
  panama: '#0057B8',
  jamaica: '#009B3A',
  honduras: '#0073CF',
  'el salvador': '#0047AB',
  guatemala: '#4997D0',
  'trinidad and tobago': '#CE1126',
  japan: '#BC002D',
  'south korea': '#CD2E3A',
  australia: '#00529B',
  qatar: '#8A1538',
  iran: '#239F40',
  iraq: '#007A3D',
  'united arab emirates': '#00732F',
  jordan: '#007A3D',
  morocco: '#C1272D',
  algeria: '#006233',
  tunisia: '#E70013',
  egypt: '#CE1126',
  nigeria: '#008753',
  senegal: '#00853F',
  cameroon: '#007A5E',
  ghana: '#CE1126',
  'ivory coast': '#F77F00',
  mali: '#14B53A',
  'south africa': '#007749',

  // European small/mid nations — WC Qualifiers & Nations League
  albania: '#E41E20',
  andorra: '#F0BC00',
  armenia: '#D90012',
  azerbaijan: '#0092BC',
  belarus: '#CF101A',
  'bosnia-herzegovina': '#003DA5',
  'bosnia herzegovina': '#003DA5',
  cyprus: '#FD7E14',
  estonia: '#003DA5',
  'faroe islands': '#003897',
  finland: '#003580',
  georgia: '#D20007',
  gibraltar: '#D52B1E',
  iceland: '#003DA5',
  israel: '#003DA5',
  kosovo: '#244AA5',
  latvia: '#9E3039',
  liechtenstein: '#002B7F',
  lithuania: '#FDB913',
  luxembourg: '#EF3340',
  malta: '#CE1126',
  moldova: '#003DA5',
  montenegro: '#D4AF37',
  'north macedonia': '#CE2028',
  'northern ireland': '#138A36',
  'republic of ireland': '#169B62',
  'san marino': '#5EB6E4',
  // Additional WC 2026 / international teams
  'new zealand': '#000000',
  'cabo verde': '#003893',
  curacao: '#002B7F',
  haiti: '#00209F',
  uzbekistan: '#1EB53A',
  'saudi arabia': '#006C35',
  indonesia: '#CE1126',
  thailand: '#A51931',
  vietnam: '#DA251D',
  'burkina faso': '#EF2B2D',
  'democratic republic of congo': '#007FFF',
  'dr congo': '#007FFF',
  zambia: '#198A00',
  namibia: '#003580',
  guinea: '#CE1126',
  kenya: '#006600',
};

const TEAM_SECONDARY_COLORS: Record<string, string> = {
  arsenal: '#FFFFFF',
  'aston villa': '#95BFE5',
  bournemouth: '#111111',
  brentford: '#111111',
  brighton: '#FFFFFF',
  chelsea: '#FFFFFF',
  'crystal palace': '#C4122E',
  everton: '#FFFFFF',
  fulham: '#FFFFFF',
  ipswich: '#FFFFFF',
  leicester: '#FFFFFF',
  liverpool: '#00B2A9',
  'manchester city': '#1C2C5B',
  'manchester united': '#FBE122',
  newcastle: '#FFFFFF',
  'nottingham forest': '#FFFFFF',
  southampton: '#FFFFFF',
  tottenham: '#FFFFFF',
  'west ham': '#57A0D3',
  wolves: '#111111',

  barcelona: '#004D98',
  'real madrid': '#C9A227',
  'atletico madrid': '#1E3A8A',
  'athletic club': '#FFFFFF',
  'real sociedad': '#FFFFFF',
  'real betis': '#FFFFFF',
  sevilla: '#FFFFFF',
  valencia: '#111111',
  villarreal: '#111111',

  juventus: '#D9D9D6',
  'inter milan': '#111111',
  'ac milan': '#111111',
  napoli: '#FFFFFF',
  roma: '#F7B500',
  lazio: '#FFFFFF',
  atalanta: '#111111',
  fiorentina: '#FFFFFF',

  'inter miami': '#111111',
  'atlanta united': '#111111',
  charlotte: '#111111',
  'fc cincinnati': '#001F5B',
  'columbus crew': '#111111',
  'dc united': '#CFD3D8',
  nashville: '#1F1646',
  'new england revolution': '#C8102E',
  'new york city': '#1C2C5B',
  'new york red bulls': '#FFFFFF',
  'orlando city': '#F6C65B',
  'philadelphia union': '#B1872C',
  toronto: '#4A4A4A',
  montreal: '#CFD3D8',
  chicago: '#D22630',
  austin: '#111111',
  dallas: '#0C2340',
  houston: '#111111',
  'sporting kansas city': '#0B1F41',
  'st louis city': '#0B1F41',
  minnesota: '#0B1F41',
  portland: '#E6D16A',
  'real salt lake': '#F6C65B',
  seattle: '#005595',
  'san jose earthquakes': '#111111',
  vancouver: '#68ACE5',
  'la galaxy': '#F6C65B',
  lafc: '#111111',
  'los angeles fc': '#111111',
  colorado: '#8BB8E8',

  'club america': '#0B1F41',
  guadalajara: '#FFFFFF',
  monterrey: '#E6EDF5',
  'tigres uanl': '#1F3C88',
  'cruz azul': '#FFFFFF',
  'pumas unam': '#C9A227',
  toluca: '#FFFFFF',
  pachuca: '#FFFFFF',

  'yokohama f marinos': '#D71920',
  'kashima antlers': '#0B1F41',
  'kawasaki frontale': '#111111',
  'urawa red diamonds': '#111111',
  'gamba osaka': '#111111',
  'cerezo osaka': '#1E2A5A',
  'nagoya grampus': '#111111',
  'sanfrecce hiroshima': '#FFFFFF',
  'fc tokyo': '#D71920',
  'vissel kobe': '#111111',

  benfica: '#111111',
  porto: '#E6EDF5',
  'sporting cp': '#FFFFFF',
  braga: '#FFFFFF',
  'vitoria guimaraes': '#FFFFFF',
  'aek larnaca': '#0F7B45',
  'aek athens': '#111111',
  celje: '#F4D21F',
  'sigma olomouc': '#FFFFFF',
  'rakow czestochowa': '#0046A8',
};

const TEAM_ALIASES: Record<string, string> = {
  // Clubs
  'man city': 'manchester city',
  'man united': 'manchester united',
  'man utd': 'manchester united',
  'paris saint germain': 'psg',
  'paris saint-germain': 'psg',
  'borussia mgladbach': 'borussia monchengladbach',
  'rbl': 'rb leipzig',
  'real betis balompie': 'real betis',
  'rcd mallorca': 'mallorca',
  'nottingham': 'nottingham forest',
  'wolverhampton': 'wolves',
  'wolverhampton wanderers': 'wolves',
  'as roma': 'roma',
  'a s roma': 'roma',
  'roma fc': 'roma',
  'vfb stuttgart': 'stuttgart',
  'vfb': 'stuttgart',
  'vfb 1893': 'stuttgart',
  'stuttgart 1893': 'stuttgart',
  'st pauli': 'st pauli',
  'st etienne': 'saint etienne',
  'olympique de marseille': 'marseille',
  'olympique lyonnais': 'lyon',
  'inter': 'inter milan',
  milan: 'ac milan',
  tor: 'torino',
  bol: 'bologna',
  bre: 'brentford',
  bvb: 'borussia dortmund',
  'west ham united': 'west ham',
  'crystal palace fc': 'crystal palace',
  'aek larnaca fc': 'aek larnaca',
  'aek larnaca 1994': 'aek larnaca',
  'aek athens fc': 'aek athens',
  'rakow': 'rakow czestochowa',
  'raków częstochowa': 'rakow czestochowa',
  'nk celje': 'celje',
  'sk sigma olomouc': 'sigma olomouc',

  // MLS
  'inter miami cf': 'inter miami',
  'inter miami fc': 'inter miami',
  'charlotte fc': 'charlotte',
  cincinnati: 'fc cincinnati',
  'nashville sc': 'nashville',
  'new york city fc': 'new york city',
  nycfc: 'new york city',
  'toronto fc': 'toronto',
  'cf montreal': 'montreal',
  'montreal impact': 'montreal',
  'chicago fire': 'chicago',
  'chicago fire fc': 'chicago',
  'austin fc': 'austin',
  'fc dallas': 'dallas',
  'houston dynamo': 'houston',
  'houston dynamo fc': 'houston',
  'sporting kc': 'sporting kansas city',
  'sporting kansas': 'sporting kansas city',
  'st louis city sc': 'st louis city',
  'minnesota united': 'minnesota',
  'minnesota united fc': 'minnesota',
  'portland timbers': 'portland',
  'seattle sounders': 'seattle',
  'seattle sounders fc': 'seattle',
  'vancouver whitecaps': 'vancouver',
  'vancouver whitecaps fc': 'vancouver',
  'la fc': 'lafc',
  'los angeles galaxy': 'la galaxy',
  'colorado rapids': 'colorado',
  'san diego fc': 'san diego',

  // Liga MX
  america: 'club america',
  'club america mexico': 'club america',
  chivas: 'guadalajara',
  'chivas guadalajara': 'guadalajara',
  tigres: 'tigres uanl',
  pumas: 'pumas unam',
  'club leon': 'leon',
  'fc juarez': 'juarez',
  'club tijuana': 'tijuana',
  'club queretaro': 'queretaro',
  'queretaro fc': 'queretaro',
  'san luis': 'atletico san luis',

  // J1 League
  'yokohama f marinos fc': 'yokohama f marinos',
  'yokohama marinos': 'yokohama f marinos',
  'urawa reds': 'urawa red diamonds',
  'fc tokyo tokyo': 'fc tokyo',
  'shimizu s-pulse': 'shimizu s pulse',
  kashima: 'kashima antlers',
  kawasaki: 'kawasaki frontale',
  cerezo: 'cerezo osaka',
  gamba: 'gamba osaka',
  nagoya: 'nagoya grampus',
  sanfrecce: 'sanfrecce hiroshima',
  'avispa': 'avispa fukuoka',
  'machida': 'machida zelvia',

  // Primeira Liga
  'sporting lisbon': 'sporting cp',
  'sporting clube de portugal': 'sporting cp',
  'fc porto': 'porto',
  'sl benfica': 'benfica',
  'sc braga': 'braga',
  'vitoria sc': 'vitoria guimaraes',
  'vitoria de guimaraes': 'vitoria guimaraes',
  'estoril praia': 'estoril',

  // National team name variations from API
  turkiye: 'turkey', // API returns "Türkiye", normalizeTeamKey strips accents → "turkiye"
  'korea republic': 'south korea',
  'republic of korea': 'south korea',
  'united states': 'usa',
  'ir iran': 'iran',
  "cote d'ivoire": 'ivory coast',
  "côte d'ivoire": 'ivory coast',
  'ivory coast': 'ivory coast',
  'cape verde': 'cabo verde',
  'cabo verde islands': 'cabo verde',
  'trinidad & tobago': 'trinidad and tobago',
  'new zealand all whites': 'new zealand',
  'costa rica': 'costa rica',

  // National team codes
  eng: 'england',
  esp: 'spain',
  ger: 'germany',
  ita: 'italy',
  fra: 'france',
  por: 'portugal',
  ned: 'netherlands',
  bel: 'belgium',
  cro: 'croatia',
  sui: 'switzerland',
  den: 'denmark',
  aut: 'austria',
  usa: 'usa',
  mex: 'mexico',
  can: 'canada',
  bra: 'brazil',
  arg: 'argentina',
  uru: 'uruguay',
  col: 'colombia',
  bolivia: 'bolivia',
  jap: 'japan',
  kor: 'south korea',
};

const DEFAULT_TINT = 'rgba(37, 99, 235, 0.45)';
const DEFAULT_PRIMARY = '#2563EB';
const DEFAULT_SECONDARY = '#101923';

const LIGHT_ALPHA = 0.88;
const DARK_ALPHA = 0.70;

const hexToRgba = (hex: string, alpha: number) => {
  const cleaned = hex.replace('#', '');
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const normalizeTeamKey = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|sc|afc|rcd|ac|as)\b/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const resolveCanonicalKey = (name: string) => {
  const normalized = normalizeTeamKey(name);
  return TEAM_ALIASES[normalized] || normalized;
};

const findTeamColor = <T>(name: string, map: Record<string, T>): T | null => {
  const canonical = resolveCanonicalKey(name);
  if (map[canonical]) return map[canonical];

  if (canonical.length <= 3) return null;

  const direct = Object.keys(map).find((key) => {
    if (canonical === key) return true;
    return canonical.startsWith(`${key} `) || key.startsWith(`${canonical} `);
  });
  return direct ? map[direct] : null;
};

export const teamPrimaryColor = (teamName?: string) => {
  if (!teamName) return DEFAULT_PRIMARY;
  const resolved = findTeamColor(teamName, TEAM_PRIMARY_COLORS);
  return resolved || DEFAULT_PRIMARY;
};

const getLuminance = (hex: string) => {
  const cleaned = hex.replace('#', '');
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  const channels = [0, 2, 4].map((index) => parseInt(normalized.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

export const teamSecondaryColor = (teamName?: string) => {
  if (!teamName) return DEFAULT_SECONDARY;
  const resolved = findTeamColor(teamName, TEAM_SECONDARY_COLORS);
  if (resolved) return resolved;
  const primary = teamPrimaryColor(teamName);
  return getLuminance(primary) > 0.62 ? '#101923' : '#E7EEF6';
};

export const teamTint = (teamName?: string, mode: 'light' | 'dark' = 'dark') => {
  if (!teamName) return mode === 'light' ? DEFAULT_TINT : 'rgba(255,255,255,0.08)';
  const primary = teamPrimaryColor(teamName);
  const alpha = mode === 'light' ? LIGHT_ALPHA : DARK_ALPHA;
  return hexToRgba(primary, alpha);
};
