import * as THREE from 'three'
import { useMemo, useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { Effect } from 'postprocessing'
import { Uniform } from 'three'

// --- 1. SHADER LOGIKEN ---
const fragmentShader = `
  uniform sampler2D surfaceBuffer;
  uniform sampler2D normalBuffer;
  uniform float thickness;
  uniform vec3 outlineColor;
  uniform vec2 resolution;
  uniform bool debug;
  uniform float normalThreshold;

  vec3 unpackNormal(vec4 packedNormal) {
    return packedNormal.rgb * 2.0 - 1.0;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y) * thickness;

    vec4 centerId = texture2D(surfaceBuffer, uv);
    vec3 centerNormal = unpackNormal(texture2D(normalBuffer, uv));

    if (debug) {
      outputColor = vec4(centerNormal * 0.5 + 0.5, 1.0);
      return;
    }

    vec2 offsets[8];
    offsets[0] = vec2(0.0, texel.y); offsets[1] = vec2(0.0, -texel.y);
    offsets[2] = vec2(texel.x, 0.0);  offsets[3] = vec2(-texel.x, 0.0);
    offsets[4] = vec2(texel.x, texel.y); offsets[5] = vec2(-texel.x, texel.y);
    offsets[6] = vec2(texel.x, -texel.y); offsets[7] = vec2(-texel.x, -texel.y);

    float idEdge = 0.0;
    float normalEdge = 0.0;

    for (int i = 0; i < 8; i++) {
      vec2 neighborUv = uv + offsets[i];

      vec4 neighborId = texture2D(surfaceBuffer, neighborUv);
      if (distance(centerId.rgb, neighborId.rgb) > 0.01) {
        idEdge = 1.0;
      }

      vec3 neighborNormal = unpackNormal(texture2D(normalBuffer, neighborUv));
      float dotProd = dot(centerNormal, neighborNormal);

      if (dotProd < normalThreshold) {
        normalEdge = 1.0;
      }
    }

    float finalEdge = max(idEdge, normalEdge);
    finalEdge = smoothstep(0.0, 1.0, finalEdge);

    outputColor = mix(inputColor, vec4(outlineColor, 1.0), finalEdge);
  }
`

type EffectParams = {
  thickness?: number
  outlineColor?: string
  width: number
  height: number
  debug?: boolean
  normalThreshold?: number
}

// --- 2. EFFECT KLASSEN ---
class SurfaceIdEffectImpl extends Effect {
  constructor({
    thickness = 1,
    outlineColor = '#000000',
    width,
    height,
    debug = false,
    normalThreshold = 0.86,
  }: EffectParams) {
    super('SurfaceIdEffect', fragmentShader, {
      uniforms: new Map<string, Uniform<unknown>>([
        ['surfaceBuffer', new Uniform(null)],
        ['normalBuffer', new Uniform(null)],
        ['thickness', new Uniform(thickness)],
        ['outlineColor', new Uniform(new THREE.Color(outlineColor))],
        ['resolution', new Uniform(new THREE.Vector2(width, height))],
        ['debug', new Uniform(debug)],
        ['normalThreshold', new Uniform(normalThreshold)],
      ]),
    })
  }

  update(_renderer: THREE.WebGLRenderer, inputBuffer: { width: number; height: number }) {
    const resolution = this.uniforms.get('resolution') as Uniform<THREE.Vector2> | undefined
    resolution?.value.set(inputBuffer.width, inputBuffer.height)
  }
}

type SurfaceIdEffectProps = {
  thickness?: number
  color?: string
  debug?: boolean
  creaseAngle?: number
}

type OutlineObject = THREE.Object3D & {
  isMesh?: boolean
  isLine?: boolean
  isLineSegments?: boolean
  isPoints?: boolean
  material?: THREE.Material | THREE.Material[]
}

// --- 3. REACT KOMPONENTEN ---
export function SurfaceIdEffect({
  thickness = 1.5,
  color = '#2e212f',
  debug = false,
  creaseAngle = 30,
}: SurfaceIdEffectProps) {
  const { gl, scene, camera, size, viewport } = useThree()

  const threshold = useMemo(() => Math.cos(creaseAngle * (Math.PI / 180)), [creaseAngle])

  const [idFbo, normalFbo] = useMemo(() => {
    const dpr = viewport.dpr
    const width = size.width * dpr
    const height = size.height * dpr

    const settings: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      samples: 0,
    }

    return [
      new THREE.WebGLRenderTarget(width, height, settings),
      new THREE.WebGLRenderTarget(width, height, settings),
    ]
  }, [size, viewport.dpr])

  const effect = useMemo(() => new SurfaceIdEffectImpl({
    thickness,
    outlineColor: color,
    width: size.width * viewport.dpr,
    height: size.height * viewport.dpr,
    debug,
    normalThreshold: threshold,
  }), [thickness, color, size, viewport.dpr, debug, threshold])

  const idMaterialCache = useRef<Map<number, THREE.MeshBasicMaterial>>(new Map())
  const normalMaterial = useMemo(() => new THREE.MeshNormalMaterial(), [])
  const originalMaterials = useRef<Map<string, THREE.Material | THREE.Material[]>>(new Map())

  const getIdMaterial = (colorHex: number): THREE.MeshBasicMaterial => {
    const cached = idMaterialCache.current.get(colorHex)
    if (cached) return cached
    const material = new THREE.MeshBasicMaterial({ color: colorHex })
    idMaterialCache.current.set(colorHex, material)
    return material
  }

  useFrame(() => {
    camera.updateMatrixWorld()

    // Dölj objekt som inte ska delta i outline-detektionen (t.ex. splines + debug lines)
    const hiddenObjects: OutlineObject[] = []
    scene.traverse((obj) => {
      const renderObj = obj as OutlineObject
      const shouldHide =
        (renderObj.isMesh && renderObj.userData.excludeFromOutlines) ||
        renderObj.isLine ||
        renderObj.isLineSegments ||
        renderObj.isPoints

      if (shouldHide && renderObj.visible) {
        renderObj.visible = false
        hiddenObjects.push(renderObj)
      }
    })

    // --- PASS 1: SURFACE ID ---
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh && mesh.userData.surfaceId) {
        originalMaterials.current.set(mesh.uuid, mesh.material)
        mesh.material = getIdMaterial(mesh.userData.surfaceId.getHex())
      }
    })
    gl.setRenderTarget(idFbo)
    gl.clear()
    gl.render(scene, camera)

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      const original = originalMaterials.current.get(mesh.uuid)
      if (mesh.isMesh && original) {
        mesh.material = original
      }
    })
    originalMaterials.current.clear()

    // --- PASS 2: NORMALER ---
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh && mesh.userData.surfaceId) {
        originalMaterials.current.set(mesh.uuid, mesh.material)
        mesh.material = normalMaterial
      }
    })
    gl.setRenderTarget(normalFbo)
    gl.clear()
    gl.render(scene, camera)

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      const original = originalMaterials.current.get(mesh.uuid)
      if (mesh.isMesh && original) {
        mesh.material = original
      }
    })
    originalMaterials.current.clear()

    // Återställ dolda objekt
    hiddenObjects.forEach((obj) => {
      obj.visible = true
    })

    gl.setRenderTarget(null)

    const surfaceBuffer = effect.uniforms.get('surfaceBuffer') as Uniform<THREE.Texture> | undefined
    const normalBuffer = effect.uniforms.get('normalBuffer') as Uniform<THREE.Texture> | undefined
    if (surfaceBuffer) surfaceBuffer.value = idFbo.texture
    if (normalBuffer) normalBuffer.value = normalFbo.texture
  }, 1)

  useEffect(() => {
    const scaledThickness = thickness * viewport.dpr

    const thicknessUniform = effect.uniforms.get('thickness') as Uniform<number> | undefined
    const colorUniform = effect.uniforms.get('outlineColor') as Uniform<THREE.Color> | undefined
    const debugUniform = effect.uniforms.get('debug') as Uniform<boolean> | undefined
    const thresholdUniform = effect.uniforms.get('normalThreshold') as Uniform<number> | undefined

    if (thicknessUniform) thicknessUniform.value = scaledThickness
    if (colorUniform) colorUniform.value.set(color)
    if (debugUniform) debugUniform.value = debug
    if (thresholdUniform) thresholdUniform.value = threshold
  }, [effect, thickness, color, debug, threshold, viewport.dpr])

  return <primitive object={effect} dispose={null} />
}
