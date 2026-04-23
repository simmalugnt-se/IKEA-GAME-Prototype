import { useFrame } from '@react-three/fiber'
import { useGameplayStore } from '@/gameplay/gameplayStore'

export function ContagionRuntime() {
  const flowState = useGameplayStore((state) => state.flowState)
  const paused = useGameplayStore((state) => state.paused)
  const flushContagionQueue = useGameplayStore((state) => state.flushContagionQueue)

  useFrame(() => {
    if (flowState !== 'run') return
    if (paused) return
    flushContagionQueue()
  })

  return null
}
