import { ref } from 'vue'
import { query } from '../services/api'
import dayjs from 'dayjs'

const TAGGED_DEVICES_KEY = 'fleet-timeline-tags'

// ─── Persistent device tags (localStorage) ──────────
function loadTags() {
  try {
    return JSON.parse(localStorage.getItem(TAGGED_DEVICES_KEY) || '{}')
  } catch { return {} }
}

function saveTags(tags) {
  localStorage.setItem(TAGGED_DEVICES_KEY, JSON.stringify(tags))
}

const deviceTags = ref(loadTags())

function tagDevice(commitHash, hostId, hostname, note = '') {
  const tags = { ...deviceTags.value }
  if (!tags[commitHash]) tags[commitHash] = []
  if (!tags[commitHash].find(t => t.hostId === hostId)) {
    tags[commitHash].push({ hostId, hostname, note, taggedAt: new Date().toISOString() })
  }
  deviceTags.value = tags
  saveTags(tags)
}

function untagDevice(commitHash, hostId) {
  const tags = { ...deviceTags.value }
  if (tags[commitHash]) {
    tags[commitHash] = tags[commitHash].filter(t => t.hostId !== hostId)
    if (tags[commitHash].length === 0) delete tags[commitHash]
  }
  deviceTags.value = tags
  saveTags(tags)
}

// ─── API-backed queries (replacing inline SQL) ──────────

async function fetchScoreHeatmap(startDate, endDate) {
  return await query('scores.timeline_heatmap', { startDate, endDate })
}

async function fetchScoreChanges(startDate, endDate) {
  return await query('scores.timeline_changes', { startDate, endDate })
}

async function fetchPatchSummary(startDate, endDate) {
  return await query('scores.timeline_patches', { startDate, endDate })
}

async function fetchRolloutProgress(softwareName, newVersion) {
  // Get time span first
  const spanRows = await query('scores.rollout_span', { softwareName, newVersion })
  const span = spanRows[0]
  if (!span || parseInt(span.adopted_devices) === 0) return null

  const spanHours = parseInt(span.span_hours)
  const bucketMode = spanHours > 48 ? 'day' : 'hour'

  const rows = await query('scores.rollout_cumulative', { softwareName, newVersion, bucketMode })
  const totalRows = await query('scores.fleet_device_count')
  const totalDevices = totalRows[0] ? parseInt(totalRows[0].total) : 0

  return {
    buckets: rows,
    totalDevices,
    adoptedDevices: parseInt(span.adopted_devices),
    spanHours,
    bucketType: bucketMode
  }
}

async function fetchImpactSummary(commitTimestamp, windowHours = 4) {
  const commitTime = dayjs(commitTimestamp).format('YYYY-MM-DD HH:mm:ss')
  const rows = await query('scores.impact_summary', { commitTime, windowHours })
  return rows[0] || null
}

async function fetchTopMovers(commitTimestamp, windowHours = 4) {
  const commitTime = dayjs(commitTimestamp).format('YYYY-MM-DD HH:mm:ss')
  return await query('scores.impact_top_movers', { commitTime, windowHours })
}

async function searchDevices(searchText) {
  if (!searchText || searchText.length < 2) return []
  return await query('scores.device_search', { search: `%${searchText}%` })
}

async function fetchDeviceHealthAroundCommit(hostId, commitTimestamp, windowHours = 12) {
  const start = dayjs(commitTimestamp).subtract(windowHours, 'hour').format('YYYY-MM-DD HH:mm:ss')
  const end = dayjs(commitTimestamp).add(windowHours, 'hour').format('YYYY-MM-DD HH:mm:ss')
  return await query('scores.device_health_around_commit', { hostIdentifier: hostId, startDate: start, endDate: end })
}

async function fetchDeviceScoresAroundCommit(hostId, commitTimestamp, windowHours = 12) {
  const start = dayjs(commitTimestamp).subtract(windowHours, 'hour').format('YYYY-MM-DD HH:mm:ss')
  const end = dayjs(commitTimestamp).add(windowHours, 'hour').format('YYYY-MM-DD HH:mm:ss')
  return await query('scores.device_around_commit', { hostIdentifier: hostId, startDate: start, endDate: end })
}

async function fetchDevicePatchesAroundCommit(hostId, commitTimestamp, windowHours = 24) {
  const start = dayjs(commitTimestamp).subtract(windowHours, 'hour').format('YYYY-MM-DD HH:mm:ss')
  const end = dayjs(commitTimestamp).add(windowHours, 'hour').format('YYYY-MM-DD HH:mm:ss')
  return await query('scores.device_patches_around_commit', { hostIdentifier: hostId, startDate: start, endDate: end })
}

// ─── Pure JS logic (unchanged — no SQL) ──────────────

function detectFleetEvents(scoreData, patchSummary) {
  const fleetEvents = []

  for (let i = 1; i < scoreData.length; i++) {
    const prev = scoreData[i - 1]
    const curr = scoreData[i]
    const delta = parseFloat(curr.avg_score) - parseFloat(prev.avg_score)
    if (Math.abs(delta) >= 3) {
      fleetEvents.push({
        type: delta < 0 ? 'score_drop' : 'score_improvement',
        time: curr.time,
        label: `Fleet score ${delta > 0 ? '+' : ''}${delta.toFixed(1)} (${curr.avg_score})`,
        severity: Math.abs(delta) >= 8 ? 'high' : Math.abs(delta) >= 5 ? 'medium' : 'low',
        data: { delta, score: parseFloat(curr.avg_score), devices: parseInt(curr.devices) }
      })
    }
  }

  for (const p of patchSummary) {
    const deviceCount = parseInt(p.device_count)
    fleetEvents.push({
      type: 'patch_wave',
      time: p.hour,
      label: `${p.software_name} ${p.old_version} → ${p.new_version} (${deviceCount} device${deviceCount > 1 ? 's' : ''})`,
      severity: deviceCount >= 50 ? 'high' : deviceCount >= 10 ? 'medium' : 'low',
      data: {
        software: p.software_name,
        patchType: p.patch_type,
        oldVersion: p.old_version,
        newVersion: p.new_version,
        deviceCount,
        avgLag: parseFloat(p.avg_lag),
        maxLag: parseFloat(p.max_lag),
        firstApplied: p.first_applied,
        lastApplied: p.last_applied
      }
    })
  }

  return fleetEvents.sort((a, b) => dayjs(b.time).valueOf() - dayjs(a.time).valueOf())
}

function correlateWithCommits(gitEvents, fleetEvents, tags, windowHours = 4) {
  return gitEvents.map(commit => {
    const commitTime = dayjs(commit.timestamp)
    const commitMsg = (commit.message || '').toLowerCase()
    const commitFiles = (commit.files || []).join(' ').toLowerCase()
    const commitChangeTypes = commit.changeTypes || []

    const nearby = fleetEvents
      .filter(e => {
        const eventTime = dayjs(e.time)
        const diffHours = eventTime.diff(commitTime, 'hour', true)
        return diffHours >= -1 && diffHours <= windowHours
      })
      .map(e => {
        let correlation = 'temporal'
        if (e.type === 'patch_wave') {
          const sw = (e.data.software || '').toLowerCase()
          if (commitMsg.includes(sw) || commitFiles.includes(sw)) {
            correlation = 'verified'
          } else if (commitChangeTypes.includes('software') || commitChangeTypes.includes('os_update')) {
            correlation = 'likely'
          }
        }
        return { ...e, correlation }
      })

    return {
      ...commit,
      fleetEvents: nearby,
      tags: tags[commit.hash] || [],
      hasImpact: nearby.some(e => e.correlation === 'verified' || e.severity === 'high')
    }
  })
}

export function useTimelineEvents() {
  return {
    deviceTags,
    tagDevice,
    untagDevice,
    fetchScoreHeatmap,
    fetchScoreChanges,
    fetchPatchSummary,
    fetchRolloutProgress,
    fetchImpactSummary,
    fetchTopMovers,
    searchDevices,
    fetchDeviceHealthAroundCommit,
    fetchDeviceScoresAroundCommit,
    fetchDevicePatchesAroundCommit,
    detectFleetEvents,
    correlateWithCommits
  }
}
