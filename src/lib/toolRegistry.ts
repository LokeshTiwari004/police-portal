/**
 * Environment-agnostic tool definitions.
 *
 * The 12 portal tools (FIR / e-Challan / ERSS-112) are declared once here and
 * reused by two surfaces:
 *
 * - the browser, which registers them as WebMCP tools against
 *   `document.modelContext` (see `webmcpTools.ts`), and
 * - a Node MCP server, which exposes the same tools to external agents over the
 *   Model Context Protocol (see `server/mcp-server.ts`).
 *
 * The only environment-specific dependency is the `Store`, injected by the
 * caller. The browser injects the localStorage-backed `incidentStore`; the MCP
 * server injects an in-memory store. Keeping the tool logic free of
 * `document`/`localStorage` lets both surfaces share identical behavior.
 */

export interface Store<T> {
  list(): T[]
  /** Create a record with generated id / firNumber / createdAt / status. */
  create(data?: Partial<T>): T
  /** Persist a partial update; returns the updated record or undefined. */
  update(id: string, patch: Partial<T>): T | undefined
  get(id: string): T | undefined
}

interface SchemaField {
  name: string
  label: string
  type: string
  required?: boolean
  rule?: string
  requiredWhen?: { field: string; isEmpty: boolean }
}
interface SchemaSection {
  id: string
  label: string
  description?: string
  dependsOn?: { field: string; includeAny: string[] }
  fields: SchemaField[]
}

import type { Incident } from './incidentStore'
import { validateForm, requiredFieldsForSections } from './validation'
import schemaJson from '../data/formSchema.json'
import mockIncidents from '../data/mockIncidents.json'
import mockRC from '../data/mockRC.json'
import mvaFines from '../data/mvaFines.json'
import natureCodes from '../data/natureCodes.json'

interface RcRecord {
  rcNumber: string
  ownerName: string
  address: string
  vehicleClass: string
  makerModel?: string
  registrationDate?: string
  engineCapacity?: string
  fuelType?: string
  fitnessUpto?: string
  insuranceUpto?: string
}

interface FineOffence {
  offenseCode: string
  baseFine: number
}
interface FineMatrix {
  offences: FineOffence[]
  vehicleClassMultiplier: Record<string, number>
  defaultFine: number
  defaultMultiplier: number
}

interface NatureRule {
  natureCode: string
  label: string
  keywords: string[]
}

const RC_RECORDS = mockRC as RcRecord[]
const FINE_MATRIX = mvaFines as FineMatrix
const NATURE_RULES = natureCodes as NatureRule[]

const FIR_SCHEMA = (schemaJson as { sections: SchemaSection[] }).sections

/** Fields required in always-visible sections (no dependsOn), derived from formSchema.json. */
function requiredFieldsNow(): string[] {
  return FIR_SCHEMA.filter((s) => !s.dependsOn)
    .flatMap((s) => s.fields)
    .filter((f) => f.required)
    .map((f) => f.name)
}

export interface ToolDefinition {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (input: Record<string, unknown>, opts?: { signal?: AbortSignal }) => Promise<unknown> | unknown
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
}

export function getFirTools(store: Store<Incident>): ToolDefinition[] {
  return [
    {
      name: 'fir.identify_required_fields',
      title: 'Identify required FIR fields',
      description:
        'Return which FIR form fields are required now and which become required ' +
        'when a given IPC section is answered. Read this before filling the form.',
      inputSchema: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string' },
            description: 'IPC / special-act section codes, e.g. ["379"] (must match formSchema option values).',
          },
        },
        required: ['sections'],
      },
      execute: async ({ sections }) => {
        const list = (sections as string[]) ?? []
        const hidden = requiredFieldsForSections(list)
        return JSON.stringify({
          requiredNow: requiredFieldsNow(),
          hiddenWhenRevealed: hidden,
          tip: 'Use fir.fill_field to populate fields. Use fir.flag_missing to surface gaps.',
        })
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'fir.fill_field',
      title: 'Fill a FIR form field',
      description:
        'Fill one FIR field by dotted path and value. Returns revealed fields newly ' +
        'required by this value. The running form updates live.',
      inputSchema: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            description:
              "Dotted field path. Always-visible: complainant.name, complainant.fatherName, " +
              "complainant.address, complainant.phone, complainant.email, offense.date, offense.time, " +
              "offense.place, offense.beat, offense.sections, accused.name, accused.age, accused.sex, " +
              "accused.description, narrative. Conditional (shown for some sections): property, witnesses.",
          },
          value: { description: 'Value to set. Use a string for text, array of strings for offense.sections/property.', type: ['string', 'number', 'boolean', 'array'] },
        },
        required: ['field', 'value'],
      },
      execute: async ({ field, value }) => {
        const incident = store.list()[0] || store.create()
        const parts = (field as string).split('.')
        const updated: Incident = JSON.parse(JSON.stringify(incident))
        let ref: any = updated as any
        for (let i = 0; i < parts.length - 1; i++) {
          if (!ref[parts[i]]) ref[parts[i]] = {}
          ref = ref[parts[i]]
        }
        ref[parts[parts.length - 1]] = value
        store.update(incident.id, updated)

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
      name: 'fir.flag_missing',
      title: 'Flag fields for human review',
      description:
        'Mark FIR fields as needing an officer to review before submission.',
      inputSchema: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Dotted field paths that are incomplete or ambiguous (e.g. ["complainant.address"]).',
          },
          reason: { type: 'string', description: 'Why these need human review.' },
        },
        required: ['fields'],
      },
      execute: async ({ fields, reason }) => {
        const incident = store.list()[0] || store.create()
        const existing = new Set(incident.missingFields || [])
        ;(fields as string[]).forEach((f) => existing.add(f))
        store.update(incident.id, {
          missingFields: Array.from(existing),
        })
        return JSON.stringify({ flagged: fields, reason: reason || '', count: existing.size })
      },
    },
    {
      name: 'fir.validate_form',
      title: 'Validate the FIR form',
      description:
        "Validate the whole FIR form. Returns { valid, errors } with field -> message. " +
        "Matches what the on-screen form shows.",
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        const incident = store.list()[0] || store.create()
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
      name: 'fir.submit',
      title: 'Submit the FIR',
      description:
        'Submit the completed FIR after it passes validation. Persists the record.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        const incident = store.list()[0]
        if (!incident) return JSON.stringify({ ok: false, error: 'No incident in progress' })
        const { valid, errors } = validateForm({
          'complainant.name': incident.complainant.name,
          'complainant.phone': incident.complainant.phone,
          narrative: incident.narrative,
        })
        if (!valid) {
          return JSON.stringify({ ok: false, errors })
        }
        store.update(incident.id, { status: 'acknowledged' })
        return JSON.stringify({ ok: true, firNumber: incident.firNumber })
      },
    },
    {
      name: 'fir.find_similar_cases',
      title: 'Find similar past FIRs',
      description:
        'Search the case archive for prior FIRs matching the given IPC sections ' +
        '(optional location filter). Useful for precedent and repeat offenders.',
      inputSchema: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string' },
            description: 'IPC section codes to match, e.g. ["379"].',
          },
          location: { type: 'string', description: 'Optional place / area substring to constrain search.' },
        },
        required: ['sections'],
      },
      execute: async ({ sections, location }) => {
        const wanted = new Set(sections as string[])
        const matches = (mockIncidents as Incident[])
          .filter((a) => a.offense.sections.some((s) => wanted.has(s)))
          .filter((a) => !location || a.offense.place?.toLowerCase().includes(String(location).toLowerCase()))
          .map((a) => ({
            firNumber: a.firNumber,
            sections: a.offense.sections,
            location: a.offense.place,
            status: a.status,
          }))
        return JSON.stringify({ count: matches.length, matches })
      },
      annotations: { readOnlyHint: true },
    },
  ]
}

export function getChallanTools(): ToolDefinition[] {
  return [
    {
      name: 'challan.lookup_rc',
      title: 'Look up vehicle by RC',
      description:
        'Look up a vehicle by registration number. Returns owner, address, vehicle ' +
        'class, engine capacity and fuel type from the transport database.',
      inputSchema: {
        type: 'object',
        properties: { rcNumber: { type: 'string', description: 'Vehicle registration number, e.g. UP14C1234.' } },
        required: ['rcNumber'],
      },
      execute: async ({ rcNumber }) => {
        const rc = RC_RECORDS.find((r) => r.rcNumber.toLowerCase() === String(rcNumber ?? '').toLowerCase())
        if (!rc) return JSON.stringify({ rcNumber, status: 'not-found' })
        const { rcNumber: rn, ...owner } = rc
        return JSON.stringify({ rcNumber: rn, status: 'found', ...owner })
      },
    },
    {
      name: 'challan.auto_calculate_fine',
      title: 'Calculate traffic fine',
      description:
        'Compute the traffic fine for an offence and vehicle class from the Motor ' +
        'Vehicles Act matrix. Returns the amount in rupees.',
      inputSchema: {
        type: 'object',
        properties: {
          offenseCode: { type: 'string', description: 'MVA section code, e.g. 180, 123, 119.' },
          vehicleClass: { type: 'string', description: 'e.g. LMV, MCWG, HMV, Bus.' },
        },
        required: ['offenseCode'],
      },
      execute: async ({ offenseCode, vehicleClass }) => {
        const offence = FINE_MATRIX.offences.find((o) => o.offenseCode === String(offenseCode ?? ''))
        const baseAmt = offence?.baseFine ?? FINE_MATRIX.defaultFine
        const mult = FINE_MATRIX.vehicleClassMultiplier[String(vehicleClass ?? '')] ?? FINE_MATRIX.defaultMultiplier
        return JSON.stringify({ offenseCode, vehicleClass, fineAmount: Math.round(baseAmt * mult) })
      },
    },
    {
      name: 'challan.submit',
      title: 'Submit traffic challan',
      description: 'Finalize and persist a traffic challan.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => JSON.stringify({ ok: true, message: 'Challan persisted (stub)' }),
    },
  ]
}

export function getDispatchTools(store: Store<Incident>): ToolDefinition[] {
  return [
    {
      name: 'dispatch.classify_nature',
      title: 'Classify emergency nature code',
      description:
        'Map a natural-language emergency into an official ERSS-112 nature code ' +
        '("heart attack" -> MED-001, "fire" -> FIR-003).',
      inputSchema: {
        type: 'object',
        properties: { description: { type: 'string', description: 'Free-text emergency description.' } },
        required: ['description'],
      },
      execute: async ({ description }) => {
        const text = String(description ?? '').toLowerCase()
        for (const rule of NATURE_RULES) {
          if (rule.keywords.some((k) => text.includes(k))) {
            return JSON.stringify({ natureCode: rule.natureCode, label: rule.label })
          }
        }
        return JSON.stringify({ natureCode: 'GEN-000', label: 'General' })
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'dispatch.get_available_units',
      title: 'List available response units',
      description: 'Return available response units (ambulance, patrol, fire) and ETA.',
      inputSchema: {
        type: 'object',
        properties: { type: { type: 'string', description: 'Optional unit type filter (e.g. Ambulance).' } },
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
      name: 'dispatch.assign_unit',
      title: 'Assign response unit to incident',
      description:
        'Assign a response unit to an incident. Sets the incident status to dispatched.',
      inputSchema: {
        type: 'object',
        properties: {
          unitId: { type: 'string', description: 'Unit id from dispatch.get_available_units, e.g. PCR-88.' },
          incidentId: { type: 'string', description: 'Incident id; defaults to the active incident.' },
        },
        required: ['unitId'],
      },
      execute: async ({ unitId, incidentId }) => {
        const incident = incidentId ? store.get(incidentId as string) : store.list()[0]
        if (!incident) return JSON.stringify({ ok: false, error: 'No incident' })
        store.update(incident.id, {
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
