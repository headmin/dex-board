/**
 * Firehose fleetd info queries.
 *
 * Source: alt ClickHouse → fleetd_info (materialized from osquery result logs)
 */
import type { QueryConfig } from '../types'

export const firehoseFleetdQueries: QueryConfig[] = [
  {
    name: 'firehose.fleetd.versions',
    domain: 'software',
    client: 'alt',
    description: 'Fleet agent version distribution',
    params: [],
    sql: `
      SELECT
        argMax(version, timestamp) AS orbit_version,
        argMax(osquery_version, timestamp) AS osquery_version,
        argMax(desktop_version, timestamp) AS desktop_version,
        count() AS device_count
      FROM fleetd_info
      GROUP BY host_id
    `,
  },
  {
    name: 'firehose.fleetd.errors',
    domain: 'software',
    client: 'alt',
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
    client: 'alt',
    description: 'Fleet-wide fleetd summary',
    params: [],
    sql: `
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
        GROUP BY host_id
      )
    `,
  },
  {
    name: 'firehose.fleetd.uptime',
    domain: 'software',
    client: 'alt',
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
