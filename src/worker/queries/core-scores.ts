/**
 * Firehose DEX score queries — computed at query time from raw firehose tables.
 *
 * ⚠ CANONICAL SCORING SOURCE OF TRUTH. The SQL in this file defines the score.
 * SCORE-IDEA.md documents it and scoreFormulas.js mirrors the driver-level
 * case tables — when formulas change, change them HERE first, then sync those.
 *
 * Scoring formulas:
 *   Device Health (25%): CPU class + RAM tier + battery + swap pressure
 *   Performance (35%):   Swap/compression pressure + top process RSS + uptime risk
 *   Network (info only):  RSSI + SNR + Tx rate + VPN confidence (excluded from composite)
 *   Security (20%):      Posture-aware when security_posture has a row:
 *                        FileVault 25% + firewall 20% + Gatekeeper 15% + SIP 10%
 *                        + OS currency 15% + DEX OS health 15%.
 *                        Fallback (no posture row): OS currency 50% + DEX OS health 50%.
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

// Patch-velocity exclusion: a comma-separated list of software_name values
// (e.g. "safari.app") whose patch cadence isn't controllable through the
// fleet and would distort velocity numbers. Empty default excludes nothing
// (splitByChar(',', '') → [''], which never matches a real lowercased name).
const EXCLUDE_SOFTWARE_PARAM = { name: 'excludeSoftware', type: 'string' as const, required: false, default: '' }
const excludeClause = (col: string) =>
  `AND NOT has(splitByChar(',', lower({excludeSoftware:String})), lower(${col}))`

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
-- macOS scoring base: hosts with device_health telemetry.
mac_h AS (
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
),
-- Windows scoring base: latest posture as of the same time-travel point,
-- gated to hosts whose BitLocker signal is fresh within 14 days of it —
-- WITHOUT the as-of clauses the sparkline would paint today's posture onto
-- every historical day.
win_p AS (
  SELECT
    b.host_id AS host_id,
    b.hostname AS hostname,
    b.disk_encrypted AS disk_encrypted,
    sc.firewall_ok AS firewall_ok,
    sc.antivirus_ok AS antivirus_ok,
    sc.uac_ok AS uac_ok,
    sb.secure_boot_enabled AS secure_boot_enabled,
    tpm.tpm_ready AS tpm_ready
  FROM (
    SELECT host_id,
      argMax(hostname, timestamp) AS hostname,
      argMax(protection_status, timestamp) AS disk_encrypted
    FROM win_bitlocker
    WHERE host_id IN (SELECT host_id FROM filtered_hosts)
      AND ${AS_OF_WHERE}
      ${hostWindow}
    GROUP BY host_id
    HAVING max(timestamp) > now() - toIntervalDay({asOfDaysAgo:UInt32}) - toIntervalHour({asOfHoursAgo:UInt32}) - INTERVAL 14 DAY
  ) b
  LEFT JOIN (
    SELECT host_id,
      argMax(firewall, timestamp) = 'Good' AS firewall_ok,
      argMax(antivirus, timestamp) = 'Good' AS antivirus_ok,
      argMax(user_account_control, timestamp) = 'Good' AS uac_ok
    FROM win_security_center WHERE ${AS_OF_WHERE} GROUP BY host_id
  ) sc ON b.host_id = sc.host_id
  LEFT JOIN (
    SELECT host_id, argMax(secure_boot_enabled, timestamp) AS secure_boot_enabled
    FROM win_secure_boot WHERE ${AS_OF_WHERE} GROUP BY host_id
  ) sb ON b.host_id = sb.host_id
  LEFT JOIN (
    SELECT host_id, argMax(activated, timestamp) AND argMax(enabled, timestamp) AS tpm_ready
    FROM win_tpm WHERE ${AS_OF_WHERE} GROUP BY host_id
  ) tpm ON b.host_id = tpm.host_id
),
-- Distinct WER failure events in the 7 days before the as-of point.
win_crash AS (
  SELECT host_id, uniqExact(event_time) AS crashes_7d
  FROM win_app_crashes
  WHERE event_time <= now() - toIntervalDay({asOfDaysAgo:UInt32}) - toIntervalHour({asOfHoursAgo:UInt32})
    AND event_time >  now() - toIntervalDay({asOfDaysAgo:UInt32}) - toIntervalHour({asOfHoursAgo:UInt32}) - INTERVAL 7 DAY
  GROUP BY host_id
),
-- Every scorable host, tagged by platform. A host with macOS telemetry is
-- scored the macOS way even if it somehow appears in both sets.
base_hosts AS (
  SELECT host_id, hostname, 'macos' AS platform FROM mac_h
  UNION ALL
  SELECT host_id, hostname, 'windows' AS platform FROM win_p
  WHERE host_id NOT IN (SELECT host_id FROM mac_h)
),
device_scores AS (
  SELECT
    bh.host_id AS host_id,
    bh.hostname AS hostname,
    bh.platform AS platform,
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

    -- Device Health Score (0-100). NULL — not a defaulted number — for
    -- platforms with no device_health telemetry: an unmeasured category
    -- must never read as an average one.
    if(bh.platform = 'macos', round(
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
    ), NULL) AS device_health_score,

    -- Performance Score (0-100)
    -- Compression: macOS aggressively compresses as normal behavior, so "high" ≠ bad
    if(bh.platform = 'macos', round(
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
    ), NULL) AS performance_score,

    -- Network Score (0-100, informational — excluded from composite)
    -- Guard: rssi/snr/transmit_rate = 0 is the toXOrZero sentinel for missing
    -- data, not a real reading. Treat 0 as NULL → use default.
    if(bh.platform = 'macos', round(
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
    ), NULL) AS network_score,

    -- Security Score (0-100)
    -- Full posture formula when security_posture has a row for this host
    -- (FileVault + firewall + Gatekeeper + SIP + os_currency + dex_os_health).
    -- Hosts without a posture row (Linux/Windows today, plus any macOS host
    -- the pack hasn't reached yet) fall back to the OS-only formula so they
    -- aren't penalised for unreported booleans.
    round(
      CASE WHEN bh.platform = 'windows' THEN
          -- Windows-native posture from the win_* normalization tables:
          -- BitLocker 25% + firewall 20% + Secure Boot 15% + TPM 10%
          -- + antivirus 15% + UAC 15%.
          0.25 * (CASE WHEN wp.disk_encrypted      = 1 THEN 100 ELSE 0 END)
        + 0.20 * (CASE WHEN wp.firewall_ok         = 1 THEN 100 ELSE 0 END)
        + 0.15 * (CASE WHEN wp.secure_boot_enabled = 1 THEN 100 ELSE 0 END)
        + 0.10 * (CASE WHEN wp.tpm_ready           = 1 THEN 100 ELSE 0 END)
        + 0.15 * (CASE WHEN wp.antivirus_ok        = 1 THEN 100 ELSE 0 END)
        + 0.15 * (CASE WHEN wp.uac_ok              = 1 THEN 100 ELSE 0 END)
      WHEN sp.host_id != '' THEN
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

    -- Software Score (0-100). Windows hosts have no adoption/app-count
    -- telemetry yet, so their Software score is the crash ladder alone —
    -- a narrower measure of the same category, never a defaulted average.
    round(
      CASE WHEN bh.platform = 'windows' THEN
        (CASE
          WHEN ifNull(wc.crashes_7d, 0) = 0 THEN 100 WHEN wc.crashes_7d = 1 THEN 85
          WHEN wc.crashes_7d <= 4 THEN 65 WHEN wc.crashes_7d <= 9 THEN 40 ELSE 20 END)
      ELSE
        0.40 * (CASE
          WHEN ifNull(c.total_crashes, 0) = 0 THEN 100 WHEN c.total_crashes = 1 THEN 85
          WHEN c.total_crashes <= 4 THEN 65  WHEN c.total_crashes <= 9 THEN 40 ELSE 20 END)
      + 0.35 * (CASE
          WHEN ifNull(a.active_pct, 70) >= 80 THEN 100 WHEN a.active_pct >= 60 THEN 80
          WHEN a.active_pct >= 40 THEN 60 ELSE 40 END)
      + 0.25 * (CASE
          WHEN ifNull(a.app_count, 50) < 80 THEN 100 WHEN a.app_count < 120 THEN 80
          WHEN a.app_count < 160 THEN 60 ELSE 40 END)
      END
    ) AS software_score

  FROM base_hosts bh
  LEFT JOIN mac_h h ON bh.host_id = h.host_id
  LEFT JOIN win_p wp ON bh.host_id = wp.host_id
  LEFT JOIN win_crash wc ON bh.host_id = wc.host_id
  LEFT JOIN (
    SELECT host_id,
      argMax(os_currency, timestamp) AS os_currency,
      argMax(uptime_risk, timestamp) AS uptime_risk,
      argMax(dex_os_health, timestamp) AS dex_os_health
    FROM os_health WHERE ${AS_OF_WHERE} GROUP BY host_id
  ) o ON bh.host_id = o.host_id
  LEFT JOIN (
    SELECT host_id, max(rss_mb) AS max_rss_mb
    FROM process_health WHERE ${AS_OF_WHERE} GROUP BY host_id
  ) p ON bh.host_id = p.host_id
  LEFT JOIN (
    SELECT host_id,
      argMax(rssi, timestamp) AS rssi,
      argMax(snr, timestamp) AS snr,
      argMax(transmit_rate, timestamp) AS transmit_rate
    FROM wifi_signal WHERE ${AS_OF_WHERE} GROUP BY host_id
  ) w ON bh.host_id = w.host_id
  LEFT JOIN (
    SELECT host_id,
      argMax(network_confidence, timestamp) AS network_confidence
    FROM vpn_gate WHERE ${AS_OF_WHERE} GROUP BY host_id
  ) v ON bh.host_id = v.host_id
  LEFT JOIN (
    SELECT host_id, sum(crash_count_7d) AS total_crashes
    FROM crash_summary
    WHERE ${AS_OF_WHERE}
      AND (host_id, timestamp) IN (
        SELECT host_id, max(timestamp) FROM crash_summary
        WHERE ${AS_OF_WHERE} GROUP BY host_id
      )
    GROUP BY host_id
  ) c ON bh.host_id = c.host_id
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
  ) a ON bh.host_id = a.host_id
  LEFT JOIN (
    SELECT host_id,
      argMax(disk_encrypted,     timestamp) AS disk_encrypted,
      argMax(firewall_enabled,   timestamp) AS firewall_enabled,
      argMax(gatekeeper_enabled, timestamp) AS gatekeeper_enabled,
      argMax(sip_enabled,        timestamp) AS sip_enabled
    FROM security_posture WHERE ${AS_OF_WHERE} GROUP BY host_id
  ) sp ON bh.host_id = sp.host_id
),
scored AS (
  -- Coverage-aware composite: weights renormalize over the categories the
  -- platform actually reports. macOS hosts have all four (denominator 1.0 —
  -- identical to the historical fixed formula); Windows hosts today carry
  -- Security + Software, so composite = (0.20*sec + 0.20*sw) / 0.40.
  -- scored_categories discloses how much of the formula was measured.
  SELECT *,
    CASE
      WHEN composite_score >= 90 THEN 'A'
      WHEN composite_score >= 75 THEN 'B'
      WHEN composite_score >= 60 THEN 'C'
      WHEN composite_score >= 40 THEN 'D'
      ELSE 'F'
    END AS composite_grade
  FROM (
    SELECT *,
      round(
        (0.25 * ifNull(device_health_score, 0)
       + 0.35 * ifNull(performance_score, 0)
       + 0.20 * ifNull(security_score, 0)
       + 0.20 * ifNull(software_score, 0))
        /
        (0.25 * isNotNull(device_health_score)
       + 0.35 * isNotNull(performance_score)
       + 0.20 * isNotNull(security_score)
       + 0.20 * isNotNull(software_score))
      ) AS composite_score,
      (isNotNull(device_health_score) + isNotNull(performance_score)
     + isNotNull(security_score) + isNotNull(software_score)) AS scored_categories
    FROM device_scores
  )
)
`

// Snapshot variant — all hosts, each at its latest snapshot (used by the
// composite hero, category cards, exposure tile, per-fleet breakdown).
// Exported for the scheduled daily snapshot (src/worker/snapshot.ts): the
// INSERT ... SELECT that persists score history is assembled from this same
// constant at runtime, so history and live queries share one formula.
export const DEVICE_SCORES_CTE = buildScoresCTE('')

/** Neutral parameter bindings for the snapshot: no filter, no time travel. */
export const SNAPSHOT_PARAMS: Record<string, unknown> = {
  filterSearch: '', filterModel: '', filterRamTier: '', filterOs: '',
  filterTeam: '', filterHostId: '', asOfDaysAgo: 0, asOfHoursAgo: 0,
}
// Windowed variant — only hosts seen in the selected time range (used by the
// drill-downs: distributions, dimensions, biggest movers, device list).
const DEVICE_SCORES_CTE_WINDOWED = buildScoresCTE(WINDOW_WHERE)

// Prior-period (7d-ago) per-host scores + composite — shared by
// biggest_movers and host_deltas so the two can never disagree.
const PRIOR_SCORES_CTES = `      -- Prior period: scores from data before 7 days ago
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

          -- Same posture-aware formula as the current-period CTE — the two
          -- MUST stay in lockstep, or posture hosts show phantom security
          -- deltas that are formula artifacts, not real changes.
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
                  WHEN 'healthy' THEN 100 WHEN 'acceptable' THEN 70 WHEN 'degraded' THEN 30 ELSE 70 END)
            END
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
        LEFT JOIN (
          SELECT host_id,
            argMax(disk_encrypted,     timestamp) AS disk_encrypted,
            argMax(firewall_enabled,   timestamp) AS firewall_enabled,
            argMax(gatekeeper_enabled, timestamp) AS gatekeeper_enabled,
            argMax(sip_enabled,        timestamp) AS sip_enabled
          FROM security_posture WHERE timestamp < now() - INTERVAL 7 DAY GROUP BY host_id
        ) sp ON h.host_id = sp.host_id
      ),
      prior_scored AS (
        SELECT *,
          round(0.25 * device_health_score + 0.35 * performance_score + 0.20 * security_score + 0.20 * software_score) AS composite_score
        FROM prior_device_scores
      )`

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
        platform,
        device_health_score,
        performance_score,
        network_score,
        security_score,
        software_score,
        composite_score,
        composite_grade,
        scored_categories,
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
      EXCLUDE_SOFTWARE_PARAM,
    ],
    sql: `
      SELECT
        software_name,
        round(avg(days_to_patch), 2) AS avg_lag
      FROM dex_patch_events FINAL
      WHERE host_identifier = {filterHostId:String}
        ${excludeClause('software_name')}
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
      EXCLUDE_SOFTWARE_PARAM,
    ],
    sql: `
      SELECT
        round(avg(days_to_patch), 1) AS avg_lag,
        count()                      AS n_patches,
        min(days_to_patch)           AS min_lag,
        max(days_to_patch)           AS max_lag
      FROM dex_patch_events FINAL
      WHERE host_identifier = {filterHostId:String}
        ${excludeClause('software_name')}
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
        -- Hosts without macOS hardware telemetry get their platform as the
        -- bucket label instead of an unreadable empty string.
        if(s.ram_tier = '', s.platform, s.ram_tier) AS dimension,
        round(avg(s.composite_score), 1) AS avg_score,
        round(avg(s.device_health_score), 1) AS avg_device_health,
        round(avg(s.performance_score), 1) AS avg_performance,
        round(avg(s.network_score), 1) AS avg_network,
        round(avg(s.security_score), 1) AS avg_security,
        round(avg(s.software_score), 1) AS avg_software,
        count() AS device_count
      FROM scored s
      GROUP BY dimension
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
        if(s.cpu_class = '', s.platform, s.cpu_class) AS dimension,
        round(avg(s.composite_score), 1) AS avg_score,
        round(avg(s.device_health_score), 1) AS avg_device_health,
        round(avg(s.performance_score), 1) AS avg_performance,
        round(avg(s.network_score), 1) AS avg_network,
        round(avg(s.security_score), 1) AS avg_security,
        round(avg(s.software_score), 1) AS avg_software,
        count() AS device_count
      FROM scored s
      GROUP BY dimension
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
      ${PRIOR_SCORES_CTES}
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

  // ── Scoring readiness sanity check ─────────────────────
  // Post-setup guard (SETUP.md §3.2a): the composite is only trustworthy when
  // every scoring table has data. ifNull() defaults make an *empty* table look
  // like an *average* fleet, so emptiness must be surfaced explicitly.
  {
    name: 'firehose.scores.readiness',
    domain: 'scores',
    client: 'core',
    description: 'Row counts for every table the DEX score reads — empty tables mean the applied query pack is incomplete',
    params: [],
    sql: `
      SELECT 'device_health' AS tbl, count() AS row_count FROM device_health
      UNION ALL SELECT 'os_health', count() FROM os_health
      UNION ALL SELECT 'process_health', count() FROM process_health
      UNION ALL SELECT 'crash_summary', count() FROM crash_summary
      UNION ALL SELECT 'crash_detail', count() FROM crash_detail
      UNION ALL SELECT 'adoption_gap', count() FROM adoption_gap
      UNION ALL SELECT 'vpn_gate', count() FROM vpn_gate
      UNION ALL SELECT 'wifi_signal', count() FROM wifi_signal
      UNION ALL SELECT 'security_posture', count() FROM security_posture
    `,
  },

  // ── Persisted score history ─────────────────────────────
  // Written daily by the Worker cron (src/worker/snapshot.ts) from the same
  // scoring CTE as the live queries — see 12-scores-daily.sql for why this
  // is not a ClickHouse MV. Backfill/manual runs: POST /api/snapshot.
  {
    name: 'firehose.scores.daily_history',
    domain: 'scores',
    client: 'core',
    description: 'Persisted daily fleet/platform score history — sparkline and GitOps series source (one query, no per-day time travel)',
    params: [
      { name: 'days', type: 'number' as const, required: false, min: 1, max: 3650, default: 90 },
      { name: 'platform', type: 'string' as const, required: false, default: 'all' },
    ],
    sql: `
      SELECT
        score_date,
        device_count,
        composite,
        device_health,
        performance,
        network,
        security,
        software
      FROM dex_scores_daily FINAL
      WHERE platform = if({platform:String} = '', 'all', {platform:String})
        AND score_date >= today() - {days:UInt32}
      ORDER BY score_date ASC
    `,
  },

  // ── Scoring coverage ────────────────────────────────────
  // The composite's base table is device_health, which only macOS hosts
  // populate today — hosts seen in other telemetry tables but absent from
  // device_health are invisible to every score. This query provides the
  // honest denominator for "N of M hosts scored" disclosures.
  {
    name: 'firehose.scores.coverage',
    domain: 'scores',
    client: 'core',
    description: 'Scored hosts vs all hosts seen in any telemetry table (7d) — the gap is the unscored population',
    params: [],
    sql: `
      SELECT
        (SELECT uniqExact(host_id) FROM (
          SELECT host_id FROM device_health WHERE timestamp > now() - INTERVAL 7 DAY
          UNION ALL
          SELECT host_id FROM win_bitlocker  WHERE timestamp > now() - INTERVAL 14 DAY
        )) AS scored_hosts,
        uniqExact(host_id) AS known_hosts
      FROM (
        SELECT host_id FROM device_health      WHERE timestamp > now() - INTERVAL 7 DAY
        UNION ALL
        SELECT host_id FROM win_bitlocker      WHERE timestamp > now() - INTERVAL 14 DAY
        UNION ALL
        SELECT host_id FROM hardware_inventory WHERE timestamp > now() - INTERVAL 7 DAY
        UNION ALL
        SELECT host_id FROM os_health          WHERE timestamp > now() - INTERVAL 7 DAY
        UNION ALL
        SELECT host_id FROM process_health     WHERE timestamp > now() - INTERVAL 7 DAY
        UNION ALL
        SELECT host_id FROM wifi_signal        WHERE timestamp > now() - INTERVAL 7 DAY
        UNION ALL
        SELECT host_id FROM vpn_gate           WHERE timestamp > now() - INTERVAL 7 DAY
        UNION ALL
        SELECT host_id FROM security_posture   WHERE timestamp > now() - INTERVAL 7 DAY
        UNION ALL
        SELECT host_id FROM adoption_gap       WHERE timestamp > now() - INTERVAL 7 DAY
      )
    `,
  },

  // ─── Patch events (ported from the retired legacy scores.ts lane) ───
  {
    name: 'firehose.scores.timeline_patches',
    domain: 'scores',
    client: 'core' as const,
    description: 'Patch events in a time window for timeline (optionally filtered by software/day for drill-down)',
    params: [
      { name: 'startDate', type: 'string' as const, required: true },
      { name: 'endDate', type: 'string' as const, required: true },
      { name: 'softwareName', type: 'string' as const, required: false, default: '' },
      { name: 'day', type: 'string' as const, required: false, default: '' },
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
        AND ({softwareName:String} = '' OR software_name = {softwareName:String})
        AND ({day:String} = '' OR toDate(event_time) = toDate({day:String}))
      GROUP BY hour, software_name, patch_type, old_version, new_version
      ORDER BY hour DESC
    `,
  },
  {
    name: 'firehose.scores.timeline_patches_summary',
    domain: 'scores',
    client: 'core' as const,
    description: 'Per-day, per-software aggregate of patch events for the bucketed timeline',
    params: [
      { name: 'startDate', type: 'string' as const, required: true },
      { name: 'endDate', type: 'string' as const, required: true },
      { name: 'minHosts', type: 'number' as const, required: false, min: 1, max: 10000, default: 1 },
    ],
    sql: `
      SELECT
        toDate(event_time) AS day,
        software_name,
        patch_type,
        countDistinct(host_identifier) AS hosts,
        countDistinct(concat(old_version, '|', new_version)) AS transitions,
        argMin(old_version, event_time) AS earliest_from,
        argMax(new_version, event_time) AS latest_to,
        round(avg(days_to_patch), 2) AS avg_lag,
        round(max(days_to_patch), 2) AS max_lag,
        round(min(days_to_patch), 2) AS min_lag,
        countDistinct(days_to_patch) AS distinct_lags,
        -- Raw distinct lag values — lets clients union across day rows
        -- exactly instead of guessing from per-day counts.
        groupUniqArray(days_to_patch) AS lag_values,
        min(event_time) AS first_applied,
        max(event_time) AS last_applied
      FROM dex_patch_events
      WHERE event_time >= {startDate:String} AND event_time <= {endDate:String}
      GROUP BY day, software_name, patch_type
      HAVING hosts >= {minHosts:UInt32}
      ORDER BY day DESC, hosts DESC
    `,
  },
  {
    name: 'firehose.scores.fma_release_devices',
    domain: 'scores',
    client: 'core' as const,
    description: 'Devices that applied a specific FMA app release (exact version_to match)',
    params: [
      { name: 'softwarePattern', type: 'string' as const, required: true },
      { name: 'versionTo', type: 'string' as const, required: true },
      { name: 'releaseTime', type: 'string' as const, required: true },
      { name: 'windowDays', type: 'number' as const, required: false, min: 1, max: 180, default: 30 },
    ],
    sql: `
      SELECT
        software_name,
        patch_type,
        old_version,
        new_version,
        count(DISTINCT host_identifier) AS device_count,
        round(avg(days_to_patch), 1) AS avg_lag,
        round(max(days_to_patch), 1) AS max_lag,
        min(event_time) AS first_applied,
        max(event_time) AS last_applied,
        dateDiff('hour', parseDateTimeBestEffort({releaseTime:String}), min(event_time)) AS hours_to_first_patch,
        dateDiff('hour', parseDateTimeBestEffort({releaseTime:String}), max(event_time)) AS hours_to_last_patch
      FROM dex_patch_events
      WHERE positionCaseInsensitive(software_name, {softwarePattern:String}) > 0
        AND new_version = {versionTo:String}
        AND event_time >= parseDateTimeBestEffort({releaseTime:String})
        AND event_time <= parseDateTimeBestEffort({releaseTime:String}) + INTERVAL {windowDays:UInt32} DAY
      GROUP BY software_name, patch_type, old_version, new_version
      ORDER BY device_count DESC
    `,
  },
  // ─── Patch velocity (MTTP) — fleet-level aggregates ─────────
  // Clock: days_to_patch = fleet-first sighting of a version → this host
  // applies it. NOT vendor-disclosure-to-patched (that clock lives in
  // fma_release_devices.hours_to_first_patch and is measured in hours).
  {
    name: 'firehose.scores.mttp_summary',
    domain: 'scores',
    client: 'core' as const,
    description: 'Fleet-level mean/median time to patch over a trailing window — event-weighted over dex_patch_events',
    params: [
      { name: 'windowDays', type: 'number' as const, required: false, min: 1, max: 365, default: 7 },
      { name: 'offsetDays', type: 'number' as const, required: false, min: 0, max: 365, default: 0 },
      { name: 'slaDays', type: 'number' as const, required: false, min: 1, max: 365, default: 14 },
      EXCLUDE_SOFTWARE_PARAM,
      ...FILTER_PARAMS,
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        count()                                        AS n_events,
        countDistinct(host_identifier)                 AS n_hosts,
        countDistinct(software_name)                   AS n_apps,
        round(avg(days_to_patch), 2)                   AS avg_lag,
        round(quantile(0.5)(days_to_patch), 2)         AS p50_lag,
        round(quantile(0.9)(days_to_patch), 2)         AS p90_lag,
        round(quantile(0.95)(days_to_patch), 2)        AS p95_lag,
        round(100.0 * countIf(days_to_patch <= {slaDays:UInt32}) / nullIf(count(), 0), 1) AS pct_within_sla,
        -- Table-wide ingest start (not window-scoped): lets the UI say
        -- "data since <date>" instead of implying the full window exists.
        (SELECT toDate(min(event_time)) FROM dex_patch_events) AS data_start
      FROM dex_patch_events FINAL
      WHERE event_time >= now() - toIntervalDay({windowDays:UInt32} + {offsetDays:UInt32})
        AND event_time <  now() - toIntervalDay({offsetDays:UInt32})
        AND host_identifier IN (SELECT host_id FROM filtered_hosts)
        ${excludeClause('software_name')}
    `,
  },
  {
    name: 'firehose.scores.app_eligible_hosts',
    domain: 'scores',
    client: 'core' as const,
    description: 'Per-app installed base (hosts reporting the app in adoption_gap, 14d) — the eligible-cohort denominator for patch coverage',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        app_name AS software_name,
        uniqExact(host_id) AS eligible_hosts
      FROM adoption_gap
      WHERE timestamp > now() - INTERVAL 14 DAY
        AND host_id IN (SELECT host_id FROM filtered_hosts)
      GROUP BY app_name
    `,
  },
  {
    name: 'firehose.scores.mttp_weekly',
    domain: 'scores',
    client: 'core' as const,
    description: 'Weekly p50/p90 days-to-patch over a trailing window — the "is velocity improving" trend the single hero number cannot show',
    params: [
      { name: 'windowDays', type: 'number' as const, required: false, min: 7, max: 365, default: 90 },
      EXCLUDE_SOFTWARE_PARAM,
      ...FILTER_PARAMS,
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        toStartOfWeek(event_time)              AS week,
        count()                                AS n_events,
        countDistinct(host_identifier)         AS n_hosts,
        round(quantile(0.5)(days_to_patch), 2) AS p50_lag,
        round(quantile(0.9)(days_to_patch), 2) AS p90_lag
      FROM dex_patch_events FINAL
      WHERE event_time >= now() - toIntervalDay({windowDays:UInt32})
        AND host_identifier IN (SELECT host_id FROM filtered_hosts)
        ${excludeClause('software_name')}
      GROUP BY week
      ORDER BY week ASC
    `,
  },
  {
    name: 'firehose.scores.mttp_host_weighted',
    domain: 'scores',
    client: 'core' as const,
    description: 'Host-weighted MTTP percentiles: each host counts once (its mean lag), so high-cadence titles like Chrome cannot dominate the fleet number',
    params: [
      { name: 'windowDays', type: 'number' as const, required: false, min: 1, max: 365, default: 90 },
      EXCLUDE_SOFTWARE_PARAM,
      ...FILTER_PARAMS,
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        count()                             AS n_hosts,
        round(quantile(0.5)(host_avg), 2)   AS p50_host_lag,
        round(quantile(0.9)(host_avg), 2)   AS p90_host_lag
      FROM (
        SELECT host_identifier, avg(days_to_patch) AS host_avg
        FROM dex_patch_events FINAL
        WHERE event_time >= now() - toIntervalDay({windowDays:UInt32})
          AND host_identifier IN (SELECT host_id FROM filtered_hosts)
          ${excludeClause('software_name')}
        GROUP BY host_identifier
      )
    `,
  },
  // Every (software, new_version) pair seen patching in the window — ONE
  // cheap query so the GitOps "only show releases with patch data" toggle
  // can match the whole FMA feed instead of the visible top-N slice.
  // Scoped by the global fleet filter (search/model/platform/RAM) and
  // annotated with the platforms of the hosts that patched, so a Windows
  // feed entry can't claim a macOS transition as its own.
  {
    name: 'firehose.scores.patched_versions',
    domain: 'scores',
    client: 'core' as const,
    description: 'Distinct (software_name, new_version) pairs with patch events in the window, with host platforms — fleet-filter scoped',
    params: [
      ...FILTER_PARAMS,
      { name: 'windowDays', type: 'number' as const, required: false, min: 1, max: 180, default: 30 },
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE},
      host_platforms AS (
        SELECT host_id, argMax(platform, timestamp) AS platform
        FROM fleetd_info GROUP BY host_id
      )
      SELECT
        e.software_name                                 AS software_name,
        e.new_version                                   AS new_version,
        groupUniqArray(coalesce(hp.platform, ''))       AS platforms,
        countDistinct(e.host_identifier)                AS hosts
      FROM dex_patch_events AS e FINAL
      INNER JOIN filtered_hosts fh ON e.host_identifier = fh.host_id
      LEFT JOIN host_platforms hp ON e.host_identifier = hp.host_id
      WHERE e.event_time >= now() - toIntervalDay({windowDays:UInt32})
      GROUP BY software_name, new_version
    `,
  },
  // Distribution of days_to_patch as a per-day histogram, split by patch
  // type. The client folds this into an adoption/survival curve. Clock:
  // fleet-first sighting → host applies; the sample is transitions that
  // completed inside the window (hosts that never patched have no event
  // and are invisible to this clock — the page must say so).
  {
    name: 'firehose.scores.mttp_survival',
    domain: 'scores',
    client: 'core' as const,
    description: 'Histogram of days_to_patch (per whole day, by patch_type) for the adoption curve',
    params: [
      { name: 'windowDays', type: 'number' as const, required: false, min: 1, max: 365, default: 90 },
      EXCLUDE_SOFTWARE_PARAM,
      ...FILTER_PARAMS,
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        patch_type,
        toUInt32(floor(days_to_patch)) AS day_bucket,
        count()                        AS n_events
      FROM dex_patch_events FINAL
      WHERE event_time >= now() - toIntervalDay({windowDays:UInt32})
        AND host_identifier IN (SELECT host_id FROM filtered_hosts)
        ${excludeClause('software_name')}
      GROUP BY patch_type, day_bucket
      ORDER BY patch_type, day_bucket
    `,
  },
  {
    name: 'firehose.scores.mttp_summary_by_type',
    domain: 'scores',
    client: 'core' as const,
    description: 'MTTP split by patch_type (app vs os) over a trailing window',
    params: [
      { name: 'windowDays', type: 'number' as const, required: false, min: 1, max: 365, default: 30 },
      EXCLUDE_SOFTWARE_PARAM,
      ...FILTER_PARAMS,
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        patch_type,
        count()                                AS n_events,
        countDistinct(host_identifier)         AS n_hosts,
        countDistinct(software_name)           AS n_apps,
        round(avg(days_to_patch), 2)           AS avg_lag,
        round(quantile(0.5)(days_to_patch), 2) AS p50_lag,
        round(quantile(0.9)(days_to_patch), 2) AS p90_lag
      FROM dex_patch_events FINAL
      WHERE event_time >= now() - toIntervalDay({windowDays:UInt32})
        AND host_identifier IN (SELECT host_id FROM filtered_hosts)
        ${excludeClause('software_name')}
      GROUP BY patch_type
      ORDER BY p50_lag DESC
    `,
  },
  {
    name: 'firehose.scores.mttp_by_host',
    domain: 'scores',
    client: 'core' as const,
    description: 'Per-host MTTP leaderboard over a trailing window — hosts dragging the fleet mean',
    params: [
      { name: 'windowDays', type: 'number' as const, required: false, min: 1, max: 365, default: 30 },
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 200, default: 15 },
      EXCLUDE_SOFTWARE_PARAM,
      ...FILTER_PARAMS,
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}
      SELECT
        e.host_identifier                  AS host_identifier,
        hi.hostname                        AS hostname,
        hi.computer_name                   AS computer_name,
        hi.hardware_model                  AS hardware_model,
        count()                            AS n_patches,
        countDistinct(e.software_name)     AS n_apps,
        round(avg(e.days_to_patch), 1)     AS avg_lag,
        round(max(e.days_to_patch), 1)     AS max_lag
      FROM dex_patch_events AS e FINAL
      LEFT JOIN (
        SELECT host_id,
          argMax(hostname, timestamp)       AS hostname,
          argMax(computer_name, timestamp)  AS computer_name,
          argMax(hardware_model, timestamp) AS hardware_model
        FROM hardware_inventory GROUP BY host_id
      ) hi ON e.host_identifier = hi.host_id
      WHERE e.event_time >= now() - toIntervalDay({windowDays:UInt32})
        AND e.host_identifier IN (SELECT host_id FROM filtered_hosts)
        ${excludeClause('e.software_name')}
      GROUP BY e.host_identifier, hi.hostname, hi.computer_name, hi.hardware_model
      ORDER BY avg_lag DESC
      {{LIMIT}}
    `,
  },
  // Per-host composite now vs 7d ago for EVERY host (no movement filter) —
  // the raw material for cohort comparisons on the Patch velocity page:
  // exposed (patched) vs control (not yet) mean score change.
  {
    name: 'firehose.scores.host_deltas',
    domain: 'scores',
    client: 'core' as const,
    description: 'Per-host score now vs 7 days ago — composite plus each category (memory/performance, security, device health, software) so cohort impact can be judged on the metric a change actually moved',
    params: [
      ...WINDOWED_SCORE_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 1000, default: 500 },
    ],
    sql: `
      ${DEVICE_SCORES_CTE_WINDOWED},
      ${PRIOR_SCORES_CTES}
      SELECT
        curr.host_id         AS host_id,
        curr.composite_score AS curr_score,
        prev.composite_score AS prev_score,
        curr.composite_score     - prev.composite_score     AS delta,
        curr.performance_score   - prev.performance_score    AS delta_performance,
        curr.security_score      - prev.security_score       AS delta_security,
        curr.device_health_score - prev.device_health_score  AS delta_device_health,
        curr.software_score      - prev.software_score       AS delta_software
      FROM scored curr
      INNER JOIN prior_scored prev ON curr.host_id = prev.host_id
      {{LIMIT}}
    `,
  },
  // Which hosts applied a given software's patch in a window (exposed cohort).
  {
    name: 'firehose.scores.patched_hosts',
    domain: 'scores',
    client: 'core' as const,
    description: 'Distinct hosts that applied a patch for a software within a trailing window',
    params: [
      { name: 'softwareName', type: 'string' as const, required: true },
      { name: 'windowDays', type: 'number' as const, required: false, min: 1, max: 90, default: 14 },
    ],
    sql: `
      SELECT DISTINCT host_identifier
      FROM dex_patch_events FINAL
      WHERE positionCaseInsensitive(software_name, {softwareName:String}) > 0
        AND event_time >= now() - toIntervalDay({windowDays:UInt32})
    `,
  },
  {
    name: 'firehose.scores.device_top_patches',
    domain: 'scores',
    client: 'core' as const,
    description: 'Top-N recent patch transitions for one host (sorted by event_time desc)',
    params: [
      { name: 'hostIdentifier', type: 'string' as const, required: true },
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 100, default: 10 },
    ],
    sql: `
      SELECT
        event_time,
        patch_type,
        software_name,
        old_version,
        new_version,
        days_to_patch
      FROM dex_patch_events FINAL
      WHERE host_identifier = {hostIdentifier:String}
      ORDER BY event_time DESC
      {{LIMIT}}
    `,
  },
]
