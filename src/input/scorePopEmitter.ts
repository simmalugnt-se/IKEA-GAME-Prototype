export type ScorePopEvent = {
  text: string
  x: number
  y: number
  burst?: boolean
}

type Listener = (event: ScorePopEvent) => void

const listeners = new Set<Listener>()

export function emitScorePop(event: ScorePopEvent): void {
  for (const listener of listeners) {
    listener(event)
  }
}

export function subscribeToScorePops(cb: Listener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
