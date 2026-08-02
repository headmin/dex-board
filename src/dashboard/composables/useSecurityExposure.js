import { ref, computed, watch } from 'vue'
import { query } from '../services/api'

// ─── Endpoint security-exposure delta (board Q: "more exposed than N days
// ago?"). Reuses the asOfDaysAgo time-travel param on firehose.scores.categories
// to diff the security sub-score now vs N days ago, where N is user-selectable.
// Scope is endpoint security posture only — NOT app/network/cloud attack
// surface (boundary is printed on the tile).
export const EXPOSURE_WINDOWS = [14, 30, 45, 60, 90]

export function useSecurityExposure(snapshotParams) {
  const loading = ref(false)
  const exposureWindowOptions = EXPOSURE_WINDOWS.map(w => ({ value: w, label: `${w}d` }))
  const exposureDays = ref(90)
  const securityExposure = ref({ now: null, before: null, delta: null })
  // Per-control adoption %s + their delta over the window — shows WHICH control moved.
  const exposureSignals = ref([])

  // Board-legible reading of the security delta. Higher security score = less
  // exposed, so a negative delta means MORE exposed than the window start.
  const exposureView = computed(() => {
    const { now, before, delta } = securityExposure.value
    const n = exposureDays.value
    if (delta == null) {
      return { available: false, headline: '—', detail: before == null ? `No security-posture history ${n} days back yet.` : 'Insufficient data.', dir: 'flat' }
    }
    const dir = delta < 0 ? 'worse' : delta > 0 ? 'better' : 'flat'
    const headline = dir === 'worse'
      ? `More exposed: security posture down ${Math.abs(delta)} pts vs ${n} days ago`
      : dir === 'better'
        ? `Less exposed: security posture up ${delta} pts vs ${n} days ago`
        : `Unchanged: security posture flat vs ${n} days ago`
    return {
      available: true,
      headline,
      detail: `Endpoint security score ${now} now vs ${before} ${n} days ago.`,
      dir,
      delta,
    }
  })

  // ─── Fetch security-exposure delta (selectable window) ────────
  // Two snapshots of the security sub-score (now and exposureDays ago) via the
  // asOfDaysAgo time-travel param. A drop = more exposed than the window start.
  async function fetchSecurityExposure() {
    loading.value = true
    try {
      const [nowRows, agoRows, nowPosture, agoPosture] = await Promise.all([
        query('firehose.scores.categories', { ...snapshotParams.value, asOfDaysAgo: 0 }).catch(() => []),
        query('firehose.scores.categories', { ...snapshotParams.value, asOfDaysAgo: exposureDays.value }).catch(() => []),
        query('firehose.security.posture_breakdown', { ...snapshotParams.value, asOfDaysAgo: 0 }).catch(() => []),
        query('firehose.security.posture_breakdown', { ...snapshotParams.value, asOfDaysAgo: exposureDays.value }).catch(() => []),
      ])
      const now = nowRows[0]?.avg_security ?? null
      const before = agoRows[0]?.avg_security ?? null
      const delta = (now != null && before != null)
        ? Math.round((now - before) * 10) / 10
        : null
      securityExposure.value = { now, before, delta }

      // Per-control breakdown: which signal moved (encryption/firewall/Gatekeeper/SIP)?
      const pn = nowPosture[0] || {}
      const pb = agoPosture[0] || {}
      const sig = (key, label) => {
        const n = pn[key] ?? null
        const b = pb[key] ?? null
        return { key, label, now: n, delta: (n != null && b != null) ? Math.round((n - b) * 10) / 10 : null }
      }
      exposureSignals.value = (pn.posture_hosts > 0)
        ? [sig('pct_encrypted', 'FileVault'), sig('pct_firewall', 'Firewall'), sig('pct_gatekeeper', 'Gatekeeper'), sig('pct_sip', 'SIP')]
        : []
    } catch (e) {
      console.error('Security exposure fetch failed:', e)
      securityExposure.value = { now: null, before: null, delta: null }
      exposureSignals.value = []
    }
    loading.value = false
  }

  // Exposure comparison window changed → re-diff security posture vs that point.
  watch(exposureDays, () => {
    fetchSecurityExposure()
  })

  return {
    loading,
    exposureWindowOptions,
    exposureDays,
    securityExposure,
    exposureSignals,
    exposureView,
    fetchSecurityExposure,
  }
}
