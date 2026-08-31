import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { validateForm } from '../lib/validation'
import { incidentStore } from '../lib/incidentStore'
import FIRForm from '../components/FIRForm'
import { clearStore } from './modelContextMock'

/**
 * Validation parity test.
 *
 * The UI (FIRForm) and the WebMCP tools (fir/validate_form, fir/submit) share
 * validation.ts but feed it from different paths. A parity regression is when
 * the human's form and the agent's tool disagree about a field — e.g. the old
 * 'narative' typo made the tool accept an empty narrative while the UI rejected
 * it. This locks agreement on the shared three-field contract.
 */

function currentIncident() {
  return incidentStore.list()[0] ?? incidentStore.create()
}

describe('validation parity: FIRForm UI vs fir/validate_form tool', () => {
  beforeEach(clearStore)

  it('both the UI and the tool flag an empty narrative as required', () => {
    const inc = currentIncident()
    incidentStore.update(inc.id, {
      complainant: { name: 'Alice', phone: '9876543210' },
      narrative: '',
    })

    // Tool path (same flat shape fir/validate_form and fir/submit build).
    const tool = validateForm({
      'complainant.name': 'Alice',
      'complainant.phone': '9876543210',
      narrative: '',
    })
    expect(tool.valid).toBe(false)
    expect(tool.errors['narrative']).toMatch(/required/)

    // UI path — the rendered FIRForm must surface the same narrative error.
    render(<FIRForm />)
    expect(screen.getByLabelText(/Narrative/).className).toMatch(/border-red-400/)
    expect(screen.getAllByText(/This field is required\./).length).toBeGreaterThan(0)
  })

  it('both the UI and the tool accept a fully filled shared contract', () => {
    const inc = currentIncident()
    incidentStore.update(inc.id, {
      complainant: { name: 'Alice', phone: '9876543210' },
      offense: { sections: ['379'] },
      narrative: 'Bike stolen while parked',
    })

    const tool = validateForm({
      'complainant.name': 'Alice',
      'complainant.phone': '9876543210',
      narrative: 'Bike stolen while parked',
    })
    expect(tool.valid).toBe(true)

    // The Narrative field no longer carries a required error in the UI.
    render(<FIRForm />)
    expect(screen.getByLabelText(/Narrative/).className).not.toMatch(/border-red-400/)
  })
})
