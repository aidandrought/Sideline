const normalizeFlag = (value?: string) => String(value || '').trim().toLowerCase();

const disabledValues = ['0', 'false', 'no', 'off'];
const fantasyFlag = normalizeFlag(process.env.EXPO_PUBLIC_FANTASY_ENABLED);

export const FEATURE_FLAGS = {
  // Fantasy is enabled by default; set EXPO_PUBLIC_FANTASY_ENABLED=false to hide
  fantasyEnabled: !disabledValues.includes(fantasyFlag),
};
