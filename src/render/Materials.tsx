import * as THREE from 'three'
import { shaderMaterial } from '@react-three/drei'
import { converter, formatHex } from 'culori'
import {
  SETTINGS,
  getPaletteEntry,
  getLightDir,
  type PaletteAutoMidSettings,
  type MaterialColorIndex,
} from '@/settings/GameSettings'

const toOklch = converter('oklch')

const ToonShaderMaterial = shaderMaterial(
  {
    ...THREE.UniformsLib.lights,
    ...THREE.UniformsLib.fog,
    uBaseColor: new THREE.Color('#ffffff'),
    uMidColor: new THREE.Color('#888888'),
    uShadowColor: new THREE.Color('#000000'),
    uLightDir: new THREE.Vector3(1, 1, 1),
    uHighlightStep: 0.6,
    uMidtoneStep: 0.2,
    uCastMidtoneStep: 0.2,
    uCastShadowStep: 0.6,
  } as any,
  // --- VERTEX SHADER ---
  `
    #include <common>
    #include <fog_pars_vertex>
    #include <shadowmap_pars_vertex>
    #include <logdepthbuf_pars_vertex>
    #include <clipping_planes_pars_vertex>

    varying vec3 vWorldNormal;

    void main() {
      #include <beginnormal_vertex>
      #include <defaultnormal_vertex>
      #include <begin_vertex>
      #include <project_vertex>
      #include <logdepthbuf_vertex>
      #include <clipping_planes_vertex>
      #include <worldpos_vertex>
      #include <shadowmap_vertex>
      #include <fog_vertex>

      vWorldNormal = normalize(mat3(modelMatrix) * normal);
    }
  `,
  // --- FRAGMENT SHADER ---
  `
    uniform vec3 uBaseColor;
    uniform vec3 uMidColor;
    uniform vec3 uShadowColor;
    uniform vec3 uLightDir;
    uniform float uHighlightStep;
    uniform float uMidtoneStep;
    uniform float uCastMidtoneStep;
    uniform float uCastShadowStep;

    varying vec3 vWorldNormal;

    #include <common>
    #include <packing>
    #include <fog_pars_fragment>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>

    void main() {
      float NdotL = dot(vWorldNormal, uLightDir);
      float shadowMask = getShadowMask();
      float castOcclusion = 1.0 - shadowMask;

      float directBand = 2.0;
      if (NdotL > uHighlightStep) {
        directBand = 0.0;
      } else if (NdotL > uMidtoneStep) {
        directBand = 1.0;
      }

      float castBand = 0.0;
      if (castOcclusion > uCastShadowStep) {
        castBand = 2.0;
      } else if (castOcclusion > uCastMidtoneStep) {
        castBand = 1.0;
      }

      float finalBand = max(directBand, castBand);

      vec3 color;

      if (finalBand < 0.5) {
        color = uBaseColor;
      } else if (finalBand < 1.5) {
        color = uMidColor;
      } else {
        color = uShadowColor;
      }

      gl_FragColor = vec4(color, 1.0);

      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }
  `,
)

type ToonMaterialInstance = THREE.ShaderMaterial & {
  lights: boolean
  uniforms: {
    uBaseColor: { value: THREE.Color }
    uMidColor: { value: THREE.Color }
    uShadowColor: { value: THREE.Color }
    uLightDir: { value: THREE.Vector3 }
    uHighlightStep: { value: number }
    uMidtoneStep: { value: number }
    uCastMidtoneStep: { value: number }
    uCastShadowStep: { value: number }
  }
}

// --- Material cache ---
// Samma material-instans delas av alla meshes med samma färgkombination
const materialCache = new Map<string, ToonMaterialInstance>()
const autoMidCache = new Map<string, string>()

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeHue(hue: number): number {
  const wrapped = hue % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

function createAutoMidHex(baseHex: string, autoMid: PaletteAutoMidSettings): string {
  if (!autoMid.enabled) return baseHex

  const key = `${baseHex}-${autoMid.lightnessDelta}-${autoMid.chromaDelta}-${autoMid.hueShift}`
  const cached = autoMidCache.get(key)
  if (cached) return cached

  const source = toOklch(baseHex)
  if (!source) return baseHex

  const midHex = formatHex({
    mode: 'oklch',
    l: clamp((source.l ?? 0.5) + autoMid.lightnessDelta, 0, 1),
    c: clamp((source.c ?? 0) + autoMid.chromaDelta, 0, 0.5),
    h: normalizeHue((source.h ?? 0) + autoMid.hueShift),
  })

  autoMidCache.set(key, midHex)
  return midHex
}

function getOrCreateMaterial(
  baseHex: string,
  midHex: string,
  shadowHex: string,
  highlightStep: number,
  midtoneStep: number,
  castMidtoneStep: number,
  castShadowStep: number,
  lightDir: THREE.Vector3,
): ToonMaterialInstance {
  const key = `${baseHex}-${midHex}-${shadowHex}-${highlightStep}-${midtoneStep}-${castMidtoneStep}-${castShadowStep}`
  const cached = materialCache.get(key)
  if (cached) return cached

  const mat = new ToonShaderMaterial() as unknown as ToonMaterialInstance
  mat.lights = true
  mat.uniforms.uBaseColor.value = new THREE.Color(baseHex)
  mat.uniforms.uMidColor.value = new THREE.Color(midHex)
  mat.uniforms.uShadowColor.value = new THREE.Color(shadowHex)
  mat.uniforms.uLightDir.value = lightDir
  mat.uniforms.uHighlightStep.value = highlightStep
  mat.uniforms.uMidtoneStep.value = midtoneStep
  mat.uniforms.uCastMidtoneStep.value = castMidtoneStep
  mat.uniforms.uCastShadowStep.value = castShadowStep
  materialCache.set(key, mat)
  return mat
}

type C4DMaterialProps = {
  color?: MaterialColorIndex
  singleTone?: boolean
  baseColor?: string
  midColor?: string
  shadowColor?: string
  highlightStep?: number
  midtoneStep?: number
  castMidtoneStep?: number
  castShadowStep?: number
  lightDir?: THREE.Vector3 | null
  [key: string]: unknown
}

export function C4DMaterial({
  color,
  singleTone = false,
  baseColor,
  midColor,
  shadowColor = SETTINGS.colors.shadow,
  highlightStep = SETTINGS.material.highlightStep,
  midtoneStep = SETTINGS.material.midtoneStep,
  castMidtoneStep = SETTINGS.material.castMidtoneStep,
  castShadowStep = SETTINGS.material.castShadowStep,
  lightDir = null,
  ...props
}: C4DMaterialProps) {
  const finalLightDir = lightDir || getLightDir()
  const autoMid = SETTINGS.palette.autoMid

  let baseHex: string
  let midHex: string

  if (color !== undefined && color !== null) {
    const entry = getPaletteEntry(color)
    baseHex = entry.base
    const fallbackMid = createAutoMidHex(baseHex, autoMid)
    midHex = singleTone ? baseHex : (entry.mid || fallbackMid)
  } else if (baseColor) {
    baseHex = baseColor
    const fallbackMid = createAutoMidHex(baseHex, autoMid)
    midHex = singleTone ? baseHex : (midColor || fallbackMid)
  } else {
    const entry = getPaletteEntry(0)
    baseHex = entry.base
    const fallbackMid = createAutoMidHex(baseHex, autoMid)
    midHex = singleTone ? baseHex : (entry.mid || fallbackMid)
  }

  const material = getOrCreateMaterial(
    baseHex,
    midHex,
    shadowColor,
    highlightStep,
    midtoneStep,
    castMidtoneStep,
    castShadowStep,
    finalLightDir,
  )

  return <primitive object={material} attach="material" {...props} />
}
