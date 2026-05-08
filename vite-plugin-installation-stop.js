import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const STOP_PATH = '/__dev/installation/stop'

function resolvePidFile() {
  if (process.env.IKEA_GAME_PID_FILE) {
    return path.resolve(process.env.IKEA_GAME_PID_FILE)
  }

  const installationDir = process.env.IKEA_GAME_INSTALLATION_DIR
    ? path.resolve(process.env.IKEA_GAME_INSTALLATION_DIR)
    : path.resolve(process.cwd(), '..', 'ikea-game-installation')

  return path.join(installationDir, 'tmp', 'run', 'start-game.pids')
}

async function readTrackedPids(pidFile) {
  const content = await fs.readFile(pidFile, 'utf8')
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[0-9]+$/.test(line))
    .map((line) => Number.parseInt(line, 10))
}

function stopProcessGroup(pid) {
  try {
    process.kill(-pid, 'SIGTERM')
    return true
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
      return true
    } catch {
      return false
    }
  }
}

export function installationStopPlugin() {
  return {
    name: 'installation-stop',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0]
        if (req.method !== 'POST' || url !== STOP_PATH) {
          next()
          return
        }

        const pidFile = resolvePidFile()

        try {
          const pids = await readTrackedPids(pidFile)
          res.statusCode = 202
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, pids }))

          setTimeout(() => {
            for (const pid of pids) stopProcessGroup(pid)
          }, 100)
        } catch (error) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : 'Could not read installation pid file',
            pidFile,
          }))
        }
      })
    },
  }
}
