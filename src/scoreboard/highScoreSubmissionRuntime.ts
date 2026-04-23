import {
  clearHighScoreSnapshot,
  getHighScorePreviewPlacement,
  getHighScoreSnapshot,
  submitHighScore,
  subscribeHighScoreSnapshot,
  type HighScorePreviewPlacement,
  type HighScoreSnapshotListener,
  type HighScoreSubmissionReason,
  type HighScoreSubmissionRecord,
  type HighScoreSubmissionResult,
} from '@/scoreboard/highScoreStoreRuntime'

export type {
  HighScoreSnapshotListener,
  HighScoreSubmissionReason,
  HighScoreSubmissionRecord,
  HighScoreSubmissionResult,
  HighScorePreviewPlacement,
}

export function submitHighScoreSubmission(record: HighScoreSubmissionRecord): Promise<HighScoreSubmissionResult> {
  return submitHighScore(record)
}

// Backward-compat shim for pre-refactor call sites.
export function submitHighScorePlaceholder(record: HighScoreSubmissionRecord): Promise<HighScoreSubmissionResult> {
  return submitHighScore(record)
}

export function getHighScoreSubmissionSnapshot(): readonly HighScoreSubmissionRecord[] {
  return getHighScoreSnapshot()
}

export function getHighScoreSubmissionPreviewPlacement(score: number): HighScorePreviewPlacement {
  return getHighScorePreviewPlacement(score)
}

export function clearHighScoreSubmissionSnapshot(): void {
  clearHighScoreSnapshot()
}

export function subscribeHighScoreSubmissionSnapshot(listener: HighScoreSnapshotListener): () => void {
  return subscribeHighScoreSnapshot(listener)
}
