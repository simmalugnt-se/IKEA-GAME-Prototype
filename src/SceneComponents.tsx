import * as THREE from 'three'
import { forwardRef, useId, useMemo, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeElements } from '@react-three/fiber'
import {
  RigidBody,
  CuboidCollider,
  CylinderCollider,
  BallCollider,
  ConvexHullCollider,
  type RigidBodyProps,
} from '@react-three/rapier'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { C4DMaterial } from './Materials'
import { SETTINGS, type PaletteName, type Vec3 } from './GameSettings'

function hashToSurfaceHex(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i)
    hash |= 0
  }
  const hex = (hash >>> 0) & 0xffffff
  return hex === 0 ? 0x000001 : hex
}

function useSurfaceId(): THREE.Color {
  const reactId = useId()
  return useMemo(() => new THREE.Color().setHex(hashToSurfaceHex(reactId)), [reactId])
}

function toRadians(rotation: Vec3): Vec3 {
  return [
    rotation[0] * (Math.PI / 180),
    rotation[1] * (Math.PI / 180),
    rotation[2] * (Math.PI / 180),
  ]
}

type PhysicsBodyType = Exclude<RigidBodyProps['type'], undefined>

type PhysicsProps = {
  physics?: PhysicsBodyType
  mass?: number
  friction?: number
  lockRotations?: boolean
  position?: Vec3
  rotation?: Vec3
}

type C4DMeshProps = ThreeElements['mesh'] & {
  children?: ReactNode
}

// Wrapper för C4D-mesh som genererar unikt surfaceId för outline-effekten
export const C4DMesh = forwardRef<THREE.Mesh, C4DMeshProps>(function C4DMesh({ children, ...props }, ref) {
  const surfaceId = useSurfaceId()
  return (
    <mesh ref={ref} userData={{ surfaceId }} {...props}>
      {children}
    </mesh>
  )
})

export { C4DMaterial }

type ColliderType = 'cuboid' | 'cylinder' | 'ball'

type PhysicsWrapperProps = Omit<RigidBodyProps, 'type' | 'position' | 'rotation' | 'mass' | 'friction'> & {
  physics?: PhysicsBodyType
  colliderType?: ColliderType
  colliderArgs: [number] | [number, number] | [number, number, number]
  position?: Vec3
  rotation?: Vec3
  mass?: number
  friction?: number
  lockRotations?: boolean
  children: ReactNode
}

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
}: PhysicsWrapperProps) {
  if (!physics) return <>{children}</>

  const rbProps: RigidBodyProps = { type: physics, ...rigidBodyProps }
  if (position !== undefined) rbProps.position = position
  if (rotation !== undefined) rbProps.rotation = rotation
  if (mass !== undefined) rbProps.mass = mass
  if (friction !== undefined) rbProps.friction = friction
  if (lockRotations) rbProps.lockRotations = true

  const collider = (() => {
    if (colliderType === 'cylinder') {
      return <CylinderCollider args={colliderArgs as [number, number]} />
    }
    if (colliderType === 'ball') {
      return <BallCollider args={colliderArgs as [number]} />
    }
    return <CuboidCollider args={colliderArgs as [number, number, number]} />
  })()

  return (
    <RigidBody {...rbProps}>
      {collider}
      {children}
    </RigidBody>
  )
}

type MeshElementProps = Omit<ThreeElements['mesh'], 'position' | 'rotation'>

type CubeElementProps = MeshElementProps & PhysicsProps & {
  size?: Vec3
  color?: PaletteName
  singleTone?: boolean
}

// --- CUBE ---
export const CubeElement = forwardRef<THREE.Mesh, CubeElementProps>(function CubeElement({
  size = [1, 1, 1],
  color = 'one',
  singleTone = false,
  physics,
  mass,
  friction,
  lockRotations,
  position,
  rotation = [0, 0, 0],
  ...props
}, ref) {
  const surfaceId = useSurfaceId()
  const rotationRadians = useMemo(() => toRadians(rotation), [rotation])
  const colliderArgs = useMemo<[number, number, number]>(
    () => [size[0] / 2, size[1] / 2, size[2] / 2],
    [size],
  )

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

type SphereElementProps = MeshElementProps & PhysicsProps & {
  radius?: number
  segments?: number
  color?: PaletteName
  singleTone?: boolean
  flatShading?: boolean
}

// --- SPHERE ---
export const SphereElement = forwardRef<THREE.Mesh, SphereElementProps>(function SphereElement({
  radius = 0.5,
  segments = 32,
  color = 'one',
  singleTone = true,
  flatShading = false,
  physics,
  mass,
  friction,
  lockRotations,
  position,
  rotation = [0, 0, 0],
  ...props
}, ref) {
  const surfaceId = useSurfaceId()
  const rotationRadians = useMemo(() => toRadians(rotation), [rotation])
  const colliderArgs = useMemo<[number]>(() => [radius], [radius])

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

type CylinderElementProps = MeshElementProps & PhysicsProps & {
  radius?: number
  height?: number
  segments?: number
  colliderSegments?: number
  color?: PaletteName
  singleTone?: boolean
}

// --- CYLINDER ---
export const CylinderElement = forwardRef<THREE.Mesh, CylinderElementProps>(function CylinderElement({
  radius = 0.5,
  height = 1,
  segments = 32,
  colliderSegments = 8,
  color = 'one',
  singleTone = true,
  physics,
  mass,
  friction,
  lockRotations,
  position,
  rotation = [0, 0, 0],
  ...props
}, ref) {
  const surfaceId = useSurfaceId()
  const rotationRadians = useMemo(() => toRadians(rotation), [rotation])

  // Generera cylinderformad konvex hull: topp- och bottenring med N sidor
  const hullVertices = useMemo(() => {
    const verts: number[] = []
    const halfH = height / 2
    for (let i = 0; i < colliderSegments; i++) {
      const angle = (i / colliderSegments) * Math.PI * 2
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      verts.push(x, halfH, z)
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

  const rbProps: RigidBodyProps = { type: physics }
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
export function InvisibleFloor({ shadowColor = SETTINGS.colors.shadow }: { shadowColor?: string }) {
  return (
    <group position={[0, 0, 0]}>
      <RigidBody type="fixed">
        <CuboidCollider args={[50, 0.01, 50]} position={[0, -0.01, 0]} />
      </RigidBody>

      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial colorWrite={false} depthWrite />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <shadowMaterial color={shadowColor} opacity={1} blending={THREE.NormalBlending} />
      </mesh>
    </group>
  )
}

type CurveType = 'centripetal' | 'chordal' | 'catmullrom'

type SplineElementProps = PhysicsProps & {
  points?: Vec3[]
  segments?: number
  lineWidth?: number
  color?: string
  closed?: boolean
  curveType?: CurveType
  tension?: number
}

type SegmentCollider = {
  position: Vec3
  rotation: Vec3
  args: Vec3
}

// --- SPLINE ---
export const SplineElement = forwardRef<THREE.Group, SplineElementProps>(function SplineElement({
  points = [[0, 0, 0], [1, 1, 0], [2, 0, 0]],
  segments = 50,
  lineWidth,
  color,
  closed = false,
  curveType = 'catmullrom',
  tension = 0.5,
  physics,
  mass,
  friction,
  lockRotations,
  position,
  rotation = [0, 0, 0],
}, ref) {
  const { size, camera: rawCamera, gl } = useThree()
  const camera = rawCamera as THREE.OrthographicCamera
  const rotationRadians = useMemo(() => toRadians(rotation), [rotation])

  const finalColor = color || SETTINGS.colors.outline
  const finalLineWidth = lineWidth ?? (SETTINGS.lines.thickness * gl.getPixelRatio())

  // Skapa kurvan och samplade punkter
  const curvePoints = useMemo(() => {
    const vectors = points.map((p) => new THREE.Vector3(...p))
    const c = new THREE.CatmullRomCurve3(vectors, closed, curveType, tension)
    return c.getPoints(segments)
  }, [points, segments, closed, curveType, tension])

  // Bygg Line2 – konstant pixelbredd i screen-space
  const { line2, lineMaterial } = useMemo(() => {
    const positions: number[] = []
    curvePoints.forEach((p) => positions.push(p.x, p.y, p.z))

    const geometry = new LineGeometry()
    geometry.setPositions(positions)

    const material = new LineMaterial({
      color: new THREE.Color(finalColor).getHex(),
      linewidth: finalLineWidth,
      worldUnits: false,
      resolution: new THREE.Vector2(size.width, size.height),
    })

    const line = new Line2(geometry, material)
    line.computeLineDistances()
    line.userData.excludeFromOutlines = true

    return { line2: line, lineMaterial: material }
  }, [curvePoints, finalColor, finalLineWidth, size])

  // Uppdatera resolution varje frame (hanterar resize + zoom)
  useFrame(() => {
    lineMaterial.resolution.set(size.width, size.height)
  })

  // Beräkna collider-data för varje segment
  const colliders = useMemo<SegmentCollider[]>(() => {
    const zoom = camera.zoom || 300
    const proxyHalfThickness = (finalLineWidth / zoom) / 2

    const result: SegmentCollider[] = []
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

  const rbProps: RigidBodyProps = { type: physics }
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
