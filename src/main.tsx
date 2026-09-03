import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { incidentStore } from './lib/incidentStore'

// Seed a fresh session with demo records so the record browser / filters and
// every module (FIR, e-Challan, ERSS-112) have content on first load. No-op if
// the officer already has records.
incidentStore.seed()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
