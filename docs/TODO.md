# TODO: WebMCP Police Portal

## 🔨 Setup
- [x] Scaffold React + Vite project — latest stable (React 19 + Vite 8.2.2 + TS):
  ```bash
  npm create vite@latest police-portal --template react-ts
  cd police-portal
  npm i
  npm i tailwindcss @tailwindcss/vite zustand
  ```
- [x] Install TailwindCSS v4.3.3 (Vite plugin `@tailwindcss/vite`, no PostCSS config):
  ```bash
  npm i tailwindcss @tailwindcss/vite
  # @import "tailwindcss"; added to src/index.css
  ```
- [x] Plugin wired in `vite.config.ts` (`plugins: [react(), tailwindcss()]`)
- [x] Add `Origin-Agent-Cluster: ?0` header in `vite.config.ts` for local dev origin isolation (WebMCP requirement)
- [x] Verified `npm run build` + `npm run dev` (http://localhost:5173)
- [ ] Deploy to Vercel for HTTPS origin isolation (required for WebMCP testing on non-localhost)

## 📄 Must-Have: FIR Copilot

### Phase 1: Mock Data & Schema
- [x] Generate `data/formSchema.json` — conditional logic for FIR form (6 sections, 15+ fields)
- [x] Generate `data/offenseCodes.json` — sample IPC/IT/MVA sections (10 entries)
- [ ] Generate `data/mockIncidents.json` — seed incident records for `fir/find_similar_cases`
- [x] `lib/incidentStore.ts` — shared store (`create`, `update`, `get`, `list`, localStorage-backed) + Incident type

### Phase 2: Validation Logic
- [x] `lib/validation.ts` — `validateField` + `validateForm` + `requiredFieldsForSections` (conditional rules)

### Phase 3: FIR Form UI
- [x] `components/Dashboard` logic in `App.tsx` (tab switch re-registers tools)
- [x] Build `components/FIRForm.tsx` — dynamic form rendering using `formSchema.json`:
  - [x] Handles section `dependsOn` / `includeAny` (property section reveals on theft codes)
  - [x] Field types: text, textarea, tel, email, date, time, number, select, multiselect, richtext
  - [x] Renders inline validation errors + missing-field summary
  - [x] `requiredWhen` (accused.description requires physical details when name empty)
- [x] Wire form state changes to `incidentStore` (nested dotted-path updates on change)
- [x] Component tests: `src/components/FIRForm.test.tsx` (conditional reveals, requiredWhen, summary clearing)

### Phase 4: WebMCP Tools
- [x] Write `lib/webmcpTools.ts` — register `fir/*` tools:
  - `fir/identify_required_fields` ✅
  - `fir/fill_field` ✅
  - `fir/flag_missing` ✅
  - `fir/find_similar_cases` ✅
  - `fir/validate_form` ✅
  - `fir/submit` ✅
  - (also stubbed `challan/*` + `dispatch/*` for later phases)
- [x] `registerTools(module)` calls `document.modelContext.registerTool` on module switch
- [x] Verify `npm run build` typechecks cleanly

### Phase 5: Testing
- [x] Add Vitest suite (Vitest 4 + jsdom + testing-library):
  - [x] Unit: `src/lib/validation.test.ts`, `src/lib/incidentStore.test.ts`
  - [x] Integration: `src/test/webmcp.integration.test.ts` (mocks `document.modelContext`, drives `fir/*` against store)
  - [x] System: `src/App.test.tsx` (renders shell + tab switching)
  - [x] `npm test` / `npm run test:watch` / `npm run test:coverage` scripts
- [x] `npm run lint` + `npm run build` (typechecks test files) pass
- [ ] Enable `chrome://flags/#enable-webmcp-testing`
- [ ] Open app → run `getTools()` in console → confirm `fir/*` tools listed
- [ ] Call `executeTool("fir/fill_field", ...)` manually → confirm UI updates
- [ ] Simulate full flow: fill form → validate → submit

## ⚙️ Should-Have: e-Challan

### Phase 6: Challan Logic
- [ ] Generate `data/mvaFines.json` — fine amounts by offense + vehicle class
- [ ] Generate `data/mockRC.json` — fake Vahan DB (10–20 vehicle records)
- [ ] Implement `auto_calculate_fine({section, vehicle_class, state})` in `utils/mockApi.js`
- [ ] Implement `lookup_rc({rc_number})` → fetches owner/VehicleClass from `mockRC.json`

### Phase 7: Challan UI + Tools
- [ ] Build `components/ChallanGenerator.jsx`
- [ ] Register `challan/lookup_rc`, `challan/auto_calculate_fine`, `challan/set_evidence_photo`, `challan/submit` tools
- [ ] Test integration: create challan from existing FIR incident

## 🎯 Stretch Goal: ERSS-112 Dispatch

### Phase 8: Dispatch Console
- [ ] Generate `data/natureCodes.json` — mapping of keywords to nature codes
- [ ] Build `components/DispatchConsole.jsx` — incident list + mock map/grid of units
- [ ] Simulate live unit updates via `setInterval`
- [ ] Implement `classifier.js` → keyword-based nature code classifier

### Phase 9: Dispatch Tools
- [ ] Register `dispatch/triage_channel`, `dispatch/classify_nature`, `dispatch/get_available_units`, `dispatch/assign_unit`, `dispatch/send_notification`
- [ ] Test cross-module flow: FIR incident → dispatch call → unit assigned

## 🎬 Finalization

- [ ] Record 2-min demo video (agent fills FIR → generates challan → assigns dispatch unit)
- [ ] Final test run in Chrome with flag enabled
- [ ] Push to GitHub (public repo with LICENSE)
- [ ] Update README with setup + tool list

---

## 🧭 Notes / Decisions
- **Versions (Aug 2026)**: React 19 + Vite 9.2.0 + TailwindCSS 4.3.3 + Zustand 5.x
- **Shared model**: Design `incidentStore.js` incident schema first — reused by all modules
- **Tool namespacing**: Use `/` separators (`fir/fill_field`, `challan/lookup_rc`) for clarity in agent tool-discovery
- **Dynamic registration**: Register `fir/*` tools on tab switch — keeps tool list clean
- **Origin isolation**: WebMCP requires secure context + origin isolation. Use Chrome flag for localhost dev; Vercel handles prod HTTPS.
