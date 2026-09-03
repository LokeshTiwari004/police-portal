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
    const err = validateField(field, value, true)
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
  if (sections.some((s) => ['279', '304A'].includes(s))) {
    required.push('property')
  }
  return required
}

/**
 * The schema-driven field/section shapes shared by the UI and the tools, copied
 * intentionally so `validation.ts` stays free of imports (it is used by both the
 * browser and the Node MCP server).
 */
export interface ValidationField {
  name: string
  label: string
  type: string
  required?: boolean
  rule?: string
  options?: Array<{ value: string; label: string }> | string[]
  requiredWhen?: { field: string; isEmpty: boolean }
}
export interface ValidationSection {
  id: string
  label: string
  description?: string
  dependsOn?: { field: string; includeAny: string[] }
  fields: ValidationField[]
}

/** Read a dotted path off an Incident-like object, e.g. getValue(inc, 'complainant.name'). */
export function getValue(
  inc: object,
  path: string,
): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc == null || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[part]
  }, inc as Record<string, unknown>)
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true
  if (Array.isArray(value)) return value.length === 0
  return String(value).trim() === ''
}

/** A section renders only when its dependsOn.includeAny intersects selected sections. */
export function isSectionVisible(section: ValidationSection, incident: object): boolean {
  if (!section.dependsOn) return true
  const selected = getValue(incident, section.dependsOn.field)
  return Array.isArray(selected) && selected.some((s) => section.dependsOn!.includeAny.includes(String(s)))
}

/** A field is required when flagged required, or when its requiredWhen condition holds. */
export function isFieldRequired(field: ValidationField, incident: object): boolean {
  const isSuo = isSectionVisible(
    { id: 'suoMoto', fields: [], label: '', dependsOn: { field: 'offense.sections', includeAny: ['SUO'] } },
    incident,
  )
  if (isSuo && field.name.startsWith('complainant.')) return false
  if (field.required) return true
  if (field.requiredWhen?.isEmpty) {
    return isEmptyValue(getValue(incident, field.requiredWhen.field))
  }
  return false
}

/**
 * Compute the exact per-field errors the on-screen form would show for the
 * given incident + schema: every visible section, honoring required /
 * requiredWhen / rule. This is the single source of truth for both the UI and
 * the WebMCP tools, guaranteeing validation parity.
 */
export function validateIncident(
  incident: object,
  sections: ValidationSection[],
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  for (const section of sections) {
    if (!isSectionVisible(section, incident)) continue
    for (const field of section.fields) {
      const err = fieldError(field, incident)
      if (err) errors[field.name] = err
    }
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

function fieldError(field: ValidationField, incident: object): string | null {
  const value = getValue(incident, field.name)
  const required = isFieldRequired(field, incident)
  if (required && isEmptyValue(value)) return 'This field is required.'
  if (field.rule && value !== undefined && value !== '' && !isEmptyValue(value)) {
    return validateField(field.rule, value)
  }
  return null
}
