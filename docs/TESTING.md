# System Testing Runbook — WebMCP Police Portal

How to implement each system-test metric tracked in `docs/TODO.md`
(see the *System Testing & Evaluation Metrics (Hackathon)* section).
These are the hackathon-judged artifacts — every metric maps to a runnable test
and, where relevant, to a demo step.

Run any single file:

```bash
npx vitest run src/test/webmcp.integration.test.ts
npx vitest run -t "parity"
```

> JSdom lacks `document.modelContext`. Every WebMCP-integration test mocks it
> with the `mockModelContext()` helper below (mirrors `src/test/webmcp.integration.test.ts`).
> Tests share jsdom's persisted `localStorage` — clear the store in `beforeEach`.

---

## 0. The mock seam (copy this)

```ts
// src/test/modelContextMock.ts — shared helper (extract once)
export function mockModelContext() {
  const registered: Array<{ name: string; execute: (i: unknown, o?: { signal?: AbortSignal }) => unknown }> = []
  const mc = {
    registered,
    async registerTool(tool: unknown) { registered.push(tool as (typeof registered)[number]) },
    async getTools() { return registered },
  }
  ;(document as unknown as { modelContext?: typeof mc }).modelContext = mc
  return mc
}

export function clearStore() {
  localStorage.removeItem('police-portal:incidents')
}
```

---

## 1. Full end-to-end agent flow (correctness)

**Goal**: agent fills FIR → validates → submits → UI/store reflect it, in one pass.

**File**: `src/test/webmcp.integration.test.ts` (already has this — extend to assert `status`).

```ts
beforeEach(clearStore)

it('fill → validate → submit persists a complete FIR', async () => {
  const mc = mockModelContext()
  await registerTools('fir')
  const tools = Object.fromEntries(mc.registered.map((t) => [t.name, t]))

  await tools['fir/fill_field'].execute({ field: 'complainant.name', value: 'Alice' })
  await tools['fir/fill_field'].execute({ field: 'complainant.phone', value: '9876543210' })
  await tools['fir/fill_field'].execute({ field: 'offense.sections', value: ['379'] })
  await tools['fir/fill_field'].execute({ field: 'narrative', value: 'Bike stolen' })

  const v = JSON.parse((await tools['fir/validate_form'].execute({})) as string)
  expect(v.valid).toBe(true)

  const s = JSON.parse((await tools['fir/submit'].execute({})) as string)
  expect(s.ok).toBe(true)

  const stored = incidentStore.list()[0]
  expect(stored.status).toBe('acknowledged')
  expect(stored.narrative).toBe('Bike stolen')
})
```

**Demo**: screencast this flow against the live app.

---

## 2. Validation parity (correctness)

**Goal**: `fir/validate_form` returns the same error set the FIRForm UI shows for
the same state — the shared `validation.ts` must not drift.

**Why**: the bug fix in this repo was a parity break — UI required `narrative`,
the tool didn't. This locks agreement.

**File**: `src/test/parity.test.ts`

```ts
import { render, screen } from '@testing-library/react'
import { validateForm } from '../lib/validation'
import FIRForm from '../components/FIRForm'
import { mockModelContext, clearStore } from './modelContextMock'
import { incidentStore } from '../lib/incidentStore'

beforeEach(clearStore)

it('tool and FIRE form agree that empty narrative is invalid', () => {
  const inc = incidentStore.create()
  incidentStore.update(inc.id, {
    complainant: { name: 'Alice', phone: '9876543210' },
    narrative: '',
  })

  // Tool path
  const { valid } = validateForm({
    'complainant.name': 'Alice',
    'complainant.phone': '9876543210',
    narrative: '',
  })
  expect(valid).toBe(false)

  // UI path — render the form and confirm the narrative error is on screen
  render(<FIRForm />)
  expect(screen.getByText(/narrative.*required/i)).toBeInTheDocument()
})
```

> If the UI shows an error the tool doesn't (or vice-versa), the shared
> validation/schema wiring is diverging — that's a parity regression.

---

## 3. Round-trip / edge cases (robustness)

**Goal**: N mocked clean/edge cases all pass (target 100%).

**File**: `src/test/parity.test.ts` or `src/lib/validation.test.ts`.

Cover at minimum:

| Case | Expect |
|---|---|
| valid form | `valid: true`, empty errors |
| missing required (`complainant.name`) | `/required/` |
| invalid phone `12345` | `/10-digit/` |
| invalid email `bad` | `/valid email/` |
| wrong date `15/01/2025` | `/YYYY-MM-DD/` |
| `requiredWhen` triggered | field required only when condition holds |
| empty `narrative` | `/required/` (regression for the typo fix) |
| no incident present | tools no-op / report gracefully |

```ts
it('edge: wrong date format errors', () => {
  expect(validateField('date', '15/01/2025')).toMatch(/YYYY-MM-DD/)
})
```

---

## 4. Graceful degradation (robustness)

**Goal**: no `document.modelContext` → app shows the "WebMCP tools pending" hint,
must not crash.

**Covered by** `src/App.test.tsx` (renders shell + pending hint when modelContext
is absent). Keep it green — it guards the no-modelContext path.

---

## 5. Tool discovery completeness (agent collaboration)

**Goal**: all `fir/*` (6), `challan/*` (3), `dispatch/*` (3) register on the
corresponding tab switch.

**File**: `src/test/webmcp.integration.test.ts`

```ts
const expected = {
  fir: ['fir/identify_required_fields', 'fir/fill_field', 'fir/flag_missing',
        'fir/validate_form', 'fir/submit', 'fir/find_similar_cases'],
  challan: ['challan/lookup_rc', 'challan/auto_calculate_fine', 'challan/submit'],
  dispatch: ['dispatch/classify_nature', 'dispatch/get_available_units', 'dispatch/assign_unit'],
}

for (const [module, names] of Object.entries(expected)) {
  it(`registers ${module}/* tools`, async () => {
    const mc = mockModelContext()
    await registerTools(module as 'fir' | 'challan' | 'dispatch')
    expect(mc.registered.map((t) => t.name).sort()).toEqual([...names].sort())
  })
}
```

---

## 6. Cross-module / state continuity (agent collaboration)

**Goal**: one incident record spans FIR → challan → dispatch; edits on one tab
are visible on every other tab (shared `incidentStore`).

**File**: `src/test/crossModule.test.ts`

```ts
beforeEach(clearStore)

it('dispatch mutates the SAME record the FIR created', async () => {
  const mc = mockModelContext()
  await registerTools('fir')
  const fir = Object.fromEntries(mc.registered.map((t) => [t.name, t]))
  await fir['fir/fill_field'].execute({ field: 'complainant.name', value: 'Alice' })
  const inc = incidentStore.list()[0]          // the shared record
  const id = inc.id

  mockModelContext()                            // switch tab: re-register dispatch
  await registerTools('dispatch')
  const dis = Object.fromEntries(mc.registered.map((t) => [t.name, t]))
  await dis['dispatch/assign_unit'].execute({ unitId: 'PCR-88', incidentId: id })

  const updated = incidentStore.get(id)
  expect(updated?.status).toBe('dispatched')
  expect(updated?.dispatch?.unit?.id).toBe('PCR-88')
})
```

**Also run**: `src/App.test.tsx` tab-switch tests confirm re-registration.

---

## 7. Tab re-registration, no duplicates (performance/UX)

**Goal**: switching tabs unregisters the old module's tools and registers the
new one — no duplicate tool names. Backed by the `AbortController` in
`webmcpTools.ts`.

**File**: `src/test/webmcp.integration.test.ts`

```ts
it('re-registering the same module yields no duplicate tools', async () => {
  const mc = mockModelContext()
  await registerTools('fir')
  await registerTools('fir')
  const names = mc.registered.map((t) => t.name)
  expect(new Set(names).size).toBe(names.length)
})
```

---

## 8. No console errors (performance/UX)

**Goal**: a full agent-driven session logs zero console errors.

**File**: `src/test/noConsoleErrors.test.tsx`

```ts
beforeEach(() => { vi.restoreAllMocks(); mockModelContext(); clearStore() })

it('full session runs without console.error', async () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { unmount } = render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /fir/i }))
  await registerTools('fir')
  unmount()
  expect(err).not.toHaveBeenCalled()
})

afterEach(() => { (console.error as unknown as ReturnType<typeof vi.fn>).mockRestore() })
```

---

## Judges' walkthrough (demo script)

1. Human + agent edit the same live FIR form simultaneously.
2. Agent calls `fir/fill_field` on `offense.sections` → `property` section
   conditionally reveals (schema-driven).
3. Agent calls `fir/flag_missing` → field surfaces for human review.
4. Challan + dispatch consume the same incident (integration story).
5. Show the metrics above on a one-screen scorecard.

Record target/actual/evidence per metric in `docs/EVAL.md`.
