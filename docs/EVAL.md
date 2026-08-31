# System Evaluation — WebMCP Police Portal (Hackathon)

Research-backed plan for judging the system, mapped to the actual hackathon rubric.
Hackathon: **OpenAI WebMCP Challenge** (webmcp.devpost.com), deadline **Sep 3 2026 1:00pm PDT**.

## Hackathon rubric (from official rules — the ground truth)

**Stage One** (pass/fail): idea reasonably fits theme + reasonably applies WebMCP.

**Stage Two** — 4 **equally-weighted** judging criteria:
| # | Criterion | What judges look for | Our evidence |
|---|---|---|---|
| 1 | **WebMCP Leverage** | Thorough/skillful use; genuine, non-trivial implementation | 12 registered tools (`fir/*`6, `challan/*`3, `dispatch/*`3), AbortController re-registration, shared store, schema-driven validation. Show `registerTool` + schemas in repo |
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
- cache miss / duplicate registration (our AbortController guarantee)

**Scenario set** (graded, deterministic, no LLM needed — assert tool plumbing):
1. Discover: `registerTools('fir')` → all 6 present, no dupes
2. Fill: `fir/fill_field` dotted paths across sections
3. Conditional reveal: fill `offense.sections`=['379'] → `property` revealed + required
4. Validate parity: `fir/validate_form` errors == FIRForm UI errors (per state corpus)
5. Submit: valid ok / invalid rejected with errors
6. Cross-module: FIR record → `dispatch/assign_unit` mutates SAME `id`, SAME`firNumber`

**Parity corpus** (quantify UI-vs-tool agreement): N sanitized form states → compare `FIRForm` visible errors vs `validateForm` errors → **target 100% agreement** (this is the correctness story; a mismatch is a demo-killing bug).

## Robotic guardrails / measurement harness

- `/metrics` page in-app: renders live counts (tools registered, per-module, latency per tool, parity %) — one-screen scorecard for judges.
- Deterministic vitest evals (no LLM) gate CI: `registerTools` sets, fill→submit round-trip, parity corpus.

## Tracking

Per metric: target / actual / evidence → recorded in this doc's status table (below) and executed per `docs/TESTING.md`.

| Metric | Target | Actual | Evidence |
|---|---|---|---|
| Tool discovery (6/3/3) | all present | — | vitest |
| No duplicate tools | 0 dupes | — | vitest |
| E2E fill→validate→submit | 1 pass ≤60s | — | vitest + video |
| Validation parity | 100% | — | parity corpus |
| Cross-module same record | id/firNumber stable | — | vitest |
| LCP / INP / CLS | ≤1.5s / ≤120ms / ≤0.05 | — | Lighthouse |
| Demo video | <3min, audio | — | YouTube |
