# EVAL RESULTS — external-agent MCP harness

Run: 2026-09-03T17:51:13.699Z
Surface: real MCP Client <-> createPortalServer (same server as `npm run mcp`)
Result: **11/11 PASS** — all green

| Metric | Target | Actual | Result |
|---|---|---|---|
| Tool discovery (8/3/4/2/1) | 18 tools listed | 18 tools | PASS |
| No duplicate tools | 0 duplicates | 0 duplicates | PASS |
| E2E fill->validate->submit | valid === true, submit ok + full contract (id/status) | valid=true, submit=true, id=true, status=acknowledged | PASS |
| Robustness: missing required fields rejected | validate false + submit rejected with errors | valid=false, errorKeys=4, submitOk=false | PASS |
| Format parity (phone/email) | invalid phone 123 + email not-an-email both reported | phoneErr=true, emailErr=true | PASS |
| Conditional reveal (theft -> property) | property in hiddenWhenRevealed | hidden=[property] | PASS |
| Challan linked to FIR | challan.submit returns same firNumber + persisted challan | firNumber=FIR-2025-000001 (expected FIR-2025-000001), challan=true | PASS |
| Cross-module flow (dispatch assigned) | unit assigned | units=3, assignedUnit=AMB-147 | PASS |
| Per-tool latency (avg) | low (in-process) | 0.2ms | PASS |
| ERSS -> FIR linking (created + discoverable + linked) | erss record exists, link ok, linkedErssNumber === erssNumber | erssId=true, erssNumber=ERS-2025-000002, listed=true, link=true, linked=true, firListed=true | PASS |
| record.select targets the selected record | select ok; dispatch.assign_unit now hits the ERSS call | select=true, selected=true, assignedErss=true | PASS |

> Deterministic (no LLM, no browser). Covers the automation-drivable
> subset of the hackathon eval metrics over the MCP surface. The live-browser
> WebMCP surface (UI reflection, metrics tab, dual editing) is covered separately
> by the live-portal driver prompt in `docs/LIVE_PORTAL_EVAL.md`.
