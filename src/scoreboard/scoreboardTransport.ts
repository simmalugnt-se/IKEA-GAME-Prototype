import { isScoreboardEvent, type ScoreboardEvent } from '@/scoreboard/scoreboardEvents'

export type ScoreboardSettingsSyncMessage = {
  type: 'scoreboard_settings_sync'
  timestamp: number
  settings: {
    ui: {
      showEventLog: boolean
    }
  }
}

export type ScoreboardTransportMessage = ScoreboardEvent | ScoreboardSettingsSyncMessage

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function isScoreboardSettingsSyncMessage(value: unknown): value is ScoreboardSettingsSyncMessage {
  if (!isRecord(value)) return false
  if (value.type !== 'scoreboard_settings_sync') return false
  if (typeof value.timestamp !== 'number') return false

  const settings = value.settings
  if (!isRecord(settings)) return false
  const ui = settings.ui
  if (!isRecord(ui)) return false

  return typeof ui.showEventLog === 'boolean'
}

export function createScoreboardSettingsSyncMessage(showEventLog: boolean): ScoreboardSettingsSyncMessage {
  return {
    type: 'scoreboard_settings_sync',
    timestamp: Date.now(),
    settings: {
      ui: {
        showEventLog: showEventLog === true,
      },
    },
  }
}

export function parseScoreboardTransportMessage(raw: string): ScoreboardTransportMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (isScoreboardEvent(parsed)) return parsed
    if (isScoreboardSettingsSyncMessage(parsed)) return parsed
    return null
  } catch {
    return null
  }
}
