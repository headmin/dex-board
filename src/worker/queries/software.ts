/**
 * Software domain queries.
 *
 * Covers: app usage stats, top/stale apps, patch velocity,
 * daily contribution grid, per-device apps/patches, and
 * software usage signals for Experience Score.
 */
import type { QueryConfig } from '../types'

/** System apps to exclude from usage analytics */
const SYSTEM_APPS_CLAUSE = `AND app_name NOT IN (
  'Finder', 'loginwindow', 'WindowServer', 'SystemUIServer',
  'Dock', 'Control Center', 'Spotlight', 'Installer',
  'System Preferences', 'System Settings', 'AirPlayUIAgent'
)`

export const softwareQueries: QueryConfig[] = [
  {
    name: 'software.top_apps',
    domain: 'software',
    description: 'Top N apps by device count (for filter dropdown)',
    params: [
      { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 50, default: 20 },
    ],
    sql: `
      SELECT app_name, count() AS cnt
      FROM dex_software_usage
      WHERE {{TIME_FILTER}} AND app_name != ''
      GROUP BY app_name ORDER BY cnt DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'software.daily_grid',
    domain: 'software',
    description: 'Daily software usage counts for contribution grid',
    params: [
      { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
      { name: 'appName', type: 'string' as const, required: false },
    ],
    sql: `
      SELECT
        formatDateTime(toDate(event_time), '%Y-%m-%d') AS date,
        uniqExact(app_name) AS app_count,
        uniqExact(host_identifier) AS host_count
      FROM dex_software_usage
      WHERE {{TIME_FILTER}} AND app_name != ''
        {{FILTERS}}
      GROUP BY toDate(event_time)
      ORDER BY toDate(event_time)
    `,
  },
  {
    name: 'software.usage_stats',
    domain: 'software',
    description: 'App usage category percentages (stale/daily)',
    params: [],
    sql: `
      SELECT
        countIf(usage_category = 'stale' OR usage_category = 'never') * 100.0 / count() AS stale_pct,
        countIf(usage_category = 'daily') * 100.0 / count() AS daily_pct
      FROM dex_app_usage
      WHERE 1=1 ${SYSTEM_APPS_CLAUSE}
    `,
  },
  {
    name: 'software.top_active',
    domain: 'software',
    description: 'Most actively used apps',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 20, default: 8 },
    ],
    sql: `
      SELECT
        app_name,
        count(DISTINCT host_identifier) AS device_count,
        countIf(usage_category = 'daily') AS daily_count
      FROM dex_app_usage
      WHERE 1=1 ${SYSTEM_APPS_CLAUSE}
      GROUP BY app_name
      HAVING daily_count > 0
      ORDER BY device_count DESC, daily_count DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'software.stale_apps',
    domain: 'software',
    description: 'Least used / stale apps',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 20, default: 8 },
    ],
    sql: `
      SELECT
        app_name,
        countIf(usage_category = 'stale' OR usage_category = 'never') AS stale_count,
        round(avg(days_since_opened)) AS avg_days
      FROM dex_app_usage
      WHERE usage_category IN ('stale', 'never') ${SYSTEM_APPS_CLAUSE}
      GROUP BY app_name
      ORDER BY stale_count DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'software.app_drill',
    domain: 'software',
    description: 'Per-device usage details for a specific app',
    params: [
      { name: 'appName', type: 'string' as const, required: true },
      { name: 'usageCategory', type: 'string' as const, required: false },
    ],
    sql: `
      SELECT
        a.host_identifier,
        d.hostname,
        a.app_version,
        a.usage_category,
        a.days_since_opened
      FROM dex_app_usage a
      LEFT JOIN dex_devices d ON a.host_identifier = d.host_identifier
      WHERE a.app_name = {appName:String}
      ORDER BY a.days_since_opened DESC
    `,
  },
  {
    name: 'software.patch_velocity',
    domain: 'software',
    description: 'Fleet patch speed stats (avg/P90 days to patch)',
    params: [],
    sql: `
      SELECT
        avg(days_to_patch) AS avg_lag,
        quantile(0.9)(days_to_patch) AS p90_lag
      FROM dex_patch_events
      WHERE event_time >= now() - INTERVAL 30 DAY
    `,
  },
  {
    name: 'software.patch_summary',
    domain: 'software',
    description: 'Latest patch summary per software (currency, velocity)',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 20, default: 8 },
    ],
    sql: `
      SELECT
        software_name,
        pct_current,
        avg_days_to_patch,
        latest_version
      FROM dex_patch_summary_daily
      WHERE day = (SELECT max(day) FROM dex_patch_summary_daily)
      ORDER BY pct_current ASC
      {{LIMIT}}
    `,
  },
  {
    name: 'software.os_currency',
    domain: 'software',
    description: 'OS currency percentage (macOS on latest)',
    params: [
      { name: 'softwareName', type: 'string' as const, required: false, default: 'macOS' },
    ],
    sql: `
      SELECT pct_current
      FROM dex_patch_summary_daily
      WHERE software_name = {softwareName:String}
      ORDER BY day DESC
      LIMIT 1
    `,
  },
  {
    name: 'software.device_apps',
    domain: 'software',
    description: 'Apps installed on a specific device',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT app_name, app_version, usage_category, days_since_opened
      FROM dex_app_usage
      WHERE host_identifier = {filterHostId:String}
      ORDER BY days_since_opened DESC
    `,
  },
  {
    name: 'software.device_patches',
    domain: 'software',
    description: 'Patch events for a specific device',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 50, default: 20 },
    ],
    sql: `
      SELECT
        patch_type, software_name, old_version, new_version,
        patch_available_date, patch_applied_date, days_to_patch
      FROM dex_patch_events
      WHERE host_identifier = {filterHostId:String}
      ORDER BY event_time DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'software.device_patch_avg',
    domain: 'software',
    description: 'Average patch lag per software for a device (compare view)',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT software_name, avg(days_to_patch) AS avg_lag
      FROM dex_patch_events
      WHERE host_identifier = {filterHostId:String}
      GROUP BY software_name
    `,
  },
]
