/**
 * Chip tier resolution: family (M1…M5) × tier (base / Pro / Max / Ultra).
 *
 * `cpu_class` — the enum the query pack emits and every chart groups by — is
 * generation-only. M1, M1 Pro, M1 Max and M1 Ultra all arrive as `apple_m1`
 * and score identically (see the CASE in core-scores.ts). That collapse hides
 * the most actionable hardware distinction in a Mac fleet: a base M1 swapping
 * hard is under-specced (add RAM, or move the workload), while an M1 Max
 * swapping hard is genuinely at its limit (a real refresh). Age alone cannot
 * separate those two — they are the same generation.
 *
 * `cpu_brand` recovers the tier for free: osquery's system_info.cpu_brand
 * reports the marketing string verbatim on Apple Silicon ("Apple M1 Max"),
 * and it is already collected by the pack and materialized into both
 * device_health and hardware_inventory. No new telemetry, and no board-id
 * (`Mac15,6`) lookup table — that would need a new row for every Mac Apple
 * ships and be silently wrong for every one it hasn't.
 *
 * Honest-default rule, load-bearing here: when only cpu_class is available,
 * `tier` is null — never 'base'. "We cannot see the tier" and "it is the base
 * chip" are different claims, and telemetry only supports the first.
 */

/** Tier vocabulary, weakest → strongest. Order is the chart/sort order. */
export const CHIP_TIERS = ['base', 'pro', 'max', 'ultra']

const TIER_RANK = { base: 0, pro: 1, max: 2, ultra: 3 }
const TIER_SUFFIX = { base: '', pro: ' Pro', max: ' Max', ultra: ' Ultra' }

/**
 * Announce dates per (generation, tier) — the Pro/Max/Ultra bins of a
 * generation ship up to 18 months after its base chip, so tier genuinely
 * refines age. An M1 Max is a 2021 machine, not a 2020 one; ageing it from
 * the base-M1 date overstates its age by a year and can push a healthy host
 * onto a refresh list. Keyed [generation][tier]; year granularity, which is
 * all chipAge's age bands need. A generation with no Ultra bin simply omits
 * the key — chipSpec then reports year: null rather than inventing one.
 */
// Maintenance: add a row per new generation and a key per new bin. A missing
// bin yields year: null (chipAge then shows "?" for age) rather than a guess —
// so a freshly shipped M5 Pro degrades to "current silicon, age unknown", not
// to a wrong date. Bump CURRENT_GEN in chipAge.js at the same time.
const APPLE_TIER_YEAR = {
  1: { base: 2020, pro: 2021, max: 2021, ultra: 2022 },
  2: { base: 2022, pro: 2023, max: 2023, ultra: 2023 },
  3: { base: 2023, pro: 2023, max: 2023, ultra: 2025 },
  4: { base: 2024, pro: 2024, max: 2024 },
  5: { base: 2025 },
}

/**
 * Parse the authoritative brand string, falling back to the coarse enum.
 *
 * @param {string} cpuBrand  system_info.cpu_brand, e.g. "Apple M1 Max"
 * @param {string} cpuClass  pack enum, e.g. "apple_m1" — generation only
 * @returns {null | {
 *   vendor: 'apple'|'intel', family: string, generation: number|null,
 *   tier: 'base'|'pro'|'max'|'ultra'|null, tierRank: number|null,
 *   key: string, label: string, bucketLabel: string, pretty: string,
 *   year: number|null,
 *   source: 'cpu_brand'|'cpu_class', exact: boolean,
 * }}
 */
export function chipSpec(cpuBrand, cpuClass) {
  const brand = String(cpuBrand ?? '').trim()

  // ── Apple Silicon, from the brand string (authoritative) ──
  // "Apple M1", "Apple M1 Pro", "Apple M2 Max", "Apple M1 Ultra".
  const apple = brand.match(/\bApple\s+M(\d+)(?:\s+(Pro|Max|Ultra))?\b/i)
  if (apple) {
    const generation = Number(apple[1])
    const tier = apple[2] ? apple[2].toLowerCase() : 'base'
    return appleSpec(generation, tier, 'cpu_brand')
  }

  // ── Intel, from the brand string ──
  // "Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz" -> i7
  if (/\bintel\b/i.test(brand)) {
    const core = brand.match(/\bi([3579])\b|\bi([3579])-/i)
    const family = core ? `i${core[1] ?? core[2]}` : null
    return intelSpec(family, 'cpu_brand')
  }

  // ── Fallback: the coarse enum. Generation only, tier unknowable. ──
  const c = String(cpuClass ?? '').trim().toLowerCase()
  const appleEnum = c.match(/^apple_m(\d+)/)
  if (appleEnum) return appleSpec(Number(appleEnum[1]), null, 'cpu_class')
  if (c.startsWith('intel')) {
    const m = c.match(/^intel_(i[3579])/)
    return intelSpec(m ? m[1] : null, 'cpu_class')
  }
  return null
}

function appleSpec(generation, tier, source) {
  const family = `M${generation}`
  return {
    vendor: 'apple',
    family,
    generation,
    tier,
    tierRank: tier ? TIER_RANK[tier] : null,
    // Stable group-by key. Tier-unknown hosts get an explicit `_unknown`
    // bucket rather than being folded into the base chip's — a chart must not
    // imply a count it cannot support. The bare `apple_m1` string is
    // deliberately NOT reused: that is cpu_class's own vocabulary, where it
    // means the whole collapsed generation, and overloading it to mean
    // "tier unresolved" would make the two indistinguishable downstream.
    key: `apple_m${generation}_${tier ?? 'unknown'}`,
    // `label`/`pretty` stay clean — an unresolved tier degrades to the plain
    // generation ("M1"), which is exactly what the old cpu_class-only label
    // said and reads fine in a table cell. `bucketLabel` is the chart variant:
    // sitting beside "M1" and "M1 Max" in a distribution, an unresolved
    // bucket has to disambiguate itself or it reads as the base chip.
    label: `${family}${tier ? TIER_SUFFIX[tier] : ''}`,
    pretty: `Apple ${family}${tier ? TIER_SUFFIX[tier] : ''}`,
    bucketLabel: tier ? `${family}${TIER_SUFFIX[tier]}` : `${family} (unknown)`,
    year: APPLE_TIER_YEAR[generation]?.[tier ?? 'base'] ?? null,
    source,
    exact: source === 'cpu_brand',
  }
}

function intelSpec(family, source) {
  return {
    vendor: 'intel',
    family: family ?? 'Intel',
    generation: null,
    tier: null,
    tierRank: null,
    key: family ? `intel_${family}` : 'intel',
    label: family ? `Intel ${family}` : 'Intel',
    pretty: family ? `Intel Core ${family}` : 'Intel',
    bucketLabel: family ? `Intel ${family}` : 'Intel',
    // Apple's last Intel Macs shipped 2020; chipAge already treats the whole
    // Intel population as one pre-Silicon cohort rather than guessing a year.
    year: 2020,
    source,
    exact: false,
  }
}

/**
 * Sort key placing the fleet oldest/weakest → newest/strongest: Intel first,
 * then by generation, then by tier within a generation. Tier-unknown sorts
 * ahead of the known tiers of its own generation, so an `apple_m1` bucket
 * never appears to outrank an M1 Max.
 */
export function chipSortKey(spec) {
  if (!spec) return -1000
  if (spec.vendor === 'intel') return -100 + (TIER_RANK[spec.family] ?? 0)
  return spec.generation * 10 + (spec.tierRank ?? -1)
}

/** Display label straight from the raw columns, for templates. */
export function chipLabel(cpuBrand, cpuClass) {
  return chipSpec(cpuBrand, cpuClass)?.label ?? null
}

/**
 * Count hosts per chip, tier-aware — the breakdown `cpu_class` cannot give.
 * Returns [{ key, label, family, tier, device_count, exact }] in fleet age
 * order. `exact` is false when any host in the bucket was resolved from
 * cpu_class alone, so the caller can mark the bucket rather than overstate it.
 *
 * Accepts either per-host rows (one row = one host) or rows already grouped in
 * SQL — pass `countKey` for the latter. Brand strings are LowCardinality, so
 * grouping server-side returns a dozen rows instead of the whole fleet.
 */
export function chipDistribution(rows, {
  brandKey = 'cpu_brand',
  classKey = 'cpu_class',
  countKey = null,
} = {}) {
  const buckets = new Map()
  for (const row of rows ?? []) {
    const spec = chipSpec(row?.[brandKey], row?.[classKey])
    if (!spec) continue
    const n = countKey ? Number(row?.[countKey]) || 0 : 1
    const b = buckets.get(spec.key) ?? {
      key: spec.key, label: spec.bucketLabel, tier: spec.tier,
      family: spec.family, device_count: 0, exact: true, _sort: chipSortKey(spec),
    }
    b.device_count += n
    if (!spec.exact) b.exact = false
    buckets.set(spec.key, b)
  }
  return [...buckets.values()].sort((a, b) => a._sort - b._sort)
}

/**
 * Roll arbitrary per-chip aggregates up into tier-aware buckets.
 *
 * chipDistribution only sums a count. This is its general form, for rows that
 * already carry aggregates from SQL (battery cycles, capacity, ...). Two rows
 * can land in the same bucket -- a host resolved from cpu_brand and one that
 * only had cpu_class -- so the merge has to be weighted, not a plain average
 * of averages, which would let a 1-host row outvote a 30-host one.
 *
 * @param rows    grouped rows, e.g. firehose.health.battery_by_chip
 * @param sums    fields to add together across merged rows
 * @param means   { field: weightField } -- weighted by that row's weightField
 * @param maxes   fields to take the max of
 */
export function chipRollup(rows, {
  brandKey = 'cpu_brand',
  classKey = 'cpu_class',
  countKey = 'device_count',
  sums = [],
  means = {},
  maxes = [],
} = {}) {
  const buckets = new Map()
  for (const row of rows ?? []) {
    const spec = chipSpec(row?.[brandKey], row?.[classKey])
    if (!spec) continue
    let b = buckets.get(spec.key)
    if (!b) {
      b = {
        key: spec.key, label: spec.bucketLabel, family: spec.family,
        tier: spec.tier, year: spec.year, exact: true,
        [countKey]: 0, _sort: chipSortKey(spec), _w: {},
      }
      for (const f of sums) b[f] = 0
      for (const f of maxes) b[f] = null
      for (const f of Object.keys(means)) { b[f] = null; b._w[f] = 0 }
      buckets.set(spec.key, b)
    }
    b[countKey] += Number(row?.[countKey]) || 0
    if (!spec.exact) b.exact = false
    for (const f of sums) b[f] += Number(row?.[f]) || 0
    for (const f of maxes) {
      const v = Number(row?.[f])
      if (Number.isFinite(v) && (b[f] == null || v > b[f])) b[f] = v
    }
    for (const [f, weightKey] of Object.entries(means)) {
      const v = Number(row?.[f])
      const w = Number(row?.[weightKey]) || 0
      // A null/absent mean contributes nothing AND claims no weight, so a
      // bucket whose every row was unmeasured stays null rather than 0.
      if (!Number.isFinite(v) || w <= 0) continue
      b[f] = (b[f] ?? 0) + v * w
      b._w[f] += w
    }
  }
  return [...buckets.values()]
    .map(b => {
      for (const [f] of Object.entries(means)) {
        b[f] = b._w[f] > 0 ? Math.round((b[f] / b._w[f]) * 10) / 10 : null
      }
      delete b._w
      return b
    })
    .sort((a, b) => a._sort - b._sort)
}
