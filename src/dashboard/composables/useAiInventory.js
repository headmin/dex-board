import { ref, computed } from 'vue'
import { query } from '../services/api'
import { normalizeRows } from './aiInventory'

/**
 * AI tool inventory rows, from whichever source has them.
 *
 *   1. `firehose.ai.inventory` through the Worker — the eventual path, once
 *      the AI discovery results flow into the firehose ClickHouse and the
 *      query is registered. Not registered today, so the Worker answers 404
 *      UNKNOWN_QUERY.
 *   2. GET /api/local/ai-inventory — a Vite dev-only middleware that serves
 *      the Fleet report CSV export from local-data/ (src/dev/localAiInventory.js).
 *      Does not exist in a built deployment.
 *   3. Neither → `unavailable`, and the view says so instead of rendering
 *      an empty dashboard as if the fleet had no AI tooling.
 *
 * `source` names which path answered so the page can label the data
 * honestly — a local export is a snapshot, not live telemetry.
 *
 * Fleet-filter handling differs by source. ClickHouse applies the filter in
 * SQL. The local export has no platform/model/team columns, so only `search`
 * can be honoured (client-side, against the host display name); any other
 * active filter is reported in `ignoredFilters` for the view to disclose.
 */
export function useAiInventory() {
  const rows = ref([])
  const loading = ref(false)
  const error = ref(null)
  const unavailable = ref(false)
  const source = ref(null)        // 'clickhouse' | 'local-csv' | null
  const sourceMeta = ref({})      // { file, modified, rows } for local-csv
  const ignoredFilters = ref([])

  const LOCAL_SUPPORTED = new Set(['search'])

  // Coverage (hosts scanned, last scan time) only exists on the ClickHouse
  // path — the CSV export has no notion of an empty scan.
  const coverage = ref(null)

  async function fromWorker(filterParams) {
    const [data, cov] = await Promise.all([
      query('firehose.ai.inventory', filterParams),
      query('firehose.ai.coverage', filterParams).catch(() => []),
    ])
    return { data, source: 'clickhouse', meta: {}, coverage: cov?.[0] || null }
  }

  async function fromLocal() {
    const res = await fetch('/api/local/ai-inventory', { credentials: 'same-origin' })
    if (!res.ok) {
      // Vite's SPA fallback returns index.html with 200 only for GET of
      // unknown paths under the dev server; the middleware itself answers
      // JSON on 404/500. A non-JSON body means no middleware at all.
      const body = await res.json().catch(() => null)
      throw new Error(body?.error?.message || `Local export unavailable (${res.status})`)
    }
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) throw new Error('Local export unavailable')
    const body = await res.json()
    return { data: body.data || [], source: 'local-csv', meta: body.meta || {} }
  }

  function applyLocalFilter(data, filterParams) {
    const ignored = Object.keys(filterParams || {}).filter(k => !LOCAL_SUPPORTED.has(k))
    ignoredFilters.value = ignored
    const needle = String(filterParams?.search || '').trim().toLowerCase()
    if (!needle) return data
    return data.filter(r => String(r.host_display_name || '').toLowerCase().includes(needle))
  }

  async function load(filterParams = {}) {
    loading.value = true
    error.value = null
    unavailable.value = false
    ignoredFilters.value = []
    try {
      let result
      let workerError = null
      try {
        result = await fromWorker(filterParams)
      } catch (e) {
        workerError = e
      }
      if (!result) {
        // Worker path failed — unknown query, worker not running, proxy
        // error. Try the dev-only local export before deciding what to say.
        try {
          result = await fromLocal()
          result.data = applyLocalFilter(result.data, filterParams)
        } catch {
          // No local export either. An unregistered query (404) or an
          // unreachable worker means "not wired yet"; anything else is a
          // real failure of a registered query and must surface as one.
          const msg = String(workerError?.message || '')
          const notWired = /not found in registry|status 404|Request failed|Failed to fetch|NetworkError/i.test(msg)
          if (!notWired) throw workerError
          unavailable.value = true
          rows.value = []
          source.value = null
          coverage.value = null
          return
        }
      }
      source.value = result.source
      sourceMeta.value = result.meta
      coverage.value = result.coverage || null
      rows.value = normalizeRows(result.data)
    } catch (e) {
      error.value = e.message
      rows.value = []
    } finally {
      loading.value = false
    }
  }

  const isSnapshot = computed(() => source.value === 'local-csv')

  return { rows, loading, error, unavailable, source, sourceMeta, coverage, ignoredFilters, isSnapshot, load }
}
