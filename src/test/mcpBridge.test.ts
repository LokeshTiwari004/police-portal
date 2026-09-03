/**
 * External-agent bridge tests.
 *
 * Prove the shared tool registry (`toolRegistry.ts`) drives the same behavior
 * through the Node MCP server's in-memory store as it does in the browser,
 * and that `createPortalServer` registers every portal tool.
 */
import { describe, it, expect } from 'vitest'
import { createMemoryStore } from '../lib/memoryStore'
import { getFirTools, getDispatchTools, getChallanTools, getRecordTools, getNavTools, resetRecordFocus } from '../lib/toolRegistry'

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
    await tools['fir.fill_field'].execute({ field: 'offense.sections', value: ['379'] })
    await tools['fir.fill_field'].execute({ field: 'property', value: ['Bike'] })
    await tools['fir.fill_field'].execute({ field: 'accused.name', value: 'Unknown' })
    await tools['fir.fill_field'].execute({ field: 'narrative', value: 'Bike stolen' })

    const validation = JSON.parse((await tools['fir.validate_form'].execute({})) as string)
    expect(validation.valid).toBe(true)

    const submit = JSON.parse((await tools['fir.submit'].execute({})) as string)
    expect(submit.ok).toBe(true)
    expect(store.list()[0].status).toBe('acknowledged')
  })

  it('the shared registries expose the full tool surface used by both WebMCP and MCP', () => {
    for (const t of getFirTools(createMemoryStore())) expect(t.title).toBeTruthy()
    expect(getFirTools(createMemoryStore()).map((t) => t.name)).toEqual([
      'fir.identify_required_fields',
      'fir.fill_field',
      'fir.flag_missing',
      'fir.validate_form',
      'fir.submit',
      'fir.find_similar_cases',
      'fir.create',
      'fir.link_erss',
    ])
    expect(getChallanTools(createMemoryStore()).map((t) => t.name)).toEqual([
      'challan.lookup_rc',
      'challan.auto_calculate_fine',
      'challan.submit',
    ])
    expect(getDispatchTools(createMemoryStore()).map((t) => t.name)).toEqual([
      'dispatch.classify_nature',
      'dispatch.get_available_units',
      'erss.create_call',
      'dispatch.assign_unit',
    ])
    expect(getRecordTools(createMemoryStore()).map((t) => t.name)).toEqual([
      'record.list',
      'record.select',
    ])
    expect(getNavTools().map((t) => t.name)).toEqual(['nav.switch_tab'])
  })

  it('nav.switch_tab is a safe no-op over MCP (no window) and reports the tab', async () => {
    const [tool] = getNavTools()
    const result = JSON.parse((await tool.execute({ tab: 'challan' })) as string)
    expect(result.ok).toBe(true)
    expect(result.switchedTo).toBe('challan')
  })

  it('challan.submit persists onto the active FIR and returns its firNumber (cross-module continuity)', async () => {
    const store = createMemoryStore()
    const tools = Object.fromEntries([
      ...getFirTools(store),
      ...getChallanTools(store),
    ].map((t) => [t.name, t]))

    await tools['fir.fill_field'].execute({ field: 'complainant.name', value: 'Alice' })
    await tools['fir.fill_field'].execute({ field: 'complainant.phone', value: '9876543210' })
    await tools['fir.fill_field'].execute({ field: 'offense.sections', value: ['379'] })
    await tools['fir.fill_field'].execute({ field: 'property', value: ['Bike'] })
    await tools['fir.fill_field'].execute({ field: 'accused.name', value: 'Unknown' })
    await tools['fir.fill_field'].execute({ field: 'narrative', value: 'Stolen' })
    const fir = JSON.parse((await tools['fir.submit'].execute({})) as string)
    expect(fir.ok).toBe(true)

    const challan = JSON.parse(
      (await tools['challan.submit'].execute({ rcNumber: 'UP14C1234', offenseCode: '119', fineAmount: 500 })) as string,
    )
    expect(challan.ok).toBe(true)
    expect(challan.firNumber).toBe(fir.firNumber)
    expect(challan.challan).toMatchObject({ rcNumber: 'UP14C1234', offenseCode: '119', fineAmount: 500 })
    expect(store.list()[0].challan).toMatchObject({ rcNumber: 'UP14C1234', fineAmount: 500 })
  })

  it('fir.validate_form matches the UI: bad phone/email + empty accused.description are errors', async () => {
    const store = createMemoryStore()
    const tools = Object.fromEntries(getFirTools(store).map((t) => [t.name, t]))

    await tools['fir.fill_field'].execute({ field: 'complainant.name', value: 'Bob' })
    await tools['fir.fill_field'].execute({ field: 'complainant.phone', value: '123' })
    await tools['fir.fill_field'].execute({ field: 'complainant.email', value: 'not-an-email' })
    await tools['fir.fill_field'].execute({ field: 'narrative', value: 'Test' })

    const { valid, errors } = JSON.parse((await tools['fir.validate_form'].execute({})) as string)
    expect(valid).toBe(false)
    expect(errors['complainant.phone']).toBe('Phone must be a 10-digit number (e.g. 9876543210).')
    expect(errors['complainant.email']).toBe('Enter a valid email address.')
    expect(errors['accused.description']).toBe('This field is required.')
    expect(errors['offense.sections']).toBe('This field is required.')

    const submit = JSON.parse((await tools['fir.submit'].execute({})) as string)
    expect(submit.ok).toBe(false)
  })

  it('creates an ERSS call, lists it, and links a FIR back to it (cross-module graph)', async () => {
    resetRecordFocus()
    const store = createMemoryStore()
    const tools = Object.fromEntries(
      [...getFirTools(store), ...getDispatchTools(store), ...getRecordTools(store)].map((t) => [t.name, t]),
    )

    // FIR first.
    await tools['fir.fill_field'].execute({ field: 'complainant.name', value: 'Alice' })
    await tools['fir.fill_field'].execute({ field: 'complainant.phone', value: '9876543210' })
    await tools['fir.fill_field'].execute({ field: 'offense.sections', value: ['279', '304A'] })
    await tools['fir.fill_field'].execute({ field: 'property', value: ['Bike'] })
    await tools['fir.fill_field'].execute({ field: 'accused.name', value: 'Unknown' })
    await tools['fir.fill_field'].execute({ field: 'narrative', value: 'Hit and run, pedestrian injured' })
    const fir = JSON.parse((await tools['fir.submit'].execute({})) as string)
    expect(fir.ok).toBe(true)

    // ERSS created independently.
    const erss = JSON.parse(
      (await tools['erss.create_call'].execute({ description: 'hit and run on MG Road, pedestrian injured' })) as string,
    )
    expect(erss.ok).toBe(true)
    expect(erss.erssNumber).toMatch(/^ERS-/)

    // Discoverable via record.list, and assign unit to it by id.
    const listed = JSON.parse((await tools['record.list'].execute({ module: 'dispatch' })) as string)
    expect(listed.records.some((r: { id: string }) => r.id === erss.id)).toBe(true)

    // Link FIR back to ERSS.
    const link = JSON.parse((await tools['fir.link_erss'].execute({ erssId: erss.id, recordId: fir.id })) as string)
    expect(link.ok).toBe(true)
    expect(link.linkedErssNumber).toBe(erss.erssNumber)
    const firRecord = store.get(fir.id)
    expect(firRecord?.sourceErss?.erssNumber).toBe(erss.erssNumber)

    // record.select targets the ERSS for a default-targeted tool call.
    const sel = JSON.parse((await tools['record.select'].execute({ recordId: erss.id })) as string)
    expect(sel.ok).toBe(true)
    const assigned = JSON.parse((await tools['dispatch.assign_unit'].execute({ unitId: 'PCR-88' })) as string)
    expect(assigned.recordId).toBe(erss.id)
    expect(store.get(erss.id)?.dispatch?.unit?.id).toBe('PCR-88')

    resetRecordFocus()
  })
})
