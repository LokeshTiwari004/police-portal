import { describe, it, expect, beforeEach } from 'vitest'
import { incidentStore } from '../lib/incidentStore'
import { registerTools } from '../lib/webmcpTools'

/**
 * Integration test: exercises the shared incident store as the "backend"
 * behind the fir/* WebMCP tools end-to-end (create -> fill -> validate -> submit),
 * with document.modelContext mocked to intercept tool registration.
 */

function mockModelContext() {
  const registered: Array<{ name: string; execute: (input: unknown, o?: { signal?: AbortSignal }) => unknown }> = []
  const mc = {
    registered,
    async registerTool(tool: unknown) {
      registered.push(tool as (typeof registered)[number])
    },
    async getTools() {
      return registered
    },
  }
  ;(document as unknown as { modelContext?: typeof mc }).modelContext = mc
  return mc
}

beforeEach(() => {
  localStorage.removeItem('police-portal:incidents')
})

describe('fir/* tools integrate with incidentStore', () => {
  it('registers fir tools on a module switch', async () => {
    const mc = mockModelContext()
    await registerTools('fir')
    const names = mc.registered.map((t) => t.name)
    expect(names).toContain('fir/fill_field')
    expect(names).toContain('fir/validate_form')
    expect(names).toContain('fir/submit')
  })

  it('fill_field -> validate_form -> submit persists a complete FIR', async () => {
    const mc = mockModelContext()
    await registerTools('fir')
    const tools = Object.fromEntries(mc.registered.map((t) => [t.name, t]))

    await tools['fir/fill_field'].execute({ field: 'complainant.name', value: 'Alice' })
    await tools['fir/fill_field'].execute({ field: 'complainant.phone', value: '9876543210' })
    await tools['fir/fill_field'].execute({
      field: 'offense.sections',
      value: ['379'],
    })
    await tools['fir/fill_field'].execute({ field: 'narrative', value: 'Bike stolen while parked' })

    const validation = JSON.parse((await tools['fir/validate_form'].execute({})) as string)
    expect(validation.valid).toBe(true)

    const submit = JSON.parse((await tools['fir/submit'].execute({})) as string)
    expect(submit.ok).toBe(true)
    expect(submit.firNumber).toMatch(/^FIR-\d{4}-\d{6}$/)

    const stored = incidentStore.list()[0]
    expect(stored.status).toBe('acknowledged')
    expect(stored.narrative).toBe('Bike stolen while parked')
  })

  it('submit is rejected when required fields are missing', async () => {
    const mc = mockModelContext()
    await registerTools('fir')
    const tools = Object.fromEntries(mc.registered.map((t) => [t.name, t]))

    await tools['fir/fill_field'].execute({ field: 'complainant.name', value: 'Alice' })

    const submit = JSON.parse((await tools['fir/submit'].execute({})) as string)
    expect(submit.ok).toBe(false)
    expect(submit.errors).toBeTruthy()
  })
})
