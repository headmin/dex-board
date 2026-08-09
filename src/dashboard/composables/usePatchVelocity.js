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
  const byWeek = ref([])          // weekly p50/p90 trend
  const hostWeighted = ref(null)  // each host counts once
  const loading = ref(false)

  async function fetchAll(slaDays = 14, filterParams = {}) {
    loading.value = true
    const excludeSoftware = PATCH_EXCLUSIONS_PARAM
    const one = (params) =>
      query('firehose.scores.mttp_summary', { slaDays, excludeSoftware, ...filterParams, ...params })
        .then(rows => rows?.[0] || null)
        .catch(() => null)

    const { fetchPatchSummaryBucketed } = usePatchEvents()
    const end = new Date()
    const start = new Date(end.getTime() - 30 * 24 * 3600 * 1000)
    const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ')

    const [s90, c7, p7, types, appRows, hostRows, weekRows, hw, eligibleRows] = await Promise.all([
      one({ windowDays: 90 }),
      one({ windowDays: 7 }),
      one({ windowDays: 7, offsetDays: 7 }),
      query('firehose.scores.mttp_summary_by_type', { windowDays: 90, excludeSoftware, ...filterParams }).catch(() => []),
      fetchPatchSummaryBucketed(fmt(start), fmt(end), 1).catch(() => []),
      query('firehose.scores.mttp_by_host', { windowDays: 30, limit: 15, excludeSoftware, ...filterParams }).catch(() => []),
      query('firehose.scores.mttp_weekly', { windowDays: 90, excludeSoftware, ...filterParams }).catch(() => []),
      query('firehose.scores.mttp_host_weighted', { windowDays: 90, excludeSoftware, ...filterParams })
        .then(rows => rows?.[0] || null).catch(() => null),
      query('firehose.scores.app_eligible_hosts', { ...filterParams }).catch(() => []),
    ])
    summary90.value = s90
    current7.value = c7
    prior7.value = p7
    byType.value = types || []
    byWeek.value = weekRows || []
    hostWeighted.value = hw
    // Per-app rows are aggregated client-side from the bucketed feed, which
    // has no exclusion param — drop excluded titles here so the app list
    // matches the server-side numbers above.
    const cleanApp = (appRows || []).filter(r => !isExcludedSoftware(r.software_name))
    // Eligible-cohort denominator: hosts reporting the app installed in the
    // last 14 days (adoption_gap). Turns "N hosts patched" into "N of M that
    // have the app" — the censored never-patched population becomes visible.
    const eligible = new Map(
      (eligibleRows || []).map(r => [String(r.software_name).toLowerCase(), Number(r.eligible_hosts)])
    )
    byApp.value = aggregatePatchRowsBySoftware(cleanApp, 25).map(r => ({
      ...r,
      eligible_hosts: eligible.get(String(r.software_name).toLowerCase()) ?? null,
    }))
    byHost.value = hostRows || []
    loading.value = false
  }

  return { summary90, current7, prior7, byType, byApp, byHost, byWeek, hostWeighted, loading, fetchAll }
}
