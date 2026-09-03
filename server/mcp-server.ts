/**
 * External-agent MCP bridge.
 *
 * Exposes the same 12 portal tools (FIR / e-Challan / ERSS-112) over the Model
 * Context Protocol so an *external* agent — Claude Desktop, VS Code Copilot,
 * any MCP client — can drive the portal, independent of the in-browser WebMCP
 * integration.
 *
 * The tool definitions live in `src/lib/toolRegistry.ts` and are shared with the
 * browser's WebMCP registration. Here we inject an **in-memory** `Store` (the
 * browser uses the localStorage-backed `incidentStore` instead), so both
 * surfaces expose identical tool behavior.
 *
 * Run: `npm run mcp` (stdio transport) — point an MCP client at it, or pipe
 * JSON-RPC frames on stdio.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import type { Incident } from '../src/lib/incidentStore'
import { getFirTools, getChallanTools, getDispatchTools, getNavTools, type Store, type ToolDefinition } from '../src/lib/toolRegistry'
import { createMemoryStore } from '../src/lib/memoryStore'

/** Convert our JSON-schema `inputSchema` into a zod schema the MCP SDK requires. */
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  if (!schema || schema.type !== 'object') return z.any()

  const props = (schema.properties ?? {}) as Record<string, { type?: unknown; description?: string; items?: { type?: string } }>
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, prop] of Object.entries(props)) {
    let zodType: z.ZodTypeAny
    const t = prop.type
    if (t === 'string') zodType = z.string()
    else if (t === 'number') zodType = z.number()
    else if (t === 'boolean') zodType = z.boolean()
    else if (Array.isArray(t)) zodType = z.union(t.map(mapJsonScalar))
    else if (t === 'array') {
      const itemType = prop.items?.type === 'number' ? z.number() : z.string()
      zodType = z.array(itemType)
    } else zodType = z.any()

    if (prop.description) zodType = zodType.describe(prop.description)
    shape[key] = zodType
  }

  const required = (schema.required ?? []) as string[]
  const partial = z.object(shape).partial()
  if (!required.length) return partial
  const mask = Object.fromEntries(required.map((k) => [k, true])) as Record<string, true>
  return partial.required(mask)
}

function mapJsonScalar(type: unknown): z.ZodTypeAny {
  if (type === 'string') return z.string()
  if (type === 'number') return z.number()
  if (type === 'boolean') return z.boolean()
  if (type === 'array') return z.array(z.any())
  return z.any()
}

function registerToolOnServer(server: McpServer, tool: ToolDefinition) {
  server.registerTool(tool.name, {
    title: tool.title,
    description: tool.description,
    inputSchema: jsonSchemaToZod(tool.inputSchema),
    ...(tool.annotations ? { annotations: { readOnlyHint: tool.annotations.readOnlyHint } } : {}),
  }, async (args) => {
    const result = await tool.execute((args ?? {}) as Record<string, unknown>)
    return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) }] }
  })
}

/** Build an MCP server with all 12 portal tools registered against a fresh in-memory store. */
export function createPortalServer(store: Store<Incident> = createMemoryStore()): { server: McpServer; store: Store<Incident> } {
  const server = new McpServer({ name: 'police-portal', version: '1.0.0' })
  getFirTools(store).concat(getChallanTools(store), getDispatchTools(store), getNavTools()).forEach((t) => registerToolOnServer(server, t))
  return { server, store }
}

export { createMemoryStore }

async function main() {
  const { server } = createPortalServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

const isMain =
  process.argv[1].endsWith('mcp-server.ts') ||
  (process.argv[1] != null && /mcp-server(\.js)?$/.test(process.argv[1]))

if (isMain) {
  main().catch((err) => {
    console.error('[mcp-server] fatal:', err)
    process.exit(1)
  })
}
