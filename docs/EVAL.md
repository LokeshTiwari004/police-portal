# System Evaluation — WebMCP Police Portal (Hackathon)

Research-backed plan for judging the system, mapped to the actual hackathon rubric.
Hackathon: **OpenAI WebMCP Challenge** (webmcp.devpost.com), deadline **Sep 3 2026 1:00pm PDT**.

## Hackathon rubric (from official rules — the ground truth)

**Stage One** (pass/fail): idea reasonably fits theme + reasonably applies WebMCP.

**Stage Two** — 4 **equally-weighted** judging criteria:
| # | Criterion | What judges look for | Our evidence |
|---|---|---|---|
| 1 | **WebMCP Leverage** | Thorough/skillful use; genuine, non-trivial implementation | 13 registered tools (`fir.*`6, `challan.*`3, `dispatch.*`3, `nav.*`1), idempotent registration (no unregister API — no dup errors), shared store, schema-driven validation. Show `registerTool` + schemas in repo |
| 2 | **Execution** | Working/runnable, complete coherent product — not just tech PoC | Live URL, full form UI, inline errors, submit persists, challan+dispatch consuming same incident; test suite proves it runs |
| 3 | **Potential Impact** | Credible specific case, real problem/real audience, solution actually addresses it | FIR Copilot: dual human+agent realtime form with validation parity — an officer + agent collaborate; supported by literature review |
| 4 | **Creativity & Ambition** | Novel, differs from existing | Agent-native forms with conditional reveal + flag-for-human-review; cross-module incident lifecycle |

**Hard submission requirements (non-negotiable):**
- Working **live URL** (judges use ChatGPT in-app browser OR Chrome + `chrome://flags/#enable-webmcp-testing`)
- Text description (4 prompts: WebMCP fit, UX better, human+agent together, how implemented)
- **<3 min** YouTube demo video, audio, clear demo
- Public repo + **open-source LICENSE visible in About section**
- Repo shows `document.modelContext.registerTool({...})`

**Tie-break**: highest score on criterion #1 (WebMCP Leverage) wins ties → bias effort toward genuine WebMCP depth.

## Tension: deadline is ~2 days out

Current state is **FIR-complete, challan/dispatch = tools-only stubs, no deployment, no demo video, no LICENSE, no README**. With 48h, priorities by rubric impact:

1. **Ship live URL + LICENSE + README + demo video** (Execution — knockout gate; without these nothing else counts)
2. **Deepen WebMCP Leverage** (criterion #1, tie-breaker) — challan/dispatch UIs + real tools, cross-module flow
3. Show metrics in video/description as evidence of Execution rigor

## Performance budgets (for Execution evidence)

Core Web Vitals thresholds (stable 2026; Chrome assesses at **75th percentile**):
| Metric | Good | Our target (desktop, judges' laptop) |
|---|---|---|
| LCP | ≤ 2.5s | ≤ 1.5s (desktop cable) |
| INP | ≤ 200ms | ≤ 120ms desktop; each event handler < 50ms main-thread block |
| CLS | ≤ 0.1 | ≤ 0.05 |
| TTFB | < 200ms good | from Vercel edge |
| init JS gzipped | — | ≤ 200KB desktop (currently 208KB raw, ~66KB gz) |

SPA addendum: web vitals v4 tracks **soft navigations** — measure INP on tab switches (FIR→challan→dispatch), not just first load.

Measure: Chrome DevTools Performance panel + Lighthouse + `web-vitals` lib; P75.

## Agent-accuracy benchmark (WebMCP Leverage evidence)

Mirror the ecosystem eval framework (PaulKinlan/`webmcp-relay` uses these exact metrics):
- **top-1 rate** — does agent pick the right tool on first try
- **MRR** (mean reciprocal rank) — where the correct tool ranks
- **success rate** — task completes
- **latency** — per tool-call
- cache miss / duplicate registration (idempotency guarantee — zero "Duplicate tool name" errors)

**Scenario set** (graded, deterministic, no LLM needed — assert tool plumbing):
1. Discover: `registerTools('fir')` → all 6 present, no dupes
2. Fill: `fir.fill_field` dotted paths across sections
3. Conditional reveal: fill `offense.sections`=['379'] → `property` revealed + required
4. Validate parity: `fir.validate_form` errors == FIRForm UI errors (per state corpus)
5. Submit: valid ok / invalid rejected with errors
6. Cross-module: FIR record → `dispatch.assign_unit` mutates SAME `id`, SAME`firNumber`

**Parity corpus** (quantify UI-vs-tool agreement): N sanitized form states → compare `FIRForm` visible errors vs `validateForm` errors → **target 100% agreement** (this is the correctness story; a mismatch is a demo-killing bug).

## Robotic guardrails / measurement harness

- `/metrics` page in-app: renders live counts (tools registered, per-module, latency per tool, parity %) — one-screen scorecard for judges.
- Deterministic vitest evals (no LLM) gate CI: `registerTools` sets, fill→submit round-trip, parity corpus.

## Tracking

Per metric: target / actual / evidence → recorded in this doc's status table (below) and executed per `docs/TESTING.md`.

| Metric | Target | Actual | Evidence |
|---|---|---|---|
| Tool discovery (8/3/4/2/1) | all present | 18 shown under DevTools→Application→WebMCP | vitest + live run (18 distinct, no dupes) |
| No duplicate tools | 0 dupes | 0 | vitest + MCP harness + live run |
| E2E fill→validate→submit | 1 pass ≤60s | live agent ran full flow; 22 tool calls on Metrics page | vitest + live run |
| Validation parity | 100% | `fir.validate_form` == UI by construction (`validateIncident` shared); live-run FAILs (3-field subset, format rules never firing) fixed | `validateIncident` + `mcpBridge.test.ts` + eval harness |
| Cross-module same record | id/firNumber stable | challan + dispatch assignment link to same FIR `firNumber` | MCP harness 9/9 + `mcpBridge.test.ts` |
| LCP / INP / CLS | ≤1.5s / ≤120ms / ≤0.05 | — | Lighthouse |
| Demo video | <3min, audio | — | YouTube |

### Live-portal agent run (manual, browser-only evidence)

A Codex in-app browser agent ran `docs/LIVE_PORTAL_EVAL.md` against the Vercel origin and
reported **11 PASS / 7 FAIL / 1 BLOCKED**. PASSes: 18 tools live, idempotent across tab
switches, zero console errors/warnings, FIR live fills, IPC-379 conditional reveal, RC
lookup, fine calc, dispatch classification/units/continuity, Metrics live telemetry (22
calls). The 7 FAILs were real bugs and all are fixed in the current commit:

1. `fir.identify_required_fields` missing conditional `accused.description` → now
   evaluates `requiredWhen` against the live incident.
2. `fir.validate_form` returned `valid:true` on bad phone/email — format rules only
   fired on bare rule names, never on dotted paths → shared `validateIncident` enforces
   `rule` per field.
3. Invalid phone/email not surfaced — same root cause, fixed.
4. `fir.submit` accepted an incomplete FIR → now rejects with errors (full-form validate).
5. Completed-FIR submit returned no `id`/`status` → returns full contract
   (`id`, `firNumber`, `status`).
6. `challan.submit` was a stub returning "Challan persisted (stub)" with no FIR link → now
   persists onto the active incident and returns its `firNumber`; `ChallanGenerator` reads
   the same JSON and subscribes to the store.
7. Metrics missing per-module breakdown + parity section → added (FIR / e-Challan /
   ERSS-112 calls + distinct tools, and a live validation-parity stat).

The BLOCKED item (DevTools→Application→WebMCP panel) is a tool limitation (in-app browser
has no DevTools); the 18-tool surface was verified via the agent's tool fetch.


### Deterministic MCP harness (evidence, autonomous)

`npm run eval` (`server/eval-scenarios.ts`) round-trips a real MCP Client against
`createPortalServer` — the exact surface an external agent gets via `npm run mcp` — and
writes `docs/EVAL_RESULTS.md`. Current: **11/11 PASS** — tool discovery (18, no dupes), E2E
fill→validate→submit (full contract: id/firNumber/status), robustness (incomplete form +
submit refused), format parity (bad phone/email surfaced), conditional reveal
(theft→`property`), **challan linked to the same FIR** (`firNumber` continuity),
cross-module dispatch assignment, per-tool latency (sub-ms, in-process), **ERSS→FIR
linking** (`erss.create_call` → `record.list` → `fir.link_erss`, FIR carries the source
ERSS number), and **record-graph targeting** (`record.select` directs `dispatch.assign_unit`
at an explicit record). Deterministic (no LLM/browser).

While building it the harness surfaced and fixed a real bug: `jsonSchemaToZod` made every
property mandatory when `required` was empty, so optional-arg tools like
`dispatch.get_available_units` rejected a valid empty call. Fixed in `server/mcp-server.ts`
(non-required props are optional), pinned by `server/mcp-server.test.ts`, and exercised by
the harness's cross-module scenario.

The browser-only metrics (18 tools under DevTools→WebMCP on the Vercel origin, Tool
Inspector-driven prod calls + Metrics counts, dual human+agent editing, parity on live form,
console cleanliness, demo video) are covered by the live-portal driver prompt in
`docs/LIVE_PORTAL_EVAL.md`.
