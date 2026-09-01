# EVAL RESULTS — external-agent MCP harness

Run: 2026-09-01T09:12:36.159Z
Surface: real MCP Client <-> createPortalServer (same server as `npm run mcp`)
Result: **7/7 PASS** — all green

| Metric | Target | Actual | Result |
|---|---|---|---|
| Tool discovery (6/3/3) | 12 tools listed | 12 tools | PASS |
| No duplicate tools | 0 duplicates | 0 duplicates | PASS |
| E2E fill->validate->submit | valid === true, submit ok | valid=true, submit=true | PASS |
| Robustness: invalid form rejected | validate false + submit rejected with errors | valid=false, errorKeys=2, submitOk=false | PASS |
| Conditional reveal (theft -> property) | property in hiddenWhenRevealed | hidden=[property] | PASS |
| Cross-module flow (dispatch assigned) | unit assigned | units=3, assignedUnit=AMB-147 | PASS |
| Per-tool latency (avg) | low (in-process) | 0.2ms | PASS |

> Deterministic (no LLM, no browser). Covers the automation-drivable
> subset of the hackathon eval metrics over the MCP surface. The live-browser
> WebMCP surface (UI reflection, metrics tab, dual editing) is covered separately
> by the live-portal driver prompt in `docs/LIVE_PORTAL_EVAL.md`.
