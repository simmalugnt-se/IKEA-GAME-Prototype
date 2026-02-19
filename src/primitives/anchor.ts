import type { Vec3 } from '../GameSettings'

export type AlignPercent = number

export type Align3 = {
  x?: AlignPercent
  y?: AlignPercent
  z?: AlignPercent
}

type AnchorRatio = {
  x: number
  y: number
  z: number
}

function clampPercent(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 50
  return Math.min(100, Math.max(0, value))
}

export function getAlignRatio(align?: Align3): AnchorRatio {
  return {
    x: clampPercent(align?.x) / 100,
    y: clampPercent(align?.y) / 100,
    z: clampPercent(align?.z) / 100,
  }
}

export function getAlignOffset(size: Vec3, align?: Align3): Vec3 {
  const ratio = getAlignRatio(align)
  return [
    (0.5 - ratio.x) * size[0],
    (0.5 - ratio.y) * size[1],
    (0.5 - ratio.z) * size[2],
  ]
}
