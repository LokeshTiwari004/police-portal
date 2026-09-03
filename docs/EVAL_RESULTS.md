# EVAL RESULTS — external-agent MCP harness

Run: 2026-09-03T14:26:16.072Z
Surface: real MCP Client <-> createPortalServer (same server as `npm run mcp`)
Result: **9/9 PASS** — all green

| Metric | Target | Actual | Result |
|---|---|---|---|
| Tool discovery (6/3/3/1) | 13 tools listed | 13 tools | PASS |
| No duplicate tools | 0 duplicates | 0 duplicates | PASS |
| E2E fill->validate->submit | valid === true, submit ok + full contract (id/status) | valid=true, submit=true, id=true, status=acknowledged | PASS |
| Robustness: missing required fields rejected | validate false + submit rejected with errors | valid=false, errorKeys=4, submitOk=false | PASS |
| Format parity (phone/email) | invalid phone 123 + email not-an-email both reported | phoneErr=true, emailErr=true | PASS |
| Conditional reveal (theft -> property) | property in hiddenWhenRevealed | hidden=[property] | PASS |
| Challan linked to FIR | challan.submit returns same firNumber + persisted challan | firNumber=FIR-2025-000001 (expected FIR-2025-000001), challan=true | PASS |
| Cross-module flow (dispatch assigned) | unit assigned | units=3, assignedUnit=AMB-147 | PASS |
| Per-tool latency (avg) | low (in-process) | 0.3ms | PASS |

> Deterministic (no LLM, no browser). Covers the automation-drivable
> subset of the hackathon eval metrics over the MCP surface. The live-browser
> WebMCP surface (UI reflection, metrics tab, dual editing) is covered separately
> by the live-portal driver prompt in `docs/LIVE_PORTAL_EVAL.md`.
