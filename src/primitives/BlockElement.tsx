import * as THREE from 'three'
import { forwardRef, useMemo, type ComponentPropsWithoutRef } from 'react'
import type { Vec3 } from '../GameSettings'
import type { PositionTargetHandle } from '../PositionTargetHandle'
import { CubeElement } from './CubeElement'

type CubeElementProps = ComponentPropsWithoutRef<typeof CubeElement>

type BlockSizePreset = 'lg' | 'md' | 'sm' | 'xs' | 'xxs'
type BlockHeightPreset = 'sm' | 'md' | 'lg'
type BlockPlane = 'x' | 'y' | 'z'

type BlockElementProps = Omit<CubeElementProps, 'size'> & {
  sizePreset?: BlockSizePreset
  heightPreset?: BlockHeightPreset
  plane?: BlockPlane
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

// Modulär byggkloss med måttpresets.
// Align/fysik/render hanteras av CubeElement.
export const BlockElement = forwardRef<PositionTargetHandle, BlockElementProps>(function BlockElement({
  sizePreset = 'lg',
  heightPreset = 'sm',
  plane = 'y',
  align,
  ...props
}, ref) {
  const footprint = BLOCK_FOOTPRINTS_M[sizePreset]
  const height = BLOCK_HEIGHTS_M[heightPreset]

  const finalSize = useMemo<Vec3>(() => {
    if (plane === 'x') return [height, footprint[0], footprint[1]]
    if (plane === 'z') return [footprint[0], footprint[1], height]
    return [footprint[0], height, footprint[1]]
  }, [footprint, height, plane])

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
