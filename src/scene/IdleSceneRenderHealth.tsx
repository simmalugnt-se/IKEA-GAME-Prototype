import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { markIdleSceneRenderHealthy } from "@/installationWatchdog";
import { useGameplayStore } from "@/gameplay/gameplayStore";

const MIN_IDLE_TRIANGLES = 64;

export function IdleSceneRenderHealth() {
  const flowState = useGameplayStore((state) => state.flowState);
  const lastSampleAtRef = useRef(0);

  useFrame((state) => {
    if (flowState !== "idle") return;

    const now = Date.now();
    if (now - lastSampleAtRef.current < 5_000) return;
    lastSampleAtRef.current = now;

    const triangles = state.gl.info.render.triangles;
    if (triangles >= MIN_IDLE_TRIANGLES) {
      markIdleSceneRenderHealthy(triangles);
    }
  });

  return null;
}
