/**
 * Firehose running apps queries.
 *
 * Source: alt ClickHouse → running_apps (materialized from osquery result logs)
 */
import type { QueryConfig } from '../types'

export const firehoseAppsQueries: QueryConfig[] = [
  {
    name: 'firehose.apps.top',
    domain: 'processes',
    client: 'alt',
    description: 'Top apps by average memory usage across fleet',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 100, default: 20 },
    ],
    sql: `
      SELECT
        app_name,
        bundle_identifier,
        round(avg(memory_mb), 1) AS avg_memory_mb,
        round(max(memory_mb), 1) AS max_memory_mb,
        round(avg(threads), 0) AS avg_threads,
        countDistinct(host_id) AS device_count,
        count() AS sample_count
      FROM running_apps
      WHERE app_name != ''
      GROUP BY app_name, bundle_identifier
      ORDER BY avg_memory_mb DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.apps.per_device',
    domain: 'processes',
    client: 'alt',
    description: 'Latest running apps for a specific device',
    params: [
      { name: 'hostId', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        app_name,
        bundle_identifier,
        max(memory_mb) AS memory_mb,
        max(threads) AS threads,
        max(pid) AS pid,
        any(path) AS path
      FROM running_apps
      WHERE host_id = {filterHostId:String}
        AND timestamp = (SELECT max(timestamp) FROM running_apps WHERE host_id = {filterHostId:String})
      GROUP BY app_name, bundle_identifier
      ORDER BY memory_mb DESC
    `,
  },
  {
    name: 'firehose.apps.memory_hogs',
    domain: 'processes',
    client: 'alt',
    description: 'Heaviest apps by peak memory across all devices',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 50, default: 10 },
    ],
    sql: `
      SELECT
        app_name,
        hostname,
        host_id,
        max(memory_mb) AS peak_memory_mb,
        argMax(threads, memory_mb) AS threads_at_peak,
        argMax(timestamp, memory_mb) AS peak_time
      FROM running_apps
      WHERE app_name != ''
      GROUP BY app_name, hostname, host_id
      ORDER BY peak_memory_mb DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.apps.fleet_summary',
    domain: 'processes',
    client: 'alt',
    description: 'Fleet-wide app summary stats',
    params: [],
    sql: `
      SELECT
        countDistinct(app_name) AS unique_apps,
        countDistinct(host_id) AS unique_hosts,
        round(avg(memory_mb), 1) AS avg_app_memory_mb,
        round(quantile(0.95)(memory_mb), 1) AS p95_memory_mb,
        count() AS total_samples
      FROM running_apps
      WHERE app_name != ''
    `,
  },
]
