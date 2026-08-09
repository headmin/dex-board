/**
 * Firehose fleetd info queries.
 *
 * Source: alt ClickHouse → fleetd_info (materialized from osquery result logs)
 */
import type { QueryConfig } from '../types'
import { FILTERED_HOSTS_CTE, FILTER_PARAMS } from './core-filters'

export const firehoseFleetdQueries: QueryConfig[] = [
  {
    name: 'firehose.fleetd.checkin_status',
    domain: 'fleetd',
    client: 'core',
    description: 'Telemetry reporting freshness: hosts by last-report recency + data lag (anchored to device_health, the table proven to be flowing)',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE},
      last_seen AS (
        SELECT host_id, max(timestamp) AS ts
        FROM device_health
        WHERE host_id IN (SELECT host_id FROM filtered_hosts)
        GROUP BY host_id
      )
      SELECT
        count()                                              AS total_hosts,
        countIf(ts >= now() - INTERVAL 1 HOUR)               AS within_1h,
        countIf(ts >= now() - INTERVAL 24 HOUR)              AS within_24h,
        countIf(ts >= now() - INTERVAL 7 DAY)                AS within_7d,
        countIf(ts <  now() - INTERVAL 7 DAY)                AS stale_7d,
        toString(max(ts))                                    AS newest_report,
        toString(min(ts))                                    AS oldest_report,
        round(dateDiff('minute', max(ts), now()) / 60.0, 1)  AS freshest_lag_hours
      FROM last_seen
    `,
  },
  {
    name: 'firehose.fleetd.versions',
    domain: 'software',
    client: 'core',
    description: 'Fleet agent version distribution',
    params: [],
    sql: `
      SELECT
        orbit_version,
        osquery_version,
        desktop_version,
        count() AS device_count
      FROM (
        SELECT host_id,
          argMax(version, timestamp) AS orbit_version,
          argMax(osquery_version, timestamp) AS osquery_version,
          argMax(desktop_version, timestamp) AS desktop_version
        FROM fleetd_info
        GROUP BY host_id
      )
      GROUP BY orbit_version, osquery_version, desktop_version
      ORDER BY device_count DESC
    `,
  },
  {
    name: 'firehose.fleetd.errors',
    domain: 'software',
    client: 'core',
    description: 'Devices with recent fleetd errors',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 100, default: 20 },
    ],
    sql: `
      SELECT host_id, hostname, version, platform, last_error, last_seen
      FROM (
        SELECT
          host_id,
          argMax(hostname, timestamp) AS hostname,
          argMax(version, timestamp) AS version,
          argMax(platform, timestamp) AS platform,
          argMax(last_error, timestamp) AS last_error,
          max(timestamp) AS last_seen
        FROM fleetd_info
        GROUP BY host_id
      )
      WHERE last_error != ''
      ORDER BY last_seen DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.fleetd.summary',
    domain: 'software',
    client: 'core',
    description: 'Fleet-wide fleetd summary',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        count() AS total_hosts,
        countIf(enrolled = true) AS enrolled_hosts,
        uniqExact(version) AS unique_versions,
        round(avg(up_sec) / 3600, 1) AS avg_uptime_hours
      FROM (
        SELECT
          host_id,
          argMax(enrolled, timestamp) AS enrolled,
          argMax(version, timestamp) AS version,
          argMax(uptime_seconds, timestamp) AS up_sec
        FROM fleetd_info
        WHERE host_id IN (SELECT host_id FROM filtered_hosts)
        GROUP BY host_id
      )
    `,
  },
  {
    name: 'firehose.fleetd.uptime',
    domain: 'software',
    client: 'core',
    description: 'Device uptime distribution',
    params: [],
    sql: `
      SELECT
        multiIf(
          up < 3600, '< 1h',
          up < 86400, '1h - 1d',
          up < 604800, '1d - 7d',
          up < 2592000, '7d - 30d',
          '30d+'
        ) AS uptime_bucket,
        count() AS device_count
      FROM (
        SELECT host_id, argMax(uptime_seconds, timestamp) AS up
        FROM fleetd_info
        GROUP BY host_id
      )
      GROUP BY uptime_bucket
      ORDER BY
        CASE uptime_bucket
          WHEN '< 1h' THEN 1
          WHEN '1h - 1d' THEN 2
          WHEN '1d - 7d' THEN 3
          WHEN '7d - 30d' THEN 4
          ELSE 5
        END
    `,
  },
]
