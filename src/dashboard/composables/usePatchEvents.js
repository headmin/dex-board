import { query } from '../services/api'
import dayjs from 'dayjs'

// Patch-event fetchers for the GitOps timeline. Slimmed from the retired
// useTimelineEvents.js — the commit-correlation and device-tagging machinery
// died with the legacy scores.* query lane.

async function fetchPatchSummaryBucketed(startDate, endDate, minHosts = 1) {
  return await query('firehose.scores.timeline_patches_summary', { startDate, endDate, minHosts })
}

async function fetchSoftwareDayPatches(softwareName, day) {
  const start = dayjs(day).startOf('day').format('YYYY-MM-DD HH:mm:ss')
  const end = dayjs(day).endOf('day').format('YYYY-MM-DD HH:mm:ss')
  return await query('firehose.scores.timeline_patches', { startDate: start, endDate: end, softwareName, day })
}

export function usePatchEvents() {
  return {
    fetchPatchSummaryBucketed,
    fetchSoftwareDayPatches,
  }
}
