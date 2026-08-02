import { ref } from 'vue'
import dayjs from 'dayjs'
import { query } from '../services/api'

const FMA_TIMELINE_URL = 'https://raw.githubusercontent.com/headmin/fleet-gitops-changelog/refs/heads/main/fma-timeline.jsonl'

const releases = ref([])
let fetched = false

async function fetchFmaReleases() {
  if (fetched) return
  try {
    const res = await fetch(FMA_TIMELINE_URL)
    if (!res.ok) return
    const text = await res.text()
    releases.value = text
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  } catch {
    // silent — section simply renders empty if feed unreachable
  }
  fetched = true
}

function releasesInRange(startTime, endTime) {
  const start = dayjs(startTime)
  const end = dayjs(endTime)
  return releases.value.filter(r => {
    const t = dayjs(r.timestamp)
    return t.isAfter(start) && t.isBefore(end)
  })
}

async function fetchReleaseDevices(release, windowDays = 30) {
  if (!release || !release.app || !release.version_to) return []
  return await query('firehose.scores.fma_release_devices', {
    softwarePattern: release.app,
    versionTo: release.version_to,
    releaseTime: dayjs(release.timestamp).format('YYYY-MM-DD HH:mm:ss'),
    windowDays
  })
}

// Bucket loaded FMA releases by their date (YYYY-MM-DD). Returns an object
// keyed by day with arrays of releases. Useful for interleaving release
// cards into the per-day deployment timeline.
function releasesByDay() {
  const map = {}
  for (const r of releases.value) {
    const d = (r.timestamp || '').slice(0, 10)
    if (!d) continue
    if (!map[d]) map[d] = []
    map[d].push(r)
  }
  return map
}

// ─── Shared helpers (previously duplicated in GitOpsTimeline.vue and
// GitOps.vue) ─────────────────────────────────────────────

// Format a lag expressed in hours as "Nh" under a day, "Nd" above.
export function formatHours(h) {
  const n = Number(h)
  if (!isFinite(n)) return '?'
  if (n < 24) return `${Math.round(n)}h`
  return `${Math.round(n / 24)}d`
}

// Sum device_count across the matched patch-wave rows for a release.
// `counts` is the { [release.id]: rows[] } map (a ref or a plain object).
// Returns null when the release hasn't been loaded yet — callers use that
// to distinguish "not loaded" from "loaded, zero matches".
export function totalDevicesForRelease(counts, releaseId) {
  const map = counts && 'value' in counts ? counts.value : counts
  const rows = map ? map[releaseId] : null
  if (!rows) return null
  return rows.reduce((sum, r) => sum + Number(r.device_count || 0), 0)
}

// Load the patch waves for one release into caller-owned state, guarding
// against double-loads. `queryFn` is the API query function (kept injectable
// so views keep their exact query wiring); `state` holds:
//   deviceCounts:  ref({ [release.id]: rows[] })
//   deviceLoading: ref({ [release.id]: boolean })
//   windowDays:    number (default 30)
// Preserves the exact query name/params the views use today
// (firehose.scores.fma_release_devices via fetchReleaseDevices).
export async function loadFmaReleaseDevices(queryFn, release, state) {
  const { deviceCounts, deviceLoading, windowDays = 30 } = state
  if (!release || !release.app || !release.version_to) return
  if (deviceLoading.value[release.id]) return
  deviceLoading.value = { ...deviceLoading.value, [release.id]: true }
  try {
    const rows = await queryFn('firehose.scores.fma_release_devices', {
      softwarePattern: release.app,
      versionTo: release.version_to,
      releaseTime: dayjs(release.timestamp).format('YYYY-MM-DD HH:mm:ss'),
      windowDays
    })
    deviceCounts.value = { ...deviceCounts.value, [release.id]: rows || [] }
  } finally {
    deviceLoading.value = { ...deviceLoading.value, [release.id]: false }
  }
}

export function useFmaReleases() {
  return {
    releases,
    fetchFmaReleases,
    releasesInRange,
    releasesByDay,
    fetchReleaseDevices
  }
}
