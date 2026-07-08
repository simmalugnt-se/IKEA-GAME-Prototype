import type { WebGLRenderer } from "three";
import { SETTINGS } from "@/settings/GameSettings";
import { buildPixelFingerprint } from "@/scene/canvasRenderFrozen";

export type CanvasPixelHealthSnapshot = {
  pixelSampleCount: number;
  pixelLumaMin: number | null;
  pixelLumaMax: number | null;
  pixelLumaRange: number | null;
  pixelLumaStdDev: number | null;
  pixelBottomLumaRange: number | null;
  pixelFingerprint: string | null;
  pixelReadErrors: number;
  pixelHealthy: boolean;
  canvasPixelCheckApplied: boolean;
};

function computeLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function computeStats(values: number[]): { min: number; max: number; range: number; stdDev: number } {
  if (values.length === 0) {
    return { min: 0, max: 0, range: 0, stdDev: 0 };
  }

  let min = values[0]!;
  let max = values[0]!;
  let sum = 0;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }

  const mean = sum / values.length;
  let varianceSum = 0;
  for (const value of values) {
    const delta = value - mean;
    varianceSum += delta * delta;
  }

  return {
    min,
    max,
    range: max - min,
    stdDev: Math.sqrt(varianceSum / values.length),
  };
}

function emptyPixelHealth(applied: boolean, readErrors: number): CanvasPixelHealthSnapshot {
  return {
    pixelSampleCount: 0,
    pixelLumaMin: null,
    pixelLumaMax: null,
    pixelLumaRange: null,
    pixelLumaStdDev: null,
    pixelBottomLumaRange: null,
    pixelFingerprint: null,
    pixelReadErrors: readErrors,
    pixelHealthy: false,
    canvasPixelCheckApplied: applied,
  };
}

export function sampleCanvasPixelHealth(renderer: WebGLRenderer): CanvasPixelHealthSnapshot {
  const watchdog = SETTINGS.installation.watchdog;
  if (!watchdog.canvasPixelHealthEnabled) {
    return {
      pixelSampleCount: 0,
      pixelLumaMin: null,
      pixelLumaMax: null,
      pixelLumaRange: null,
      pixelLumaStdDev: null,
      pixelBottomLumaRange: null,
      pixelFingerprint: null,
      pixelReadErrors: 0,
      pixelHealthy: true,
      canvasPixelCheckApplied: false,
    };
  }

  const gridSize = Math.max(2, Math.trunc(watchdog.canvasPixelSampleGridSize));
  const canvas = renderer.domElement;
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) {
    return emptyPixelHealth(true, 1);
  }

  const gl = renderer.getContext();
  if (gl.isContextLost()) {
    return emptyPixelHealth(true, 1);
  }

  const pixelBuffer = new Uint8Array(4);
  const lumas: number[] = [];
  const bottomLumas: number[] = [];
  const bottomRowStart = Math.floor(gridSize * 0.4);
  let readErrors = 0;

  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const nx = (col + 0.5) / gridSize;
      const ny = (row + 0.5) / gridSize;
      const x = Math.min(width - 1, Math.max(0, Math.floor(nx * width)));
      const y = Math.min(height - 1, Math.max(0, Math.floor((1 - ny) * height)));

      try {
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);
        const luma = computeLuma(pixelBuffer[0]!, pixelBuffer[1]!, pixelBuffer[2]!);
        lumas.push(luma);
        if (row >= bottomRowStart) {
          bottomLumas.push(luma);
        }
      } catch {
        readErrors += 1;
      }
    }
  }

  if (lumas.length === 0) {
    return emptyPixelHealth(true, readErrors + 1);
  }

  const stats = computeStats(lumas);
  const bottomStats = computeStats(bottomLumas);
  const pixelHealthy = readErrors === 0 && (
    stats.range >= watchdog.canvasPixelMinLumaRange
    || stats.stdDev >= watchdog.canvasPixelMinLumaStdDev
    || bottomStats.range >= watchdog.canvasPixelMinBottomLumaRange
  );

  return {
    pixelSampleCount: lumas.length,
    pixelLumaMin: Number(stats.min.toFixed(2)),
    pixelLumaMax: Number(stats.max.toFixed(2)),
    pixelLumaRange: Number(stats.range.toFixed(2)),
    pixelLumaStdDev: Number(stats.stdDev.toFixed(2)),
    pixelBottomLumaRange: Number(bottomStats.range.toFixed(2)),
    pixelFingerprint: buildPixelFingerprint(lumas),
    pixelReadErrors: readErrors,
    pixelHealthy,
    canvasPixelCheckApplied: true,
  };
}
