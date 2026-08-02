import { ref, computed } from 'vue'
import { query } from '../services/api'
import dayjs from 'dayjs'

/**
 * 30-day daily fleet score series — composite + every category — via
 * 30 parallel `firehose.scores.categories {asOfDaysAgo}` calls (the same
 * time-travel mechanism the home hero uses). Module singleton: fetched
 * once per session, shared by GitOps and Patch velocity.
 *
 * Judgements are correlational readings of "what the fleet score did in
 * the 7 days AFTER a date" — never causal claims. 'too-recent' (window
 * still open) and 'outside-window' (date predates the series) stay
 * distinct: two different kinds of unknown.
 */

const series = ref({})        // 'YYYY-MM-DD' -> { composite, device_health, performance, security, software }
const seriesLoaded = ref(false)
let inflight = null

async function fetchDailySeries() {
  if (seriesLoaded.value) return
  if (inflight) return inflight
  inflight = (async () => {
    const calls = Array.from({ length: 30 }, (_, i) =>
      query('firehose.scores.categories', { asOfDaysAgo: i })
        .then(rows => ({ i, row: rows?.[0] || null }))
        .catch(() => ({ i, row: null }))
    )
    const results = await Promise.all(calls)
    const map = {}
    for (const { i, row } of results) {
      if (!row) continue
      const date = dayjs().subtract(i, 'day').format('YYYY-MM-DD')
      map[date] = {
        composite: row.avg_composite != null ? Number(row.avg_composite) : null,
        device_health: row.avg_device_health != null ? Number(row.avg_device_health) : null,
        performance: row.avg_performance != null ? Number(row.avg_performance) : null,
        security: row.avg_security != null ? Number(row.avg_security) : null,
        software: row.avg_software != null ? Number(row.avg_software) : null,
      }
    }
    series.value = map
    seriesLoaded.value = true
  })()
  return inflight
}

/** Score move over the 7 days AFTER dateStr, on the given key.
 *  null when the window hasn't closed or either endpoint is missing. */
function deltaAfter(dateStr, key = 'composite') {
  const start = series.value[dateStr]?.[key]
  const endDate = dayjs(dateStr).add(7, 'day')
  if (endDate.isAfter(dayjs(), 'day')) return null
  const end = series.value[endDate.format('YYYY-MM-DD')]?.[key]
  if (start == null || end == null) return null
  return Math.round((end - start) * 10) / 10
}

/** 'better' | 'flat' | 'worse' | 'too-recent' | 'outside-window' */
function judgementFor(dateStr, key = 'composite') {
  const d = deltaAfter(dateStr, key)
  if (d == null) {
    return dayjs(dateStr).add(7, 'day').isAfter(dayjs(), 'day') ? 'too-recent' : 'outside-window'
  }
  if (d >= 0.5) return 'better'
  if (d <= -0.5) return 'worse'
  return 'flat'
}

const netMove = computed(() => {
  const dates = Object.keys(series.value).sort()
  if (dates.length < 2) return null
  const first = series.value[dates[0]]?.composite
  const last = series.value[dates[dates.length - 1]]?.composite
  if (first == null || last == null) return null
  return Math.round((last - first) * 10) / 10
})

export function useDailyScoreSeries() {
  return { series, seriesLoaded, fetchDailySeries, deltaAfter, judgementFor, netMove }
}
