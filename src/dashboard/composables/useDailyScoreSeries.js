import { ref, computed } from 'vue'
import { query } from '../services/api'
import dayjs from 'dayjs'

/**
 * Daily fleet score series — composite + every category — read from the
 * persisted `dex_scores_daily` history (one query; written daily by the
 * worker cron from the same scoring CTE as the live queries). Extends as
 * far back as history exists — the old approach was 30 parallel as-of
 * queries and hard-walled the judgment window at 30 days.
 * Module singleton: fetched once per session, shared by GitOps and
 * Patch velocity.
 *
 * Judgements are correlational readings of "what the fleet score did in
 * the 7 days AFTER a date" — never causal claims. 'too-recent' (window
 * still open) and 'outside-window' (date predates the series) stay
 * distinct: two different kinds of unknown.
 */

const HISTORY_DAYS = 365

const series = ref({})        // 'YYYY-MM-DD' -> { composite, device_health, performance, security, software }
const seriesLoaded = ref(false)
let inflight = null

async function fetchDailySeries() {
  if (seriesLoaded.value) return
  if (inflight) return inflight
  inflight = (async () => {
    const rows = await query('firehose.scores.daily_history', { days: HISTORY_DAYS })
      .catch(() => [])
    const map = {}
    for (const row of rows || []) {
      const date = dayjs(row.score_date).format('YYYY-MM-DD')
      map[date] = {
        composite: row.composite != null ? Number(row.composite) : null,
        device_health: row.device_health != null ? Number(row.device_health) : null,
        performance: row.performance != null ? Number(row.performance) : null,
        security: row.security != null ? Number(row.security) : null,
        software: row.software != null ? Number(row.software) : null,
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
