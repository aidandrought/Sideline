// Validation rules and API config
const PUBLIC_ENV = {
  EXPO_PUBLIC_FOOTBALL_API_KEY: process.env.EXPO_PUBLIC_FOOTBALL_API_KEY || '',
  EXPO_PUBLIC_NEWS_API_KEY: process.env.EXPO_PUBLIC_NEWS_API_KEY || '',
  EXPO_PUBLIC_EXTRACTOR_BASE_URL: process.env.EXPO_PUBLIC_EXTRACTOR_BASE_URL || '',
};

const isPrivateHostname = (hostname: string) => {
  const value = hostname.toLowerCase();
  if (!value) return false;
  if (value === 'localhost' || value === '127.0.0.1' || value === '::1') return true;
  if (/^10\./.test(value)) return true;
  if (/^192\.168\./.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
  return false;
};

const isUsablePublicUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    return !isPrivateHostname(parsed.hostname);
  } catch {
    return false;
  }
};

const getExtractorBaseUrl = () => {
  const explicit = PUBLIC_ENV.EXPO_PUBLIC_EXTRACTOR_BASE_URL;
  if (!explicit) {
    return '';
  }

  if (isUsablePublicUrl(explicit)) {
    return explicit;
  }

  if (__DEV__) {
    console.warn('[config] Ignoring non-public EXPO_PUBLIC_EXTRACTOR_BASE_URL for app runtime');
  }
  return '';
};

export const API_CONFIG = {
  FOOTBALL_API_KEY: PUBLIC_ENV.EXPO_PUBLIC_FOOTBALL_API_KEY,
  NEWS_API_KEY: PUBLIC_ENV.EXPO_PUBLIC_NEWS_API_KEY,
  FOOTBALL_API_HOST: 'api-football-v1.p.rapidapi.com',
  EXTRACTOR_BASE_URL: getExtractorBaseUrl(),
};

if (__DEV__) {
  if (!API_CONFIG.FOOTBALL_API_KEY) {
    console.warn('[config] Missing EXPO_PUBLIC_FOOTBALL_API_KEY');
  }
  if (!API_CONFIG.NEWS_API_KEY) {
    console.warn('[config] Missing EXPO_PUBLIC_NEWS_API_KEY');
  }
  console.log('[config] EXTRACTOR_BASE_URL', API_CONFIG.EXTRACTOR_BASE_URL || '(disabled)');
}
// Validation rules
export const VALIDATION = {
username: {
minLength: 3,
maxLength: 20,
pattern: /^[a-zA-Z0-9_]+$/,
message: 'Username must be 3-20 characters, letters, numbers, and underscores only'
},
password: {
minLength: 8,
pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
message: 'Password must be 8+ characters with uppercase, lowercase, number, and special character'
},
phone: {
pattern: /^\+?[1-9]\d{1,14}$/,
message: 'Please enter a valid phone number'
}
};
