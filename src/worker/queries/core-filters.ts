/**
 * Shared fleet-filter infrastructure for firehose queries.
 *
 * Any query that wants to respect the fleet filter bar
 * (search/model/ramTier/os/team) should:
 *   1. Spread `...FILTER_PARAMS` into its `params: []` so the param-validator
 *      accepts them (otherwise they get silently dropped).
 *   2. Prefix its SQL with `WITH ${FILTERED_HOSTS_CTE},` and reference
 *      `filtered_hosts` in a WHERE/JOIN clause to scope its base data source
 *      to the matching hosts.
 *
 * The CTE is safe to include unconditionally — when no filter is set, every
 * `if({filter*:String} != '', <cond>, true)` evaluates to true and the CTE
 * yields every host in hardware_inventory.
 */

/** ClickHouse parameter defaults come from filter-builder.ts (filterSearch,
 *  filterModel, filterRamTier, filterOs all default to '' if unset). */
export const FILTER_PARAMS = [
  { name: 'search', type: 'string' as const, required: false },
  { name: 'model', type: 'string' as const, required: false },
  { name: 'ramTier', type: 'string' as const, required: false },
  { name: 'os', type: 'string' as const, required: false },
  { name: 'team', type: 'string' as const, required: false },
  // Single-host scope — lets any filtered query double as a per-host lookup
  // (e.g. the host-detail page pulling one host's 30d pressure pattern).
  { name: 'hostId', type: 'string' as const, required: false },
]

/**
 * CTE body — NOT wrapped in `WITH`. Callers inline it:
 *   `WITH ${FILTERED_HOSTS_CTE}, other_cte AS (...) SELECT ...`
 * Or for single-CTE queries:
 *   `WITH ${FILTERED_HOSTS_CTE} SELECT ... WHERE host_id IN (SELECT host_id FROM filtered_hosts)`
 *
 * Platform comes from fleetd_info, team from host_teams (both LEFT JOINs so
 * hosts missing that data aren't dropped when the filter is unset).
 */
export const FILTERED_HOSTS_CTE = `
filtered_hosts AS (
  SELECT hi.host_id AS host_id FROM (
    SELECT host_id,
      argMax(hostname, timestamp) AS hostname,
      argMax(hardware_model, timestamp) AS hardware_model,
      argMax(hardware_serial, timestamp) AS hardware_serial,
      argMax(memory_gb, timestamp) AS memory_gb
    FROM hardware_inventory GROUP BY host_id
    UNION ALL
    -- Windows hosts that never landed in hardware_inventory (its feeder
    -- query reaches only part of the fleet) but do report Windows posture —
    -- without this branch they are invisible to every filtered query.
    SELECT host_id,
      argMax(hostname, timestamp) AS hostname,
      '' AS hardware_model,
      '' AS hardware_serial,
      0  AS memory_gb
    FROM win_bitlocker
    WHERE host_id NOT IN (SELECT DISTINCT host_id FROM hardware_inventory)
    GROUP BY host_id
  ) hi
  LEFT JOIN (
    SELECT host_id, argMax(platform, timestamp) AS platform
    FROM fleetd_info GROUP BY host_id
  ) fi ON hi.host_id = fi.host_id
  LEFT JOIN (
    SELECT DISTINCT host_id, 1 AS is_windows FROM win_bitlocker
  ) wb ON hi.host_id = wb.host_id
  LEFT JOIN (
    SELECT host_id, argMax(team_id, last_seen) AS team_id
    FROM host_teams GROUP BY host_id
  ) ht ON hi.host_id = ht.host_id
  WHERE 1=1
    AND if({filterHostId:String} != '', hi.host_id = {filterHostId:String}, true)
    AND if({filterSearch:String} != '',
      hi.hostname LIKE concat('%', {filterSearch:String}, '%')
      OR hi.hardware_serial LIKE concat('%', {filterSearch:String}, '%')
      OR hi.hardware_model LIKE concat('%', {filterSearch:String}, '%'),
      true)
    AND if({filterModel:String} != '', hi.hardware_model = {filterModel:String}, true)
    -- Platform: presence in the Windows normalization tables is authoritative
    -- ('windows' even when fleetd_info has no row — that feed died 2026-04-18);
    -- everything else falls back to fleetd_info's last-known platform.
    AND if({filterOs:String} != '', multiIf(wb.is_windows = 1, 'windows', fi.platform) = {filterOs:String}, true)
    AND if({filterTeam:String} != '', ht.team_id = {filterTeam:String}, true)
    -- RAM filter is "at most N GB" (inclusive) — selecting 24GB returns
    -- hosts with <= 24GB (i.e. 8, 16, 18, 24). "128GB+" effectively matches
    -- all. memory_gb = 0 means unknown, which must not match a RAM filter.
    AND if({filterRamTier:String} != '', hi.memory_gb > 0 AND hi.memory_gb <= multiIf(
      {filterRamTier:String} = '8GB', 8,
      {filterRamTier:String} = '16GB', 16,
      {filterRamTier:String} = '18GB', 18,
      {filterRamTier:String} = '24GB', 24,
      {filterRamTier:String} = '32GB', 32,
      {filterRamTier:String} = '36GB', 36,
      {filterRamTier:String} = '48GB', 48,
      {filterRamTier:String} = '64GB', 64,
      999999
    ), true)
)`
