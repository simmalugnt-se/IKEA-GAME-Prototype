import { EffectComposer, Pixelation, SMAA } from '@react-three/postprocessing'
import { SMAAPreset } from 'postprocessing'
import { SurfaceIdEffect } from './SurfaceIdEffect'
import { SETTINGS, type SMAAPresetName } from './GameSettings'
import { RetroPixelatedEffects } from './RetroPixelatedEffects'

const SMAA_PRESET_MAP: Record<SMAAPresetName, SMAAPreset> = {
  low: SMAAPreset.LOW,
  medium: SMAAPreset.MEDIUM,
  high: SMAAPreset.HIGH,
  ultra: SMAAPreset.ULTRA,
}

export function GameEffects() {
  if (SETTINGS.render.style === 'retroPixelPass') {
    return (
      <RetroPixelatedEffects
        pixelSize={SETTINGS.retroPixelPass.pixelSize}
        normalEdgeStrength={SETTINGS.retroPixelPass.normalEdgeStrength}
        depthEdgeStrength={SETTINGS.retroPixelPass.depthEdgeStrength}
      />
    )
  }

  const outlineEnabled = SETTINGS.lines.enabled
  const smaaEnabled = SETTINGS.lines.smaaEnabled
  const pixelationEnabled = SETTINGS.render.style === 'pixel' && SETTINGS.pixelation.enabled

  if (!outlineEnabled && !pixelationEnabled) return null

  const smaaPreset = SMAA_PRESET_MAP[SETTINGS.lines.smaaPreset]

  return (
    <EffectComposer autoClear={false} multisampling={SETTINGS.lines.composerMultisampling}>
      {outlineEnabled ? (
        <SurfaceIdEffect
          thickness={SETTINGS.lines.thickness}
          color={SETTINGS.colors.outline}
          creaseAngle={SETTINGS.lines.creaseAngle}
          idThreshold={SETTINGS.lines.threshold}
          debug={false}
        />
      ) : <></>}
      {outlineEnabled && smaaEnabled ? <SMAA preset={smaaPreset} /> : <></>}
      {pixelationEnabled ? <Pixelation granularity={SETTINGS.pixelation.granularity} /> : <></>}
    </EffectComposer>
  )
}
