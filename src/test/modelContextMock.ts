/**
 * Shared WebMCP test helpers.
 *
 * jsdom has no `document.modelContext`; these mock it for integration tests
 * that drive the registered tools end-to-end. Tests share jsdom's persisted
 * localStorage, so call `clearStore()` in `beforeEach`.
 */

import { resetRegisteredTools } from '../lib/webmcpTools'

export interface MockedModelContext {
  registered: Array<{ name: string; execute: (input: unknown, o?: { signal?: AbortSignal }) => unknown }>
  registerTool: (tool: unknown) => Promise<void>
  getTools: () => Promise<Array<{ name: string }>>
}

export function mockModelContext(): MockedModelContext {
  resetRegisteredTools()
  const registered: Array<{ name: string; execute: (i: unknown, o?: { signal?: AbortSignal }) => unknown }> = []
  const mc: MockedModelContext = {
    registered,
    async registerTool(tool: unknown) {
      const { name } = tool as { name: string }
      // Mirror real Chrome: no unregister and duplicate names are rejected with
      // InvalidStateError — keeps the idempotency regression covered.
      if (registered.some((t) => t.name === name)) {
        throw new DOMException('Duplicate tool name', 'InvalidStateError')
      }
      registered.push(tool as (typeof registered)[number])
    },
    async getTools() {
      return registered
    },
  }
  ;(document as unknown as { modelContext?: MockedModelContext }).modelContext = mc
  return mc
}

export function clearStore() {
  localStorage.removeItem('police-portal:incidents')
}
