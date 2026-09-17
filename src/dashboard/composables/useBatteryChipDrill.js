import { ref, computed } from 'vue'
import { query } from '../services/api'
import { chipSpec } from './chipTier'

/**
 * Drill from a battery-by-chip bar into the hosts behind it.
 *
 * Shared by the Analytics Host-health tab and the Overview pane, which render
 * the same two battery charts. Those two files have drifted apart before, and
 * a drill-down that disagreed about which hosts sit in the M4 Pro cohort would
 * be worse than no drill at all.
 *
 * Hosts are fetched ONCE per filter and sliced in the browser. That is
 * deliberate: the chip -> tier mapping lives only in chipTier.js, and an Intel
 * bucket spans several brand strings ("...i5-8279U", "...i5-1038NG7"), so a
 * server-side `cpu_brand = ?` would silently return a subset of the cohort the
 * bar counted. Slicing with the same parser that drew the bar keeps the panel
 * and the chart guaranteed consistent.
 *
 * @param params    () => filter params for firehose.health.battery_hosts
 * @param decorate  optional row mapper (display-name masking, etc.)
 */
export function useBatteryChipDrill({ params = () => ({}), decorate = rows => rows } = {}) {
  const hosts = ref([])
  const bucket = ref(null)
  const metric = ref('battery_cycles')
  const loading = ref(false)

  const drillHosts = computed(() => {
    if (!bucket.value) return []
    const want = bucket.value.key
    return hosts.value
      .filter(h => chipSpec(h.cpu_brand, h.cpu_class)?.key === want)
      // Worst first, by whichever measure was clicked. An unreadable capacity
      // (0) sorts last rather than first: it is a missing number, not a bad
      // one, and must not head a list titled "worst capacity".
      .slice()
      .sort((a, b) => metric.value === 'battery_capacity'
        ? (Number(a.battery_health_pct) || Infinity) - (Number(b.battery_health_pct) || Infinity)
        : (Number(b.battery_cycles) || 0) - (Number(a.battery_cycles) || 0))
  })

  const title = computed(() => {
    if (!bucket.value) return ''
    const n = drillHosts.value.length
    const what = metric.value === 'battery_capacity' ? 'capacity' : 'battery cycles'
    return `${bucket.value.label} — ${what} · ${n} host${n === 1 ? '' : 's'}`
  })

  function close() {
    bucket.value = null
  }

  /** Drop the cache — call whenever the fleet filter changes. */
  function reset() {
    hosts.value = []
    bucket.value = null
  }

  async function open(clicked, which) {
    if (!clicked?.key) return
    // Same bar + same metric closes. The same bar clicked from the OTHER chart
    // swaps the metric instead, so moving across the pair reads as one panel
    // changing its question rather than a panel closing and reopening.
    if (bucket.value?.key === clicked.key && metric.value === which) {
      close()
      return
    }
    bucket.value = clicked
    metric.value = which
    if (hosts.value.length) return
    loading.value = true
    try {
      hosts.value = decorate(await query('firehose.health.battery_hosts', params()))
    } catch (e) {
      console.error('Battery drill-down fetch failed:', e)
    }
    loading.value = false
  }

  return { hosts, bucket, metric, loading, drillHosts, title, open, close, reset }
}
