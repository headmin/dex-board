/**
 * Firehose DEX score queries — computed at query time from raw firehose tables.
 *
 * Scoring formulas:
 *   Device Health (25%): CPU class + RAM tier + battery + swap pressure
 *   Performance (35%):   Swap/compression pressure + top process RSS + uptime risk
 *   Network (info only):  RSSI + SNR + Tx rate + VPN confidence (excluded from composite)
 *   Security (20%):      OS currency + DEX OS health (limited signals)
 *   Software (20%):      Crash frequency + app adoption + app count
 *
 * Composite = 0.25*DH + 0.35*Perf + 0.20*Sec + 0.20*SW
 * Grade: A >=90, B >=75, C >=60, D >=40, F <40
 *
 * NULL handling: LEFT JOINs can produce NULLs for devices missing data in
 * secondary tables. We use ifNull() with reasonable defaults so "no data"
 * means "assume OK" rather than "assume worst case".
 */
import type { QueryConfig } from '../types'
import { FILTERED_HOSTS_CTE, FILTER_PARAMS } from './core-filters'

// Score queries take FILTER_PARAMS + asOfDaysAgo. The asOf param turns the
// composite into a snapshot of the fleet's state N days back (default 0 = now).
// Used by the Δ-vs-7d-ago tile and the 30-day trend sparkline.
const AS_OF_PARAM = {
  name: 'asOfDaysAgo',
  type: 'number' as const,
  required: false,
  min: 0,
  max: 365,
  default: 0,
}
// Finer-grained companion to asOfDaysAgo: shifts the snapshot back by N hours.
// Lets the top tiles read "the fleet's state at the start of the selected
// window" (1h / 6h / 24h / 168h / 720h) for a now-vs-window delta. Combines
// additively with asOfDaysAgo; both default to 0 = now.
const AS_OF_HOURS_PARAM = {
  name: 'asOfHoursAgo',
  type: 'number' as const,
  required: false,
  min: 0,
  max: 8760,
  default: 0,
}
const SCORE_PARAMS = [...FILTER_PARAMS, AS_OF_PARAM, AS_OF_HOURS_PARAM]

// Drill-down queries (distributions, dimensions, biggest movers, device list)
// additionally take a timeRange (in hours) that scopes the result to hosts seen
// within the window — "of hosts active in the last N hours, here's the
// breakdown." Snapshot cards (composite, categories, per-fleet) ignore this and
// always reflect each host's latest snapshot. Values match useTimeRange's hour
// map: 1 / 6 / 24 / 168 / 720.
const TIME_RANGE_PARAM = {
  name: 'timeRange',
  type: 'number' as const,
  required: false,
  min: 1,
  max: 8760,
  default: 720,
}
const WINDOWED_SCORE_PARAMS = [...SCORE_PARAMS, TIME_RANGE_PARAM]

// Inline this WHERE clause into every per-table subquery in DEVICE_SCORES_CTE
// so argMax(field, timestamp) returns "the value as of N days ago" instead of
// "the value right now."
const AS_OF_WHERE = `timestamp <= now() - toIntervalDay({asOfDaysAgo:UInt32}) - toIntervalHour({asOfHoursAgo:UInt32})`

// Optional lower bound applied (windowed CTE only) to the device_health host
// set — this is what defines "active in the last N hours". Left-joined signal
// tables keep their latest-available value so scores stay stable; only the
// population scoped to the window changes.
const WINDOW_WHERE = `AND timestamp >= now() - toIntervalHour({timeRange:UInt32})`

// ── Per-device score CTE ─────────────────────────────────
// Reusable WITH clause that computes all 5 category scores per device.
// Now prefixes filtered_hosts so the scoring set respects the fleet filter bar.
// `hostWindow` is an optional extra AND-clause for the device_health host set:
// '' → snapshot (all hosts, latest), WINDOW_WHERE → only hosts seen in the
// selected time window.
const buildScoresCTE = (hostWindow = '') => `
WITH
${FILTERED_HOSTS_CTE},
device_scores AS (
  SELECT
    h.host_id AS host_id,
    h.hostname AS hostname,
    h.cpu_class AS cpu_class,
    h.ram_tier AS ram_tier,

    -- Data coverage: how many secondary tables have data for this device (0-7)
    (CASE WHEN o.host_id != '' THEN 1 ELSE 0 END
    + CASE WHEN p.host_id != '' THEN 1 ELSE 0 END
    + CASE WHEN w.host_id != '' THEN 1 ELSE 0 END
    + CASE WHEN v.host_id != '' THEN 1 ELSE 0 END
    + CASE WHEN c.host_id != '' THEN 1 ELSE 0 END
    + CASE WHEN a.host_id != '' THEN 1 ELSE 0 END
    + CASE WHEN sp.host_id != '' THEN 1 ELSE 0 END) AS data_sources,

    -- Device Health Score (0-100)
    round(
      0.30 * (CASE h.cpu_class
        WHEN 'apple_m5' THEN 100 WHEN 'apple_m4' THEN 95 WHEN 'apple_m3' THEN 90
        WHEN 'apple_m2' THEN 85  WHEN 'apple_m1' THEN 80
        WHEN 'intel_i9' THEN 75  WHEN 'intel_i7' THEN 70 WHEN 'intel_i5' THEN 60
        ELSE 50 END)
    + 0.25 * (CASE h.ram_tier
        WHEN '32gb_plus' THEN 100 WHEN '16gb' THEN 80 WHEN '8gb' THEN 50 ELSE 30 END)
    + 0.25 * (CASE ifNull(h.battery_health_score, 'good')
        WHEN 'good' THEN 100 WHEN 'degraded' THEN 60 WHEN 'replace' THEN 20 ELSE 80 END)
    + 0.20 * (CASE h.swap_pressure
        WHEN 'none' THEN 100 WHEN 'light' THEN 85 WHEN 'elevated' THEN 60 WHEN 'severe' THEN 30 ELSE 75 END)
    ) AS device_health_score,

    -- Performance Score (0-100)
    -- Compression: macOS aggressively compresses as normal behavior, so "high" ≠ bad
    round(
      0.35 * (CASE h.swap_pressure
        WHEN 'none' THEN 100 WHEN 'light' THEN 85 WHEN 'elevated' THEN 60 WHEN 'severe' THEN 30 ELSE 75 END)
    + 0.30 * (CASE h.compression_pressure
        WHEN 'low' THEN 100 WHEN 'moderate' THEN 85 WHEN 'high' THEN 65 ELSE 75 END)
    + 0.20 * (CASE
        WHEN ifNull(p.max_rss_mb, 0) < 2048 THEN 100
        WHEN p.max_rss_mb < 4096 THEN 80
        WHEN p.max_rss_mb < 8192 THEN 60
        ELSE 30 END)
    + 0.15 * (CASE ifNull(o.uptime_risk, 'normal')
        WHEN 'just_rebooted' THEN 100 WHEN 'fresh' THEN 100
        WHEN 'normal' THEN 90 WHEN 'stale_7d' THEN 60 WHEN 'stale_14d' THEN 30 ELSE 80 END)
    ) AS performance_score,

    -- Network Score (0-100, informational — excluded from composite)
    -- Guard: rssi/snr/transmit_rate = 0 is the toXOrZero sentinel for missing
    -- data, not a real reading. Treat 0 as NULL → use default.
    round(
      0.40 * (CASE
        WHEN w.rssi IS NULL OR w.rssi = 0 THEN 75
        WHEN w.rssi >= -50 THEN 100 WHEN w.rssi >= -60 THEN 85
        WHEN w.rssi >= -70 THEN 65  WHEN w.rssi >= -80 THEN 40 ELSE 20 END)
    + 0.30 * (CASE
        WHEN w.snr IS NULL OR w.snr = 0 THEN 75
        WHEN w.snr >= 30 THEN 100 WHEN w.snr >= 20 THEN 80
        WHEN w.snr >= 10 THEN 50 ELSE 25 END)
    + 0.20 * (CASE
        WHEN w.transmit_rate IS NULL OR w.transmit_rate = 0 THEN 75
        WHEN w.transmit_rate >= 400 THEN 100 WHEN w.transmit_rate >= 200 THEN 85
        WHEN w.transmit_rate >= 100 THEN 60 ELSE 30 END)
    + 0.10 * (CASE ifNull(v.network_confidence, 'direct_connected')
        WHEN 'tunnel_active' THEN 100 WHEN 'direct_connected' THEN 80 ELSE 20 END)
    ) AS network_score,

    -- Security Score (0-100)
    -- Full posture formula when security_posture has a row for this host
    -- (FileVault + firewall + Gatekeeper + SIP + os_currency + dex_os_health).
    -- Hosts without a posture row (Linux/Windows today, plus any macOS host
    -- the pack hasn't reached yet) fall back to the OS-only formula so they
    -- aren't penalised for unreported booleans.
    round(
      CASE WHEN sp.host_id != '' THEN
          0.25 * (CASE WHEN sp.disk_encrypted     = 1 THEN 100 ELSE 0 END)
        + 0.20 * (CASE WHEN sp.firewall_enabled   = 1 THEN 100 ELSE 0 END)
        + 0.15 * (CASE WHEN sp.gatekeeper_enabled = 1 THEN 100 ELSE 0 END)
        + 0.10 * (CASE WHEN sp.sip_enabled        = 1 THEN 100 ELSE 0 END)
        + 0.15 * (CASE ifNull(o.os_currency, 'current')
            WHEN 'current' THEN 100 WHEN 'n_minus_1' THEN 70
            WHEN 'n_minus_2' THEN 40 WHEN 'legacy' THEN 20 ELSE 80 END)
        + 0.15 * (CASE ifNull(o.dex_os_health, 'acceptable')
            WHEN 'healthy' THEN 100 WHEN 'acceptable' THEN 70
            WHEN 'degraded' THEN 30 ELSE 70 END)
      ELSE
          0.50 * (CASE ifNull(o.os_currency, 'current')
            WHEN 'current' THEN 100 WHEN 'n_minus_1' THEN 70
            WHEN 'n_minus_2' THEN 40 WHEN 'legacy' THEN 20 ELSE 80 END)
        + 0.50 * (CASE ifNull(o.dex_os_health, 'acceptable')
            WHEN 'healthy' THEN 100 WHEN 'acceptable' THEN 70
            WHEN 'degraded' THEN 30 ELSE 70 END)
      END
    ) AS security_score,

    -- Software Score (0-100)
    round(
      0.40 * (CASE
        WHEN ifNull(c.total_crashes, 0) = 0 THEN 100 WHEN c.total_crashes = 1 THEN 85
        WHEN c.total_crashes <= 4 THEN 65  WHEN c.total_crashes <= 9 THEN 40 ELSE 20 END)
    + 0.35 * (CASE
        WHEN ifNull(a.active_pct, 70) >= 80 THEN 100 WHEN a.active_pct >= 60 THEN 80
        WHEN a.active_pct >= 40 THEN 60 ELSE 40 END)
    + 0.25 * (CASE
        WHEN ifNull(a.app_count, 50) < 80 THEN 100 WHEN a.app_count < 120 THEN 80
        WHEN a.app_count < 160 THEN 60 ELSE 40 END)
    ) AS software_score

  FROM (
    SELECT host_id, argMax(hostname, timestamp) AS hostname,
      argMax(cpu_class, timestamp) AS cpu_class,
      argMax(ram_tier, timestamp) AS ram_tier,
      argMax(battery_health_score, timestamp) AS battery_health_score,
      argMax(swap_pressure, timestamp) AS swap_pressure,
      argMax(compression_pressure, timestamp) AS compression_pressure
    FROM device_health
    WHERE host_id IN (SELECT host_id FROM filtered_hosts)
      AND ${AS_OF_WHERE}
      ${hostWindow}
    GROUP BY host_id
  ) h
  LEFT JOIN (
    SELECT host_id,
      argMax(os_currency, timestamp) AS os_currency,
      argMax(uptime_risk, timestamp) AS uptime_risk,
      argMax(dex_os_health, timestamp) AS dex_os_health
    FROM os_health WHERE ${AS_OF_WHERE} GROUP BY host_id
  ) o ON h.host_id = o.host_id
  LEFT JOIN (
    SELECT host_id, max(rss_mb) AS max_rss_mb
    FROM process_health WHERE ${AS_OF_WHERE} GROUP BY host_id
  ) p ON h.host_id = p.host_id
  LEFT JOIN (
    SELECT host_id,
      argMax(rssi, timestamp) AS rssi,
      argMax(snr, timestamp) AS snr,
      argMax(transmit_rate, timestamp) AS transmit_rate
    FROM wifi_signal WHERE ${AS_OF_WHERE} GROUP BY host_id
  ) w ON h.host_id = w.host_id
  LEFT JOIN (
    SELECT host_id,
      argMax(network_confidence, timestamp) AS network_confidence
    FROM vpn_gate WHERE ${AS_OF_WHERE} GROUP BY host_id
  ) v ON h.host_id = v.host_id
  LEFT JOIN (
    SELECT host_id, sum(crash_count_7d) AS total_crashes
    FROM crash_summary
    WHERE ${AS_OF_WHERE}
      AND (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM crash_summary
        WHERE ${AS_OF_WHERE} GROUP BY host_id
      )
    GROUP BY host_id
  ) c ON h.host_id = c.host_id
  LEFT JOIN (
    SELECT host_id,
      count() AS app_count,
      countIf(usage_tier IN ('active_today', 'active_week')) * 100.0 / count() AS active_pct
    FROM adoption_gap
    WHERE ${AS_OF_WHERE}
      AND (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM adoption_gap
        WHERE ${AS_OF_WHERE} GROUP BY host_id
      )
    GROUP BY host_id
  ) a ON h.host_id = a.host_id
  LEFT JOIN (
    SELECT host_id,
      argMax(disk_encrypted,     timestamp) AS disk_encrypted,
      argMax(firewall_enabled,   timestamp) AS firewall_enabled,
      argMax(gatekeeper_enabled, timestamp) AS gatekeeper_enabled,
      argMax(sip_enabled,        timestamp) AS sip_enabled
    FROM security_posture WHERE ${AS_OF_WHERE} GROUP BY host_id
  ) sp ON h.host_id = sp.host_id
),
scored AS (
  SELECT *,
    round(0.25 * device_health_score + 0.35 * performance_score + 0.20 * security_score + 0.20 * software_score) AS composite_score,
    CASE
      WHEN round(0.25 * device_health_score + 0.35 * performance_score + 0.20 * security_score + 0.20 * software_score) >= 90 THEN 'A'
      WHEN round(0.25 * device_health_score + 0.35 * performance_score + 0.20 * security_score + 0.20 * software_score) >= 75 THEN 'B'
      WHEN round(0.25 * device_health_score + 0.35 * performance_score + 0.20 * security_score + 0.20 * software_score) >= 60 THEN 'C'
      WHEN round(0.25 * device_health_score + 0.35 * performance_score + 0.20 * security_score + 0.20 * software_score) >= 40 THEN 'D'
      ELSE 'F'
    END AS composite_grade
  FROM device_scores
)
`

// Snapshot variant — all hosts, each at its latest snapshot (used by the
// composite hero, category cards, exposure tile, per-fleet breakdown).
const DEVICE_SCORES_CTE = buildScoresCTE('')
// Windowed variant — only hosts seen in the selected time range (used by the
// drill-downs: distributions, dimensions, biggest movers, device list).
const DEVICE_SCORES_CTE_WINDOWED = buildScoresCTE(WINDOW_WHERE)

export const firehoseScoreQueries: QueryConfig[] = [
  {
    name: 'firehose.scores.fleet_summary',
    domain: 'scores',
    client: 'core',
    description: 'Fleet composite score average and device count',
    params: [...SCORE_PARAMS],
    sql: `
      ${DEVICE_SCORES_CTE}
      SELECT
        round(avg(composite_score), 1) AS avg_score,
        count() AS device_count
      FROM scored
    `,
  },
  {
    name: 'firehose.scores.by_team',
    domain: 'scores',
    client: 'core',
    description: 'Composite + per-category averages grouped by Fleet team. The JOIN to host_teams happens at SELECT-level (not inside FILTERED_HOSTS_CTE) so the IN-set planner pattern still works.',
    params: [...SCORE_PARAMS],
    sql: `
      ${DEVICE_SCORES_CTE}
      SELECT
        ifNull(nullIf(tl.team_id, ''), 'unassigned') AS team_id,
        count() AS hosts,
        round(avg(composite_score), 1) AS avg_composite,
        round(avg(device_health_score), 1) AS avg_device_health,
        round(avg(performance_score), 1) AS avg_performance,
        round(avg(security_score), 1) AS avg_security,
        round(avg(software_score), 1) AS avg_software,
        round(avg(network_score), 1) AS avg_network
      FROM scored
      LEFT JOIN (
        SELECT host_id, argMax(team_id, last_seen) AS team_id
        FROM host_teams GROUP BY host_id
      ) tl ON scored.host_id = tl.host_id
      GROUP BY team_id
      ORDER BY hosts DESC
    `,
  },
  {
    name: 'firehose.scores.categories',
    domain: 'scores',
    client: 'core',
    description: 'Per-category score averages',
    params: [...SCORE_PARAMS],
    sql: `
      ${DEVICE_SCORES_CTE}
      SELECT
        round(avg(device_health_score), 1) AS avg_device_health,
        round(avg(performance_score), 1) AS avg_performance,
        round(avg(network_score), 1) AS avg_network,
        round(avg(security_score), 1) AS avg_security,
        round(avg(software_score), 1) AS avg_software,
        round(avg(composite_score), 1) AS avg_composite
      FROM scored
    `,
  },
  {
    name: 'firehose.scores.grade_distribution',
    domain: 'scores',
    client: 'core',
    description: 'Grade A/B/C/D/F device counts (composite)',
    params: [...WINDOWED_SCORE_PARAMS],
    sql: `
      ${DEVICE_SCORES_CTE_WINDOWED}
      SELECT composite_grade AS grade, count() AS cnt
      FROM scored
      GROUP BY composite_grade
      ORDER BY grade
    `,
  },
  {
    name: 'firehose.scores.grade_distribution_category',
    domain: 'scores',
    client: 'core',
    description: 'Grade A/B/C/D/F device counts for a specific category',
    params: [
      ...WINDOWED_SCORE_PARAMS,
      { name: 'category', type: 'enum' as const, required: true, values: ['device_health', 'performance', 'network', 'security', 'software', 'composite'] },
    ],
    sql: `
      ${DEVICE_SCORES_CTE_WINDOWED}
      SELECT grade, count() AS cnt
      FROM (
        SELECT
          CASE
            WHEN cat_score >= 90 THEN 'A'
            WHEN cat_score >= 75 THEN 'B'
            WHEN cat_score >= 60 THEN 'C'
            WHEN cat_score >= 40 THEN 'D'
            ELSE 'F'
          END AS grade
        FROM (
          SELECT
            CASE {category:String}
              WHEN 'device_health' THEN device_health_score
              WHEN 'performance' THEN performance_score
              WHEN 'network' THEN network_score
              WHEN 'security' THEN security_score
              WHEN 'software' THEN software_score
              ELSE composite_score
            END AS cat_score
          FROM scored
        )
      )
      GROUP BY grade
      ORDER BY grade
    `,
  },
  {
    name: 'firehose.scores.device_list',
    domain: 'scores',
    client: 'core',
    description: 'Per-device scores with all categories',
    params: [
      ...WINDOWED_SCORE_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 200 },
    ],
    sql: `
      ${DEVICE_SCORES_CTE_WINDOWED}
      SELECT
        host_id,
        hostname,
        cpu_class,
        ram_tier,
        device_health_score,
        performance_score,
        network_score,
        security_score,
        software_score,
        composite_score,
        composite_grade,
        data_sources
      FROM scored
      ORDER BY composite_score ASC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.scores.device_patch_avg',
    domain: 'scores',
    client: 'core',
    description: 'Average days-to-patch per software for one host (compare view)',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        software_name,
        round(avg(days_to_patch), 2) AS avg_lag
      FROM dex_patch_events FINAL
      WHERE host_identifier = {filterHostId:String}
      GROUP BY software_name
      ORDER BY avg_lag DESC
    `,
  },
  {
    name: 'firehose.scores.device_mttp',
    domain: 'scores',
    client: 'core',
    description: 'Host-level mean time to patch — one aggregate row across all patch events for a host',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      SELECT
        round(avg(days_to_patch), 1) AS avg_lag,
        count()                      AS n_patches,
        min(days_to_patch)           AS min_lag,
        max(days_to_patch)           AS max_lag
      FROM dex_patch_events FINAL
      WHERE host_identifier = {filterHostId:String}
    `,
  },
  {
    name: 'firehose.scores.device_latest',
    domain: 'scores',
    client: 'core',
    description: 'Single-device latest scores + meta (firehose-side replacement for scores.device_latest)',
    params: [
      ...SCORE_PARAMS,
      { name: 'hostIdentifier', type: 'string' as const, required: true },
    ],
    sql: `
      ${DEVICE_SCORES_CTE}
      SELECT
        s.host_id,
        s.hostname,
        s.cpu_class,
        s.ram_tier,
        s.device_health_score,
        s.performance_score,
        s.network_score,
        s.security_score,
        s.software_score,
        s.composite_score,
        s.composite_grade,
        hi.hardware_model AS hardware_model,
        hi.computer_name  AS computer_name,
        oh.os_name        AS os_name
      FROM scored s
      LEFT JOIN (
        SELECT host_id,
          argMax(hardware_model, timestamp) AS hardware_model,
          argMax(computer_name, timestamp)  AS computer_name
        FROM hardware_inventory GROUP BY host_id
      ) hi ON s.host_id = hi.host_id
      LEFT JOIN (
        SELECT host_id, argMax(os_name, timestamp) AS os_name
        FROM os_health GROUP BY host_id
      ) oh ON s.host_id = oh.host_id
      WHERE s.host_id = {filterHostId:String}
      LIMIT 1
    `,
  },
  {
    name: 'firehose.scores.dimension_os',
    domain: 'scores',
    client: 'core',
    description: 'Average scores broken down by OS currency',
    params: [...WINDOWED_SCORE_PARAMS],
    sql: `
      ${DEVICE_SCORES_CTE_WINDOWED}
      SELECT
        ifNull(o.os_currency, 'not reporting') AS dimension,
        round(avg(s.composite_score), 1) AS avg_score,
        round(avg(s.device_health_score), 1) AS avg_device_health,
        round(avg(s.performance_score), 1) AS avg_performance,
        round(avg(s.network_score), 1) AS avg_network,
        round(avg(s.security_score), 1) AS avg_security,
        round(avg(s.software_score), 1) AS avg_software,
        count() AS device_count
      FROM scored s
      LEFT JOIN (
        SELECT host_id, argMax(os_currency, timestamp) AS os_currency
        FROM os_health GROUP BY host_id
      ) o ON s.host_id = o.host_id
      GROUP BY o.os_currency
      ORDER BY avg_score DESC
    `,
  },
  {
    name: 'firehose.scores.dimension_model',
    domain: 'scores',
    client: 'core',
    description: 'Average scores broken down by hardware model',
    params: [...WINDOWED_SCORE_PARAMS],
    sql: `
      ${DEVICE_SCORES_CTE_WINDOWED}
      SELECT
        ifNull(m.hardware_model, 'unknown') AS dimension,
        round(avg(s.composite_score), 1) AS avg_score,
        round(avg(s.device_health_score), 1) AS avg_device_health,
        round(avg(s.performance_score), 1) AS avg_performance,
        round(avg(s.network_score), 1) AS avg_network,
        round(avg(s.security_score), 1) AS avg_security,
        round(avg(s.software_score), 1) AS avg_software,
        count() AS device_count
      FROM scored s
      LEFT JOIN (
        SELECT host_id, argMax(hardware_model, timestamp) AS hardware_model
        FROM hardware_inventory GROUP BY host_id
      ) m ON s.host_id = m.host_id
      GROUP BY m.hardware_model
      ORDER BY avg_score DESC
    `,
  },
  {
    name: 'firehose.scores.dimension_ram',
    domain: 'scores',
    client: 'core',
    description: 'Average scores broken down by RAM tier',
    params: [...WINDOWED_SCORE_PARAMS],
    sql: `
      ${DEVICE_SCORES_CTE_WINDOWED}
      SELECT
        s.ram_tier AS dimension,
        round(avg(s.composite_score), 1) AS avg_score,
        round(avg(s.device_health_score), 1) AS avg_device_health,
        round(avg(s.performance_score), 1) AS avg_performance,
        round(avg(s.network_score), 1) AS avg_network,
        round(avg(s.security_score), 1) AS avg_security,
        round(avg(s.software_score), 1) AS avg_software,
        count() AS device_count
      FROM scored s
      GROUP BY s.ram_tier
      ORDER BY avg_score DESC
    `,
  },
  {
    name: 'firehose.scores.dimension_cpu',
    domain: 'scores',
    client: 'core',
    description: 'Average scores broken down by CPU class',
    params: [...WINDOWED_SCORE_PARAMS],
    sql: `
      ${DEVICE_SCORES_CTE_WINDOWED}
      SELECT
        s.cpu_class AS dimension,
        round(avg(s.composite_score), 1) AS avg_score,
        round(avg(s.device_health_score), 1) AS avg_device_health,
        round(avg(s.performance_score), 1) AS avg_performance,
        round(avg(s.network_score), 1) AS avg_network,
        round(avg(s.security_score), 1) AS avg_security,
        round(avg(s.software_score), 1) AS avg_software,
        count() AS device_count
      FROM scored s
      GROUP BY s.cpu_class
      ORDER BY avg_score DESC
    `,
  },
  {
    name: 'firehose.scores.dimension_swap',
    domain: 'scores',
    client: 'core',
    description: 'Average scores broken down by swap pressure',
    params: [...WINDOWED_SCORE_PARAMS],
    sql: `
      ${DEVICE_SCORES_CTE_WINDOWED}
      SELECT
        h.swap AS dimension,
        round(avg(s.composite_score), 1) AS avg_score,
        round(avg(s.device_health_score), 1) AS avg_device_health,
        round(avg(s.performance_score), 1) AS avg_performance,
        round(avg(s.network_score), 1) AS avg_network,
        round(avg(s.security_score), 1) AS avg_security,
        round(avg(s.software_score), 1) AS avg_software,
        count() AS device_count
      FROM scored s
      LEFT JOIN (
        SELECT host_id, argMax(swap_pressure, timestamp) AS swap
        FROM device_health GROUP BY host_id
      ) h ON s.host_id = h.host_id
      GROUP BY h.swap
      ORDER BY avg_score DESC
    `,
  },
  {
    name: 'firehose.scores.biggest_movers',
    domain: 'scores',
    client: 'core',
    description: 'Devices with the largest score change vs 7 days ago',
    params: [
      ...WINDOWED_SCORE_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 50, default: 10 },
    ],
    sql: `
      ${DEVICE_SCORES_CTE_WINDOWED},
      -- Prior period: scores from data before 7 days ago
      prior_device_scores AS (
        SELECT
          h.host_id AS host_id,
          h.hostname AS hostname,

          round(
            0.30 * (CASE h.cpu_class
              WHEN 'apple_m5' THEN 100 WHEN 'apple_m4' THEN 95 WHEN 'apple_m3' THEN 90
              WHEN 'apple_m2' THEN 85  WHEN 'apple_m1' THEN 80
              WHEN 'intel_i9' THEN 75  WHEN 'intel_i7' THEN 70 WHEN 'intel_i5' THEN 60
              ELSE 50 END)
          + 0.25 * (CASE h.ram_tier
              WHEN '32gb_plus' THEN 100 WHEN '16gb' THEN 80 WHEN '8gb' THEN 50 ELSE 30 END)
          + 0.25 * (CASE ifNull(h.battery_health_score, 'good')
              WHEN 'good' THEN 100 WHEN 'degraded' THEN 60 WHEN 'replace' THEN 20 ELSE 80 END)
          + 0.20 * (CASE h.swap_pressure
              WHEN 'none' THEN 100 WHEN 'light' THEN 85 WHEN 'elevated' THEN 60 WHEN 'severe' THEN 30 ELSE 75 END)
          ) AS device_health_score,

          round(
            0.35 * (CASE h.swap_pressure
              WHEN 'none' THEN 100 WHEN 'light' THEN 85 WHEN 'elevated' THEN 60 WHEN 'severe' THEN 30 ELSE 75 END)
          + 0.30 * (CASE h.compression_pressure
              WHEN 'low' THEN 100 WHEN 'moderate' THEN 85 WHEN 'high' THEN 65 ELSE 75 END)
          + 0.20 * (CASE
              WHEN ifNull(p.max_rss_mb, 0) < 2048 THEN 100
              WHEN p.max_rss_mb < 4096 THEN 80
              WHEN p.max_rss_mb < 8192 THEN 60
              ELSE 30 END)
          + 0.15 * (CASE ifNull(o.uptime_risk, 'normal')
              WHEN 'just_rebooted' THEN 100 WHEN 'fresh' THEN 100
              WHEN 'normal' THEN 90 WHEN 'stale_7d' THEN 60 WHEN 'stale_14d' THEN 30 ELSE 80 END)
          ) AS performance_score,

          round(
            0.50 * (CASE ifNull(o.os_currency, 'current')
              WHEN 'current' THEN 100 WHEN 'n_minus_1' THEN 70
              WHEN 'n_minus_2' THEN 40 WHEN 'legacy' THEN 20 ELSE 80 END)
          + 0.50 * (CASE ifNull(o.dex_os_health, 'acceptable')
              WHEN 'healthy' THEN 100 WHEN 'acceptable' THEN 70 WHEN 'degraded' THEN 30 ELSE 70 END)
          ) AS security_score,

          round(
            0.40 * (CASE
              WHEN ifNull(c.total_crashes, 0) = 0 THEN 100 WHEN c.total_crashes = 1 THEN 85
              WHEN c.total_crashes <= 4 THEN 65  WHEN c.total_crashes <= 9 THEN 40 ELSE 20 END)
          + 0.35 * (CASE
              WHEN ifNull(a.active_pct, 70) >= 80 THEN 100 WHEN a.active_pct >= 60 THEN 80
              WHEN a.active_pct >= 40 THEN 60 ELSE 40 END)
          + 0.25 * (CASE
              WHEN ifNull(a.app_count, 50) < 80 THEN 100 WHEN a.app_count < 120 THEN 80
              WHEN a.app_count < 160 THEN 60 ELSE 40 END)
          ) AS software_score

        FROM (
          SELECT host_id, argMax(hostname, timestamp) AS hostname,
            argMax(cpu_class, timestamp) AS cpu_class,
            argMax(ram_tier, timestamp) AS ram_tier,
            argMax(battery_health_score, timestamp) AS battery_health_score,
            argMax(swap_pressure, timestamp) AS swap_pressure,
            argMax(compression_pressure, timestamp) AS compression_pressure
          FROM device_health
          WHERE timestamp < now() - INTERVAL 7 DAY
            AND host_id IN (SELECT host_id FROM filtered_hosts)
          GROUP BY host_id
        ) h
        LEFT JOIN (
          SELECT host_id,
            argMax(os_currency, timestamp) AS os_currency,
            argMax(uptime_risk, timestamp) AS uptime_risk,
            argMax(dex_os_health, timestamp) AS dex_os_health
          FROM os_health WHERE timestamp < now() - INTERVAL 7 DAY GROUP BY host_id
        ) o ON h.host_id = o.host_id
        LEFT JOIN (
          SELECT host_id, max(rss_mb) AS max_rss_mb
          FROM process_health WHERE timestamp < now() - INTERVAL 7 DAY GROUP BY host_id
        ) p ON h.host_id = p.host_id
        LEFT JOIN (
          SELECT host_id, sum(crash_count_7d) AS total_crashes
          FROM crash_summary
          WHERE timestamp < now() - INTERVAL 7 DAY
            AND (host_id, timestamp) IN (
              SELECT host_id, max(timestamp) FROM crash_summary
              WHERE timestamp < now() - INTERVAL 7 DAY GROUP BY host_id
            )
          GROUP BY host_id
        ) c ON h.host_id = c.host_id
        LEFT JOIN (
          SELECT host_id,
            count() AS app_count,
            countIf(usage_tier IN ('active_today', 'active_week')) * 100.0 / count() AS active_pct
          FROM adoption_gap
          WHERE timestamp < now() - INTERVAL 7 DAY
            AND (host_id, timestamp) IN (
              SELECT host_id, max(timestamp) FROM adoption_gap
              WHERE timestamp < now() - INTERVAL 7 DAY GROUP BY host_id
            )
          GROUP BY host_id
        ) a ON h.host_id = a.host_id
      ),
      prior_scored AS (
        SELECT *,
          round(0.25 * device_health_score + 0.35 * performance_score + 0.20 * security_score + 0.20 * software_score) AS composite_score
        FROM prior_device_scores
      )
      SELECT
        -- Alias explicitly so the JOINed hardware_inventory's own host_id
        -- column doesn't shadow curr's value when JSON-serialized.
        curr.host_id   AS host_id,
        curr.hostname  AS hostname,
        hi.computer_name AS computer_name,
        curr.composite_score AS curr_score,
        curr.composite_grade AS curr_grade,
        prev.composite_score AS prev_score,
        CASE
          WHEN prev.composite_score >= 90 THEN 'A'
          WHEN prev.composite_score >= 75 THEN 'B'
          WHEN prev.composite_score >= 60 THEN 'C'
          WHEN prev.composite_score >= 40 THEN 'D'
          ELSE 'F'
        END AS prev_grade,
        curr.composite_score - prev.composite_score AS delta,
        -- Per-category curr/prev so the expansion panel can render the
        -- breakdown without a second query.
        curr.device_health_score AS curr_device_health,
        curr.performance_score   AS curr_performance,
        curr.network_score       AS curr_network,
        curr.security_score      AS curr_security,
        curr.software_score      AS curr_software,
        prev.device_health_score AS prev_device_health,
        prev.performance_score   AS prev_performance,
        -- Network is excluded from the prior CTE (informational only, not in composite)
        NULL                     AS prev_network,
        prev.security_score      AS prev_security,
        prev.software_score      AS prev_software
      FROM scored curr
      INNER JOIN prior_scored prev ON curr.host_id = prev.host_id
      LEFT JOIN (
        SELECT host_id, argMax(computer_name, timestamp) AS computer_name
        FROM hardware_inventory GROUP BY host_id
      ) hi ON curr.host_id = hi.host_id
      WHERE abs(curr.composite_score - prev.composite_score) > 0
      ORDER BY abs(curr.composite_score - prev.composite_score) DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.scores.device_signals_compare',
    domain: 'scores',
    client: 'core',
    description: 'Per-host raw signal values for current vs prior 7d — single row with curr_*/prev_* fields',
    params: [
      { name: 'hostId', type: 'string' as const, required: true },
    ],
    sql: `
      WITH
        cur_health AS (
          SELECT
            argMax(swap_pressure, timestamp)         AS swap_pressure,
            argMax(compression_pressure, timestamp)  AS compression_pressure,
            argMax(battery_health_score, timestamp)  AS battery_health_score,
            argMax(cpu_class, timestamp)             AS cpu_class,
            argMax(ram_tier, timestamp)              AS ram_tier
          FROM device_health
          WHERE host_id = {filterHostId:String}
        ),
        prv_health AS (
          SELECT
            argMax(swap_pressure, timestamp)         AS swap_pressure,
            argMax(compression_pressure, timestamp)  AS compression_pressure,
            argMax(battery_health_score, timestamp)  AS battery_health_score
          FROM device_health
          WHERE host_id = {filterHostId:String}
            AND timestamp < now() - INTERVAL 7 DAY
        ),
        cur_os AS (
          SELECT
            argMax(os_currency, timestamp)    AS os_currency,
            argMax(dex_os_health, timestamp)  AS dex_os_health,
            argMax(uptime_risk, timestamp)    AS uptime_risk,
            argMax(uptime_days, timestamp)    AS uptime_days
          FROM os_health
          WHERE host_id = {filterHostId:String}
        ),
        prv_os AS (
          SELECT
            argMax(os_currency, timestamp)    AS os_currency,
            argMax(dex_os_health, timestamp)  AS dex_os_health,
            argMax(uptime_risk, timestamp)    AS uptime_risk
          FROM os_health
          WHERE host_id = {filterHostId:String}
            AND timestamp < now() - INTERVAL 7 DAY
        ),
        cur_proc AS (
          SELECT max(rss_mb) AS max_rss_mb FROM process_health
          WHERE host_id = {filterHostId:String}
        ),
        prv_proc AS (
          SELECT max(rss_mb) AS max_rss_mb FROM process_health
          WHERE host_id = {filterHostId:String} AND timestamp < now() - INTERVAL 7 DAY
        ),
        cur_crash AS (
          SELECT sum(crash_count_7d) AS total_crashes FROM crash_summary
          WHERE host_id = {filterHostId:String}
            AND (host_id, timestamp) IN
                (SELECT host_id, max(timestamp) FROM crash_summary
                 WHERE host_id = {filterHostId:String} GROUP BY host_id)
        ),
        prv_crash AS (
          SELECT sum(crash_count_7d) AS total_crashes FROM crash_summary
          WHERE host_id = {filterHostId:String} AND timestamp < now() - INTERVAL 7 DAY
            AND (host_id, timestamp) IN
                (SELECT host_id, max(timestamp) FROM crash_summary
                 WHERE host_id = {filterHostId:String} AND timestamp < now() - INTERVAL 7 DAY
                 GROUP BY host_id)
        ),
        cur_adopt AS (
          SELECT count() AS app_count,
                 countIf(usage_tier IN ('active_today','active_week')) * 100.0 / count() AS active_pct
          FROM adoption_gap
          WHERE host_id = {filterHostId:String}
            AND (host_id, timestamp) IN
                (SELECT host_id, max(timestamp) FROM adoption_gap
                 WHERE host_id = {filterHostId:String} GROUP BY host_id)
        ),
        prv_adopt AS (
          SELECT count() AS app_count,
                 countIf(usage_tier IN ('active_today','active_week')) * 100.0 / count() AS active_pct
          FROM adoption_gap
          WHERE host_id = {filterHostId:String} AND timestamp < now() - INTERVAL 7 DAY
            AND (host_id, timestamp) IN
                (SELECT host_id, max(timestamp) FROM adoption_gap
                 WHERE host_id = {filterHostId:String} AND timestamp < now() - INTERVAL 7 DAY
                 GROUP BY host_id)
        )
      SELECT
        -- Performance signals
        ch.swap_pressure         AS curr_swap_pressure,
        ph.swap_pressure         AS prev_swap_pressure,
        ch.compression_pressure  AS curr_compression,
        ph.compression_pressure  AS prev_compression,
        cp.max_rss_mb            AS curr_max_rss_mb,
        pp.max_rss_mb            AS prev_max_rss_mb,
        co.uptime_risk           AS curr_uptime_risk,
        po.uptime_risk           AS prev_uptime_risk,
        co.uptime_days           AS curr_uptime_days,
        -- Device-health signals (cpu/ram are static — no prev needed)
        ch.battery_health_score  AS curr_battery,
        ph.battery_health_score  AS prev_battery,
        ch.cpu_class             AS curr_cpu_class,
        ch.ram_tier              AS curr_ram_tier,
        -- Security signals
        co.os_currency           AS curr_os_currency,
        po.os_currency           AS prev_os_currency,
        co.dex_os_health         AS curr_dex_os_health,
        po.dex_os_health         AS prev_dex_os_health,
        -- Software signals
        cc.total_crashes         AS curr_crashes,
        pc.total_crashes         AS prev_crashes,
        ca.app_count             AS curr_app_count,
        pa.app_count             AS prev_app_count,
        ca.active_pct            AS curr_active_pct,
        pa.active_pct            AS prev_active_pct
      FROM cur_health ch, prv_health ph, cur_os co, prv_os po,
           cur_proc cp,   prv_proc pp,   cur_crash cc, prv_crash pc,
           cur_adopt ca,  prv_adopt pa
    `,
  },
]
