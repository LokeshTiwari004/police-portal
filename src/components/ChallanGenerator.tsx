import { useEffect, useState } from 'react'
import { incidentStore, type Incident } from '../lib/incidentStore'
import mockRC from '../data/mockRC.json'
import mvaFines from '../data/mvaFines.json'

interface RcRecord {
  rcNumber: string
  ownerName: string
  address: string
  vehicleClass: string
  makerModel?: string
  engineCapacity?: string
  fuelType?: string
}
interface FineMatrix {
  offences: Array<{ offenseCode: string; label: string; baseFine: number }>
  vehicleClassMultiplier: Record<string, number>
  defaultFine: number
  defaultMultiplier: number
}

const RC_DB = mockRC as RcRecord[]
const FINE_MATRIX = mvaFines as FineMatrix

function fineFor(offenseCode: string, vehicleClass: string): number {
  const off = FINE_MATRIX.offences.find((o) => o.offenseCode === offenseCode)
  const mult = FINE_MATRIX.vehicleClassMultiplier[vehicleClass] ?? FINE_MATRIX.defaultMultiplier
  return Math.round((off?.baseFine ?? FINE_MATRIX.defaultFine) * mult)
}

/**
 * e-Challan generator: looks up a vehicle RC and auto-calculates MVA fines,
 * linking the challan back to a FIR incident in the shared store.
 * Reads the SAME mockRC.json / mvaFines.json the challan/* tools use, and
 * subscribes to the store so a challan created by an agent tool appears live.
 */
export default function ChallanGenerator() {
  const [incident, setIncident] = useState<Incident | undefined>(() => incidentStore.list()[0])
  const [rcNumber, setRcNumber] = useState('')
  const [rc, setRc] = useState<RcRecord | null>(null)
  const [lookedUp, setLookedUp] = useState('')
  const [offenseCode, setOffenseCode] = useState('180')
  const [fine, setFine] = useState<number | null>(null)

  useEffect(() => {
    return incidentStore.subscribe((incidents) => setIncident(incidents[0]))
  }, [])

  const saved = incident?.challan

  function lookupRc() {
    const rec = RC_DB.find((r) => r.rcNumber.toUpperCase() === rcNumber.toUpperCase().trim())
    setRc(rec ?? null)
    setLookedUp(rcNumber.toUpperCase().trim())
    setFine(null)
  }

  function calcFine() {
    if (!rc) return
    setFine(fineFor(offenseCode, rc.vehicleClass))
  }

  function submitChallan() {
    const inc = incident ?? incidentStore.create()
    incidentStore.update(inc.id, {
      challan: {
        rcNumber: lookedUp,
        offenseCode,
        fineAmount: fine ?? 0,
        paid: false,
      },
    })
  }

  return (
    <div className="space-y-5">
      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded border border-slate-200 p-4">
          <h3 className="font-semibold mb-2">1 · Look up vehicle (RC)</h3>
          <div className="flex gap-2">
            <input
              value={rcNumber}
              onChange={(e) => setRcNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookupRc()}
              placeholder="e.g. UP14C1234"
              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <button onClick={lookupRc} className="rounded bg-slate-900 text-white px-4 py-2 text-sm">
              Look up
            </button>
          </div>
          {lookedUp && rc && (
            <dl className="mt-3 text-sm">
              <Row k="Owner" v={rc.ownerName} />
              <Row k="Model" v={rc.makerModel ?? '—'} />
              <Row k="Class" v={rc.vehicleClass} />
              <Row k="Engine" v={`${rc.engineCapacity ?? ''} ${rc.fuelType ?? ''}`.trim()} />
            </dl>
          )}
          {lookedUp && !rc && <p className="mt-3 text-sm text-red-600">No record found for {lookedUp}.</p>}
        </div>

        <div className="rounded border border-slate-200 p-4">
          <h3 className="font-semibold mb-2">2 · Auto-calculate fine</h3>
          <label className="block text-xs text-slate-500 mb-1">MVA offense section</label>
          <select
            value={offenseCode}
            onChange={(e) => setOffenseCode(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm w-full"
          >
            {FINE_MATRIX.offences.map((o) => (
              <option key={o.offenseCode} value={o.offenseCode}>
                Section {o.offenseCode} — {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={calcFine}
            disabled={!rc}
            className="mt-3 rounded bg-emerald-600 text-white px-4 py-2 text-sm disabled:opacity-40"
          >
            Calculate fine
          </button>
          {fine != null && <p className="mt-3 text-sm font-semibold">Fine: ₹{fine}</p>}
        </div>
      </section>

      <section className="rounded border border-slate-200 p-4">
        <h3 className="font-semibold mb-2">3 · Issue challan</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={submitChallan}
            disabled={!rc || fine == null}
            className="rounded bg-emerald-600 text-white px-4 py-2 text-sm disabled:opacity-40"
          >
            Save challan to incident
          </button>
          {incident && <span className="text-xs text-slate-500">Linked to {incident.firNumber}</span>}
        </div>
        {saved && (
          <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm px-3 py-2">
            Challan for <strong>{saved.rcNumber}</strong> · Section {saved.offenseCode} · ₹{saved.fineAmount}{' '}
            on <strong>{incident?.firNumber}</strong>
          </div>
        )}
      </section>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  )
}