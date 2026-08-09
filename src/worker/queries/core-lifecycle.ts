/**
 * Firehose asset / lifecycle queries — hardware refresh & upgrade planning.
 *
 * Source: alt ClickHouse → device_health + hardware_inventory
 *
 * "Refresh score" (0-100, higher = more urgent) combines endpoint telemetry
 * that signals a device is holding its user back and is a replace/upgrade
 * candidate:
 *   battery_health_score  replace +40 · degraded +15    (battery at end of life)
 *   cpu_class             intel*  +25 · apple_m1 +10    (aging silicon)
 *   ram_tier              under_8gb +25 · 8gb +20 · 16gb +5  (under-spec memory)
 *   swap_pressure         severe  +20 · elevated +10    (sustained memory strain)
 *
 * All "act" (procurement, warranty, cost) lives outside osquery — this is the
 * telemetry-driven shortlist, not a purchase order.
 */
import type { QueryConfig } from '../types'
import { FILTERED_HOSTS_CTE, FILTER_PARAMS } from './core-filters'

// Shared scoring expression so the list and summary agree exactly.
const REFRESH_SCORE = `
  ( multiIf(battery_health_score = 'replace', 40, battery_health_score = 'degraded', 15, 0)
  + multiIf(cpu_class LIKE 'intel%', 25, cpu_class = 'apple_m1', 10, 0)
  + multiIf(lower(ram_tier) = 'under_8gb', 25, lower(ram_tier) = '8gb', 20, lower(ram_tier) = '16gb', 5, 0)
  + multiIf(swap_pressure = 'severe', 20, swap_pressure = 'elevated', 10, 0) )`

// Latest device_health snapshot per (filtered) host. Gated to hosts seen in
// the last 14 days — a machine that stopped reporting weeks ago is retired
// or offline, not a refresh candidate, and must not occupy the shortlist.
const LATEST_HEALTH = `
  SELECT host_id,
    argMax(hostname, timestamp)             AS hostname,
    argMax(hardware_model, timestamp)       AS hardware_model,
    argMax(hardware_serial, timestamp)      AS hardware_serial,
    argMax(cpu_class, timestamp)            AS cpu_class,
    argMax(ram_tier, timestamp)             AS ram_tier,
    argMax(ram_gb, timestamp)               AS ram_gb,
    argMax(battery_health_score, timestamp) AS battery_health_score,
    argMax(battery_health_pct, timestamp)   AS battery_health_pct,
    argMax(battery_cycles, timestamp)       AS battery_cycles,
    argMax(swap_pressure, timestamp)        AS swap_pressure
  FROM device_health
  WHERE host_id IN (SELECT host_id FROM filtered_hosts)
  GROUP BY host_id
  HAVING max(timestamp) > now() - INTERVAL 14 DAY`

export const firehoseLifecycleQueries: QueryConfig[] = [
  {
    name: 'firehose.lifecycle.refresh_candidates',
    domain: 'lifecycle',
    client: 'core',
    description: 'Per-host hardware refresh/upgrade shortlist with a refresh score',
    params: [
      ...FILTER_PARAMS,
      { name: 'limit', type: 'number' as const, required: false, min: 1, max: 500, default: 200 },
    ],
    sql: `
      WITH ${FILTERED_HOSTS_CTE},
      dh AS (${LATEST_HEALTH}),
      -- 30d pressure persistence: a verdict must not flip on one bad day.
      -- days_pressured / days_reporting distinguishes sustained strain from
      -- a transient spike (raw device_health retains 90d).
      press AS (
        SELECT host_id,
          uniqExact(toDate(timestamp)) AS days_reporting_30d,
          uniqExactIf(toDate(timestamp), swap_pressure IN ('severe', 'elevated')) AS days_pressured_30d,
          uniqExactIf(toDate(timestamp), swap_pressure = 'severe') AS days_severe_30d
        FROM device_health
        WHERE host_id IN (SELECT host_id FROM filtered_hosts)
          AND timestamp >= now() - INTERVAL 30 DAY
        GROUP BY host_id
      )
      SELECT
        dh.host_id           AS host_id,
        hostname,
        hi.computer_name     AS computer_name,
        hardware_model,
        hardware_serial,
        cpu_class,
        ram_tier,
        ram_gb,
        battery_health_score,
        battery_health_pct,
        battery_cycles,
        swap_pressure,
        ${REFRESH_SCORE} AS refresh_score,
        ifNull(press.days_reporting_30d, 0) AS days_reporting_30d,
        ifNull(press.days_pressured_30d, 0) AS days_pressured_30d,
        ifNull(press.days_severe_30d, 0) AS days_severe_30d
      FROM dh
      LEFT JOIN press ON dh.host_id = press.host_id
      LEFT JOIN (
        SELECT host_id, argMax(computer_name, timestamp) AS computer_name
        FROM hardware_inventory GROUP BY host_id
      ) hi ON dh.host_id = hi.host_id
      ORDER BY refresh_score DESC, battery_cycles DESC
      {{LIMIT}}
    `,
  },
  {
    name: 'firehose.lifecycle.refresh_summary',
    domain: 'lifecycle',
    client: 'core',
    description: 'Fleet refresh posture: priority buckets + per-reason counts',
    params: [...FILTER_PARAMS],
    sql: `
      WITH ${FILTERED_HOSTS_CTE},
      dh AS (${LATEST_HEALTH}),
      scored AS (
        SELECT
          host_id, battery_health_score, cpu_class, ram_tier, swap_pressure,
          ${REFRESH_SCORE} AS refresh_score
        FROM dh
      )
      SELECT
        count()                                                       AS total_hosts,
        countIf(refresh_score >= 40)                                  AS high_priority,
        countIf(refresh_score >= 20 AND refresh_score < 40)           AS watch,
        countIf(battery_health_score = 'replace')                     AS battery_replace,
        countIf(lower(ram_tier) IN ('under_8gb', '8gb'))              AS low_ram,
        countIf(cpu_class LIKE 'intel%')                              AS aging_cpu,
        countIf(swap_pressure = 'severe')                             AS swap_strain
      FROM scored
    `,
  },
]
