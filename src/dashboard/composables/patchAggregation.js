/**
 * Shared MTTP aggregation helpers over `timeline_patches_summary` rows.
 * Clock: days_to_patch = fleet-first sighting of a version → this host
 * applies it (fleet-internal). NOT vendor-publication-to-patched.
 */

/** Host-weighted fleet MTTP across per-day/per-software summary rows. */
export function wtdMttp(rows) {
  let h = 0, wl = 0
  for (const r of (rows || [])) {
    const hosts = Number(r.hosts || 0)
    h += hosts
    wl += hosts * Number(r.avg_lag || 0)
  }
  return h > 0 ? +(wl / h).toFixed(2) : null
}

/**
 * Collapse per-day summary rows into per-software rows (MttpTable shape):
 * {software_name, hosts, avg_lag (host-weighted), min_lag, max_lag, distinct_lags}
 */
export function aggregatePatchRowsBySoftware(rows, limit = 10) {
  const bySw = new Map()
  for (const r of (rows || [])) {
    const k = r.software_name
    if (!bySw.has(k)) {
      bySw.set(k, {
        software_name: k,
        hosts: 0,
        weightedLagSum: 0,
        min_lag: Number(r.min_lag),
        max_lag: Number(r.max_lag),
        maxDistinct: Number(r.distinct_lags || 0),
      })
    }
    const agg = bySw.get(k)
    const hosts = Number(r.hosts || 0)
    agg.hosts += hosts
    agg.weightedLagSum += hosts * Number(r.avg_lag || 0)
    agg.min_lag = Math.min(agg.min_lag, Number(r.min_lag))
    agg.max_lag = Math.max(agg.max_lag, Number(r.max_lag))
    agg.maxDistinct = Math.max(agg.maxDistinct, Number(r.distinct_lags || 0))
  }
  return Array.from(bySw.values())
    .map(a => ({
      software_name: a.software_name,
      hosts: a.hosts,
      avg_lag: a.hosts > 0 ? +(a.weightedLagSum / a.hosts).toFixed(2) : 0,
      min_lag: +a.min_lag.toFixed(2),
      max_lag: +a.max_lag.toFixed(2),
      distinct_lags: a.maxDistinct,
    }))
    .sort((x, y) => y.hosts - x.hosts)
    .slice(0, limit)
}
