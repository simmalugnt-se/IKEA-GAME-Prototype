import { SCOREBOARD_SETTINGS } from '@/scoreboard/scoreBoardSettings'

export function isScoreboardRiveDebugLoggingEnabled(): boolean {
  return SCOREBOARD_SETTINGS.debug.logRiveEvents === true
}
