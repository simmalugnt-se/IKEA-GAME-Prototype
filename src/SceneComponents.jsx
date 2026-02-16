import * as THREE from 'three'
import { useMemo, useRef, forwardRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider, CylinderCollider, BallCollider, ConvexHullCollider } from '@react-three/rapier'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { C4DMaterial } from './Materials'
import { SETTINGS } from './GameSettings'

// Wrapper för C4D-mesh som genererar unikt surfaceId för outline-effekten
export const C4DMesh = forwardRef(({ children, ...props }, ref) => {
  const surfaceId = useMemo(() => new THREE.Color().setHex(Math.random() * 0xffffff), [])
  return (
    <mesh ref={ref} userData={{ surfaceId }} {...props}>
      {children}
    </mesh>
  )
})

export { C4DMaterial }

// --- PHYSICS WRAPPER ---
// Om physics-prop finns, wrappar vi med RigidBody + Collider.
// Annars renderas barnen utan fysik.
function PhysicsWrapper({
  physics,
  colliderType = 'cuboid',
  colliderArgs,
  position,
  rotation,
  mass,
  friction,
  lockRotations,
  children,
  ...rigidBodyProps
}) {
  if (!physics) return <>{children}</>

  const ColliderComponent = {
    cuboid: CuboidCollider,
    cylinder: CylinderCollider,
    ball: BallCollider,
  }[colliderType]

  // Bygg bara props som faktiskt har ett värde
  const rbProps = { type: physics, ...rigidBodyProps }
  if (position !== undefined) rbProps.position = position
  if (rotation !== undefined) rbProps.rotation = rotation
  if (mass !== undefined) rbProps.mass = mass
  if (friction !== undefined) rbProps.friction = friction
  if (lockRotations) rbProps.lockRotations = true

  return (
    <RigidBody {...rbProps}>
      <ColliderComponent args={colliderArgs} />
      {children}
    </RigidBody>
  )
}

// --- CUBE ---
export const CubeElement = forwardRef(({
  size = [1, 1, 1],
  color = "one",
  singleTone = false,
  // Physics props
  physics,
  mass,
  friction,
  lockRotations,
  // Transform – goes to RigidBody when physics is on, otherwise to mesh
  position,
  rotation = [0, 0, 0],
  ...props
}, ref) => {
  const surfaceId = useMemo(() => new THREE.Color().setHex(Math.random() * 0xffffff), [])
  const rotationRadians = useMemo(() => rotation.map(r => r * (Math.PI / 180)), [rotation])
  const colliderArgs = useMemo(() => [size[0] / 2, size[1] / 2, size[2] / 2], [size])

  const mesh = (
    <mesh
      {...props}
      ref={ref}
      {...(!physics ? { position, rotation: rotationRadians } : {})}
      castShadow
      receiveShadow
      userData={{ surfaceId }}
    >
      <boxGeometry args={size} />
      <C4DMaterial color={color} singleTone={singleTone} />
    </mesh>
  )

  return (
    <PhysicsWrapper
      physics={physics}
      colliderType="cuboid"
      colliderArgs={colliderArgs}
      position={position}
      rotation={rotationRadians}
      mass={mass}
      friction={friction}
      lockRotations={lockRotations}
    >
      {mesh}
    </PhysicsWrapper>
  )
})

// --- SPHERE ---
export const SphereElement = forwardRef(({
  radius = 0.5,
  segments = 32,
  color = "one",
  singleTone = true,
  flatShading = false,
  // Physics props
  physics,
  mass,
  friction,
  lockRotations,
  // Transform
  position,
  rotation = [0, 0, 0],
  ...props
}, ref) => {
  const surfaceId = useMemo(() => new THREE.Color().setHex(Math.random() * 0xffffff), [])
  const rotationRadians = useMemo(() => rotation.map(r => r * (Math.PI / 180)), [rotation])
  const colliderArgs = useMemo(() => [radius], [radius])

  const mesh = (
    <mesh
      {...props}
      ref={ref}
      {...(!physics ? { position, rotation: rotationRadians } : {})}
      castShadow
      receiveShadow
      userData={{ surfaceId }}
    >
      <sphereGeometry args={[radius, segments, segments]} />
      <C4DMaterial color={color} singleTone={singleTone} flatShading={flatShading} />
    </mesh>
  )

  return (
    <PhysicsWrapper
      physics={physics}
      colliderType="ball"
      colliderArgs={colliderArgs}
      position={position}
      rotation={rotationRadians}
      mass={mass}
      friction={friction}
      lockRotations={lockRotations}
    >
      {mesh}
    </PhysicsWrapper>
  )
})

// --- CYLINDER ---
export const CylinderElement = forwardRef(({
  radius = 0.5,
  height = 1,
  segments = 32,
  colliderSegments = 8, // Antal sidor på kollisions-proxyn (8=snabb, 16+=slätare)
  color = "one",
  singleTone = true,
  // Physics props
  physics,
  mass,
  friction,
  lockRotations,
  // Transform
  position,
  rotation = [0, 0, 0],
  ...props
}, ref) => {
  const surfaceId = useMemo(() => new THREE.Color().setHex(Math.random() * 0xffffff), [])
  const rotationRadians = useMemo(() => rotation.map(r => r * (Math.PI / 180)), [rotation])

  // Generera cylinderformad konvex hull: topp- och bottenring med N sidor
  const hullVertices = useMemo(() => {
    const verts = []
    const halfH = height / 2
    for (let i = 0; i < colliderSegments; i++) {
      const angle = (i / colliderSegments) * Math.PI * 2
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      // Toppring
      verts.push(x, halfH, z)
      // Bottenring
      verts.push(x, -halfH, z)
    }
    return new Float32Array(verts)
  }, [radius, height, colliderSegments])

  const mesh = (
    <mesh
      {...props}
      ref={ref}
      {...(!physics ? { position, rotation: rotationRadians } : {})}
      castShadow
      receiveShadow
      userData={{ surfaceId }}
    >
      <cylinderGeometry args={[radius, radius, height, segments]} />
      <C4DMaterial color={color} singleTone={singleTone} />
    </mesh>
  )

  if (!physics) return mesh

  // Bygg RigidBody manuellt med ConvexHullCollider
  const rbProps = { type: physics }
  if (position !== undefined) rbProps.position = position
  if (rotation !== undefined) rbProps.rotation = rotationRadians
  if (mass !== undefined) rbProps.mass = mass
  if (friction !== undefined) rbProps.friction = friction
  if (lockRotations) rbProps.lockRotations = true

  return (
    <RigidBody {...rbProps} colliders={false}>
      <ConvexHullCollider args={[hullVertices]} />
      {mesh}
    </RigidBody>
  )
})

// InvisibleFloor — inkluderar statisk fysik-collider för golvet
export function InvisibleFloor({ shadowColor = SETTINGS.colors.shadow }) {
  return (
    <group position={[0, 0, 0]}>
      {/* Fysiskt golv */}
      <RigidBody type="fixed">
        <CuboidCollider args={[50, 0.01, 50]} position={[0, -0.01, 0]} />
      </RigidBody>

      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial colorWrite={false} depthWrite={true} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <shadowMaterial color={shadowColor} opacity={1} blending={THREE.NormalBlending} />
      </mesh>
    </group>
  )
}

// --- SPLINE ---
export const SplineElement = forwardRef(({
  points = [[0, 0, 0], [1, 1, 0], [2, 0, 0]],
  segments = 50,
  lineWidth,
  color,
  closed = false,
  curveType = 'catmullrom',
  tension = 0.5,
  // Physics props
  physics,
  mass,
  friction,
  lockRotations,
  // Transform – applied to group
  position,
  rotation = [0, 0, 0],
  ...props
}, ref) => {
  const { size, camera, gl } = useThree()
  const lineRef = useRef()
  const rotationRadians = useMemo(() => rotation.map(r => r * (Math.PI / 180)), [rotation])

  const finalColor = color || SETTINGS.colors.outline
  // SurfaceIdEffect skalar thickness med DPR, så vi gör samma sak
  const finalLineWidth = lineWidth ?? (SETTINGS.lines.thickness * gl.getPixelRatio())

  // Skapa kurvan och samplade punkter
  const { curve, curvePoints } = useMemo(() => {
    const vectors = points.map(p => new THREE.Vector3(...p))
    const c = new THREE.CatmullRomCurve3(vectors, closed, curveType, tension)
    return { curve: c, curvePoints: c.getPoints(segments) }
  }, [points, segments, closed, curveType, tension])

  // Bygg Line2 – konstant pixelbredd i screen-space
  const { line2, lineMaterial } = useMemo(() => {
    const positions = []
    curvePoints.forEach(p => positions.push(p.x, p.y, p.z))

    const geometry = new LineGeometry()
    geometry.setPositions(positions)

    const material = new LineMaterial({
      color: new THREE.Color(finalColor).getHex(),
      linewidth: finalLineWidth,
      worldUnits: false, // pixelbredd = konstant oavsett zoom/avstånd
      resolution: new THREE.Vector2(size.width, size.height),
    })

    const line = new Line2(geometry, material)
    line.computeLineDistances()
    // Markera så SurfaceIdEffect hoppar över denna mesh i sina render-passes
    line.userData.excludeFromOutlines = true

    return { line2: line, lineMaterial: material }
  }, [curvePoints, finalColor, finalLineWidth, size])

  // Uppdatera resolution varje frame (hanterar resize + zoom)
  useFrame(() => {
    lineMaterial.resolution.set(size.width, size.height)
  })

  // Beräkna collider-data för varje segment
  const colliders = useMemo(() => {
    const zoom = camera.zoom || 300
    const proxyHalfThickness = (finalLineWidth / zoom) / 2

    const result = []
    for (let i = 0; i < curvePoints.length - 1; i++) {
      const a = curvePoints[i]
      const b = curvePoints[i + 1]
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
      const dir = new THREE.Vector3().subVectors(b, a)
      const len = dir.length()
      dir.normalize()

      // Orientera boxen längs segmentet
      const mat = new THREE.Matrix4()
      const xAxis = dir.clone()
      let yAxis = new THREE.Vector3().crossVectors(xAxis, new THREE.Vector3(0, 0, 1)).normalize()
      if (yAxis.lengthSq() < 0.001) {
        yAxis = new THREE.Vector3().crossVectors(xAxis, new THREE.Vector3(0, 1, 0)).normalize()
      }
      const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize()
      mat.makeBasis(xAxis, yAxis, zAxis)
      const quat = new THREE.Quaternion().setFromRotationMatrix(mat)
      const euler = new THREE.Euler().setFromQuaternion(quat)

      result.push({
        position: [mid.x, mid.y, mid.z],
        rotation: [euler.x, euler.y, euler.z],
        args: [len / 2, proxyHalfThickness, proxyHalfThickness],
      })
    }
    return result
  }, [curvePoints, finalLineWidth, camera.zoom])

  const visual = (
    <group
      ref={ref}
      {...(!physics ? { position, rotation: rotationRadians } : {})}
    >
      <primitive object={line2} />
    </group>
  )

  if (!physics) return visual

  // Med fysik: RigidBody med flera CuboidColliders
  const rbProps = { type: physics }
  if (position !== undefined) rbProps.position = position
  if (rotation !== undefined) rbProps.rotation = rotationRadians
  if (mass !== undefined) rbProps.mass = mass
  if (friction !== undefined) rbProps.friction = friction
  if (lockRotations) rbProps.lockRotations = true

  return (
    <RigidBody {...rbProps} colliders={false}>
      {colliders.map((col, i) => (
        <CuboidCollider
          key={i}
          args={col.args}
          position={col.position}
          rotation={col.rotation}
        />
      ))}
      <primitive object={line2} />
    </RigidBody>
  )
})