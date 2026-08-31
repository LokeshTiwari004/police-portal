import { incidentStore, type Incident } from './incidentStore'
import { validateForm, requiredFieldsForSections } from './validation'
import { telemetry } from './telemetry'

/**
 * WebMCP tool registry.
 *
 * Each tool is a JavaScript function with a natural-language `description` and a
 * JSON `inputSchema` that an AI agent can discover (via `document.modelContext.getTools()`)
 * and invoke (via `document.modelContext.executeTool(...)`).
 *
 * Correct usage notes:
 * - inputSchema must be JSON-serializable (no functions).
 * - `execute` receives the parsed input object and a `{ signal }` options object.
 * - Return string-ifiable values; the browser stringifies them for the agent.
 * - Register via AbortController signal so tools can be unregistered on tab-switch.
 */

interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (input: Record<string, unknown>, opts?: { signal?: AbortSignal }) => Promise<unknown> | unknown
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
}

let currentAbortController: AbortController | null = null

/**
 * Register (or re-register) a set of tools. Passing a module name like 'fir'
 * scopes registration so switching tabs doesn't re-register duplicates.
 */
export async function registerTools(module: 'fir' | 'challan' | 'dispatch') {
  const mc = (document as unknown as { modelContext?: any }).modelContext
  if (!mc || typeof mc.registerTool !== 'function') return

  // Unregister previous module's tools to keep the discovery list clean.
  if (currentAbortController) currentAbortController.abort()
  currentAbortController = new AbortController()

  const tools = getToolsForModule(module)
  telemetry.beginRegistration(tools.length)
  for (const tool of tools) {
    try {
      const timed: ToolDefinition = {
        ...tool,
        execute: async (input, opts) => {
          const start = performance.now()
          try {
            return await tool.execute(input, opts)
          } catch (err) {
            telemetry.recordTool(tool.name, performance.now() - start, String(err))
            throw err
          } finally {
            telemetry.recordTool(tool.name, performance.now() - start)
          }
        },
      }
      await mc.registerTool(timed, { signal: currentAbortController.signal })
    } catch (err) {
      console.warn(`[webmcp] failed to register ${tool.name}`, err)
    }
  }
  telemetry.endRegistration()
}

/** Register every module's tools on a single shared AbortController (used by the metrics tab). */
export async function registerAllTools() {
  const mc = (document as unknown as { modelContext?: any }).modelContext
  if (!mc || typeof mc.registerTool !== 'function') return
  if (currentAbortController) currentAbortController.abort()
  currentAbortController = new AbortController()

  const tools = ['fir', 'challan', 'dispatch'].flatMap((m) => getToolsForModule(m as 'fir' | 'challan' | 'dispatch'))
  telemetry.beginRegistration(tools.length)
  for (const tool of tools) {
    try {
      const timed: ToolDefinition = {
        ...tool,
        execute: async (input, opts) => {
          const start = performance.now()
          try {
            return await tool.execute(input, opts)
          } catch (err) {
            telemetry.recordTool(tool.name, performance.now() - start, String(err))
            throw err
          } finally {
            telemetry.recordTool(tool.name, performance.now() - start)
          }
        },
      }
      await mc.registerTool(timed, { signal: currentAbortController.signal })
    } catch (err) {
      console.warn(`[webmcp] failed to register ${tool.name}`, err)
    }
  }
  telemetry.endRegistration()
}

function getToolsForModule(module: 'fir' | 'challan' | 'dispatch'): ToolDefinition[] {
  switch (module) {
    case 'fir':
      return getFirTools()
    case 'challan':
      return getChallanTools()
    case 'dispatch':
      return getDispatchTools()
  }
}

/* ------------------------------------------------------------------ */
/* FIR tools                                                           */
/* ------------------------------------------------------------------ */

function getFirTools(): ToolDefinition[] {
  return [
    {
      name: 'fir/identify_required_fields',
      description:
        '[FIR] Given the selected offence sections, return the list of form fields that are ' +
        'currently live on the page, which are required, and which are hidden-but-will-be-needed.',
      inputSchema: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string' },
            description: 'IPC / special-act section codes, e.g. ["379"]',
          },
        },
        required: ['sections'],
      },
      execute: async ({ sections }) => {
        const list = (sections as string[]) ?? []
        const hidden = requiredFieldsForSections(list)
        return JSON.stringify({
          requiredNow: ['complainant.name', 'complainant.phone', 'offense.sections', 'narrative'],
          hiddenWhenRevealed: hidden,
          tip: 'Use fir/fill_field to populate fields. Use fir/flag_missing to surface gaps.',
        })
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'fir/fill_field',
      description:
        '[FIR] Fill a single field in the FIR form. Provide the field name and value. ' +
        'Returns a structured result: { success, error? , revealedFields? }. If a field ' +
        'becomes newly required because of this value, revealedFields lists them.',
      inputSchema: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            description: 'Field name. Use dotted path e.g. complainant.name, offense.sections, narrative.',
          },
          value: { description: 'Value to set. May be a string, number, boolean, or array.', type: ['string', 'number', 'boolean', 'array'] },
        },
        required: ['field', 'value'],
      },
      execute: async ({ field, value }) => {
        const incident = incidentStore.list()[0] || incidentStore.create()
        // Support dotted paths like "complainant.name"
        const parts = (field as string).split('.')
        const updated: Incident = JSON.parse(JSON.stringify(incident))
        let ref: any = updated as any
        for (let i = 0; i < parts.length - 1; i++) {
          if (!ref[parts[i]]) ref[parts[i]] = {}
          ref = ref[parts[i]]
        }
        ref[parts[parts.length - 1]] = value
        incidentStore.update(incident.id, updated)

        // If offense sections changed, check for newly revealed mandatory fields.
        const revealed: string[] = []
        if (parts[0] === 'offense' && parts[1] === 'sections') {
          for (const key of requiredFieldsForSections(value as string[])) {
            if (key === 'property' && (!updated.property || updated.property.length === 0)) {
              revealed.push('property')
            }
            if (key === 'witnesses' && updated.witnesses.length === 0) {
              revealed.push('witnesses')
            }
          }
        }
        return JSON.stringify({ success: true, field, revealedFields: revealed })
      },
    },
    {
      name: 'fir/flag_missing',
      description:
        '[FIR] Flag one or more fields as needing human review. Marks them in the UI so ' +
        'an officer can complete them before the FIR is submitted.',
      inputSchema: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Field names that are incomplete or ambiguous.',
          },
          reason: { type: 'string', description: 'Why these need human review.' },
        },
        required: ['fields'],
      },
      execute: async ({ fields, reason }) => {
        const incident = incidentStore.list()[0] || incidentStore.create()
        const existing = new Set(incident.missingFields || [])
        ;(fields as string[]).forEach((f) => existing.add(f))
        incidentStore.update(incident.id, {
          missingFields: Array.from(existing),
        })
        return JSON.stringify({ flagged: fields, reason: reason || '', count: existing.size })
      },
    },
    {
      name: 'fir/validate_form',
      description:
        '[FIR] Validate the entire FIR form. Returns { valid, errors } where errors maps ' +
        'field names to human-readable messages.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        const incident = incidentStore.list()[0] || incidentStore.create()
        const flat: Record<string, unknown> = {
          'complainant.name': incident.complainant.name,
          'complainant.phone': incident.complainant.phone,
          narrative: incident.narrative,
        }
        const { valid, errors } = validateForm(flat)
        return JSON.stringify({ valid, errors, firNumber: incident.firNumber })
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'fir/submit',
      description:
        '[FIR] Submit the completed FIR. Persists the record and marks it closed/draft-submitted.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        const incident = incidentStore.list()[0]
        if (!incident) return JSON.stringify({ ok: false, error: 'No incident in progress' })
        const { valid, errors } = validateForm({
          'complainant.name': incident.complainant.name,
          'complainant.phone': incident.complainant.phone,
          narrative: incident.narrative,
        })
        if (!valid) {
          return JSON.stringify({ ok: false, errors })
        }
        incidentStore.update(incident.id, { status: 'acknowledged' })
        return JSON.stringify({ ok: true, firNumber: incident.firNumber })
      },
    },
    {
      name: 'fir/find_similar_cases',
      description:
        '[FIR] Search the case archive for prior FIRs matching offence sections. ' +
        'Useful for investigators to find precedent / repeat offenders.',
      inputSchema: {
        type: 'object',
        properties: {
          sections: { type: 'array', items: { type: 'string' } },
          location: { type: 'string', description: 'Optional area / district to constrain search.' },
        },
        required: ['sections'],
      },
      execute: async ({ sections, location }) => {
        // Mock archive — in a real deployment this would hit CCTNS analytics.
        const archive = [
          { firNumber: 'FIR-2024-000981', sections: ['379'], location: 'MG Road', status: 'charge-sheeted' },
          { firNumber: 'FIR-2024-001203', sections: ['379', '380'], location: 'Civil Lines', status: 'investigating' },
          { firNumber: 'FIR-2025-000044', sections: ['420'], location: 'Sector 15', status: 'pending' },
        ]
        const wanted = new Set(sections as string[])
        const matches = archive.filter(
          (a) => a.sections.some((s) => wanted.has(s)) && (!location || a.location.includes(location as string)),
        )
        return JSON.stringify({ count: matches.length, matches })
      },
      annotations: { readOnlyHint: true },
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Challan tools (placeholder — implemented in the Should-Have phase)  */
/* ------------------------------------------------------------------ */

function getChallanTools(): ToolDefinition[] {
  return [
    {
      name: 'challan/lookup_rc',
      description:
        '[Challan] Look up a vehicle by registration number (RC). Returns owner name, ' +
        'address, vehicle class, engine capacity, and fuel type from the transport database.',
      inputSchema: {
        type: 'object',
        properties: { rcNumber: { type: 'string', description: 'Vehicle registration number, e.g. UP14C1234.' } },
        required: ['rcNumber'],
      },
      execute: async ({ rcNumber }) => {
        // TODO(Should-Have phase): query mockRC.json
        return JSON.stringify({ rcNumber, ownerName: 'Rajesh Kumar', address: '123 MG Road, Lucknow', vehicleClass: 'MCWG', status: 'found' })
      },
    },
    {
      name: 'challan/auto_calculate_fine',
      description:
        '[Challan] Compute the traffic fine for a given offence and vehicle class based on ' +
        'the Motor Vehicles Act matrix. Returns amount in rupees.',
      inputSchema: {
        type: 'object',
        properties: {
          offenseCode: { type: 'string', description: 'MVA section code, e.g. 180, 123, 119.' },
          vehicleClass: { type: 'string', description: 'e.g. LMV, MCWG, HMV, Bus.' },
        },
        required: ['offenseCode'],
      },
      execute: async ({ offenseCode, vehicleClass }) => {
        // TODO(Should-Have phase): int mvaFines.json
        const base: Record<string, number> = { 119: 1000, 123: 1000, 126: 5000, 143: 5000, 180: 2000, 194: 10000 }
        const mult: Record<string, number> = { LMV: 1, MCWG: 0.5, HMV: 1.5, Bus: 1.2 }
        const baseAmt = base[String(offenseCode)] ?? 500
        return JSON.stringify({ offenseCode, vehicleClass, fineAmount: Math.round(baseAmt * (mult[String(vehicleClass)] ?? 1)) })
      },
    },
    {
      name: 'challan/submit',
      description: '[Challan] Finalize and persist a traffic challan.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => JSON.stringify({ ok: true, message: 'Challan persisted (stub)' }),
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Dispatch tools (placeholder — implemented in the Stretch phase)     */
/* ------------------------------------------------------------------ */

function getDispatchTools(): ToolDefinition[] {
  return [
    {
      name: 'dispatch/classify_nature',
      description:
        '[Dispatch] Map a natural-language description of an emergency to an official ' +
        'ERSS-112 nature code (e.g. "heart attack" -> MED-001).',
      inputSchema: {
        type: 'object',
        properties: { description: { type: 'string' } },
        required: ['description'],
      },
      execute: async ({ description }) => {
        const text = String(description ?? '').toLowerCase()
        if (/heart|attack|medical|ambulance|breath/i.test(text)) return JSON.stringify({ natureCode: 'MED-001', label: 'Medical Emergency' })
        if (/fire|smoke|burn/i.test(text)) return JSON.stringify({ natureCode: 'FIR-003', label: 'Fire' })
        if (/stolen|theft|rob|assault|fight/i.test(text)) return JSON.stringify({ natureCode: 'POL-007', label: 'Police Assistance' })
        if (/missing|child|women|harass/i.test(text)) return JSON.stringify({ natureCode: 'WCH-004', label: 'Women & Child' })
        return JSON.stringify({ natureCode: 'GEN-000', label: 'General' })
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'dispatch/get_available_units',
      description: '[Dispatch] Return available response units (ambulances, patrol cars, fire tenders).',
      inputSchema: {
        type: 'object',
        properties: { type: { type: 'string', description: 'Unit type filter.' } },
      },
      execute: async () =>
        JSON.stringify({
          units: [
            { id: 'AMB-147', type: 'Ambulance', eta: 4, status: 'enroute' },
            { id: 'PCR-88', type: 'Patrol', eta: 2, status: 'available' },
            { id: 'FIR-2', type: 'Fire', eta: 6, status: 'available' },
          ],
        }),
      annotations: { readOnlyHint: true },
    },
    {
      name: 'dispatch/assign_unit',
      description: '[Dispatch] Assign a response unit to an incident. Escalates if the unit is busy.',
      inputSchema: {
        type: 'object',
        properties: {
          unitId: { type: 'string' },
          incidentId: { type: 'string' },
        },
        required: ['unitId'],
      },
      execute: async ({ unitId, incidentId }) => {
        const incident = incidentId ? incidentStore.get(incidentId as string) : incidentStore.list()[0]
        if (!incident) return JSON.stringify({ ok: false, error: 'No incident' })
        incidentStore.update(incident.id, {
          status: 'dispatched',
          dispatch: {
            ...(incident.dispatch ?? { channel: 'SMS', natureCode: 'GEN', priority: 'routine', location: { lat: 0, lng: 0, label: '' } }),
            unit: { id: unitId as string, type: 'Ambulance', etaMinutes: 4 },
          },
        })
        return JSON.stringify({ ok: true, unitId, escalated: false })
      },
    },
  ]
}
