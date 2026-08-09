import { query } from '../services/api'

/**
 * Cohort impact — "measured, not inferred". A staged rollout is an
 * experiment the fleet already ran: hosts that received a change are the
 * exposed cohort, hosts still waiting are the control. Effect = difference
 * in mean composite-score change (now vs 7d ago) between the cohorts, with
 * a 95% interval (Welch/normal approximation) and named confounders.
 *
 * Rules (rendered next to the table — keep code and copy in sync):
 *   - Control cohort ≥ MIN_CONTROL hosts, or the row is "not measurable".
 *   - Any other change reaching ≥50% of the same exposed hosts in the
 *     window is named as a confounder.
 *   - "Likely caused" is the strongest verdict this engine emits.
 *
 * Metric limitation, stated honestly: the only per-host before/after we
 * have is the composite score over the trailing 7 days (host_deltas).
 * Effects are therefore "composite score change, exposed vs waiting" —
 * not per-metric (memory, crash-rate) effects.
 */

export const COHORT_RULES = {
  MIN_CONTROL: 25,
  MIN_EXPOSED: 5,
  THIN_EVIDENCE: 50,      // min cohort size below which an excluding-zero CI is "wide interval"
  CONFOUNDER_OVERLAP: 0.5,
}

/**
 * Metrics the impact engine can judge a rollout on. Cohort membership is
 * identical across all of them (who got the update vs who's waiting); only
 * the per-host delta changes. The composite is the primary/headline metric
 * — categories are checked so a change that moved one sub-score (a memory
 * fix, a crash fix) is still visible when the composite stays flat. All are
 * higher-is-better, so a positive effect = the exposed cohort improved more.
 */
export const IMPACT_METRICS = [
  { key: 'delta',               label: 'overall score' },
  { key: 'delta_performance',   label: 'memory & responsiveness' },
  { key: 'delta_security',      label: 'security posture' },
  { key: 'delta_device_health', label: 'device health' },
  { key: 'delta_software',      label: 'app health' },
]

function meanStd(xs) {
  const n = xs.length
  if (!n) return { n: 0, mean: null, sd: null }
  const mean = xs.reduce((s, x) => s + x, 0) / n
  const varr = n > 1 ? xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0
  return { n, mean, sd: Math.sqrt(varr) }
}

// Standard normal CDF (Abramowitz–Stegun approximation) for the p-value.
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp(-z * z / 2)
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

/** Welch comparison of two delta samples → effect + CI95 + p (normal approx). */
export function cohortCompare(exposedDeltas, controlDeltas) {
  const e = meanStd(exposedDeltas)
  const c = meanStd(controlDeltas)
  if (e.n < 2 || c.n < 2) return null
  const effect = e.mean - c.mean
  const se = Math.sqrt((e.sd ** 2) / e.n + (c.sd ** 2) / c.n)
  if (!isFinite(se) || se === 0) return null
  const ciLow = effect - 1.96 * se
  const ciHigh = effect + 1.96 * se
  const z = effect / se
  const p = 2 * (1 - phi(Math.abs(z)))
  return {
    effect: +effect.toFixed(2),
    ciLow: +ciLow.toFixed(2),
    ciHigh: +ciHigh.toFixed(2),
    p: +p.toFixed(4),
  }
}

function verdictFor(stat, exposedN, controlN) {
  if (controlN === 0) return { key: 'not-measurable', label: 'Not measurable', note: 'no comparison group — stage it next time to learn' }
  if (controlN < COHORT_RULES.MIN_CONTROL) return { key: 'not-measurable', label: 'Not measurable', note: `control cohort has ${controlN} hosts (< ${COHORT_RULES.MIN_CONTROL} rule)` }
  if (exposedN < COHORT_RULES.MIN_EXPOSED) return { key: 'not-measurable', label: 'Not measurable', note: `only ${exposedN} exposed hosts` }
  if (!stat) return { key: 'not-measurable', label: 'Not measurable', note: 'not enough score history in both cohorts' }
  const crossesZero = stat.ciLow <= 0 && stat.ciHigh >= 0
  if (crossesZero) return { key: 'none', label: 'No effect found', note: 'interval crosses zero' }
  if (Math.min(exposedN, controlN) < COHORT_RULES.THIN_EVIDENCE) {
    return { key: 'wide', label: 'Wide interval', note: `${Math.min(exposedN, controlN)} hosts is thin evidence` }
  }
  return { key: 'likely', label: 'Likely caused', note: `p ${stat.p < 0.001 ? '< 0.001' : '= ' + stat.p.toFixed(3)}` }
}

/**
 * Build impact rows for a set of candidate changes.
 * @param candidates [{id, label, sublabel, software}] — chains and/or large rollouts
 * @param windowDays exposure window for patched_hosts
 * @returns rows [{...candidate, exposedN, controlN, effect, ciLow, ciHigh, p, verdict, confounders}]
 */
export async function buildImpactRows(candidates, windowDays = 14) {
  const list = (candidates || []).filter(c => c.software)
  if (!list.length) return []

  // Per-host deltas (now vs 7d ago) for every scored host: composite plus
  // each category, so a rollout can be judged on the metric it actually moved.
  const deltaRows = await query('firehose.scores.host_deltas', { limit: 1000 }).catch(() => [])
  const deltaByHost = new Map(deltaRows.map(r => [r.host_id, r]))
  if (!deltaByHost.size) {
    return list.map(c => ({
      ...c, exposedN: null, controlN: null, effect: null, metric: 'delta', metricLabel: 'overall score',
      verdict: { key: 'not-measurable', label: 'Not measurable', note: 'no per-host score history available' },
      confounders: [], byMetric: [],
    }))
  }

  // Exposed host sets, one query per candidate software (deduped).
  const softwares = [...new Set(list.map(c => c.software))]
  const exposedSets = new Map()
  await Promise.all(softwares.map(async sw => {
    const rows = await query('firehose.scores.patched_hosts', { softwareName: sw, windowDays }).catch(() => [])
    exposedSets.set(sw, new Set(rows.map(r => r.host_identifier)))
  }))

  const allHosts = [...deltaByHost.keys()]

  return list.map(c => {
    const exposedSet = exposedSets.get(c.software) || new Set()
    const exposedRows = []
    const controlRows = []
    for (const h of allHosts) {
      ;(exposedSet.has(h) ? exposedRows : controlRows).push(deltaByHost.get(h))
    }
    const exposedN = exposedRows.length
    const controlN = controlRows.length

    // Cohort-size gates are metric-independent — check once. If the cohort
    // is too small, NO metric is measurable (a near-universal app has no
    // control group left, whatever score you look at).
    const sizeGate = verdictFor(null, exposedN, controlN)
    const cohortTooSmall = sizeGate.key === 'not-measurable' &&
      (controlN === 0 || controlN < COHORT_RULES.MIN_CONTROL || exposedN < COHORT_RULES.MIN_EXPOSED)

    // Compute every metric on the same cohort.
    const num = (r, k) => { const v = Number(r[k]); return isFinite(v) ? v : null }
    const byMetric = IMPACT_METRICS.map(m => {
      const e = exposedRows.map(r => num(r, m.key)).filter(v => v != null)
      const ctrl = controlRows.map(r => num(r, m.key)).filter(v => v != null)
      const stat = cohortCompare(e, ctrl)
      const verdict = cohortTooSmall ? sizeGate : verdictFor(stat, exposedN, controlN)
      return { ...m, ...(stat || { effect: null, ciLow: null, ciHigh: null, p: null }), verdict }
    })

    // Headline metric: only a category with a STRONG signal ('likely') may
    // replace the composite. A merely 'wide'/unclear category is exactly
    // where multiple-comparison noise lives — the most-moved of five
    // sub-scores will often be a coincidental co-movement with no plausible
    // mechanism (e.g. a Fleet-agent update "lowering" OS security posture).
    // Those fall back to the composite so the page never headlines an
    // implausible thin correlation.
    const composite = byMetric[0]
    const strongCats = byMetric.filter((m, i) => i > 0 && m.verdict.key === 'likely')
    const headline = strongCats.length
      ? strongCats.reduce((a, b) => (Math.abs(b.effect) > Math.abs(a.effect) ? b : a))
      : composite

    // Near-universal reframe: when impact can't be measured only because
    // almost everyone already has it (tiny control, broad exposure), that's
    // a successful rollout, not a failure. Report it as coverage instead of
    // a dead "can't be measured". We deliberately give NO percentage — the
    // control set is "scored hosts that didn't patch in the window", which
    // isn't a clean install-base denominator (some may not run the app, and
    // the event stream can't tell us who's on which version). So we state
    // only what's directly observed: how many updated, how few didn't.
    let verdict = headline.verdict
    const rolledOut = verdict.key === 'not-measurable' &&
      controlN > 0 && controlN < COHORT_RULES.MIN_CONTROL && exposedN >= COHORT_RULES.MIN_CONTROL
    if (rolledOut) {
      verdict = { key: 'rolled-out', label: 'Rolled out', note: `${exposedN} updated, ${controlN} not` }
    }

    // Confounders: other candidate changes reaching most of the same hosts.
    const confounders = softwares.filter(other => {
      if (other === c.software) return false
      const otherSet = exposedSets.get(other)
      if (!otherSet?.size || !exposedSet.size) return false
      let overlap = 0
      for (const h of exposedSet) if (otherSet.has(h)) overlap++
      return overlap / exposedSet.size >= COHORT_RULES.CONFOUNDER_OVERLAP
    })

    return {
      ...c,
      exposedN,
      controlN,
      metric: headline.key,
      metricLabel: headline.label,
      effect: headline.effect,
      ciLow: headline.ciLow,
      ciHigh: headline.ciHigh,
      p: headline.p,
      verdict,
      // Composite reference + the strongest category, for the reading line.
      compositeEffect: composite.effect,
      byMetric,
      confounders,
    }
  })
}
