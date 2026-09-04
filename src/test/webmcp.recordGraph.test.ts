import { describe, it, expect, beforeEach } from 'vitest'
import { incidentStore } from '../lib/incidentStore'
import { getFirTools, getDispatchTools, getRecordTools, resetRecordFocus } from '../lib/toolRegistry'

// Browser-side parity: the WebMCP path injects `incidentStore` (localStorage).
// Ensure the new record-graph tools work identically there, not just on the
// in-memory bridge store.
describe('browser WebMCP store parity for record-graph tools', () => {
  beforeEach(() => {
    localStorage.removeItem('police-portal:incidents')
    resetRecordFocus()
  })

  it('fir.create + erss.create_call + fir.link_erss drive the localStorage store', async () => {
    const firTools = Object.fromEntries(getFirTools(incidentStore).map((t) => [t.name, t]))
    const dispTools = Object.fromEntries(getDispatchTools(incidentStore).map((t) => [t.name, t]))

    const erss = JSON.parse(await dispTools['erss.create_call'].execute({ description: 'hit and run' }) as string)
    expect(erss.ok).toBe(true)
    expect(erss.erssNumber).toMatch(/^ERS-/)

    const fir = JSON.parse(await firTools['fir.create'].execute({ complainantName: 'Bob' }) as string)
    expect(fir.ok).toBe(true)
    expect(fir.firNumber).toMatch(/^FIR-/)

    const link = JSON.parse(await firTools['fir.link_erss'].execute({ erssId: erss.id, recordId: fir.id }) as string)
    expect(link.ok).toBe(true)
    expect(link.linkedErssNumber).toBe(erss.erssNumber)

    // sourceErss is visible on the persisted localStorage record.
    const stored = incidentStore.get(fir.id)
    expect(stored?.sourceErss?.erssNumber).toBe(erss.erssNumber)
  })

  it('record.list lists records across modules on the browser store', async () => {
    const dispTools = Object.fromEntries(getDispatchTools(incidentStore).map((t) => [t.name, t]))
    const recTools = Object.fromEntries(getRecordTools(incidentStore).map((t) => [t.name, t]))
    await dispTools['erss.create_call'].execute({ description: 'fire on market' })
    const listed = JSON.parse(await recTools['record.list'].execute({ module: 'dispatch' }) as string)
    expect(listed.count).toBe(1)
    expect(listed.records[0].modules).toContain('dispatch')
  })
})