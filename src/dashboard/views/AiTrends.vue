<template>
  <div class="dashboard page-stack">
    <PageHeader
      title="AI tools"
      subtitle="What got more used, what got less — hosts per tool, day by day"
    />
    <AiToolsNav current="trends" />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ─── How much history this stands on ──────────────────── -->
    <div v-if="!unavailable && !error" class="source-line">
      <Chip :tone="trend.historyDays >= 7 ? 'info' : 'fair'" label="History" :value="historyLabel" />
      <span class="source-note">
        Each day shows every host's state as of the end of that day (its latest scan, no older than three days), so today is complete even while scans are still arriving.
        <template v-if="trend.historyDays && trend.historyDays < 7"> With under a week of scans, the differences below are what the data shows, not a trend — read them as provisional.</template>
      </span>
    </div>

    <EmptyState
      v-if="unavailable"
      title="AI tool history isn't available"
      info="The trend queries read the ai_tools tables on the firehose ClickHouse. Run the Worker locally (npm run dev:worker) or deploy it to see history."
    />

    <template v-else>
      <!-- ─── Fleet series ─────────────────────────────────────── -->
      <section class="section">
        <div class="grammar-head">
          <h2 class="grammar-title">Fleet — day by day</h2>
          <span class="grammar-hint">{{ trend.firstDay || '—' }} → {{ trend.latestDay || '—' }}</span>
        </div>
        <div class="metrics-row four-col">
          <MetricCard label="Hosts with AI tooling" :value="latestTotals.hosts_with_findings" :loading="loading" :subtitle="deltaText(totals, 'hosts_with_findings', 'hosts')" />
          <MetricCard label="Hosts scanned" :value="latestTotals.hosts_scanned" :loading="loading" :subtitle="deltaText(totals, 'hosts_scanned', 'hosts')" />
          <MetricCard label="Flagged findings" :value="latestTotals.flagged" :loading="loading" :subtitle="deltaText(totals, 'flagged', 'findings')" />
          <MetricCard label="Distinct MCP servers" :value="latestTotals.mcp_servers" :loading="loading" :subtitle="deltaText(totals, 'mcp_servers', 'servers')" />
        </div>
        <div class="charts-row two-col">
          <TimeSeriesChart title="Hosts with AI tooling" :data="totals" xKey="day" yKey="hosts_with_findings" :zoomable="false" :yMin="0" :loading="loading" />
          <TimeSeriesChart title="Flagged findings" :data="totals" xKey="day" yKey="flagged" :zoomable="false" :yMin="0" :color="palette.warning" :loading="loading" />
        </div>
      </section>

      <!-- ─── Movers ───────────────────────────────────────────── -->
      <section class="section">
        <div class="grammar-head">
          <h2 class="grammar-title">Movers — {{ trend.firstDay || '—' }} to {{ trend.latestDay || '—' }}</h2>
          <span class="grammar-hint">Hosts carrying the tool, latest day minus first day in the window. Instruction files excluded.</span>
        </div>
        <div class="charts-row two-col">
          <ChartCard title="More hosts" :loading="loading" :empty="!gaining.length" emptyText="No tool is on more hosts than on the first day">
            <ul class="mover-list">
              <li v-for="t in gaining.slice(0, 10)" :key="t.id" class="mover-row">
                <span class="mover-tool">{{ t.tool }}<span v-if="t.isNew" class="mover-tag">new</span></span>
                <span class="mover-tier" :class="'mover-tier--' + (t.tier || 'none')">{{ tierLabel(t.tier) }}</span>
                <span class="mover-hosts mono">{{ t.firstHosts }} → {{ t.latestHosts }}</span>
                <span class="mover-delta mover-delta--up mono">+{{ t.delta }}</span>
              </li>
            </ul>
          </ChartCard>
          <ChartCard title="Fewer hosts" :loading="loading" :empty="!losing.length" emptyText="No tool is on fewer hosts than on the first day">
            <ul class="mover-list">
              <li v-for="t in losing.slice(0, 10)" :key="t.id" class="mover-row">
                <span class="mover-tool">{{ t.tool }}<span v-if="t.isGone" class="mover-tag">gone</span></span>
                <span class="mover-tier" :class="'mover-tier--' + (t.tier || 'none')">{{ tierLabel(t.tier) }}</span>
                <span class="mover-hosts mono">{{ t.firstHosts }} → {{ t.latestHosts }}</span>
                <span class="mover-delta mover-delta--down mono">{{ t.delta }}</span>
              </li>
            </ul>
          </ChartCard>
        </div>
        <p v-if="!loading && steady.length" class="section-caption">
          {{ steady.length }} tool{{ steady.length === 1 ? '' : 's' }} unchanged between the two days<template v-if="steady.length <= 6">: {{ steady.map(t => t.tool).join(', ') }}</template>.
        </p>
      </section>

      <!-- ─── Surfaces over time ───────────────────────────────── -->
      <section class="section">
        <div class="grammar-head">
          <h2 class="grammar-title">Surfaces — hosts per discovery surface per day</h2>
          <span class="grammar-hint">Distinct hosts, exact</span>
        </div>
        <div class="surface-grid">
          <ChartCard v-for="s in surfaces" :key="s.type" :title="surfaceLabel(s.type)" :loading="loading" :empty="!s.series.length">
            <div class="surface-head">
              <span class="surface-latest mono">{{ s.latestHosts }}</span>
              <span class="surface-delta mono" :class="s.delta > 0 ? 'mover-delta--up' : s.delta < 0 ? 'mover-delta--down' : ''">{{ s.delta > 0 ? '+' : '' }}{{ s.delta || '±0' }}</span>
            </div>
            <Sparkline :points="s.series.map(p => p.hosts)" />
          </ChartCard>
        </div>
      </section>

      <!-- ─── Every tool ───────────────────────────────────────── -->
      <section class="section">
        <div class="grammar-head">
          <h2 class="grammar-title">All tools</h2>
          <div class="tools-controls">
            <Tabs v-model="tierFilter" :options="tierOptions" variant="underline" />
            <SearchInput v-model="toolFilter" placeholder="Filter tools…" />
          </div>
        </div>
        <DataTable
          :data="toolRows"
          :columns="toolColumns"
          :loading="loading"
          density="compact"
          :filter="toolFilter"
          defaultSortKey="latestHosts"
          :defaultSortAsc="false"
        />
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, h } from 'vue'
import { query } from '../services/api'
import PageHeader from '../components/base/PageHeader.vue'
import Chip from '../components/base/Chip.vue'
import ChartCard from '../components/base/ChartCard.vue'
import EmptyState from '../components/base/EmptyState.vue'
import Tabs from '../components/base/Tabs.vue'
import SearchInput from '../components/base/SearchInput.vue'
import MetricCard from '../components/MetricCard.vue'
import DataTable from '../components/DataTable.vue'
import TimeSeriesChart from '../components/TimeSeriesChart.vue'
import AiToolsNav from '../components/ai/AiToolsNav.vue'
import { toolTrends, surfaceSeries, totalsSeries } from '../composables/aiTrends'
import { SURFACES } from '../composables/aiInventory'
import { useFleetFilter } from '../composables/useFleetFilter'
import { useAppConfig } from '../composables/useAppConfig'
import { palette } from '../composables/uiPalette'

const WINDOW_DAYS = 30

const { filterParams } = useFleetFilter()
const { config } = useAppConfig()

const loading = ref(false)
const error = ref(null)
const unavailable = ref(false)
const dailyTools = ref([])
const dailySurfaces = ref([])
const dailyTotals = ref([])
const tierFilter = ref('')
const toolFilter = ref('')

async function load() {
  loading.value = true
  error.value = null
  unavailable.value = false
  const params = { ...filterParams.value, windowDays: WINDOW_DAYS }
  try {
    const [tools, surf, tot] = await Promise.all([
      query('firehose.ai.daily_tools', params),
      query('firehose.ai.daily_surfaces', params),
      query('firehose.ai.daily_totals', params),
    ])
    dailyTools.value = tools
    dailySurfaces.value = surf
    dailyTotals.value = tot
  } catch (e) {
    const msg = String(e?.message || '')
    if (/not found in registry|status 404|Request failed|Failed to fetch|NetworkError/i.test(msg)) unavailable.value = true
    else error.value = msg
    dailyTools.value = []; dailySurfaces.value = []; dailyTotals.value = []
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(filterParams, load, { deep: true })

// ─── Roll-ups ────────────────────────────────────────────────────
const trend = computed(() => toolTrends(dailyTools.value, config.value.knownAiVendors ? { knownVendors: config.value.knownAiVendors } : {}))
const surfaces = computed(() => surfaceSeries(dailySurfaces.value))
const totals = computed(() => totalsSeries(dailyTotals.value))
const latestTotals = computed(() => totals.value[totals.value.length - 1] || {})
const products = computed(() => trend.value.tools.filter(t => t.type !== 'agent_instruction'))
const gaining = computed(() => trend.value.gaining.filter(t => t.type !== 'agent_instruction'))
const losing = computed(() => trend.value.losing.filter(t => t.type !== 'agent_instruction'))
const steady = computed(() => products.value.filter(t => t.delta === 0 && t.latestHosts > 0))

const historyLabel = computed(() => {
  const n = trend.value.historyDays
  if (!n) return 'no scans yet'
  return `${n} day${n === 1 ? '' : 's'} since ${trend.value.firstDay}`
})

function deltaText(series, key, unit) {
  if (series.length < 2) return series.length === 1 ? 'one day of history' : ''
  const d = (series[series.length - 1][key] || 0) - (series[0][key] || 0)
  if (d === 0) return `unchanged since ${series[0].day}`
  return `${d > 0 ? '+' : ''}${d} ${unit} since ${series[0].day}`
}

const TIER_LABEL = { known: 'known', explorative: 'explorative', local: 'local', mcp: 'MCP' }
const tierLabel = t => TIER_LABEL[t] || '—'
const surfaceLabel = type => SURFACES.find(s => s.type === type)?.label || type

// ─── Inline sparkline (no chart library for seven tiny cards) ────
const Sparkline = (props) => {
  const pts = props.points || []
  const W = 220, H = 40, pad = 3
  if (pts.length < 2) {
    return h('div', { class: 'spark-single' }, pts.length ? `${pts[0]} on the only day` : '—')
  }
  const max = Math.max(...pts, 1)
  const x = i => pad + (i / (pts.length - 1)) * (W - 2 * pad)
  const y = v => pad + (1 - v / max) * (H - 2 * pad)
  const d = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return h('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark', preserveAspectRatio: 'none', 'aria-label': pts.join(', ') }, [
    h('polyline', { points: d, fill: 'none', stroke: 'var(--fleet-vibrant-blue)', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    h('circle', { cx: x(pts.length - 1), cy: y(pts[pts.length - 1]), r: 3, fill: 'var(--fleet-vibrant-blue)' }),
  ])
}
Sparkline.props = { points: { type: Array, default: () => [] } }

// ─── All tools table ─────────────────────────────────────────────
const tierOptions = computed(() => [
  { value: '', label: 'All', count: products.value.length },
  ...['known', 'explorative', 'local', 'mcp'].map(t => ({ value: t, label: TIER_LABEL[t], count: products.value.filter(p => p.tier === t).length })),
])
const toolColumns = [
  { key: 'tool', label: 'Tool' },
  { key: 'surface', label: 'Surface' },
  { key: 'tier_label', label: 'Tier' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'firstHosts', label: 'Hosts, first day', type: 'number', align: 'right' },
  { key: 'latestHosts', label: 'Hosts, latest day', type: 'number', align: 'right' },
  { key: 'delta', label: 'Δ hosts', type: 'number', align: 'right', tone: v => (Number(v) > 0 ? 'good' : Number(v) < 0 ? 'elevated' : null) },
  { key: 'peakHosts', label: 'Peak', type: 'number', align: 'right' },
]
const toolRows = computed(() => products.value
  .filter(t => !tierFilter.value || t.tier === tierFilter.value)
  .map(t => ({ ...t, tier_label: tierLabel(t.tier) })))
</script>

<style scoped>
.section { display: flex; flex-direction: column; gap: var(--pad-medium); }
.source-line { display: flex; align-items: center; flex-wrap: wrap; gap: var(--pad-small) var(--pad-medium); }
.source-note { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.grammar-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--pad-medium); flex-wrap: wrap; }
.grammar-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fleet-black); }
.grammar-hint { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

.mover-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.mover-row { display: grid; grid-template-columns: 1fr 90px 90px 56px; gap: var(--pad-small); align-items: center; padding: 7px 0; border-bottom: 1px solid var(--fleet-black-5); font-size: var(--font-size-sm); }
.mover-row:last-child { border-bottom: 0; }
.mover-tool { font-weight: 600; color: var(--fleet-black); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mover-tag { margin-left: 6px; padding: 1px 6px; border-radius: var(--radius); background: var(--fleet-black-5); color: var(--fleet-black-50); font-size: var(--font-size-xxsmall); font-weight: 600; text-transform: uppercase; }
.mover-tier { color: var(--fleet-black-50); }
.mover-tier--known { color: var(--status-good-text); }
.mover-tier--explorative { color: var(--status-fair-text); }
.mover-tier--local, .mover-tier--mcp { color: var(--fleet-vibrant-blue); }
.mover-hosts { color: var(--fleet-black-75); text-align: right; }
.mover-delta { text-align: right; font-weight: 700; }
.mover-delta--up { color: var(--status-good); }
.mover-delta--down { color: var(--status-elevated); }

.surface-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--pad-smedium); }
.surface-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px; }
.surface-latest { font-size: 24px; font-weight: 700; color: var(--fleet-black); }
.surface-delta { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.spark { width: 100%; height: 40px; display: block; }
.spark-single { font-size: var(--font-size-sm); color: var(--fleet-black-50); padding: 10px 0; }

.tools-controls { display: flex; align-items: center; gap: var(--pad-medium); flex-wrap: wrap; }

@media (max-width: 1100px) {
  .surface-grid { grid-template-columns: repeat(2, 1fr); }
  .mover-row { grid-template-columns: 1fr 80px 56px; }
  .mover-tier { display: none; }
}
</style>
