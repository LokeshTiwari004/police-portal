import { describe, it, expect, beforeEach } from 'vitest'
import { incidentStore } from '../lib/incidentStore'
import { registerTools, registerAllTools } from '../lib/webmcpTools'
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
  const fields = SCHEMA_SECTIONS.filter((s) => !s.dependsOn).flatMap((s) => s.fields) as Array<{ name: string; required?: boolean; requiredWhen?: { field: string; isEmpty: boolean } }>
  return [
    ...fields.filter((f) => f.required).map((f) => f.name),
    ...fields.filter((f) => f.requiredWhen?.isEmpty).map((f) => f.name), // fresh incident has no accused.name
  ]
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

  it('re-registering (StrictMode remount, tab switch) does not raise duplicate-name errors', async () => {
    const mc = mockModelContext()
    await registerTools('fir')
    const afterFirst = mc.registered.length
    expect(afterFirst).toBe(6)

    // Second call with the same module — e.g. React StrictMode's double-effect
    // mount in dev, or clicking back onto the FIR tab. No console warnings, and
    // the mock's duplicate rejection must never fire.
    const warn = console.warn
    const warnings: unknown[] = []
    console.warn = (...a) => warnings.push(a)
    try {
      await registerTools('fir')
    } finally {
      console.warn = warn
    }
    expect(warnings).toHaveLength(0)
    expect(mc.registered.length).toBe(afterFirst)
  })

  it('registerAllTools registers each module once even when some tools are already live', async () => {
    const mc = mockModelContext()
    await registerTools('fir')
    const warn = console.warn
    const warnings: unknown[] = []
    console.warn = (...a) => warnings.push(a)
    try {
      await registerAllTools()
    } finally {
      console.warn = warn
    }
    expect(warnings).toHaveLength(0)
    expect(mc.registered.length).toBe(12)
    const names = mc.registered.map((t) => t.name)
    for (const name of ['fir.submit', 'challan.lookup_rc', 'dispatch.assign_unit']) {
      expect(names).toContain(name)
    }
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
    await tools['fir.fill_field'].execute({ field: 'property', value: ['Hero Splendor'] })
    await tools['fir.fill_field'].execute({ field: 'accused.name', value: 'Unknown' })
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

  it('find_similar_cases reads prior cases from the mockIncidents seed archive', async () => {
    const mc = mockModelContext()
    await registerTools('fir')
    const tool = mc.registered.find((t) => t.name === 'fir.find_similar_cases')!

    const out = JSON.parse((await tool.execute({ sections: ['379'] })) as string)
    expect(out.count).toBeGreaterThan(0)
    for (const m of out.matches) {
      expect(m.sections).toContain('379')
      expect(m.firNumber).toMatch(/^FIR-\d{4}-\d{6}$/)
      expect(typeof m.location).toBe('string')
    }

    // Location narrowing behaves: asking for the place in one seed case filters others.
    const narrowed = JSON.parse((await tool.execute({ sections: ['379'], location: 'MG Road' })) as string)
    expect(narrowed.count).toBeGreaterThan(0)
    expect(narrowed.matches.every((m: { location: string }) => /mg road/i.test(m.location))).toBe(true)
  })
})
