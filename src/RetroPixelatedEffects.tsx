import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer as ThreeEffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js'

type RetroPixelatedEffectsProps = {
  pixelSize: number
  normalEdgeStrength: number
  depthEdgeStrength: number
}

export function RetroPixelatedEffects({
  pixelSize,
  normalEdgeStrength,
  depthEdgeStrength,
}: RetroPixelatedEffectsProps) {
  const { gl, scene, camera, size } = useThree()

  const composer = useMemo(() => new ThreeEffectComposer(gl), [gl])
  const pixelPass = useMemo(
    () =>
      new RenderPixelatedPass(1, scene, camera, {
        normalEdgeStrength,
        depthEdgeStrength,
      }),
    [scene, camera]
  )

  useEffect(() => {
    composer.addPass(pixelPass)

    return () => {
      composer.removePass(pixelPass)
      pixelPass.dispose()
    }
  }, [composer, pixelPass])

  useEffect(() => {
    return () => {
      composer.dispose()
    }
  }, [composer])

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio())
    composer.setSize(size.width, size.height)
  }, [composer, gl, size.width, size.height])

  useEffect(() => {
    pixelPass.setPixelSize(Math.max(1, Math.floor(pixelSize)))
    pixelPass.normalEdgeStrength = normalEdgeStrength
    pixelPass.depthEdgeStrength = depthEdgeStrength
  }, [pixelPass, pixelSize, normalEdgeStrength, depthEdgeStrength])

  useFrame(() => {
    composer.render()
  }, 1)

  return null
}
