/** Human-readable row count (e.g. 1.2M). */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** Human-readable byte size (binary units). */
export function formatBytes(n: number): string {
  if (n === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"] as const
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const digits = i === 0 ? 0 : 1
  return `${v.toFixed(digits)} ${units[i]}`
}
