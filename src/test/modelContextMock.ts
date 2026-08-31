/**
 * Shared WebMCP test helpers.
 *
 * jsdom has no `document.modelContext`; these mock it for integration tests
 * that drive the registered tools end-to-end. Tests share jsdom's persisted
 * localStorage, so call `clearStore()` in `beforeEach`.
 */

export interface MockedModelContext {
  registered: Array<{ name: string; execute: (input: unknown, o?: { signal?: AbortSignal }) => unknown }>
  registerTool: (tool: unknown) => Promise<void>
  getTools: () => Promise<Array<{ name: string }>>
}

export function mockModelContext(): MockedModelContext {
  const registered: Array<{ name: string; execute: (i: unknown, o?: { signal?: AbortSignal }) => unknown }> = []
  const mc: MockedModelContext = {
    registered,
    async registerTool(tool: unknown) {
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
