/**
 * Firehose thermal-wear queries.
 *
 * Source: alt ClickHouse → thermal_health (setup/clickhouse-schema/14-thermal.sql,
 *         materialized from the "DEX - Hardware experience - Thermal" pack query)
 *
 * The question is "is this machine working harder to stay cool than it used
 * to" — a dust-buildup proxy. A single reading cannot answer it; a per-host
 * baseline can. So everything here is per host over a window:
 *
 *   idle_rpm_median   fan RPM when the machine is idle (load_1m below the
 *                     IDLE_LOAD threshold) — the number that creeps up as a
 *                     heatsink clogs
 *   pct_at_max        share of samples with any fan at ≥ 90% of its max RPM
 *   heatsink_idle_c   heatsink temperature at idle, for the same-load comparison
 *
 * Battery cycles and health ride along from the same row, so the wear
 * correlation (fan baseline vs battery) needs no second join. Fanless hosts
 * (fan_count = 0) are reported but excluded from RPM statistics.
 *
 * Fleet filter: consulted only when set (same reasoning as core-ai-tools.ts).
 */
import type { QueryConfig } from '../types'
import { FILTERED_HOSTS_CTE, FILTER_PARAMS } from './core-filters'

const IDLE_LOAD = 1.5

const NO_FILTER = `(
  {filterSearch:String} = '' AND {filterModel:String} = '' AND {filterRamTier:String} = ''
  AND {filterOs:String} = '' AND {filterTeam:String} = '' AND {filterHostId:String} = ''
)`

const HOST_SCOPE = `(
  ${NO_FILTER}
  OR host_id IN (SELECT host_id FROM filtered_hosts)
  OR ({filterHostId:String} != '' AND host_id = {filterHostId:String})
  OR ({filterSearch:String} != '' AND {filterModel:String} = '' AND {filterRamTier:String} = ''
      AND {filterOs:String} = '' AND {filterTeam:String} = '' AND {filterHostId:String} = ''
      AND hostname ILIKE concat('%', {filterSearch:String}, '%'))
)`

const WINDOW_PARAM = { name: 'windowDays', type: 'number' as const, required: false, min: 1, max: 90, default: 14 }

/** Per-host baselines over the window. Shared by both queries. */
const HOST_BASELINES = `
host_baselines AS (
  SELECT
    host_id,
    argMax(hostname, timestamp) AS host_name,
    argMax(hardware_model, timestamp) AS hardware_model,
    argMax(cpu_brand, timestamp) AS cpu_brand,
    -- Aliases are prefixed (n_/bat_) because ClickHouse resolves an alias
    -- inside later aggregates: "max(fan_count) AS fan_count" would make every
    -- "fan_count > 0" below read the aggregate, not the column.
    -- (No backticks in this comment: it lives inside a JS template literal.)
    max(fan_count) AS n_fans,
    count() AS samples,
    countIf(load_1m < ${IDLE_LOAD}) AS idle_samples,
    if(countIf(load_1m < ${IDLE_LOAD} AND fan_count > 0) > 0,
       quantileExactIf(0.5)(fan0_rpm, load_1m < ${IDLE_LOAD} AND fan_count > 0), NULL) AS idle_rpm_median,
    if(countIf(fan_count > 0) > 0, quantileExactIf(0.9)(fan_max_rpm_now, fan_count > 0), NULL) AS rpm_p90,
    if(countIf(fan_count > 0) > 0,
       round(countIf(fan_count > 0 AND fan0_max_rpm > 0 AND fan_max_rpm_now >= 0.9 * fan0_max_rpm) / countIf(fan_count > 0), 3), NULL) AS pct_at_max,
    max(fan0_max_rpm) AS fan_max_rpm,
    if(countIf(load_1m < ${IDLE_LOAD} AND heatsink_c > 0) > 0,
       round(quantileExactIf(0.5)(heatsink_c, load_1m < ${IDLE_LOAD} AND heatsink_c > 0), 1), NULL) AS heatsink_idle_c,
    round(quantileExact(0.5)(temp_max_c), 1) AS temp_max_median_c,
    argMax(battery_cycles, timestamp) AS bat_cycles,
    argMax(battery_health_pct, timestamp) AS bat_health_pct,
    argMax(battery_health, timestamp) AS bat_health,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen
  FROM thermal_health
  WHERE timestamp > now() - INTERVAL {windowDays:UInt16} DAY
    AND ${HOST_SCOPE}
  GROUP BY host_id
)`

export const firehoseThermalQueries: QueryConfig[] = [
  {
    name: 'firehose.thermal.host_baselines',
    domain: 'hardware',
    client: 'core',
    description: 'Per-host fan/thermal baselines over the window with battery wear alongside (dust-buildup proxy)',
    params: [...FILTER_PARAMS, WINDOW_PARAM],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}, ${HOST_BASELINES}
      SELECT
        host_id, host_name AS hostname, hardware_model, cpu_brand, n_fans AS fan_count, samples, idle_samples,
        idle_rpm_median, rpm_p90, pct_at_max, fan_max_rpm, heatsink_idle_c, temp_max_median_c,
        bat_cycles AS battery_cycles, bat_health_pct AS battery_health_pct, bat_health AS battery_health, first_seen, last_seen
      FROM host_baselines
      ORDER BY idle_rpm_median DESC NULLS LAST, pct_at_max DESC NULLS LAST
    `,
  },
  {
    name: 'firehose.thermal.summary',
    domain: 'hardware',
    client: 'core',
    description: 'Fleet thermal coverage and the fan-baseline vs battery-wear correlation (Pearson r, hosts with a fan only)',
    params: [...FILTER_PARAMS, WINDOW_PARAM],
    sql: `
      WITH ${FILTERED_HOSTS_CTE}, ${HOST_BASELINES}
      SELECT
        count() AS hosts_reporting,
        countIf(n_fans > 0) AS hosts_with_fan,
        countIf(idle_rpm_median IS NOT NULL) AS hosts_with_idle_baseline,
        sum(samples) AS samples,
        min(first_seen) AS first_seen,
        max(last_seen) AS last_seen,
        if(countIf(idle_rpm_median IS NOT NULL AND bat_cycles > 0) >= 8,
           round(corrIf(toFloat64(idle_rpm_median), toFloat64(bat_cycles), idle_rpm_median IS NOT NULL AND bat_cycles > 0), 3), NULL) AS r_idle_rpm_vs_cycles,
        if(countIf(idle_rpm_median IS NOT NULL AND bat_health_pct > 0) >= 8,
           round(corrIf(toFloat64(idle_rpm_median), toFloat64(bat_health_pct), idle_rpm_median IS NOT NULL AND bat_health_pct > 0), 3), NULL) AS r_idle_rpm_vs_health,
        if(countIf(pct_at_max IS NOT NULL AND bat_cycles > 0) >= 8,
           round(corrIf(toFloat64(pct_at_max), toFloat64(bat_cycles), pct_at_max IS NOT NULL AND bat_cycles > 0), 3), NULL) AS r_pct_at_max_vs_cycles,
        if(countIf(idle_rpm_median IS NOT NULL) > 0, quantileExactIf(0.5)(idle_rpm_median, idle_rpm_median IS NOT NULL), NULL) AS fleet_idle_rpm_median
      FROM host_baselines
    `,
  },
]
