/**
 * Per-signal scoring formulas. Mirror the case-tables and weights from
 * DEVICE_SCORES_CTE in src/worker/queries/alt-scores.ts. Keep these two
 * in sync — any drift means the device-drivers panel's computed category
 * total won't match what firehose.scores.biggest_movers returns.
 */

// ── value → sub-score (0-100) ──
const pressureScore = (v) => {
  switch ((v || '').toLowerCase()) {
    case 'none':     return 100
    case 'light':    return 85
    case 'elevated': return 60
    case 'severe':   return 30
    default:         return v ? 75 : null
  }
}

const compressionScore = (v) => {
  switch ((v || '').toLowerCase()) {
    case 'low':      return 100
    case 'moderate': return 85
    case 'high':     return 65
    default:         return v ? 75 : null
  }
}

const rssScore = (mb) => {
  const n = Number(mb)
  if (!isFinite(n)) return null
  if (n < 2048) return 100
  if (n < 4096) return 80
  if (n < 8192) return 60
  return 30
}

const uptimeRiskScore = (v) => {
  switch ((v || '').toLowerCase()) {
    case 'just_rebooted': return 100
    case 'fresh':         return 100
    case 'normal':        return 90
    case 'stale_7d':      return 60
    case 'stale_14d':     return 30
    default:              return v ? 80 : null
  }
}

const batteryScore = (v) => {
  switch ((v || '').toLowerCase()) {
    case 'good':     return 100
    case 'degraded': return 60
    case 'replace':  return 20
    default:         return v ? 80 : null
  }
}

const osCurrencyScore = (v) => {
  switch ((v || '').toLowerCase()) {
    case 'current':   return 100
    case 'n_minus_1': return 70
    case 'n_minus_2': return 40
    case 'legacy':    return 20
    default:          return v ? 80 : null
  }
}

const dexOsHealthScore = (v) => {
  switch ((v || '').toLowerCase()) {
    case 'healthy':    return 100
    case 'acceptable': return 70
    case 'degraded':   return 30
    default:           return v ? 70 : null
  }
}

const crashScore = (n) => {
  const x = Number(n)
  if (!isFinite(x)) return null
  if (x === 0) return 100
  if (x === 1) return 85
  if (x <= 4) return 65
  if (x <= 9) return 40
  return 20
}

const activePctScore = (n) => {
  const x = Number(n)
  if (!isFinite(x)) return null
  if (x >= 80) return 100
  if (x >= 60) return 80
  if (x >= 40) return 60
  return 40
}

const appCountScore = (n) => {
  const x = Number(n)
  if (!isFinite(x)) return null
  if (x < 80)  return 100
  if (x < 120) return 80
  if (x < 160) return 60
  return 40
}

// ── value formatting for display ──
const fmtRss = (mb) => {
  const n = Number(mb)
  if (!isFinite(n) || !n) return null
  return n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${Math.round(n)} MB`
}

const fmtCrashes = (n) => {
  const x = Number(n)
  if (!isFinite(x)) return null
  return `${x} crash${x === 1 ? '' : 'es'}`
}

const fmtPct = (n) => {
  const x = Number(n)
  if (!isFinite(x)) return null
  return `${Math.round(x)}%`
}

// ── category × signal table ──
// Mirrors DEVICE_SCORES_CTE in alt-scores.ts (lines 43-115). Each row says:
// "for this category, this signal contributes (weight) × score(value)."
export const CATEGORY_RULES = {
  performance: {
    label: 'Performance',
    weight: 0.35,  // composite weight
    signals: [
      { key: 'swap_pressure', label: 'Swap pressure',  weight: 0.35, scoreFn: pressureScore },
      { key: 'compression',   label: 'Compression',    weight: 0.30, scoreFn: compressionScore },
      { key: 'max_rss_mb',    label: 'Max process RSS', weight: 0.20, scoreFn: rssScore, fmtFn: fmtRss },
      { key: 'uptime_risk',   label: 'Uptime risk',    weight: 0.15, scoreFn: uptimeRiskScore },
    ],
  },
  device_health: {
    label: 'Device Health',
    weight: 0.25,
    signals: [
      // CPU and RAM are static hardware traits — they don't change period-over-
      // period for the same host, so we don't bother showing prev for them.
      { key: 'cpu_class',    label: 'CPU class',  weight: 0.30, scoreFn: () => null, static: true },
      { key: 'ram_tier',     label: 'RAM tier',   weight: 0.25, scoreFn: () => null, static: true },
      { key: 'battery',      label: 'Battery',    weight: 0.25, scoreFn: batteryScore },
      { key: 'swap_pressure', label: 'Swap pressure (shared w/ Performance)', weight: 0.20, scoreFn: pressureScore },
    ],
  },
  security: {
    label: 'Security',
    weight: 0.20,
    signals: [
      { key: 'os_currency',   label: 'OS currency',   weight: 0.50, scoreFn: osCurrencyScore },
      { key: 'dex_os_health', label: 'DEX OS health', weight: 0.50, scoreFn: dexOsHealthScore },
    ],
  },
  software: {
    label: 'Software',
    weight: 0.20,
    signals: [
      { key: 'crashes',    label: 'Crashes (7d)',    weight: 0.40, scoreFn: crashScore,     fmtFn: fmtCrashes },
      { key: 'active_pct', label: 'Active apps %',   weight: 0.35, scoreFn: activePctScore, fmtFn: fmtPct },
      { key: 'app_count',  label: 'Installed apps',  weight: 0.25, scoreFn: appCountScore },
    ],
  },
}

/**
 * Take the wide row from firehose.scores.device_signals_compare and produce
 * a structured per-category breakdown ready for ScoreDriverPanel.
 *
 * Returns { categories: [...], primaryDriver: 'performance' | ... } or null.
 */
export function buildSignalDrivers(row) {
  if (!row) return null

  // Map signal keys → the raw values present in the wide row. Some signal
  // keys are reused across categories (swap shows up in Performance and
  // Device Health) — we look them up once and let each category reference
  // the same value pair.
  const raw = {
    swap_pressure:  { curr: row.curr_swap_pressure, prev: row.prev_swap_pressure },
    compression:    { curr: row.curr_compression,   prev: row.prev_compression },
    max_rss_mb:     { curr: row.curr_max_rss_mb,    prev: row.prev_max_rss_mb },
    uptime_risk:    { curr: row.curr_uptime_risk,   prev: row.prev_uptime_risk },
    battery:        { curr: row.curr_battery,       prev: row.prev_battery },
    cpu_class:      { curr: row.curr_cpu_class,     prev: row.curr_cpu_class },
    ram_tier:       { curr: row.curr_ram_tier,      prev: row.curr_ram_tier },
    os_currency:    { curr: row.curr_os_currency,   prev: row.prev_os_currency },
    dex_os_health:  { curr: row.curr_dex_os_health, prev: row.prev_dex_os_health },
    crashes:        { curr: row.curr_crashes,       prev: row.prev_crashes },
    active_pct:     { curr: row.curr_active_pct,    prev: row.prev_active_pct },
    app_count:      { curr: row.curr_app_count,     prev: row.prev_app_count },
  }

  const round1 = (n) => n == null ? null : Math.round(n * 10) / 10

  const categories = Object.entries(CATEGORY_RULES).map(([key, cat]) => {
    const signals = cat.signals.map((s) => {
      const r = raw[s.key] || { curr: null, prev: null }
      const currScore = s.scoreFn(r.curr)
      const prevScore = s.scoreFn(r.prev)
      const contribution =
        currScore !== null && prevScore !== null
          ? round1((currScore - prevScore) * s.weight)
          : null
      return {
        key: s.key,
        label: s.label,
        weight: s.weight,
        curr: r.curr,
        prev: r.prev,
        curr_display: s.fmtFn ? s.fmtFn(r.curr) : (r.curr ?? null),
        prev_display: s.fmtFn ? s.fmtFn(r.prev) : (r.prev ?? null),
        curr_score: currScore,
        prev_score: prevScore,
        contribution,
        static: !!s.static,
        unchanged:
          r.curr !== null && r.prev !== null && String(r.curr) === String(r.prev),
      }
    })

    // Category-level prev/curr score and delta from summed weighted sub-scores.
    let currTotal = 0, prevTotal = 0, hasAny = false
    for (const s of signals) {
      if (s.curr_score !== null) { currTotal += s.curr_score * s.weight; hasAny = true }
      if (s.prev_score !== null) prevTotal += s.prev_score * s.weight
    }
    const currCategory = hasAny ? Math.round(currTotal) : null
    const prevCategory = signals.some(s => s.prev_score !== null) ? Math.round(prevTotal) : null
    const delta =
      currCategory !== null && prevCategory !== null ? currCategory - prevCategory : null

    // Within-category driver = signal with largest |contribution|
    const ranked = signals
      .filter((s) => s.contribution !== null)
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    const driverKey = ranked[0]?.key || null
    signals.forEach((s) => { s.is_driver = s.key === driverKey && Math.abs(s.contribution || 0) > 0 })

    return {
      key,
      label: cat.label,
      weight: cat.weight,
      curr: currCategory,
      prev: prevCategory,
      delta,
      signals,
      driverKey,
    }
  })

  // Primary driver category = the one whose absolute composite-weighted delta is largest.
  // (delta is already in category-score units; composite weight gives us how much that
  // category influenced the overall move.)
  let primaryDriver = null
  let maxAbs = 0
  for (const c of categories) {
    if (c.delta === null) continue
    const composite_contribution = Math.abs(c.delta * c.weight)
    if (composite_contribution > maxAbs) {
      maxAbs = composite_contribution
      primaryDriver = c.key
    }
  }

  return { categories, primaryDriver }
}
