import { SETTINGS } from '@/settings/GameSettings'
import { bump } from '@/settings/settingsStore'

// ---------------------------------------------------------------------------
// Deep helpers
// ---------------------------------------------------------------------------

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const key of Object.keys(source)) {
    const sv = source[key]
    const tv = target[key]
    if (
      sv !== null &&
      typeof sv === 'object' &&
      !Array.isArray(sv) &&
      tv !== null &&
      typeof tv === 'object' &&
      !Array.isArray(tv)
    ) {
      deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>)
    } else {
      target[key] = sv
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeLegacyPaletteVariants(preset: Record<string, unknown>) {
  const palette = preset.palette
  if (!isRecord(palette)) return

  const variants = palette.variants
  if (!isRecord(variants)) return

  const legacySlots = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'default']

  Object.values(variants).forEach((variantValue) => {
    if (!isRecord(variantValue)) return
    if (Array.isArray(variantValue.colors)) return

    const colors = legacySlots
      .map((slot) => {
        const entry = variantValue[slot]
        if (!isRecord(entry)) return null

        const base = typeof entry.base === 'string' ? entry.base : null
        if (!base) return null

        const mid = typeof entry.mid === 'string' ? entry.mid : undefined
        return mid ? { base, mid } : { base }
      })
      .filter((entry): entry is { base: string; mid?: string } => entry !== null)

    if (colors.length === 0) return

    variantValue.colors = colors
    legacySlots.forEach((slot) => {
      delete variantValue[slot]
    })
  })
}

function normalizePreset(preset: Record<string, unknown>): Record<string, unknown> {
  normalizeLegacyPaletteVariants(preset)
  return preset
}

// ---------------------------------------------------------------------------
// Save preset (browser download)
// ---------------------------------------------------------------------------

export function savePreset(name: string) {
  const json = JSON.stringify(SETTINGS, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Apply a parsed preset object into SETTINGS (mutates in place)
// ---------------------------------------------------------------------------

export function applyPreset(preset: Record<string, unknown>) {
  const normalizedPreset = normalizePreset(preset)
  deepMerge(SETTINGS as unknown as Record<string, unknown>, normalizedPreset)
  bump()
}

// ---------------------------------------------------------------------------
// Load preset from a File object (e.g. file picker)
// ---------------------------------------------------------------------------

export async function loadPresetFromFile(file: File): Promise<string> {
  const text = await file.text()
  const parsed = JSON.parse(text) as Record<string, unknown>
  applyPreset(parsed)
  return file.name.replace(/\.json$/, '')
}

// ---------------------------------------------------------------------------
// Fetch a bundled preset from public/presets/<name>.json
// ---------------------------------------------------------------------------

export async function loadBundledPreset(name: string) {
  const resp = await fetch(`/presets/${name}.json`)
  if (!resp.ok) throw new Error(`Preset "${name}" not found (${resp.status})`)
  const parsed = (await resp.json()) as Record<string, unknown>
  applyPreset(parsed)
}

// ---------------------------------------------------------------------------
// Fetch the manifest of available bundled presets
// ---------------------------------------------------------------------------

export async function fetchPresetManifest(): Promise<string[]> {
  try {
    const resp = await fetch('/presets/manifest.json')
    if (!resp.ok) return []
    return (await resp.json()) as string[]
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Snapshot current SETTINGS (for comparison / reset)
// ---------------------------------------------------------------------------

export function snapshotSettings(): Record<string, unknown> {
  return deepClone(SETTINGS) as unknown as Record<string, unknown>
}
