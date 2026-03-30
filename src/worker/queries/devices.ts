/**
 * Devices domain queries.
 *
 * Covers: device roster, filtered counts, single device detail,
 * hardware inventory, and filter dropdown options.
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

export const deviceQueries: QueryConfig[] = [
  {
    name: 'devices.list',
    domain: 'devices',
    description: 'Device roster with latest metadata',
    params: [
      ...COMMON_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 200 },
    ],
    sql: `
      SELECT *
      FROM dex_devices
      WHERE 1=1 {{FILTERS}}
      ORDER BY last_seen DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'devices.count',
    domain: 'devices',
    description: 'Count of devices matching current filters',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT count(DISTINCT host_identifier) AS cnt
      FROM dex_devices
      WHERE 1=1 {{FILTERS}}
    `,
  },
  {
    name: 'devices.detail',
    domain: 'devices',
    description: 'Single device composite: latest health + security + network',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT *
      FROM dex_device_health
      WHERE host_identifier = {filterHostId:String}
      ORDER BY event_time DESC
      LIMIT 1
    `,
  },
  {
    name: 'devices.security',
    domain: 'devices',
    description: 'Single device latest security posture',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT *
      FROM dex_security_posture
      WHERE host_identifier = {filterHostId:String}
      ORDER BY event_time DESC
      LIMIT 1
    `,
  },
  {
    name: 'devices.network',
    domain: 'devices',
    description: 'Single device latest network quality',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT *
      FROM dex_network_quality
      WHERE host_identifier = {filterHostId:String}
      ORDER BY event_time DESC
      LIMIT 1
    `,
  },
  {
    name: 'devices.health_cards',
    domain: 'devices',
    description: 'Device cards with latest health for DexOverview grid',
    params: [
      ...COMMON_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 100, default: 20 },
    ],
    sql: `
      SELECT
        host_identifier,
        argMax(hostname, event_time) AS hostname,
        argMax(computer_name, event_time) AS computer_name,
        argMax(hardware_model, event_time) AS hardware_model,
        argMax(os_name, event_time) AS os_name,
        argMax(os_version, event_time) AS os_version,
        argMax(memory_percent, event_time) AS memory_percent,
        argMax(disk_percent, event_time) AS disk_percent,
        argMax(uptime_days, event_time) AS uptime_days
      FROM dex_device_health
      WHERE {{TIME_FILTER}} {{FILTERS}}
      GROUP BY host_identifier
      ORDER BY toFloat64OrNull(memory_percent) DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'devices.inventory',
    domain: 'devices',
    description: 'Hardware inventory with CPU and RAM info',
    params: [
      ...COMMON_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 200 },
    ],
    sql: `
      SELECT
        d.host_identifier,
        d.hostname,
        d.hardware_model,
        d.os_name,
        d.os_version,
        d.serial_number,
        h.cpu_brand,
        h.memory_total_gb,
        formatDateTime(d.last_seen, '%Y-%m-%d %H:%M') AS last_seen
      FROM dex_devices d
      LEFT JOIN (
        SELECT
          host_identifier,
          argMax(cpu_brand, event_time) AS cpu_brand,
          argMax(memory_total_gb, event_time) AS memory_total_gb
        FROM dex_device_health
        WHERE {{TIME_FILTER}}
        GROUP BY host_identifier
      ) h ON d.host_identifier = h.host_identifier
      WHERE 1=1 {{FILTERS}}
      ORDER BY d.hostname
      {{LIMIT}}
    `,
  },
  {
    name: 'devices.filter_options',
    domain: 'devices',
    description: 'Dropdown options for OS names and hardware models',
    params: [],
    sql: `
      SELECT 'os' AS type, os_name AS value, 0 AS cnt
      FROM dex_devices
      WHERE os_name != ''
      GROUP BY os_name
      ORDER BY os_name
      UNION ALL
      SELECT 'model' AS type, hardware_model AS value, count() AS cnt
      FROM dex_devices
      WHERE hardware_model != ''
      GROUP BY hardware_model
      ORDER BY cnt DESC
      LIMIT 20
    `,
  },
  {
    name: 'devices.model_distribution',
    domain: 'devices',
    description: 'Hardware model distribution (for pie charts)',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        hardware_model,
        count() AS count
      FROM dex_devices
      WHERE hardware_model != '' {{FILTERS}}
      GROUP BY hardware_model
      ORDER BY count DESC
      LIMIT 10
    `,
  },
  {
    name: 'devices.os_distribution',
    domain: 'devices',
    description: 'OS distribution (for pie charts)',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT
        concat(os_name, ' ', os_version) AS os,
        count() AS count
      FROM dex_devices
      WHERE 1=1 {{FILTERS}}
      GROUP BY os
      ORDER BY count DESC
    `,
  },
  {
    name: 'devices.uptime_distribution',
    domain: 'devices',
    description: 'Uptime bucket distribution',
    params: [...COMMON_PARAMS],
    sql: `
      SELECT uptime_bucket, count() AS count FROM (
        SELECT
          host_identifier,
          multiIf(
            toFloat64OrNull(argMax(uptime_days, event_time)) < 1, '< 1 day',
            toFloat64OrNull(argMax(uptime_days, event_time)) < 7, '1-7 days',
            toFloat64OrNull(argMax(uptime_days, event_time)) < 30, '7-30 days',
            '30+ days'
          ) AS uptime_bucket
        FROM dex_device_health
        WHERE {{TIME_FILTER}} {{FILTERS}}
        GROUP BY host_identifier
      )
      GROUP BY uptime_bucket
      ORDER BY uptime_bucket
    `,
  },
]
