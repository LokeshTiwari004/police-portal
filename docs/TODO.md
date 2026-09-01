# TODO: WebMCP Police Portal

Live: https://police-portal-mu.vercel.app/ · Repo: `github.com/LokeshTiwari004/police-portal`
Status shorthand: `[x]` shipped · `[ ]` open · `[~]` partial

## 🔨 Setup
- [x] Scaffold React + Vite project — React 19 + Vite + TS
- [x] Install TailwindCSS v4 (Vite plugin `@tailwindcss/vite`, no PostCSS config)
- [x] Plugin wired in `vite.config.ts`
- [x] Removed the `Origin-Agent-Cluster: ?0` header — it OPTS OUT of origin-keying and DISABLES WebMCP (correct config: no header, see `vite.config.ts`)
- [x] Verified `npm run build` + `npm run dev`

### Vercel Deployment
- [x] `vercel.json` SPA rewrite → `index.html`
- [x] Project linked + deployed (auto-deploy from `main`)
- [x] Production URL live: `https://police-portal-mu.vercel.app/` (HTTPS, origin-keyed)
- [x] Verify WebMCP on the Vercel URL — live agent run confirmed header "12 WebMCP tools live", exactly 12 distinct tools listed, no duplicates, badge count stable across all tab switches, zero console errors/warnings. (DevTools→Application→WebMCP panel itself was BLOCKED — the in-app browser exposes no DevTools; 12-tool surface verified via the agent's tool fetch.) `docs/LIVE_PORTAL_EVAL.md` Part A
- [~] Drive the tools on prod with the Model Context Tool Inspector extension (Metrics tab counts calls) — Part A–F live run done (11 PASS / 7 FAIL / 1 BLOCKED); all 7 FAILs fixed in this change — re-run to confirm `docs/LIVE_PORTAL_EVAL.md` Part E

## 📄 Must-Have: FIR Copilot

### Data & Schema
- [x] `data/formSchema.json` — conditional logic for FIR form (sections, dependsOn/includeAny)
- [x] `data/offenseCodes.json` — sample IPC/IT/MVA sections
- [x] `data/mockIncidents.json` — 6 NCRB-style seed cases; `fir.find_similar_cases` reads its archive from this file
- [x] `lib/incidentStore.ts` — shared localStorage-backed store + Incident type

### Validation
- [x] `lib/validation.ts` — `validateField` + `validateForm` + `requiredFieldsForSections`
- [x] Fix `validation.ts` `'narative'` typo; `narrative` required (pinned by `validation.test.ts`)
- [x] **Validation parity by construction** — new `validateIncident(incident, sections)` in `validation.ts` mirrors the form's per-field rules (visible sections + `required`/`requiredWhen` + `rule`) and is used by BOTH `FIRForm` and the `fir.*` tools. Live-portal FAIL (tools only checked a 3-field subset; format rules never fired on dotted paths) fixed and pinned by `mcpBridge.test.ts` + eval harness.

### UI
- [x] `App.tsx` — dashboard shell, registers all 12 tools on mount
- [x] `components/FIRForm.tsx` — dynamic form from `formSchema.json`, conditional reveals, inline validation, missing-field summary, `requiredWhen`
- [x] Wire form state → `incidentStore` (nested dotted-path updates)
- [x] `components/FIRForm.test.tsx` (conditional reveals, requiredWhen, summary clearing)

### WebMCP tools (`fir.*`)
- [x] `fir.identify_required_fields` (derives `requiredNow` from schema)
- [x] `fir.fill_field` · `fir.flag_missing` · `fir.find_similar_cases` · `fir.validate_form` · `fir.submit`
- [x] All 12 tools register on mount (full surface on load, not per tab); idempotent registration
- [x] Tool descriptions + `title` polished for agent context (dotted paths ↔ form labels)

## ⚙️ Should-Have: e-Challan

### Data
- [x] `data/mvaFines.json` — fine matrix by offence + vehicle-class multiplier; `challan.auto_calculate_fine` reads it
- [x] `data/mockRC.json` — Vahan-style vehicle records; `challan.lookup_rc` reads it (found / not-found)

### UI + Tools
- [x] `components/ChallanGenerator.tsx` — now reads the same `mockRC.json` / `mvaFines.json` as the tools and subscribes to the store (agent-created challans reflect live)
- [x] Tools: `challan.lookup_rc`, `challan.auto_calculate_fine`, `challan.submit`
- [x] Cross-module challan: `challan.submit` is real — persists the challan onto the active incident's `.challan` and returns its `firNumber` (live-portal FAIL "Challan persisted (stub)" fixed; pinned by `mcpBridge.test.ts` + eval harness)

## 🎯 Stretch Goal: ERSS-112 Dispatch

### Data
- [x] `data/natureCodes.json` — keyword → ERSS-112 nature-code rules; `dispatch.classify_nature` reads it (adds TRF-002 Traffic code)

### UI + Tools
- [x] `components/DispatchConsole.tsx`
- [x] Tools: `dispatch.classify_nature`, `dispatch.get_available_units`, `dispatch.assign_unit`
- [x] Cross-module flow proved by MCP harness: `dispatch.classify_nature` → units → `assign_unit` assigns on the shared-session record (`npm run eval`, `docs/EVAL_RESULTS.md`)

## 🎬 System Testing & Evaluation Metrics (Hackathon)

### Correctness (full-stack WebMCP flow works)
- [x] End-to-end success — fill → validate → submit; covered by `webmcp.integration.test.ts` + `mcpBridge.test.ts` + eval harness (submit returns full contract: id / firNumber / status)
- [x] Validation parity — `fir.validate_form` == FIRForm UI errors by construction (`validateIncident` is the single shared source)
- [ ] Demo artifact: screencast of the live flow

### Robustness
- [~] Round-trip cases — MCP harness + `mcpBridge.test.ts` now cover missing-required reject, invalid phone/email, conditional `requiredWhen`, `submit` refused on invalid; browser-only date/time + no-incident + empty-narrative remain to re-verify via `docs/LIVE_PORTAL_EVAL.md`
- [x] Graceful degradation — no `document.modelContext` → App shows "WebMCP tools pending"

### Agent Collaboration
- [x] Tool discovery completeness — all 12 register on first load (`App.test.tsx` + MCP harness `tools/list`)
- [x] State continuity — shared `incidentStore` across modules; MCP harness links challan + dispatch assignment to the same FIR record (`firNumber` continuity)

### Performance / UX
- [x] No duplicate tools on re-registration (idempotent claim-before-register; MCP harness reports 0 dupes)
- [x] No console errors during a full agent-driven session — live run confirmed 0 errors / 0 warnings (TODO Part A)
- [x] Metrics scorecard — per-module breakdown (FIR / e-Challan / ERSS-112 calls + distinct tools) and live validation-parity stat added (live-portal FAIL "no per-module breakdown / parity section" fixed)

### Judges' walkthrough checklist (demo script)
- [x] Human + agent on same live form (dual editing)
- [x] Conditional field reveal driven by agent (`fir.fill_field` on offense → property section appears)
- [x] `fir.flag_missing` surfaces human-review fields
- [x] Challan + dispatch consume the same incident (shared store)
- [x] Metrics one-screen scorecard

### Tracking
- [~] Record results in `docs/EVAL.md` per metric (target / actual / evidence)
- [x] Implementation recipes live in `docs/TESTING.md`

## 🎬 Finalization
- [ ] Record 2-3 min demo video (agent fills FIR → generates challan → assigns dispatch unit)
- [ ] Final Chrome run with flag enabled
- [x] Push to public GitHub repo (MIT LICENSE)
- [x] README — setup + tool list + live URL (judge-facing, tight)

## 🤖 External-agent bridge (done — Node MCP server over shared tool logic)

Tool definitions are shared: `src/lib/toolRegistry.ts` (env-agnostic, parameterised over an injected `Store`) is adapted to the browser (WebMCP via `webmcpTools.ts`) and to Node (MCP via `server/mcp-server.ts`).

- [x] `src/lib/toolRegistry.ts` — env-agnostic definitions for all 12 tools
- [x] `src/lib/memoryStore.ts` — in-memory `Store` (no localStorage/document), mirrors browser metadata
- [x] `server/mcp-server.ts` — stdio MCP server; `createPortalServer()` testable, `main()` runs only as entry
- [x] `tsconfig.server.json` project reference — `npm run build` type-checks the server
- [x] `npm run mcp` script
- [x] Verified `tools/list` (12 tools + schema + readOnly) and `tools/call` (`fill_field` → `validate_form` → `submit`)
- [x] Tests: `src/test/mcpBridge.test.ts` + `server/mcp-server.test.ts` (zod-optional regression)
- [x] MCP eval harness: `npm run eval` (`server/eval-scenarios.ts`) → `docs/EVAL_RESULTS.md` — **7/7 PASS** (discovery, no dupes, E2E, robustness, conditional reveal, cross-module, latency)
- [x] Fixed `jsonSchemaToZod` bug surfaced by the harness: empty `required` made all props mandatory → optional-arg tools rejected valid empty calls. Non-required props are now `.optional()`
- [ ] Optional: add a short bridge-demo segment to the video

## 🧭 Notes / Decisions
- **Shared model**: single `incidentStore` incident schema reused by all modules
- **Tool namespacing**: `.` separators — WebMCP rejects `/` in tool names (`InvalidStateError`)
- **Register all on mount**: all 12 tools on first load (not per tab); idempotent, so per-module calls are safe no-ops
- **Origin isolation**: WebMCP needs a secure, origin-keyed document; do NOT send `Origin-Agent-Cluster: ?0`. Chrome flag for localhost dev; prod Vercel HTTPS.
- **Shared tool logic**: one `toolRegistry.ts` powers both the browser WebMCP surface and the Node MCP bridge — identical behavior
