import { useEffect, useState } from 'react'
import { registerTools } from './lib/webmcpTools'

type Tab = 'fir' | 'challan' | 'dispatch'

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: 'fir', label: 'FIR', blurb: 'File a First Information Report (CCTNS F13)' },
  { id: 'challan', label: 'e-Challan', blurb: 'Generate traffic challans' },
  { id: 'dispatch', label: 'ERSS-112', blurb: 'Emergency dispatch console' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('fir')
  const [toolsRegistered, setToolsRegistered] = useState(0)

  useEffect(() => {
    let cancelled = false
    registerTools(tab).then(async () => {
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
  }, [tab])

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

          {tab === 'fir' && (
            <div className="text-slate-600">
              <p className="mb-3">
                This is the <strong>FIR module</strong>. In the next build step we wire the live
                dynamic form driven by <code className="bg-slate-100 px-1 rounded">formSchema.json</code>.
              </p>
              <p className="text-sm text-slate-500">
                Try in console:
                <code className="block bg-slate-100 px-2 py-1 rounded mt-1">
                  const t = await document.modelContext.getTools(); t.map(x =&gt; x.name).filter(n =&gt; n.startsWith('fir/'))
                </code>
              </p>
            </div>
          )}
          {tab === 'challan' && (
            <p className="text-slate-600">e-Challan module — scaffolded in the Should-Have phase.</p>
          )}
          {tab === 'dispatch' && (
            <p className="text-slate-600">ERSS-112 dispatch console — stretch goal, not yet built.</p>
          )}
        </div>
      </main>
    </div>
  )
}
