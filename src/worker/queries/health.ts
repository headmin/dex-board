/**
 * Health domain queries.
 *
 * Covers: device health metrics, fleet health summaries, health timeseries,
 * heatmaps (3 modes), device drill-down health data, and latest-per-device tables.
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

export const healthQueries: QueryConfig[] = [
  {
    name: 'health.summary',
    domain: 'health',
    description: 'Fleet-wide health summary: device count, avg memory/disk/uptime, P95',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        count() AS total_events,
        uniqExact(host_identifier) AS devices,
        ROUND(AVG(toFloat64OrNull(memory_percent)), 1) AS avg_memory,
        ROUND(AVG(toFloat64OrNull(disk_percent)), 1) AS avg_disk,
        ROUND(AVG(toFloat64OrNull(uptime_days)), 1) AS avg_uptime,
        ROUND(quantile(0.95)(toFloat64OrNull(memory_percent)), 1) AS p95_memory,
        ROUND(quantile(0.95)(toFloat64OrNull(disk_percent)), 1) AS p95_disk
      FROM dex_device_health
      WHERE {{TIME_FILTER}} {{FILTERS}}
    `,
  },
  {
    name: 'health.timeseries',
    domain: 'health',
    description: 'Fleet avg memory/disk over time, bucketed by time range',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        formatDateTime({{TIME_BUCKET}}, '{{TIME_FMT}}') AS time,
        ROUND(AVG(toFloat64OrNull(memory_percent)), 1) AS avg_memory,
        ROUND(AVG(toFloat64OrNull(disk_percent)), 1) AS avg_disk
      FROM dex_device_health
      WHERE {{TIME_FILTER}} {{FILTERS}}
      GROUP BY {{TIME_BUCKET}}
      ORDER BY {{TIME_BUCKET}}
    `,
  },
  {
    name: 'health.heatmap_unhealthiest',
    domain: 'health',
    description: 'Top 20 unhealthiest devices heatmap (device × hour)',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        d.hostname AS label,
        formatDateTime({{TIME_BUCKET}}, '{{TIME_FMT}}') AS hour,
        ROUND(AVG(toFloat64OrNull(h.memory_percent)) * 0.6 + AVG(toFloat64OrNull(h.disk_percent)) * 0.4, 1) AS value,
        h.host_identifier
      FROM dex_device_health h
      LEFT JOIN dex_devices d ON h.host_identifier = d.host_identifier
      WHERE h.{{TIME_FILTER}} {{FILTERS}}
        AND h.host_identifier IN (
          SELECT host_identifier FROM dex_device_health
          WHERE {{TIME_FILTER}}
          GROUP BY host_identifier
          ORDER BY AVG(toFloat64OrNull(memory_percent)) DESC
          LIMIT 20
        )
      GROUP BY d.hostname, h.host_identifier, {{TIME_BUCKET}}
      ORDER BY d.hostname, {{TIME_BUCKET}}
    `,
  },
  {
    name: 'health.heatmap_by_os',
    domain: 'health',
    description: 'Health heatmap grouped by OS',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        d.os_name AS label,
        formatDateTime({{TIME_BUCKET}}, '{{TIME_FMT}}') AS hour,
        ROUND(AVG(toFloat64OrNull(h.memory_percent)) * 0.6 + AVG(toFloat64OrNull(h.disk_percent)) * 0.4, 1) AS value
      FROM dex_device_health h
      LEFT JOIN dex_devices d ON h.host_identifier = d.host_identifier
      WHERE h.{{TIME_FILTER}} AND d.os_name != '' {{FILTERS}}
      GROUP BY d.os_name, {{TIME_BUCKET}}
      ORDER BY d.os_name, {{TIME_BUCKET}}
    `,
  },
  {
    name: 'health.heatmap_by_model',
    domain: 'health',
    description: 'Health heatmap grouped by hardware model',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        d.hardware_model AS label,
        formatDateTime({{TIME_BUCKET}}, '{{TIME_FMT}}') AS hour,
        ROUND(AVG(toFloat64OrNull(h.memory_percent)) * 0.6 + AVG(toFloat64OrNull(h.disk_percent)) * 0.4, 1) AS value
      FROM dex_device_health h
      LEFT JOIN dex_devices d ON h.host_identifier = d.host_identifier
      WHERE h.{{TIME_FILTER}} AND d.hardware_model != '' {{FILTERS}}
        AND d.hardware_model IN (
          SELECT hardware_model FROM dex_devices
          GROUP BY hardware_model ORDER BY count() DESC LIMIT 15
        )
      GROUP BY d.hardware_model, {{TIME_BUCKET}}
      ORDER BY d.hardware_model, {{TIME_BUCKET}}
    `,
  },
  {
    name: 'health.latest_per_device',
    domain: 'health',
    description: 'Latest health snapshot per device (table data)',
    params: [
      ...COMMON_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 200 },
    ],
    sql: `
      SELECT
        host_identifier,
        hostname,
        ROUND(toFloat64OrNull(argMax(memory_percent, event_time)), 1) AS memory_percent,
        ROUND(toFloat64OrNull(argMax(memory_used_gb, event_time)), 1) AS memory_used_gb,
        ROUND(toFloat64OrNull(argMax(disk_percent, event_time)), 1) AS disk_percent,
        ROUND(toFloat64OrNull(argMax(disk_free_gb, event_time)), 1) AS disk_free_gb,
        ROUND(toFloat64OrNull(argMax(disk_total_gb, event_time)), 1) AS disk_total_gb,
        ROUND(toFloat64OrNull(argMax(uptime_days, event_time)), 1) AS uptime_days,
        formatDateTime(max(event_time), '%Y-%m-%d %H:%M') AS last_seen
      FROM dex_device_health
      WHERE {{TIME_FILTER}} {{FILTERS}}
      GROUP BY host_identifier, hostname
      ORDER BY memory_percent DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'health.device_timeseries',
    domain: 'health',
    description: 'Single device health over time (drill-down)',
    params: [
      { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        formatDateTime(toStartOfHour(event_time), '%m-%d %H:00') AS time,
        ROUND(AVG(toFloat64OrNull(memory_percent)), 1) AS avg_memory,
        ROUND(AVG(toFloat64OrNull(disk_percent)), 1) AS avg_disk
      FROM dex_device_health
      WHERE {{TIME_FILTER}} {{FILTERS}}
      GROUP BY toStartOfHour(event_time)
      ORDER BY toStartOfHour(event_time)
    `,
  },
  {
    name: 'health.device_latest',
    domain: 'health',
    description: 'Latest health snapshot for a single device',
    params: [
      { name: 'timeRange', type: 'enum' as const, values: ['1', '6', '24', '168', '720'], required: false, default: '24' },
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        memory_percent, memory_used_gb, disk_percent, disk_free_gb,
        disk_total_gb, uptime_days, cpu_brand, cpu_cores, memory_total_gb,
        formatDateTime(event_time, '%Y-%m-%d %H:%M') AS event_time
      FROM dex_device_health
      WHERE {{TIME_FILTER}} {{FILTERS}}
      ORDER BY event_time DESC
      LIMIT 1
    `,
  },
  {
    name: 'health.device_history',
    domain: 'health',
    description: 'Device resource history (memory/disk over time, for charts)',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 1000, default: 500 },
    ],
    sql: `
      SELECT
        event_time AS time,
        memory_percent,
        disk_percent
      FROM dex_device_health
      WHERE host_identifier = {filterHostId:String}
      ORDER BY event_time
      {{LIMIT}}
    `,
  },
  {
    name: 'health.signals',
    domain: 'health',
    description: 'Real-time health signal averages (for Experience Score signal details)',
    params: [],
    sql: `
      SELECT
        avg(toFloat32OrZero(memory_percent)) AS avg_mem,
        avg(toFloat32OrZero(disk_percent)) AS avg_disk,
        avg(toFloat32OrZero(uptime_days)) AS avg_uptime,
        avg(toFloat32OrZero(disk_total_gb)) AS avg_disk_total
      FROM dex_device_health
      WHERE event_time >= now() - INTERVAL 2 HOUR
    `,
  },
  {
    name: 'health.risk_matrix',
    domain: 'health',
    description: 'Combined health + security risk scoring per device',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        d.hostname,
        h.avg_mem,
        h.avg_disk,
        s.encrypted,
        s.firewall,
        s.sip,
        CASE
          WHEN s.encrypted = '0' THEN 30 ELSE 0
        END +
        CASE
          WHEN s.firewall = '0' THEN 20 ELSE 0
        END +
        CASE
          WHEN h.avg_mem > 85 THEN ROUND(h.avg_mem - 85) ELSE 0
        END AS risk_score
      FROM (
        SELECT host_identifier,
          ROUND(AVG(toFloat64OrNull(memory_percent)), 1) AS avg_mem,
          ROUND(AVG(toFloat64OrNull(disk_percent)), 1) AS avg_disk
        FROM dex_device_health
        WHERE {{TIME_FILTER}} {{FILTERS}}
        GROUP BY host_identifier
      ) h
      LEFT JOIN (
        SELECT host_identifier,
          argMax(disk_encrypted, event_time) AS encrypted,
          argMax(firewall_enabled, event_time) AS firewall,
          argMax(sip_enabled, event_time) AS sip
        FROM dex_security_posture
        WHERE {{TIME_FILTER}}
        GROUP BY host_identifier
      ) s ON h.host_identifier = s.host_identifier
      LEFT JOIN dex_devices d ON h.host_identifier = d.host_identifier
      ORDER BY risk_score DESC
      LIMIT 200
    `,
  },
]
