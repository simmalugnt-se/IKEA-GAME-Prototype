import highScoreInitialsModerationData from './highScoreInitialsModerationData.json'

const blockedHighScoreInitials = new Set(highScoreInitialsModerationData.blockedHighScoreInitials)
const fallbackHighScoreInitials = highScoreInitialsModerationData.fallbackHighScoreInitials
const moderationCharacterMap: Record<string, string> = highScoreInitialsModerationData.moderationCharacterMap

export function replaceBlockedHighScoreInitials(initials: string, rawInitials = initials): string {
  return isBlockedHighScoreInitials(initials)
    || isBlockedHighScoreInitials(rawInitials)
    ? getRandomFallbackHighScoreInitials()
    : initials
}

export function isBlockedHighScoreInitials(initials: string): boolean {
  return blockedHighScoreInitials.has(normalizeInitialsForModeration(initials))
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
