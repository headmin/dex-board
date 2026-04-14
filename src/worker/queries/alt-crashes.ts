/**
 * Firehose crash queries.
 *
 * Source: alt ClickHouse → crash_summary, crash_detail
 * (materialized from dex-queries.yml "crash summary" + "crash detail")
 */
import type { QueryConfig } from '../types'

export const firehoseCrashQueries: QueryConfig[] = [
  {
    name: 'firehose.crashes.summary',
    domain: 'software',
    client: 'alt',
    description: 'Fleet crash overview: total crashes, severity distribution, top crashers',
    params: [],
    sql: `
      SELECT
        countDistinct(host_id) AS devices_with_crashes,
        sum(crash_count_7d) AS total_crashes_7d,
        countDistinctIf(host_id, crash_severity = 'critical') AS critical_devices,
        countDistinctIf(host_id, crash_severity = 'elevated') AS elevated_devices,
        countDistinctIf(host_id, crash_severity = 'recurring') AS recurring_devices
      FROM crash_summary
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM crash_summary GROUP BY host_id
      )
    `,
  },
  {
    name: 'firehose.crashes.top_crashers',
    domain: 'software',
    client: 'alt',
    description: 'Top crashing app identifiers across fleet',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 50, default: 25 },
    ],
    sql: `
      SELECT
        crashed_identifier,
        any(app_name) AS app_name,
        sum(crash_count_7d) AS total_crashes_7d,
        countDistinct(host_id) AS affected_devices,
        max(last_crash_at) AS last_crash,
        argMax(crash_severity, crash_count_7d) AS worst_severity
      FROM crash_summary
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM crash_summary GROUP BY host_id
      )
      GROUP BY crashed_identifier
      ORDER BY total_crashes_7d DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.crashes.detail',
    domain: 'software',
    client: 'alt',
    description: 'Crash detail events for a specific identifier',
    params: [
      { name: 'identifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        host_id,
        hostname,
        crash_datetime,
        exception_type,
        exception_codes,
        responsible,
        crashed_process_path,
        app_version,
        crash_rank,
        timestamp
      FROM crash_detail
      WHERE crashed_identifier = {identifier:String}
      ORDER BY crash_datetime DESC
    `,
  },
  {
    name: 'firehose.crashes.per_device',
    domain: 'software',
    client: 'alt',
    description: 'Crash summary for a specific device',
    params: [
      { name: 'hostId', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        crashed_identifier,
        app_name,
        bundle_identifier,
        app_version,
        crash_count_7d,
        last_crash_at,
        crash_severity,
        app_match_status
      FROM crash_summary
      WHERE host_id = {filterHostId:String}
        AND timestamp = (SELECT max(timestamp) FROM crash_summary WHERE host_id = {filterHostId:String})
      ORDER BY crash_count_7d DESC
    `,
  },
  {
    name: 'firehose.crashes.severity_distribution',
    domain: 'software',
    client: 'alt',
    description: 'Crash severity distribution across fleet',
    params: [],
    sql: `
      SELECT
        crash_severity,
        count() AS crash_count,
        countDistinct(host_id) AS device_count
      FROM crash_summary
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM crash_summary GROUP BY host_id
      )
      GROUP BY crash_severity
      ORDER BY crash_count DESC
    `,
  },
]
