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
  const allTools = [
    'fir.identify_required_fields', 'fir.fill_field', 'fir.flag_missing',
    'fir.validate_form', 'fir.submit', 'fir.find_similar_cases', 'fir.create', 'fir.link_erss',
    'challan.lookup_rc', 'challan.auto_calculate_fine', 'challan.submit',
    'dispatch.classify_nature', 'dispatch.get_available_units', 'dispatch.assign_unit', 'erss.create_call',
    'record.list', 'record.select',
    'nav.switch_tab',
  ]
  rows.push({
    metric: 'Tool discovery (8/3/4/2/1)',
    target: '18 tools listed',
    actual: `${names.length} tools`,
    pass: allTools.every((n) => names.includes(n)),
  })

  // 2. No duplicate tools
  rows.push({
    metric: 'No duplicate tools',
    target: '0 duplicates',
    actual: `${names.length - new Set(names).size} duplicates`,
    pass: new Set(names).size === names.length,
  })

  // 3. E2E fill -> validate -> submit (valid, full form incl. conditional section)
  await call('fir.fill_field', { field: 'complainant.name', value: 'Alice' })
  await call('fir.fill_field', { field: 'complainant.phone', value: '9876543210' })
  await call('fir.fill_field', { field: 'narrative', value: 'Bike stolen while parked at market' })
  await call('fir.fill_field', { field: 'offense.sections', value: ['379'] })
  await call('fir.fill_field', { field: 'property', value: ['Hero Splendor (black)'] })
  await call('fir.fill_field', { field: 'accused.name', value: 'Unknown' })
  const valid = await parsed('fir.validate_form', {})
  const submit = await parsed('fir.submit', {})
  rows.push({
    metric: 'E2E fill->validate->submit',
    target: 'valid === true, submit ok + full contract (id/status)',
    actual: `valid=${valid.valid}, submit=${submit.ok}, id=${!!submit.id}, status=${submit.status}`,
    pass: valid.valid === true && submit.ok === true && !!submit.id && !!submit.status,
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
  rows.push({
    metric: 'Robustness: missing required fields rejected',
    target: 'validate false + submit rejected with errors',
    actual: `valid=${invalid.valid}, errorKeys=${Object.keys(invalid.errors ?? {}).length}, submitOk=${roSubmit.ok}`,
    pass: invalid.valid === false && Object.keys(invalid.errors ?? {}).length > 0 && roSubmit.ok === false,
  })

  // 4b. Format parity: bad phone + bad email must surface as errors (live-portal FAIL fix)
  const ro2 = await newClient()
  const ro2Call = async (name: string, args: Record<string, unknown>) => {
    const res = await ro2.client.callTool({ name, arguments: args })
    return textOf(res)
  }
  const ro2Parsed = async (name: string, args: Record<string, unknown>) => JSON.parse((await ro2Call(name, args)) as string)
  await ro2Call('fir.fill_field', { field: 'complainant.name', value: 'Carol' })
  await ro2Call('fir.fill_field', { field: 'complainant.phone', value: '123' })
  await ro2Call('fir.fill_field', { field: 'complainant.email', value: 'not-an-email' })
  const fmt = await ro2Parsed('fir.validate_form', {})
  await ro2.close()
  rows.push({
    metric: 'Format parity (phone/email)',
    target: 'invalid phone 123 + email not-an-email both reported',
    actual: `phoneErr=${!!fmt.errors?.['complainant.phone']}, emailErr=${!!fmt.errors?.['complainant.email']}`,
    pass: !!fmt.errors?.['complainant.phone'] && !!fmt.errors?.['complainant.email'],
  })

  // 5. Conditional reveal on offense section (property required)
  const reveal = await parsed('fir.identify_required_fields', { sections: ['379'] })
  rows.push({
    metric: 'Conditional reveal (theft -> property)',
    target: 'property in hiddenWhenRevealed',
    actual: `hidden=[${(reveal.hiddenWhenRevealed ?? []).join(',')}]`,
    pass: Array.isArray(reveal.hiddenWhenRevealed) && reveal.hiddenWhenRevealed.includes('property'),
  })

  // 6. Cross-module continuity: challan persisted onto the SAME FIR
  const challan = await parsed('challan.submit', {
    rcNumber: 'UP14C1234',
    offenseCode: '119',
    fineAmount: 500,
  })
  rows.push({
    metric: 'Challan linked to FIR',
    target: 'challan.submit returns same firNumber + persisted challan',
    actual: `firNumber=${challan.firNumber} (expected ${submit.firNumber}), challan=${!!challan.challan?.rcNumber}`,
    pass: challan.ok === true && challan.firNumber === submit.firNumber && !!challan.challan?.rcNumber,
  })

  // 7. Cross-module state continuity (same record through dispatch)
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

  // 8. Record graph: create ERSS -> list -> link FIR back to ERSS
  const erss = await parsed('erss.create_call', { description: 'hit and run on MG Road, pedestrian injured' })
  const listed = await parsed('record.list', { module: 'dispatch' })
  const erssRec = listed.records.find((r: { id: string }) => r.id === erss.id)
  const link = await parsed('fir.link_erss', { erssId: erss.id, recordId: submit.id })
  const relist = await parsed('record.list', {})
  const linkedBearer = relist.records.find((r: { id: string }) => r.id === submit.id)
  rows.push({
    metric: 'ERSS -> FIR linking (created + discoverable + linked)',
    target: 'erss record exists, link ok, linkedErssNumber === erssNumber',
    actual: `erssId=${!!erss.id}, erssNumber=${erss.erssNumber}, listed=${!!erssRec}, link=${link.ok}, linked=${link.linkedErssNumber === erss.erssNumber}, firListed=${!!linkedBearer}`,
    pass:
      !!erss.id && !!erssRec && link.ok === true &&
      link.linkedErssNumber === erss.erssNumber && !!linkedBearer,
  })

  // 9. record.select drives later tool calls on a targeted record
  const sel = await parsed('record.select', { recordId: erss.id })
  const assignErss = await parsed('dispatch.assign_unit', { unitId: 'PCR-88' })
  rows.push({
    metric: 'record.select targets the selected record',
    target: 'select ok; dispatch.assign_unit now hits the ERSS call',
    actual: `select=${sel.ok}, selected=${sel.selected?.id === erss.id}, assignedErss=${assignErss.recordId === erss.id}`,
    pass: sel.ok === true && sel.selected?.id === erss.id && assignErss.recordId === erss.id,
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
    '> Deterministic (no LLM, no browser). Covers the automation-drivable',
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
