/**
 * Shared fleet-filter infrastructure for firehose queries.
 *
 * Any query that wants to respect the fleet filter bar (search/model/ramTier/os)
 * should:
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
]

/**
 * CTE body — NOT wrapped in `WITH`. Callers inline it:
 *   `WITH ${FILTERED_HOSTS_CTE}, other_cte AS (...) SELECT ...`
 * Or for single-CTE queries:
 *   `WITH ${FILTERED_HOSTS_CTE} SELECT ... WHERE host_id IN (SELECT host_id FROM filtered_hosts)`
 *
 * Platform comes from fleetd_info (LEFT JOIN so hosts missing fleetd data
 * aren't dropped when no platform filter is set).
 */
export const FILTERED_HOSTS_CTE = `
filtered_hosts AS (
  SELECT hi.host_id FROM (
    SELECT host_id,
      argMax(hostname, timestamp) AS hostname,
      argMax(hardware_model, timestamp) AS hardware_model,
      argMax(hardware_serial, timestamp) AS hardware_serial,
      argMax(memory_gb, timestamp) AS memory_gb
    FROM hardware_inventory GROUP BY host_id
  ) hi
  LEFT JOIN (
    SELECT host_id, argMax(platform, timestamp) AS platform
    FROM fleetd_info GROUP BY host_id
  ) fi ON hi.host_id = fi.host_id
  LEFT JOIN (
    -- Most recent team per host. host_teams holds one row per (host, team)
    -- pair with last_seen; argMax picks the latest team if a host moved.
    SELECT host_id, argMax(team_id, last_seen) AS team_id
    FROM host_teams GROUP BY host_id
  ) ht ON hi.host_id = ht.host_id
  WHERE 1=1
    AND if({filterSearch:String} != '',
      hi.hostname LIKE concat('%', {filterSearch:String}, '%')
      OR hi.hardware_serial LIKE concat('%', {filterSearch:String}, '%')
      OR hi.hardware_model LIKE concat('%', {filterSearch:String}, '%'),
      true)
    AND if({filterModel:String} != '', hi.hardware_model = {filterModel:String}, true)
    AND if({filterOs:String} != '', fi.platform = {filterOs:String}, true)
    AND if({filterTeam:String} != '', ht.team_id = {filterTeam:String}, true)
    -- RAM filter is "at most N GB" (inclusive) — selecting 24GB returns
    -- hosts with <= 24GB (i.e. 8, 16, 18, 24). "128GB+" effectively matches all.
    AND if({filterRamTier:String} != '', hi.memory_gb <= multiIf(
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
