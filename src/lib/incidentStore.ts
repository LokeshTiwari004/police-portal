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
  }
}

type Listener = (incidents: Incident[]) => void

const STORAGE_KEY = 'police-portal:incidents'
const listeners = new Set<Listener>()

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

  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  create(data: Omit<Incident, 'id' | 'firNumber' | 'createdAt' | 'status' | 'witnesses' | 'missingFields'> = {
    complainant: { name: '' },
    offense: { sections: [] },
    accused: {},
    narrative: '',
  }): Incident {
    const incidents = load()
    const seq = incidents.length + 1
    const incident: Incident = {
      ...data,
      id: crypto.randomUUID(),
      firNumber: `FIR-2025-${String(seq).padStart(6, '0')}`,
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
