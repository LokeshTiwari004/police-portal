import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FIRForm from './FIRForm'

beforeEach(() => {
  localStorage.removeItem('police-portal:incidents')
})

describe('FIRForm', () => {
  it('renders the always-visible base sections', () => {
    render(<FIRForm />)
    expect(screen.getByText(/Complainant Details/)).toBeInTheDocument()
    expect(screen.getByText(/Occurrence Details/)).toBeInTheDocument()
    expect(screen.getByText(/Accused \/ Suspect/)).toBeInTheDocument()
    expect(screen.getByText(/History of the Case/)).toBeInTheDocument()
  })

  it('reveals the property section only after a theft/robbery section is selected', () => {
    render(<FIRForm />)
    expect(screen.queryByText(/Property Involved/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /379.*Theft/ }))

    expect(screen.getByText(/Property Involved/)).toBeInTheDocument()
  })

  it('shows a missing-field summary while required fields are empty', () => {
    render(<FIRForm />)
    expect(screen.getByText(/required field/i)).toBeInTheDocument()
    expect(screen.getAllByText('This field is required.').length).toBeGreaterThan(0)
  })

  it('clears errors once required fields are filled', () => {
    render(<FIRForm />)

    fireEvent.change(screen.getByLabelText(/^Name\s?\*/), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByLabelText(/Contact Phone/), { target: { value: '9876543210' } })
    fireEvent.click(screen.getByRole('button', { name: /302.*Murder/ }))
    const accusedName = screen.getByLabelText(/leave empty if unknown/)
    fireEvent.change(accusedName, { target: { value: 'Unknown' } })
    fireEvent.change(screen.getByLabelText(/Narrative/), { target: { value: 'Victim reported an assault' } })

    expect(screen.queryByText(/required field/i)).not.toBeInTheDocument()
  })

  it('makes accused.description required when the accused name is left empty', () => {
    render(<FIRForm />)

    const descriptionLabel = screen.getByText(/Physical Description/)
    expect(descriptionLabel.querySelector('span')).toBeInTheDocument()

    const accusedName = screen.getByLabelText(/leave empty if unknown/)
    fireEvent.change(accusedName, { target: { value: 'Unknown' } })

    expect(screen.getByText(/Physical Description/).querySelector('span')).not.toBeInTheDocument()
  })
})
