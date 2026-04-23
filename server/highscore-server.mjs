import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const host = process.env.HIGHSCORE_HOST || '127.0.0.1'
const port = Number.parseInt(process.env.HIGHSCORE_PORT || '5175', 10)
const dbPath = process.env.HIGHSCORE_DB_PATH || path.join(repoRoot, 'data', 'highscores.sqlite')
const defaultLimit = 256
const maxBodyBytes = 1024 * 1024
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
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
  ORDER BY score DESC, submitted_at_ms ASC, run_id ASC
  LIMIT ?
`)

const insertEntry = db.prepare(`
  INSERT OR IGNORE INTO high_scores
    (run_id, score, initials, submitted_at_ms, submitted_at_iso, reason)
  VALUES
    (@runId, @score, @initials, @submittedAtMs, @submittedAtIso, @reason)
`)

const clearEntries = db.prepare('DELETE FROM high_scores')

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
  pruneEntries.run(limit)
})

function normalizeLimit(raw) {
  const value = Number(raw)
  if (!Number.isFinite(value)) return defaultLimit
  return Math.max(1, Math.min(5000, Math.trunc(value)))
}

function normalizeReason(raw) {
  return raw === 'timeout' ? 'timeout' : 'submitted'
}

function normalizeInitials(raw) {
  const source = typeof raw === 'string' ? raw.toUpperCase() : ''
  let out = ''
  for (let i = 0; i < 3; i += 1) {
    const char = source[i] || 'A'
    out += char >= 'A' && char <= 'Z' ? char : 'A'
  }
  return out
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
  return selectEntries.all(limit)
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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let receivedBytes = 0

    req.on('data', (chunk) => {
      receivedBytes += chunk.length
      if (receivedBytes > maxBodyBytes) {
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
      sendJson(req, res, 200, { ok: true, databasePath: dbPath })
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
      insertEntry.run(entry)
      pruneEntries.run(limit)
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
      const entriesToImport = rawEntries.map(normalizeEntry)
      importEntries(entriesToImport, limit)
      const entries = getSnapshot(limit)
      sendJson(req, res, 200, {
        importedEntries: entriesToImport.length,
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

server.listen(port, host, () => {
  console.log(`[highscore] listening at http://${host}:${port}`)
  console.log(`[highscore] sqlite database: ${dbPath}`)
})

function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
