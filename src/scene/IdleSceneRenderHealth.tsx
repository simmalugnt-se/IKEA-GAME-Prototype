import { addAfterEffect, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { logDiagnosticsEvent } from "@/diagnostics/diagnosticsLogger";
import { markIdleSceneRenderHealthy } from "@/installationWatchdog";
import { useGameplayStore } from "@/gameplay/gameplayStore";

const DIAGNOSTICS_SAMPLE_INTERVAL_MS = 10_000;
const MIN_HEALTHY_PIXEL_LUMA_RANGE = 12;
const MIN_HEALTHY_PIXEL_STD_DEV = 4;

function sampleCanvasPixels(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  if (width <= 0 || height <= 0 || gl.isContextLost()) return null;

  const samplePoints: Array<readonly [number, number]> = [];
  for (let y = 0.1; y <= 0.9; y += 0.2) {
    for (let x = 0.1; x <= 0.9; x += 0.2) {
      samplePoints.push([x, y]);
    }
  }
  const pixel = new Uint8Array(4);
  const lumaValues: number[] = [];
  let alphaMin = 255;
  let alphaMax = 0;
  let readErrors = 0;

  for (const [xRatio, yRatio] of samplePoints) {
    const x = Math.max(0, Math.min(width - 1, Math.round(width * xRatio)));
    const y = Math.max(0, Math.min(height - 1, Math.round(height * yRatio)));
    try {
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const luma = Math.round(0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2]);
      lumaValues.push(luma);
      alphaMin = Math.min(alphaMin, pixel[3]);
      alphaMax = Math.max(alphaMax, pixel[3]);
    } catch {
      readErrors += 1;
    }
  }

  if (lumaValues.length === 0) {
    return {
      pixelSampleCount: 0,
      pixelReadErrors: readErrors,
      pixelHealthy: false,
    };
  }

  const lumaMin = Math.min(...lumaValues);
  const lumaMax = Math.max(...lumaValues);
  const lumaAvg = lumaValues.reduce((sum, value) => sum + value, 0) / lumaValues.length;
  const lumaVariance = lumaValues.reduce((sum, value) => sum + (value - lumaAvg) ** 2, 0) / lumaValues.length;

  const lumaRange = lumaMax - lumaMin;
  const lumaStdDev = Math.sqrt(lumaVariance);

  return {
    pixelSampleCount: lumaValues.length,
    pixelReadErrors: readErrors,
    pixelLumaMin: lumaMin,
    pixelLumaMax: lumaMax,
    pixelLumaAvg: Math.round(lumaAvg * 10) / 10,
    pixelLumaRange: lumaRange,
    pixelLumaStdDev: Math.round(lumaStdDev * 10) / 10,
    pixelAlphaMin: alphaMin,
    pixelAlphaMax: alphaMax,
    pixelHealthy: lumaRange >= MIN_HEALTHY_PIXEL_LUMA_RANGE || lumaStdDev >= MIN_HEALTHY_PIXEL_STD_DEV,
  };
}

export function IdleSceneRenderHealth() {
  const { gl } = useThree();
  const flowState = useGameplayStore((state) => state.flowState);
  const flowStateRef = useRef(flowState);
  const lastSampleAtRef = useRef(0);
  const lastDiagnosticsAtRef = useRef(0);

  useEffect(() => {
    flowStateRef.current = flowState;
  }, [flowState]);

  useEffect(() => addAfterEffect(() => {
    if (flowStateRef.current !== "idle") return;

    const now = Date.now();
    if (now - lastSampleAtRef.current < 5_000) return;
    lastSampleAtRef.current = now;

    const { render } = gl.info;
    const triangles = render.triangles;
    const context = gl.getContext();
    const pixelSample = sampleCanvasPixels(context);
    const healthy = pixelSample?.pixelHealthy === true;
    if (now - lastDiagnosticsAtRef.current >= DIAGNOSTICS_SAMPLE_INTERVAL_MS) {
      lastDiagnosticsAtRef.current = now;
      const canvas = gl.domElement;
      logDiagnosticsEvent("idle_scene_render_sample", {
        triangles,
        renderCalls: render.calls,
        renderPoints: render.points,
        renderLines: render.lines,
        minHealthyPixelLumaRange: MIN_HEALTHY_PIXEL_LUMA_RANGE,
        minHealthyPixelStdDev: MIN_HEALTHY_PIXEL_STD_DEV,
        healthy,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        canvasClientWidth: canvas.clientWidth,
        canvasClientHeight: canvas.clientHeight,
        drawingBufferWidth: context.drawingBufferWidth,
        drawingBufferHeight: context.drawingBufferHeight,
        contextLost: context.isContextLost(),
        ...pixelSample,
      });
    }

    if (healthy) {
      markIdleSceneRenderHealthy(triangles);
    }
  }), [gl]);

  return null;
}
