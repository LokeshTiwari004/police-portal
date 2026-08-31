import { useEffect, useState } from 'react'
import { incidentStore, type Incident } from '../lib/incidentStore'

/**
 * ERSS-112 dispatch console: live list of incidents from the shared store with
 * keyword-based nature classification and unit assignment. Mirrors the
 * dispatch/* WebMCP tools so the agent and the UI reflect the same state.
 */

const UNITS = [
  { id: 'AMB-147', type: 'Ambulance', eta: 4, status: 'enroute' },
  { id: 'PCR-88', type: 'Patrol', eta: 2, status: 'available' },
  { id: 'FIR-2', type: 'Fire', eta: 6, status: 'available' },
] as const

function classifyNature(text: string): { code: string; label: string } {
  const t = text.toLowerCase()
  if (/heart|attack|medical|ambulance|breath/.test(t)) return { code: 'MED-001', label: 'Medical Emergency' }
  if (/fire|smoke|burn/.test(t)) return { code: 'FIR-003', label: 'Fire' }
  if (/stolen|theft|rob|assault|fight/.test(t)) return { code: 'POL-007', label: 'Police Assistance' }
  if (/missing|child|women|harass/.test(t)) return { code: 'WCH-004', label: 'Women & Child' }
  return { code: 'GEN-000', label: 'General' }
}

export default function DispatchConsole() {
  const [incidents, setIncidents] = useState<Incident[]>(() => incidentStore.list())

  useEffect(() => {
    return incidentStore.subscribe(setIncidents)
  }, [])

  function assign(id: string, unitId: string) {
    const inc = incidentStore.get(id)
    if (!inc) return
    const unit = UNITS.find((u) => u.id === unitId)
    const nature = classifyNature(inc.complainant.name + ' ' + inc.narrative)
    incidentStore.update(id, {
      status: 'dispatched',
      dispatch: {
        channel: inc.dispatch?.channel ?? 'SMS',
        natureCode: inc.dispatch?.natureCode ?? nature.code,
        priority: inc.dispatch?.priority ?? 'routine',
        location: inc.dispatch?.location ?? { lat: 0, lng: 0, label: '' },
        unit: { id: unitId, type: unit?.type ?? 'Patrol', etaMinutes: unit?.eta ?? 4 },
      },
    })
  }

  if (incidents.length === 0) {
    return <p className="text-slate-600">No incidents in the dispatch queue. File an FIR first.</p>
  }

  return (
    <div className="space-y-4">
      {incidents.map((inc) => {
        const nature = classifyNature(inc.complainant.name + ' ' + inc.narrative)
        const current = inc.dispatch?.unit?.id
        return (
          <div key={inc.id} className="rounded border border-slate-200 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{inc.firNumber}</div>
                <div className="text-sm text-slate-500">
                  {inc.complainant.name || 'Unknown complainant'} · {inc.status}
                </div>
              </div>
              <span className="text-xs rounded-full bg-slate-100 px-2 py-1">{nature.code} · {nature.label}</span>
            </div>
            {inc.narrative && <p className="mt-2 text-sm text-slate-600">{inc.narrative}</p>}
            <div className="mt-3 flex gap-2 flex-wrap">
              {UNITS.map((u) => (
                <button
                  key={u.id}
                  onClick={() => assign(inc.id, u.id)}
                  disabled={current === u.id}
                  className={`rounded px-3 py-1.5 text-xs font-medium ${
                    current === u.id
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-800 text-white hover:bg-slate-700'
                  }`}
                >
                  {u.id} · {u.type} · ETA {u.eta}m{current === u.id ? ' (assigned)' : ''}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
