/**
 * Shared mock backend for the Digital Police Portal.
 *
 * A single in-memory + localStorage-backed store shared by all three WebMCP
 * modules (FIR, e-Challan, ERSS-112). Designing the incident schema up front
 * lets every module reference the same records without cross-module plumbing.
 */

export interface Property {
  type: 'movable' | 'immovable'
  description: string
  value: number
  marking?: string
  stolen: boolean
  recovered?: boolean
}

export interface Witness {
  name: string
  address: string
  phone: string
}

export interface Incident {
  id: string
  firNumber: string
  createdAt: string
  status: 'draft' | 'acknowledged' | 'dispatched' | 'closed'

  // FIR fields (module: FIR)
  complainant: {
    name: string
    fatherName?: string
    address?: string
    phone?: string
    email?: string
  }
  offense: {
    sections: string[] // IPC / special-act section codes
    date?: string
    time?: string
    place?: string
    beat?: string
  }
  accused: {
    name?: string // 'name unknown' if not provided
    description?: string
    age?: string
    sex?: string
  }
  property?: Property[]
  witnesses: Witness[]
  narrative: string
  missingFields: string[] // fields flagged for human review

  // e-Challan (module: Challan)
  challan?: {
    rcNumber: string
    offenseCode: string
    fineAmount: number
    evidencePhoto?: string
    paid: boolean
    courtSummons?: {
      summonsNumber: string
      courtName: string
      courtDate: string
      issuedAt: string
    }
  }

  // ERSS-112 (module: Dispatch)
  dispatch?: {
    channel: 'SMS' | 'Voice' | 'WhatsApp' | 'Chatbot' | 'IoT'
    natureCode: string
    priority: 'immediate' | 'urgent' | 'routine'
    location: { lat: number; lng: number; label: string }
    unit?: {
      id: string
      type: string
      etaMinutes: number
    }
    hospital?: {
      name: string
      ward: string
      bedNumber: string
      admittedAt: string
    }
  }
}

type Listener = (incidents: Incident[]) => void

const STORAGE_KEY = 'police-portal:incidents'
const listeners = new Set<Listener>()

/**
 * Seed data shown to a fresh visitor so the record browser / filters and every
 * module have content on first load. Mirrors what `fir.find_similar_cases`
 * reads (mockIncidents.json) plus a couple of challan + ERSS samples so the
 * e-Challan and ERSS-112 tabs demonstrate individual-record detail.
 */
export const SEED_INCIDENTS: Incident[] = [
  {
    id: 'seed-challan-001',
    firNumber: 'FIR-2025-000502',
    createdAt: '2025-07-12T09:15:00.000Z',
    status: 'acknowledged',
    complainant: { name: 'Vikram Singh', phone: '9812345670', address: '12 Hazratganj Road, Lucknow' },
    offense: { sections: ['379'], place: 'Hazratganj' },
    accused: { name: 'name unknown' },
    property: [],
    witnesses: [],
    narrative: 'Vehicle challan issued for overspeeding on MG Road.',
    missingFields: [],
    challan: {
      rcNumber: 'UP14C1234',
      offenseCode: '180',
      fineAmount: 2000,
      paid: false,
      courtSummons: {
        summonsNumber: 'CS-2025-1001',
        courtName: 'Chief Judicial Magistrate Court, Lucknow',
        courtDate: '2026-09-15',
        issuedAt: '2025-08-01T10:00:00.000Z',
      },
    },
  },
  {
    id: 'seed-eress-001',
    firNumber: 'FIR-2025-000466',
    createdAt: '2025-06-28T22:40:00.000Z',
    status: 'dispatched',
    complainant: { name: 'Emergency Caller' },
    offense: { sections: [] },
    accused: {},
    property: [],
    witnesses: [],
    narrative: 'Reported chest pain on Kanpur Road, ambulance dispatched.',
    missingFields: [],
    dispatch: {
      channel: 'Voice',
      natureCode: 'MED-001',
      priority: 'immediate',
      location: { lat: 26.833, lng: 80.893, label: 'Kanpur Road, Lucknow' },
      unit: { id: 'AMB-147', type: 'Ambulance', etaMinutes: 4 },
      hospital: {
        name: 'King George Medical University',
        ward: 'Emergency',
        bedNumber: 'E-101',
        admittedAt: '2025-06-28T22:55:00.000Z',
      },
    },
  },
]

function load(): Incident[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Incident[]) : []
  } catch {
    return []
  }
}

function persist(incidents: Incident[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(incidents))
  listeners.forEach((fn) => fn(incidents))
}

export const incidentStore = {
  list(): Incident[] {
    return load()
  },

  /** Populate the store with `SEED_INCIDENTS` only if it is currently empty. */
  seed(): Incident[] {
    const incidents = load()
    if (incidents.length > 0) return incidents
    persist(SEED_INCIDENTS)
    return SEED_INCIDENTS
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  create(data: Omit<Incident, 'id' | 'firNumber' | 'createdAt' | 'status' | 'witnesses' | 'missingFields'> = {
    complainant: { name: '' },
    offense: { sections: [] },
    accused: {},
    narrative: '',
  }, opts?: { firNumber?: string; id?: string }): Incident {
    const incidents = load()
    const seq = incidents.length + 1
    const incident: Incident = {
      ...data,
      id: opts?.id ?? crypto.randomUUID(),
      firNumber: opts?.firNumber ?? `FIR-2025-${String(seq).padStart(6, '0')}`,
      createdAt: new Date().toISOString(),
      status: 'draft',
      complainant: data.complainant ?? { name: '' },
      offense: data.offense ?? { sections: [] },
      accused: data.accused ?? {},
      witnesses: [],
      narrative: data.narrative ?? '',
      missingFields: [],
    }
    persist([incident, ...incidents])
    return incident
  },

  update(id: string, patch: Partial<Incident>): Incident | undefined {
    const incidents = load()
    const idx = incidents.findIndex((i) => i.id === id)
    if (idx === -1) return undefined
    incidents[idx] = { ...incidents[idx], ...patch }
    persist(incidents)
    return incidents[idx]
  },

  get(id: string): Incident | undefined {
    return load().find((i) => i.id === id)
  },
}
