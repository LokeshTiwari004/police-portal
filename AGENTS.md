# AGENTS.md

WebMCP-enabled "Digital Police Portal": React 19 + Vite + TS + Tailwind v4 + Zustand. AI agents collaborate with officers via browser WebMCP tools registered against `document.modelContext`.

## Commands
- `npm run dev` — Vite dev server (localhost:5173)
- `npm run build` — `tsc -b && vite build` (typechecks first; also typechecks test files)
- `npm run lint` — `oxlint` (No ESLint. `.oxlintrc.json` has react/ts/oxc plugins)
- `npm test` — run all tests once (`vitest run`)
- `npm run test:watch` — vitest watch mode
- `npm run test:coverage` — run with v8 coverage report
- `npm run mcp` — run the external-agent MCP bridge (`tsx server/mcp-server.ts`, stdio)
- `npm run eval` — run the MCP eval harness (`tsx server/eval-scenarios.ts`): drives a real MCP Client against `createPortalServer` over the in-memory transport, runs the hackathon eval scenarios, and rewrites `docs/EVAL_RESULTS.md` (currently 9/9 PASS).
- Run ONE test file: `npx vitest run src/lib/validation.test.ts`
- Run tests matching a name: `npx vitest run -t "fill_field"`

## Architecture
- `/src/lib/toolRegistry.ts` — **environment-agnostic tool definitions** for all 13 tools, parameterised over an injected `Store<T>` (a minimal `list`/`create`/`update`/`get` interface). This is the single source of truth shared by the browser and the Node bridge so both surfaces expose identical tool behavior.
- `/src/lib/webmcpTools.ts` — thin **browser adapter**: injects the localStorage-backed `incidentStore` into `toolRegistry.ts` and registers the tools against `document.modelContext`. Tool names may contain only `[A-Za-z0-9_.-]` — WebMCP rejects `/` with `InvalidStateError: Invalid tool name` (see the slash-rename fix history). Names are module-prefixed with `.` (`fir.fill_field`, `challan.lookup_rc`, `dispatch.assign_unit`, `nav.switch_tab`). WebMCP has **no unregister API**, so registration is idempotent — names are claimed before `registerTool` resolves and registered at most once (StrictMode remounts / tab switches are no-ops; see the AbortError + Duplicate-tool-name fix history). `App.tsx` registers **all 13 tools on mount** (`registerAllTools()`) so the full surface is available to an agent regardless of the open tab; `resetRegisteredTools()` is a test seam.
- `/server/mcp-server.ts` — **external-agent MCP bridge** over the same `toolRegistry.ts` definitions. `createPortalServer()` builds an `McpServer` with an in-memory store (testable); `main()` runs only when invoked as the entry point. Run via `npm run mcp`; point any MCP client (Claude Desktop / VS Code) at it. Type-checked by `tsconfig.server.json` (bundler resolution, node types) in `tsc -b`.
- `/src/lib/memoryStore.ts` — in-memory `Store<Incident>` for the bridge (no `localStorage`/`document`), mirroring the browser store's generated id/firNumber/createdAt/status.
- `/src/lib/incidentStore.ts` — browser's shared, localStorage-backed store for ALL modules (key `police-portal:incidents`). Reuse it; don't build per-module storage. Incident schema is the shared contract across FIR/challan/dispatch. Note: `create()`'s param type requires `offense`, `accused`, `narrative` even though runtime defaults exist — pass a full object or omit the arg entirely. `seed()` populates a fresh (empty) store with demo records in `SEED_INCIDENTS` (FIR + challan + ERSS); `main.tsx` calls it on startup, so tests (which render `<App />` directly) stay on an empty store.
- `/src/components/RecordBrowser.tsx` — shared filterable record list (text/status/module checkboxes) rendered at the top of FIR, e-Challan, and ERSS-112 tabs; `filterIncidents()` is unit-tested by `src/lib/recordBrowser.test.ts`. Selecting a record drives which incident each module works on (default: most recent). `/src/components/RecordDetail.tsx` renders a single record's full FIR + challan + ERSS detail for the selected record.
- `/src/lib/validation.ts` — validation shared by both UI and tools. `validateIncident(incident, sections)` is the **single parity source**: it computes the exact per-field errors the form shows (visible sections + `required`/`requiredWhen` + `rule`), used by BOTH `FIRForm` and the `fir.*` tools. `formSchema.json` drives conditional visibility/requirements. NOTE: `getChallanTools(store)` now takes a `Store` (signature changed when `challan.submit` became real).
- `/src/data/formSchema.json`, `offenseCodes.json`, `mockIncidents.json`, `mockRC.json`, `mvaFines.json`, `natureCodes.json` — static mock data. `mockIncidents.json` seeds `fir.find_similar_cases` (6 NCRB-style cases); `mockRC.json` seeds `challan.lookup_rc`; `mvaFines.json` drives `challan.auto_calculate_fine`; `natureCodes.json` drives `dispatch.classify_nature`. They are read in `toolRegistry.ts`.
- `/src/components/RecordBrowser.tsx` + `RecordDetail.tsx` (above) ship with the record-filter/individual-record features; `FIRForm.tsx`, `ChallanGenerator.tsx`, `DispatchConsole.tsx` each render a `RecordBrowser` for selecting the active record and a `RecordDetail` read-only view. `App.tsx` polls briefly for `document.modelContext` so tools are exposed even when WebMCP initializes late.

## Testing
- Framework: Vitest 4 (via `vitest.config.ts`), jsdom environment, globals enabled.
- Test files live next to code: `src/**/*.test.ts` / `*.test.tsx` (config include matches this pattern).
- Setup: `src/test/setup.ts` imports `@testing-library/jest-dom/vitest` for DOM matchers (`toBeInTheDocument`, etc.).
- Tools: `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`.
- Existing suites: unit (`src/lib/validation.test.ts`, `src/lib/incidentStore.test.ts`), integration (`src/test/webmcp.integration.test.ts` mock `document.modelContext` to drive `fir.*` tools against the store end-to-end), system (`src/App.test.tsx` renders the app shell + tab switching, and asserts all 12 tools register on mount), bridge (`src/test/mcpBridge.test.ts` drives the shared tool definitions against the in-memory store — the same store/registry the Node MCP server uses), server (`server/mcp-server.test.ts` pins the `jsonSchemaToZod` json-schema→zod conversion, incl. the optional-args regression). Vitest picks up tests in both `src/**` and `server/**`.
- The MCP **eval harness** (`server/eval-scenarios.ts`, `npm run eval`) is a heavier, deterministic round-trip (real MCP Client ↔ `createPortalServer` over in-memory transport) that writes `docs/EVAL_RESULTS.md`; run it when tool behavior or the eval scenarios change, not on every test run.
- `document.modelContext` is absent in jsdom — mock it in integration tests (see `src/test/webmcp.integration.test.ts`); `App.tsx` degrades to a "WebMCP tools pending" hint.
- Clear `localStorage` between tests (storage key `police-portal:incidents`) — tests share jsdom's persisted storage.
- Coverage: v8; current overall ~71% lines. Prefer covering new logic rather than padding challan/dispatch stub paths.

## Code & testing conventions
- When behavior changes, add or update a test and make it pass — don't just delete failing assertions.
- A regression for a bug belongs in the same change as the fix (see the `narrative` bug below — pinned by `validation.test.ts`).
- Run `npm run lint` and `npm test` before declaring a task done; `npm run build` before commit.
- No test framework was configured here until Vitest was added — do not revert to a manual/no-test workflow.

## WebMCP gotchas
- Full WebMCP on localhost requires Chrome flag `chrome://flags/#enable-webmcp-testing`. WebMCP needs an **origin-keyed** agent cluster, so we must NOT send `Origin-Agent-Cluster: ?0` — that header opts out of origin-keying (enables `document.domain`) and throws `SecurityError: document.modelContext cannot be used when document.domain is enabled`. `vite.config.ts` therefore sets no such header; production needs HTTPS (Vercel). See the `?0`-removal fix history for the regression this caused.
- Tool `execute` returns string-ifiable values; inputSchema must be JSON-serializable and the browser stringifies results for the agent.
- `crypto.randomUUID()` (incidentStore) needs a secure context — localhost is fine.

## Known bug
- `validation.ts` `validateForm` checks `field === 'narative'` (typo of `narrative`). Result: `narrative` is always treated as required and the `narrative` rule never applies. Behavior is pinned by tests in `src/lib/validation.test.ts` — fix the typo and update those expectations together.

## Tsconfig quirks
- `erasableSyntaxOnly: true` — no TS enums or namespaces; use union types / const objects (as done in `toolRegistry.ts`).
- `verbatimModuleSyntax: true` — use `import type` for type-only imports.
- `noUnusedLocals` / `noUnusedParameters` are on; `npm run build` fails on unused vars.
- `tsconfig.server.json` (the MCP bridge) uses `moduleResolution: bundler` + `types: ["node"]` so it can import the Vite-style `src/lib/*` files (extensionless, JSON imports) and use `process`. It's a project reference, so `npm run build` type-checks the server too.

## Docs / planning
- `docs/WebMCP_Police_Portal_ImplementationPlan.md` — full feature plan, tool schemas, build order.
- `docs/TODO.md` — live task checklist (tracks what's built vs. pending). Update it as work lands.
- `docs/EVAL.md` — hackathon rubric + evaluation evidence tracking. `docs/EVAL_RESULTS.md` is the auto-generated deterministic MCP-harness scorecard (see `npm run eval`); `docs/LIVE_PORTAL_EVAL.md` is a ready-to-paste driver prompt for a browser agent to capture the browser-only WebMCP evidence.
- `.gitignore` excludes `.conversations/` (session transcripts, not for repo).
- Keep this file current: update AGENTS.md in the same commit as the convention or command it describes.
