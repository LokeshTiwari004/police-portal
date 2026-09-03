import { describe, it, expect, beforeEach } from 'vitest'
import { incidentStore, type Incident } from './incidentStore'

const KEY = 'police-portal:incidents'

beforeEach(() => {
  localStorage.removeItem(KEY)
})

describe('incidentStore.create', () => {
  it('creates a draft incident with defaults', () => {
    const inc = incidentStore.create()
    expect(inc.id).toBeTruthy()
    expect(inc.status).toBe('draft')
    expect(inc.witnesses).toEqual([])
    expect(inc.missingFields).toEqual([])
    expect(inc.firNumber).toMatch(/^FIR-\d{4}-\d{6}$/)
  })

  it('persists to localStorage', () => {
    incidentStore.create({
      complainant: { name: 'Bob' },
      offense: { sections: [] },
      accused: {},
      narrative: '',
    })
    const stored = JSON.parse(localStorage.getItem(KEY)!) as Incident[]
    expect(stored).toHaveLength(1)
    expect(stored[0].complainant.name).toBe('Bob')
  })

  it('increments the FIR sequence number', () => {
    const first = incidentStore.create()
    const second = incidentStore.create()
    expect(second.firNumber > first.firNumber).toBe(true)
  })
})

describe('incidentStore.update', () => {
  it('applies a patch to an existing incident', () => {
    const inc = incidentStore.create()
    const updated = incidentStore.update(inc.id, { narrative: 'Updated story' })
    expect(updated?.narrative).toBe('Updated story')
  })

  it('returns undefined for a missing id', () => {
    expect(incidentStore.update('nope', {})).toBeUndefined()
  })
})

describe('incidentStore.get', () => {
  it('retrieves by id', () => {
    const inc = incidentStore.create()
    expect(incidentStore.get(inc.id)?.id).toBe(inc.id)
  })
})

describe('incidentStore.subscribe', () => {
  it('notifies listeners on changes', () => {
    const inc = incidentStore.create()
    let calls = 0
    const unsub = incidentStore.subscribe(() => {
      calls++
    })
    incidentStore.update(inc.id, { status: 'acknowledged' })
    expect(calls).toBe(1)
    unsub()
  })
})

describe('incidentStore.seed', () => {
  it('populates an empty store with demo records (FIR + challan + ERSS)', () => {
    const seeded = incidentStore.seed()
    expect(seeded.length).toBeGreaterThanOrEqual(2)
    expect(seeded.some((i) => i.challan)).toBe(true)
    expect(seeded.some((i) => i.dispatch)).toBe(true)
  })

  it('is a no-op when records already exist (does not duplicate)', () => {
    incidentStore.seed()
    const first = incidentStore.list().length
    expect(incidentStore.seed().length).toBe(first)
  })
})
