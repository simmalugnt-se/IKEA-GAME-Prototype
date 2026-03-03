import { OrthographicCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { preload as preloadSounds } from "@/audio/SoundManager";
import { CursorTrailCanvas } from "@/input/CursorTrailCanvas";
import { Scene } from "@/scene/Scene";
import { SETTINGS, getActiveBackground } from "@/settings/GameSettings";
import { useSettingsVersion } from "@/settings/settingsStore";
import { GltfConverter } from "@/tools/GltfConverter";
import { DocsPage } from "@/ui/docs/DocsPage";
import { ScoreboardPage } from "@/ui/scoreboard/ScoreboardPage";
import { GameSettingsPanel } from "@/ui/settings/GameSettingsPanel";
import { ScoreHud } from "@/ui/ScoreHud";
import { ScorePopCanvas } from "@/ui/ScorePopCanvas";

export default function App() {
  const isConverter = window.location.pathname === "/converter";
  const isDocs = window.location.pathname === "/docs";
  const isScoreboard = window.location.pathname === "/scoreboard";

  if (isConverter) {
    return <GltfConverter />;
  }

  if (isDocs) {
    return <DocsPage />;
  }

  if (isScoreboard) {
    return <ScoreboardPage />;
  }

  return <GameApp />;
}

function GameApp() {
  useSettingsVersion();
  const [isSettingsPanelVisible, setIsSettingsPanelVisible] = useState(false);

  useEffect(() => {
    preloadSounds();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.metaKey && (e.key === "." || e.code === "Period")) {
        e.preventDefault();
        setIsSettingsPanelVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const backgroundColor = getActiveBackground();
  const initialCameraPosition =
    SETTINGS.camera.mode === "follow"
      ? SETTINGS.camera.follow.offset
      : SETTINGS.camera.static.position;

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        background: backgroundColor,
        cursor: "none",
      }}
    >
      <ScoreHud />
      <Canvas
        shadows={{ type: THREE.BasicShadowMap }}
        dpr={[1, 2]}
        gl={{
          antialias: false,
          stencil: false,
          depth: true,
        }}
      >
        <color attach="background" args={[backgroundColor]} />

        <OrthographicCamera
          makeDefault
          zoom={SETTINGS.camera.base.zoom}
          position={initialCameraPosition}
          near={SETTINGS.camera.base.near}
          far={SETTINGS.camera.base.far}
        />

        <Scene />
      </Canvas>
      <CursorTrailCanvas />
      <ScorePopCanvas />
      {isSettingsPanelVisible && (
        <GameSettingsPanel onClose={() => setIsSettingsPanelVisible(false)} />
      )}
    </div>
  );
}
