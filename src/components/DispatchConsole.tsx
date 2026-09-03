import { useEffect, useState } from 'react'
import { incidentStore, type Incident } from '../lib/incidentStore'
import { RecordBrowser, defaultFilter, filterIncidents, type RecordFilter } from './RecordBrowser'
import RecordDetail from './RecordDetail'

/**
 * ERSS-112 dispatch console: live list of incidents from the shared store with
 * keyword-based nature classification and unit assignment. Works both
 * independently (standalone 112 call) and linked to a FIR incident.
 * Mirrors the dispatch/* WebMCP tools so the agent and the UI reflect the same state.
 */

const UNITS = [
  { id: 'AMB-147', type: 'Ambulance', eta: 4, status: 'enroute' },
  { id: 'PCR-88', type: 'Patrol', eta: 2, status: 'available' },
  { id: 'FIR-2', type: 'Fire', eta: 6, status: 'available' },
] as const

const HOSPITALS = [
  { name: 'King George Medical University', ward: 'Emergency', beds: ['E-101', 'E-102', 'E-103'] },
  { name: 'Sanjay Gandhi Postgraduate Institute', ward: 'Trauma', beds: ['T-201', 'T-202'] },
  { name: 'Ram Manohar Lohia Hospital', ward: 'General', beds: ['G-301', 'G-302', 'G-303'] },
]

function classifyNature(text: string): { code: string; label: string } {
  const t = text.toLowerCase()
  if (/heart|attack|medical|ambulance|breath/.test(t)) return { code: 'MED-001', label: 'Medical Emergency' }
  if (/fire|smoke|burn/.test(t)) return { code: 'FIR-003', label: 'Fire' }
  if (/stolen|theft|rob|assault|fight/.test(t)) return { code: 'POL-007', label: 'Police Assistance' }
  if (/missing|child|women|harass/.test(t)) return { code: 'WCH-004', label: 'Women & Child' }
  if (/collision|accident|crash|road/.test(t)) return { code: 'TRF-002', label: 'Traffic' }
  return { code: 'GEN-000', label: 'General' }
}

export default function DispatchConsole() {
  const [allIncidents, setAllIncidents] = useState<Incident[]>(() => incidentStore.list())
  const [filter, setFilter] = useState<RecordFilter>(defaultFilter)
  const [activeId, setActiveId] = useState<string>('')
  const [linkedFirId, setLinkedFirId] = useState<string>('')
  const [newCall, setNewCall] = useState('')
  const [newChannel, setNewChannel] = useState<'Voice' | 'SMS' | 'WhatsApp'>('Voice')

  useEffect(() => {
    return incidentStore.subscribe((incidents) => {
      setAllIncidents(incidents)
      if (activeId && !incidents.some((i) => i.id === activeId)) setActiveId(incidents[0]?.id ?? '')
    })
  }, [activeId])

  // The officer selects a specific record to work on; until then nothing is
  // pre-selected (no seed record auto-fills the view).
  const selected = activeId ? allIncidents.find((i) => i.id === activeId) : undefined
  const shown = filterIncidents(allIncidents, filter)

  function createStandaloneCall() {
    if (!newCall.trim()) return
    const nature = classifyNature(newCall)
    const linkedInc = linkedFirId ? allIncidents.find((i) => i.id === linkedFirId) : undefined
    if (linkedInc) {
      incidentStore.update(linkedInc.id, {
        status: 'dispatched',
        dispatch: {
          channel: newChannel,
          natureCode: nature.code,
          priority: nature.code === 'MED-001' ? 'immediate' : 'urgent',
          location: { lat: 26.8467, lng: 80.9462, label: 'Lucknow, UP' },
        },
      })
    } else {
      incidentStore.create({
        complainant: { name: 'Emergency Caller' },
        offense: { sections: [] },
        accused: {},
        narrative: newCall,
        dispatch: {
          channel: newChannel,
          natureCode: nature.code,
          priority: nature.code === 'MED-001' ? 'immediate' : 'urgent',
          location: { lat: 26.8467, lng: 80.9462, label: 'Lucknow, UP' },
        },
      })
    }
    setNewCall('')
    setLinkedFirId('')
  }

  function assign(id: string, unitId: string) {
    const inc = incidentStore.get(id)
    if (!inc) return
    const unit = UNITS.find((u) => u.id === unitId)
    const nature = classifyNature(inc.complainant.name + ' ' + inc.narrative)
    incidentStore.update(id, {
      status: 'dispatched',
      dispatch: {
        ...(inc.dispatch ?? {
          channel: 'Voice',
          natureCode: nature.code,
          priority: 'routine',
          location: { lat: 0, lng: 0, label: '' },
        }),
        unit: { id: unitId, type: unit?.type ?? 'Patrol', etaMinutes: unit?.eta ?? 4 },
      },
    })
  }

  function admitToHospital(id: string, hospitalName: string, ward: string, bed: string) {
    incidentStore.update(id, {
      dispatch: {
        ...(incidentStore.get(id)?.dispatch ?? {
          channel: 'Voice',
          natureCode: 'MED-001',
          priority: 'immediate',
          location: { lat: 0, lng: 0, label: '' },
        }),
        hospital: {
          name: hospitalName,
          ward,
          bedNumber: bed,
          admittedAt: new Date().toISOString(),
        },
      },
    })
  }

  const hasFIR = (inc: Incident) => inc.complainant.name && inc.offense.sections.length > 0

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-3 rounded-md">
        Standalone 112 calls work independently — no FIR required. File an FIR later if needed.
      </div>

      <section className="rounded border border-slate-200 p-4">
        <h3 className="font-semibold mb-2">New 112 call</h3>
        <div className="mb-2">
          <label className="block text-xs text-slate-500 mb-1">Attach to FIR (optional)</label>
          <select
            value={linkedFirId}
            onChange={(e) => setLinkedFirId(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm w-full"
          >
            <option value="">— Standalone (no FIR) —</option>
            {allIncidents.filter((i) => i.complainant.name || i.offense.sections.length > 0).map((i) => (
              <option key={i.id} value={i.id}>
                {i.firNumber} — {i.complainant.name || 'Unnamed'} ({i.status})
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <select
            value={newChannel}
            onChange={(e) => setNewChannel(e.target.value as 'Voice' | 'SMS' | 'WhatsApp')}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="Voice">Voice</option>
            <option value="SMS">SMS</option>
            <option value="WhatsApp">WhatsApp</option>
          </select>
          <input
            value={newCall}
            onChange={(e) => setNewCall(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createStandaloneCall()}
            placeholder="Describe the emergency (e.g. 'heart attack on MG Road')"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button onClick={createStandaloneCall} className="rounded bg-slate-900 text-white px-4 py-2 text-sm">
            Log call
          </button>
          <button
            onClick={() => { setNewCall(''); setNewChannel('Voice') }}
            className="rounded border border-slate-300 text-slate-700 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
      </section>

      <RecordBrowser
        incidents={allIncidents}
        filter={filter}
        activeId={selected?.id}
        onFilter={setFilter}
        onSelect={(inc, deselect) => setActiveId(deselect ? '' : inc.id)}
      />

      {selected && <RecordDetail inc={selected} />}

      {shown.length === 0 ? (
        <p className="text-slate-600">No incidents match the filters. File an FIR, log a 112 call above, or clear a filter.</p>
      ) : (
        shown.map((inc) => {
          const nature = classifyNature(inc.complainant.name + ' ' + inc.narrative)
          const current = inc.dispatch?.unit?.id
          const isMedical = nature.code === 'MED-001'
          return (
            <div key={inc.id} className="rounded border border-slate-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{inc.firNumber}</div>
                  <div className="text-sm text-slate-500">
                    {inc.complainant.name || 'Unknown caller'} · {inc.status}
                    {!hasFIR(inc) && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">standalone</span>}
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

              {isMedical && !inc.dispatch?.hospital && current && (
                <div className="mt-3 rounded border border-rose-200 bg-rose-50 p-3">
                  <p className="text-sm font-medium text-rose-800 mb-2">Medical emergency — admit to hospital</p>
                  <div className="flex gap-2 flex-wrap">
                    {HOSPITALS.map((h) =>
                      h.beds.map((bed) => (
                        <button
                          key={`${h.name}-${bed}`}
                          onClick={() => admitToHospital(inc.id, h.name, h.ward, bed)}
                          className="rounded bg-rose-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-rose-700"
                        >
                          {h.name.split(' ').slice(0, 2).join(' ')} · {h.ward} · {bed}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {inc.dispatch?.hospital && (
                <div className="mt-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm px-3 py-2">
                  Admitted to <strong>{inc.dispatch.hospital.name}</strong> · {inc.dispatch.hospital.ward} ward · Bed {inc.dispatch.hospital.bedNumber}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
