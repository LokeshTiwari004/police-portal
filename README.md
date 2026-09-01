# Digital Police Portal — WebMCP

WebMCP-enabled FIR copilot for Indian police. An in-browser agent and an officer
work on the **same live form**: the agent fills fields, reveals conditional
sections, flags gaps, and validates before submit; the officer keeps control.

Built for the **OpenAI WebMCP Challenge** (Sep 2026).

## Why WebMCP

FIR filing (CCTNS F13) is schema-driven, high-stakes paperwork. WebMCP tools
expose the exact field structure and validation rules instead of the agent
fumbling through the DOM.

- **Shared validation** — the agent's `fir.validate_form` runs the same logic as
  the on-screen form (parity test pins this), so the agent's view never drifts.
- **Conditional reveal** — setting offence section `379` reveals the property
  section and makes it required, live.
- **Human-in-the-loop** — `fir.flag_missing` surfaces ambiguous fields for the
  officer instead of the agent guessing.
- **Shared state** — one incident record flows FIR → e-Challan → dispatch.

## Modules

| Module | Tools |
|---|---|
| **FIR Copilot** | `fir.identify_required_fields`, `fir.fill_field`, `fir.flag_missing`, `fir.validate_form`, `fir.submit`, `fir.find_similar_cases` |
| **e-Challan** | `challan.lookup_rc`, `challan.auto_calculate_fine`, `challan.submit` |
| **Dispatch (ERSS-112)** | `dispatch.classify_nature`, `dispatch.get_available_units`, `dispatch.assign_unit` |
| **Metrics** | live call counts, per-tool latency, registration time |

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

## Demo WebMCP in the browser

1. Open the live URL (or localhost) in **Chrome 149+** (or the ChatGPT desktop
   in-app browser).
2. `chrome://flags/#enable-webmcp-testing` → Relaunch.
3. DevTools → **Application → WebMCP** — all 12 tools appear under
   "Available Tools" on first load (they register on mount, not per tab).
4. Drive them with a real agent: install the
   [Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd)
   extension and prompt it in natural language (sends to
   `gemini-3-flash-preview`). It discovers and calls the tools — the Metrics tab
   counts the calls.
5. Or call a tool from the console:

```js
const tools = await document.modelContext.getTools();
// Chrome 151: pass input as a JSON *string* (object form not shipped yet —
// webmachinelearning/webmcp#243). Result is { content: [{ type, text }] }.
await document.modelContext.executeTool(
  tools.find(t => t.name === 'fir.fill_field'),
  JSON.stringify({ field: 'complainant.name', value: 'Alice' })
);
```

> Built-in **Gemini auto-browse does not call WebMCP tools** — it drives the DOM
> and is separate from WebMCP. To demo an agent using your tools, use the Tool
> Inspector extension or the ChatGPT in-app browser.

### External agent (MCP bridge)

The same 12 tools are exposed over the Model Context Protocol so any external
agent — Claude Desktop, VS Code, an MCP client — can drive the portal
independent of the browser. Tool logic is shared (`src/lib/toolRegistry.ts`);
the browser adapts it to WebMCP, the bridge adapts it to MCP.

```bash
npm run mcp   # stdio MCP server on port; point an MCP client at it
```

Registration via `document.modelContext.registerTool` (`src/lib/webmcpTools.ts`)
is **idempotent**: WebMCP has no unregister API, so each name is registered at
most once per page load; tab switches and StrictMode remounts never error.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) + build |
| `npm run lint` | Oxlint |
| `npm test` | Vitest suite (unit, component, integration, system, parity) |
| `npm run mcp` | External-agent MCP bridge (stdio) |

## Docs

- `docs/TESTING.md` — system-test runbook.
- `docs/EVAL.md` — evaluation mapped to the hackathon rubric.
- `docs/TODO.md` — build checklist.

## Stack

React 19 · Vite · TypeScript · Tailwind v4 · Zustand · Vitest · Oxlint

## License

[MIT](LICENSE)
