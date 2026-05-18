/** Parameter type for a registered query */
export interface QueryParam {
  name: string
  type: 'string' | 'number' | 'enum'
  required: boolean
  values?: string[]       // For enum type: allowed values
  pattern?: string        // For string type: regex pattern
  min?: number            // For number type
  max?: number            // For number type
  default?: string | number
}

/** A registered query in the registry */
export interface QueryConfig {
  /** Unique name like "health.summary" */
  name: string
  /** Domain grouping: health, security, processes, devices, audit, software, network, scores */
  domain: string
  /** Which ClickHouse instance to query: 'default' (Fleet logs) or 'core' (firehose) */
  client?: 'default' | 'core'
  /** Parameterized SQL with {name:Type} ClickHouse placeholders and {{FILTERS}} macro */
  sql: string
  /** Parameter definitions for validation */
  params: QueryParam[]
  /** Human-readable description */
  description: string
}

/** Validated filter parameters from the frontend */
export interface FilterParams {
  timeRange?: string
  os?: string
  model?: string
  search?: string
  encryption?: string
  ramTier?: string
  hostIdentifier?: string
  limit?: number
}

/** API request body */
export interface QueryRequest {
  query: string
  params?: Record<string, unknown>
}

/** API success response */
export interface QueryResponse {
  data: Record<string, unknown>[]
  meta: {
    query: string
    rows: number
    duration_ms: number
  }
}

/** API error response */
export interface QueryError {
  error: {
    code: 'UNKNOWN_QUERY' | 'INVALID_PARAM' | 'QUERY_ERROR' | 'VALIDATION_ERROR'
    message: string
    param?: string
  }
}

/** Cloudflare Worker environment bindings */
export interface Env {
  // ─── Fleet-logs ClickHouse (powers the / Dashboard, security, processes) ───
  CLICKHOUSE_URL: string
  CLICKHOUSE_USER: string
  CLICKHOUSE_PASSWORD: string
  CLICKHOUSE_DATABASE: string
  // ─── Firehose ClickHouse (powers /devices, /insights, /reports, scoring) ───
  FIREHOSE_CLICKHOUSE_URL?: string
  FIREHOSE_CLICKHOUSE_USER?: string
  FIREHOSE_CLICKHOUSE_PASSWORD?: string
  FIREHOSE_CLICKHOUSE_DATABASE?: string
  ASSETS: Fetcher
  CF_ACCESS_TEAM_DOMAIN?: string
  CF_ACCESS_AUD?: string
  BASIC_AUTH_USER?: string
  BASIC_AUTH_PASS?: string
  /**
   * Base URL for the Fleet instance this dashboard deep-links into.
   * Exposed via GET /api/config to the dashboard. No trailing slash.
   * Set as a Cloudflare secret: `wrangler secret put FLEET_URL`.
   */
  FLEET_URL?: string
}
