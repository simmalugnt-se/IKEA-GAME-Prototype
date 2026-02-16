import { EffectComposer, SMAA } from '@react-three/postprocessing'
import { SurfaceIdEffect } from './SurfaceIdEffect'
import { SETTINGS } from './GameSettings'

export function GameEffects() {
  if (!SETTINGS.lines.enabled) return null

  return (
    <EffectComposer autoClear={false} multisampling={0}>
      <SurfaceIdEffect
        thickness={SETTINGS.lines.thickness}
        color={SETTINGS.colors.outline}
        creaseAngle={SETTINGS.lines.creaseAngle}
        debug={false}
      />
      <SMAA />
    </EffectComposer>
  )
}
