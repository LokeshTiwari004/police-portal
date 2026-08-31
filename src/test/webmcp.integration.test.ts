import { describe, it, expect, beforeEach } from 'vitest'
import { incidentStore } from '../lib/incidentStore'
import { registerTools } from '../lib/webmcpTools'
import { mockModelContext, clearStore } from './modelContextMock'
import schemaJson from '../data/formSchema.json'

/**
 * Integration test: exercises the shared incident store as the "backend"
 * behind the fir.* WebMCP tools end-to-end (create -> fill -> validate -> submit),
 * with document.modelContext mocked to intercept tool registration.
 */

type F = { name: string; required?: boolean }
type S = { dependsOn?: unknown; fields: F[] }
const SCHEMA_SECTIONS = (schemaJson as { sections: S[] }).sections

/** Mirror of the tool's derivation: required fields in always-visible sections. */
function requiredNowFromSchema(): string[] {
  return SCHEMA_SECTIONS.filter((s) => !s.dependsOn)
    .flatMap((s) => s.fields)
    .filter((f) => f.required)
    .map((f) => f.name)
}

beforeEach(clearStore)

describe('fir.* tools integrate with incidentStore', () => {
  it('registers fir tools on a module switch', async () => {
    const mc = mockModelContext()
    await registerTools('fir')
    const names = mc.registered.map((t) => t.name)
    expect(names).toContain('fir.fill_field')
    expect(names).toContain('fir.validate_form')
    expect(names).toContain('fir.submit')
  })

  it('identify_required_fields derives requiredNow from the schema, not a hardcoded list', async () => {
    const mc = mockModelContext()
    await registerTools('fir')
    const tool = mc.registered.find((t) => t.name === 'fir.identify_required_fields')!
    const out = JSON.parse((await tool.execute({ sections: ['379'] })) as string)

    const expected = requiredNowFromSchema()
    expect(expected.length).toBeGreaterThan(0)
    expect(out.requiredNow.sort()).toEqual(expected.sort())
    // The schema-driven list includes narrative (regression: previously hardcoded).
    expect(out.requiredNow).toContain('narrative')
  })

  it('fill_field -> validate_form -> submit persists a complete FIR', async () => {
    const mc = mockModelContext()
    await registerTools('fir')
    const tools = Object.fromEntries(mc.registered.map((t) => [t.name, t]))

    await tools['fir.fill_field'].execute({ field: 'complainant.name', value: 'Alice' })
    await tools['fir.fill_field'].execute({ field: 'complainant.phone', value: '9876543210' })
    await tools['fir.fill_field'].execute({
      field: 'offense.sections',
      value: ['379'],
    })
    await tools['fir.fill_field'].execute({ field: 'narrative', value: 'Bike stolen while parked' })

    const validation = JSON.parse((await tools['fir.validate_form'].execute({})) as string)
    expect(validation.valid).toBe(true)

    const submit = JSON.parse((await tools['fir.submit'].execute({})) as string)
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

    await tools['fir.fill_field'].execute({ field: 'complainant.name', value: 'Alice' })

    const submit = JSON.parse((await tools['fir.submit'].execute({})) as string)
    expect(submit.ok).toBe(false)
    expect(submit.errors).toBeTruthy()
  })
})
