# Live-Portal Driver Prompt — WebMCP Police Portal (hackathon eval)

This prompt is meant to be handed to a **browser-running agent** — the Model Context
Tool Inspector extension, ChatGPT's in-app browser, or Claude/Code with a browser MCP —
pointed at the live deploy. It produces the browser/WebMCP evidence that the
deterministic MCP harness in `docs/EVAL_RESULTS.md` cannot: UI reflection, dual
human+agent editing, the metrics scorecard, real browser WebMCP, and console-cleanliness.

Run it against the live pushed URL: **https://police-portal-mu.vercel.app/**

---

## Paste this prompt into the browser agent

You are an evaluator agent testing a deployed WebMCP app. Open this URL and complete
every checklist item, then report a PASS/FAIL per item with concrete evidence (what you
saw, what the UI showed, what the Metrics page counts). Do NOT guess — if a step cannot
be completed, say which step and why.

URL: https://police-portal-mu.vercel.app/

App background: "Digital Police Portal" — three working modules (FIR, e-Challan, ERSS-112
Dispatch) plus a Metrics scorecard. All 12 WebMCP tools register on load:
`fir.*` (identify_required_fields, fill_field, flag_missing, validate_form, submit,
find_similar_cases), `challan.*` (lookup_rc, auto_calculate_fine, submit),
`dispatch.*` (classify_nature, get_available_units, assign_unit). Tools appear under
Chrome DevTools → Application → WebMCP on the HTTPS origin (no chrome flag needed on prod).

### A. Registration (do first)
- [ ] Header badge reads "12 WebMCP tools live" (or the live count). If it says
      "WebMCP tools pending", stop and report — WebMCP is not active.
- [ ] In Chrome DevTools → Application → WebMCP → "Available Tools", confirm all 12 are
      present and none are duplicated. Note the exact count and names.
- [ ] Switch between the four tabs (FIR / e-Challan / ERSS-112 / Metrics) and confirm the
      tool count does NOT change and no "Duplicate tool name" / uncaught error appears in
      the Console. (Registration is idempotent — count must stay 12.)
- [ ] Open the Console. Do a full session (below) and at the end confirm **zero** console
      errors (warnings are okay if non-fatal; quote them).

### B. FIR module — agent fills a form end-to-end (dual human+agent)
Use the agent (the WebMCP tool surface) to fill the FIR, while a human mirrors on the UI:
- [ ] Call `fir.identify_required_fields` and confirm the returned `requiredNow` matches
      the fields the FIR form shows as required.
- [ ] Call `fir.fill_field` for `complainant.name`, `complainant.phone`, `narrative`, and
      confirm each value appears live in the corresponding UI field (dual editing).
- [ ] Conditional reveal: call `fir.fill_field` on `offense.sections` to include IPC 379
      (theft). Confirm the "property details" section **appears** in the UI and its inputs
      become required.
- [ ] Call `fir.validate_form`. Confirm it returns `valid: true` only once the form is
      complete, and that its per-field errors are identical to the inline UI errors
      (validation parity).
- [ ] Call `fir.fill_field` with an invalid phone (e.g. `123`) and an invalid email.
      Confirm the UI shows the same inline error the tool reports.
- [ ] Submit a deliberately incomplete FIR via `fir.submit` and confirm it is rejected with
      errors (not silently accepted).
- [ ] Complete the FIR and call `fir.submit`. Confirm success and that the record got an
      `id` + `firNumber` (format `FIR-####-######`) and status `acknowledged`.

### C. e-Challan module — consumes the same incident
- [ ] Call `challan.lookup_rc` with a known-registration value and with an unknown one;
      confirm found / not-found both behave.
- [ ] Call `challan.auto_calculate_fine` for a speeding/traffic offence and confirm the fine
      reflects the offence code + vehicle-class multiplier.
- [ ] Complete a challan from the incident created in Part B (same underlying record) and
      `challan.submit` it. Confirm it references the FIR's `firNumber`.

### D. ERSS-112 Dispatch module — same record continues
- [ ] Call `dispatch.classify_nature` on a road-collision description and confirm it returns
      the traffic nature code (TRF-002).
- [ ] Call `dispatch.get_available_units` (empty args OK) and confirm it lists available units.
- [ ] Call `dispatch.assign_unit` and confirm the SAME incident `id` / `firNumber` from
      Part B now has a dispatch unit assigned (cross-module state continuity).

### E. Metrics scorecard
- [ ] Open the Metrics tab. Confirm it renders a one-screen scorecard: total tools registered
      (12), per-module breakdown, per-tool call counts / latency, and validation parity.
- [ ] Confirm the call counts from your agent session in Parts B–D are reflected in the
      Metrics page (i.e. the page is live telemetry, not static).

### F. Report format
For each checklist item output:
`[PASS|FAIL|BLOCKED] <item> — evidence (what the UI/tool/Metrics showed, exact numbers).`
End with a summary: total PASS / FAIL / BLOCKED, any console errors found, and a one-line
verdict on whether the portal is judge-demo-ready.

---

## After the run (maintainer)

Paste the agent's report back; the maintainer reconciles these checklist boxes in
`docs/TODO.md` and updates the evaluation status table in `docs/EVAL.md`:
- Vercel-URL WebMCP verification (12 tools, no flag on HTTPS)
- Prod tools driven via Tool Inspector extension (Metrics counts)
- Round-trip robustness (invalid phone/email/date, conditional requiredWhen, empty
  narrative, no incident)
- Console-cleanliness during a full agent session
- Live dual-editing + cross-module + parity evidence for the demo video