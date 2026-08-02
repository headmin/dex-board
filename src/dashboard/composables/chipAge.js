/**
 * Chip generation → age context. A device cannot be newer than its chip,
 * so cpu_class gives a deterministic *minimum* age — enough to separate
 * "old and weak → refresh" from "new and weak → investigate" without any
 * new telemetry. (hardware_model could refine this to exact model release
 * dates later.)
 */
import { humanizeToken } from './humanize'

const CURRENT_GEN = 5 // Apple M5 era

const APPLE_YEAR = { 1: 2020, 2: 2022, 3: 2023, 4: 2024, 5: 2025 }

/** cpu_class -> { year, gensBehind, pretty } | null when unknown */
export function chipInfo(cpuClass) {
  const c = String(cpuClass || '').toLowerCase()
  const m = c.match(/^apple_m(\d+)/)
  if (m) {
    const gen = Number(m[1])
    return {
      year: APPLE_YEAR[gen] ?? null,
      gensBehind: Math.max(0, CURRENT_GEN - gen),
      pretty: humanizeToken(c),
    }
  }
  if (c.startsWith('intel')) {
    return { year: 2020, gensBehind: CURRENT_GEN + 1, pretty: humanizeToken(c) }
  }
  return null
}

/** Chip tone for age context: 0-1 current, 2 mid-life, 3 aging, 4+ old */
export function ageTone(gensBehind) {
  if (gensBehind == null) return 'neutral'
  if (gensBehind <= 1) return 'neutral'
  if (gensBehind === 2) return 'fair'
  if (gensBehind === 3) return 'elevated'
  return 'critical'
}

/**
 * The decision quadrant: performance x chip age.
 * Weak score on old silicon -> replace; weak score on new silicon ->
 * investigate the workload/config before spending money.
 */
export function verdictFor(weak, gensBehind, persistence = null) {
  const old = gensBehind != null && gensBehind >= 3

  // Trend-aware when 30d history is supplied: a verdict must be EARNED by
  // sustained weakness, not one bad day. Sustained = weak on >=50% of
  // reporting days, with at least 5 days of history.
  if (persistence) {
    const { weakDays = 0, reportDays = 0 } = persistence
    const sustained = reportDays >= 5 && weakDays >= Math.max(3, reportDays * 0.5)
    if (old && weak && sustained) return { key: 'refresh', label: 'Refresh candidate', tone: 'critical' }
    if (!old && weak && sustained) return { key: 'investigate', label: 'Investigate', tone: 'fair' }
    if (weak || (sustained && !weak)) return { key: 'watch', label: 'Watch', tone: 'fair' }
    if (old) return { key: 'defer', label: 'Defer OK', tone: 'good' }
    return { key: 'healthy', label: 'Healthy', tone: 'neutral' }
  }

  // Point-in-time fallback (no history available)
  if (old && weak) return { key: 'refresh', label: 'Refresh candidate', tone: 'critical' }
  if (!old && weak) return { key: 'investigate', label: 'Investigate', tone: 'fair' }
  if (old && !weak) return { key: 'defer', label: 'Defer OK', tone: 'good' }
  return { key: 'healthy', label: 'Healthy', tone: 'neutral' }
}

/** Composite/DEX score semantics (higher = better). */
export function refreshVerdict(score, gensBehind) {
  return verdictFor(score != null && Number(score) < 65, gensBehind)
}
