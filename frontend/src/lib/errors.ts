/** Parses Wails Go errors shaped as `CODE: message` from apperror.Error. */
export function parseAppError(err: unknown): { code: string; message: string } {
  const raw = String(err)
  const idx = raw.indexOf(": ")
  if (idx > 0) {
    const code = raw.slice(0, idx)
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(code)) {
      return { code, message: raw.slice(idx + 2) }
    }
  }
  return { code: "", message: raw }
}

export function isPlanRequired(err: unknown): boolean {
  return parseAppError(err).code === "PlanRequired"
}

export function isConfirmationRequired(err: unknown): boolean {
  return parseAppError(err).code === "ConfirmationRequired"
}

export function isLicenseNetworkError(err: unknown): boolean {
  const { code, message } = parseAppError(err)
  if (code === "NetworkError") return true
  const m = message.toLowerCase()
  return (
    m.includes("connection refused") ||
    m.includes("timeout") ||
    m.includes("no such host") ||
    m.includes("network") ||
    m.includes("dial tcp")
  )
}
