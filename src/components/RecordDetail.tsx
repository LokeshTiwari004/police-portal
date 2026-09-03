import { type Incident } from '../lib/incidentStore'

/**
 * Read-only detail view of a single incident record (FIR + e-Challan + ERSS).
 * Shown when an officer selects a specific record in the RecordBrowser so they
 * can inspect the full picture before acting.
 */

function Row({ k, v }: { k: string; v: unknown }) {
  if (v === undefined || v === null || v === '') return null
  return (
    <div className="flex justify-between border-b border-slate-100 py-1">
      <dt className="text-slate-500 text-xs">{k}</dt>
      <dd className="text-sm font-medium text-slate-800">{String(v)}</dd>
    </div>
  )
}

export default function RecordDetail({ inc }: { inc: Incident }) {
  const fir = !!inc.complainant.name || inc.offense.sections.length > 0
  const badges: string[] = []
  if (fir) badges.push('FIR')
  if (inc.challan) badges.push('e-Challan')
  if (inc.dispatch) badges.push('ERSS-112')

  return (
    <div className="rounded border border-slate-200 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{inc.firNumber}</div>
          <div className="text-xs text-slate-400">
            {inc.status} · {new Date(inc.createdAt).toLocaleString()}
            {badges.map((b) => (
              <span key={b} className="ml-1 bg-slate-100 px-1.5 py-0.5 rounded text-xs">{b}</span>
            ))}
          </div>
        </div>
      </div>

      {inc.complainant.name && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase">Complainant</div>
          <dl className="space-y-0.5">
            <Row k="Name" v={inc.complainant.name} />
            <Row k="Father" v={inc.complainant.fatherName} />
            <Row k="Address" v={inc.complainant.address} />
            <Row k="Phone" v={inc.complainant.phone} />
            <Row k="Email" v={inc.complainant.email} />
          </dl>
        </div>
      )}

      {inc.offense.sections.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase">Offense</div>
          <dl className="space-y-0.5">
            <Row k="Sections" v={inc.offense.sections.join(', ')} />
            <Row k="Date" v={inc.offense.date} />
            <Row k="Time" v={inc.offense.time} />
            <Row k="Place" v={inc.offense.place} />
            <Row k="Beat" v={inc.offense.beat} />
          </dl>
        </div>
      )}

      {inc.accused.name && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase">Accused</div>
          <dl className="space-y-0.5">
            <Row k="Name" v={inc.accused.name} />
            <Row k="Description" v={inc.accused.description} />
            <Row k="Age" v={inc.accused.age} />
            <Row k="Sex" v={inc.accused.sex} />
          </dl>
        </div>
      )}

      {inc.property && inc.property.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase">Property</div>
          <ul className="space-y-0.5">
            {inc.property.map((p, i) => (
              <li key={i} className="text-sm text-slate-700">
                {p.type} — {p.description} · ₹{p.value} {p.stolen ? '(stolen)' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {inc.narrative && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase">Narrative</div>
          <p className="text-sm text-slate-700">{inc.narrative}</p>
        </div>
      )}

      {inc.challan && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase">e-Challan</div>
          <dl className="space-y-0.5">
            <Row k="RC" v={inc.challan.rcNumber} />
            <Row k="Section" v={inc.challan.offenseCode} />
            <Row k="Fine" v={`₹${inc.challan.fineAmount}`} />
            <Row k="Paid" v={inc.challan.paid ? 'Yes' : 'No'} />
            {inc.challan.courtSummons && (
              <>
                <Row k="Summons #" v={inc.challan.courtSummons.summonsNumber} />
                <Row k="Court" v={inc.challan.courtSummons.courtName} />
                <Row k="Hearing" v={inc.challan.courtSummons.courtDate} />
              </>
            )}
          </dl>
        </div>
      )}

      {inc.dispatch && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase">ERSS-112 Dispatch</div>
          <dl className="space-y-0.5">
            <Row k="Channel" v={inc.dispatch.channel} />
            <Row k="Nature" v={`${inc.dispatch.natureCode} · priority ${inc.dispatch.priority}`} />
            <Row k="Location" v={inc.dispatch.location.label} />
            {inc.dispatch.unit && <Row k="Unit" v={`${inc.dispatch.unit.id} · ${inc.dispatch.unit.type} · ETA ${inc.dispatch.unit.etaMinutes}m`} />}
            {inc.dispatch.hospital && <Row k="Hospital" v={`${inc.dispatch.hospital.name} · ${inc.dispatch.hospital.ward} · bed ${inc.dispatch.hospital.bedNumber}`} />}
          </dl>
        </div>
      )}
    </div>
  )
}