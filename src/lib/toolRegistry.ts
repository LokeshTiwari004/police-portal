/**
 * Environment-agnostic tool definitions.
 *
 * The portal tools (FIR / e-Challan / ERSS-112 / record / nav) are declared once
 * here and reused by two surfaces:
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
  create(data?: Partial<T>, opts?: { firNumber?: string; id?: string }): T
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
import {
  validateIncident,
  isFieldRequired,
  requiredFieldsForSections,
} from './validation'
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
function requiredFieldsNow(incident: Incident): string[] {
  return FIR_SCHEMA.filter((s) => !s.dependsOn)
    .flatMap((s) => s.fields)
    .filter((f) => f.required || isFieldRequired(f, incident))
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

/**
 * Module-global "selected record" focus. `record.select` sets it so subsequent
 * tool calls (which default to the most recent record) can target an explicit
 * record by id OR the most recently selected one. `recordId` passed directly
 * to a tool always wins over the focus. Over MCP each server has its own
 * factory closure; the browser keeps one per page. Reset via `resetRecordFocus`
 * (test seam).
 */
let focusedRecordId: string | undefined

export function resetRecordFocus() {
  focusedRecordId = undefined
}

/** Resolve which incident a tool should act on: explicit id > focused > most recent. */
function resolveTarget(store: Store<Incident>, recordId?: unknown): Incident | undefined {
  if (recordId && typeof recordId === 'string') {
    const byId = store.get(recordId)
    if (byId) return byId
  }
  if (focusedRecordId) {
    const focused = store.get(focusedRecordId)
    if (focused) return focused
  }
  return store.list()[0]
}

export function getFirTools(store: Store<Incident>): ToolDefinition[] {
  return [
    {
      name: 'fir.identify_required_fields',
      title: 'Identify required FIR fields',
      description:
        'FIR helper. You call me to know which FIR fields are required now and which ' +
        'become required once a given IPC section is set (e.g. theft switches "property" ' +
        'to required). Do NOT try to read the form on screen for this — I compute it ' +
        'authoritatively. Read me first, then populate via fir.fill_field.',
      inputSchema: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string' },
            description: 'IPC / special-act section codes, e.g. ["379"] (must match formSchema option values).',
          },
          recordId: { type: 'string', description: 'Incident id to target; defaults to the selected/most recent record.' },
        },
        required: ['sections'],
      },
      execute: async ({ sections, recordId }) => {
        const incident = resolveTarget(store, recordId) || store.create()
        const list = (sections as string[]) ?? []
        const hidden = requiredFieldsForSections(list)
        return JSON.stringify({
          requiredNow: requiredFieldsNow(incident),
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
        'FIR action. I write one FIR field by dotted path and value into the record and the ' +
        'live form updates. This is how you file paperwork — do NOT click/type into the ' +
        'browser. Call me repeatedly (complainant.name, offense.sections, accused.*, narrative, ' +
        'and conditional property/witnesses) until fir.validate_form passes.',
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
          recordId: { type: 'string', description: 'Incident id to target; defaults to the selected/most recent record.' },
        },
        required: ['field', 'value'],
      },
      execute: async ({ field, value, recordId }) => {
        const incident = resolveTarget(store, recordId) || store.create()
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
      annotations: { readOnlyHint: false },
    },
    {
      name: 'fir.flag_missing',
      title: 'Flag fields for human review',
      description:
        'FIR action. I mark FIR fields as needing an officer to review before submission ' +
        '(e.g. ambiguous identity). Call me instead of guessing a value you cannot confirm.',
      inputSchema: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Dotted field paths that are incomplete or ambiguous (e.g. ["complainant.address"]).',
          },
          reason: { type: 'string', description: 'Why these need human review.' },
          recordId: { type: 'string', description: 'Incident id to target; defaults to the selected/most recent record.' },
        },
        required: ['fields'],
      },
      execute: async ({ fields, reason, recordId }) => {
        const incident = resolveTarget(store, recordId) || store.create()
        const existing = new Set(incident.missingFields || [])
        ;(fields as string[]).forEach((f) => existing.add(f))
        store.update(incident.id, {
          missingFields: Array.from(existing),
        })
        return JSON.stringify({ flagged: fields, reason: reason || '', count: existing.size })
      },
      annotations: { readOnlyHint: false },
    },
    {
      name: 'fir.validate_form',
      title: 'Validate the FIR form',
      description:
        'FIR action. I run the same validation the officer\'s form uses and return ' +
        '{ valid, errors } with field->message. Call me before fir.submit to confirm the FIR ' +
        'is complete — this is the source of truth, not reading the page.',
      inputSchema: { type: 'object', properties: { recordId: { type: 'string', description: 'Incident id to target; defaults to the selected/most recent record.' } } },
      execute: async ({ recordId }) => {
        const incident = resolveTarget(store, recordId) || store.create()
        const { valid, errors } = validateIncident(incident, FIR_SCHEMA)
        return JSON.stringify({ valid, errors, firNumber: incident.firNumber, id: incident.id })
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'fir.submit',
      title: 'Submit the FIR',
      description:
        'FIR action. I submit the completed FIR after full-form validation passes and return ' +
        'the persisted id, firNumber and status. Call me to file the record — never press a ' +
        'button in the browser. I reject with errors if anything is missing; fix via fir.fill_field.',
      inputSchema: { type: 'object', properties: { recordId: { type: 'string', description: 'Incident id to target; defaults to the selected/most recent record.' } } },
      execute: async ({ recordId }) => {
        const incident = resolveTarget(store, recordId)
        if (!incident) return JSON.stringify({ ok: false, error: 'No incident in progress' })
        const { valid, errors } = validateIncident(incident, FIR_SCHEMA)
        if (!valid) {
          return JSON.stringify({ ok: false, errors })
        }
        const updated = store.update(incident.id, { status: 'acknowledged' })
        return JSON.stringify({
          ok: true,
          id: incident.id,
          firNumber: incident.firNumber,
          status: updated?.status ?? 'acknowledged',
        })
      },
      annotations: { readOnlyHint: false },
    },
    {
      name: 'fir.find_similar_cases',
      title: 'Find similar past FIRs',
      description:
        'FIR research helper. I search the case archive for prior FIRs matching given IPC ' +
        'sections (optional location filter) and return precedents for repeat offenders. ' +
        'Read-only; call me for background, not to change records.',
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
    {
      name: 'fir.create',
      title: 'Create a new FIR record',
      description:
        'FIR action. I create a fresh blank FIR and select it so later calls act on it. ' +
        'Optionally pre-seed complainantName / sections / narrative. Call me to start a case ' +
        'instead of clicking the UI.',
      inputSchema: {
        type: 'object',
        properties: {
          complainantName: { type: 'string', description: 'Optional complainant name to pre-fill.' },
          sections: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional IPC section codes to pre-fill, e.g. ["279", "304A"] for a hit-and-run / rash driving.' },
          narrative: { type: 'string', description: 'Optional narrative describing the incident.' },
        },
      },
      execute: async ({ complainantName, sections, narrative }) => {
        const incident = store.create({
          complainant: { name: String(complainantName ?? '') },
          offense: { sections: (sections as string[]) ?? [] },
          accused: {},
          narrative: String(narrative ?? ''),
        })
        focusedRecordId = incident.id
        return JSON.stringify({ ok: true, id: incident.id, firNumber: incident.firNumber, status: incident.status })
      },
      annotations: { readOnlyHint: false },
    },
    {
      name: 'fir.link_erss',
      title: 'Link an FIR to an originating ERSS-112 call',
      description:
        'FIR action. I link an FIR back to the ERSS-112 call that led to it, so the officer ' +
        'sees the source (an "Escalated from ERSS-112" marker appears). Pass the ERSS record id. ' +
        'Call me after you escalate a call — do not edit the UI.',
      inputSchema: {
        type: 'object',
        properties: {
          erssId: { type: 'string', description: 'The ERSS-112 record id to reference.' },
          recordId: { type: 'string', description: 'The FIR incident id to link (defaults to selected/most recent).' },
        },
        required: ['erssId'],
      },
      execute: async ({ erssId, recordId }) => {
        const erss = store.get(String(erssId ?? ''))
        if (!erss) return JSON.stringify({ ok: false, error: 'ERSS record not found', erssId })
        const linkErssNumber = erss.firNumber
        const fir = resolveTarget(store, recordId)
        if (!fir) return JSON.stringify({ ok: false, error: 'No FIR to link' })
        store.update(fir.id, {
          sourceErss: {
            id: erss.id,
            erssNumber: erss.firNumber,
            linkErssNumber,
          },
        })
        return JSON.stringify({
          ok: true,
          firId: fir.id,
          firNumber: fir.firNumber,
          linkedErssNumber: erss.firNumber,
          linkErssNumber,
        })
      },
      annotations: { readOnlyHint: false },
    },
  ]
}

export function getChallanTools(store: Store<Incident>): ToolDefinition[] {
  return [
    {
      name: 'challan.lookup_rc',
      title: 'Look up vehicle by RC',
      description:
        'Challan helper. I look up a vehicle by its registration number in the transport ' +
        'database and return owner, address, vehicle class and fuel type. Call me to identify a ' +
        'vehicle — do not search the page.',
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
      annotations: { readOnlyHint: true },
    },
    {
      name: 'challan.auto_calculate_fine',
      title: 'Calculate traffic fine',
      description:
        'Challan helper. I compute the traffic fine for an MVA offence + vehicle class from the ' +
        'statutory matrix and return the amount in rupees. Call me to price a challan before challan.submit.',
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
      annotations: { readOnlyHint: true },
    },
    {
      name: 'challan.submit',
      title: 'Submit traffic challan',
      description:
        'Challan action. I persist a traffic challan onto the active record and cross-link it to ' +
        'the FIR. Pass rcNumber, offenseCode and fineAmount (from challan.lookup_rc / ' +
        'challan.auto_calculate_fine). Call me to issue the challan — do not fill the form in the browser.',
      inputSchema: {
        type: 'object',
        properties: {
          rcNumber: { type: 'string', description: 'Vehicle registration number from challan.lookup_rc.' },
          offenseCode: { type: 'string', description: 'MVA section code used to compute the fine.' },
          fineAmount: { type: 'number', description: 'Fine in rupees from challan.auto_calculate_fine.' },
          recordId: { type: 'string', description: 'Incident id to attach the challan to (defaults to selected/most recent).' },
        },
      },
      execute: async ({ rcNumber, offenseCode, fineAmount, recordId }) => {
        const incident = resolveTarget(store, recordId)
        if (!incident) return JSON.stringify({ ok: false, error: 'No incident in progress' })
        const updated = store.update(incident.id, {
          challan: {
            rcNumber: String(rcNumber ?? ''),
            offenseCode: String(offenseCode ?? ''),
            fineAmount: Number(fineAmount ?? 0),
            paid: false,
          },
        })
        return JSON.stringify({ ok: true, id: incident.id, firNumber: incident.firNumber, challan: updated?.challan })
      },
      annotations: { readOnlyHint: false },
    },
  ]
}

export function getDispatchTools(store: Store<Incident>): ToolDefinition[] {
  return [
    {
      name: 'dispatch.classify_nature',
      title: 'Classify emergency nature code',
      description:
        'ERSS helper. I map a natural-language emergency into an official ERSS-112 nature code ' +
        '("heart attack" -> MED-001, "fire" -> FIR-003). Call me to classify a call.',
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
      description: 'ERSS action. I return the units you can dispatch (ambulance, patrol, fire) with ETA. Call me before dispatch.assign_unit to pick a unit id.',
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
      name: 'erss.create_call',
      title: 'Create an ERSS-112 call',
      description:
        'ERSS action. I create a standalone ERSS-112 emergency call from free text: classify the ' +
        'nature, set priority and select the record. Returns id, erssNumber and nature. Call me to ' +
        'log an incoming 112 call — do not open/locate the Emergency Call Log in the browser.',
      inputSchema: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Free-text emergency description, e.g. "hit and run on MG Road".' },
          channel: { type: 'string', enum: ['Voice', 'SMS', 'WhatsApp'], description: 'Reporting channel (default Voice).' },
        },
        required: ['description'],
      },
      execute: async ({ description, channel }) => {
        const text = String(description ?? '')
        const lower = text.toLowerCase()
        const rule = NATURE_RULES.find((r) => r.keywords.some((k) => lower.includes(k)))
        const natureCode = rule?.natureCode ?? 'GEN-000'
        const seq = store.list().length + 1
        const call = store.create(
          {
            complainant: { name: 'Emergency Caller' },
            offense: { sections: [] },
            accused: {},
            narrative: text,
            dispatch: {
              channel: channel === 'SMS' || channel === 'WhatsApp' ? channel : 'Voice',
              natureCode,
              priority: natureCode === 'MED-001' ? 'immediate' : 'urgent',
              location: { lat: 26.8467, lng: 80.9462, label: 'Lucknow, UP' },
            },
          },
          { firNumber: `ERS-2025-${String(seq).padStart(6, '0')}` },
        )
        focusedRecordId = call.id
        return JSON.stringify({
          ok: true,
          id: call.id,
          erssNumber: call.firNumber,
          firNumber: call.firNumber,
          natureCode,
          label: rule?.label ?? 'General',
        })
      },
      annotations: { readOnlyHint: false },
    },
    {
      name: 'dispatch.assign_unit',
      title: 'Assign response unit to incident',
      description:
        'ERSS action. I assign a response unit to an incident and set its status to dispatched. ' +
        'Pass unitId from dispatch.get_available_units. Call me to dispatch — never manipulate the dispatch UI.',
      inputSchema: {
        type: 'object',
        properties: {
          unitId: { type: 'string', description: 'Unit id from dispatch.get_available_units, e.g. PCR-88.' },
          recordId: { type: 'string', description: 'Incident id; defaults to the selected/most recent incident.' },
          incidentId: { type: 'string', description: 'Deprecated alias for recordId.' },
        },
        required: ['unitId'],
      },
      execute: async ({ unitId, recordId, incidentId }) => {
        const incident = resolveTarget(store, recordId ?? incidentId)
        if (!incident) return JSON.stringify({ ok: false, error: 'No incident' })
        store.update(incident.id, {
          status: 'dispatched',
          dispatch: {
            ...(incident.dispatch ?? { channel: 'SMS', natureCode: 'GEN', priority: 'routine', location: { lat: 0, lng: 0, label: '' } }),
            unit: { id: unitId as string, type: 'Ambulance', etaMinutes: 4 },
          },
        })
        return JSON.stringify({ ok: true, recordId: incident.id, unitId, escalated: false })
      },
      annotations: { readOnlyHint: false },
    },
  ]
}

export function getRecordTools(store: Store<Incident>): ToolDefinition[] {
  return [
    {
      name: 'record.list',
      title: 'List incidents/records',
      description:
        'Record helper — call me FIRST. I return the portal\'s records (FIR / e-Challan / ERSS-112) ' +
        'with optional module/status/text filters and each record\'s id. Always call me to discover a ' +
        'record id before acting, instead of reading the on-screen list.',
      inputSchema: {
        type: 'object',
        properties: {
          module: {
            type: 'string',
            enum: ['fir', 'challan', 'dispatch', ''],
            description: 'Optional module filter: fir, challan, dispatch, or empty for all.',
          },
          status: { type: 'string', description: 'Optional status filter (draft, acknowledged, dispatched, closed).' },
          text: { type: 'string', description: 'Optional free-text search across firNumber / complainant / narrative / RC.' },
        },
      },
      execute: async ({ module, status, text }) => {
        const q = String(text ?? '').toLowerCase()
        const recs = store
          .list()
          .filter((inc) => {
            if (status && inc.status !== String(status)) return false
            const challan = !!inc.challan
            const dispatch = !!inc.dispatch
            const fir = !challan && !dispatch
            if (module === 'fir' && !fir) return false
            if (module === 'challan' && !challan) return false
            if (module === 'dispatch' && !dispatch) return false
            if (!q) return true
            return (
              inc.firNumber.toLowerCase().includes(q) ||
              (inc.complainant.name || '').toLowerCase().includes(q) ||
              (inc.narrative || '').toLowerCase().includes(q) ||
              (inc.challan?.rcNumber || '').toLowerCase().includes(q)
            )
          })
          .map((inc) => {
            const badges: string[] = []
            const hasChallan = !!inc.challan
            const hasDispatch = !!inc.dispatch
            const hasFir = !hasChallan && !hasDispatch
            if (hasFir) badges.push('fir')
            if (hasChallan) badges.push('challan')
            if (hasDispatch) badges.push('dispatch')
            if (inc.sourceErss) badges.push('linked-to-erss')
            return {
              id: inc.id,
              firNumber: inc.firNumber,
              status: inc.status,
              modules: badges,
            }
          })
        return JSON.stringify({ count: recs.length, records: recs })
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'record.select',
      title: 'Select the active record',
      description:
        'Record action. I set which record later calls (fir.*, challan.submit, dispatch.*) act on by ' +
        'default. Pass recordId from record.list. Call me to focus work on one record instead of interacting ' +
        'with the list UI.',
      inputSchema: {
        type: 'object',
        properties: { recordId: { type: 'string', description: 'The incident id to select (from record.list).' } },
        required: ['recordId'],
      },
      execute: async ({ recordId }) => {
        const incident = store.get(String(recordId ?? ''))
        if (!incident) return JSON.stringify({ ok: false, error: 'Record not found', recordId })
        focusedRecordId = incident.id
        return JSON.stringify({ ok: true, selected: { id: incident.id, firNumber: incident.firNumber, status: incident.status } })
      },
      annotations: { readOnlyHint: false },
    },
  ]
}

export function getNavTools(): ToolDefinition[] {
  return [
    {
      name: 'nav.switch_tab',
      title: 'Switch portal tab',
      description:
        'Navigation action. I switch the portal to a module tab (fir, challan, dispatch, metrics) so the ' +
        'agent and officer share the same screen. Call me to move views — do not click the nav bar.',
      inputSchema: {
        type: 'object',
        properties: {
          tab: {
            type: 'string',
            enum: ['fir', 'challan', 'dispatch', 'metrics'],
            description: 'Which tab to switch to: fir, challan, dispatch, or metrics.',
          },
        },
        required: ['tab'],
      },
      execute: async ({ tab }) => {
        const target = String(tab ?? 'fir') as 'fir' | 'challan' | 'dispatch' | 'metrics'
        // Browser only: dispatch a CustomEvent so the UI can react. Over MCP (no
        // DOM window) this is a safe no-op that still reports the requested tab.
        const g = globalThis as unknown as {
          CustomEvent?: new (type: string, opts?: unknown) => { detail?: { tab?: string } }
          dispatchEvent?: (e: unknown) => void
        }
        if (typeof g.CustomEvent === 'function' && typeof g.dispatchEvent === 'function') {
          g.dispatchEvent(new g.CustomEvent('portal:tabchange', { detail: { tab: target } }))
        }
        return JSON.stringify({ ok: true, switchedTo: target })
      },
      annotations: { readOnlyHint: false },
    },
  ]
}
