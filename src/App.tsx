import { OrthographicCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { disposeBackgroundMusic, preloadBackgroundMusic } from "@/audio/BackgroundMusicManager";
import { preloadAudioBanks } from "@/audio/SoundManager";
import { initGameplayDiagnostics } from "@/diagnostics/gameplayDiagnostics";
import { CursorTrailCanvas } from "@/input/CursorTrailCanvas";
import { isInstallationStopShortcut, requestInstallationStop } from "@/installationStop";
import {
  markWebglInitialized,
  useGameInstallationWatchdog,
  useIdleSceneRenderWatchdog,
  usePageLoadSurvivalCheck,
  useWebglContextLossReload,
  useWebglRenderHealthCheck,
} from "@/installationWatchdog";
import { Scene } from "@/scene/Scene";
import { SETTINGS, getActiveBackground } from "@/settings/GameSettings";
import { useSettingsVersion } from "@/settings/settingsStore";
import { GltfConverter } from "@/tools/GltfConverter";
import { DocsPage } from "@/ui/docs/DocsPage";
import { CursorBenchmarkPage } from "@/ui/input/CursorBenchmarkPage";
import { GameFlowOverlay } from "@/ui/GameFlowOverlay";
import { CursorComparePage } from "@/ui/input/CursorComparePage";
import { CursorSourcePage } from "@/ui/input/CursorSourcePage";
import { BonusEventDebugPanel } from "@/ui/BonusEventDebugPanel";
import { HighScoresPage } from "@/ui/highscores/HighScoresPage";
import { ScoreboardPage } from "@/ui/scoreboard/ScoreboardPage";
import { GameSettingsPanel } from "@/ui/settings/GameSettingsPanel";
import { ScoreHud } from "@/ui/ScoreHud";
import { ScorePopCanvas } from "@/ui/ScorePopCanvas";
import { UiStyleVarsRuntime } from "@/ui/UiStyleVarsRuntime";
import { toggleGameplayPause } from "@/gameplay/gameplayStore";

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tagName = element.tagName;
  return (
    element.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  );
}

export default function App() {
  const isConverter = window.location.pathname === "/converter";
  const isDocs = window.location.pathname === "/docs";
  const isHighScores = window.location.pathname === "/highscores";
  const isScoreboard = window.location.pathname === "/scoreboard";
  const isCursorSource = window.location.pathname === "/cursor-source";
  const isCursorCompare = window.location.pathname === "/cursor-compare";
  const isCursorBenchmark = window.location.pathname === "/cursor-benchmark";

  if (isConverter) {
    return <GltfConverter />;
  }

  if (isDocs) {
    return <DocsPage />;
  }

  if (isHighScores) {
    return <HighScoresPage />;
  }

  if (isScoreboard) {
    return <ScoreboardPage />;
  }

  if (isCursorSource) {
    return <CursorSourcePage />;
  }

  if (isCursorCompare) {
    return <CursorComparePage />;
  }

  if (isCursorBenchmark) {
    return <CursorBenchmarkPage />;
  }

  return <GameApp />;
}

function GameApp() {
  useSettingsVersion();
  useGameInstallationWatchdog();
  useWebglContextLossReload();
  useWebglRenderHealthCheck();
  useIdleSceneRenderWatchdog();
  usePageLoadSurvivalCheck();
  const [isSettingsPanelVisible, setIsSettingsPanelVisible] = useState(false);

  useEffect(() => {
    initGameplayDiagnostics();
    preloadAudioBanks();
    preloadBackgroundMusic();
    return () => {
      disposeBackgroundMusic();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isEditableKeyboardTarget(e.target)) return;
      if (isInstallationStopShortcut(e)) {
        e.preventDefault();
        requestInstallationStop();
        return;
      }
      if (e.metaKey && (e.key === "." || e.code === "Period")) {
        e.preventDefault();
        setIsSettingsPanelVisible((v) => !v);
        return;
      }
      const isPauseKey = (e.code === "KeyP" || e.key === "p" || e.key === "P");
      if (isPauseKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleGameplayPause();
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
      <UiStyleVarsRuntime />
      <ScoreHud />
      <GameFlowOverlay />
      <Canvas
        shadows={{ type: THREE.BasicShadowMap }}
        dpr={[1, 1]}
        gl={{
          antialias: false,
          stencil: false,
          depth: true,
        }}
        onCreated={() => {
          markWebglInitialized();
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
      <BonusEventDebugPanel />
      {isSettingsPanelVisible && (
        <GameSettingsPanel onClose={() => setIsSettingsPanelVisible(false)} />
      )}
    </div>
  );
}
