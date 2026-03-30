/**
 * Query Registry — the central orchestrator.
 *
 * Holds all registered queries and provides:
 * - Lookup by name
 * - Parameter validation
 * - Filter building + SQL injection
 * - Execution via ClickHouse client
 */
import type { QueryConfig, Env } from './types'
import { validateParams, ValidationError } from './param-validator'
import { buildFilters, injectFilters } from './filter-builder'
import { executeQuery } from './clickhouse-client'

export class QueryRegistry {
  private queries = new Map<string, QueryConfig>()

  /** Register a query config. */
  register(config: QueryConfig): void {
    if (this.queries.has(config.name)) {
      throw new Error(`Duplicate query name: ${config.name}`)
    }
    this.queries.set(config.name, config)
  }

  /** Register multiple query configs at once. */
  registerAll(configs: QueryConfig[]): void {
    for (const config of configs) {
      this.register(config)
    }
  }

  /** Get a query config by name. Returns undefined if not found. */
  get(name: string): QueryConfig | undefined {
    return this.queries.get(name)
  }

  /** List all registered query names with descriptions. */
  list(): Array<{ name: string; domain: string; description: string }> {
    return Array.from(this.queries.values()).map((q) => ({
      name: q.name,
      domain: q.domain,
      description: q.description,
    }))
  }

  /** Number of registered queries. */
  get size(): number {
    return this.queries.size
  }

  /**
   * Execute a named query with the given params.
   *
   * Pipeline: lookup → validate → build filters → inject into SQL → execute
   *
   * @returns { data, meta } response object
   */
  async execute(
    name: string,
    rawParams: Record<string, unknown>,
    env: Env
  ): Promise<{ data: Record<string, unknown>[]; meta: { query: string; rows: number; duration_ms: number } }> {
    // 1. Lookup
    const config = this.queries.get(name)
    if (!config) {
      throw new RegistryError('UNKNOWN_QUERY', `Query '${name}' not found in registry`)
    }

    const start = Date.now()

    // 2. Validate params
    let validated: Record<string, string | number>
    try {
      validated = validateParams(rawParams, config.params)
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new RegistryError('INVALID_PARAM', err.message, err.param)
      }
      throw err
    }

    // 3. Build filters
    const filters = buildFilters(validated)

    // 4. Inject into SQL template
    const sql = injectFilters(config.sql, filters)

    // 5. Merge query params (from filter builder + any direct params in the SQL)
    const allParams = { ...filters.queryParams }
    // Add any validated params that are used directly as {name:Type} in the SQL
    for (const [key, val] of Object.entries(validated)) {
      if (!allParams[`filter${key.charAt(0).toUpperCase()}${key.slice(1)}`]) {
        allParams[key] = val
      }
    }

    // 6. Execute
    const data = await executeQuery(sql, allParams, env)
    const duration_ms = Date.now() - start

    return {
      data,
      meta: { query: name, rows: data.length, duration_ms },
    }
  }
}

/** Structured error for registry operations. */
export class RegistryError extends Error {
  code: 'UNKNOWN_QUERY' | 'INVALID_PARAM' | 'QUERY_ERROR'
  param?: string

  constructor(code: 'UNKNOWN_QUERY' | 'INVALID_PARAM' | 'QUERY_ERROR', message: string, param?: string) {
    super(message)
    this.code = code
    this.param = param
  }
}

// ─── Singleton registry instance ───────────────────────────
export const registry = new QueryRegistry()
