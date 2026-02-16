import * as THREE from 'three'
import { shaderMaterial } from '@react-three/drei'
import { extend } from '@react-three/fiber'
import { SETTINGS, getLightDir } from './GameSettings'

const PALETTE = SETTINGS.palette

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
  },
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
    
    varying vec3 vWorldNormal;

    #include <common>
    #include <packing>
    #include <fog_pars_fragment>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>

    void main() {
      float NdotL = dot(vWorldNormal, uLightDir);
      float shadow = getShadowMask();
      float intensity = NdotL * shadow;
      
      vec3 color;
      
      if (intensity > uHighlightStep) {
        color = uBaseColor;
      } else if (intensity > uMidtoneStep) {
        color = uMidColor;
      } else {
        color = uShadowColor;
      }

      gl_FragColor = vec4(color, 1.0);
      
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }
  `
)

extend({ ToonShaderMaterial })

// --- Material cache ---
// Samma material-instans delas av alla meshes med samma färgkombination
const materialCache = new Map()

function getOrCreateMaterial(baseHex, midHex, shadowHex, highlightStep, midtoneStep, lightDir) {
  const key = `${baseHex}-${midHex}-${shadowHex}-${highlightStep}-${midtoneStep}`
  if (materialCache.has(key)) return materialCache.get(key)

  const mat = new ToonShaderMaterial()
  mat.lights = true
  mat.uniforms.uBaseColor.value = new THREE.Color(baseHex)
  mat.uniforms.uMidColor.value = new THREE.Color(midHex)
  mat.uniforms.uShadowColor.value = new THREE.Color(shadowHex)
  mat.uniforms.uLightDir.value = lightDir
  mat.uniforms.uHighlightStep.value = highlightStep
  mat.uniforms.uMidtoneStep.value = midtoneStep
  materialCache.set(key, mat)
  return mat
}

export function C4DMaterial({
  color,           // Palette name, e.g. "one", "two", "five"
  singleTone = false,
  // Legacy fallback: raw hex values (used if no color name)
  baseColor,
  midColor,
  shadowColor = SETTINGS.colors.shadow,
  highlightStep = SETTINGS.material.highlightStep,
  midtoneStep = SETTINGS.material.midtoneStep,
  lightDir = null,
  ...props
}) {
  const finalLightDir = lightDir || getLightDir()

  let baseHex, midHex

  if (color) {
    const entry = PALETTE[color] || PALETTE.default
    baseHex = entry.base
    midHex = singleTone ? entry.base : entry.mid
  } else if (baseColor) {
    baseHex = baseColor
    midHex = singleTone ? baseColor : (midColor || baseColor)
  } else {
    const entry = PALETTE.default
    baseHex = entry.base
    midHex = singleTone ? entry.base : entry.mid
  }

  const material = getOrCreateMaterial(baseHex, midHex, shadowColor, highlightStep, midtoneStep, finalLightDir)

  return <primitive object={material} attach="material" {...props} />
}