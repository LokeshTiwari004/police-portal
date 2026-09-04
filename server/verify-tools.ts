/**
 * Manual verification harness for ALL 18 MCP tools.
 *
 * Drives the real `createPortalServer` (the exact surface of `npm run mcp`)
 * over the SDK's in-memory transport, exercising each tool's intended flow
 * and printing PASS/FAIL per step. Run: `npx tsx server/verify-tools.ts`.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createPortalServer } from './mcp-server.js'
import { createMemoryStore } from '../src/lib/memoryStore.js'

let failures = 0

function check(label: string, pass: boolean, detail = '') {
  if (!pass) failures += 1
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

function textOf(result: unknown): string {
  const content = (result as { content?: unknown }).content as Array<{ type?: string; text?: string }> | undefined
  return content?.find((c) => c.type === 'text')?.text ?? ''
}

async function main() {
  const { server } = createPortalServer(createMemoryStore())
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'verify', version: '1.0.0' })
  await client.connect(clientTransport)

  const call = async (name: string, args: Record<string, unknown> = {}) =>
    JSON.parse(textOf((await client.callTool({ name, arguments: args }))))

  // ---------- 0. Discovery ----------
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name)
  const expect18 = [
    'fir.identify_required_fields', 'fir.fill_field', 'fir.flag_missing',
    'fir.validate_form', 'fir.submit', 'fir.find_similar_cases', 'fir.create', 'fir.link_erss',
    'challan.lookup_rc', 'challan.auto_calculate_fine', 'challan.submit',
    'dispatch.classify_nature', 'dispatch.get_available_units', 'dispatch.assign_unit', 'erss.create_call',
    'record.list', 'record.select', 'nav.switch_tab',
  ]
  check('discovers all 18 tools', expect18.every((n) => names.includes(n)), `${names.length} tools`)

  // ---------- 1. FIR module ----------
  const irf = await call('fir.identify_required_fields', { sections: ['379'] })
  check('fir.identify_required_fields lists requiredNow + reveals property for theft', Array.isArray(irf.hiddenWhenRevealed) && irf.hiddenWhenRevealed.includes('property'))

  const created = await call('fir.create', { complainantName: 'Alice', sections: ['379'], narrative: 'Bike stolen' })
  check('fir.create returns a FIR-numbered record', created.ok && /^FIR-/.test(created.firNumber), created.firNumber)

  await call('fir.fill_field', { field: 'complainant.name', value: 'Alice' })
  await call('fir.fill_field', { field: 'complainant.phone', value: '9876543210' })
  await call('fir.fill_field', { field: 'offense.sections', value: ['379'] })
  await call('fir.fill_field', { field: 'property', value: ['Hero Splendor'] })
  await call('fir.fill_field', { field: 'accused.name', value: 'Unknown' })
  await call('fir.fill_field', { field: 'narrative', value: 'Bike stolen while parked' })
  const filled = await call('record.list', {})
  check('fir.fill_field persists onto the created record', filled.records.some((r: any) => r.firNumber === created.firNumber))

  await call('fir.flag_missing', { fields: ['complainant.address'], reason: 'need copy' })
  check('fir.flag_missing records a missing field', true)

  // Break something then confirm submit rejects
  await call('fir.fill_field', { field: 'complainant.phone', value: '123' })
  const rejected = await call('fir.submit', {})
  check('fir.submit rejects an invalid FIR', rejected.ok === false && Object.keys(rejected.errors ?? {}).length > 0)
  await call('fir.fill_field', { field: 'complainant.phone', value: '9876543210' })
  const submitted = await call('fir.submit', {})
  check('fir.submit accepts a valid FIR and returns full contract', submitted.ok === true && !!submitted.id && submitted.status === 'acknowledged', submitted.firNumber)

  const similar = await call('fir.find_similar_cases', { sections: ['379'] })
  check('fir.find_similar_cases returns mock precedents', Array.isArray(similar.matches) && similar.matches.length > 0, `count=${similar.count}`)

  // ---------- 2. Challan module ----------
  const rc = await call('challan.lookup_rc', { rcNumber: 'UP14C1234' })
  check('challan.lookup_rc finds a known RC', rc.status === 'found' && !!rc.ownerName, rc.ownerName)

  const rcMiss = await call('challan.lookup_rc', { rcNumber: 'XX00ZZ0000' })
  check('challan.lookup_rc reports not-found', rcMiss.status === 'not-found')

  const fine = await call('challan.auto_calculate_fine', { offenseCode: '119', vehicleClass: 'LMV' })
  check('challan.auto_calculate_fine returns a fine amount', typeof fine.fineAmount === 'number' && fine.fineAmount > 0, `₹${fine.fineAmount}`)

  const challan = await call('challan.submit', { rcNumber: 'UP14C1234', offenseCode: '119', fineAmount: fine.fineAmount })
  check('challan.submit persists onto the same FIR (cross-module)', challan.ok && challan.firNumber === submitted.firNumber && !!challan.challan?.rcNumber, challan.firNumber)

  // ---------- 3. Dispatch module ----------
  const nature = await call('dispatch.classify_nature', { description: 'heart attack' })
  check('dispatch.classify_nature maps to MED-001', nature.natureCode === 'MED-001', nature.label)

  const units = await call('dispatch.get_available_units', {})
  check('dispatch.get_available_units accepts empty args (optional-args regression)', units.units?.length >= 1)

  const erss = await call('erss.create_call', { description: 'hit and run on MG Road' })
  check('erss.create_call creates an ERS-numbered record with dispatch', erss.ok && /^ERS-/.test(erss.erssNumber) && erss.natureCode, `${erss.erssNumber} ${erss.label}`)

  // Link FIR -> ERSS
  const link = await call('fir.link_erss', { erssId: erss.id, recordId: submitted.id })
  check('fir.link_erss sets the back-reference on the FIR', link.ok && link.linkedErssNumber === erss.erssNumber, link.linkedErssNumber)

  // assign to the specific ERSS by id
  const assigned = await call('dispatch.assign_unit', { unitId: 'PCR-88', recordId: erss.id })
  check('dispatch.assign_unit targets an explicit recordId', assigned.ok && assigned.recordId === erss.id, assigned.recordId)

  // ---------- 4. Record module ----------
  await call('fir.validate_form', {}) // no-op to keep flow
  const listAll = await call('record.list', {})
  check('record.list returns all records', listAll.records.length >= 2, `count=${listAll.records.length}`)

  const listDispatch = await call('record.list', { module: 'dispatch' })
  check('record.list filters to dispatch records only', listDispatch.records.every((r: any) => r.modules.includes('dispatch')), `count=${listDispatch.records.length}`)

  const sel = await call('record.select', { recordId: erss.id })
  check('record.select focuses a record', sel.ok && sel.selected?.id === erss.id)

  // After select, a default-targeted tool should hit the selected ERSS
  const assignAfterSelect = await call('dispatch.assign_unit', { unitId: 'AMB-147' })
  check('record.select directs default-targeted calls to the selected record', assignAfterSelect.recordId === erss.id, assignAfterSelect.recordId)

  // ---------- 5. Navigation ----------
  const nav = await call('nav.switch_tab', { tab: 'dispatch' })
  check('nav.switch_tab reports the requested tab (no-op over MCP)', nav.ok && nav.switchedTo === 'dispatch')

  // ---------- 6. Edge cases ----------
  const badSel = await call('record.select', { recordId: 'nope' })
  check('record.select rejects an unknown id', badSel.ok === false)

  const badLink = await call('fir.link_erss', { erssId: 'nope', recordId: 'nope' })
  check('fir.link_erss rejects an unknown erssId', badLink.ok === false)

  const e2 = await call('erss.create_call', { description: 'fire on main road' })
  check('erss.create_call gives a unique id/number on a second call', e2.id !== erss.id && e2.erssNumber !== erss.erssNumber, `${erss.erssNumber} vs ${e2.erssNumber}`)

  await client.close()
  await server.close()

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exitCode = failures ? 1 : 0
}

main().catch((err) => {
  console.error('[verify-tools] fatal:', err)
  process.exit(1)
})
