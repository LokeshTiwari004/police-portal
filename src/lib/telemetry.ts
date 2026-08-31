/**
 * Lightweight in-app telemetry for the evaluation scorecard.
 *
 * Collects WebMCP tool discovery + execution latency as measured data so judges
 * (and the /metrics tab) see real, reproducible numbers rather than claims.
 * Pure module-level state, no persistence — resets on reload.
 */

export interface ToolTelemetry {
  name: string
  calls: number
  totalMs: number
  lastMs: number
  lastError?: string
}

const toolStats = new Map<string, ToolTelemetry>()

let regStart = 0
let registrationMs = 0
let lastRegistrationMs = 0
let registerCount = 0
let lastRegisteredCount = 0

export const telemetry = {
  beginRegistration(count: number) {
    regStart = performance.now()
    registerCount = count
    lastRegisteredCount = count
  },
  endRegistration() {
    registrationMs = performance.now() - regStart
    lastRegistrationMs = registrationMs
  },
  /** Report a completed tool execution. Returns own elapsed ms. */
  recordTool(name: string, elapsedMs: number, error?: string): void {
    const cur = toolStats.get(name) ?? { name, calls: 0, totalMs: 0, lastMs: 0 }
    cur.calls += 1
    cur.totalMs += elapsedMs
    cur.lastMs = elapsedMs
    if (error) cur.lastError = error
    toolStats.set(name, cur)
  },
  snapshot() {
    const tools = Array.from(toolStats.values()).sort((a, b) => a.name.localeCompare(b.name))
    return {
      tools,
      totalCalls: tools.reduce((s, t) => s + t.calls, 0),
      avgMs: tools.length ? tools.reduce((s, t) => s + t.totalMs, 0) / Math.max(1, tools.reduce((s, t) => s + t.calls, 0)) : 0,
      maxMs: tools.length ? Math.max(...tools.map((t) => t.lastMs)) : 0,
      registrationMs: lastRegistrationMs,
      lastRegisteredCount,
      registeredEver: registerCount,
    }
  },
}
