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
  /** WHERE clause fragments (without leading AND) */
  clauses: string[]
  /** ClickHouse {name:Type} parameter bindings */
  queryParams: Record<string, unknown>
  /** SQL INTERVAL expression for time range */
  timeInterval: string
  /** Time bucket expression + format string */
  timeBucket: { expr: string; fmt: string }
}

/**
 * Build parameterized filter clauses from validated params.
 *
 * @param params - Validated params from param-validator
 * @returns Filter clauses + parameter bindings
 */
export function buildFilters(params: Record<string, string | number>): FilterResult {
  const clauses: string[] = []
  const queryParams: Record<string, unknown> = {}

  // Time range — always uses allowlist, never interpolates user input
  const timeRange = String(params.timeRange || '24')
  const timeInterval = TIME_INTERVALS[timeRange] || TIME_INTERVALS['24']
  const timeBucket = TIME_BUCKETS[timeRange] || TIME_BUCKETS['24']

  // OS filter — parameterized
  if (params.os) {
    clauses.push("AND os_name = {filterOs:String}")
    queryParams.filterOs = params.os
  }

  // Model filter — parameterized
  if (params.model) {
    clauses.push("AND hardware_model = {filterModel:String}")
    queryParams.filterModel = params.model
  }

  // Search text — parameterized LIKE
  if (params.search) {
    clauses.push(
      "AND (hostname LIKE {filterSearch:String} OR serial_number LIKE {filterSearch:String} OR hardware_model LIKE {filterSearch:String})"
    )
    queryParams.filterSearch = `%${params.search}%`
  }

  // Encryption filter — uses a subquery with fixed SQL (no user input in SQL)
  if (params.encryption === 'encrypted') {
    clauses.push(
      "AND host_identifier IN (SELECT host_identifier FROM dex_security_posture WHERE disk_encrypted = '1' GROUP BY host_identifier HAVING argMax(disk_encrypted, event_time) = '1')"
    )
  } else if (params.encryption === 'not-encrypted') {
    clauses.push(
      "AND host_identifier IN (SELECT host_identifier FROM dex_security_posture WHERE disk_encrypted != '1' GROUP BY host_identifier HAVING argMax(disk_encrypted, event_time) != '1')"
    )
  }

  // RAM tier filter — parameterized
  if (params.ramTier) {
    clauses.push(
      "AND host_identifier IN (SELECT DISTINCT host_identifier FROM dex_device_scores_hourly WHERE ram_tier = {filterRamTier:String} AND hour >= now() - INTERVAL 1 DAY)"
    )
    queryParams.filterRamTier = params.ramTier
  }

  // Host identifier — parameterized (for device drill-down)
  if (params.hostIdentifier) {
    clauses.push("AND host_identifier = {filterHostId:String}")
    queryParams.filterHostId = params.hostIdentifier
  }

  // Host ID — firehose queries use host_id column
  if (params.hostId) {
    queryParams.filterHostId = params.hostId
  }

  // Ensure firehose filter params always have defaults
  if (!queryParams.filterSearch) queryParams.filterSearch = params.search || ''
  if (!queryParams.filterModel) queryParams.filterModel = params.model || ''
  if (!queryParams.filterRamTier) queryParams.filterRamTier = params.ramTier || ''

  // Limit — parameterized
  if (params.limit) {
    queryParams.filterLimit = Number(params.limit)
  }

  return { clauses, queryParams, timeInterval, timeBucket }
}

/**
 * Inject filter clauses into a SQL template.
 *
 * Replaces these placeholders in the SQL:
 * - `{{TIME_FILTER}}` → `event_time > now() - INTERVAL N UNIT`
 * - `{{FILTERS}}` → `AND os_name = {filterOs:String} AND ...`
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
  result = result.replace(/\{\{FILTERS\}\}/g, filters.clauses.join(' '))
  result = result.replace(/\{\{TIME_INTERVAL\}\}/g, filters.timeInterval)
  result = result.replace(/\{\{TIME_BUCKET\}\}/g, filters.timeBucket.expr)
  result = result.replace(/\{\{TIME_FMT\}\}/g, filters.timeBucket.fmt)
  result = result.replace(
    /\{\{LIMIT\}\}/g,
    filters.queryParams.filterLimit ? 'LIMIT {filterLimit:UInt32}' : ''
  )

  return result
}
