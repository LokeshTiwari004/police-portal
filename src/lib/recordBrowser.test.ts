import { describe, it, expect } from 'vitest'
import { defaultFilter, filterIncidents } from '../components/RecordBrowser'
import { type Incident } from '../lib/incidentStore'

const base: Incident = {
  id: 'x',
  firNumber: 'FIR-2025-000001',
  createdAt: '2025-01-01T00:00:00.000Z',
  status: 'draft',
  complainant: { name: '' },
  offense: { sections: [] },
  accused: {},
  property: [],
  witnesses: [],
  narrative: '',
  missingFields: [],
}

const fir = { ...base, id: 'a', firNumber: 'FIR-2025-000002', complainant: { name: 'Alice' }, offense: { sections: ['379'] } }
const challan = { ...base, id: 'b', firNumber: 'FIR-2025-000003', challan: { rcNumber: 'UP14C1234', offenseCode: '180', fineAmount: 500, paid: false } }
const dispatch: Incident = { ...base, id: 'c', firNumber: 'FIR-2025-000004', status: 'dispatched', dispatch: { channel: 'Voice', natureCode: 'MED-001', priority: 'immediate', location: { lat: 0, lng: 0, label: '' } } }
const empty = { ...base } // no complainant, offense, challan, or dispatch

describe('filterIncidents (RecordBrowser)', () => {
  it('shows every module by default', () => {
    expect(filterIncidents([fir, challan, dispatch, empty], defaultFilter()).map((i) => i.id)).toEqual([])
  })

  it('filters to a single module', () => {
    const f = defaultFilter()
    f.hasFir = true
    f.hasChallan = false
    f.hasDispatch = false
    expect(filterIncidents([fir, challan, dispatch], f).map((i) => i.id)).toEqual(['a'])
  })

  it('treats a bare draft as an FIR in progress', () => {
    const f = defaultFilter()
    f.hasFir = true
    f.hasChallan = false
    f.hasDispatch = false
    expect(filterIncidents([empty, dispatch], f).map((i) => i.id)).toEqual(['x'])
  })

  it('filters by status', () => {
    const f = defaultFilter()
    f.hasFir = true
    f.hasDispatch = true
    f.status = 'dispatched'
    expect(filterIncidents([fir, dispatch], f).map((i) => i.id)).toEqual(['c'])
  })

  it('filters by free-text across firNumber / complainant / RC / nature', () => {
    expect(filterIncidents([fir, challan, dispatch], { ...defaultFilter(), hasFir: true, text: 'alice' }).map((i) => i.id)).toEqual(['a'])
    expect(filterIncidents([fir, challan, dispatch], { ...defaultFilter(), hasChallan: true, text: 'up14c1234' }).map((i) => i.id)).toEqual(['b'])
    expect(filterIncidents([fir, challan, dispatch], { ...defaultFilter(), hasDispatch: true, text: 'med-001' }).map((i) => i.id)).toEqual(['c'])
  })
})