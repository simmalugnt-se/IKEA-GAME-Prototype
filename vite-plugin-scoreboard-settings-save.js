import fs from 'node:fs/promises'
import path from 'node:path'

const SAVE_PATH = '/__dev/scoreboard/settings/save'
const TARGET_FILE = path.resolve(process.cwd(), 'src/scoreboard/scoreBoardSettings.ts')

function clamp01(v) {
  if (v <= 0) return 0
  if (v >= 1) return 1
  return v
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

function clampRange(value, min, max) {
  if (value < min) return min
  if (value > max) return max
  return value
}

function normalizePoints(points) {
  if (!Array.isArray(points)) {
    return [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.5 },
      { x: 0.75, y: 0.75 },
      { x: 1, y: 1 },
    ]
  }

  const normalized = points
    .map((p, idx) => ({
      x: clamp01(finiteOr(p?.x, idx / Math.max(1, points.length - 1))),
      y: clamp01(finiteOr(p?.y, 0)),
    }))
    .sort((a, b) => a.x - b.x)

  if (normalized.length < 2) {
    return [{ x: 0, y: 0 }, { x: 1, y: 1 }]
  }

  normalized[0] = { x: 0, y: 0 }
  normalized[normalized.length - 1] = { x: 1, y: 1 }
  return normalized
}

function normalizeSettings(raw) {
  const source = raw?.dmd?.source ?? {}
  const grid = raw?.dmd?.grid ?? {}
  const curve = raw?.dmd?.curve ?? {}
  const edge = raw?.dmd?.edge ?? {}
  const timing = raw?.dmd?.timing ?? {}
  const palette = Array.isArray(raw?.dmd?.palette) ? raw.dmd.palette.slice(0, 4) : []

  while (palette.length < 4) palette.push('#141414')

  return {
    debug: {
      showOverlayByDefault: !!raw?.debug?.showOverlayByDefault,
    },
    dmd: {
      source: {
        mode: source.mode === 'viewport_divider' ? 'viewport_divider' : 'fixed',
        fixedWidth: Math.max(1, Math.floor(finiteOr(source.fixedWidth, finiteOr(source.width, 240)))),
        fixedHeight: Math.max(1, Math.floor(finiteOr(source.fixedHeight, finiteOr(source.height, 135)))),
        viewportDivider: clampRange(finiteOr(source.viewportDivider, 1), 0.5, 32),
        riveFit: source.riveFit === 'cover' || source.riveFit === 'fill' ? source.riveFit : 'contain',
      },
      grid: {
        dotFill: clamp01(finiteOr(grid.dotFill, 0.74)),
        resolutionMultiplier: clampRange(finiteOr(grid.resolutionMultiplier, 1), 0.25, 32),
      },
      curve: {
        points: normalizePoints(curve.points),
        antiAliasCrush: clamp01(finiteOr(curve.antiAliasCrush, 0.35)),
      },
      edge: {
        enabled: !!edge.enabled,
        detectRange: clamp01(finiteOr(edge.detectRange, 0.28)),
        compressStrength: clamp01(finiteOr(edge.compressStrength, 0.82)),
        midBandMin: clamp01(finiteOr(edge.midBandMin, 0.1)),
        midBandMax: clamp01(finiteOr(edge.midBandMax, 0.9)),
      },
      timing: {
        targetFps: Math.max(1, Math.floor(finiteOr(timing.targetFps, 8))),
      },
      palette: [
        String(palette[0] ?? '#669E10'),
        String(palette[1] ?? '#006B18'),
        String(palette[2] ?? '#0E3420'),
        String(palette[3] ?? '#141414'),
      ],
    },
  }
}

function serializeSettings(settings) {
  const payload = JSON.stringify(settings, null, 2)
  return `import type { ScoreboardSettings } from '@/scoreboard/scoreBoardSettings.types'

export const SCOREBOARD_SETTINGS: ScoreboardSettings = ${payload}
`
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

export function scoreboardSettingsSavePlugin() {
  return {
    name: 'scoreboard-settings-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0]
        if (req.method !== 'POST' || url !== SAVE_PATH) {
          next()
          return
        }

        try {
          const rawBody = await readBody(req)
          const parsed = JSON.parse(rawBody)
          const normalized = normalizeSettings(parsed)
          const output = serializeSettings(normalized)
          await fs.writeFile(TARGET_FILE, output, 'utf8')

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (error) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to save scoreboard settings',
          }))
        }
      })
    },
  }
}
