/**
 * Filter builder — converts validated params into parameterized SQL clauses.
 *
 * This is the core security boundary: user input ONLY enters SQL through
 * ClickHouse's {name:Type} parameter binding. Time range and other structural
 * SQL elements use a closed allowlist — never user input.
 */

/** Map of time range values (hours) to SQL INTERVAL expressions. Closed allowlist. */
const TIME_INTERVALS: Record<string, string> = {
  '1': 'INTERVAL 1 HOUR',
  '6': 'INTERVAL 6 HOUR',
  '24': 'INTERVAL 1 DAY',
  '168': 'INTERVAL 7 DAY',
  '720': 'INTERVAL 30 DAY',
}

/** Map of time range to aggregation bucket expressions. Closed allowlist. */
const TIME_BUCKETS: Record<string, { expr: string; fmt: string }> = {
  '1': { expr: 'toStartOfFiveMinutes(event_time)', fmt: '%H:%M' },
  '6': { expr: 'toStartOfHour(event_time)', fmt: '%H:00' },
  '24': { expr: 'toStartOfHour(event_time)', fmt: '%H:00' },
  '168': { expr: 'toStartOfInterval(event_time, INTERVAL 4 HOUR)', fmt: '%m-%d %H:00' },
  '720': { expr: 'toStartOfDay(event_time)', fmt: '%m-%d' },
}

export interface FilterResult {
  /** ClickHouse {name:Type} parameter bindings */
  queryParams: Record<string, unknown>
  /** SQL INTERVAL expression for time range */
  timeInterval: string
  /** Time bucket expression + format string */
  timeBucket: { expr: string; fmt: string }
}

/**
 * Build parameter bindings from validated params.
 *
 * Filtering itself happens inside each query's SQL (FILTERED_HOSTS_CTE and
 * friends reference `{filter*:String}` placeholders directly) — this
 * function's job is to bind those placeholders, with '' defaults so
 * ClickHouse never sees an unbound parameter. The old clause-generation
 * path (`{{FILTERS}}` macro) had no remaining consumers and was removed.
 *
 * @param params - Validated params from param-validator
 * @returns Parameter bindings + time-range expressions (audit.ts macros)
 */
export function buildFilters(params: Record<string, string | number>): FilterResult {
  const queryParams: Record<string, unknown> = {}

  // Time range — always uses allowlist, never interpolates user input
  const timeRange = String(params.timeRange || '24')
  const timeInterval = TIME_INTERVALS[timeRange] || TIME_INTERVALS['24']
  const timeBucket = TIME_BUCKETS[timeRange] || TIME_BUCKETS['24']

  // Firehose filter params always get defaults so ClickHouse binds every
  // {filter*:String} placeholder even when no filter is set.
  queryParams.filterSearch = params.search || ''
  queryParams.filterModel = params.model || ''
  queryParams.filterRamTier = params.ramTier || ''
  queryParams.filterOs = params.os || ''
  queryParams.filterTeam = params.team || ''
  // filterHostId too: list queries use `if({filterHostId:String} != '', …)`
  // to double as single-host lookups — unbound, ClickHouse rejects the query.
  queryParams.filterHostId = params.hostId || params.hostIdentifier || ''

  // Limit — parameterized
  if (params.limit) {
    queryParams.filterLimit = Number(params.limit)
  }

  return { queryParams, timeInterval, timeBucket }
}

/**
 * Inject filter clauses into a SQL template.
 *
 * Replaces these placeholders in the SQL:
 * - `{{TIME_FILTER}}` → `event_time > now() - INTERVAL N UNIT`
 * - `{{TIME_INTERVAL}}` → `INTERVAL 1 DAY` (raw, from allowlist)
 * - `{{TIME_BUCKET}}` → `toStartOfHour(event_time)` (raw, from allowlist)
 * - `{{TIME_FMT}}` → `%H:00` (raw, from allowlist)
 * - `{{LIMIT}}` → `LIMIT {filterLimit:UInt32}` or empty
 */
export function injectFilters(sql: string, filters: FilterResult): string {
  let result = sql

  result = result.replace(
    /\{\{TIME_FILTER\}\}/g,
    `event_time > now() - ${filters.timeInterval}`
  )
  result = result.replace(/\{\{TIME_INTERVAL\}\}/g, filters.timeInterval)
  result = result.replace(/\{\{TIME_BUCKET\}\}/g, filters.timeBucket.expr)
  result = result.replace(/\{\{TIME_FMT\}\}/g, filters.timeBucket.fmt)
  result = result.replace(
    /\{\{LIMIT\}\}/g,
    filters.queryParams.filterLimit ? 'LIMIT {filterLimit:UInt32}' : ''
  )

  return result
}
