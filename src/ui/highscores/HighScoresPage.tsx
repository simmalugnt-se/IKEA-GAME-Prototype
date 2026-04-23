import { useEffect, useMemo, useState } from 'react'
import {
  getHighScoreSubmissionSnapshot,
  subscribeHighScoreSubmissionSnapshot,
  type HighScoreSubmissionRecord,
} from '@/scoreboard/highScoreSubmissionRuntime'
import { getActiveBackground } from '@/settings/GameSettings'
import { formatScore } from '@/ui/scoreFormat'
import './highScoresPage.css'

function formatSubmittedAt(value: HighScoreSubmissionRecord['submittedAtMs']): string {
  if (!Number.isFinite(value)) return '-'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function HighScoresPage() {
  const [snapshot, setSnapshot] = useState<readonly HighScoreSubmissionRecord[]>(() => (
    getHighScoreSubmissionSnapshot()
  ))
  const background = useMemo(() => getActiveBackground(), [])

  useEffect(() => {
    setSnapshot(getHighScoreSubmissionSnapshot())
    return subscribeHighScoreSubmissionSnapshot((nextSnapshot) => {
      setSnapshot(nextSnapshot)
    })
  }, [])

  return (
    <main className="high-scores-page" style={{ background }}>
      <div className="high-scores-page__inner">
        <header className="high-scores-page__header">
          <h1 className="popdot-text-base popdot-style-1 popdot-shadow-8 high-scores-page__title">
            HIGH SCORES
          </h1>
          <div className="popdot-text-base popdot-style-3 high-scores-page__meta">
            {snapshot.length} ENTRIES
          </div>
        </header>

        <section className="high-scores-table-wrap" aria-label="High score leaderboard">
          <table className="high-scores-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">initials</th>
                <th scope="col">score</th>
                <th scope="col">date</th>
                <th scope="col">reason</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.length === 0 ? (
                <tr>
                  <td className="high-scores-table__empty" colSpan={5}>
                    No scores yet
                  </td>
                </tr>
              ) : snapshot.map((entry, index) => (
                <tr key={`${entry.runId}-${entry.submittedAtMs}-${entry.score}`}>
                  <td className="high-scores-table__rank">{index + 1}</td>
                  <td className="high-scores-table__initials">{entry.initials}</td>
                  <td className="high-scores-table__score">{formatScore(entry.score)}</td>
                  <td>{formatSubmittedAt(entry.submittedAtMs)}</td>
                  <td>{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  )
}
