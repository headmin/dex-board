import { ref } from 'vue'
import { query } from '../services/api'
import { aggregatePatchRowsBySoftware } from './patchAggregation'
import { usePatchEvents } from './usePatchEvents'
import { PATCH_EXCLUSIONS_PARAM, isExcludedSoftware } from './patchExclusions'

/**
 * Data layer for the Patch velocity page (and the GitOps MTTP strip).
 * Clock everywhere here: fleet-internal days_to_patch (first fleet
 * sighting → host applies). Vendor-release lag (hours) lives with the
 * FMA release state and is never mixed into these numbers.
 *
 * Excluded titles (see patchExclusions.js — Safari and anything else whose
 * cadence the fleet doesn't control) are dropped server-side from the
 * summary/by-type calls and client-side from the per-app/per-host lists,
 * so every number on the page is about software the fleet actually ships.
 */
export function usePatchVelocity() {
  const summary90 = ref(null)     // hero window
  const current7 = ref(null)      // trend: this week
  const prior7 = ref(null)        // trend: prior week
  const byType = ref([])          // OS vs app split
  const byApp = ref([])
  const byHost = ref([])
  const loading = ref(false)

  async function fetchAll(slaDays = 14) {
    loading.value = true
    const excludeSoftware = PATCH_EXCLUSIONS_PARAM
    const one = (params) =>
      query('firehose.scores.mttp_summary', { slaDays, excludeSoftware, ...params })
        .then(rows => rows?.[0] || null)
        .catch(() => null)

    const { fetchPatchSummaryBucketed } = usePatchEvents()
    const end = new Date()
    const start = new Date(end.getTime() - 30 * 24 * 3600 * 1000)
    const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ')

    const [s90, c7, p7, types, appRows, hostRows] = await Promise.all([
      one({ windowDays: 90 }),
      one({ windowDays: 7 }),
      one({ windowDays: 7, offsetDays: 7 }),
      query('firehose.scores.mttp_summary_by_type', { windowDays: 90, excludeSoftware }).catch(() => []),
      fetchPatchSummaryBucketed(fmt(start), fmt(end), 1).catch(() => []),
      query('firehose.scores.mttp_by_host', { windowDays: 30, limit: 15, excludeSoftware }).catch(() => []),
    ])
    summary90.value = s90
    current7.value = c7
    prior7.value = p7
    byType.value = types || []
    // Per-app rows are aggregated client-side from the bucketed feed, which
    // has no exclusion param — drop excluded titles here so the app list
    // matches the server-side numbers above.
    const cleanApp = (appRows || []).filter(r => !isExcludedSoftware(r.software_name))
    byApp.value = aggregatePatchRowsBySoftware(cleanApp, 25)
    byHost.value = hostRows || []
    loading.value = false
  }

  return { summary90, current7, prior7, byType, byApp, byHost, loading, fetchAll }
}
