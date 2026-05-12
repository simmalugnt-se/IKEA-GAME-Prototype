export const HIGH_SCORE_ALPHABET = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ.-')

const DEFAULT_LETTER = HIGH_SCORE_ALPHABET[0] ?? 'A'

const alphabetIndexByLetter = new Map<string, number>()
for (let i = 0; i < HIGH_SCORE_ALPHABET.length; i += 1) {
  const letter = HIGH_SCORE_ALPHABET[i]
  if (!letter) continue
  alphabetIndexByLetter.set(letter, i)
}

export function sanitizeHighScoreLetter(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return DEFAULT_LETTER
  const upper = trimmed.toUpperCase()
  return alphabetIndexByLetter.has(upper)
    ? upper
    : DEFAULT_LETTER
}

export function shiftHighScoreLetter(raw: string, delta: number): string {
  const letter = sanitizeHighScoreLetter(raw)
  const currentIndex = alphabetIndexByLetter.get(letter) ?? 0
  const span = HIGH_SCORE_ALPHABET.length
  if (span <= 0) return DEFAULT_LETTER
  const normalizedDelta = Number.isFinite(delta) ? Math.trunc(delta) : 0
  const nextIndex = ((currentIndex + normalizedDelta) % span + span) % span
  return HIGH_SCORE_ALPHABET[nextIndex] ?? DEFAULT_LETTER
}

export function normalizeHighScoreInitials(raw: string, length = 3): string {
  const targetLength = Math.max(1, Math.trunc(length))
  const source = Array.from(raw.toUpperCase())
  const out = new Array<string>(targetLength)

  for (let i = 0; i < targetLength; i += 1) {
    out[i] = sanitizeHighScoreLetter(source[i] ?? DEFAULT_LETTER)
  }

  return out.join('')
}
