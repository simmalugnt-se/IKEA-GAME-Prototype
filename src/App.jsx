import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { InvisibleFloor } from './SceneComponents'
import { GameLights } from './Lights'
// import { GameEffects } from './Effects' <--- BORTTAGEN HÄRIFRÅN
import { SETTINGS } from './GameSettings'
import { Scene } from './Scene'
import { GltfConverter } from './GltfConverter'
import { DocsPage } from './DocsPage'

export default function App() {
  const isConverter = window.location.pathname === '/converter'
  const isDocs = window.location.pathname === '/docs'

  if (isConverter) {
    return <GltfConverter />
  }

  if (isDocs) {
    return <DocsPage />
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: SETTINGS.colors.background }}>
      <Canvas
        shadows={{ type: THREE.BasicShadowMap }}
        dpr={[1, 2]}
        gl={{
          antialias: false,
          stencil: false,
          depth: true
        }}
      >
        <color attach="background" args={[SETTINGS.colors.background]} />

        <OrthographicCamera
          makeDefault
          zoom={SETTINGS.camera.zoom}
          position={SETTINGS.camera.position}
          near={SETTINGS.camera.near}
          far={SETTINGS.camera.far}
        />

        <GameLights />

        <Scene />
      </Canvas>
    </div>
  )
}