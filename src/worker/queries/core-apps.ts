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
    client: 'core',
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
    client: 'core',
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
    client: 'core',
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
    name: 'firehose.apps.daemon_inventory',
    domain: 'apps',
    client: 'core',
    description:
      'Fleet-wide presence of background apps and daemons that the adoption_gap pack misses ' +
      '(system services, helpers, security agents, etc.). Excludes Apple-shipped bundles.',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 200, default: 60 },
      { name: 'minHosts', type: 'number' as const, required: false, min: 1, max: 1000, default: 2 },
    ],
    sql: `
      WITH adoption_bundles AS (
        SELECT DISTINCT bundle_identifier
        FROM adoption_gap
        WHERE timestamp > now() - INTERVAL 14 DAY
          AND bundle_identifier != ''
      )
      SELECT
        app_name,
        bundle_identifier,
        any(path) AS path,
        countDistinct(host_id) AS hosts_running,
        max(toDate(timestamp)) AS last_seen,
        min(toDate(timestamp)) AS first_seen
      FROM running_apps
      WHERE timestamp > now() - INTERVAL 2 DAY
        AND bundle_identifier != ''
        AND bundle_identifier NOT LIKE 'com.apple.%'
        AND bundle_identifier NOT IN (SELECT bundle_identifier FROM adoption_bundles)
      GROUP BY app_name, bundle_identifier
      HAVING hosts_running >= {minHosts:UInt32}
      ORDER BY hosts_running DESC, app_name
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.apps.fleet_summary',
    domain: 'processes',
    client: 'core',
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
