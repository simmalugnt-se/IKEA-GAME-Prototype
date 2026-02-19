import * as THREE from 'three'
import { forwardRef, useMemo, type ComponentPropsWithoutRef } from 'react'
import type { Vec3 } from '../GameSettings'
import type { PositionTargetHandle } from '../PositionTargetHandle'
import { CubeElement } from './CubeElement'
import type { Align3 } from './anchor'

type CubeElementProps = ComponentPropsWithoutRef<typeof CubeElement>

export const BLOCK_SIZE_PRESETS = ['lg', 'md', 'sm', 'xs', 'xxs'] as const
export const BLOCK_HEIGHT_PRESETS = ['sm', 'md', 'lg'] as const
export const BLOCK_PLANES = ['x', 'y', 'z'] as const

export type BlockSizePreset = (typeof BLOCK_SIZE_PRESETS)[number]
export type BlockHeightPreset = (typeof BLOCK_HEIGHT_PRESETS)[number]
export type BlockPlane = (typeof BLOCK_PLANES)[number]

export type BlockElementProps = Omit<CubeElementProps, 'size' | 'align'> & {
  sizePreset?: BlockSizePreset
  heightPreset?: BlockHeightPreset
  plane?: BlockPlane
  align?: Align3
}

const BLOCK_FOOTPRINTS_M: Record<BlockSizePreset, [number, number]> = {
  // [x, z] i meter
  lg: [0.2, 0.2],
  md: [0.1, 0.2],
  sm: [0.05, 0.1],
  xs: [0.025, 0.05],
  xxs: [0.025, 0.025],
}

const BLOCK_HEIGHTS_M: Record<BlockHeightPreset, number> = {
  sm: 0.2,
  md: 0.4,
  lg: 0.6,
}

export function resolveBlockSize(
  sizePreset: BlockSizePreset,
  heightPreset: BlockHeightPreset,
  plane: BlockPlane,
): Vec3 {
  const footprint = BLOCK_FOOTPRINTS_M[sizePreset]
  const height = BLOCK_HEIGHTS_M[heightPreset]

  if (plane === 'x') return [height, footprint[0], footprint[1]]
  if (plane === 'z') return [footprint[0], footprint[1], height]
  return [footprint[0], height, footprint[1]]
}

// Modulär byggkloss med måttpresets.
// Align/fysik/render hanteras av CubeElement.
export const BlockElement = forwardRef<PositionTargetHandle, BlockElementProps>(function BlockElement({
  sizePreset = 'lg',
  heightPreset = 'sm',
  plane = 'y',
  align,
  ...props
}, ref) {
  const finalSize = useMemo<Vec3>(
    () => resolveBlockSize(sizePreset, heightPreset, plane),
    [sizePreset, heightPreset, plane],
  )

  const finalAlign = useMemo(() => ({
    y: 0,
    ...align,
  }), [align])

  return (
    <CubeElement
      ref={ref}
      {...props}
      size={finalSize}
      align={finalAlign}
    />
  )
})
