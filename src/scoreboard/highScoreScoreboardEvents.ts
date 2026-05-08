import {
  getHighScoreSubmissionPreviewPlacement,
  getHighScoreSubmissionSnapshot,
  subscribeHighScoreSubmissionSnapshot,
  type HighScoreSubmissionRecord,
} from '@/scoreboard/highScoreSubmissionRuntime'
import type {
  HighScoreListSlotEntry,
  HighScoreScoreboardEntry,
  HighScoresUpdatedEvent,
  LiveRankUpdatedEvent,
} from '@/scoreboard/scoreboardEvents'
import { sendScoreboardEvent } from '@/scoreboard/scoreboardSender'
import type { HighScoreStorageMode } from '@/settings/GameSettings.types'

const HIGH_SCORE_TOP_ROW_COUNT = 5
const NEIGHBOR_ROW_COUNT = 4
const LIST_SLOT_COUNT = 5
const PLAYER_OPACITY = 1
const NEIGHBOR_OPACITY = 0.5
const EMPTY_OPACITY = 0
const PLAYER_INITIALS_PLACEHOLDER = 'YOU'

type ListSlotCandidate = {
  rank: number
  initials: string
  score: number
  isPlayer: boolean
  isEmpty: boolean
}

type HighScoreUpdatedFocus = {
  latestRunId?: string | null
  storageMode?: HighScoreStorageMode
}

type LiveRankUpdatedInput = {
  score?: number
  runId?: string
  playerInitials?: string
}

let lastKnownStorageMode: HighScoreStorageMode | null = null
let currentPlayerScore = 0
let currentPlayerInitials = PLAYER_INITIALS_PLACEHOLDER
let currentRunId = ''

function normalizeScore(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}

function normalizeRunId(value: string | undefined): string {
  if (typeof value !== 'string') return 'scoreboard-initial'
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : 'scoreboard-initial'
}

function normalizePlayerInitials(value: string | undefined): string {
  if (typeof value !== 'string') return PLAYER_INITIALS_PLACEHOLDER
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.toUpperCase() : PLAYER_INITIALS_PLACEHOLDER
}

function resolveStorageMode(focus?: HighScoreUpdatedFocus): HighScoreStorageMode {
  if (focus?.storageMode) {
    lastKnownStorageMode = focus.storageMode
    return focus.storageMode
  }
  if (lastKnownStorageMode) return lastKnownStorageMode
  const preview = getHighScoreSubmissionPreviewPlacement(0)
  lastKnownStorageMode = preview.storageMode
  return preview.storageMode
}

function toEntry(record: HighScoreSubmissionRecord, index: number): HighScoreScoreboardEntry {
  return {
    rank: index + 1,
    initials: record.initials,
    score: record.score,
    runId: record.runId,
  }
}

function buildTopEntries(entries: HighScoreScoreboardEntry[]): HighScoreScoreboardEntry[] {
  return entries.slice(0, HIGH_SCORE_TOP_ROW_COUNT)
}

function selectNeighborsForRank(
  entries: readonly HighScoreScoreboardEntry[],
  projectedRank: number,
): HighScoreScoreboardEntry[] {
  if (entries.length === 0) return []

  // Stored entries below the player's projected slot get shifted +1 to make room for the player.
  const above = entries.filter((entry) => entry.rank < projectedRank)
  const belowShifted = entries
    .filter((entry) => entry.rank >= projectedRank)
    .map((entry) => ({ ...entry, rank: entry.rank + 1 }))

  const desiredAbove = 2
  const desiredBelow = NEIGHBOR_ROW_COUNT - desiredAbove

  const aboveCount = above.length
  const belowCount = belowShifted.length

  let takeAbove = Math.min(desiredAbove, aboveCount)
  let takeBelow = Math.min(desiredBelow, belowCount)
  const shortfall = NEIGHBOR_ROW_COUNT - (takeAbove + takeBelow)

  if (shortfall > 0) {
    const extraBelow = Math.min(shortfall, belowCount - takeBelow)
    takeBelow += extraBelow
    const stillShort = NEIGHBOR_ROW_COUNT - (takeAbove + takeBelow)
    if (stillShort > 0) {
      takeAbove += Math.min(stillShort, aboveCount - takeAbove)
    }
  }

  const aboveSlice = above.slice(aboveCount - takeAbove, aboveCount)
  const belowSlice = belowShifted.slice(0, takeBelow)
  return [...aboveSlice, ...belowSlice]
}

function buildPlayerListSlots(args: {
  playerScore: number
  playerRank: number
  playerInitials: string
  neighbors: readonly HighScoreScoreboardEntry[]
}): HighScoreListSlotEntry[] {
  const candidates: ListSlotCandidate[] = [
    {
      rank: args.playerRank,
      initials: args.playerInitials,
      score: args.playerScore,
      isPlayer: true,
      isEmpty: false,
    },
    ...args.neighbors.map((n) => ({
      rank: n.rank,
      initials: n.initials,
      score: n.score,
      isPlayer: false,
      isEmpty: false,
    })),
  ]

  candidates.sort((a, b) => a.rank - b.rank)

  while (candidates.length < LIST_SLOT_COUNT) {
    candidates.push({ rank: 0, initials: '', score: 0, isPlayer: false, isEmpty: true })
  }

  return candidates.slice(0, LIST_SLOT_COUNT).map((c) => ({
    rank: c.rank,
    initials: c.initials,
    score: c.score,
    opacity: c.isEmpty ? EMPTY_OPACITY : c.isPlayer ? PLAYER_OPACITY : NEIGHBOR_OPACITY,
  }))
}

export function createHighScoresUpdatedEvent(focus?: HighScoreUpdatedFocus): HighScoresUpdatedEvent {
  const snapshot = getHighScoreSubmissionSnapshot()
  const entries = snapshot.map(toEntry)
  const latestRunId = typeof focus?.latestRunId === 'string' && focus.latestRunId.trim().length > 0
    ? focus.latestRunId.trim()
    : null

  return {
    type: 'high_scores_updated',
    timestamp: Date.now(),
    runId: latestRunId ?? 'high-scores',
    topEntries: buildTopEntries(entries),
    totalEntries: entries.length,
    storageMode: resolveStorageMode(focus),
    latestRunId,
  }
}

export function sendHighScoresUpdatedEvent(focus?: HighScoreUpdatedFocus): void {
  sendScoreboardEvent(createHighScoresUpdatedEvent(focus))
}

export function createLiveRankUpdatedEvent(args: LiveRankUpdatedInput = {}): LiveRankUpdatedEvent {
  const playerScore = normalizeScore(args.score)
  const playerInitials = normalizePlayerInitials(args.playerInitials)
  const runId = normalizeRunId(args.runId)
  const placement = getHighScoreSubmissionPreviewPlacement(playerScore)
  const projectedRank = placement.rank ?? placement.totalEntries + 1
  lastKnownStorageMode = placement.storageMode

  const snapshotEntries = getHighScoreSubmissionSnapshot().map(toEntry)
  const neighbors = selectNeighborsForRank(snapshotEntries, projectedRank)
  const listSlots = buildPlayerListSlots({
    playerScore,
    playerRank: projectedRank,
    playerInitials,
    neighbors,
  })

  return {
    type: 'live_rank_updated',
    timestamp: Date.now(),
    runId,
    score: playerScore,
    rank: projectedRank,
    playerInitials,
    listSlots,
  }
}

function emitLiveRankUpdate(): void {
  sendScoreboardEvent(createLiveRankUpdatedEvent({
    score: currentPlayerScore,
    runId: currentRunId,
    playerInitials: currentPlayerInitials,
  }))
}

export function resetHighScoreLiveTracker(): void {
  currentPlayerInitials = PLAYER_INITIALS_PLACEHOLDER
}

export function sendLiveRankUpdate(args: {
  score: number
  runId: string
}): void {
  currentPlayerScore = args.score
  currentRunId = args.runId
  emitLiveRankUpdate()
}

export function setLivePlayerInitials(initials: string): void {
  const normalized = (initials || '').toUpperCase()
  if (normalized === currentPlayerInitials) return
  currentPlayerInitials = normalized
  emitLiveRankUpdate()
}

export function initHighScoreScoreboardEvents(): () => void {
  return subscribeHighScoreSubmissionSnapshot(() => {
    sendHighScoresUpdatedEvent()
  })
}
