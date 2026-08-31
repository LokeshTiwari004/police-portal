/**
 * In-memory `Store` for the external-agent MCP bridge.
 *
 * Environment-agnostic (no `localStorage`/`document`): lets the shared tool
 * registry (`toolRegistry.ts`) run under Node the same way the browser's
 * localStorage-backed `incidentStore` does. Mirrors the browser store's
 * generated metadata (id, firNumber, createdAt, status, defaults).
 */

import type { Incident } from './incidentStore'
import type { Store } from './toolRegistry'

export function createMemoryStore(): Store<Incident> {
  const incidents: Incident[] = []
  let seq = 0
  return {
    list: () => incidents,
    create(data: Partial<Incident> = {}) {
      seq += 1
      const incident: Incident = {
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
      incidents.unshift(incident)
      return incident
    },
    update(id, patch) {
      const idx = incidents.findIndex((i) => i.id === id)
      if (idx === -1) return undefined
      incidents[idx] = { ...incidents[idx], ...patch }
      return incidents[idx]
    },
    get(id) {
      return incidents.find((i) => i.id === id)
    },
  }
}
