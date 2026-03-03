import { useEffect } from 'react'
import { initScoreboardBridge } from '@/scoreboard/scoreboardSender'
import { useSettingsVersion } from '@/settings/settingsStore'

export function ScoreboardBridge() {
  const settingsVersion = useSettingsVersion()

  useEffect(() => {
    return initScoreboardBridge()
  }, [settingsVersion])

  return null
}
