import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { WebSocketServer, WebSocket } from 'ws'
import highScoreInitialsModerationData from '../src/scoreboard/highScoreInitialsModerationData.json' with { type: 'json' }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const host = process.env.HIGHSCORE_HOST || '127.0.0.1'
const port = Number.parseInt(process.env.HIGHSCORE_PORT || '5175', 10)
const dbPath = process.env.HIGHSCORE_DB_PATH || path.join(repoRoot, 'data', 'highscores.sqlite')
const diagnosticsEnabled = process.env.IKEA_GAME_DIAGNOSTICS_ENABLED !== 'false'
const diagnosticsOverlayEnabled = process.env.IKEA_GAME_DIAGNOSTICS_OVERLAY === 'true'
const diagnosticsLogDir = process.env.IKEA_GAME_DIAGNOSTICS_LOG_DIR || path.join(repoRoot, 'logs')
const diagnosticsRunId = process.env.IKEA_GAME_INSTALLATION_RUN_ID || null
const diagnosticsEndpoint = `http://${host}:${port}/api/diagnostics`
const maxBodyBytes = 1024 * 1024
const maxDiagnosticsBodyBytes = 16 * 1024
const maxDiagnosticsStringLength = 4000
const minHighScoreToPersist = normalizeLimitlessNonNegativeInt(
  process.env.HIGHSCORE_MIN_SCORE_TO_PERSIST || '101',
  101,
)
const blockedHighScoreInitials = new Set(highScoreInitialsModerationData.blockedHighScoreInitials)
const fallbackHighScoreInitials = highScoreInitialsModerationData.fallbackHighScoreInitials
const moderationCharacterMap = new Map(Object.entries(highScoreInitialsModerationData.moderationCharacterMap))
fs.mkdirSync(path.dirname(dbPath), { recursive: true })
if (diagnosticsEnabled) {
  fs.mkdirSync(diagnosticsLogDir, { recursive: true })
}

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE IF NOT EXISTS high_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0),
    initials TEXT NOT NULL,
    submitted_at_ms INTEGER NOT NULL CHECK (submitted_at_ms >= 0),
    submitted_at_iso TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('submitted', 'timeout')),
    created_at_ms INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000),
    UNIQUE (run_id, submitted_at_ms, initials, score, reason)
  );

  CREATE INDEX IF NOT EXISTS idx_high_scores_rank
    ON high_scores (score DESC, submitted_at_ms ASC, run_id ASC);
`)

const selectEntries = db.prepare(`
  SELECT
    run_id AS runId,
    score,
    initials,
    submitted_at_ms AS submittedAtMs,
    submitted_at_iso AS submittedAtIso,
    reason
  FROM high_scores
  WHERE score >= ?
  ORDER BY score DESC, submitted_at_ms ASC, run_id ASC
  LIMIT ?
`)

const selectAllEntries = db.prepare(`
  SELECT
    run_id AS runId,
    score,
    initials,
    submitted_at_ms AS submittedAtMs,
    submitted_at_iso AS submittedAtIso,
    reason
  FROM high_scores
  WHERE score >= ?
  ORDER BY score DESC, submitted_at_ms ASC, run_id ASC
`)

const insertEntry = db.prepare(`
  INSERT OR IGNORE INTO high_scores
    (run_id, score, initials, submitted_at_ms, submitted_at_iso, reason)
  VALUES
    (@runId, @score, @initials, @submittedAtMs, @submittedAtIso, @reason)
`)

const clearEntries = db.prepare('DELETE FROM high_scores')
const countEntries = db.prepare('SELECT COUNT(*) AS count FROM high_scores')

const pruneEntries = db.prepare(`
  DELETE FROM high_scores
  WHERE id NOT IN (
    SELECT id
    FROM high_scores
    ORDER BY score DESC, submitted_at_ms ASC, run_id ASC
    LIMIT ?
  )
`)

const importEntries = db.transaction((entries, limit) => {
  for (const entry of entries) {
    insertEntry.run(entry)
  }
  if (limit !== null) {
    pruneEntries.run(limit)
  }
})

function normalizeLimit(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.max(1, Math.trunc(value))
}

function normalizeReason(raw) {
  return raw === 'timeout' ? 'timeout' : 'submitted'
}

function isPersistableEntry(entry) {
  return entry.score >= minHighScoreToPersist
}

function normalizeInitials(raw) {
  const source = typeof raw === 'string' ? raw.toUpperCase() : ''
  let out = ''
  for (let i = 0; i < 3; i += 1) {
    const rawChar = source[i] || 'A'
    const char = moderationCharacterMap.get(rawChar) || rawChar
    out += char >= 'A' && char <= 'Z' ? char : 'A'
  }
  return isBlockedHighScoreInitials(out) || isBlockedHighScoreInitials(source)
    ? getRandomFallbackHighScoreInitials()
    : out
}

function isBlockedHighScoreInitials(initials) {
  return blockedHighScoreInitials.has(normalizeInitialsForModeration(initials))
}

function normalizeInitialsForModeration(initials) {
  return Array.from(initials.toUpperCase())
    .map((char) => moderationCharacterMap.get(char) || char)
    .join('')
    .replace(/[^A-Z]/g, '')
}

function getRandomFallbackHighScoreInitials() {
  return fallbackHighScoreInitials[Math.floor(Math.random() * fallbackHighScoreInitials.length)] || 'ACE'
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Expected a high score record object.')
  }

  const submittedAtMs = normalizeLimitlessNonNegativeInt(raw.submittedAtMs, Date.now())
  const runId = typeof raw.runId === 'string' && raw.runId.trim().length > 0
    ? raw.runId.trim()
    : `run-${submittedAtMs}`
  const score = normalizeLimitlessNonNegativeInt(raw.score, 0)
  const initials = normalizeInitials(raw.initials)
  const reason = normalizeReason(raw.reason)

  return {
    runId,
    score,
    initials,
    submittedAtMs,
    submittedAtIso: new Date(submittedAtMs).toISOString(),
    reason,
  }
}

function normalizeLimitlessNonNegativeInt(raw, fallback) {
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.trunc(value))
}

function resolveRank(entries, submitted) {
  const index = entries.findIndex((entry) => (
    entry.runId === submitted.runId
    && entry.submittedAtMs === submitted.submittedAtMs
    && entry.initials === submitted.initials
    && entry.score === submitted.score
    && entry.reason === submitted.reason
  ))
  return index >= 0 ? index + 1 : null
}

function getSnapshot(limit) {
  return limit === null
    ? selectAllEntries.all(minHighScoreToPersist)
    : selectEntries.all(minHighScoreToPersist, limit)
}

function getEntryCount() {
  return Number(countEntries.get()?.count || 0)
}

function isAllowedOrigin(origin) {
  if (typeof origin !== 'string') return false
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  } catch {
    return false
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
}

function sendJson(req, res, statusCode, payload) {
  applyCors(req, res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.writeHead(statusCode)
  res.end(JSON.stringify(payload))
}

function readJsonBody(req, maxBytes = maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let receivedBytes = 0

    req.on('data', (chunk) => {
      receivedBytes += chunk.length
      if (receivedBytes > maxBytes) {
        reject(new Error('Request body too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('Invalid JSON body.'))
      }
    })

    req.on('error', reject)
  })
}

function getDiagnosticsLogPath(date = new Date()) {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '')
  return path.join(diagnosticsLogDir, `diagnostics-${day}.ndjson`)
}

function sanitizeDiagnosticsValue(value, depth = 0) {
  if (depth > 4) return '[max-depth]'
  if (value === null) return null
  if (typeof value === 'string') {
    return value.length > maxDiagnosticsStringLength
      ? `${value.slice(0, maxDiagnosticsStringLength)}...`
      : value
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeDiagnosticsValue(item, depth + 1))
  }
  if (typeof value === 'object') {
    const result = {}
    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      result[key] = sanitizeDiagnosticsValue(item, depth + 1)
    }
    return result
  }
  return String(value)
}

function normalizeDiagnosticsEvent(raw, req) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const level = ['info', 'warn', 'error'].includes(source.level) ? source.level : 'info'
  const event = typeof source.event === 'string' && source.event.length > 0
    ? source.event.slice(0, 120)
    : 'event'
  const page = typeof source.page === 'string' && source.page.length > 0
    ? source.page.slice(0, 80)
    : 'unknown'

  return {
    ...sanitizeDiagnosticsValue(source),
    ts: typeof source.ts === 'string' ? source.ts.slice(0, 40) : new Date().toISOString(),
    level,
    event,
    page,
    runId: typeof source.runId === 'string' && source.runId.length > 0 ? source.runId.slice(0, 80) : diagnosticsRunId,
    remoteAddress: req.socket.remoteAddress,
  }
}

async function handleDiagnosticsEvent(req, res) {
  applyCors(req, res)
  if (!diagnosticsEnabled) {
    res.writeHead(204)
    res.end()
    return
  }

  const body = await readJsonBody(req, maxDiagnosticsBodyBytes)
  const event = normalizeDiagnosticsEvent(body, req)
  await fs.promises.appendFile(getDiagnosticsLogPath(), `${JSON.stringify(event)}\n`, 'utf8')
  res.writeHead(204)
  res.end()
}

function handleOptions(req, res) {
  applyCors(req, res)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.writeHead(204)
  res.end()
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url || '/', `http://${host}:${port}`)

    if (req.method === 'OPTIONS') {
      handleOptions(req, res)
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(req, res, 200, {
        ok: true,
        databasePath: dbPath,
        journalMode: db.pragma('journal_mode', { simple: true }),
        entryCount: getEntryCount(),
        diagnosticsEnabled,
        diagnosticsLogDir: diagnosticsEnabled ? diagnosticsLogDir : null,
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/diagnostics/config') {
      sendJson(req, res, 200, {
        enabled: diagnosticsEnabled,
        overlay: diagnosticsOverlayEnabled,
        endpoint: diagnosticsEndpoint,
        runId: diagnosticsRunId,
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/diagnostics') {
      await handleDiagnosticsEvent(req, res)
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/highscores') {
      const limit = normalizeLimit(url.searchParams.get('limit'))
      const entries = getSnapshot(limit)
      sendJson(req, res, 200, {
        entries,
        totalEntries: entries.length,
        storageMode: 'database',
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/highscores') {
      const body = await readJsonBody(req)
      const limit = normalizeLimit(body.maxEntries)
      const entry = normalizeEntry(body)
      if (!isPersistableEntry(entry)) {
        const entries = getSnapshot(limit)
        sendJson(req, res, 200, {
          accepted: false,
          rank: null,
          totalEntries: entries.length,
          storageMode: 'database',
          entries,
        })
        return
      }
      insertEntry.run(entry)
      if (limit !== null) {
        pruneEntries.run(limit)
      }
      const entries = getSnapshot(limit)
      sendJson(req, res, 200, {
        accepted: true,
        rank: resolveRank(entries, entry),
        totalEntries: entries.length,
        storageMode: 'database',
        entries,
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/highscores/import') {
      const body = await readJsonBody(req)
      const limit = normalizeLimit(body.maxEntries)
      const rawEntries = Array.isArray(body.entries) ? body.entries : []
      const normalizedEntries = rawEntries.map(normalizeEntry)
      const entriesToImport = normalizedEntries.filter(isPersistableEntry)
      importEntries(entriesToImport, limit)
      const entries = getSnapshot(limit)
      sendJson(req, res, 200, {
        importedEntries: entriesToImport.length,
        rejectedEntries: normalizedEntries.length - entriesToImport.length,
        totalEntries: entries.length,
        storageMode: 'database',
        entries,
      })
      return
    }

    if (req.method === 'DELETE' && url.pathname === '/api/highscores') {
      clearEntries.run()
      sendJson(req, res, 200, {
        totalEntries: 0,
        storageMode: 'database',
        entries: [],
      })
      return
    }

    sendJson(req, res, 404, { error: 'Not found.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.'
    sendJson(req, res, 400, { error: message })
  }
}

const server = http.createServer((req, res) => {
  void handleRequest(req, res)
})

const scoreboardWss = new WebSocketServer({ noServer: true })

function broadcastScoreboardMessage(data) {
  const message = typeof data === 'string' ? data : data.toString()
  for (const client of scoreboardWss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}

scoreboardWss.on('connection', (ws) => {
  ws.on('message', (data) => {
    broadcastScoreboardMessage(data)
  })
})

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${host}:${port}`)
  const origin = req.headers.origin

  if (url.pathname !== '/ws/scoreboard' || (origin && !isAllowedOrigin(origin))) {
    socket.destroy()
    return
  }

  scoreboardWss.handleUpgrade(req, socket, head, (ws) => {
    scoreboardWss.emit('connection', ws, req)
  })
})

server.listen(port, host, () => {
  console.log(`[highscore] listening at http://${host}:${port}`)
  console.log(`[highscore] sqlite database: ${dbPath}`)
  console.log(`[highscore] scoreboard ws listening at ws://${host}:${port}/ws/scoreboard`)
  console.log(`[highscore] diagnostics ${diagnosticsEnabled ? `enabled: ${diagnosticsLogDir}` : 'disabled'}`)
})

function shutdown() {
  scoreboardWss.close()
  server.close(() => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[highscore] WAL checkpoint during shutdown failed: ${message}`)
    }
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
