import { KeyboardControls, type KeyboardControlsEntry } from '@react-three/drei'
import type { ReactNode } from 'react'

export type GameControlName = 'forward' | 'backward' | 'left' | 'right' | 'jump'

const keyboardMap: KeyboardControlsEntry<GameControlName>[] = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
]

type GameKeyboardControlsProps = {
  children: ReactNode
}

export function GameKeyboardControls({ children }: GameKeyboardControlsProps) {
  return (
    <KeyboardControls map={keyboardMap}>
      {children}
    </KeyboardControls>
  )
}
