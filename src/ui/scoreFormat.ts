export const THOUSANDS_SEPARATOR = '\u200A'

export function formatScore(value: number): string {
  const truncated = Number.isFinite(value) ? Math.trunc(value) : 0
  const sign = truncated < 0 ? '-' : ''
  const digits = Math.abs(truncated).toString()
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR)}`
}
