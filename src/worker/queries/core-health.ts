/**
 * Firehose device + OS health queries.
 *
 * Source: alt ClickHouse → device_health, os_health
 * (materialized from dex-queries.yml "device health" + "OS health")
 */
import type { QueryConfig } from '../types'
import { FILTERED_HOSTS_CTE, FILTER_PARAMS } from './core-filters'

/**
 * Battery reading quality -- shared by every battery query so the three
 * surfaces cannot drift into disagreeing about the same host.
 *
 * The osquery pack deliberately returns NULL for battery_health_pct when
 * max_capacity or designed_capacity is unreadable, but the ingest MV coerces
 * that NULL to 0 (toFloat64OrZero in setup-clickhouse-firehose.sh). So a
 * stored 0 means "not measured" -- never "0% capacity left". Averaging it
 * invents a dead battery out of a failed read.
 *
 * Two different zeroes hide in that column and they need opposite handling:
 *   no battery -- a desktop (Mac mini / Studio). Reports no cycles and no
 *                 state. Nothing to measure, so it must not drag the laptop
 *                 averages down; it is excluded, not counted as 0%.
 *   suspect    -- a laptop that reports cycles AND a battery state but no
 *                 capacity. The host is real and the battery is real; only
 *                 the capacity read failed. Kept and counted, flagged in UI.
 */
const HAS_BATTERY = `(battery_cycles > 0 OR battery_state != '')`
const BATTERY_MEASURED = `(${HAS_BATTERY} AND battery_health_pct > 0)`
const BATTERY_SUSPECT = `(${HAS_BATTERY} AND battery_health_pct <= 0)`

/**
 * Latest battery + chip row per host, already scoped to the fleet filter.
 * Callers inline it as a second CTE after FILTERED_HOSTS_CTE.
 */
const LATEST_BATTERY = `
  SELECT host_id,
    argMax(hostname, timestamp)             AS hostname,
    argMax(ram_tier, timestamp)             AS ram_tier,
    argMax(ram_gb, timestamp)               AS ram_gb,
    argMax(swap_pressure, timestamp)        AS swap_pressure,
    argMax(compression_pressure, timestamp) AS compression_pressure,
    argMax(cpu_brand, timestamp)            AS cpu_brand,
    argMax(cpu_class, timestamp)            AS cpu_class,
    argMax(hardware_model, timestamp)       AS hardware_model,
    argMax(battery_health_score, timestamp) AS battery_health_score,
    argMax(battery_health_pct, timestamp)   AS battery_health_pct,
    argMax(battery_percent, timestamp)      AS battery_percent,
    argMax(battery_cycles, timestamp)       AS battery_cycles,
    argMax(battery_state, timestamp)        AS battery_state
  FROM device_health
  WHERE host_id IN (SELECT host_id FROM filtered_hosts)
  GROUP BY host_id
`

export const firehoseHealthQueries: QueryConfig[] = [
  // ── Device Health ──────────────────────────────────────
  {
    name: 'firehose.health.device_summary',
    domain: 'health',
    client: 'core',
    description: 'Fleet-wide device health: CPU class, RAM tier, swap/battery distributions',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        countDistinct(host_id) AS total_devices,
        countDistinctIf(host_id, swap_pressure = 'severe') AS severe_swap,
        countDistinctIf(host_id, swap_pressure = 'elevated') AS elevated_swap,
        countDistinctIf(host_id, compression_pressure = 'high') AS high_compression,
        countDistinctIf(host_id, compression_pressure = 'moderate') AS moderate_compression,
        countDistinctIf(host_id, battery_health_score = 'degraded') AS degraded_battery,
        countDistinctIf(host_id, battery_health_score = 'replace') AS replace_battery,
        -- Capacity remaining vs design: the actual health measure. Averaged
        -- only over hosts that reported it, so desktops and failed reads
        -- cannot pull the fleet number down.
        round(avgIf(battery_health_pct, ${BATTERY_MEASURED}), 0) AS avg_battery_health_pct,
        countDistinctIf(host_id, ${BATTERY_SUSPECT}) AS suspect_battery,
        countDistinctIf(host_id, NOT ${HAS_BATTERY}) AS no_battery,
        -- Charge level at last check-in. Retained for the host tiles, which
        -- show it per host; it is NOT a fleet health signal and no longer
        -- fronts a summary card.
        round(avgIf(battery_percent, ${HAS_BATTERY}), 0) AS avg_battery_pct
      FROM device_health
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM device_health GROUP BY host_id
      )
      AND host_id IN (SELECT host_id FROM filtered_hosts)
    `,
  },
  {
    // Per-condition host drill-down. Returns the *latest* snapshot per host
    // that matches the given condition, with enough fields to render a tile.
    // Used by clickable metric cards (e.g. "Degraded battery: 3").
    // Per-condition host drill-down. Single query handles all tile contexts:
    // device-health (swap/battery/compression), OS (dex_os_health tiers, uptime
    // risk), VPN (disconnected), and crashes. LEFT JOINs give every tile the
    // same shape regardless of which condition triggered it — so HostTile
    // renders consistently.
    name: 'firehose.health.hosts_by_condition',
    domain: 'health',
    client: 'core',
    description: 'Hosts matching a specific device-health/OS/VPN/crash condition (tile drill-down)',
    params: [
      { name: 'condition', type: 'enum' as const, required: true, values: [
        // device_health
        'severe_swap', 'elevated_swap',
        'degraded_battery', 'replace_battery', 'good_battery',
        'high_compression',
        // os_health
        'degraded_os', 'acceptable_os', 'healthy_os',
        'uptime_risk_stale',
        // vpn
        'vpn_disconnected',
        // crashes
        'has_crashes',
      ] },
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 200, default: 50 },
      // Scoped to the same filtered_hosts CTE the summary cards and charts
      // use. Without it this drill listed 86 "good battery" hosts under a
      // chart that counted 75 -- the 11 extra are in device_health but not in
      // the hardware/Windows inventory the rest of the page is scoped to.
      ...FILTER_PARAMS,
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
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
        os.dex_os_health AS dex_os_health,
        os.os_currency AS os_currency,
        os.uptime_risk AS uptime_risk,
        os.uptime_days AS uptime_days,
        v.network_confidence AS network_confidence,
        c.total_crashes_7d AS total_crashes_7d,
        dh.timestamp AS last_seen
      FROM device_health dh
      LEFT JOIN (
        SELECT host_id,
          argMax(hardware_serial, timestamp) AS hardware_serial,
          argMax(hardware_model, timestamp) AS hardware_model
        FROM hardware_inventory GROUP BY host_id
      ) hw ON dh.host_id = hw.host_id
      LEFT JOIN (
        SELECT host_id,
          argMax(dex_os_health, timestamp) AS dex_os_health,
          argMax(os_currency, timestamp) AS os_currency,
          argMax(uptime_risk, timestamp) AS uptime_risk,
          argMax(uptime_days, timestamp) AS uptime_days
        FROM os_health GROUP BY host_id
      ) os ON dh.host_id = os.host_id
      LEFT JOIN (
        SELECT host_id, argMax(network_confidence, timestamp) AS network_confidence
        FROM vpn_gate GROUP BY host_id
      ) v ON dh.host_id = v.host_id
      LEFT JOIN (
        SELECT host_id, sum(crash_count_7d) AS total_crashes_7d
        FROM crash_summary
        WHERE (host_id, timestamp) IN (SELECT host_id, max(timestamp) FROM crash_summary GROUP BY host_id)
        GROUP BY host_id
      ) c ON dh.host_id = c.host_id
      WHERE (dh.host_id, dh.timestamp) IN (
        SELECT host_id, max(timestamp) FROM device_health GROUP BY host_id
      )
      AND dh.host_id IN (SELECT host_id FROM filtered_hosts)
      AND multiIf(
        {condition:String} = 'severe_swap',       dh.swap_pressure = 'severe',
        {condition:String} = 'elevated_swap',     dh.swap_pressure = 'elevated',
        {condition:String} = 'degraded_battery',  dh.battery_health_score = 'degraded',
        {condition:String} = 'replace_battery',   dh.battery_health_score = 'replace',
        {condition:String} = 'good_battery',      dh.battery_health_score = 'good',
        {condition:String} = 'high_compression',  dh.compression_pressure = 'high',
        {condition:String} = 'degraded_os',       os.dex_os_health = 'degraded',
        {condition:String} = 'acceptable_os',     os.dex_os_health = 'acceptable',
        {condition:String} = 'healthy_os',        os.dex_os_health = 'healthy',
        {condition:String} = 'uptime_risk_stale', os.uptime_risk IN ('stale_7d', 'stale_14d'),
        {condition:String} = 'vpn_disconnected',  v.network_confidence = 'disconnected',
        {condition:String} = 'has_crashes',       c.total_crashes_7d > 0,
        false
      )
      ORDER BY dh.hostname
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.health.device_list',
    domain: 'health',
    client: 'core',
    description: 'Per-device latest health snapshot. Pass hostId to fetch one host.',
    params: [
      ...FILTER_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 100 },
      { name: 'hostId', type: 'string' as const, required: false },
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
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
        battery_health_pct,
        battery_state,
        timestamp
      FROM device_health
      WHERE (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM device_health GROUP BY host_id
      )
        AND host_id IN (SELECT host_id FROM filtered_hosts)
        AND if({filterHostId:String} != '', host_id = {filterHostId:String}, true)
      ORDER BY hostname
      {{LIMIT}}
    `,
  },
  {
    // Chip breakdown one level finer than cpu_distribution: cpu_class collapses
    // M1 / M1 Pro / M1 Max / M1 Ultra into a single `apple_m1` bucket, which
    // hides the distinction that decides an action — a base M1 under strain is
    // under-specced, an M1 Max under strain is genuinely maxed out. cpu_brand
    // carries the tier verbatim ("Apple M1 Max") and is already collected.
    //
    // Returns the raw (brand, class) pairs rather than parsed tiers: both are
    // LowCardinality so this is a dozen rows, and the parsing/labelling rules
    // live in one place client-side (composables/chipTier.js) instead of being
    // duplicated as a ClickHouse CASE that drifts from it.
    name: 'firehose.health.chip_distribution',
    domain: 'health',
    client: 'core',
    description: 'Device count by chip brand + class (tier-aware: M1 vs M1 Pro/Max/Ultra)',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        cpu_brand,
        cpu_class,
        count() AS device_count
      FROM (
        SELECT host_id,
          argMax(cpu_brand, timestamp) AS cpu_brand,
          argMax(cpu_class, timestamp) AS cpu_class
        FROM device_health
        WHERE host_id IN (SELECT host_id FROM filtered_hosts)
        GROUP BY host_id
      )
      GROUP BY cpu_brand, cpu_class
      HAVING cpu_brand != '' OR cpu_class != ''
      ORDER BY device_count DESC
    `,
  },
  {
    name: 'firehose.health.cpu_distribution',
    domain: 'health',
    client: 'core',
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
    client: 'core',
    description: 'Device count by swap pressure level',
    params: [
      ...FILTER_PARAMS,
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        swap_pressure,
        count() AS device_count
      FROM (
        SELECT host_id, argMax(swap_pressure, timestamp) AS swap_pressure
        FROM device_health GROUP BY host_id
      )
      WHERE host_id IN (SELECT host_id FROM filtered_hosts)
      GROUP BY swap_pressure
      ORDER BY device_count DESC
    `,
  },
  {
    name: 'firehose.health.compression_distribution',
    domain: 'health',
    client: 'core',
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
    client: 'core',
    description: 'Battery health distribution across fleet, with cycles and read quality',
    // Previously declared no params while callers passed the fleet filter --
    // so filtering the fleet left this panel silently unchanged.
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}, latest AS (${LATEST_BATTERY})
      SELECT
        battery_health_score,
        battery_health_pct,
        count() AS device_count,
        round(avgIf(battery_health_pct, ${BATTERY_MEASURED}), 0) AS avg_health_pct,
        round(avgIf(battery_cycles, battery_cycles > 0), 0)      AS avg_cycles,
        countIf(${BATTERY_SUSPECT})                              AS suspect_count
      FROM latest
      WHERE battery_health_score != ''
      GROUP BY battery_health_score
      ORDER BY device_count DESC
    `,
  },
  {
    // Battery ageing per chip -- the breakdown cpu_class cannot give, since it
    // collapses M1 / M1 Pro / M1 Max into one bucket. Cycles track a chip
    // generation closely (the silicon dates the machine), so this is the
    // honest way to answer "which cohort is wearing out" without pretending
    // to a per-model precision a fleet this size cannot support.
    //
    // Emits raw (brand, class) pairs like chip_distribution and lets
    // composables/chipTier.js do the labelling, so the tier vocabulary stays
    // in exactly one place. Desktops are excluded outright: a Mac mini has no
    // battery to age, and including it as 0% is how the old average broke.
    name: 'firehose.health.battery_by_chip',
    domain: 'health',
    client: 'core',
    description: 'Battery cycles + capacity by chip (tier-aware: M1 vs M1 Pro/Max/Ultra)',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}, latest AS (${LATEST_BATTERY})
      SELECT
        cpu_brand,
        cpu_class,
        count()                                                  AS device_count,
        countIf(${BATTERY_MEASURED})                             AS measured_hosts,
        countIf(${BATTERY_SUSPECT})                              AS suspect_hosts,
        round(avgIf(battery_health_pct, ${BATTERY_MEASURED}), 1) AS avg_health_pct,
        round(minIf(battery_health_pct, ${BATTERY_MEASURED}), 0) AS worst_health_pct,
        round(avgIf(battery_cycles, battery_cycles > 0), 0)      AS avg_cycles,
        maxIf(battery_cycles, battery_cycles > 0)                AS max_cycles,
        countIf(battery_health_score = 'degraded')               AS degraded,
        countIf(battery_health_score = 'replace')                AS replace_count
      FROM latest
      WHERE ${HAS_BATTERY}
      GROUP BY cpu_brand, cpu_class
      ORDER BY avg_cycles DESC
    `,
  },
  {
    // Host-level backing for the battery-by-chip drill-down.
    //
    // Returns every battery-bearing host rather than one chip's, because the
    // chip -> tier mapping lives in composables/chipTier.js and nowhere else.
    // Filtering server-side would mean a second implementation of that parse
    // in SQL, and an Intel bucket spans several brand strings ("...i5-8279U",
    // "...i5-1038NG7"), so a single cpu_brand equality would silently return
    // a subset. The client already holds the parser; it slices the result.
    name: 'firehose.health.battery_hosts',
    domain: 'health',
    client: 'core',
    description: 'Per-host battery detail for the chip drill-down',
    params: [
      ...FILTER_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 500 },
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}, latest AS (${LATEST_BATTERY})
      SELECT
        host_id,
        hostname,
        hardware_model,
        cpu_brand,
        cpu_class,
        ram_tier,
        ram_gb,
        swap_pressure,
        compression_pressure,
        battery_health_score,
        battery_health_pct,
        battery_health_pct,
        battery_percent,
        battery_cycles,
        battery_state
      FROM latest
      WHERE ${HAS_BATTERY}
      ORDER BY battery_cycles DESC
      {{LIMIT}}
    `,
  },

  // ── OS Health ──────────────────────────────────────────
  {
    name: 'firehose.health.os_summary',
    domain: 'health',
    client: 'core',
    description: 'Fleet OS health: currency, uptime risk, DEX health score counts',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
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
      AND host_id IN (SELECT host_id FROM filtered_hosts)
    `,
  },
  {
    name: 'firehose.health.os_list',
    domain: 'health',
    client: 'core',
    description: 'Per-device OS health details. Pass hostId to fetch one host.',
    params: [
      ...FILTER_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 100 },
      { name: 'hostId', type: 'string' as const, required: false },
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
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
        AND host_id IN (SELECT host_id FROM filtered_hosts)
        AND if({filterHostId:String} != '', host_id = {filterHostId:String}, true)
      ORDER BY hostname
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.health.os_currency_distribution',
    domain: 'health',
    client: 'core',
    description: 'Device count by OS currency (current, n-1, n-2, legacy)',
    params: [
      ...FILTER_PARAMS,
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        os_currency,
        count() AS device_count
      FROM (
        SELECT host_id, argMax(os_currency, timestamp) AS os_currency
        FROM os_health GROUP BY host_id
      )
      WHERE host_id IN (SELECT host_id FROM filtered_hosts)
      GROUP BY os_currency
      ORDER BY device_count DESC
    `,
  },
  {
    name: 'firehose.health.uptime_distribution',
    domain: 'health',
    client: 'core',
    description: 'Device count by uptime risk tier (hosts reporting within 7 days)',
    params: [
      ...FILTER_PARAMS,
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        uptime_risk,
        count() AS device_count
      FROM (
        SELECT host_id,
          argMax(uptime_risk, timestamp) AS uptime_risk,
          max(timestamp) AS last_seen
        FROM os_health GROUP BY host_id
      )
      -- Freshness gate: a host whose last snapshot is weeks old must not be
      -- claimed as "currently un-rebooted" — stale rows say nothing about now.
      WHERE last_seen > now() - INTERVAL 7 DAY
        AND host_id IN (SELECT host_id FROM filtered_hosts)
      GROUP BY uptime_risk
      ORDER BY device_count DESC
    `,
  },
]
