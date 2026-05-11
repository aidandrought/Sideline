export type ModerationResult =
  | { allowed: true; cleanedText: string }
  | { allowed: false; reason: 'hate_speech'; matchedTerm: string };

// Intentionally narrow list: blocks hate slurs, allows common profanity.
// This is a baseline and should be replaced/augmented with ML moderation.
const BLOCKED_SLURS = [
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'kike',
  'spic',
  'chink',
  'gook',
  'raghead',
  'wetback',
  'tranny',
];

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const moderateChatText = (text: string): ModerationResult => {
  const cleanedText = text.trim();
  const normalized = normalize(cleanedText);

  for (const term of BLOCKED_SLURS) {
    const pattern = new RegExp(`(^|\\s)${term}(s)?(\\s|$)`, 'i');
    if (pattern.test(normalized)) {
      return { allowed: false, reason: 'hate_speech', matchedTerm: term };
    }
  }

  return { allowed: true, cleanedText };
};
