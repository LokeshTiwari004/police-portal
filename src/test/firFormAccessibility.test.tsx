import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { incidentStore } from '../lib/incidentStore'
import FIRForm from '../components/FIRForm'
import { clearStore } from './modelContextMock'

/**
 * Accessibility / label-for audit of the FIR form.
 *
 * Every labelled input must pair an htmlFor on the <label> with a matching id
 * on the control, rendering must never emit duplicate HTML ids, and fields
 * that have no natural single control (multiselect, repeat) must not emit a
 * dangling htmlFor pointing at a non-existent element.
 */

beforeEach(clearStore)

describe('FIRForm label/for linkage', () => {
  it('pairs every label htmlFor with a control id, with no duplicates', () => {
    const inc = incidentStore.list()[0] ?? incidentStore.create()
    incidentStore.update(inc.id, { complainant: { name: 'A', phone: '1' }, narrative: 'N' })

    // Select 457 (house-trespass) so BOTH the cyber and property sections are
    // visible — both declare field name "property", the duplicate-id case.
    incidentStore.update(inc.id, { offense: { sections: ['457'] } })

    const { container } = render(<FIRForm />)

    const ids = Array.from(container.querySelectorAll('[id]')).map((el) => el.getAttribute('id'))
    const dupes = ids.filter((v, i, a) => a.indexOf(v) !== i)
    expect(dupes).toEqual([])

    const labels = Array.from(container.querySelectorAll('label'))
    for (const label of labels) {
      const forVal = label.getAttribute('for')
      if (!forVal) continue
      const target = container.querySelector<HTMLElement>(`#${CSS.escape(forVal)}`)
      expect(target, `label[for="${forVal}"] has no matching control`).not.toBeNull()
    }
  })

  it('does not emit a <label> for multiselect (no single control to attach to)', () => {
    const inc = incidentStore.list()[0] ?? incidentStore.create()
    incidentStore.update(inc.id, {
      complainant: { name: 'A', phone: '1' },
      narrative: 'N',
      offense: { sections: ['379'] },
    })
    const { container } = render(<FIRForm />)

    // The offence selector is a multiselect of buttons; it must render with a
    // heading (span) label, not a <label htmlFor=...> pointing at nothing.
    const sectionLabels = Array.from(container.querySelectorAll('label')).map((el) => el.textContent)
    expect(sectionLabels.some((t) => t && /Nature of Offence/.test(t))).toBe(false)
  })
})
