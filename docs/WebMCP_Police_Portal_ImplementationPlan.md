# Full WebMCP Implementation Plan: Digital Police Portal

## Goal
Build a single WebMCP-enabled "Digital Police Portal" with:
- **Must-Have**: FIR Copilot (core agent collaboration workflow)
- **Should-Have**: e-Challan Generator (backend rule lookup & auto-calc)
- **Stretch Goal**: ERSS-112 Dispatch Console (real-time multi-channel incident triage)

All exposed via WebMCP tools so AI agents can collaborate with human officers through the same live UI/session.

---

## Architecture Overview

```
/public
  index.html
/src
  /components
    Dashboard.jsx           // Tab container (FIR | Challan | Dispatch)
    FIRForm.jsx             // Dynamic conditional form
    ChallanGenerator.jsx    // RC lookup + fine calculator
    DispatchConsole.jsx     // Multi-channel incident list + map mock
  /data
    offenseCodes.json       // NCRB section lookup
    mvaFines.json           // Motor Vehicles Act fine matrix
    natureCodes.json        // ERSS-112 nature code classifier
    mockIncidents.json      // Seed incidents for dispatch
    mockRC.json             // Fake Vahan DB
  /lib
    webmcpTools.js          // registerTool calls
    formSchema.json         // Conditional logic for FIR form
    validation.js           // Shared validation helpers
    incidentStore.js        // Shared mock backend (localStorage-backed)
  /utils
    classifier.js           // NLP classifier for nature codes
    mockApi.js              // Fake REST API simulating backend services
App.jsx
main.jsx
```

### Tech Stack (Latest Stable, Aug 2026)
- **Framework**: React 19 (concurrent) + Vite 9.2.0 (via `create-vite@9.2.0`) – fastest HMR
- **UI**: TailwindCSS v4.3.3 (new CLI-based setup — no PostCSS config needed)
- **State**: Zustand 5.x
- **Dev server**: Vite (localhost:5173)
- **Deployment**: Vercel (zero-config, HTTPS mandatory for WebMCP origin isolation)

---

## Must-Have: FIR Copilot

### Tool Schema (registered via document.modelContext)
| Tool Name | Action |
|---|---|
| `fir.register_complaint` | Initializes a new incident record with complainant info |
| `fir.fill_field` | Fills any visible or future-revealed field (uses schema for conditional logic) |
| `fir.flag_missing` | Highlights required-but-empty fields |
| `fir.find_similar_cases` | Queries local/mock NCRB-style case archive for precedent offenses |
| `fir.validate_form` | Runs full-form validation, returns structured errors |
| `fir.submit` | Validates + persists to mock DB |

### Form Behavior
- Rendered as a tabbed wizard (sections shown conditionally based on selections)
- Schema-driven: each field has `{name, label, type, dependsOn?, visibleWhen?, requiredWhen?}`
- Validation lives in `/lib/validation.js`, used by both UI and tools

#### Example formSchema snippet:
```json
{
  "victim_age": {
    "label": "Age of Victim",
    "type": "number",
    "requiredWhen": {
      "nature_of_offence": ["376", "377", "378"]
    }
  },
  "injury_description": {
    "label": "Injury Details",
    "type": "textarea",
    "dependsOn": {
      "serious_injury": true
    }
  }
}
```

### Mock Backend (lib/incidentStore.js)
In-memory store with functions:
- `createIncident(data)`: assigns UUID, timestamp
- `updateIncident(id, patch)`
- `listIncidents(filter?)`
- Persists to `localStorage` for session survival

### Dev Steps
1. Scaffold React app (React 19 + Vite 9):
   ```bash
   npm create vite@latest police-portal --template react
   cd police-portal
   npm i zustand
   ```
2. Install TailwindCSS v4 (CLI-based, no PostCSS):
   ```bash
   npm i -D tailwindcss@4.3.3
   npx tailwindcss init -p # generates tailwind.config.{js,cjs} + postcss.config.cjs
   ```
3. Configure `src/index.css`:
   ```css
   @import "tailwindcss";
   ```
4. Do NOT set an `Origin-Agent-Cluster` header. WebMCP requires an origin-keyed
   agent cluster; sending `Origin-Agent-Cluster: ?0` opts out of origin-keying
   (enables `document.domain`) and throws
   `SecurityError: document.modelContext cannot be used when document.domain is enabled`.
   The browser default (no header) keeps the document origin-keyed:
   ```js
   import { defineConfig } from 'vite'
   export default defineConfig({
     // No Origin-Agent-Cluster header — origin-keying is the default. Full
     // WebMCP on localhost also requires the Chrome flag.
   })
   ```
5. Define static mock data (`formSchema.json`, `offenseCodes.json`)
6. Wire up `Dashboard.jsx` → `FIRForm.jsx`
7. Create `webmcpTools.js`: register all `fir.*` tools
8. Integrate validation logic (`validateField`, `validateForm`)
9. Test manually in Chrome with `chrome://flags/#enable-webmcp-testing`

---

## Should-Have: e-Challan Module

### Tool Schema
| Tool Name | Action |
|---|---|
| `challan.lookup_rc` | Fetches vehicle details from mock Vahan DB |
| `challan.auto_calculate_fine` | Computes fine based on offense + vehicle class |
| `challan.set_evidence_photo` | Attaches photo evidence to challan ID |
| `challan.submit` | Finalizes and stores in mock DB |

### Key Logic
- `auto_calculate_fine`: uses hardcoded MVA matrix (`mvaFines.json`)
  - Fine = Base Amount × Vehicle Class Multiplier × State Surcharge
- `lookup_rc`: returns structured object:
```json
{
  "rc_number": "UP14C1234",
  "owner_name": "Rajesh Kumar",
  "address": "123 MG Road, Lucknow",
  "vehicle_class": "MCWG",
  "engine_cc": 110,
  "fuel_type": "Petrol"
}
```

### Dev Steps (Post-FIR Core)
1. Build `ChallanGenerator.jsx` component
2. Implement `auto_calculate_fine()` logic
3. Link challan to incident: `challan.create_from_incident(incident_id)`
4. Register `challan.*` tools in `webmcpTools.js`

---

## Stretch Goal: ERSS-112 Dispatch Console

> Only start if FIR + e-Challan are stable + tested

### Tool Schema
| Tool Name | Action |
|---|---|
| `dispatch.triage_channel` | Triage an incoming message from Voice/SMS/WhatsApp/Chatbot/IoT |
| `dispatch.classify_nature` | Maps natural-language description → ERSS nature code |
| `dispatch.get_available_units` | Returns nearby units (ambulances, patrol cars, etc.) |
| `dispatch.assign_unit` | Assigns unit to incident; escalates if unavailable |
| `dispatch.send_notification` | Sends SMS/email update to complainant |

### Key Logic
- Live unit simulation: mock WebSocket pushes updated GPS positions every 5 sec
- Nature code classifier: lightweight keyword matcher in `/utils/classifier.js`
- Incident lifecycle: statuses = `received → acknowledged → dispatched → enroute → on_scene → closed`

### Dev Steps (Optional/Parallel)
1. Create `DispatchConsole.jsx` with live unit map (div grid or Leaflet)
2. Simulate WebSocket with `setInterval`
3. Hook into shared `incidentStore.js`
4. Register `dispatch.*` tools
5. Test cross-module linking (`fir.incident_id` → `dispatch.triage_channel`)

---

## Integration Strategy

| Feature | MustHave | ShouldHave | Stretch |
|---|---|---|---|
| Shared incident model | YES | YES (link challan) | YES (dispatch triage) |
| Shared mock backend | YES | YES | YES |
| Unified WebMCP namespace | YES | YES | YES |
| Dynamic tool registration | YES (on tab switch) | YES | YES |

### Tool Registration Pattern (webmcpTools.js):
```js
export async function registerAllTools(currentTab = null) {
  if (!document.modelContext?.registerTool) return;

  const toolsToRegister = {
    fir: () => {
      document.modelContext.registerTool({ name: "fir.fill_field", ... });
      document.modelContext.registerTool({ name: "fir.flag_missing", ... });
      // ...etc
    },
    challan: () => {
      document.modelContext.registerTool({ name: "challan.lookup_rc", ... });
      // ...
    },
    dispatch: () => {
      document.modelContext.registerTool({ name: "dispatch.triage_channel", ... });
      // ...
    }
  };

  const activeTabs = currentTab ? [currentTab] : Object.keys(toolsToRegister);
  activeTabs.forEach(tab => toolsToRegister[tab]?.());
}
```

---

## Testing / Verification

### Manual Testing Setup
1. Run dev server: `npm run dev`
2. Open in Chrome: `http://localhost:5173`
3. Enable WebMCP: `chrome://flags/#enable-webmcp-testing`
4. Reload browser
5. Open DevTools Console → confirm tools registered:
   ```
   Object.keys(document.modelContext.tools) // ["fir.fill_field", ...]
   ```

### Agent Simulation
Use [Model Context Tool Inspector Extension](https://chrome.google.com/webstore/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd) or script:
```js
const tools = await document.modelContext.getTools();
await document.modelContext.executeTool(tools.find(t => t.name === 'fir.fill_field'), {field: 'complaint_text', value: 'Stolen bike'});
```

---

## File Layout (Final Output)

```
src/
├── App.jsx
├── main.jsx
├── data/
│   ├── formSchema.json
│   ├── offenseCodes.json
│   ├── mvaFines.json
│   ├── natureCodes.json
│   └── mockRC.json
├── lib/
│   ├── webmcpTools.js
│   ├── validation.js
│   └── incidentStore.js
├── components/
│   ├── Dashboard.jsx
│   ├── FIRForm.jsx
│   ├── ChallanGenerator.jsx
│   └── DispatchConsole.jsx
└── utils/
    ├── classifier.js
    └── mockApi.js
```

---

## Timeline (Weekend Hack)

| Task | Time Estimate |
|---|---|
| Set up project (React + Tailwind + Vite) | 0.5h |
| Mock data (form schema, offense codes, etc.) | 1h |
| Build FIR form UI | 2h |
| Wire up validation logic | 1h |
| Register `fir.*` WebMCP tools | 1h |
| Local testing (Chrome + flags) | 1h |
| Add e-Challan module | 2h |
| Add ERSS-112 dispatch console (stretch) | 2h |
| Polish UI + record demo video | 1h |
| **Total est.** | **~10.5h** |

---

## Deliverables (for submission)

1. **Live URL** (deployed on Vercel): `https://police-portal-demo.vercel.app`
2. **GitHub repo**: Public, open-source license, clean README
3. **WebMCP tool registry**: Working in browser (tested with flag enabled)
4. **Demo script**: 2-min screencast showing agent filling FIR + generating challan
5. **Submission form answers**:
   - Why this use case fits WebMCP (human-officer collaboration with real-time validation + cross-module state)
   - What people+agent do together that was hard before (conditional reveals, backend lookups, live unit tracking)

---

## Priority Build Order
1. **Start with `formSchema.json` + `validation.js`** → foundation for everything
2. **Build `FIRForm.jsx` + register `fir.*` tools** → core MVP
3. **Add `challan.*` module** → natural extension reusing incident store
4. **Add `dispatch.*` only if time allows** → nice-to-have showcase

---

**Note**: All three modules share the same `incidentStore.js` — design the incident schema first (incident_id, complainant, location, timestamp, status) to avoid retrofitting later.

Let me know which file/artifact you want me to generate first.
