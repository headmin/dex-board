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
  return await query('scores.fma_release_devices', {
    softwarePattern: release.app,
    versionTo: release.version_to,
    releaseTime: dayjs(release.timestamp).format('YYYY-MM-DD HH:mm:ss'),
    windowDays
  })
}

export function useFmaReleases() {
  return {
    releases,
    fetchFmaReleases,
    releasesInRange,
    fetchReleaseDevices
  }
}
