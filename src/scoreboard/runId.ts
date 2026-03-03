let currentRunId = generateRunId()

function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function getRunId(): string {
  return currentRunId
}

export function rotateRunId(): string {
  currentRunId = generateRunId()
  return currentRunId
}
