/**
 * Firehose app adoption gap queries.
 *
 * Source: alt ClickHouse → adoption_gap
 * (materialized from dex-queries.yml "adoption gap" — app recency check)
 */
import type { QueryConfig } from '../types'

export const firehoseAdoptionQueries: QueryConfig[] = [
  {
    name: 'firehose.adoption.summary',
    domain: 'software',
    client: 'alt',
    description: 'Fleet app adoption overview: usage tier counts',
    params: [],
    sql: `
      SELECT
        countDistinct(host_id) AS total_devices,
        countDistinct(bundle_identifier) AS unique_apps,
        countIf(usage_tier = 'active_today') AS active_today,
        countIf(usage_tier = 'active_week') AS active_week,
        countIf(usage_tier = 'stale_30d') AS stale_30d,
        countIf(usage_tier = 'stale_90d') AS stale_90d,
        countIf(usage_tier = 'stale_90d_plus') AS stale_90d_plus,
        countIf(usage_tier = 'never_opened') AS never_opened
      FROM adoption_gap
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM adoption_gap GROUP BY host_id
      )
    `,
  },
  {
    name: 'firehose.adoption.tier_distribution',
    domain: 'software',
    client: 'alt',
    description: 'App count by usage tier',
    params: [],
    sql: `
      SELECT
        usage_tier,
        count() AS app_count,
        countDistinct(host_id) AS device_count,
        countDistinct(bundle_identifier) AS unique_apps
      FROM adoption_gap
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM adoption_gap GROUP BY host_id
      )
      GROUP BY usage_tier
      ORDER BY app_count DESC
    `,
  },
  {
    name: 'firehose.adoption.stale_apps',
    domain: 'software',
    client: 'alt',
    description: 'Most stale apps across fleet (longest since last opened)',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 200, default: 50 },
    ],
    sql: `
      SELECT
        app_name,
        bundle_identifier,
        any(version) AS version,
        round(avg(days_since_opened), 0) AS avg_days_stale,
        max(days_since_opened) AS max_days_stale,
        countDistinct(host_id) AS installed_on,
        any(usage_tier) AS usage_tier
      FROM adoption_gap
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM adoption_gap GROUP BY host_id
      )
        AND days_since_opened > 0
      GROUP BY app_name, bundle_identifier
      ORDER BY avg_days_stale DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.adoption.per_device',
    domain: 'software',
    client: 'alt',
    description: 'App adoption status for a specific device',
    params: [
      { name: 'hostId', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        app_name,
        bundle_identifier,
        version,
        category,
        path,
        days_since_opened,
        usage_tier
      FROM adoption_gap
      WHERE host_id = {filterHostId:String}
        AND timestamp = (SELECT max(timestamp) FROM adoption_gap WHERE host_id = {filterHostId:String})
      ORDER BY days_since_opened DESC
    `,
  },
  {
    name: 'firehose.adoption.by_app',
    domain: 'software',
    client: 'alt',
    description: 'Usage across fleet for a specific app',
    params: [
      { name: 'bundleId', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        host_id,
        hostname,
        version,
        days_since_opened,
        usage_tier,
        timestamp
      FROM adoption_gap
      WHERE bundle_identifier = {filterBundleId:String}
        AND (host_id, timestamp) IN (
          SELECT host_id, max(timestamp) FROM adoption_gap GROUP BY host_id
        )
      ORDER BY days_since_opened DESC
    `,
  },
]
