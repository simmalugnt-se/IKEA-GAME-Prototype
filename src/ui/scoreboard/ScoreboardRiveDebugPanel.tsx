import { useEffect, useState } from 'react'
import type {
  HighScoreListSlotEntry,
  HighScoreScoreboardEntry,
  ScoreboardEvent,
} from '@/scoreboard/scoreboardEvents'

type ScoreboardEventType = ScoreboardEvent['type']

type ScoreboardRiveDebugPanelProps = {
  open: boolean
  latestEvent: ScoreboardEvent | null
  onTriggerEvent: (event: ScoreboardEvent) => void
}

const EVENT_TYPES: ScoreboardEventType[] = [
  'idle_started',
  'game_started',
  'points_received',
  'combo_triggered',
  'game_event_triggered',
  'lives_lost',
  'game_over',
  'initials_step_started',
  'initials_step_finished',
  'high_scores_updated',
  'live_rank_updated',
]

const SCOREBOARD_EVENT_SOURCES = [
  'balloon_pop',
  'balloon_combo',
  'contagion',
  'spawn_item_bonus',
  'spawn_item_penalty',
  'unknown',
] as const

function getCommonDraftFields(previous?: ScoreboardEvent) {
  return {
    timestamp: previous?.timestamp ?? Date.now(),
    runId: previous?.runId || 'debug',
  }
}

function createManualEventBase() {
  return {
    timestamp: Date.now(),
    runId: 'debug',
  }
}

function createManualGameEventPayload(eventId: string): Record<string, unknown> {
  if (eventId === 'timebonus') {
    return {
      awardedMs: 5000,
      reason: 'debug',
    }
  }
  return {
    actionType: eventId || 'debug_event',
  }
}

function createDebugHighScoreEntry(rank: number, score: number, initials = 'AAA'): HighScoreScoreboardEntry {
  return {
    rank,
    initials,
    score,
    runId: `debug-rank-${rank}`,
  }
}

function createDebugHighScoreEntries(startRank: number, focusRank: number | null): HighScoreScoreboardEntry[] {
  return Array.from({ length: 5 }, (_, index) => {
    const rank = startRank + index
    return createDebugHighScoreEntry(
      rank,
      Math.max(0, 120000 - rank * 750),
      rank === focusRank ? 'YOU' : `P${rank}`,
    )
  })
}

function createDebugListSlots(playerRank: number, playerScore: number): HighScoreListSlotEntry[] {
  // Player + 2 above + 2 below, sorted by rank with player marked via opacity=100.
  const above = [playerRank - 2, playerRank - 1].filter((r) => r > 0).map((rank) => ({
    rank,
    initials: `P${rank}`,
    score: Math.max(0, 120000 - rank * 750),
    opacity: 0.25,
  }))
  const below = [playerRank + 1, playerRank + 2].map((rank) => ({
    rank,
    initials: `P${rank}`,
    score: Math.max(0, 120000 - rank * 750),
    opacity: 0.25,
  }))
  const player = {
    rank: playerRank,
    initials: 'YOU',
    score: playerScore,
    opacity: 1,
  }
  const slots = [...above, player, ...below].sort((a, b) => a.rank - b.rank).slice(0, 5)
  while (slots.length < 5) {
    slots.push({ rank: 0, initials: '', score: 0, opacity: 0 })
  }
  return slots
}

function createDefaultEvent(type: ScoreboardEventType, previous?: ScoreboardEvent): ScoreboardEvent {
  const common = getCommonDraftFields(previous)

  switch (type) {
    case 'idle_started':
      return {
        type,
        ...common,
      }

    case 'game_started':
      return {
        type,
        ...common,
        score: previous && 'score' in previous ? previous.score : 0,
        lives: previous && 'lives' in previous ? previous.lives : 3,
        runMode: previous && 'runMode' in previous ? previous.runMode : 'lives',
        timeLimitMs: previous && 'timeLimitMs' in previous ? previous.timeLimitMs : 60_000,
      }

    case 'points_received':
      return {
        type,
        ...common,
        points: previous && 'points' in previous ? previous.points : 250,
        generatedBy: previous && 'generatedBy' in previous ? previous.generatedBy : 'unknown',
        totalScore: previous && 'totalScore' in previous ? previous.totalScore : 250,
      }

    case 'combo_triggered':
      return {
        type,
        ...common,
        multiplier: previous && 'multiplier' in previous ? previous.multiplier : 2,
        strikeSize: previous && 'strikeSize' in previous ? previous.strikeSize : 2,
        chainBonus: previous && 'chainBonus' in previous ? previous.chainBonus : 0,
        perPopPoints: previous && 'perPopPoints' in previous ? previous.perPopPoints : 100,
        totalPoints: previous && 'totalPoints' in previous ? previous.totalPoints : 200,
        totalScore: previous && 'totalScore' in previous ? previous.totalScore : 200,
      }

    case 'game_event_triggered':
      return {
        type,
        ...common,
        eventId: previous && 'eventId' in previous ? previous.eventId : 'timebonus',
        payload: previous && 'payload' in previous ? previous.payload : { awardedMs: 5000, reason: 'debug' },
      }

    case 'lives_lost':
      return {
        type,
        ...common,
        amount: previous && 'amount' in previous ? previous.amount : 1,
        reason: previous?.type === 'lives_lost' ? previous.reason : 'unknown',
        livesRemaining: previous && 'livesRemaining' in previous ? previous.livesRemaining : 2,
      }

    case 'game_over':
      return {
        type,
        ...common,
        finalScore: previous && 'finalScore' in previous ? previous.finalScore : 1000,
        endReason: previous && 'endReason' in previous ? previous.endReason : 'lives_depleted',
      }

    case 'initials_step_started':
      return {
        type,
        ...common,
        durationMs: previous && 'durationMs' in previous ? previous.durationMs : 15_000,
      }

    case 'initials_step_finished':
      return {
        type,
        ...common,
        reason: previous?.type === 'initials_step_finished' ? previous.reason : 'submitted',
        initials: previous && 'initials' in previous ? previous.initials : 'PBK',
        score: previous && 'score' in previous ? previous.score : 1000,
        submittedAtMs: previous && 'submittedAtMs' in previous ? previous.submittedAtMs : Date.now(),
        rank: previous && 'rank' in previous ? previous.rank : 1,
        totalEntries: previous && 'totalEntries' in previous ? previous.totalEntries : 1,
        storageMode: previous && 'storageMode' in previous ? previous.storageMode : 'memory',
      }

    case 'high_scores_updated':
      return {
        type,
        ...common,
        topEntries: previous && 'topEntries' in previous
          ? previous.topEntries
          : createDebugHighScoreEntries(1, null),
        totalEntries: previous && 'totalEntries' in previous ? previous.totalEntries : 106,
        storageMode: previous && 'storageMode' in previous ? previous.storageMode : 'memory',
        latestRunId: previous && 'latestRunId' in previous ? previous.latestRunId : 'debug-rank-1',
      }

    case 'live_rank_updated': {
      const rank = previous && 'rank' in previous && typeof previous.rank === 'number' ? previous.rank : 47
      const score = previous && 'score' in previous && typeof previous.score === 'number' ? previous.score : 1234
      const playerInitials = previous && 'playerInitials' in previous && typeof previous.playerInitials === 'string'
        ? previous.playerInitials
        : 'YOU'
      return {
        type,
        ...common,
        score,
        rank,
        playerInitials,
        listSlots: previous && 'listSlots' in previous
          ? previous.listSlots
          : createDebugListSlots(rank, score),
      }
    }

    default:
      return {
        type: 'idle_started',
        ...common,
      }
  }
}

function eventLabel(type: ScoreboardEventType): string {
  return type.replace(/_/g, ' ')
}

function normalizeNumber(value: string, fallback = 0): number {
  const next = Number.parseFloat(value)
  return Number.isFinite(next) ? next : fallback
}

function normalizeInt(value: string, fallback = 0): number {
  const next = Number.parseInt(value, 10)
  return Number.isFinite(next) ? next : fallback
}

export function ScoreboardRiveDebugPanel({
  open,
  latestEvent,
  onTriggerEvent,
}: ScoreboardRiveDebugPanelProps) {
  const [draft, setDraft] = useState<ScoreboardEvent>(() => createDefaultEvent('idle_started'))

  useEffect(() => {
    if (!latestEvent) return
    setDraft(latestEvent)
  }, [latestEvent])

  if (!open) return null

  function setEventType(type: ScoreboardEventType): void {
    setDraft((prev) => {
      const next = createDefaultEvent(type, prev)
      return next
    })
  }

  function patchDraft(patch: Record<string, unknown>): void {
    setDraft((prev) => ({ ...prev, ...patch }) as ScoreboardEvent)
  }

  function triggerDraftEvent(): void {
    const manualBase = createManualEventBase()

    if (draft.type === 'game_event_triggered') {
      const event = {
        ...draft,
        ...manualBase,
        payload: createManualGameEventPayload(draft.eventId),
      }
      setDraft(event)
      onTriggerEvent(event)
      return
    }

    const event = {
      ...draft,
      ...manualBase,
    } as ScoreboardEvent
    setDraft(event)
    onTriggerEvent(event)
  }

  function renderTextField(label: string, value: string, onChange: (value: string) => void) {
    return (
      <label style={styles.field}>
        <span>{label}</span>
        <input
          type="text"
          style={styles.input}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </label>
    )
  }

  function renderNumberField(label: string, value: number, onChange: (value: number) => void) {
    return (
      <label style={styles.field}>
        <span>{label}</span>
        <input
          type="number"
          style={styles.input}
          value={value}
          onChange={(event) => onChange(normalizeNumber(event.currentTarget.value, value))}
        />
      </label>
    )
  }

  function renderIntField(label: string, value: number, onChange: (value: number) => void) {
    return (
      <label style={styles.field}>
        <span>{label}</span>
        <input
          type="number"
          step={1}
          style={styles.input}
          value={value}
          onChange={(event) => onChange(normalizeInt(event.currentTarget.value, value))}
        />
      </label>
    )
  }

  function patchHighScoreEntry(
    key: 'topEntries',
    index: number,
    patch: Partial<HighScoreScoreboardEntry>,
  ): void {
    if (draft.type !== 'high_scores_updated') return
    const entries = [...draft[key]]
    const existing = entries[index] ?? createDebugHighScoreEntry(index + 1, 0)
    entries[index] = { ...existing, ...patch }
    patchDraft({ [key]: entries })
  }

  function patchListSlotEntry(
    index: number,
    patch: Partial<HighScoreListSlotEntry>,
  ): void {
    if (draft.type !== 'live_rank_updated') return
    const entries = [...draft.listSlots]
    const existing = entries[index] ?? { rank: 0, initials: '', score: 0, opacity: 0 }
    entries[index] = { ...existing, ...patch }
    patchDraft({ listSlots: entries })
  }

  function renderHighScoreRows(
    label: string,
    key: 'topEntries',
    entries: HighScoreScoreboardEntry[],
  ) {
    return (
      <div style={styles.rowsSection}>
        <div style={styles.rowsTitle}>{label}</div>
        {entries.slice(0, 5).map((entry, index) => (
          <div key={`${key}-${index}`} style={styles.rowGrid}>
            <input
              type="number"
              style={styles.input}
              value={entry.rank}
              onChange={(event) => patchHighScoreEntry(
                key,
                index,
                { rank: normalizeInt(event.currentTarget.value, entry.rank) },
              )}
            />
            <input
              type="text"
              style={styles.input}
              value={entry.initials}
              onChange={(event) => patchHighScoreEntry(
                key,
                index,
                { initials: event.currentTarget.value.toUpperCase() },
              )}
            />
            <input
              type="number"
              style={styles.input}
              value={entry.score}
              onChange={(event) => patchHighScoreEntry(
                key,
                index,
                { score: normalizeInt(event.currentTarget.value, entry.score) },
              )}
            />
          </div>
        ))}
      </div>
    )
  }

  function renderEventFields() {
    switch (draft.type) {
      case 'idle_started':
        return null

      case 'game_started':
        return (
          <>
            {renderIntField('score', draft.score, (score) => patchDraft({ score }))}
            {renderIntField('lives', draft.lives, (lives) => patchDraft({ lives }))}
            <label style={styles.field}>
              <span>runMode</span>
              <select
                style={styles.input}
                value={draft.runMode}
                onChange={(event) => patchDraft({ runMode: event.currentTarget.value })}
              >
                <option value="lives">lives</option>
                <option value="time">time</option>
              </select>
            </label>
            {renderIntField('timeLimitMs', draft.timeLimitMs, (timeLimitMs) => patchDraft({ timeLimitMs }))}
          </>
        )

      case 'points_received':
        return (
          <>
            {renderIntField('points', draft.points, (points) => patchDraft({ points }))}
            <label style={styles.field}>
              <span>generatedBy</span>
              <select
                style={styles.input}
                value={draft.generatedBy}
                onChange={(event) => patchDraft({ generatedBy: event.currentTarget.value })}
              >
                {SCOREBOARD_EVENT_SOURCES.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </label>
            {renderIntField('totalScore', draft.totalScore, (totalScore) => patchDraft({ totalScore }))}
          </>
        )

      case 'combo_triggered':
        return (
          <>
            {renderNumberField('multiplier', draft.multiplier, (multiplier) => patchDraft({ multiplier }))}
            {renderIntField('strikeSize', draft.strikeSize, (strikeSize) => patchDraft({ strikeSize }))}
            {renderIntField('chainBonus', draft.chainBonus, (chainBonus) => patchDraft({ chainBonus }))}
            {renderIntField('perPopPoints', draft.perPopPoints, (perPopPoints) => patchDraft({ perPopPoints }))}
            {renderIntField('totalPoints', draft.totalPoints, (totalPoints) => patchDraft({ totalPoints }))}
            {renderIntField('totalScore', draft.totalScore, (totalScore) => patchDraft({ totalScore }))}
          </>
        )

      case 'game_event_triggered':
        return (
          renderTextField('eventId', draft.eventId, (eventId) => patchDraft({ eventId }))
        )

      case 'lives_lost':
        return (
          <>
            {renderIntField('amount', draft.amount, (amount) => patchDraft({ amount }))}
            <label style={styles.field}>
              <span>reason</span>
              <select
                style={styles.input}
                value={draft.reason}
                onChange={(event) => patchDraft({ reason: event.currentTarget.value })}
              >
                <option value="balloon_missed">balloon_missed</option>
                <option value="unknown">unknown</option>
              </select>
            </label>
            {renderIntField('livesRemaining', draft.livesRemaining, (livesRemaining) => patchDraft({ livesRemaining }))}
          </>
        )

      case 'game_over':
        return (
          <>
            {renderIntField('finalScore', draft.finalScore, (finalScore) => patchDraft({ finalScore }))}
            <label style={styles.field}>
              <span>endReason</span>
              <select
                style={styles.input}
                value={draft.endReason}
                onChange={(event) => patchDraft({ endReason: event.currentTarget.value })}
              >
                <option value="lives_depleted">lives_depleted</option>
                <option value="time_elapsed">time_elapsed</option>
              </select>
            </label>
          </>
        )

      case 'initials_step_started':
        return renderIntField('durationMs', draft.durationMs, (durationMs) => patchDraft({ durationMs }))

      case 'initials_step_finished':
        return (
          <>
            <label style={styles.field}>
              <span>reason</span>
              <select
                style={styles.input}
                value={draft.reason}
                onChange={(event) => patchDraft({ reason: event.currentTarget.value })}
              >
                <option value="submitted">submitted</option>
                <option value="timeout">timeout</option>
              </select>
            </label>
            {renderTextField('initials', draft.initials, (initials) => patchDraft({ initials: initials.toUpperCase() }))}
            {renderIntField('score', draft.score, (score) => patchDraft({ score }))}
            {renderIntField('submittedAtMs', draft.submittedAtMs, (submittedAtMs) => patchDraft({ submittedAtMs }))}
            {renderIntField('rank', draft.rank ?? 0, (rank) => patchDraft({ rank }))}
            {renderIntField('totalEntries', draft.totalEntries, (totalEntries) => patchDraft({ totalEntries }))}
            <label style={styles.field}>
              <span>storageMode</span>
              <select
                style={styles.input}
                value={draft.storageMode}
                onChange={(event) => patchDraft({ storageMode: event.currentTarget.value })}
              >
                <option value="local_storage">local_storage</option>
                <option value="memory">memory</option>
                <option value="database">database</option>
              </select>
            </label>
          </>
        )

      case 'high_scores_updated':
        return (
          <>
            {renderIntField('totalEntries', draft.totalEntries, (totalEntries) => patchDraft({ totalEntries }))}
            {renderTextField('latestRunId', draft.latestRunId ?? '', (latestRunId) => patchDraft({ latestRunId: latestRunId || null }))}
            <label style={styles.field}>
              <span>storageMode</span>
              <select
                style={styles.input}
                value={draft.storageMode}
                onChange={(event) => patchDraft({ storageMode: event.currentTarget.value })}
              >
                <option value="local_storage">local_storage</option>
                <option value="memory">memory</option>
                <option value="database">database</option>
              </select>
            </label>
            {renderHighScoreRows('top 5', 'topEntries', draft.topEntries)}
          </>
        )

      case 'live_rank_updated':
        return (
          <>
            {renderIntField('score', draft.score, (score) => patchDraft({ score }))}
            {renderIntField('rank', draft.rank, (rank) => patchDraft({ rank }))}
            {renderTextField('playerInitials', draft.playerInitials, (playerInitials) => patchDraft({ playerInitials }))}
            <div style={styles.rowsSection}>
              <div style={styles.rowsTitle}>list slots (5)</div>
              {Array.from({ length: 5 }, (_, index) => {
                const entry = draft.listSlots[index] ?? { rank: 0, initials: '', score: 0, opacity: 0 }
                return (
                  <div key={`listSlot-${index}`} style={styles.rowGrid}>
                    <input
                      type="number"
                      style={styles.input}
                      value={entry.rank}
                      onChange={(event) => patchListSlotEntry(index, {
                        rank: normalizeInt(event.currentTarget.value, entry.rank),
                      })}
                    />
                    <input
                      type="text"
                      style={styles.input}
                      value={entry.initials}
                      onChange={(event) => patchListSlotEntry(index, {
                        initials: event.currentTarget.value.toUpperCase(),
                      })}
                    />
                    <input
                      type="number"
                      style={styles.input}
                      value={entry.score}
                      onChange={(event) => patchListSlotEntry(index, {
                        score: normalizeInt(event.currentTarget.value, entry.score),
                      })}
                    />
                    <input
                      type="number"
                      style={styles.input}
                      step={0.01}
                      value={entry.opacity}
                      onChange={(event) => patchListSlotEntry(index, {
                        opacity: normalizeNumber(event.currentTarget.value, entry.opacity),
                      })}
                    />
                  </div>
                )
              })}
            </div>
          </>
        )

      default:
        return null
    }
  }

  return (
    <div style={styles.panel} onPointerDown={(event) => event.stopPropagation()}>
      <div style={styles.title}>Scoreboard Event Debug</div>
      <div style={styles.eventButtons}>
        {EVENT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            style={draft.type === type ? { ...styles.eventButton, ...styles.eventButtonActive } : styles.eventButton}
            onClick={() => setEventType(type)}
          >
            {eventLabel(type)}
          </button>
        ))}
      </div>
      <div style={styles.grid}>
        <label style={{ ...styles.field, gridColumn: 'span 2' }}>
          <span>event type</span>
          <select
            style={styles.input}
            value={draft.type}
            onChange={(event) => setEventType(event.currentTarget.value as ScoreboardEventType)}
          >
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        {renderEventFields()}
      </div>
      <button
        type="button"
        style={styles.triggerButton}
        onClick={triggerDraftEvent}
      >
        trigger event
      </button>
    </div>
  )
}

const styles = {
  panel: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 'min(440px, calc(100vw - 24px))',
    maxHeight: 'min(760px, calc(100vh - 24px))',
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(113, 197, 240, 0.3)',
    background: 'rgba(5, 12, 18, 0.82)',
    color: '#d4f2ff',
    pointerEvents: 'auto' as const,
    zIndex: 26,
  },
  title: {
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  eventButtons: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 5,
  },
  eventButton: {
    minHeight: 24,
    border: '1px solid rgba(125, 211, 252, 0.28)',
    borderRadius: 4,
    background: 'rgba(8, 25, 38, 0.76)',
    color: '#bae6fd',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: 9,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.02em',
  },
  eventButtonActive: {
    borderColor: 'rgba(125, 211, 252, 0.74)',
    background: 'rgba(14, 65, 92, 0.92)',
    color: '#ecfeff',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
  },
  rowsSection: {
    gridColumn: 'span 2',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 5,
  },
  rowsTitle: {
    color: '#bae6fd',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  rowGrid: {
    display: 'grid',
    gridTemplateColumns: '58px minmax(0, 1fr) minmax(0, 1.4fr)',
    gap: 5,
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
    minWidth: 0,
    color: '#bae6fd',
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box' as const,
    border: '1px solid rgba(113, 197, 240, 0.42)',
    borderRadius: 4,
    background: 'rgba(6, 20, 30, 0.92)',
    color: '#ecfeff',
    fontFamily: 'monospace',
    fontSize: 12,
    padding: '4px 6px',
  },
  triggerButton: {
    minHeight: 30,
    border: '1px solid rgba(125, 211, 252, 0.55)',
    borderRadius: 4,
    background: 'rgba(14, 36, 50, 0.95)',
    color: '#e0f2fe',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
} as const
