import { describe, it, expect } from 'vitest'
import { validateField, validateForm, requiredFieldsForSections } from './validation'

describe('validateField', () => {
  it('passes a valid phone number', () => {
    expect(validateField('phone', '9876543210')).toBeNull()
  })

  it('rejects an invalid phone number', () => {
    expect(validateField('phone', '12345')).toMatch(/10-digit/)
  })

  it('flags empty value when required', () => {
    expect(validateField('phone', '', true)).toMatch(/required/)
  })

  it('does not flag empty optional value', () => {
    expect(validateField('phone', '', false)).toBeNull()
  })

  it('validates email format', () => {
    expect(validateField('email', 'bad')).toMatch(/valid email/)
    expect(validateField('email', 'ok@example.com')).toBeNull()
  })

  it('validates YYYY-MM-DD date format', () => {
    expect(validateField('date', '2025-01-15')).toBeNull()
    expect(validateField('date', '15/01/2025')).toMatch(/YYYY-MM-DD/)
  })

  it('validates HH:MM time format', () => {
    expect(validateField('time', '14:30')).toBeNull()
    expect(validateField('time', 'bananas')).toMatch(/HH:MM/)
  })
})

describe('validateForm', () => {
  it('returns valid when all required fields are present', () => {
    const { valid, errors } = validateForm({
      'complainant.name': 'Alice',
      'complainant.phone': '9876543210',
      narrative: 'Full account of the incident',
    })
    expect(valid).toBe(true)
    expect(errors).toEqual({})
  })

  it('returns errors for missing required fields', () => {
    const { valid, errors } = validateForm({
      'complainant.name': '',
      'complainant.phone': '123',
      narrative: '',
    })
    expect(valid).toBe(false)
    expect(errors['complainant.name']).toMatch(/required/)
    expect(errors['narrative']).toMatch(/required/)
  })

  it('flags empty narrative as required', () => {
    const { valid, errors } = validateForm({
      'complainant.name': 'Alice',
      'complainant.phone': '9876543210',
      narrative: '',
    })
    expect(valid).toBe(false)
    expect(errors['narrative']).toMatch(/required/)
  })
})

describe('requiredFieldsForSections', () => {
  it('requires property + witnesses for sexual-offence codes', () => {
    expect(requiredFieldsForSections(['376']).sort()).toEqual(['property', 'witnesses'].sort())
  })

  it('requires property for theft codes', () => {
    expect(requiredFieldsForSections(['379'])).toEqual(['property'])
  })

  it('returns nothing for unrelated codes', () => {
    expect(requiredFieldsForSections(['302'])).toEqual([])
  })

  it('handles an empty selection', () => {
    expect(requiredFieldsForSections([])).toEqual([])
  })
})
