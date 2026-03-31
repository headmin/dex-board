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
  CLICKHOUSE_URL: string
  CLICKHOUSE_USER: string
  CLICKHOUSE_PASSWORD: string
  CLICKHOUSE_DATABASE: string
  ASSETS: Fetcher
  CF_ACCESS_TEAM_DOMAIN?: string
  CF_ACCESS_AUD?: string
  BASIC_AUTH_USER?: string
  BASIC_AUTH_PASS?: string
}
