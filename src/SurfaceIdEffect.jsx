import * as THREE from 'three'
import React, { useMemo, useEffect, useRef } from 'react'
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
    
    // FIX: Mjuka upp kanten rejält. 0.0 till 1.0 ger en mjuk övergång
    // som tar bort det "hackiga" utseendet.
    finalEdge = smoothstep(0.0, 1.0, finalEdge);

    outputColor = mix(inputColor, vec4(outlineColor, 1.0), finalEdge);
  }
`

// --- 2. EFFECT KLASSEN ---
class SurfaceIdEffectImpl extends Effect {
  constructor({ thickness = 1, outlineColor = '#000000', width, height, debug = false, normalThreshold = 0.86 }) {
    super('SurfaceIdEffect', fragmentShader, {
      uniforms: new Map([
        ['surfaceBuffer', new Uniform(null)],
        ['normalBuffer', new Uniform(null)],
        ['thickness', new Uniform(thickness)],
        ['outlineColor', new Uniform(new THREE.Color(outlineColor))],
        ['resolution', new Uniform(new THREE.Vector2(width, height))],
        ['debug', new Uniform(debug)],
        ['normalThreshold', new Uniform(normalThreshold)]
      ])
    })
  }
  update(renderer, inputBuffer, deltaTime) {
    this.uniforms.get('resolution').value.set(inputBuffer.width, inputBuffer.height)
  }
}

// --- 3. REACT KOMPONENTEN ---
export const SurfaceIdEffect = ({ thickness = 1.5, color = '#2e212f', debug = false, creaseAngle = 30 }) => {
  const { gl, scene, camera, size, viewport } = useThree()

  const threshold = useMemo(() => Math.cos(creaseAngle * (Math.PI / 180)), [creaseAngle])

  const [idFbo, normalFbo] = useMemo(() => {
    const dpr = viewport.dpr
    const width = size.width * dpr
    const height = size.height * dpr

    const settings = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      samples: 0
    }

    return [
      new THREE.WebGLRenderTarget(width, height, settings),
      new THREE.WebGLRenderTarget(width, height, settings)
    ]
  }, [size, viewport.dpr])

  const effect = useMemo(() => new SurfaceIdEffectImpl({
    thickness,
    outlineColor: color,
    width: size.width * viewport.dpr,
    height: size.height * viewport.dpr,
    debug,
    normalThreshold: threshold
  }), [thickness, color, size, viewport.dpr, debug, threshold])

  const idMaterialCache = useRef(new Map())
  const normalMaterial = useMemo(() => new THREE.MeshNormalMaterial(), [])
  const originalMaterials = useRef(new Map())

  const getIdMaterial = (colorHex) => {
    if (!idMaterialCache.current.has(colorHex)) {
      idMaterialCache.current.set(colorHex, new THREE.MeshBasicMaterial({ color: colorHex }))
    }
    return idMaterialCache.current.get(colorHex)
  }

  useFrame(() => {
    camera.updateMatrixWorld()
    const oldBg = scene.background
    scene.background = null

    // Dölj objekt som inte ska delta i outline-detektionen (t.ex. splines + debug lines)
    const hiddenObjects = []
    scene.traverse((obj) => {
      const shouldHide =
        (obj.isMesh && obj.userData.excludeFromOutlines) ||
        obj.isLine ||
        obj.isLineSegments ||
        obj.isPoints

      if (shouldHide && obj.visible) {
        obj.visible = false
        hiddenObjects.push(obj)
      }
    })

    // --- PASS 1: SURFACE ID ---
    scene.traverse((obj) => {
      if (obj.isMesh && obj.userData.surfaceId) {
        originalMaterials.current.set(obj.uuid, obj.material)
        obj.material = getIdMaterial(obj.userData.surfaceId.getHex())
      }
    })
    gl.setRenderTarget(idFbo)
    gl.clear()
    gl.render(scene, camera)

    scene.traverse((obj) => {
      if (obj.isMesh && originalMaterials.current.has(obj.uuid)) {
        obj.material = originalMaterials.current.get(obj.uuid)
      }
    })
    originalMaterials.current.clear()

    // --- PASS 2: NORMALER ---
    scene.traverse((obj) => {
      if (obj.isMesh && obj.userData.surfaceId) {
        originalMaterials.current.set(obj.uuid, obj.material)
        obj.material = normalMaterial
      }
    })
    gl.setRenderTarget(normalFbo)
    gl.clear()
    gl.render(scene, camera)

    scene.traverse((obj) => {
      if (obj.isMesh && originalMaterials.current.has(obj.uuid)) {
        obj.material = originalMaterials.current.get(obj.uuid)
      }
    })
    originalMaterials.current.clear()

    // Återställ dolda objekt
    hiddenObjects.forEach(obj => { obj.visible = true })

    gl.setRenderTarget(null)
    scene.background = oldBg

    effect.uniforms.get('surfaceBuffer').value = idFbo.texture
    effect.uniforms.get('normalBuffer').value = normalFbo.texture

  }, 1)

  // --- FIXAD USEEFFECT ---
  useEffect(() => {
    // Vi skalar bara med DPR. Ingen delning med 2.
    // Detta ger en mer direkt och skarpare kontroll över tjockleken.
    const scaledThickness = thickness * viewport.dpr;

    effect.uniforms.get('thickness').value = scaledThickness;
    effect.uniforms.get('outlineColor').value.set(color)
    effect.uniforms.get('debug').value = debug
    effect.uniforms.get('normalThreshold').value = threshold
  }, [thickness, color, debug, threshold, viewport.dpr])

  return <primitive object={effect} dispose={null} />
}