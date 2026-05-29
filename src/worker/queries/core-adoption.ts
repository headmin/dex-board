/**
 * Firehose app adoption gap queries.
 *
 * Source: alt ClickHouse → adoption_gap
 * (materialized from dex-queries.yml "adoption gap" — app recency check)
 */
import type { QueryConfig } from '../types'
import { FILTERED_HOSTS_CTE, FILTER_PARAMS } from './core-filters'

export const firehoseAdoptionQueries: QueryConfig[] = [
  {
    name: 'firehose.adoption.summary',
    domain: 'software',
    client: 'core',
    description: 'Fleet app adoption overview: usage tier counts',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
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
      AND host_id IN (SELECT host_id FROM filtered_hosts)
    `,
  },
  {
    name: 'firehose.adoption.tier_distribution',
    domain: 'software',
    client: 'core',
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
    client: 'core',
    description: 'Most stale apps across fleet (longest since last opened); excludes OS-shipped utilities and nested helper bundles by default',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 200, default: 50 },
      // 'no' (default) drops two categories of noise:
      //   - /System/* paths — OS-shipped utilities that ship with macOS and
      //     never get manually opened (Mail, FaceTime, Calculator, etc.).
      //   - paths containing '.app/Contents/' — nested helpers inside other
      //     app bundles (LoginItems, Helpers, PlugIns, XPCServices). These
      //     always look "stale" because they're invisible internals of apps
      //     the user actually uses.
      // User-facing Apple apps in /Applications proper (Pages, iMovie,
      // GarageBand, SF Symbols, Apple Configurator, Mac Evaluation Utility,
      // Xcode) stay in the list — they're legitimate shelfware candidates.
      // 'yes' shows everything including OS utilities and nested helpers.
      { name: 'includeNoise', type: 'enum' as const, values: ['no', 'yes'], required: false, default: 'no' },
    ],
    sql: `
      SELECT
        app_name,
        bundle_identifier,
        any(version) AS version,
        any(path) AS app_path,
        round(avg(days_since_opened), 0) AS avg_days_stale,
        max(days_since_opened) AS max_days_stale,
        countDistinct(host_id) AS installed_on,
        any(usage_tier) AS usage_tier
      FROM adoption_gap
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM adoption_gap GROUP BY host_id
      )
        AND days_since_opened > 0
        AND (
          {includeNoise:String} = 'yes'
          OR (
            NOT startsWith(path, '/System/')
            AND position(path, '.app/Contents/') = 0
          )
        )
      GROUP BY app_name, bundle_identifier
      ORDER BY avg_days_stale DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.adoption.per_device',
    domain: 'software',
    client: 'core',
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
    client: 'core',
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
      WHERE bundle_identifier = {bundleId:String}
        AND (host_id, timestamp) IN (
          SELECT host_id, max(timestamp) FROM adoption_gap GROUP BY host_id
        )
      ORDER BY days_since_opened DESC
    `,
  },
  {
    name: 'firehose.adoption.license_waste',
    domain: 'software',
    client: 'core',
    description: 'Apps installed but unused (stale_90d+/never opened) — license/seat waste',
    params: [
      ...FILTER_PARAMS,
      { name: 'minInstalls', type: 'number' as const, required: false, min: 1, max: 1000, default: 3 },
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 100, default: 25 },
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE},
      latest AS (
        SELECT *
        FROM adoption_gap
        WHERE host_id IN (SELECT host_id FROM filtered_hosts)
          -- Exclude free Apple built-ins: no license cost, not IT-deployed, so
          -- they're not "license waste" — just noise in a cost-focused view.
          AND bundle_identifier NOT LIKE 'com.apple.%'
          AND (host_id, timestamp) IN (
            SELECT host_id, max(timestamp) FROM adoption_gap GROUP BY host_id
          )
      )
      SELECT
        app_name,
        any(category)                                                                       AS category,
        countDistinct(host_id)                                                              AS installs,
        countDistinctIf(host_id, usage_tier IN ('stale_90d', 'stale_90d_plus', 'never_opened')) AS unused_hosts,
        round(100.0 * countDistinctIf(host_id, usage_tier IN ('stale_90d', 'stale_90d_plus', 'never_opened'))
              / countDistinct(host_id), 0)                                                  AS pct_unused
      FROM latest
      GROUP BY app_name
      HAVING installs >= {minInstalls:UInt32}
      ORDER BY unused_hosts DESC, installs DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.adoption.waste_summary',
    domain: 'software',
    client: 'core',
    description: 'Fleet-wide license-waste totals: unused install-seats and apps affected',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE},
      latest AS (
        SELECT *
        FROM adoption_gap
        WHERE host_id IN (SELECT host_id FROM filtered_hosts)
          -- Exclude free Apple built-ins: no license cost, not IT-deployed, so
          -- they're not "license waste" — just noise in a cost-focused view.
          AND bundle_identifier NOT LIKE 'com.apple.%'
          AND (host_id, timestamp) IN (
            SELECT host_id, max(timestamp) FROM adoption_gap GROUP BY host_id
          )
      )
      SELECT
        count()                                                                AS total_seats,
        countIf(usage_tier IN ('stale_90d', 'stale_90d_plus', 'never_opened')) AS unused_seats,
        countDistinctIf(app_name, usage_tier IN ('stale_90d', 'stale_90d_plus', 'never_opened')) AS apps_with_waste,
        round(100.0 * countIf(usage_tier IN ('stale_90d', 'stale_90d_plus', 'never_opened')) / count(), 0) AS pct_unused
      FROM latest
    `,
  },
]
