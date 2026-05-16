import { ref } from 'vue'
import { query } from '../services/api'

/**
 * Platform benchmark cohort stats.
 *
 * The old implementation called scores.cohort which reads MAIN's stale
 * dex_device_scores_hourly (last populated 2026-04-06) — every cohort
 * came back with 0 hosts, the bars degenerated to "all p90 at 0" and
 * every category falsely badged "Top 10%".
 *
 * New approach: fetch the alt-side firehose.scores.device_list (live
 * firehose-derived scores) once per cohort with the appropriate
 * FILTER_PARAMS, then bucket and compute percentiles in JS. The
 * dashboard has at most a few hundred hosts, so percentile math
 * client-side is trivial.
 */
export function usePlatformBenchmark() {
  const benchmarkData = ref(null)
  const lifecycleLabel = ref('')
  const loading = ref(false)
  const activeCohort = ref('fleet')

  const SCORE_FIELDS = [
    ['composite',     'composite_score'],
    ['performance',   'performance_score'],
    ['device_health', 'device_health_score'],
    ['network',       'network_score'],
    ['security',      'security_score'],
    ['software',      'software_score'],
  ]

  function quantile(sortedAsc, q) {
    if (!sortedAsc.length) return 0
    const pos = (sortedAsc.length - 1) * q
    const lo = Math.floor(pos)
    const hi = Math.ceil(pos)
    if (lo === hi) return sortedAsc[lo]
    return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo)
  }

  function buildCohort(rows) {
    if (!rows || !rows.length) return null
    const result = { device_count: rows.length }
    for (const [key, field] of SCORE_FIELDS) {
      const values = rows
        .map(r => Number(r[field]))
        .filter(v => isFinite(v) && (key !== 'network' || v > 0))  // mirror avgIf(network > 0)
        .sort((a, b) => a - b)
      if (!values.length) { result[key] = { avg: 0, p10: 0, p25: 0, p75: 0, p90: 0, n: 0 }; continue }
      const sum = values.reduce((s, v) => s + v, 0)
      result[key] = {
        avg: +(sum / values.length).toFixed(1),
        p10: +quantile(values, 0.10).toFixed(1),
        p25: +quantile(values, 0.25).toFixed(1),
        p75: +quantile(values, 0.75).toFixed(1),
        p90: +quantile(values, 0.90).toFixed(1),
        n: values.length,
      }
    }
    return result
  }

  function computeLifecycleLabel(deviceComposite, deviceHealth, fleetCohort) {
    if (!fleetCohort || fleetCohort.device_count < 3) return ''  // need cohort to compare
    const score = deviceComposite
    const health = deviceHealth
    const { p10, p25, avg, p90 } = fleetCohort.composite

    if (score < p10 && health < 50) return 'End of life candidate'
    if (score < p25) return 'Underperforming'
    if (score < avg) return 'Needs attention'
    if (score >= p90) return 'Top performer'
    return 'Healthy'
  }

  // Map os_name values (macOS / Windows / Linux) to fleetd_info.platform
  // codes (darwin / windows / linux). FILTERED_HOSTS_CTE filters on the
  // platform code, not the os_name — without this mapping the Same OS
  // cohort tab queries macOS → silently matches nothing → empty cohort.
  function osNameToPlatform(name) {
    const v = String(name || '').toLowerCase()
    if (v === 'macos' || v === 'mac os' || v === 'mac' || v === 'darwin') return 'darwin'
    if (v === 'windows') return 'windows'
    if (v === 'linux') return 'linux'
    return v  // pass-through for already-correct codes
  }

  async function fetchBenchmarks(_hostId, osName, hardwareModel, ramTier) {
    loading.value = true
    try {
      const filter = (extra) => ({ limit: 500, ...extra })
      const platform = osNameToPlatform(osName)
      const [fleet, os, model, ram] = await Promise.all([
        query('firehose.scores.device_list', filter({})),
        platform      ? query('firehose.scores.device_list', filter({ os: platform }))      : Promise.resolve([]),
        hardwareModel ? query('firehose.scores.device_list', filter({ model: hardwareModel })) : Promise.resolve([]),
        ramTier       ? query('firehose.scores.device_list', filter({ ramTier }))            : Promise.resolve([]),
      ])

      benchmarkData.value = {
        fleet: buildCohort(fleet),
        os:    buildCohort(os),
        model: buildCohort(model),
        ram:   buildCohort(ram),
      }
    } catch (e) {
      console.error('Failed to fetch platform benchmarks:', e)
      benchmarkData.value = null
    } finally {
      loading.value = false
    }
  }

  function updateLifecycle(deviceScores) {
    if (!deviceScores || !benchmarkData.value?.fleet) {
      lifecycleLabel.value = ''
      return
    }
    lifecycleLabel.value = computeLifecycleLabel(
      deviceScores.composite_score,
      deviceScores.device_health_score,
      benchmarkData.value.fleet
    )
  }

  return { benchmarkData, lifecycleLabel, loading, activeCohort, fetchBenchmarks, updateLifecycle }
}
