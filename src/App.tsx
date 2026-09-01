import { useEffect, useState } from 'react'
import { registerAllTools } from './lib/webmcpTools'
import FIRForm from './components/FIRForm'
import ChallanGenerator from './components/ChallanGenerator'
import DispatchConsole from './components/DispatchConsole'
import MetricsPanel from './components/MetricsPanel'

type Tab = 'fir' | 'challan' | 'dispatch' | 'metrics'

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: 'fir', label: 'FIR', blurb: 'File a First Information Report (CCTNS F13)' },
  { id: 'challan', label: 'e-Challan', blurb: 'Generate traffic challans' },
  { id: 'dispatch', label: 'ERSS-112', blurb: 'Emergency dispatch console' },
  { id: 'metrics', label: 'Metrics', blurb: 'Live WebMCP tool telemetry & evaluation scorecard' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('fir')
  const [toolsRegistered, setToolsRegistered] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Register all 12 tools on first load so the full surface is available to an
    // agent immediately, regardless of which tab is open. Registration is
    // idempotent, so re-runs are safe no-ops.
    registerAllTools().then(async () => {
      if (cancelled) return
      try {
        const mc = (document as unknown as { modelContext?: any }).modelContext
        const all = mc ? await mc.getTools() : []
        setToolsRegistered(all.length)
      } catch {
        setToolsRegistered(0)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 text-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Digital Police Portal</h1>
            <p className="text-slate-400 text-sm">WebMCP-enabled · humans + agents working together</p>
          </div>
          <div className="text-right text-sm">
            <div className={toolsRegistered > 0 ? 'text-emerald-400' : 'text-amber-400'}>
              {toolsRegistered > 0 ? `${toolsRegistered} WebMCP tools live` : 'WebMCP tools pending (enable chrome://flags/#enable-webmcp-testing)'}
            </div>
          </div>
        </div>
        <nav className="max-w-5xl mx-auto mt-4 flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded text-sm font-medium transition ${
                tab === t.id ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-1">
            {TABS.find((t) => t.id === tab)?.label}
          </h2>
          <p className="text-slate-500 text-sm mb-6">{TABS.find((t) => t.id === tab)?.blurb}</p>

          {tab === 'fir' && <FIRForm />}
          {tab === 'challan' && <ChallanGenerator />}
          {tab === 'dispatch' && <DispatchConsole />}
          {tab === 'metrics' && <MetricsPanel />}
        </div>
      </main>
    </div>
  )
}
