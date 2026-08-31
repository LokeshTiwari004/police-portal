import { useEffect, useState } from 'react'
import { telemetry } from '../lib/telemetry'

/**
 * Evaluation scorecard: renders live WebMCP telemetry so judges see real,
 * reproducible measurements (tool count, latency, call volume) on one screen.
 */
export default function MetricsPanel() {
  const [snap, setSnap] = useState(() => telemetry.snapshot())

  useEffect(() => {
    const id = setInterval(() => setSnap(telemetry.snapshot()), 500)
    return () => clearInterval(id)
  }, [])

  const fmt = (ms: number) => `${ms < 1 ? ms.toFixed(2) : Math.round(ms)}ms`

  return (
    <div className="text-sm text-slate-700">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Tools registered (last tab)" value={String(snap.lastRegisteredCount)} />
        <Stat label="Tools registered (ever)" value={String(snap.registeredEver)} />
        <Stat label="Total tool calls" value={String(snap.totalCalls)} />
        <Stat label="Avg call latency" value={fmt(snap.avgMs)} />
      </div>

      <div className="text-slate-500 text-xs mb-2">
        Registration took {fmt(snap.registrationMs)} for the most recent tab switch.
      </div>

      {snap.tools.length === 0 ? (
        <p className="text-slate-400">No WebMCP tools executed yet in this session.</p>
      ) : (
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-slate-500 text-xs border-b border-slate-200">
              <th className="py-1 font-medium">Tool</th>
              <th className="py-1 font-medium text-right">Calls</th>
              <th className="py-1 font-medium text-right">Last</th>
              <th className="py-1 font-medium text-right">Total</th>
              <th className="py-1 font-medium text-right">Error</th>
            </tr>
          </thead>
          <tbody>
            {snap.tools.map((t) => (
              <tr key={t.name} className="border-b border-slate-100">
                <td className="py-1 font-mono text-xs">{t.name}</td>
                <td className="py-1 text-right">{t.calls}</td>
                <td className="py-1 text-right">{fmt(t.lastMs)}</td>
                <td className="py-1 text-right">{fmt(t.totalMs)}</td>
                <td className="py-1 text-right">{t.lastError ? <span className="text-red-500">fail</span> : <span className="text-emerald-500">ok</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}
