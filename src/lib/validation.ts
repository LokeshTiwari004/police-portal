/**
 * Shared validation logic used by BOTH the live UI and the WebMCP tools, so the
 * agent's view never drifts from what the form actually enforces.
 *
 * Field names map to nested paths on Incident; the schema in formSchema.json
 * drives which fields are visible/required given the current form state.
 */

type ValidationRule = (value: unknown) => string | null

const rules: Record<string, ValidationRule> = {
  phone: (v) => {
    const s = String(v ?? '')
    return /^[0-9]{10}$/.test(s)
      ? null
      : 'Phone must be a 10-digit number (e.g. 9876543210).'
  },
  email: (v) => {
    const s = String(v ?? '')
    return /^\S+@\S+\.\S+$/.test(s)
      ? null
      : 'Enter a valid email address.'
  },
  date: (v) => {
    const s = String(v ?? '')
    return /^\d{4}-\d{2}-\d{2}$/.test(s)
      ? null
      : 'Date must be in YYYY-MM-DD format.'
  },
  time: (v) => {
    const s = String(v ?? '')
    return /^\d{2}:\d{2}(:\d{2})?$/.test(s)
      ? null
      : 'Time must be in HH:MM (or HH:MM:SS) format.'
  },
  required: (v) =>
    v === undefined || v === null || String(v).trim() === ''
      ? 'This field is required.'
      : null,
  ein: (v) => {
    const s = String(v ?? '')
    return /^[0-9]{2}-[0-9]{7}$/.test(s)
      ? null
      : 'EIN must be in XX-XXXXXXX format.'
  },
}

/** Validate a single field by name + its declared rule(s). */
export function validateField(
  fieldName: string,
  value: unknown,
  required = false,
): string | null {
  if (required) {
    const missing = rules.required(value)
    if (missing) return missing
  }
  const rule = rules[fieldName]
  if (rule && value !== undefined && value !== '') {
    return rule(value)
  }
  return null
}

/** Full-form validation returns { valid, errors: { field: message } }. */
export function validateForm(form: Record<string, unknown>): {
  valid: boolean
  errors: Record<string, string>
} {
  const errors: Record<string, string> = {}
  for (const [field, value] of Object.entries(form)) {
    const err = validateField(field, value, field === 'narative' ? false : true)
    if (err) errors[field] = err
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * Build a list of children for an event (mirrors formSchema's dependsOn).
 * Provide a table of which fields become required when the selected offense
 * sections match certain codes.
 */
export function requiredFieldsForSections(
  sections: string[],
): string[] {
  const required: string[] = []
  if (sections.some((s) => ['376', '377', '378'].includes(s))) {
    required.push('property', 'witnesses')
  }
  if (sections.some((s) => ['379', '380', '381'].includes(s))) {
    required.push('property')
  }
  return required
}
