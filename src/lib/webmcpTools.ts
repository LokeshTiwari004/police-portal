/**
 * WebMCP tool registration (browser).
 *
 * The 12 portal tool definitions live in `toolRegistry.ts` (environment-
 * agnostic; an external agent can reach them over MCP via `server/mcp-server.ts`).
 * This module adapts those definitions to the browser by injecting the
 * localStorage-backed `incidentStore` and registering them against
 * `document.modelContext` as WebMCP tools.
 *
 * Correct usage notes:
 * - inputSchema must be JSON-serializable (no functions).
 * - `execute` receives the parsed input object and a `{ signal }` options object.
 * - Return string-ifiable values; the browser stringifies them for the agent.
 *
 * WebMCP has no unregister API: a successfully registered tool persists for the
 * page lifetime. Registration is therefore idempotent — each name is registered
 * at most once, tracked in `registeredToolNames` — so tab switching (or React
 * StrictMode's double-mount in dev) can never produce "Duplicate tool name".
 */

import { incidentStore } from './incidentStore'
import { telemetry } from './telemetry'
import { getFirTools, getChallanTools, getDispatchTools, type ToolDefinition } from './toolRegistry'

const registeredToolNames = new Set<string>()

function timedTool(tool: ToolDefinition): ToolDefinition {
  return {
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
}

/**
 * Claim-and-register. The name is added to the set *before* `registerTool`
 * resolves so that a concurrent call (React StrictMode remount, tab switch)
 * skips it instead of racing back into a "Duplicate tool name" rejection.
 * On failure the claim is released so a later call can retry.
 */
async function registerToolOnce(mc: { registerTool(tool: ToolDefinition): Promise<unknown> }, tool: ToolDefinition) {
  if (registeredToolNames.has(tool.name)) return
  registeredToolNames.add(tool.name)
  try {
    await mc.registerTool(timedTool(tool))
  } catch (err) {
    registeredToolNames.delete(tool.name)
    console.warn(`[webmcp] failed to register ${tool.name}`, err)
  }
}

/**
 * Register a set of tools, skipping any name already registered or claimed.
 * WebMCP has no unregister, so a name is registered at most once per page
 * load; calling `registerTools` repeatedly (tab switch, StrictMode remount)
 * is a safe no-op.
 */
export async function registerTools(module: 'fir' | 'challan' | 'dispatch') {
  const mc = (document as unknown as { modelContext?: any }).modelContext
  if (!mc || typeof mc.registerTool !== 'function') return

  const tools = getToolsForModule(module)
  telemetry.beginRegistration(tools.length)
  await Promise.all(tools.map((t) => registerToolOnce(mc, t)))
  telemetry.endRegistration()
}

/** Register every module's tools; duplicate-safe (used by the metrics tab). */
export async function registerAllTools() {
  const mc = (document as unknown as { modelContext?: any }).modelContext
  if (!mc || typeof mc.registerTool !== 'function') return

  const tools = ['fir', 'challan', 'dispatch'].flatMap((m) => getToolsForModule(m as 'fir' | 'challan' | 'dispatch'))
  telemetry.beginRegistration(tools.length)
  await Promise.all(tools.map((t) => registerToolOnce(mc, t)))
  telemetry.endRegistration()
}

/** Test seam: forget every registered name so the next call re-registers. */
export function resetRegisteredTools() {
  registeredToolNames.clear()
}

function getToolsForModule(module: 'fir' | 'challan' | 'dispatch'): ToolDefinition[] {
  switch (module) {
    case 'fir':
      return getFirTools(incidentStore)
    case 'challan':
      return getChallanTools(incidentStore)
    case 'dispatch':
      return getDispatchTools(incidentStore)
  }
}
