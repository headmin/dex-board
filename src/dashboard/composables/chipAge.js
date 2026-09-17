/**
 * Chip generation → age context. A device cannot be newer than its chip,
 * so the chip gives a deterministic *minimum* age — enough to separate
 * "old and weak → refresh" from "new and weak → investigate" without any
 * new telemetry.
 *
 * Age resolution now comes from chipTier, which prefers cpu_brand ("Apple M1
 * Max") over the generation-only cpu_class enum ("apple_m1"). That matters for
 * age, not just labelling: the Pro/Max/Ultra bins of a generation ship up to
 * 18 months after its base chip, so ageing an M1 Max off the base-M1 date
 * overstated its age by a year and could push a healthy host onto the refresh
 * list. Pass cpu_brand wherever the query returns it.
 */
import { chipSpec } from './chipTier'

const CURRENT_GEN = 5 // Apple M5 era

/**
 * Age + identity context for a host's chip.
 *
 * @param {string} cpuClass  generation-only enum, e.g. "apple_m1"
 * @param {string} [cpuBrand] system_info.cpu_brand, e.g. "Apple M1 Max" —
 *   optional only for callers whose query does not return it; supplying it
 *   sharpens both the label and the release year.
 * @returns {null | { year, gensBehind, pretty, label, tier, family, exact }}
 */
export function chipInfo(cpuClass, cpuBrand) {
  const spec = chipSpec(cpuBrand, cpuClass)
  if (!spec) return null
  return {
    year: spec.year,
    // Generations behind stays a whole-generation measure: an M1 Max is still
    // M1-era silicon. Tier refines WHEN it shipped, not WHICH generation it
    // belongs to, and the refresh quadrant gates on the latter.
    gensBehind: spec.vendor === 'intel'
      ? CURRENT_GEN + 1
      : Math.max(0, CURRENT_GEN - spec.generation),
    pretty: spec.pretty,
    label: spec.label,
    tier: spec.tier,
    family: spec.family,
    // false when the tier could not be resolved (cpu_class-only host, or
    // Intel, which has no tier axis) — callers that draw a tier distinction
    // must not present such a host as a confirmed base-tier machine.
    exact: spec.exact,
  }
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
  //
  // Weakness is score-based OR pressure-based: sustained SEVERE swap counts
  // as weak on its own, so a new-but-drowning host can still reach the
  // "Investigate" verdict that exists exactly for it. (Battery 'replace' is
  // handled before this function is called — see Lifecycle hostVerdict — so
  // the quadrant here only judges age × workload strain.)
  if (persistence) {
    const { weakDays = 0, reportDays = 0, severeDays = 0 } = persistence
    const enough = reportDays >= 5
    const sustained = enough && weakDays >= Math.max(3, reportDays * 0.5)
    const sustainedSevere = enough && severeDays >= Math.max(3, reportDays * 0.5)
    const isWeak = weak || sustainedSevere
    if (old && isWeak && sustained) return { key: 'refresh', label: 'Refresh candidate', tone: 'critical' }
    if (!old && isWeak && sustained) return { key: 'investigate', label: 'Investigate', tone: 'fair' }
    if (isWeak || sustained) return { key: 'watch', label: 'Watch', tone: 'fair' }
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
