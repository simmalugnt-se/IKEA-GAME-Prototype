import { useEffect } from 'react'
import { initCurrentTimeScoreboardEvents } from '@/scoreboard/currentTimeScoreboardEvents'
import { initHighScoreScoreboardEvents } from '@/scoreboard/highScoreScoreboardEvents'
import { initScoreboardBridge } from '@/scoreboard/scoreboardSender'
import { useSettingsVersion } from '@/settings/settingsStore'

export function ScoreboardBridge() {
  const settingsVersion = useSettingsVersion()

  useEffect(() => {
    const disposeScoreboardBridge = initScoreboardBridge()
    const disposeCurrentTimeEvents = initCurrentTimeScoreboardEvents()
    const disposeHighScoreEvents = initHighScoreScoreboardEvents()
    return () => {
      disposeHighScoreEvents()
      disposeCurrentTimeEvents()
      disposeScoreboardBridge()
    }
  }, [settingsVersion])

  return null
}
