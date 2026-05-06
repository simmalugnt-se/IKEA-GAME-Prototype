import { useEffect } from 'react'
import { initHighScoreScoreboardEvents } from '@/scoreboard/highScoreScoreboardEvents'
import { initScoreboardBridge } from '@/scoreboard/scoreboardSender'
import { useSettingsVersion } from '@/settings/settingsStore'

export function ScoreboardBridge() {
  const settingsVersion = useSettingsVersion()

  useEffect(() => {
    const disposeScoreboardBridge = initScoreboardBridge()
    const disposeHighScoreEvents = initHighScoreScoreboardEvents()
    return () => {
      disposeHighScoreEvents()
      disposeScoreboardBridge()
    }
  }, [settingsVersion])

  return null
}
