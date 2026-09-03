import { type Incident } from '../lib/incidentStore'

/**
 * Shared record browser: filters incidents from the store and lets the officer
 * pick a specific one to work on. Powers the individual-record views in the
 * FIR / e-Challan / ERSS-112 tabs (the tools operate on incidentStore[0], the
 * most recent; this lets humans + agents select any record instead).
 */

export type RecordFilter = {
  text: string
  status: string // '' = all
  hasFir: boolean
  hasChallan: boolean
  hasDispatch: boolean
}

export function defaultFilter(): RecordFilter {
  return { text: '', status: '', hasFir: false, hasChallan: false, hasDispatch: false }
}

export function filterIncidents(incidents: Incident[], f: RecordFilter): Incident[] {
  const q = f.text.trim().toLowerCase()
  return incidents.filter((inc) => {
    if (f.status && inc.status !== f.status) return false

    const fir = !!inc.complainant.name || inc.offense.sections.length > 0 || (!inc.challan && !inc.dispatch)
    const challan = !!inc.challan
    const dispatch = !!inc.dispatch
    const inModule = (f.hasFir && fir) || (f.hasChallan && challan) || (f.hasDispatch && dispatch)
    if (!inModule) return false

    if (!q) return true
    return (
      inc.firNumber.toLowerCase().includes(q) ||
      (inc.complainant.name || '').toLowerCase().includes(q) ||
      (inc.narrative || '').toLowerCase().includes(q) ||
      (inc.challan?.rcNumber || '').toLowerCase().includes(q) ||
      (inc.dispatch?.natureCode || '').toLowerCase().includes(q)
    )
  })
}

const STATUSES = ['draft', 'acknowledged', 'dispatched', 'closed']

export function RecordBrowser({
  incidents,
  filter,
  activeId,
  onFilter,
  onSelect,
}: {
  incidents: Incident[]
  filter: RecordFilter
  activeId?: string
  onFilter: (f: RecordFilter) => void
  onSelect: (inc: Incident, deselect?: boolean) => void
}) {
  const results = filterIncidents(incidents, filter)
  return (
    <div className="rounded border border-slate-200 p-4">
      <h3 className="font-semibold mb-2">
        Records <span className="text-xs text-slate-400">({results.length}/{incidents.length})</span>
      </h3>

      <div className="grid sm:grid-cols-2 gap-2 mb-2">
        <input
          value={filter.text}
          onChange={(e) => onFilter({ ...filter, text: e.target.value })}
          placeholder="Search FIR #, complainant, narrative, RC, nature…"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          value={filter.status}
          onChange={(e) => onFilter({ ...filter, status: e.target.value })}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
        <span className="mr-1">Modules:</span>
        {[
          ['hasFir', 'FIR'],
          ['hasChallan', 'e-Challan'],
          ['hasDispatch', 'ERSS-112'],
        ].map(([key, label]) => (
          <label key={key} className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={(filter as Record<string, unknown>)[key] as boolean}
              onChange={(e) => onFilter({ ...filter, [key]: e.target.checked })}
              className="accent-emerald-600"
            />
            {label}
          </label>
        ))}
      </div>

      {results.length === 0 ? (
        <p className="text-sm text-slate-500">No records match the current filters.</p>
      ) : (
        <ul className="max-h-64 overflow-auto divide-y divide-slate-100">
          {results.slice(0, 60).map((inc) => {
            const fir = inc.complainant.name || inc.offense.sections.length > 0
            const badges: string[] = []
            if (fir) badges.push('FIR')
            if (inc.challan) badges.push(`e-Challan ${inc.challan.rcNumber}`)
            if (inc.dispatch) badges.push('ERSS-112')
            return (
              <li key={inc.id}>
                <button
                  onClick={() => onSelect(inc, activeId === inc.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm rounded hover:bg-slate-50 flex items-start justify-between gap-2 ${
                    activeId === inc.id ? 'bg-emerald-50 border border-emerald-200' : ''
                  }`}
                >
                  <span>
                    <span className="font-medium">{inc.firNumber}</span>
                    {inc.complainant.name && <span className="text-slate-600"> · {inc.complainant.name}</span>}
                    <div className="text-xs text-slate-400">
                      {inc.status}
                      {inc.offense.sections.length > 0 && <span> · s/{inc.offense.sections.join(', ')}</span>}
                      {inc.createdAt && <span> · {new Date(inc.createdAt).toLocaleDateString()}</span>}
                    </div>
                    <div className="text-xs text-slate-400">{badges.join('  ·  ')}</div>
                  </span>
                  <span className="text-slate-400">▸</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}