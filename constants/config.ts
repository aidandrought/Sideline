// Validation Rules and API's
export const API_CONFIG = {
FOOTBALL_API_KEY: '7ee562287b3c02ee8426736fd81d032a',
FOOTBALL_API_HOST: 'api-football-v1.p.rapidapi.com',

NEWS_API_KEY: '493064cec5b34951923b1d29bda8c084',
EXTRACTOR_BASE_URL: 'http://localhost:4000',
};
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
