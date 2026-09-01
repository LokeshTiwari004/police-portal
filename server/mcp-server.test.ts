/**
 * MCP server unit tests (zod schema conversion).
 *
 * Regression pin: `jsonSchemaToZod` must not make every property required when
 * the JSON schema omits `required`. Before the fix, optional args (e.g.
 * `dispatch.get_available_units.type`) became mandatory, so a valid empty call
 * was rejected. The eval harness (`npm run eval`) drives the real MCP round-trip
 * and hits this same path; these tests pin it at the unit level.
 */
import { describe, it, expect } from 'vitest'
import { jsonSchemaToZod } from './mcp-server'

describe('jsonSchemaToZod (MCP zod conversion)', () => {
  it('allows optional args to be omitted (they are not implicitly required)', () => {
    const schema = {
      type: 'object',
      properties: { type: { type: 'string', description: 'kind of units' } },
    }
    const zodSchema = jsonSchemaToZod(schema)
    expect(zodSchema.safeParse({}).success).toBe(true)
    expect(zodSchema.safeParse({ type: 'ambulance' }).success).toBe(true)
  })

  it('still enforces explicitly-required properties', () => {
    const schema = {
      type: 'object',
      required: ['regno'],
      properties: { regno: { type: 'string' }, optional: { type: 'string' } },
    }
    const zodSchema = jsonSchemaToZod(schema)
    expect(zodSchema.safeParse({}).success).toBe(false)
    expect(zodSchema.safeParse({ optional: 'x' }).success).toBe(false)
    expect(zodSchema.safeParse({ regno: 'MH01' }).success).toBe(true)
  })

  it('non-object schemas degrade to permissive validation (no false rejections)', () => {
    expect(jsonSchemaToZod({ type: 'string' }).safeParse(1).success).toBe(true)
  })
})