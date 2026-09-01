/**
 * Automated MCP evaluation harness.
 *
 * Drives the external-agent MCP server through the hackathon eval scenarios
 * deterministically — no LLM, no browser needed. It uses a real MCP Client over
 * the SDK's in-memory transport against `createPortalServer()`, which is the
 * same server surface an external agent (Claude Desktop / VS Code / any MCP
 * client) talks to via `npm run mcp`.
 *
 * Output: prints a target/actual/PASS or FAIL table and writes it to
 * `docs/EVAL_RESULTS.md`.
 *
 * Run: `npx tsx server/eval-scenarios.ts`
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { writeFileSync } from 'node:fs'
import { createPortalServer } from './mcp-server.js'
import { createMemoryStore } from '../src/lib/memoryStore.js'

interface Row {
  metric: string
  target: string
  actual: string
  pass: boolean
}

function textOf(result: unknown): string {
  const content = (result as { content?: unknown }).content as Array<{ type?: string; text?: string }> | undefined
  const item = content?.find((c) => c.type === 'text')
  return item?.text ?? ''
}

/** Spin up a fresh portal server + connected MCP client (isolated store per session). */
async function newClient() {
  const { server } = createPortalServer(createMemoryStore())
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'eval-harness', version: '1.0.0' })
  await client.connect(clientTransport)
  return { client, close: async () => { await client.close(); await server.close() } }
}

async function main() {
  const { client, close } = await newClient()
  const timings: Record<string, number> = {}

  const call = async (name: string, args: Record<string, unknown>) => {
    const t0 = performance.now()
    let res
    try {
      res = await client.callTool({ name, arguments: args })
    } catch (e) {
      throw new Error(`callTool(${name}) threw: ${(e as Error).message}`)
    }
    timings[name] = performance.now() - t0
    return textOf(res)
  }
  const rows: Row[] = []

  const parsed = async (name: string, args: Record<string, unknown>) =>
    JSON.parse((await call(name, args)) as string)

  // 1. Tool discovery completeness
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name)
  const all12 = [
    'fir.identify_required_fields', 'fir.fill_field', 'fir.flag_missing',
    'fir.validate_form', 'fir.submit', 'fir.find_similar_cases',
    'challan.lookup_rc', 'challan.auto_calculate_fine', 'challan.submit',
    'dispatch.classify_nature', 'dispatch.get_available_units', 'dispatch.assign_unit',
  ]
  rows.push({
    metric: 'Tool discovery (6/3/3)',
    target: '12 tools listed',
    actual: `${names.length} tools`,
    pass: all12.every((n) => names.includes(n)),
  })

  // 2. No duplicate tools
  rows.push({
    metric: 'No duplicate tools',
    target: '0 duplicates',
    actual: `${names.length - new Set(names).size} duplicates`,
    pass: new Set(names).size === names.length,
  })

  // 3. E2E fill -> validate -> submit (valid)
  await call('fir.fill_field', { field: 'complainant.name', value: 'Alice' })
  await call('fir.fill_field', { field: 'complainant.phone', value: '9876543210' })
  await call('fir.fill_field', { field: 'narrative', value: 'Bike stolen while parked at market' })
  const valid = await parsed('fir.validate_form', {})
  const submit = await parsed('fir.submit', {})
  rows.push({
    metric: 'E2E fill->validate->submit',
    target: 'valid === true, submit ok',
    actual: `valid=${valid.valid}, submit=${submit.ok}`,
    pass: valid.valid === true && submit.ok === true,
  })

  // 4. Robustness: new incomplete form is rejected (fresh isolated session so the
  //    E2E scenario's completed incident doesn't leak into this check)
  const ro = await newClient()
  const roCall = async (name: string, args: Record<string, unknown>) => {
    const res = await ro.client.callTool({ name, arguments: args })
    return textOf(res)
  }
  const roParsed = async (name: string, args: Record<string, unknown>) => JSON.parse((await roCall(name, args)) as string)
  await roCall('fir.fill_field', { field: 'complainant.name', value: 'Bob' })
  const invalid = await roParsed('fir.validate_form', {})
  const roSubmit = await roParsed('fir.submit', {})
  await ro.close()
  rows.push({
    metric: 'Robustness: invalid form rejected',
    target: 'validate false + submit rejected with errors',
    actual: `valid=${invalid.valid}, errorKeys=${Object.keys(invalid.errors ?? {}).length}, submitOk=${roSubmit.ok}`,
    pass: invalid.valid === false && Object.keys(invalid.errors ?? {}).length > 0 && roSubmit.ok === false,
  })

  // 5. Conditional reveal on offense section (property required)
  const reveal = await parsed('fir.identify_required_fields', { sections: ['379'] })
  rows.push({
    metric: 'Conditional reveal (theft -> property)',
    target: 'property in hiddenWhenRevealed',
    actual: `hidden=[${(reveal.hiddenWhenRevealed ?? []).join(',')}]`,
    pass: Array.isArray(reveal.hiddenWhenRevealed) && reveal.hiddenWhenRevealed.includes('property'),
  })

  // 6. Cross-module state continuity (same record through dispatch)
  await call('dispatch.classify_nature', { description: 'car collision on the road' })
  const units = await parsed('dispatch.get_available_units', {})
  const unitId = units.units?.[0]?.id
  const assign = await parsed('dispatch.assign_unit', { unitId })
  rows.push({
    metric: 'Cross-module flow (dispatch assigned)',
    target: 'unit assigned',
    actual: `units=${units.units?.length ?? 0}, assignedUnit=${unitId}`,
    pass: assign.ok === true && !!unitId,
  })

  // 7. Tool latency (avg over calls so far)
  const avgMs = Object.values(timings).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(timings).length)
  rows.push({
    metric: 'Per-tool latency (avg)',
    target: 'low (in-process)',
    actual: `${avgMs.toFixed(1)}ms`,
    pass: avgMs < 100,
  })

  await close()

  const passCount = rows.filter((r) => r.pass).length
  const out = [
    '# EVAL RESULTS — external-agent MCP harness',
    '',
    `Run: ${new Date().toISOString()}`,
    `Surface: real MCP Client <-> createPortalServer (same server as \`npm run mcp\`)`,
    `Result: **${passCount}/${rows.length} PASS**${passCount === rows.length ? ' — all green' : ''}`,
    '',
    '| Metric | Target | Actual | Result |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.metric} | ${r.target} | ${r.actual} | ${r.pass ? 'PASS' : 'FAIL'} |`),
    '',
    '> Deterministic (no LLM/LLM thought, no browser). Covers the automation-drivable',
    '> subset of the hackathon eval metrics over the MCP surface. The live-browser',
    '> WebMCP surface (UI reflection, metrics tab, dual editing) is covered separately',
    '> by the live-portal driver prompt in `docs/LIVE_PORTAL_EVAL.md`.',
    '',
  ].join('\n')

  writeFileSync(new URL('../docs/EVAL_RESULTS.md', import.meta.url), out)
  console.log(out)
  process.exitCode = passCount === rows.length ? 0 : 1
}

main().catch((err) => {
  console.error('[eval-scenarios] fatal:', err)
  process.exit(1)
})
