/**
 * Parameter validation for the query registry.
 *
 * Validates incoming request params against a QueryConfig's param schema.
 * Returns cleaned, validated params or throws a structured error.
 */
import type { QueryParam } from './types'

export class ValidationError extends Error {
  code = 'INVALID_PARAM' as const
  param: string

  constructor(param: string, message: string) {
    super(message)
    this.param = param
  }
}

/**
 * Validate a set of params against a query's parameter definitions.
 * Returns a cleaned params object with defaults applied.
 */
export function validateParams(
  raw: Record<string, unknown>,
  schema: QueryParam[]
): Record<string, string | number> {
  const result: Record<string, string | number> = {}

  for (const def of schema) {
    const value = raw[def.name]

    // Check required
    if (def.required && (value === undefined || value === null || value === '')) {
      throw new ValidationError(def.name, `Parameter '${def.name}' is required`)
    }

    // Apply default if missing
    if (value === undefined || value === null || value === '') {
      if (def.default !== undefined) {
        result[def.name] = def.default
      }
      continue
    }

    const strVal = String(value)

    switch (def.type) {
      case 'enum': {
        if (!def.values?.includes(strVal)) {
          throw new ValidationError(
            def.name,
            `Parameter '${def.name}' must be one of: ${def.values?.join(', ')}`
          )
        }
        result[def.name] = strVal
        break
      }

      case 'number': {
        const num = Number(strVal)
        if (isNaN(num)) {
          throw new ValidationError(def.name, `Parameter '${def.name}' must be a number`)
        }
        if (def.min !== undefined && num < def.min) {
          throw new ValidationError(def.name, `Parameter '${def.name}' must be >= ${def.min}`)
        }
        if (def.max !== undefined && num > def.max) {
          throw new ValidationError(def.name, `Parameter '${def.name}' must be <= ${def.max}`)
        }
        result[def.name] = num
        break
      }

      case 'string': {
        // Sanitize: strip SQL metacharacters, limit length
        const sanitized = strVal.replace(/[';\\]/g, '').slice(0, 200)
        if (def.pattern) {
          const re = new RegExp(def.pattern)
          if (!re.test(sanitized)) {
            throw new ValidationError(
              def.name,
              `Parameter '${def.name}' does not match required pattern`
            )
          }
        }
        result[def.name] = sanitized
        break
      }

      default:
        throw new ValidationError(def.name, `Unknown param type '${def.type}'`)
    }
  }

  return result
}
