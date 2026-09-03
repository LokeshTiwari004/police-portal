import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from './App'
import { mockModelContext } from './test/modelContextMock'

/**
 * System test: renders the full App shell (header, tab nav, module content)
 * and verifies tab switching drives which module view is shown.
 */

beforeEach(() => {
  delete (document as unknown as { modelContext?: unknown }).modelContext
  localStorage.removeItem('police-portal:incidents')
})

describe('App shell', () => {
  it('renders the portal header and the FIR form by default', () => {
    render(<App />)
    expect(screen.getByText('Digital Police Portal')).toBeInTheDocument()
    expect(screen.getAllByText(/First Information Report/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Complainant Details/)).toBeInTheDocument()
  })

  it('shows the WebMCP tools pending hint when modelContext is unavailable', () => {
    render(<App />)
    expect(screen.getByText(/WebMCP tools pending/i)).toBeInTheDocument()
  })

  it('switches between FIR, e-Challan, ERSS-112, and Metrics tabs', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'e-Challan' }))
    expect(screen.getByText(/1 · Look up vehicle/i)).toBeInTheDocument()
    expect(screen.queryByText(/Complainant Details/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ERSS-112' }))
    expect(screen.getByText(/PCR-88/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Metrics' }))
    expect(screen.getByText(/WebMCP tool telemetry/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'FIR' }))
    expect(screen.getByText(/Complainant Details/)).toBeInTheDocument()
  })

  it('registers 13 tools on first load, independent of the open tab', async () => {
    const mc = mockModelContext()
    render(<App />)

    await waitFor(() => expect(mc.registered.length).toBe(13))
    const names = mc.registered.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'fir.fill_field',
        'challan.lookup_rc',
        'dispatch.assign_unit',
        'nav.switch_tab',
      ]),
    )
  })

  it('switches tabs when the nav.switch_tab tool fires a tabchange event', () => {
    render(<App />)
    expect(screen.getByText(/Complainant Details/)).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new CustomEvent('portal:tabchange', { detail: { tab: 'challan' } }))
    })
    expect(screen.getByText(/1 · Look up vehicle/i)).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new CustomEvent('portal:tabchange', { detail: { tab: 'dispatch' } }))
    })
    expect(screen.getByText(/PCR-88/i)).toBeInTheDocument()
  })
})
