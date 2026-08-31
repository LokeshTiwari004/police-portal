# Digital Police Portal — WebMCP

WebMCP-enabled FIR Copilot for Indian police officers. AI agents collaborate with
officers in the **same live form** — an agent fills fields, reveals conditional
sections, flags gaps for human review, and validates before submission, while a
human officer stays in control over each action.

Built for the **OpenAI WebMCP Challenge** (Sep 2026): an app that becomes
meaningfully better when humans and their agents use it together.

## Why this is a strong WebMCP fit

FIR filing (CCTNS F13) is high-stakes, schema-driven paperwork. Without WebMCP an
agent can only fumble through the DOM. With WebMCP, tools expose the exact field
structure and validation rules:

- **Shared validation** — the agent's `validate_form` uses the *same* logic as
  the on-screen form, so the agent's view never drifts from what the officer must
  fill (guarded by a parity test).
- **Conditional reveal** — when the agent sets an offence section (e.g. `379`
  theft), the property section appears and becomes required, in real time.
- **Human-in-the-loop** — `fir.flag_missing` surfaces ambiguous fields for an
  officer to review rather than the agent guessing.
- **Cross-module state** — one incident record flows FIR → e-Challan →
  ERSS-112 dispatch through a shared store.

## Modules

| Module | Workspace | Tools |
|---|---|---|
| **FIR Copilot** (Must-Have) | Schema-driven dynamic form, inline validation, missing-field summary | `fir.identify_required_fields`, `fir.fill_field`, `fir.flag_missing`, `fir.validate_form`, `fir.submit`, `fir.find_similar_cases` |
| **e-Challan** (Should-Have) | RC lookup + MVA fine auto-calc, linked to incident | `challan.lookup_rc`, `challan.auto_calculate_fine`, `challan.submit` |
| **ERSS-112 Dispatch** (Stretch) | Incident queue, nature classification, unit assignment | `dispatch.classify_nature`, `dispatch.get_available_units`, `dispatch.assign_unit` |
| **Metrics** (Eval) | Live scorecard of tool latency, call volume, registration time | — |

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
```

## Testing WebMCP in the browser

1. Open the live URL (or localhost) in **Google Chrome 149+**.
2. Enable the flag: `chrome://flags/#enable-webmcp-testing` → Relaunch.
3. Or use the **ChatGPT desktop app** in-app browser (WebMCP on by default).
4. In DevTools console:

```js
const tools = await document.modelContext.getTools();
// Chrome 151: pass input as a JSON *string* (spec's object form not shipped yet —
// webmachinelearning/webmcp#243). Unwrap the result envelope: { content: [{ type, text }] }.
await document.modelContext.executeTool(tools.find(t => t.name === 'fir.fill_field'), JSON.stringify({ field: 'complainant.name', value: 'Alice' }));
```

Tools are registered via `document.modelContext.registerTool({...})`
(`src/lib/webmcpTools.ts`). WebMCP has no unregister API, so registration is
**idempotent** — each name is registered at most once per page load and calls
(per-tab on mount, React StrictMode remounts) never re-register or error.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) + production build |
| `npm run lint` | Oxlint |
| `npm test` | Vitest suite (unit, component, integration, system, parity) |
| `npm run test:watch` / `test:coverage` | Watch / coverage |

## Testing & Evaluation

- `docs/TESTING.md` — runbook for each system-test metric.
- `docs/EVAL.md` — research-backed evaluation plan mapped to the hackathon rubric.
- `docs/TODO.md` — live build checklist.

## Tech Stack

React 19 · Vite · TypeScript · Tailwind v4 · Zustand · Vitest · Oxlint

## License

[MIT](LICENSE)
