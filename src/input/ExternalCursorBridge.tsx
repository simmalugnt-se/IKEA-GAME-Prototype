import { useEffect, useRef } from 'react'
import {
  beginExternalCursorInputSession,
  endExternalCursorInputSession,
  setExternalCursorMaxPointersOverride,
  submitEmptyExternalCursorFrame,
  submitExternalCursorFrameSample,
  type ExternalCursorPointerSample,
} from '@/input/CursorInputRouter'
import { registerExternalCursorLifecycleSender } from '@/input/externalCursorLifecycle'
import { useGameplayStore } from '@/gameplay/gameplayStore'
import { SETTINGS } from '@/settings/GameSettings'
import { useSettingsVersion } from '@/settings/settingsStore'

const POINTER_BUFFER_SIZE = 2
const TELEMETRY_SUBSCRIBE_TTL_MS = 2500

type AnyPacket = Record<string, unknown>

function asRecord(value: unknown): AnyPacket | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as AnyPacket
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  return value
}

function resolveConfiguredMaxExternalPointers(): number {
  const raw = SETTINGS.cursor.external.maxPointers
  if (!Number.isFinite(raw)) return 2
  return Math.max(1, Math.min(POINTER_BUFFER_SIZE, Math.trunc(raw)))
}

function resolveEffectiveMaxExternalPointers(flowState: string): number {
  const isAlphabetGridEntry = (
    flowState === 'game_over_input'
    && SETTINGS.gameplay.flow.highScoreEntryMode === 'alphabet_grid'
  )
  if (!isAlphabetGridEntry) return resolveConfiguredMaxExternalPointers()

  const raw = SETTINGS.cursor.external.alphabetGridEntryMaxPointers
  if (!Number.isFinite(raw)) return 1
  return Math.max(1, Math.min(resolveConfiguredMaxExternalPointers(), Math.trunc(raw)))
}

export function ExternalCursorBridge() {
  const settingsVersion = useSettingsVersion()
  const flowState = useGameplayStore((state) => state.flowState)
  const flowStateRef = useRef(flowState)
  const singlePointerLockIdRef = useRef('')

  useEffect(() => {
    flowStateRef.current = flowState
    const maxPointers = resolveEffectiveMaxExternalPointers(flowState)
    const configuredMaxPointers = resolveConfiguredMaxExternalPointers()
    setExternalCursorMaxPointersOverride(maxPointers < configuredMaxPointers ? maxPointers : null)

    return () => {
      setExternalCursorMaxPointersOverride(null)
    }
  }, [flowState, settingsVersion])

  useEffect(() => {
    const cfg = SETTINGS.cursor.external
    const shouldConnect = (
      SETTINGS.cursor.inputSource === 'external'
      && cfg.enabled
      && typeof cfg.websocket.url === 'string'
      && cfg.websocket.url.length > 0
    )

    if (!shouldConnect) {
      endExternalCursorInputSession()
      return
    }

    beginExternalCursorInputSession()

    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let unregisterLifecycleSender: (() => void) | null = null
    let disposed = false

    let telemetrySourceId = ''
    let telemetryExpiresAtMs = 0

    const pointerBuffer: ExternalCursorPointerSample[] = Array.from(
      { length: POINTER_BUFFER_SIZE },
      () => ({ id: '', xPx: 0, yPx: 0, visible: true, interactable: true }),
    )

    const frameAckPayload = {
      type: 'cursor_frame_ack',
      sourceId: '',
      seq: 0,
      sentEpochMs: 0,
      receiverEpochMs: 0,
      receiverPerfMs: 0,
    }

    const probeAckPayload = {
      type: 'latency_probe_ack',
      sourceId: '',
      probeSeq: 0,
      sentEpochMs: 0,
      receiverEpochMs: 0,
      receiverPerfMs: 0,
    }

    const isTelemetryActive = (sourceId: string): boolean => {
      if (sourceId.length === 0) return false
      const now = performance.now()
      if (now > telemetryExpiresAtMs) {
        telemetrySourceId = ''
        telemetryExpiresAtMs = 0
        return false
      }
      return sourceId === telemetrySourceId
    }

    const trySendJson = (payload: unknown) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify(payload))
    }

    const handleTelemetrySubscribePacket = (packet: AnyPacket) => {
      const sourceId = asNonEmptyString(packet.sourceId)
      const enabled = packet.enable
      if (enabled !== true || !sourceId) {
        telemetrySourceId = ''
        telemetryExpiresAtMs = 0
        return
      }

      telemetrySourceId = sourceId
      telemetryExpiresAtMs = performance.now() + TELEMETRY_SUBSCRIBE_TTL_MS
    }

    const handleLatencyProbePacket = (packet: AnyPacket) => {
      const sourceId = asNonEmptyString(packet.sourceId)
      const probeSeq = asFiniteNumber(packet.probeSeq)
      const sentEpochMs = asFiniteNumber(packet.sentEpochMs)
      if (!sourceId || probeSeq === null || sentEpochMs === null) return
      if (!isTelemetryActive(sourceId)) return

      probeAckPayload.sourceId = sourceId
      probeAckPayload.probeSeq = probeSeq
      probeAckPayload.sentEpochMs = sentEpochMs
      probeAckPayload.receiverEpochMs = Date.now()
      probeAckPayload.receiverPerfMs = performance.now()
      trySendJson(probeAckPayload)
    }

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return
      const reconnectMs = Math.max(100, SETTINGS.cursor.external.websocket.reconnectMs)
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, reconnectMs)
    }

    const connect = () => {
      if (disposed) return

      try {
        ws = new WebSocket(SETTINGS.cursor.external.websocket.url)
      } catch {
        ws = null
        scheduleReconnect()
        return
      }

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return

        let parsed: unknown
        try {
          parsed = JSON.parse(event.data)
        } catch {
          return
        }

        const packet = asRecord(parsed)
        if (!packet) return

        const packetType = asNonEmptyString(packet.type)
        if (!packetType) return

        if (packetType === 'latency_telemetry_subscribe') {
          handleTelemetrySubscribePacket(packet)
          return
        }

        if (packetType === 'latency_probe') {
          handleLatencyProbePacket(packet)
          return
        }

        if (packetType !== 'cursor_frame') return

        const sourceTimeMs = asFiniteNumber(packet.sourceTimeMs)
        if (sourceTimeMs === null) return

        const sourceId = asNonEmptyString(packet.sourceId)
        const frameSeq = asFiniteNumber(packet.seq)
        const sentEpochMs = asFiniteNumber(packet.sentEpochMs)

        const rawPointers = packet.pointers
        if (!Array.isArray(rawPointers) || rawPointers.length === 0) {
          submitEmptyExternalCursorFrame(sourceTimeMs)
          if (sourceId && frameSeq !== null && sentEpochMs !== null && isTelemetryActive(sourceId)) {
            frameAckPayload.sourceId = sourceId
            frameAckPayload.seq = frameSeq
            frameAckPayload.sentEpochMs = sentEpochMs
            frameAckPayload.receiverEpochMs = Date.now()
            frameAckPayload.receiverPerfMs = performance.now()
            trySendJson(frameAckPayload)
          }
          return
        }

        const width = window.innerWidth
        const height = window.innerHeight
        if (!(width > 0) || !(height > 0)) return

        const maxPointers = resolveEffectiveMaxExternalPointers(flowStateRef.current)

        const rawPointerCount = rawPointers.length
        let lockedRawPointer: AnyPacket | null = null
        if (maxPointers === 1 && singlePointerLockIdRef.current.length > 0) {
          for (let i = 0; i < rawPointerCount; i += 1) {
            const rawPointer = asRecord(rawPointers[i])
            if (!rawPointer) continue
            if (asNonEmptyString(rawPointer.id) === singlePointerLockIdRef.current) {
              lockedRawPointer = rawPointer
              break
            }
          }
        }

        let validCount = 0
        const pointerSource = lockedRawPointer ? [lockedRawPointer] : rawPointers
        for (let i = 0; i < pointerSource.length; i += 1) {
          if (maxPointers === 1 && validCount >= 1) break
          const rawPointer = asRecord(pointerSource[i])
          if (!rawPointer) continue

          const id = asNonEmptyString(rawPointer.id)
          const xNorm = asFiniteNumber(rawPointer.xNorm)
          const yNorm = asFiniteNumber(rawPointer.yNorm)
          if (!id || xNorm === null || yNorm === null) continue

          let targetIndex = validCount
          if (targetIndex >= maxPointers) {
            for (let shiftIndex = 1; shiftIndex < maxPointers; shiftIndex += 1) {
              const from = pointerBuffer[shiftIndex]
              const to = pointerBuffer[shiftIndex - 1]
              if (!from || !to) continue
              to.id = from.id
              to.xPx = from.xPx
              to.yPx = from.yPx
              to.visible = from.visible
              to.interactable = from.interactable
            }
            targetIndex = maxPointers - 1
          }

          const pointer = pointerBuffer[targetIndex]
          if (!pointer) continue

          pointer.id = id
          pointer.xPx = xNorm * width
          pointer.yPx = yNorm * height
          pointer.visible = rawPointer.visible !== false
          pointer.interactable = rawPointer.interactable !== false
          validCount += 1
        }

        const count = Math.min(validCount, maxPointers)
        if (count <= 0) return
        singlePointerLockIdRef.current = maxPointers === 1 ? pointerBuffer[0]?.id ?? '' : ''

        submitExternalCursorFrameSample(sourceTimeMs, pointerBuffer, count)

        if (sourceId && frameSeq !== null && sentEpochMs !== null && isTelemetryActive(sourceId)) {
          frameAckPayload.sourceId = sourceId
          frameAckPayload.seq = frameSeq
          frameAckPayload.sentEpochMs = sentEpochMs
          frameAckPayload.receiverEpochMs = Date.now()
          frameAckPayload.receiverPerfMs = performance.now()
          trySendJson(frameAckPayload)
        }
      }

      ws.onopen = () => {
        beginExternalCursorInputSession()
        unregisterLifecycleSender?.()
        unregisterLifecycleSender = registerExternalCursorLifecycleSender(trySendJson)
      }

      ws.onclose = () => {
        unregisterLifecycleSender?.()
        unregisterLifecycleSender = null
        ws = null
        endExternalCursorInputSession()
        if (disposed) return
        scheduleReconnect()
      }

      ws.onerror = () => {
        ws?.close()
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      unregisterLifecycleSender?.()
      unregisterLifecycleSender = null
      ws?.close()
      endExternalCursorInputSession()
    }
  }, [settingsVersion])

  return null
}
