import { SETTINGS } from "@/settings/GameSettings";
import type { SoundCategorySettings } from "@/settings/GameSettings";

type SoundCategory =
  | "pop"
  | "felt"
  | "steel"
  | "error"
  | "bee"
  | "swoosh"
  | "comboTier2"
  | "comboTier3"
  | "comboTier4Plus";

type CategoryState = {
  buffers: AudioBuffer[];
  index: number;
};

let ctx: AudioContext | null = null;
const categories = new Map<SoundCategory, CategoryState>();
let preloaded = false;
let resumeListenerAttached = false;

function attachResumeListener(): void {
  if (resumeListenerAttached) return;
  resumeListenerAttached = true;

  const resume = () => {
    if (ctx && ctx.state === "suspended") {
      ctx.resume();
    }
    window.removeEventListener("mousedown", resume);
    window.removeEventListener("pointerdown", resume);
    window.removeEventListener("touchstart", resume);
    window.removeEventListener("keydown", resume);
  };

  window.addEventListener("mousedown", resume, { once: false });
  window.addEventListener("pointerdown", resume, { once: false });
  window.addEventListener("touchstart", resume, { once: false });
  window.addEventListener("keydown", resume, { once: false });
}

function getOrCreateContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    attachResumeListener();
  }
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  return ctx;
}

async function decodeFile(
  audioCtx: AudioContext,
  url: string,
): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    console.warn(`[SoundManager] Failed to load: ${url}`);
    return null;
  }
}

async function loadCategory(
  audioCtx: AudioContext,
  name: SoundCategory,
  settings: SoundCategorySettings,
): Promise<void> {
  const results = await Promise.all(
    settings.files.map((file) => decodeFile(audioCtx, file)),
  );
  const buffers = results.filter((b): b is AudioBuffer => b !== null);
  categories.set(name, { buffers, index: 0 });
}

export async function preload(): Promise<void> {
  if (preloaded) return;
  preloaded = true;

  const audioCtx = getOrCreateContext();
  const { sounds } = SETTINGS;

  await Promise.all([
    loadCategory(audioCtx, "pop", sounds.pop),
    loadCategory(audioCtx, "felt", sounds.felt),
    loadCategory(audioCtx, "steel", sounds.steel),
    loadCategory(audioCtx, "error", sounds.error),
    loadCategory(audioCtx, "bee", sounds.bee),
    loadCategory(audioCtx, "swoosh", sounds.swoosh),
    loadCategory(audioCtx, "comboTier2", sounds.combo.tier2),
    loadCategory(audioCtx, "comboTier3", sounds.combo.tier3),
    loadCategory(audioCtx, "comboTier4Plus", sounds.combo.tier4Plus),
  ]);
}

function playCategory(name: SoundCategory, volumeScale = 1): void {
  if (!SETTINGS.sounds.enabled) return;

  const state = categories.get(name);
  if (!state || state.buffers.length === 0) return;

  const audioCtx = getOrCreateContext();
  const buffer = state.buffers[state.index];
  state.index = (state.index + 1) % state.buffers.length;

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  const gain = audioCtx.createGain();
  const categoryVolume = (() => {
    switch (name) {
      case "comboTier2":
        return SETTINGS.sounds.combo.tier2.volume;
      case "comboTier3":
        return SETTINGS.sounds.combo.tier3.volume;
      case "comboTier4Plus":
        return SETTINGS.sounds.combo.tier4Plus.volume;
      default:
        return SETTINGS.sounds[name].volume;
    }
  })();
  gain.gain.value = categoryVolume * volumeScale;

  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}

function hasCategoryBuffers(name: SoundCategory): boolean {
  const state = categories.get(name);
  return Boolean(state && state.buffers.length > 0);
}

export function playPop(): void {
  playCategory("pop");
}

export function playFelt(): void {
  playCategory("felt");
}

export function playSteel(): void {
  playCategory("steel");
}

export function playError(): void {
  playCategory("error");
}

export function playBee(): void {
  playCategory("bee");
}

export function playSwoosh(volumeScale = 1): void {
  playCategory("swoosh", volumeScale);
}

export function playComboMultiplier(multiplier: number): void {
  if (!(multiplier >= 2)) return;

  if (multiplier >= 4) {
    if (hasCategoryBuffers("comboTier4Plus")) {
      playCategory("comboTier4Plus");
      return;
    }
    playBee();
    return;
  }

  if (multiplier >= 3) {
    if (hasCategoryBuffers("comboTier3")) {
      playCategory("comboTier3");
      return;
    }
    playBee();
    return;
  }

  if (hasCategoryBuffers("comboTier2")) {
    playCategory("comboTier2");
    return;
  }
  playSteel();
}
