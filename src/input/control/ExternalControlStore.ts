export type DigitalControlState = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  jump: boolean
}

export type ExternalDigitalPacket = {
  mode: 'digital'
  forward?: boolean
  backward?: boolean
  left?: boolean
  right?: boolean
  jump?: boolean
  timestamp?: number
  seq?: number
}

export type ExternalAbsolutePacket = {
  mode: 'absolute'
  x: number
  z: number
  timestamp?: number
  seq?: number
}

export type ExternalControlPacket = ExternalDigitalPacket | ExternalAbsolutePacket

type AbsoluteTarget = {
  x: number
  z: number
  updatedAt: number
}

const EMPTY_DIGITAL_STATE: DigitalControlState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
}

const digitalState: DigitalControlState = { ...EMPTY_DIGITAL_STATE }
let digitalUpdatedAt = 0
let absoluteTarget: AbsoluteTarget | undefined
let lastSeq = -1

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizeTimestamp(timestamp: number | undefined): number {
  return timestamp ?? Date.now()
}

function isDuplicateOrOldSequence(seq: number | undefined): boolean {
  if (seq === undefined) return false
  if (seq <= lastSeq) return true
  lastSeq = seq
  return false
}

export function applyExternalControlPacket(packet: ExternalControlPacket) {
  if (isDuplicateOrOldSequence(packet.seq)) return

  const updatedAt = normalizeTimestamp(asNumber(packet.timestamp))

  if (packet.mode === 'digital') {
    if (packet.forward !== undefined) digitalState.forward = packet.forward
    if (packet.backward !== undefined) digitalState.backward = packet.backward
    if (packet.left !== undefined) digitalState.left = packet.left
    if (packet.right !== undefined) digitalState.right = packet.right
    if (packet.jump !== undefined) digitalState.jump = packet.jump
    digitalUpdatedAt = updatedAt
    return
  }

  absoluteTarget = {
    x: packet.x,
    z: packet.z,
    updatedAt,
  }
}

export function getExternalDigitalState(nowMs: number, staleTimeoutMs: number): DigitalControlState {
  if (!digitalUpdatedAt || nowMs - digitalUpdatedAt > staleTimeoutMs) {
    return EMPTY_DIGITAL_STATE
  }
  return digitalState
}

export function getExternalAbsoluteTarget(nowMs: number, staleTimeoutMs: number): AbsoluteTarget | undefined {
  if (!absoluteTarget) return undefined
  if (nowMs - absoluteTarget.updatedAt > staleTimeoutMs) return undefined
  return absoluteTarget
}

export function clearExternalControlState() {
  digitalState.forward = false
  digitalState.backward = false
  digitalState.left = false
  digitalState.right = false
  digitalState.jump = false
  digitalUpdatedAt = 0
  absoluteTarget = undefined
}

export function parseExternalControlPacket(value: unknown): ExternalControlPacket | undefined {
  if (!value || typeof value !== 'object') return undefined
  const packet = value as Record<string, unknown>
  const mode = packet.mode ?? packet.type

  if (mode === 'digital') {
    const parsed: ExternalDigitalPacket = { mode: 'digital' }
    const forward = asBoolean(packet.forward)
    const backward = asBoolean(packet.backward)
    const left = asBoolean(packet.left)
    const right = asBoolean(packet.right)
    const jump = asBoolean(packet.jump)
    const timestamp = asNumber(packet.timestamp)
    const seq = asNumber(packet.seq)

    if (forward !== undefined) parsed.forward = forward
    if (backward !== undefined) parsed.backward = backward
    if (left !== undefined) parsed.left = left
    if (right !== undefined) parsed.right = right
    if (jump !== undefined) parsed.jump = jump
    if (timestamp !== undefined) parsed.timestamp = timestamp
    if (seq !== undefined) parsed.seq = seq

    return parsed
  }

  if (mode === 'absolute') {
    const x = asNumber(packet.x)
    const z = asNumber(packet.z)
    if (x === undefined || z === undefined) return undefined

    const parsed: ExternalAbsolutePacket = { mode: 'absolute', x, z }
    const timestamp = asNumber(packet.timestamp)
    const seq = asNumber(packet.seq)
    if (timestamp !== undefined) parsed.timestamp = timestamp
    if (seq !== undefined) parsed.seq = seq
    return parsed
  }

  return undefined
}
