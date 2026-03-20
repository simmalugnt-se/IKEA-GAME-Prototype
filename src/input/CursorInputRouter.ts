import { SETTINGS } from '@/settings/GameSettings'
import {
  beginExternalCursorSession,
  endExternalCursorSession,
  submitCursorSample,
  submitEmptyExternalCursorFrame as applyEmptyExternalCursorFrame,
  submitExternalCursorFrame,
  type ExternalCursorPointerSample,
} from '@/input/cursorVelocity'

function acceptsSource(source: 'mouse' | 'external'): boolean {
  return SETTINGS.cursor.inputSource === source
}

export function submitMouseCursorSample(x: number, y: number, timeMs?: number): void {
  if (!acceptsSource('mouse')) return
  submitCursorSample(x, y, timeMs)
}

export function submitExternalCursorFrameSample(
  sourceTimeMs: number,
  pointers: ReadonlyArray<ExternalCursorPointerSample>,
  pointerCount?: number,
): void {
  if (!acceptsSource('external')) return
  submitExternalCursorFrame(sourceTimeMs, pointers, pointerCount)
}

export function submitEmptyExternalCursorFrame(sourceTimeMs: number): void {
  if (!acceptsSource('external')) return
  applyEmptyExternalCursorFrame(sourceTimeMs)
}

export function beginExternalCursorInputSession(): void {
  beginExternalCursorSession()
}

export function endExternalCursorInputSession(): void {
  endExternalCursorSession()
}

export type { ExternalCursorPointerSample }
