import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { incidentStore, type Incident } from '../lib/incidentStore'
import { validateIncident, isFieldRequired, isSectionVisible, getValue, type ValidationSection, type ValidationField } from '../lib/validation'
import { RecordBrowser, defaultFilter, type RecordFilter } from './RecordBrowser'
import schemaJson from '../data/formSchema.json'

type FieldType = 'text' | 'textarea' | 'tel' | 'email' | 'date' | 'time' | 'number' | 'select' | 'multiselect' | 'repeat' | 'richtext'

const sections = (schemaJson as { sections: ValidationSection[] }).sections

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

export default function FIRForm() {
  // Start on a fresh blank draft so a seeded record never auto-fills the form.
  // The officer picks any existing record from the browser to edit it.
  const [incident, setIncident] = useState<Incident>(() => incidentStore.create())
  const [allIncidents, setAllIncidents] = useState<Incident[]>(() => incidentStore.list())
  const [filter, setFilter] = useState<RecordFilter>(defaultFilter)
  const [submitted, setSubmitted] = useState(false)

  // Sync with the live active incident. WebMCP tools (fir.fill_field,
  // fir.flag_missing, ...) mutate incidentStore directly; subscribing here
  // makes the agent's edits appear in the form instead of being swallowed by
  // this component's local state. The officer can also pick any record from the
  // browser to edit it individually.
  useEffect(() => {
    return incidentStore.subscribe((incidents) => {
      setAllIncidents(incidents)
      const stillLive = incidents.find((i) => i.id === incident.id)
      if (stillLive) setIncident(stillLive)
    })
  }, [incident.id])

  const visibleSections = useMemo(
    () => sections.filter((s) => isSectionVisible(s, incident)),
    [incident],
  )

  const errors = useMemo(
    () => validateIncident(incident, sections).errors,
    [incident],
  )

  const errorCount = Object.keys(errors).length

  function handleChange(field: ValidationField, value: unknown) {
    const updated = setValue(incident, field.name, value)
    incidentStore.update(incident.id, updated)
    setIncident(updated)
  }

  function renderField(field: ValidationField, sectionId: string): ReactNode {
    const value = getValue(incident, field.name)
    const err = errors[field.name]
    const inputClass =
      'w-full px-3 py-2 border rounded-md text-sm ' +
      (err ? 'border-red-400 bg-red-50' : 'border-slate-300')
    // Scope the DOM id by section so a field name used in more than one section
    // (e.g. "property" in both Cyber and Property sections) never collides.
    const controlId = `${sectionId}.${field.name}`

    const label =
      field.type === 'multiselect' || field.type === 'repeat' ? (
        <span className="block text-sm font-medium text-slate-700 mb-1">
          {field.label}
          {isFieldRequired(field, incident) && <span className="text-red-500"> *</span>}
        </span>
      ) : (
        <label htmlFor={controlId} className="block text-sm font-medium text-slate-700 mb-1">
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
              id={controlId}
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
              id={controlId}
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
                    aria-pressed={active}
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
      case 'repeat': {
        const items = Array.isArray(value) && (value as string[]).length ? (value as unknown[]) : ['']
        return (
          <div key={field.name}>
            {label}
            <div className="space-y-2">
              {items.map((item, i) => (
                <input
                  key={i}
                  id={i === 0 ? controlId : `${controlId}-${i}`}
                  className={inputClass}
                  type="text"
                  value={String(item ?? '')}
                  onChange={(e) => {
                    const next = [...items]
                    next[i] = e.target.value
                    handleChange(field, next)
                  }}
                  aria-label={`${field.label} item ${i + 1}`}
                />
              ))}
              <button
                type="button"
                onClick={() => handleChange(field, [...items, ''])}
                className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                + Add item
              </button>
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
              id={controlId}
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
              id={controlId}
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
      <RecordBrowser
        incidents={allIncidents}
        filter={filter}
        activeId={incident.id}
        onFilter={setFilter}
        onSelect={(inc) => {
          setIncident(inc)
          setSubmitted(inc.status === 'acknowledged')
        }}
      />

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
            {section.fields.map((f) => renderField(f, section.id))}
          </div>
        </fieldset>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          disabled={submitted || incident.status === 'acknowledged'}
          onClick={() => {
            const { valid } = validateIncident(incident, sections)
            if (!valid) return
            incidentStore.update(incident.id, { status: 'acknowledged' })
            setSubmitted(true)
          }}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
            submitted || incident.status === 'acknowledged'
              ? 'bg-emerald-100 text-emerald-700 cursor-default'
              : 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800'
          }`}
        >
          {submitted || incident.status === 'acknowledged' ? 'FIR Submitted' : 'Submit FIR'}
        </button>
        <button
          type="button"
          onClick={() => {
            incidentStore.update(incident.id, {
              complainant: { name: '' },
              offense: { sections: [] },
              accused: {},
              property: [],
              witnesses: [],
              narrative: '',
              missingFields: [],
            })
            setSubmitted(false)
          }}
          className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
        >
          Clear form
        </button>
        {(submitted || incident.status === 'acknowledged') && (
          <span className="text-sm text-emerald-700">
            {incident.firNumber} — acknowledged
          </span>
        )}
      </div>
    </form>
  )
}
