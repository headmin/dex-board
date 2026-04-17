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

// ── Per-device score CTE ─────────────────────────────────
// Reusable WITH clause that computes all 5 category scores per device.
// ifNull() ensures LEFT-JOINed NULLs get reasonable defaults ("no data = assume OK")
// rather than falling to CASE ELSE minimum scores.
const DEVICE_SCORES_CTE = `
WITH device_scores AS (
  SELECT
    h.host_id AS host_id,
    h.hostname AS hostname,
    h.cpu_class AS cpu_class,
    h.ram_tier AS ram_tier,

    -- Data coverage: how many secondary tables have data for this device (0-6)
    (CASE WHEN o.host_id IS NOT NULL THEN 1 ELSE 0 END
    + CASE WHEN p.host_id IS NOT NULL THEN 1 ELSE 0 END
    + CASE WHEN w.host_id IS NOT NULL THEN 1 ELSE 0 END
    + CASE WHEN v.host_id IS NOT NULL THEN 1 ELSE 0 END
    + CASE WHEN c.host_id IS NOT NULL THEN 1 ELSE 0 END
    + CASE WHEN a.host_id IS NOT NULL THEN 1 ELSE 0 END) AS data_sources,

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

    -- Security Score (0-100) — limited to OS signals from firehose
    -- ifNull: no os_health data = assume current/acceptable (not penalize)
    round(
      0.50 * (CASE ifNull(o.os_currency, 'current')
        WHEN 'current' THEN 100 WHEN 'n_minus_1' THEN 70
        WHEN 'n_minus_2' THEN 40 WHEN 'legacy' THEN 20 ELSE 80 END)
    + 0.50 * (CASE ifNull(o.dex_os_health, 'acceptable')
        WHEN 'healthy' THEN 100 WHEN 'acceptable' THEN 70 WHEN 'degraded' THEN 30 ELSE 70 END)
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
    FROM device_health GROUP BY host_id
  ) h
  LEFT JOIN (
    SELECT host_id,
      argMax(os_currency, timestamp) AS os_currency,
      argMax(uptime_risk, timestamp) AS uptime_risk,
      argMax(dex_os_health, timestamp) AS dex_os_health
    FROM os_health GROUP BY host_id
  ) o ON h.host_id = o.host_id
  LEFT JOIN (
    SELECT host_id, max(rss_mb) AS max_rss_mb
    FROM process_health GROUP BY host_id
  ) p ON h.host_id = p.host_id
  LEFT JOIN (
    SELECT host_id,
      argMax(rssi, timestamp) AS rssi,
      argMax(snr, timestamp) AS snr,
      argMax(transmit_rate, timestamp) AS transmit_rate
    FROM wifi_signal GROUP BY host_id
  ) w ON h.host_id = w.host_id
  LEFT JOIN (
    SELECT host_id,
      argMax(network_confidence, timestamp) AS network_confidence
    FROM vpn_gate GROUP BY host_id
  ) v ON h.host_id = v.host_id
  LEFT JOIN (
    SELECT host_id, sum(crash_count_7d) AS total_crashes
    FROM crash_summary
    WHERE (host_id, timestamp) IN (SELECT host_id, max(timestamp) FROM crash_summary GROUP BY host_id)
    GROUP BY host_id
  ) c ON h.host_id = c.host_id
  LEFT JOIN (
    SELECT host_id,
      count() AS app_count,
      countIf(usage_tier IN ('active_today', 'active_week')) * 100.0 / count() AS active_pct
    FROM adoption_gap
    WHERE (host_id, timestamp) IN (SELECT host_id, max(timestamp) FROM adoption_gap GROUP BY host_id)
    GROUP BY host_id
  ) a ON h.host_id = a.host_id
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

export const firehoseScoreQueries: QueryConfig[] = [
  {
    name: 'firehose.scores.fleet_summary',
    domain: 'scores',
    client: 'alt',
    description: 'Fleet composite score average and device count',
    params: [],
    sql: `
      ${DEVICE_SCORES_CTE}
      SELECT
        round(avg(composite_score), 1) AS avg_score,
        count() AS device_count
      FROM scored
    `,
  },
  {
    name: 'firehose.scores.categories',
    domain: 'scores',
    client: 'alt',
    description: 'Per-category score averages',
    params: [],
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
    client: 'alt',
    description: 'Grade A/B/C/D/F device counts (composite)',
    params: [],
    sql: `
      ${DEVICE_SCORES_CTE}
      SELECT composite_grade AS grade, count() AS cnt
      FROM scored
      GROUP BY composite_grade
      ORDER BY grade
    `,
  },
  {
    name: 'firehose.scores.grade_distribution_category',
    domain: 'scores',
    client: 'alt',
    description: 'Grade A/B/C/D/F device counts for a specific category',
    params: [
      { name: 'category', type: 'enum' as const, required: true, values: ['device_health', 'performance', 'network', 'security', 'software', 'composite'] },
    ],
    sql: `
      ${DEVICE_SCORES_CTE}
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
    client: 'alt',
    description: 'Per-device scores with all categories',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 200 },
    ],
    sql: `
      ${DEVICE_SCORES_CTE}
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
    name: 'firehose.scores.dimension_os',
    domain: 'scores',
    client: 'alt',
    description: 'Average scores broken down by OS currency',
    params: [],
    sql: `
      ${DEVICE_SCORES_CTE}
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
    client: 'alt',
    description: 'Average scores broken down by hardware model',
    params: [],
    sql: `
      ${DEVICE_SCORES_CTE}
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
    client: 'alt',
    description: 'Average scores broken down by RAM tier',
    params: [],
    sql: `
      ${DEVICE_SCORES_CTE}
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
    client: 'alt',
    description: 'Average scores broken down by CPU class',
    params: [],
    sql: `
      ${DEVICE_SCORES_CTE}
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
    client: 'alt',
    description: 'Average scores broken down by swap pressure',
    params: [],
    sql: `
      ${DEVICE_SCORES_CTE}
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
    client: 'alt',
    description: 'Devices with the largest score change vs 7 days ago',
    params: [
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 50, default: 10 },
    ],
    sql: `
      ${DEVICE_SCORES_CTE},
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
          FROM device_health WHERE timestamp < now() - INTERVAL 7 DAY GROUP BY host_id
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
        curr.host_id,
        curr.hostname,
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
        curr.composite_score - prev.composite_score AS delta
      FROM scored curr
      INNER JOIN prior_scored prev ON curr.host_id = prev.host_id
      WHERE abs(curr.composite_score - prev.composite_score) > 0
      ORDER BY abs(curr.composite_score - prev.composite_score) DESC
      {{LIMIT}}
    `,
  },
]
