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

  // Listen for nav.switch_tab (WebMCP) so the agent can move the officer to the
  // same module. The tool dispatches a `portal:tabchange` CustomEvent; the UI
  // reacts by switching tabs live.
  useEffect(() => {
    const onTabChange = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const next = detail?.tab as Tab | undefined
      if (next && TABS.some((t) => t.id === next)) setTab(next)
    }
    window.addEventListener('portal:tabchange', onTabChange)
    return () => window.removeEventListener('portal:tabchange', onTabChange)
  }, [])

  useEffect(() => {
    let cancelled = false
    // Register all 13 tools on first load so the full surface is available to an
    // agent immediately, regardless of which tab is open. Registration is
    // idempotent, so re-runs are safe no-ops.
    //
    // `document.modelContext` can init late (after first paint / StrictMode). If
    // it is not ready at mount, keep polling briefly until it appears so the
    // tools are exposed the moment WebMCP becomes available.
    async function register() {
      const mc = (document as unknown as { modelContext?: any }).modelContext
      const ready = !!mc && typeof mc.registerTool === 'function'
      if (!ready) {
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 250))
          if (cancelled) return
          const again = (document as unknown as { modelContext?: any }).modelContext
          if (again && typeof again.registerTool === 'function') break
          if (i === 7) return // gave up after ~2s
        }
      }
      if (cancelled) return
      await registerAllTools()
      try {
        const mc2 = (document as unknown as { modelContext?: any }).modelContext
        const all = mc2 ? await mc2.getTools() : []
        setToolsRegistered(all.length)
      } catch {
        setToolsRegistered(0)
      }
    }
    register()
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
            {toolsRegistered > 0 && (
              <div className="text-emerald-600/50 text-[11px] max-w-[260px] text-left mt-1">
                Agent: use the WebMCP tools (record.list → module tools). Do NOT drive/click the page —
                I react to your tool calls.
              </div>
            )}
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
