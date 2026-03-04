import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  activateIdleSequence,
  activateRunSequence,
  updateIdleSequenceTime,
  updateRunSequenceTime,
} from '@/audio/BackgroundMusicManager'
import { subscribeAudioUnlocked } from '@/audio/SoundManager'
import {
  getGameRunClockEpoch,
  getGameRunClockSeconds,
  subscribeGameRunClock,
} from '@/game/GameRunClock'
import { useGameplayStore } from '@/gameplay/gameplayStore'

export function GameMusicDirector(): null {
  const flowState = useGameplayStore((state) => state.flowState)
  const flowEpoch = useGameplayStore((state) => state.flowEpoch)
  const latestRunEpochRef = useRef(-1)
  const activatedRunEpochRef = useRef(Number.NEGATIVE_INFINITY)
  const activatedIdleEpochRef = useRef(Number.NEGATIVE_INFINITY)
  const idleElapsedSecRef = useRef(0)

  useEffect(() => {
    return subscribeGameRunClock((seconds, epoch, running) => {
      latestRunEpochRef.current = epoch
      if (!running) return
      if (activatedRunEpochRef.current !== latestRunEpochRef.current) {
        activatedRunEpochRef.current = latestRunEpochRef.current
        activateRunSequence(latestRunEpochRef.current)
      }
      updateRunSequenceTime(seconds)
    })
  }, [])

  useEffect(() => {
    if (flowState !== 'idle') {
      idleElapsedSecRef.current = 0
      return
    }
    if (activatedIdleEpochRef.current === flowEpoch) {
      return
    }
    activatedIdleEpochRef.current = flowEpoch
    idleElapsedSecRef.current = 0
    activateIdleSequence(flowEpoch)
    updateIdleSequenceTime(0)
  }, [flowEpoch, flowState])

  useEffect(() => {
    return subscribeAudioUnlocked(() => {
      const state = useGameplayStore.getState()
      if (state.flowState === 'run') {
        const runEpoch = getGameRunClockEpoch()
        latestRunEpochRef.current = runEpoch
        activatedRunEpochRef.current = runEpoch
        activateRunSequence(runEpoch)
        updateRunSequenceTime(getGameRunClockSeconds())
        return
      }

      if (state.flowState === 'idle') {
        activatedIdleEpochRef.current = state.flowEpoch
        activateIdleSequence(state.flowEpoch)
        updateIdleSequenceTime(idleElapsedSecRef.current)
      }
    })
  }, [])

  useFrame((_, delta) => {
    if (flowState !== 'idle') return
    if (!(delta > 0)) return
    idleElapsedSecRef.current += delta
    updateIdleSequenceTime(idleElapsedSecRef.current)
  })

  return null
}
