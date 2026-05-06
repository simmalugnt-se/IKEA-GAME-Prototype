import { isScoreboardEvent, type ScoreboardEvent } from '@/scoreboard/scoreboardEvents'

export function parseScoreboardTransportMessage(raw: string): ScoreboardEvent | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (isScoreboardEvent(parsed)) return parsed
    return null
  } catch {
    return null
  }
}
