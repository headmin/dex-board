/**
 * Scores domain queries.
 *
 * Covers: Experience Score metrics, category breakdowns, sparklines,
 * grade distribution, dimension breakdowns, biggest movers,
 * platform cohort benchmarks, device score history, and
 * GitOps timeline score data.
 */
import type { QueryConfig } from '../types'

const COMMON_PARAMS = [
  { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
  { name: 'os', type: 'string' as const, required: false },
  { name: 'model', type: 'string' as const, required: false },
  { name: 'search', type: 'string' as const, required: false },
  { name: 'encryption', type: 'enum' as const, values: ['', 'encrypted', 'not-encrypted'], required: false, default: '' },
  { name: 'ramTier', type: 'string' as const, required: false },
]

/** Score columns selected in category queries */
const SCORE_COLS = `
  avg(device_health_score) AS avg_device_health,
  avg(performance_score) AS avg_performance,
  avgIf(network_score, network_score > 0) AS avg_network,
  avg(security_score) AS avg_security,
  avg(software_score) AS avg_software,
  avg(composite_score) AS avg_composite
`

export const scoreQueries: QueryConfig[] = [
  // ─── Fleet scores (Experience Score page) ──────────────
  {
    name: 'scores.fleet_summary',
    domain: 'scores',
    description: 'Fleet composite score average and device count',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        avg(composite_score) AS avg_score,
        count(DISTINCT host_identifier) AS device_count
      FROM dex_device_scores_hourly
      WHERE hour >= now() - {{TIME_INTERVAL}} {{FILTERS}}
    `,
  },
  {
    name: 'scores.fleet_comparison',
    domain: 'scores',
    description: 'Fleet score for comparison period (previous window)',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT avg(composite_score) AS avg_score
      FROM dex_device_scores_hourly
      WHERE hour >= now() - 2 * {{TIME_INTERVAL}}
        AND hour < now() - {{TIME_INTERVAL}}
        {{FILTERS}}
    `,
  },
  {
    name: 'scores.fleet_sparkline',
    domain: 'scores',
    description: 'Daily composite score trend (30 days)',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        toDate(hour) AS day,
        avg(composite_score) AS score
      FROM dex_device_scores_hourly
      WHERE hour >= now() - INTERVAL 30 DAY {{FILTERS}}
      GROUP BY day
      ORDER BY day
    `,
  },
  {
    name: 'scores.categories',
    domain: 'scores',
    description: 'Per-category score averages',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT ${SCORE_COLS}
      FROM dex_device_scores_hourly
      WHERE hour >= now() - {{TIME_INTERVAL}} {{FILTERS}}
    `,
  },
  {
    name: 'scores.categories_comparison',
    domain: 'scores',
    description: 'Per-category score averages for comparison period',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT ${SCORE_COLS}
      FROM dex_device_scores_hourly
      WHERE hour >= now() - 2 * {{TIME_INTERVAL}}
        AND hour < now() - {{TIME_INTERVAL}}
        {{FILTERS}}
    `,
  },
  {
    name: 'scores.category_sparklines',
    domain: 'scores',
    description: 'Daily per-category score trends (30 days)',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        toDate(hour) AS day,
        ${SCORE_COLS}
      FROM dex_device_scores_hourly
      WHERE hour >= now() - INTERVAL 30 DAY {{FILTERS}}
      GROUP BY day
      ORDER BY day
    `,
  },
  {
    name: 'scores.grade_distribution',
    domain: 'scores',
    description: 'Grade A/B/C/D/F counts',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT composite_grade AS grade, count() AS cnt
      FROM dex_device_scores_hourly
      WHERE hour >= now() - {{TIME_INTERVAL}} {{FILTERS}}
      GROUP BY composite_grade
    `,
  },

  // ─── Dimension breakdowns ──────────────────────────────
  {
    name: 'scores.dimension_breakdown',
    domain: 'scores',
    description: 'Score breakdown by dimension (os, model, ram, team)',
    params: [
      ...COMMON_PARAMS,
      { name: 'dimension', type: 'enum' as const, values: ['os_name', 'hardware_model', 'ram_tier', 'team_id'], required: true },
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 50, default: 15 },
    ],
    sql: `
      SELECT
        toString({dimension:String}) AS name,
        avg(composite_score) AS score,
        count(DISTINCT host_identifier) AS count
      FROM dex_device_scores_hourly
      WHERE hour >= now() - {{TIME_INTERVAL}}
        AND toString({dimension:String}) != ''
        AND toString({dimension:String}) != '0'
        {{FILTERS}}
      GROUP BY name
      ORDER BY score DESC
      {{LIMIT}}
    `,
  },

  // ─── Biggest movers ────────────────────────────────────
  {
    name: 'scores.biggest_movers',
    domain: 'scores',
    description: 'Devices with largest score changes vs comparison period',
    params: [
      ...COMMON_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 20, default: 8 },
    ],
    sql: `
      WITH
        curr AS (
          SELECT host_identifier, avg(composite_score) AS score, any(composite_grade) AS grade
          FROM dex_device_scores_hourly
          WHERE hour >= now() - {{TIME_INTERVAL}} {{FILTERS}}
          GROUP BY host_identifier
        ),
        prev AS (
          SELECT host_identifier, avg(composite_score) AS score, any(composite_grade) AS grade
          FROM dex_device_scores_hourly
          WHERE hour >= now() - 2 * {{TIME_INTERVAL}}
            AND hour < now() - {{TIME_INTERVAL}} {{FILTERS}}
          GROUP BY host_identifier
        )
      SELECT
        c.host_identifier,
        d.hostname,
        d.hardware_model,
        c.grade AS curr_grade,
        p.grade AS prev_grade,
        round(c.score - p.score, 1) AS delta
      FROM curr c
      INNER JOIN prev p ON c.host_identifier = p.host_identifier
      LEFT JOIN dex_devices d ON c.host_identifier = d.host_identifier
      ORDER BY abs(c.score - p.score) DESC
      {{LIMIT}}
    `,
  },

  // ─── Per-device scores ─────────────────────────────────
  {
    name: 'scores.device_latest',
    domain: 'scores',
    description: 'Latest score snapshot for a single device',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        composite_score, composite_grade, lowest_category,
        categories_with_data, device_health_score, performance_score,
        network_score, security_score, software_score,
        os_name, hardware_model, ram_tier
      FROM dex_device_scores_hourly
      WHERE host_identifier = {filterHostId:String}
      ORDER BY hour DESC
      LIMIT 1
    `,
  },
  {
    name: 'scores.device_categories',
    domain: 'scores',
    description: 'Per-category averages for a device in a time window',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
      { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
    ],
    sql: `
      SELECT ${SCORE_COLS}
      FROM dex_device_scores_hourly
      WHERE host_identifier = {filterHostId:String}
        AND hour >= now() - {{TIME_INTERVAL}}
    `,
  },
  {
    name: 'scores.device_sparkline',
    domain: 'scores',
    description: '30-day score sparkline for a device',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        toDate(hour) AS day,
        avg(composite_score) AS score
      FROM dex_device_scores_hourly
      WHERE host_identifier = {filterHostId:String}
        AND hour >= now() - INTERVAL 30 DAY
      GROUP BY day
      ORDER BY day
    `,
  },

  // ─── Platform cohort benchmarks ────────────────────────
  {
    name: 'scores.cohort',
    domain: 'scores',
    description: 'Cohort benchmark stats (fleet, by OS, model, or RAM)',
    params: [
      { name: 'cohortType', type: 'enum' as const, values: ['fleet', 'os', 'model', 'ram'], required: true },
      { name: 'cohortValue', type: 'string' as const, required: false },
    ],
    sql: `
      SELECT
        count() AS device_count,
        avg(composite_score) AS avg_composite,
        quantile(0.10)(composite_score) AS p10_composite,
        quantile(0.25)(composite_score) AS p25_composite,
        quantile(0.75)(composite_score) AS p75_composite,
        quantile(0.90)(composite_score) AS p90_composite,
        avg(device_health_score) AS avg_health,
        quantile(0.25)(device_health_score) AS p25_health,
        quantile(0.75)(device_health_score) AS p75_health,
        avg(performance_score) AS avg_performance,
        quantile(0.25)(performance_score) AS p25_performance,
        quantile(0.75)(performance_score) AS p75_performance,
        avgIf(network_score, network_score > 0) AS avg_network,
        quantileIf(0.25)(network_score, network_score > 0) AS p25_network,
        quantileIf(0.75)(network_score, network_score > 0) AS p75_network,
        avg(security_score) AS avg_security,
        quantile(0.25)(security_score) AS p25_security,
        quantile(0.75)(security_score) AS p75_security,
        avg(software_score) AS avg_software,
        quantile(0.25)(software_score) AS p25_software,
        quantile(0.75)(software_score) AS p75_software
      FROM (
        SELECT *
        FROM dex_device_scores_hourly
        WHERE hour >= now() - INTERVAL 1 DAY
        ORDER BY hour DESC
        LIMIT 1 BY host_identifier
      )
      WHERE 1=1 {{FILTERS}}
    `,
  },

  // ─── GitOps timeline ───────────────────────────────────
  {
    name: 'scores.timeline_heatmap',
    domain: 'scores',
    description: 'Score heatmap for GitOps timeline (date × hour)',
    params: [
      { name: 'startDate', type: 'string' as const, required: true },
      { name: 'endDate', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        toDate(hour) AS day,
        toHour(hour) AS hr,
        round(avg(composite_score), 1) AS avg_score,
        count(DISTINCT host_identifier) AS device_count,
        min(composite_score) AS min_score
      FROM dex_device_scores_hourly
      WHERE hour >= {startDate:String} AND hour <= {endDate:String}
      GROUP BY day, hr
      ORDER BY day, hr
    `,
  },
  {
    name: 'scores.timeline_changes',
    domain: 'scores',
    description: 'Hourly score trend for timeline overlay',
    params: [
      { name: 'startDate', type: 'string' as const, required: true },
      { name: 'endDate', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        toStartOfHour(hour) AS time,
        round(avg(composite_score), 1) AS avg_score,
        count(DISTINCT host_identifier) AS devices
      FROM dex_device_scores_hourly
      WHERE hour >= {startDate:String} AND hour <= {endDate:String}
      GROUP BY time
      ORDER BY time
    `,
  },
  {
    name: 'scores.timeline_patches',
    domain: 'scores',
    description: 'Patch events in a time window for timeline',
    params: [
      { name: 'startDate', type: 'string' as const, required: true },
      { name: 'endDate', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        toStartOfHour(event_time) AS hour,
        software_name,
        patch_type,
        old_version,
        new_version,
        count() AS device_count,
        round(avg(days_to_patch), 1) AS avg_lag,
        round(max(days_to_patch), 1) AS max_lag,
        min(event_time) AS first_applied,
        max(event_time) AS last_applied
      FROM dex_patch_events
      WHERE event_time >= {startDate:String} AND event_time <= {endDate:String}
      GROUP BY hour, software_name, patch_type, old_version, new_version
      ORDER BY hour DESC
    `,
  },

  // ─── GitOps impact analysis ────────────────────────────
  {
    name: 'scores.commit_impact',
    domain: 'scores',
    description: 'Score deltas around a deployment commit',
    params: [
      { name: 'commitTime', type: 'string' as const, required: true },
      { name: 'windowHours', type: 'number' as const, required: false, min: 1, max: 168, default: 24 },
    ],
    sql: `
      WITH
        before AS (
          SELECT host_identifier, avg(composite_score) AS score
          FROM dex_device_scores_hourly
          WHERE hour >= parseDateTimeBestEffort({commitTime:String}) - INTERVAL {windowHours:UInt32} HOUR
            AND hour < parseDateTimeBestEffort({commitTime:String})
          GROUP BY host_identifier
        ),
        after AS (
          SELECT host_identifier, avg(composite_score) AS score
          FROM dex_device_scores_hourly
          WHERE hour >= parseDateTimeBestEffort({commitTime:String})
            AND hour < parseDateTimeBestEffort({commitTime:String}) + INTERVAL {windowHours:UInt32} HOUR
          GROUP BY host_identifier
        )
      SELECT
        count() AS total_devices,
        round(avg(a.score - b.score), 2) AS avg_delta,
        round(median(a.score - b.score), 2) AS median_delta,
        countIf(a.score < b.score - 2) AS degraded_count,
        countIf(a.score > b.score + 2) AS improved_count,
        countIf(abs(a.score - b.score) <= 2) AS stable_count,
        round(avg(b.score), 1) AS fleet_score_before,
        round(avg(a.score), 1) AS fleet_score_after
      FROM after a
      INNER JOIN before b ON a.host_identifier = b.host_identifier
    `,
  },
  {
    name: 'scores.device_around_commit',
    domain: 'scores',
    description: 'Device score timeseries around a commit',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
      { name: 'startDate', type: 'string' as const, required: true },
      { name: 'endDate', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        formatDateTime(hour, '%m-%d %H:00') AS time,
        round(composite_score, 1) AS composite,
        round(device_health_score, 1) AS health,
        round(performance_score, 1) AS performance,
        round(network_score, 1) AS network,
        round(security_score, 1) AS security,
        round(software_score, 1) AS software,
        composite_grade AS grade
      FROM dex_device_scores_hourly
      WHERE host_identifier = {filterHostId:String}
        AND hour >= {startDate:String} AND hour <= {endDate:String}
      ORDER BY hour
    `,
  },

  // ─── Fleet device count (used by timeline) ─────────────
  {
    name: 'scores.fleet_device_count',
    domain: 'scores',
    description: 'Total fleet device count',
    params: [],
    sql: `
      SELECT count(DISTINCT host_identifier) AS total
      FROM dex_devices_mat FINAL
    `,
  },

  // ─── GitOps: rollout progress ──────────────────────────
  {
    name: 'scores.rollout_span',
    domain: 'scores',
    description: 'Rollout time span and adoption count for a software version',
    params: [
      { name: 'softwareName', type: 'string' as const, required: true },
      { name: 'newVersion', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        min(patch_applied_date) AS first_applied,
        max(patch_applied_date) AS last_applied,
        dateDiff('hour', min(patch_applied_date), max(patch_applied_date)) AS span_hours,
        count(DISTINCT host_identifier) AS adopted_devices
      FROM dex_patch_events
      WHERE software_name = {softwareName:String} AND new_version = {newVersion:String}
    `,
  },
  {
    name: 'scores.rollout_cumulative',
    domain: 'scores',
    description: 'Cumulative rollout adoption over time',
    params: [
      { name: 'softwareName', type: 'string' as const, required: true },
      { name: 'newVersion', type: 'string' as const, required: true },
      { name: 'bucketMode', type: 'enum' as const, values: ['hour', 'day'], required: false, default: 'hour' },
    ],
    sql: `
      SELECT
        toStartOfHour(patch_applied_date) AS bucket,
        formatDateTime(toStartOfHour(patch_applied_date), '%m-%d %H:00') AS label,
        count(DISTINCT host_identifier) AS devices
      FROM dex_patch_events
      WHERE software_name = {softwareName:String} AND new_version = {newVersion:String}
      GROUP BY bucket
      ORDER BY bucket
    `,
  },

  // ─── GitOps: impact analysis ───────────────────────────
  {
    name: 'scores.impact_summary',
    domain: 'scores',
    description: 'Fleet score deltas around a commit timestamp',
    params: [
      { name: 'commitTime', type: 'string' as const, required: true },
      { name: 'windowHours', type: 'number' as const, required: false, min: 1, max: 168, default: 4 },
    ],
    sql: `
      SELECT
        count(DISTINCT host_identifier) AS total_devices,
        round(avg(score_after - score_before), 1) AS avg_delta,
        round(median(score_after - score_before), 1) AS median_delta,
        countIf(score_after - score_before < -5) AS degraded_count,
        countIf(score_after - score_before > 5) AS improved_count,
        countIf(abs(score_after - score_before) <= 5) AS stable_count,
        round(avg(score_before), 1) AS fleet_score_before,
        round(avg(score_after), 1) AS fleet_score_after
      FROM (
        SELECT
          host_identifier,
          avgIf(composite_score, hour < parseDateTimeBestEffort({commitTime:String})) AS score_before,
          avgIf(composite_score, hour >= parseDateTimeBestEffort({commitTime:String})) AS score_after
        FROM dex_device_scores_hourly
        WHERE hour >= parseDateTimeBestEffort({commitTime:String}) - INTERVAL {windowHours:UInt32} HOUR
          AND hour <= parseDateTimeBestEffort({commitTime:String}) + INTERVAL {windowHours:UInt32} HOUR
        GROUP BY host_identifier
        HAVING score_before > 0 AND score_after > 0
      )
    `,
  },
  {
    name: 'scores.impact_top_movers',
    domain: 'scores',
    description: 'Top 10 devices with largest score changes around a commit',
    params: [
      { name: 'commitTime', type: 'string' as const, required: true },
      { name: 'windowHours', type: 'number' as const, required: false, min: 1, max: 168, default: 4 },
    ],
    sql: `
      SELECT
        s.host_identifier,
        d.hostname,
        d.os_name,
        d.hardware_model,
        round(avgIf(s.composite_score, s.hour < parseDateTimeBestEffort({commitTime:String})), 1) AS score_before,
        round(avgIf(s.composite_score, s.hour >= parseDateTimeBestEffort({commitTime:String})), 1) AS score_after,
        round(score_after - score_before, 1) AS score_delta,
        round(avgIf(s.performance_score, s.hour < parseDateTimeBestEffort({commitTime:String})), 1) AS perf_before,
        round(avgIf(s.performance_score, s.hour >= parseDateTimeBestEffort({commitTime:String})), 1) AS perf_after,
        round(avgIf(s.security_score, s.hour < parseDateTimeBestEffort({commitTime:String})), 1) AS sec_before,
        round(avgIf(s.security_score, s.hour >= parseDateTimeBestEffort({commitTime:String})), 1) AS sec_after
      FROM dex_device_scores_hourly s
      JOIN dex_devices_mat d FINAL ON s.host_identifier = d.host_identifier
      WHERE s.hour >= parseDateTimeBestEffort({commitTime:String}) - INTERVAL {windowHours:UInt32} HOUR
        AND s.hour <= parseDateTimeBestEffort({commitTime:String}) + INTERVAL {windowHours:UInt32} HOUR
      GROUP BY s.host_identifier, d.hostname, d.os_name, d.hardware_model
      HAVING score_before > 0 AND score_after > 0 AND abs(score_delta) > 2
      ORDER BY abs(score_delta) DESC
      LIMIT 10
    `,
  },

  // ─── Device search ─────────────────────────────────────
  {
    name: 'scores.device_search',
    domain: 'scores',
    description: 'Search devices by hostname/host_identifier/model',
    params: [
      { name: 'search', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT host_identifier, hostname, os_name, hardware_model
      FROM dex_devices_mat FINAL
      WHERE hostname ILIKE {filterSearch:String}
         OR host_identifier ILIKE {filterSearch:String}
         OR hardware_model ILIKE {filterSearch:String}
      ORDER BY hostname
      LIMIT 20
    `,
  },

  // ─── Device health around commit ───────────────────────
  {
    name: 'scores.device_health_around_commit',
    domain: 'scores',
    description: 'Device health timeseries around a commit window',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
      { name: 'startDate', type: 'string' as const, required: true },
      { name: 'endDate', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        formatDateTime(toStartOfHour(event_time), '%m-%d %H:00') AS time,
        round(avg(memory_percent), 1) AS memory_percent,
        round(avg(disk_percent), 1) AS disk_percent
      FROM dex_device_health_mat
      WHERE host_identifier = {filterHostId:String}
        AND event_time >= {startDate:String} AND event_time <= {endDate:String}
      GROUP BY time
      ORDER BY time
    `,
  },

  // ─── Device patches around commit ──────────────────────
  {
    name: 'scores.device_patches_around_commit',
    domain: 'scores',
    description: 'Device patch events around a commit window',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
      { name: 'startDate', type: 'string' as const, required: true },
      { name: 'endDate', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        event_time, patch_type, software_name,
        old_version, new_version, days_to_patch
      FROM dex_patch_events
      WHERE host_identifier = {filterHostId:String}
        AND event_time >= {startDate:String} AND event_time <= {endDate:String}
      ORDER BY event_time DESC
    `,
  },
]
