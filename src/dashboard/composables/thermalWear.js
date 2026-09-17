/**
 * Thermal wear — pure helpers over firehose.thermal.host_baselines rows.
 *
 * The dust-buildup reading: a host whose idle fan baseline sits well above
 * the fleet's, or that spends a large share of its time at max fan, is
 * working harder to stay cool than its peers. Neither proves dust — a hot
 * office or a runaway process does the same — so the page calls these
 * "candidates for a look", never "dusty".
 *
 * No Vue, no DOM — runs under plain `node --test`.
 */

/** Minimum idle samples before a host's baseline is trusted at all. */
export const MIN_IDLE_SAMPLES = 12
/** Idle RPM at or above this multiple of the fleet median flags a host. */
export const IDLE_RPM_RATIO = 1.25
/** Share of samples at ≥90% max RPM that flags a host on its own. */
export const AT_MAX_SHARE = 0.2
/** Hosts needed before a correlation coefficient is shown. */
export const MIN_HOSTS_FOR_CORRELATION = 8

const num = v => (v == null || v === '' ? null : Number(v))

/** Coerce a baseline row; null where the query returned NULL. */
export function normalizeBaseline(r) {
  return {
    hostId: r.host_id,
    hostname: r.hostname || r.host_id,
    hardwareModel: r.hardware_model || '',
    cpuBrand: r.cpu_brand || '',
    fanCount: num(r.fan_count) || 0,
    samples: num(r.samples) || 0,
    idleSamples: num(r.idle_samples) || 0,
    idleRpm: num(r.idle_rpm_median),
    rpmP90: num(r.rpm_p90),
    pctAtMax: num(r.pct_at_max),
    fanMaxRpm: num(r.fan_max_rpm) || 0,
    heatsinkIdleC: num(r.heatsink_idle_c),
    tempMaxMedianC: num(r.temp_max_median_c),
    batteryCycles: num(r.battery_cycles),
    batteryHealthPct: num(r.battery_health_pct),
    batteryHealth: r.battery_health || '',
    firstSeen: r.first_seen || null,
    lastSeen: r.last_seen || null,
  }
}

/** Median of a numeric array; null when empty. */
export function median(values) {
  const v = values.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

/** Pearson r over paired finite values; null under MIN_HOSTS_FOR_CORRELATION pairs or zero variance. */
export function pearson(pairs) {
  const p = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  const n = p.length
  if (n < MIN_HOSTS_FOR_CORRELATION) return null
  const mx = p.reduce((s, [x]) => s + x, 0) / n
  const my = p.reduce((s, [, y]) => s + y, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (const [x, y] of p) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2 }
  if (sxx === 0 || syy === 0) return null
  return Math.round((sxy / Math.sqrt(sxx * syy)) * 1000) / 1000
}

/** Plain-language reading of an r value, with the sample size it stands on. */
export function describeCorrelation(r, n) {
  if (r == null) return n < MIN_HOSTS_FOR_CORRELATION ? `needs ${MIN_HOSTS_FOR_CORRELATION} hosts with a fan baseline, has ${n}` : 'no variance to correlate'
  const a = Math.abs(r)
  const strength = a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'no meaningful'
  const dir = r > 0 ? 'positive' : 'negative'
  return a >= 0.2 ? `${strength} ${dir} correlation across ${n} hosts` : `${strength} correlation across ${n} hosts`
}

/**
 * The fleet reading: coverage, the fleet idle baseline, wear candidates,
 * and the fan-vs-battery correlations (computed here from the same rows the
 * scatter plots, so the number and the picture always agree).
 */
export function thermalWear(rawRows) {
  const rows = (rawRows || []).map(normalizeBaseline)
  const withFan = rows.filter(r => r.fanCount > 0)
  const baselined = withFan.filter(r => r.idleRpm != null && r.idleSamples >= MIN_IDLE_SAMPLES)
  const fleetIdleRpm = median(baselined.map(r => r.idleRpm))

  const candidates = baselined
    .map(r => {
      const ratio = fleetIdleRpm ? r.idleRpm / fleetIdleRpm : null
      const reasons = []
      if (ratio != null && ratio >= IDLE_RPM_RATIO) reasons.push(`idle fan ${Math.round((ratio - 1) * 100)}% above fleet median`)
      if (r.pctAtMax != null && r.pctAtMax >= AT_MAX_SHARE) reasons.push(`${Math.round(r.pctAtMax * 100)}% of samples at max fan`)
      return { ...r, idleRatio: ratio, reasons }
    })
    .filter(r => r.reasons.length)
    .sort((a, b) => (b.idleRatio || 0) - (a.idleRatio || 0) || (b.pctAtMax || 0) - (a.pctAtMax || 0))

  const cyclePairs = baselined.filter(r => r.batteryCycles > 0).map(r => [r.idleRpm, r.batteryCycles])
  const healthPairs = baselined.filter(r => r.batteryHealthPct > 0).map(r => [r.idleRpm, r.batteryHealthPct])
  const atMaxPairs = withFan.filter(r => r.pctAtMax != null && r.batteryCycles > 0).map(r => [r.pctAtMax, r.batteryCycles])

  return {
    hostsReporting: rows.length,
    hostsWithFan: withFan.length,
    hostsFanless: rows.length - withFan.length,
    hostsBaselined: baselined.length,
    fleetIdleRpm,
    candidates,
    correlations: {
      idleRpmVsCycles: { r: pearson(cyclePairs), n: cyclePairs.length },
      idleRpmVsHealth: { r: pearson(healthPairs), n: healthPairs.length },
      atMaxVsCycles: { r: pearson(atMaxPairs), n: atMaxPairs.length },
    },
    points: baselined,
    rows,
  }
}
