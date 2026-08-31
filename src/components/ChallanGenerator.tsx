import { useState } from 'react'
import { incidentStore } from '../lib/incidentStore'

/**
 * e-Challan generator: looks up a vehicle RC and auto-calculates MVA fines,
 * linking the challan back to a FIR incident in the shared store.
 * Mirrors the challan/* WebMCP tools so the agent and the UI agree.
 */

const RC_DB: Record<string, { ownerName: string; address: string; vehicleClass: string; engineCc: number; fuelType: string }> = {
  UP14C1234: { ownerName: 'Rajesh Kumar', address: '123 MG Road, Lucknow', vehicleClass: 'MCWG', engineCc: 110, fuelType: 'Petrol' },
  DL8CAF2291: { ownerName: 'Priya Sharma', address: '44 Civil Lines, Delhi', vehicleClass: 'LMV', engineCc: 1498, fuelType: 'Petrol' },
  KA01MJ0555: { ownerName: 'Arjun Nair', address: '5th Block, Bengaluru', vehicleClass: 'LMV', engineCc: 1996, fuelType: 'Diesel' },
  MH12DE1433: { ownerName: 'Sneha Joshi', address: 'Pune Station Rd', vehicleClass: 'HMV', engineCc: 6200, fuelType: 'Diesel' },
  GJ01BU1122: { ownerName: 'Rohan Desai', address: 'Navrangpura, Ahmedabad', vehicleClass: 'MCWG', engineCc: 125, fuelType: 'Petrol' },
}

const FINE_BASE: Record<string, number> = { 119: 1000, 123: 1000, 126: 5000, 143: 5000, 180: 2000, 194: 10000 }
const VEHICLE_MULT: Record<string, number> = { LMV: 1, MCWG: 0.5, HMV: 1.5, Bus: 1.2 }

export default function ChallanGenerator() {
  const [rcNumber, setRcNumber] = useState('')
  const [rc, setRc] = useState<(typeof RC_DB)[string] | null>(null)
  const [lookedUp, setLookedUp] = useState('')
  const [offenseCode, setOffenseCode] = useState('180')
  const [fine, setFine] = useState<number | null>(null)
  const [savedId, setSavedId] = useState('')

  function lookupRc() {
    const rec = RC_DB[rcNumber.toUpperCase().trim()]
    setRc(rec ?? null)
    setLookedUp(rcNumber.toUpperCase().trim())
    setFine(null)
  }

  function calcFine() {
    if (!rc) return
    const base = FINE_BASE[offenseCode] ?? 500
    setFine(Math.round(base * (VEHICLE_MULT[rc.vehicleClass] ?? 1)))
  }

  function submitChallan() {
    if (!rc || fine == null) return
    const inc = incidentStore.list()[0] || incidentStore.create()
    incidentStore.update(inc.id, {
      challan: {
        rcNumber: lookedUp,
        offenseCode,
        fineAmount: fine,
        paid: false,
      },
    })
    setSavedId(inc.firNumber)
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
              <Row k="Class" v={rc.vehicleClass} />
              <Row k="Engine" v={`${rc.engineCc} cc ${rc.fuelType}`} />
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
            {Object.keys(FINE_BASE).map((s) => (
              <option key={s} value={s}>Section {s}</option>
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
        <button
          onClick={submitChallan}
          disabled={!rc || fine == null}
          className="rounded bg-emerald-600 text-white px-4 py-2 text-sm disabled:opacity-40"
        >
          Save challan to incident
        </button>
        {savedId && <p className="mt-3 text-sm text-emerald-600">Challan linked to {savedId} (₹{fine}).</p>}
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
