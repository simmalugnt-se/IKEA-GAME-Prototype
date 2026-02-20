import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { NoToneMapping } from 'three'
import { EffectComposer as ThreeEffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ConfigurableRenderPixelatedPass } from '@/render/postprocessing/ConfigurableRenderPixelatedPass'

type RetroPixelatedEffectsProps = {
  pixelSize: number
  normalEdgeStrength: number
  depthEdgeStrength: number
  depthEdgeThresholdMin: number
  depthEdgeThresholdMax: number
}

export function RetroPixelatedEffects({
  pixelSize,
  normalEdgeStrength,
  depthEdgeStrength,
  depthEdgeThresholdMin,
  depthEdgeThresholdMax,
}: RetroPixelatedEffectsProps) {
  const { gl, scene, camera, size } = useThree()

  const composer = useMemo(() => new ThreeEffectComposer(gl), [gl])
  const pixelPass = useMemo(
    () =>
      new ConfigurableRenderPixelatedPass(1, scene, camera, {
        normalEdgeStrength,
        depthEdgeStrength,
        depthEdgeThresholdMin,
        depthEdgeThresholdMax,
      }),
    [scene, camera]
  )
  const outputPass = useMemo(() => new OutputPass(), [])

  useEffect(() => {
    composer.addPass(pixelPass)
    composer.addPass(outputPass)

    return () => {
      composer.removePass(outputPass)
      composer.removePass(pixelPass)
      outputPass.dispose()
      pixelPass.dispose()
    }
  }, [composer, outputPass, pixelPass])

  useEffect(() => {
    return () => {
      composer.dispose()
    }
  }, [composer])

  useEffect(() => {
    const previousToneMapping = gl.toneMapping
    gl.toneMapping = NoToneMapping

    return () => {
      gl.toneMapping = previousToneMapping
    }
  }, [gl])

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio())
    composer.setSize(size.width, size.height)
  }, [composer, gl, size.width, size.height])

  useEffect(() => {
    pixelPass.setPixelSize(Math.max(1, Math.floor(pixelSize)))
    pixelPass.normalEdgeStrength = normalEdgeStrength
    pixelPass.depthEdgeStrength = depthEdgeStrength
    pixelPass.setDepthEdgeThreshold(depthEdgeThresholdMin, depthEdgeThresholdMax)
  }, [
    pixelPass,
    pixelSize,
    normalEdgeStrength,
    depthEdgeStrength,
    depthEdgeThresholdMin,
    depthEdgeThresholdMax,
  ])

  useFrame(() => {
    composer.render()
  }, 1)

  return null
}
