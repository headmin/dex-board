import { ref } from 'vue'
import { query } from '../services/api'

export function usePlatformBenchmark() {
  const benchmarkData = ref(null)
  const lifecycleLabel = ref('')
  const loading = ref(false)
  const activeCohort = ref('fleet')

  function parseCohortRow(row) {
    if (!row) return null
    const scores = ['composite', 'performance', 'device_health', 'network', 'security', 'software']
    const result = { device_count: Number(row.device_count) || 0 }
    for (const s of scores) {
      result[s] = {
        avg: Number(row[`avg_${s}`]) || 0,
        p10: Number(row[`p10_${s}`]) || 0,
        p25: Number(row[`p25_${s}`]) || 0,
        p75: Number(row[`p75_${s}`]) || 0,
        p90: Number(row[`p90_${s}`]) || 0
      }
    }
    return result
  }

  function computeLifecycleLabel(deviceComposite, deviceHealth, fleetCohort) {
    if (!fleetCohort) return ''
    const score = deviceComposite
    const health = deviceHealth
    const { p10, p25, avg, p90 } = fleetCohort.composite

    if (score < p10 && health < 50) return 'End of life candidate'
    if (score < p25) return 'Underperforming'
    if (score < avg) return 'Needs attention'
    if (score >= p90) return 'Top performer'
    return 'Healthy'
  }

  async function fetchBenchmarks(hostId, osName, hardwareModel, ramTier) {
    loading.value = true
    try {
      const [fleet, os, model, ram] = await Promise.all([
        query('scores.cohort', { cohortType: 'fleet' }),
        query('scores.cohort', { cohortType: 'os', cohortValue: osName }),
        query('scores.cohort', { cohortType: 'model', cohortValue: hardwareModel }),
        query('scores.cohort', { cohortType: 'ram', cohortValue: ramTier })
      ])

      benchmarkData.value = {
        fleet: parseCohortRow(fleet[0]),
        os: parseCohortRow(os[0]),
        model: parseCohortRow(model[0]),
        ram: parseCohortRow(ram[0])
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
