import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { incidentStore, type Incident } from '../lib/incidentStore'
import { validateField } from '../lib/validation'
import schemaJson from '../data/formSchema.json'

type FieldType = 'text' | 'textarea' | 'tel' | 'email' | 'date' | 'time' | 'number' | 'select' | 'multiselect' | 'repeat' | 'richtext'

interface Field {
  name: string
  label: string
  type: string
  required?: boolean
  rule?: string
  options?: Array<{ value: string; label: string }> | string[]
  requiredWhen?: { field: string; isEmpty: boolean }
}

interface Section {
  id: string
  label: string
  description?: string
  dependsOn?: { field: string; includeAny: string[] }
  fields: Field[]
}

const sections = (schemaJson as { sections: Section[] }).sections

/** Read a dotted path off an incident, e.g. getValue(inc, 'complainant.name'). */
function getValue(inc: Incident, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc == null || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[part]
  }, inc)
}

/** Return a shallow copy of the incident with a dotted path set. */
function setValue(inc: Incident, path: string, value: unknown): Incident {
  const parts = path.split('.')
  const root = JSON.parse(JSON.stringify(inc)) as Record<string, unknown>
  let ref = root
  for (let i = 0; i < parts.length - 1; i++) {
    const cur = ref[parts[i]]
    if (cur == null || typeof cur !== 'object') ref[parts[i]] = {}
    ref = ref[parts[i]] as Record<string, unknown>
  }
  ref[parts[parts.length - 1]] = value
  return root as unknown as Incident
}

/** Section is visible when its dependsOn.includeAny intersects selected sections. */
function isSectionVisible(section: Section, incident: Incident): boolean {
  if (!section.dependsOn) return true
  const fieldVal = getValue(incident, section.dependsOn.field)
  const selected = Array.isArray(fieldVal) ? (fieldVal as string[]) : []
  return selected.some((s) => section.dependsOn!.includeAny.includes(s))
}

function isFieldRequired(field: Field, incident: Incident): boolean {
  if (field.required) return true
  if (field.requiredWhen?.isEmpty) {
    const val = getValue(incident, field.requiredWhen.field)
    return val == null || String(val).trim() === ''
  }
  return false
}

function fieldError(field: Field, incident: Incident): string | null {
  const value = getValue(incident, field.name)
  const required = isFieldRequired(field, incident)
  if (required && (value == null || (Array.isArray(value) ? value.length === 0 : String(value).trim() === ''))) {
    return 'This field is required.'
  }
  if (field.rule && value != null && value !== '') {
    return validateField(field.rule, value)
  }
  return null
}

export default function FIRForm() {
  const [incident, setIncident] = useState<Incident>(() => incidentStore.list()[0] ?? incidentStore.create())

  // Sync with the live active incident. WebMCP tools (fir.fill_field,
  // fir.flag_missing, ...) mutate incidentStore directly; subscribing here
  // makes the agent's edits appear in the form instead of being swallowed by
  // this component's local state.
  useEffect(() => {
    return incidentStore.subscribe((incidents) => {
      setIncident(incidents[0] ?? incidentStore.create())
    })
  }, [])

  const visibleSections = useMemo(
    () => sections.filter((s) => isSectionVisible(s, incident)),
    [incident],
  )

  const errors = useMemo(() => {
    const out: Record<string, string> = {}
    for (const section of visibleSections) {
      for (const field of section.fields) {
        const err = fieldError(field, incident)
        if (err) out[field.name] = err
      }
    }
    return out
  }, [incident, visibleSections])

  const errorCount = Object.keys(errors).length

  function handleChange(field: Field, value: unknown) {
    const updated = setValue(incident, field.name, value)
    incidentStore.update(incident.id, updated)
    setIncident(updated)
  }

  function renderField(field: Field): ReactNode {
    const value = getValue(incident, field.name)
    const err = errors[field.name]
    const inputClass =
      'w-full px-3 py-2 border rounded-md text-sm ' +
      (err ? 'border-red-400 bg-red-50' : 'border-slate-300')

    const label = (
      <label htmlFor={field.name} className="block text-sm font-medium text-slate-700 mb-1">
        {field.label}
        {isFieldRequired(field, incident) && <span className="text-red-500"> *</span>}
      </label>
    )
    const errorMsg = err && <p className="text-xs text-red-600 mt-1">{err}</p>

    switch (field.type as FieldType) {
      case 'textarea':
        return (
          <div key={field.name}>
            {label}
            <textarea
              id={field.name}
              className={inputClass}
              rows={3}
              value={String(value ?? '')}
              onChange={(e) => handleChange(field, e.target.value)}
            />
            {errorMsg}
          </div>
        )
      case 'select': {
        const options = (field.options as string[]) ?? []
        return (
          <div key={field.name}>
            {label}
            <select
              id={field.name}
              className={inputClass}
              value={String(value ?? '')}
              onChange={(e) => handleChange(field, e.target.value)}
            >
              <option value="">— select —</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {errorMsg}
          </div>
        )
      }
      case 'multiselect': {
        const options = (field.options as Array<{ value: string; label: string }>) ?? []
        const selected = Array.isArray(value) ? (value as string[]) : []
        const toggle = (code: string) => {
          const next = selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]
          handleChange(field, next)
        }
        return (
          <div key={field.name}>
            {label}
            <div className="flex flex-wrap gap-2">
              {options.map((o) => {
                const active = selected.includes(o.value)
                return (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => toggle(o.value)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                      active
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
            {errorMsg}
          </div>
        )
      }
      case 'richtext':
        return (
          <div key={field.name}>
            {label}
            <textarea
              id={field.name}
              className={inputClass}
              rows={5}
              value={String(value ?? '')}
              onChange={(e) => handleChange(field, e.target.value)}
            />
            {errorMsg}
          </div>
        )
      default:
        return (
          <div key={field.name}>
            {label}
            <input
              id={field.name}
              type={field.type === 'number' ? 'number' : field.type}
              className={inputClass}
              value={String(value ?? '')}
              onChange={(e) => handleChange(field, e.target.value)}
            />
            {errorMsg}
          </div>
        )
    }
  }

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="space-y-6"
      data-testid="fir-form"
    >
      <div className="flex items-center justify-between">
        <div>
        <h2 className="text-lg font-semibold">{(schemaJson as { title: string }).title}</h2>
        <p className="text-sm text-slate-500">{(schemaJson as { subtitle: string }).subtitle}</p>
        </div>
        <span className="text-xs bg-slate-100 px-2 py-1 rounded">#{incident.firNumber}</span>
      </div>

      {errorCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-md">
          <strong>{errorCount}</strong> required field{errorCount > 1 ? 's' : ''} missing — complete them to file this FIR.
        </div>
      )}

      {visibleSections.map((section) => (
        <fieldset key={section.id} className="border border-slate-200 rounded-lg p-4">
          <legend className="px-2 text-sm font-semibold text-slate-800">{section.label}</legend>
          {section.description && <p className="text-sm text-slate-500 mb-3">{section.description}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {section.fields.map(renderField)}
          </div>
        </fieldset>
      ))}
    </form>
  )
}
