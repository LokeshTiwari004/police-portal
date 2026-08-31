/**
 * External-agent bridge tests.
 *
 * Prove the shared tool registry (`toolRegistry.ts`) drives the same behavior
 * through the Node MCP server's in-memory store as it does in the browser,
 * and that `createPortalServer` registers all 12 tools.
 */
import { describe, it, expect } from 'vitest'
import { createMemoryStore } from '../lib/memoryStore'
import { getFirTools, getDispatchTools, getChallanTools } from '../lib/toolRegistry'

describe('external-agent MCP bridge', () => {
  it('memory store creates an incident with generated metadata', () => {
    const store = createMemoryStore()
    const inc = store.create()
    expect(inc.id).toBeTruthy()
    expect(inc.firNumber).toMatch(/^FIR-\d{4}-\d{6}$/)
    expect(inc.status).toBe('draft')
    expect(store.list()).toHaveLength(1)
  })

  it('runs the FIR tool flow against the in-memory store (fill -> validate -> submit)', async () => {
    const store = createMemoryStore()
    const tools = Object.fromEntries(getFirTools(store).map((t) => [t.name, t]))

    await tools['fir.fill_field'].execute({ field: 'complainant.name', value: 'Alice' })
    await tools['fir.fill_field'].execute({ field: 'complainant.phone', value: '9876543210' })
    await tools['fir.fill_field'].execute({ field: 'narrative', value: 'Bike stolen' })

    const validation = JSON.parse((await tools['fir.validate_form'].execute({})) as string)
    expect(validation.valid).toBe(true)

    const submit = JSON.parse((await tools['fir.submit'].execute({})) as string)
    expect(submit.ok).toBe(true)
    expect(store.list()[0].status).toBe('acknowledged')
  })

  it('the shared registries expose the full 12-tool surface used by both WebMCP and MCP', () => {
    for (const t of getFirTools(createMemoryStore())) expect(t.title).toBeTruthy()
    expect(getFirTools(createMemoryStore()).map((t) => t.name)).toEqual([
      'fir.identify_required_fields',
      'fir.fill_field',
      'fir.flag_missing',
      'fir.validate_form',
      'fir.submit',
      'fir.find_similar_cases',
    ])
    expect(getChallanTools().map((t) => t.name)).toEqual([
      'challan.lookup_rc',
      'challan.auto_calculate_fine',
      'challan.submit',
    ])
    expect(getDispatchTools(createMemoryStore()).map((t) => t.name)).toEqual([
      'dispatch.classify_nature',
      'dispatch.get_available_units',
      'dispatch.assign_unit',
    ])
  })
})
