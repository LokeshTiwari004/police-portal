import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from './App'

/**
 * System test: renders the full App shell (header, tab nav, module content)
 * and verifies tab switching drives which module view is shown.
 */

beforeEach(() => {
  delete (document as unknown as { modelContext?: unknown }).modelContext
})

describe('App shell', () => {
  it('renders the portal header and default FIR tab', () => {
    render(<App />)
    expect(screen.getByText('Digital Police Portal')).toBeInTheDocument()
    expect(screen.getByText(/First Information Report/)).toBeInTheDocument()
    expect(screen.getByText(/FIR module/i)).toBeInTheDocument()
  })

  it('shows the WebMCP tools pending hint when modelContext is unavailable', () => {
    render(<App />)
    expect(screen.getByText(/WebMCP tools pending/i)).toBeInTheDocument()
  })

  it('switches between FIR, e-Challan, and ERSS-112 tabs', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'e-Challan' }))
    expect(screen.getByText(/Challan module — scaffolded/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ERSS-112' }))
    expect(screen.getByText(/ERSS-112 dispatch console — stretch goal/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'FIR' }))
    expect(screen.getByText(/FIR module/i)).toBeInTheDocument()
  })
})
