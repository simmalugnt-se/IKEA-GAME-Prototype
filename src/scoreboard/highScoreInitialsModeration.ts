const blockedHighScoreInitials = new Set([
  'ASS',
  'BAJ',
  'CUM',
  'DIE',
  'FAN',
  'FUC',
  'FUK',
  'HOR',
  'KUK',
  'SEX',
  'SHT',
  'SUK',
  'TIT',
  'WTF',
])

const fallbackHighScoreInitials = [
  'ACE',
  'ADA',
  'BOB',
  'DEX',
  'EVA',
  'FIN',
  'GUS',
  'JAX',
  'KAI',
  'LEO',
  'MIA',
  'NIA',
  'RIO',
  'SOL',
  'UMA',
  'ZOE',
]

const moderationCharacterMap: Record<string, string> = {
  '0': 'O',
  '1': 'I',
  '3': 'E',
  '4': 'A',
  '5': 'S',
  '7': 'T',
  Å: 'A',
  Ä: 'A',
  Ö: 'O',
}

export function replaceBlockedHighScoreInitials(initials: string, rawInitials = initials): string {
  return blockedHighScoreInitials.has(normalizeInitialsForModeration(initials))
    || blockedHighScoreInitials.has(normalizeInitialsForModeration(rawInitials))
    ? getRandomFallbackHighScoreInitials()
    : initials
}

function normalizeInitialsForModeration(initials: string): string {
  return Array.from(initials.toUpperCase())
    .map((char) => moderationCharacterMap[char] ?? char)
    .join('')
    .replace(/[^A-Z]/g, '')
}

function getRandomFallbackHighScoreInitials(): string {
  return fallbackHighScoreInitials[Math.floor(Math.random() * fallbackHighScoreInitials.length)] ?? 'ACE'
}
