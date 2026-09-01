/**
 * Tests for the data-driven e-Challan + ERSS-112 tools (mockRC / mvaFines /
 * natureCodes). Proves the tools read from the JSON data files rather than
 * hardcoded inline stubs.
 */
import { describe, it, expect } from 'vitest'
import { getChallanTools, getDispatchTools } from '../lib/toolRegistry'
import { createMemoryStore } from '../lib/memoryStore'

function challan(name: string) {
  return getChallanTools(createMemoryStore()).find((t) => t.name === name)!
}
function dispatch(name: string) {
  return getDispatchTools(createMemoryStore()).find((t) => t.name === name)!
}

describe('e-Challan data-driven tools (mockRC.json)', () => {
  it('lookup_rc returns the full record for a known registration', async () => {
    const out = JSON.parse((await challan('challan.lookup_rc').execute({ rcNumber: 'UP14C1234' })) as string)
    expect(out.status).toBe('found')
    expect(out.ownerName).toBe('Rajesh Kumar')
    expect(out.vehicleClass).toBe('MCWG')
    expect(out.fuelType).toBe('Petrol')
  })

  it('lookup_rc is case-insensitive across the archive', async () => {
    const out = JSON.parse((await challan('challan.lookup_rc').execute({ rcNumber: 'up14c1234' })) as string)
    expect(out.status).toBe('found')
  })

  it('lookup_rc returns not-found for an unknown registration', async () => {
    const out = JSON.parse((await challan('challan.lookup_rc').execute({ rcNumber: 'XX99' })) as string)
    expect(out.status).toBe('not-found')
  })
})

describe('e-Challan fine matrix (mvaFines.json)', () => {
  it('applies the vehicle-class multiplier to the base fine', async () => {
    const bus = JSON.parse((await challan('challan.auto_calculate_fine').execute({ offenseCode: '194', vehicleClass: 'Bus' })) as string)
    expect(bus.fineAmount).toBe(12000) // 10000 * 1.2

    const lmv = JSON.parse((await challan('challan.auto_calculate_fine').execute({ offenseCode: '194', vehicleClass: 'LMV' })) as string)
    expect(lmv.fineAmount).toBe(10000) // 10000 * 1.0
  })

  it('falls back to the default fine for an unknown offence', async () => {
    const out = JSON.parse((await challan('challan.auto_calculate_fine').execute({ offenseCode: '999' })) as string)
    expect(out.fineAmount).toBe(500)
  })
})

describe('ERSS-112 nature classifier (natureCodes.json)', () => {
  it('classifies medical, fire, police, women-child and traffic descriptions', async () => {
    const cases: Array<[string, string]> = [
      ['heart attack ambulance', 'MED-001'],
      ['smoke in the building', 'FIR-003'],
      ['bike stolen', 'POL-007'],
      ['missing child in market', 'WCH-004'],
      ['car collision on the road', 'TRF-002'],
    ]
    for (const [description, expected] of cases) {
      const out = JSON.parse((await dispatch('dispatch.classify_nature').execute({ description })) as string)
      expect(out.natureCode).toBe(expected)
    }
  })

  it('falls back to General when no keyword matches', async () => {
    const out = JSON.parse((await dispatch('dispatch.classify_nature').execute({ description: 'tenant complained about noise' })) as string)
    expect(out.natureCode).toBe('GEN-000')
  })
})
