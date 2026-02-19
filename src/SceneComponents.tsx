import * as THREE from 'three'
import { forwardRef, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useThree, type ThreeElements } from '@react-three/fiber'
import { RigidBody, CuboidCollider, type RigidBodyProps } from '@react-three/rapier'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { C4DMaterial } from './Materials'
import { SETTINGS, type Vec3 } from './GameSettings'
import { toRadians, useSurfaceId } from './SceneHelpers'

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

type CurveType = 'centripetal' | 'chordal' | 'catmullrom'

type SplineElementProps = PhysicsProps & {
  points?: Vec3[]
  segments?: number
  lineWidth?: number
  color?: string
  visible?: boolean
  castShadow?: boolean
  closed?: boolean
  curveType?: CurveType
  tension?: number
}

type SegmentCollider = {
  position: Vec3
  rotation: Vec3
  args: Vec3
}

// Line2-baserad spline med pixelkonstant tjocklek + valfri fysik/segmentcolliders.
export const SplineElement = forwardRef<THREE.Group, SplineElementProps>(function SplineElement({
  points = [[0, 0, 0], [1, 1, 0], [2, 0, 0]],
  segments = 50,
  lineWidth,
  color,
  visible = true,
  castShadow = true,
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
  const line2 = useMemo(() => {
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
    material.alphaToCoverage = false

    const line = new Line2(geometry, material)
    line.computeLineDistances()
    line.userData.excludeFromOutlines = true

    return line
  }, [curvePoints, finalColor, finalLineWidth, size])

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

  // Shadow proxy: Box-segment per spline-del som endast används för shadow map.
  // Själva linjen renderas fortfarande via Line2 för konstant pixelbredd.
  const shadowProxyRef = useRef<THREE.InstancedMesh | null>(null)

  useLayoutEffect(() => {
    const mesh = shadowProxyRef.current
    if (!mesh) return

    const temp = new THREE.Object3D()
    colliders.forEach((col, i) => {
      temp.position.set(col.position[0], col.position[1], col.position[2])
      temp.rotation.set(col.rotation[0], col.rotation[1], col.rotation[2])
      temp.scale.set(col.args[0] * 2, col.args[1] * 2, col.args[2] * 2)
      temp.updateMatrix()
      mesh.setMatrixAt(i, temp.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [colliders])

  const shadowProxy = castShadow && colliders.length > 0 ? (
    <instancedMesh
      ref={shadowProxyRef}
      args={[undefined, undefined, colliders.length]}
      visible={visible}
      castShadow
      receiveShadow={false}
      frustumCulled={false}
      userData={{ excludeFromOutlines: true }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial colorWrite={false} depthWrite={false} />
    </instancedMesh>
  ) : null

  const visual = (
    <group
      ref={ref}
      {...(!physics ? { position, rotation: rotationRadians } : {})}
      visible={visible}
    >
      <primitive object={line2} />
      {shadowProxy}
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
      <primitive object={line2} visible={visible} />
      {shadowProxy}
    </RigidBody>
  )
})
