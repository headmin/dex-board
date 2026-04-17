/**
 * Firehose device + OS health queries.
 *
 * Source: alt ClickHouse → device_health, os_health
 * (materialized from dex-queries.yml "device health" + "OS health")
 */
import type { QueryConfig } from '../types'

export const firehoseHealthQueries: QueryConfig[] = [
  // ── Device Health ──────────────────────────────────────
  {
    name: 'firehose.health.device_summary',
    domain: 'health',
    client: 'alt',
    description: 'Fleet-wide device health: CPU class, RAM tier, swap/battery distributions',
    params: [],
    sql: `
      SELECT
        countDistinct(host_id) AS total_devices,
        countDistinctIf(host_id, swap_pressure = 'severe') AS severe_swap,
        countDistinctIf(host_id, swap_pressure = 'elevated') AS elevated_swap,
        countDistinctIf(host_id, compression_pressure = 'high') AS high_compression,
        countDistinctIf(host_id, compression_pressure = 'moderate') AS moderate_compression,
        countDistinctIf(host_id, battery_health_score = 'degraded') AS degraded_battery,
        countDistinctIf(host_id, battery_health_score = 'replace') AS replace_battery,
        round(avg(battery_percent), 0) AS avg_battery_pct
      FROM device_health
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM device_health GROUP BY host_id
      )
    `,
  },
  {
    // Per-condition host drill-down. Returns the *latest* snapshot per host
    // that matches the given condition, with enough fields to render a tile.
    // Used by clickable metric cards (e.g. "Degraded battery: 3").
    name: 'firehose.health.hosts_by_condition',
    domain: 'health',
    client: 'alt',
    description: 'Hosts matching a specific device-health condition (tile drill-down)',
    params: [
      { name: 'condition', type: 'enum' as const, required: true, values: [
        'severe_swap', 'elevated_swap',
        'degraded_battery', 'replace_battery',
        'high_compression',
      ] },
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 200, default: 50 },
    ],
    // LEFT JOIN hardware_inventory so tiles get hardware_serial — uniquely
    // identifies a host in Fleet's search, unlike hostname (which can collide
    // across imaging generations / tenants).
    sql: `
      SELECT
        dh.host_id AS host_id,
        dh.hostname AS hostname,
        dh.cpu_class AS cpu_class,
        dh.cpu_brand AS cpu_brand,
        dh.ram_tier AS ram_tier,
        dh.ram_gb AS ram_gb,
        dh.swap_pressure AS swap_pressure,
        dh.compression_pressure AS compression_pressure,
        dh.battery_percent AS battery_percent,
        dh.battery_cycles AS battery_cycles,
        dh.battery_health_score AS battery_health_score,
        dh.battery_state AS battery_state,
        hw.hardware_serial AS hardware_serial,
        hw.hardware_model AS hardware_model,
        dh.timestamp AS last_seen
      FROM device_health dh
      LEFT JOIN (
        SELECT host_id,
          argMax(hardware_serial, timestamp) AS hardware_serial,
          argMax(hardware_model, timestamp) AS hardware_model
        FROM hardware_inventory GROUP BY host_id
      ) hw ON dh.host_id = hw.host_id
      WHERE (dh.host_id, dh.timestamp) IN (
        SELECT host_id, max(timestamp) FROM device_health GROUP BY host_id
      )
      AND multiIf(
        {condition:String} = 'severe_swap', dh.swap_pressure = 'severe',
        {condition:String} = 'elevated_swap', dh.swap_pressure = 'elevated',
        {condition:String} = 'degraded_battery', dh.battery_health_score = 'degraded',
        {condition:String} = 'replace_battery', dh.battery_health_score = 'replace',
        {condition:String} = 'high_compression', dh.compression_pressure = 'high',
        false
      )
      ORDER BY dh.hostname
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.health.device_list',
    domain: 'health',
    client: 'alt',
    description: 'Per-device latest health snapshot',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 100 },
    ],
    sql: `
      SELECT
        host_id,
        hostname,
        cpu_class,
        cpu_brand,
        ram_tier,
        ram_gb,
        swap_pressure,
        compression_pressure,
        battery_percent,
        battery_cycles,
        battery_health_score,
        battery_state,
        timestamp
      FROM device_health
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM device_health GROUP BY host_id
      )
      ORDER BY hostname
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.health.cpu_distribution',
    domain: 'health',
    client: 'alt',
    description: 'Device count by CPU class (Apple M1–M5, Intel)',
    params: [],
    sql: `
      SELECT
        cpu_class,
        count() AS device_count
      FROM (
        SELECT host_id, argMax(cpu_class, timestamp) AS cpu_class
        FROM device_health GROUP BY host_id
      )
      GROUP BY cpu_class
      ORDER BY device_count DESC
    `,
  },
  {
    name: 'firehose.health.swap_distribution',
    domain: 'health',
    client: 'alt',
    description: 'Device count by swap pressure level',
    params: [],
    sql: `
      SELECT
        swap_pressure,
        count() AS device_count
      FROM (
        SELECT host_id, argMax(swap_pressure, timestamp) AS swap_pressure
        FROM device_health GROUP BY host_id
      )
      GROUP BY swap_pressure
      ORDER BY device_count DESC
    `,
  },
  {
    name: 'firehose.health.compression_distribution',
    domain: 'health',
    client: 'alt',
    description: 'Device count by compression pressure level',
    params: [],
    sql: `
      SELECT
        compression_pressure,
        count() AS device_count
      FROM (
        SELECT host_id, argMax(compression_pressure, timestamp) AS compression_pressure
        FROM device_health GROUP BY host_id
      )
      GROUP BY compression_pressure
      ORDER BY device_count DESC
    `,
  },
  {
    name: 'firehose.health.battery_overview',
    domain: 'health',
    client: 'alt',
    description: 'Battery health distribution across fleet',
    params: [],
    sql: `
      SELECT
        battery_health_score,
        count() AS device_count,
        round(avg(battery_percent), 0) AS avg_pct,
        round(avg(battery_cycles), 0) AS avg_cycles
      FROM (
        SELECT host_id,
          argMax(battery_health_score, timestamp) AS battery_health_score,
          argMax(battery_percent, timestamp) AS battery_percent,
          argMax(battery_cycles, timestamp) AS battery_cycles
        FROM device_health GROUP BY host_id
      )
      WHERE battery_health_score != ''
      GROUP BY battery_health_score
      ORDER BY device_count DESC
    `,
  },

  // ── OS Health ──────────────────────────────────────────
  {
    name: 'firehose.health.os_summary',
    domain: 'health',
    client: 'alt',
    description: 'Fleet OS health: currency, uptime risk, DEX health score counts',
    params: [],
    sql: `
      SELECT
        countDistinct(host_id) AS total_devices,
        countDistinctIf(host_id, dex_os_health = 'healthy') AS healthy,
        countDistinctIf(host_id, dex_os_health = 'acceptable') AS acceptable,
        countDistinctIf(host_id, dex_os_health = 'degraded') AS degraded,
        countDistinctIf(host_id, os_currency = 'current') AS os_current,
        countDistinctIf(host_id, os_currency = 'legacy') AS os_legacy,
        round(avg(uptime_days), 1) AS avg_uptime_days,
        round(avg(crashes_30d), 1) AS avg_crashes_30d
      FROM os_health
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM os_health GROUP BY host_id
      )
    `,
  },
  {
    name: 'firehose.health.os_list',
    domain: 'health',
    client: 'alt',
    description: 'Per-device OS health details',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 100 },
    ],
    sql: `
      SELECT
        host_id,
        hostname,
        os_name,
        os_version,
        os_build,
        os_currency,
        uptime_seconds,
        round(uptime_days, 1) AS uptime_days,
        uptime_risk,
        crashes_30d,
        dex_os_health,
        timestamp
      FROM os_health
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM os_health GROUP BY host_id
      )
      ORDER BY hostname
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.health.os_currency_distribution',
    domain: 'health',
    client: 'alt',
    description: 'Device count by OS currency (current, n-1, n-2, legacy)',
    params: [],
    sql: `
      SELECT
        os_currency,
        count() AS device_count
      FROM (
        SELECT host_id, argMax(os_currency, timestamp) AS os_currency
        FROM os_health GROUP BY host_id
      )
      GROUP BY os_currency
      ORDER BY device_count DESC
    `,
  },
  {
    name: 'firehose.health.uptime_distribution',
    domain: 'health',
    client: 'alt',
    description: 'Device count by uptime risk tier',
    params: [],
    sql: `
      SELECT
        uptime_risk,
        count() AS device_count
      FROM (
        SELECT host_id, argMax(uptime_risk, timestamp) AS uptime_risk
        FROM os_health GROUP BY host_id
      )
      GROUP BY uptime_risk
      ORDER BY device_count DESC
    `,
  },
]
