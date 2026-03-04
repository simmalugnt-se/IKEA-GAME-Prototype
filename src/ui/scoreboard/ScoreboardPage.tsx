import { useEffect, useState } from 'react'
import { parseScoreboardEvent, type ScoreboardEvent } from '@/scoreboard/scoreboardEvents'
import { CHANNEL_NAME } from '@/scoreboard/scoreboardSender'

const MAX_FEED_LENGTH = 200

type FeedItem = ScoreboardEvent & { id: number }

let feedIdCounter = 0

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function handleRawMessage(data: unknown, push: (item: FeedItem) => void): void {
  const str = typeof data === 'string' ? data : null
  if (!str) return
  const parsed = parseScoreboardEvent(str)
  if (!parsed) return
  push({ ...parsed, id: feedIdCounter++ })
}

function EventRow({ item }: { item: FeedItem }) {
  const time = formatTime(item.timestamp)

  switch (item.type) {
    case 'game_started':
      return (
        <div style={styles.row}>
          <span style={styles.time}>{time}</span>
          <span style={{ ...styles.badge, background: '#2563eb' }}>START</span>
          <span style={styles.detail}>
            Game started — lives: <b>{item.lives}</b>
          </span>
        </div>
      )
    case 'points_received':
      return (
        <div style={styles.row}>
          <span style={styles.time}>{time}</span>
          <span style={{ ...styles.badge, background: '#16a34a' }}>+{item.points}</span>
          <span style={styles.detail}>
            via <b>{item.generatedBy}</b> — total: <b>{item.totalScore}</b>
          </span>
        </div>
      )
    case 'lives_lost':
      return (
        <div style={styles.row}>
          <span style={styles.time}>{time}</span>
          <span style={{ ...styles.badge, background: '#dc2626' }}>-{item.amount} ♥</span>
          <span style={styles.detail}>
            {item.reason} — remaining: <b>{item.livesRemaining}</b>
          </span>
        </div>
      )
    case 'game_over':
      return (
        <div style={styles.row}>
          <span style={styles.time}>{time}</span>
          <span style={{ ...styles.badge, background: '#7c3aed' }}>OVER</span>
          <span style={styles.detail}>
            Final score: <b>{item.finalScore}</b>
          </span>
        </div>
      )
    case 'combo_triggered':
      return (
        <div style={styles.row}>
          <span style={styles.time}>{time}</span>
          <span style={{ ...styles.badge, background: '#ea580c' }}>x{item.multiplier}</span>
          <span style={styles.detail}>
            Combo strike: <b>{item.strikeSize}</b> pops, chain: <b>+{item.chainBonus}</b>,
            per pop: <b>{item.perPopPoints}</b>, strike: <b>{item.totalPoints}</b>, total: <b>{item.totalScore}</b>
          </span>
        </div>
      )
    case 'idle_started':
      return (
        <div style={styles.row}>
          <span style={styles.time}>{time}</span>
          <span style={{ ...styles.badge, background: '#0ea5e9' }}>IDLE</span>
          <span style={styles.detail}>
            Idle mode started
          </span>
        </div>
      )
    case 'initials_step_started':
      return (
        <div style={styles.row}>
          <span style={styles.time}>{time}</span>
          <span style={{ ...styles.badge, background: '#f59e0b' }}>INITIALS</span>
          <span style={styles.detail}>
            High-score step started — duration: <b>{item.durationMs} ms</b>
          </span>
        </div>
      )
    case 'initials_step_finished':
      return (
        <div style={styles.row}>
          <span style={styles.time}>{time}</span>
          <span style={{ ...styles.badge, background: '#f97316' }}>DONE</span>
          <span style={styles.detail}>
            High-score step finished ({item.reason}) — initials: <b>{item.initials}</b>
          </span>
        </div>
      )
    default:
      return null
  }
}

export function ScoreboardPage() {
  const [feed, setFeed] = useState<FeedItem[]>([])

  const pushItem = (item: FeedItem) => {
    setFeed((prev) => {
      const next = [item, ...prev]
      return next.length > MAX_FEED_LENGTH ? next.slice(0, MAX_FEED_LENGTH) : next
    })
  }

  useEffect(() => {
    const bc = new BroadcastChannel(CHANNEL_NAME)
    bc.onmessage = (event) => {
      handleRawMessage(event.data, pushItem)
    }
    return () => {
      bc.close()
    }
  }, [])

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Scoreboard</h1>
        <div style={styles.statusRow}>
          <span style={styles.statusOn}>
            ● Listening for game events
          </span>
        </div>
      </div>

      <div style={styles.feed}>
        {feed.length === 0 ? (
          <div style={styles.empty}>No events yet. Start a game to see activity.</div>
        ) : (
          feed.map((item) => <EventRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#e2e8f0',
    fontFamily: 'monospace',
    padding: '32px',
    boxSizing: 'border-box' as const,
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '28px',
    fontWeight: 700,
    color: '#f8fafc',
    letterSpacing: '0.05em',
  },
  statusRow: {
    fontSize: '13px',
  },
  statusOn: {
    color: '#4ade80',
  },
  feed: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '6px',
  },
  row: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
    padding: '8px 12px',
    background: '#1e293b',
    borderRadius: '6px',
    fontSize: '13px',
  },
  time: {
    color: '#64748b',
    minWidth: '80px',
    flexShrink: 0 as const,
  },
  badge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#fff',
    minWidth: '60px',
    textAlign: 'center' as const,
    flexShrink: 0 as const,
  },
  detail: {
    color: '#cbd5e1',
  },
  empty: {
    color: '#475569',
    padding: '24px 0',
    fontSize: '14px',
  },
} as const
