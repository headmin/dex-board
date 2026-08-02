<template>
  <div class="dashboard page-stack">
    <PageHeader title="Insights" subtitle="Memory pressure, agent overhead, risk signals" />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Fleet Summary -->
    <section class="section">
      <SectionHeader title="Fleet summary" />
      <div class="metrics-row four-col">
        <MetricCard label="Hosts reporting pressure" :value="summary.total_devices" :loading="loading" />
        <MetricCard label="Avg memory pressure" :value="summary.avg_mem_pressure_pct" unit="%" :loading="loading" />
        <MetricCard label="High pressure (>50%)" :value="summary.high_pressure_devices" :loading="loading" />
        <MetricCard label="Critical (>70%)" :value="summary.critical_pressure_devices" :loading="loading" />
      </div>
    </section>

    <!-- Architecture Comparison -->
    <section class="section">
      <SectionHeader title="Architecture comparison" />
      <div class="arch-cards">
        <div v-for="a in archData" :key="a.arch" class="arch-card">
          <div class="arch-name">{{ a.arch }}</div>
          <div class="arch-stat-row">
            <div class="arch-stat">
              <span class="stat-value">{{ a.device_count }}</span>
              <span class="stat-label">hosts</span>
            </div>
            <div class="arch-stat">
              <span class="stat-value">{{ a.avg_ram_gb }}</span>
              <span class="stat-label">avg RAM (GB)</span>
            </div>
            <div class="arch-stat">
              <span class="stat-value" :class="a.avg_mem_pressure_pct ? pressureClass(a.avg_mem_pressure_pct) : ''" :title="a.avg_mem_pressure_pct ? '' : 'No memory-pressure telemetry for this architecture'">{{ a.avg_mem_pressure_pct ? a.avg_mem_pressure_pct + '%' : '—' }}</span>
              <span class="stat-label">avg pressure</span>
            </div>
            <div class="arch-stat">
              <span class="stat-value">{{ a.avg_uptime_hours }}h</span>
              <span class="stat-label">avg uptime</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- RAM Utilization -->
    <section class="section">
      <SectionHeader title="RAM utilization by tier" />
      <p class="section-caption">Hosts with more RAM show higher pressure — not because they're struggling, but because they run heavier workloads (VMs, IDEs). The real risk is <strong>headroom</strong>: 8 GB hosts at 8% have only ~0.6 GB of app memory — one heavy app away from swap. 128 GB at 28% has 92 GB free.</p>
      <div class="ram-tiers">
        <div v-for="t in ramTierData" :key="t.ram_tier" class="ram-tier-row">
          <div class="ram-tier-label">
            <span class="ram-tier-name">{{ t.ram_tier }}</span>
            <span class="ram-tier-count">{{ t.device_count }} host{{ t.device_count !== 1 ? 's' : '' }}</span>
          </div>
          <div class="ram-bar-container">
            <MeterBar height="var(--bar-height)" :value="t.avg_mem_pressure_pct" :marker="t.max_mem_pressure_pct" />
            <div class="ram-bar-labels">
              <span class="ram-used-label">{{ t.avg_used_gb }} GB used</span>
              <span class="ram-free-label">{{ Math.round((t.avg_total_ram_gb - t.avg_used_gb) * 10) / 10 }} GB free</span>
              <span class="ram-pct-label" :class="pressureClass(t.avg_mem_pressure_pct)">{{ t.avg_mem_pressure_pct }}%</span>
            </div>
          </div>
          <div class="ram-total-label">of {{ t.avg_total_ram_gb }} GB<br/><span class="ram-device-count">{{ t.device_count }} host{{ t.device_count !== 1 ? 's' : '' }}</span></div>
        </div>
      </div>
    </section>

    <!-- Pressure by CPU -->
    <section class="section">
      <BarChart
        title="Memory pressure by CPU generation"
        :data="cpuData"
        :loading="loading"
        nameKey="cpu_brand"
        valueKey="avg_mem_pressure_pct"
      />
      <p class="section-caption"><strong>Higher bar = worse.</strong> Compares CPU generations on memory pressure. Older chips (M1) with less RAM may show lower absolute pressure but be closer to their ceiling. Newer chips with more RAM absorb heavier workloads.</p>
    </section>

    <!-- Device Drill-Down -->
    <section v-if="selectedDevice" ref="drawerRef">
      <Drawer :title="displayHost(selectedDevice)" @close="selectedDevice = null; deviceApps = []">
        <template #subtitle>{{ selectedDevice.cpu_brand }} · {{ selectedDevice.hardware_model }} · {{ selectedDevice.memory_gb }} GB RAM · {{ selectedDevice.avg_mem_pressure_pct }}% pressure</template>
        <div class="pressure-bar-wrap">
          <MeterBar :value="selectedDevice.peak_mem_pressure_pct" />
          <span class="pressure-label">Peak: {{ selectedDevice.peak_mem_pressure_pct }}% of {{ selectedDevice.memory_gb }} GB</span>
        </div>
        <DataTable
          v-if="deviceApps.length"
          :data="deviceApps"
          :columns="deviceAppColumns"
          density="compact"
        />
      </Drawer>
    </section>

    <!-- Devices Under Pressure -->
    <section class="section">
      <SectionHeader title="Hosts by memory pressure" />
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th @click="sortDevBy('hostname')" class="sortable">Hostname {{ devSortIcon('hostname') }}</th>
              <th @click="sortDevBy('cpu_brand')" class="sortable">CPU {{ devSortIcon('cpu_brand') }}</th>
              <th @click="sortDevBy('hardware_model')" class="sortable">Model {{ devSortIcon('hardware_model') }}</th>
              <th @click="sortDevBy('memory_gb')" class="sortable">RAM {{ devSortIcon('memory_gb') }}</th>
              <th @click="sortDevBy('avg_mem_pressure_pct')" class="sortable">Avg Pressure {{ devSortIcon('avg_mem_pressure_pct') }}</th>
              <th @click="sortDevBy('peak_mem_pressure_pct')" class="sortable">Peak Pressure {{ devSortIcon('peak_mem_pressure_pct') }}</th>
              <th @click="sortDevBy('avg_total_app_mem_mb')" class="sortable">Avg App Mem {{ devSortIcon('avg_total_app_mem_mb') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in sortedPressureDevices" :key="d.host_id" class="clickable-row" :class="{ selected: selectedDevice?.host_id === d.host_id }" @click="selectDevice(d)">
              <td class="hostname">{{ displayHost(d) }}</td>
              <td>{{ d.cpu_brand }}</td>
              <td>{{ d.hardware_model }}</td>
              <td>{{ d.memory_gb }} GB</td>
              <td :class="pressureClass(d.avg_mem_pressure_pct)">{{ d.avg_mem_pressure_pct }}%</td>
              <td :class="pressureClass(d.peak_mem_pressure_pct)">{{ d.peak_mem_pressure_pct }}%</td>
              <td>{{ formatMB(d.avg_total_app_mem_mb) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Agent Overhead -->
    <section class="section">
      <SectionHeader title="Management agent overhead" caption="Memory cost of security and management agents across the fleet." />
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Agent</th><th>Avg MB</th><th>P95 MB</th><th>Peak MB</th><th>Hosts</th><th>Total RAM</th></tr></thead>
          <tbody>
            <tr v-for="a in agentData" :key="a.bundle_identifier">
              <td class="hostname">{{ a.app_name }}</td>
              <td>{{ a.avg_mem_mb }}</td>
              <td>{{ a.p95_mem_mb }}</td>
              <td :class="memClass(a.peak_mem_mb)">{{ a.peak_mem_mb }}</td>
              <td>{{ a.device_count }}</td>
              <td><strong>{{ formatMB(a.fleet_cost_mb) }}</strong></td>
            </tr>
          </tbody>
          <tfoot v-if="agentData.length">
            <tr class="total-row">
              <td colspan="5"><strong>Total agent RAM overhead</strong></td>
              <td><strong>{{ formatMB(totalAgentOverhead) }}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <!-- Top User Apps -->
    <section class="section">
      <SectionHeader title="Top user applications by total RAM footprint" caption="Non-system apps ranked by avg memory × host count. Apps with high total RAM footprint across the fleet are candidates for optimization or license review." />
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th @click="sortAppsBy('app_name')" class="sortable">App {{ appSortIcon('app_name') }}</th>
            <th @click="sortAppsBy('device_count')" class="sortable">Devices {{ appSortIcon('device_count') }}</th>
            <th @click="sortAppsBy('avg_mem_mb')" class="sortable">Avg MB {{ appSortIcon('avg_mem_mb') }}</th>
            <th @click="sortAppsBy('peak_mem_mb')" class="sortable">Peak MB {{ appSortIcon('peak_mem_mb') }}</th>
            <th @click="sortAppsBy('fleet_cost_mb')" class="sortable">Total RAM {{ appSortIcon('fleet_cost_mb') }}</th>
          </tr></thead>
          <tbody>
            <tr v-for="a in sortedTopApps" :key="a.bundle_identifier">
              <td class="hostname">{{ a.app_name }}</td>
              <td>{{ a.device_count }}</td>
              <td>{{ a.avg_mem_mb }}</td>
              <td :class="memClass(a.peak_mem_mb)">{{ a.peak_mem_mb }}</td>
              <td><strong>{{ formatMB(a.fleet_cost_mb) }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Risk Assessment -->
    <section class="section">
      <SectionHeader title="Risk assessment" caption="Hosts scored on: Intel architecture (+1), RAM ≤ 8 GB (+1), memory pressure > 50% (+1). Score 2+ = likely poor DEX." />
      <div class="risk-summary">
        <Chip tone="good">{{ riskCounts[0] || 0 }} healthy</Chip>
        <Chip tone="fair">{{ riskCounts[1] || 0 }} low risk</Chip>
        <Chip tone="elevated">{{ riskCounts[2] || 0 }} moderate</Chip>
        <Chip tone="critical">{{ riskCounts[3] || 0 }} high risk</Chip>
      </div>
      <div v-if="riskyDevices.length" class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Hostname</th><th>CPU</th><th>RAM</th><th>Pressure</th><th>Risk</th><th>Factors</th></tr></thead>
          <tbody>
            <tr v-for="d in riskyDevices" :key="d.host_id">
              <td class="hostname">
                <router-link
                  :to="{ path: '/hosts', query: { hostId: d.host_id, focus: 'movers' } }"
                  class="host-link"
                  :title="`Inspect ${displayHost(d)} →`"
                >{{ displayHost(d) }}</router-link>
              </td>
              <td>{{ d.cpu_brand }}</td>
              <td>{{ d.memory_gb }} GB</td>
              <td :class="pressureClass(d.avg_mem_pressure_pct)">{{ d.avg_mem_pressure_pct }}%</td>
              <td><Badge :tone="riskTone(d.risk_score)" :label="d.risk_score + '/3'" /></td>
              <td class="muted">{{ riskFactors(d) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-else small title="No high-risk hosts" info="All hosts scored 0 — no high-risk hosts detected." />
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { query } from '../services/api'
import { useFleetFilter } from '../composables/useFleetFilter'
import { useSort } from '../composables/useSort'
import MetricCard from '../components/MetricCard.vue'
import BarChart from '../components/BarChart.vue'
import DataTable from '../components/DataTable.vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import Drawer from '../components/base/Drawer.vue'
import MeterBar from '../components/base/MeterBar.vue'
import Chip from '../components/base/Chip.vue'
import Badge from '../components/base/Badge.vue'
import EmptyState from '../components/base/EmptyState.vue'
import { displayHost } from '../composables/displayName'

const { searchText: globalSearch, selectedModel, selectedRAMTier } = useFleetFilter()

const error = ref(null)
const loading = ref(true)

const summary = ref({})
const archData = ref([])
const ramTierData = ref([])
const cpuData = ref([])
const pressureDevices = ref([])
const agentData = ref([])
const topApps = ref([])
const riskData = ref([])

const selectedDevice = ref(null)
const deviceApps = ref([])
const drawerRef = ref(null)

const totalAgentOverhead = computed(() => agentData.value.reduce((s, a) => s + (Number(a.fleet_cost_mb) || 0), 0))

const riskCounts = computed(() => {
  const c = {}
  for (const d of riskData.value) c[d.risk_score] = (c[d.risk_score] || 0) + 1
  return c
})

function applyGlobalFilter(list) {
  let filtered = list
  if (globalSearch.value) {
    const s = globalSearch.value.toLowerCase()
    filtered = filtered.filter(d =>
      (d.hostname || '').toLowerCase().includes(s) ||
      (d.cpu_brand || '').toLowerCase().includes(s) ||
      (d.host_id || '').toLowerCase().includes(s)
    )
  }
  if (selectedModel.value) {
    filtered = filtered.filter(d => d.hardware_model === selectedModel.value)
  }
  if (selectedRAMTier.value) {
    const target = parseInt(selectedRAMTier.value)
    if (selectedRAMTier.value === '128GB+') {
      filtered = filtered.filter(d => (Number(d.memory_gb) || 0) >= 128)
    } else if (target) {
      filtered = filtered.filter(d => {
        const gb = Number(d.memory_gb) || 0
        return gb >= target && gb < target * 2
      })
    }
  }
  return filtered
}

const riskyDevices = computed(() => applyGlobalFilter(riskData.value.filter(d => d.risk_score > 0)))

/* ─── Table sorting (shared composable) ─────────────────── */
const DEV_NUMERIC_COLS = new Set(['memory_gb', 'avg_mem_pressure_pct', 'peak_mem_pressure_pct', 'avg_total_app_mem_mb'])
const devSort = useSort('avg_mem_pressure_pct', false)

const sortedPressureDevices = computed(() =>
  devSort.sortRows(applyGlobalFilter(pressureDevices.value), k => DEV_NUMERIC_COLS.has(k))
)

function sortDevBy(col) {
  devSort.toggleSort(col, DEV_NUMERIC_COLS.has(col))
}

function devSortIcon(col) {
  if (devSort.sortKey.value !== col) return ''
  return devSort.sortAsc.value ? '▲' : '▼'
}

const APP_NUMERIC_COLS = new Set(['device_count', 'avg_mem_mb', 'peak_mem_mb', 'fleet_cost_mb'])
const appSort = useSort('fleet_cost_mb', false)

const sortedTopApps = computed(() =>
  appSort.sortRows(topApps.value, k => APP_NUMERIC_COLS.has(k))
)

function sortAppsBy(col) {
  appSort.toggleSort(col, APP_NUMERIC_COLS.has(col))
}

function appSortIcon(col) {
  if (appSort.sortKey.value !== col) return ''
  return appSort.sortAsc.value ? '▲' : '▼'
}

function pressureClass(pct) {
  if (pct >= 70) return 'pressure-critical'
  if (pct >= 50) return 'pressure-high'
  if (pct >= 30) return 'pressure-moderate'
  return 'pressure-ok'
}

function memClass(mb) {
  if (mb > 1000) return 'pressure-critical'
  if (mb > 500) return 'pressure-high'
  return ''
}

function memTone(mb) {
  if (mb > 1000) return 'critical'
  if (mb > 500) return 'elevated'
  return null
}

const deviceAppColumns = [
  { key: 'app_name', label: 'App' },
  { key: 'memory_mb', label: 'Memory (MB)', type: 'number', tone: memTone },
  { key: 'threads', label: 'Threads', type: 'number' },
  { key: 'bundle_identifier', label: 'Bundle ID' },
]

function riskTone(score) {
  return ['good', 'fair', 'elevated', 'critical'][Math.min(Number(score) || 0, 3)]
}

function formatMB(mb) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${Math.round(mb)} MB`
}

function riskFactors(d) {
  const f = []
  if (d.is_intel) f.push('Intel')
  if (d.is_low_ram) f.push('≤8 GB RAM')
  if (d.is_high_pressure) f.push('>50% pressure')
  return f.join(', ')
}

async function selectDevice(device) {
  selectedDevice.value = device
  await nextTick()
  drawerRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  try {
    deviceApps.value = await query('firehose.apps.per_device', { hostId: device.host_id })
  } catch (e) {
    deviceApps.value = []
  }
}

async function fetchAll() {
  loading.value = true
  error.value = null
  try {
    const [s, arch, ram, cpu, pressure, agents, apps, risk] = await Promise.all([
      query('firehose.insights.summary'),
      query('firehose.insights.pressure_by_arch'),
      query('firehose.insights.pressure_by_ram_tier'),
      query('firehose.insights.pressure_by_cpu'),
      query('firehose.insights.memory_pressure', { limit: 100 }),
      query('firehose.insights.agent_overhead'),
      query('firehose.insights.top_user_apps', { limit: 20 }),
      query('firehose.insights.risk_devices'),
    ])
    summary.value = s[0] || {}
    archData.value = arch
    ramTierData.value = ram
    cpuData.value = cpu
    pressureDevices.value = pressure
    agentData.value = agents
    topApps.value = apps
    riskData.value = risk
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchAll())
</script>

<style scoped>
/* ─── Page Layout ─────────────────────────────────────── */
.dashboard {
  max-width: 1400px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--pad-medium);
}

.section-caption {
  margin: 0;
  line-height: var(--line-height-relaxed);
}

/* ─── Architecture Cards ──────────────────────────────── */
.arch-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--pad-medium);
}

.arch-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--card-pad);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.arch-card:hover {
  border-color: var(--fleet-black-25);
  box-shadow: var(--shadow-sm);
}

.arch-name {
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  margin-bottom: var(--pad-medium);
}

.arch-stat-row {
  display: flex;
  gap: var(--pad-large);
}

.arch-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: var(--metric-value-size);
  font-weight: 600;
  color: var(--fleet-black);
}

.stat-label {
  font-family: var(--font-body);
  font-size: var(--metric-label-size);
  font-weight: 500;
  color: var(--fleet-black-75);
}

/* ─── Pressure Colors ─────────────────────────────────── */
.pressure-ok { color: var(--status-good); }
.pressure-moderate { color: var(--status-fair-text); font-weight: 600; }
.pressure-high { color: var(--status-elevated); font-weight: 600; }
.pressure-critical { color: var(--status-critical); font-weight: 700; }

/* ─── Drawer pressure gauge ───────────────────────────── */
.pressure-bar-wrap {
  margin: var(--pad-medium) 0;
}

.pressure-label {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  margin-top: var(--pad-xs);
  display: block;
}

/* ─── Tables ──────────────────────────────────────────── */
.table-wrap {
  overflow-x: auto;
  background: var(--fleet-white);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-large);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-body);
  font-size: var(--table-font-size);
}

.data-table th {
  text-align: left;
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
  font-weight: 700;
  color: var(--fleet-black);
  background: var(--fleet-off-white);
  border-bottom: 1px solid var(--fleet-black-10);
  font-size: var(--table-header-font-size);
  white-space: nowrap;
}
.data-table th:first-child { border-top-left-radius: var(--radius-large); }
.data-table th:last-child { border-top-right-radius: var(--radius-large); }

.data-table th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color var(--transition-fast);
}

.data-table th.sortable:hover {
  color: var(--fleet-black);
}

.data-table td {
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
  border-bottom: 1px solid var(--fleet-black-10);
  color: var(--fleet-black-75);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.data-table tfoot td {
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
  border-top: 1px solid var(--fleet-black-10);
  border-bottom: none;
  background: var(--fleet-black-3);
}

.total-row {
  font-weight: 600;
}

.clickable-row {
  cursor: pointer;
  transition: background var(--transition-fast);
}

.clickable-row:hover {
  background: var(--fleet-black-3);
}

.clickable-row.selected {
  background: var(--fleet-accent-green-light);
}

.hostname {
  font-weight: 500;
  font-size: var(--font-size-sm);
}

.host-link {
  color: var(--fleet-core-vibrant-blue);
  text-decoration: none;
  transition: color var(--transition-fast);
}

.host-link:hover {
  color: var(--fleet-black);
  text-decoration: underline;
}

.muted {
  color: var(--fleet-black-50);
  font-size: var(--font-size-xs);
}

/* ─── Risk summary chips ──────────────────────────────── */
.risk-summary {
  display: flex;
  gap: var(--pad-small);
  flex-wrap: wrap;
}

/* ─── RAM Tier Utilization ────────────────────────────── */
.ram-tiers {
  display: flex;
  flex-direction: column;
  gap: var(--pad-large);
}

.ram-tier-row {
  display: grid;
  grid-template-columns: 100px 1fr 80px;
  gap: var(--pad-medium);
  align-items: center;
}

.ram-tier-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ram-tier-name {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
}

.ram-tier-count {
  font-family: var(--font-body);
  font-size: 9px;
  color: var(--fleet-black-50);
}

.ram-bar-container {
  flex: 1;
}

.ram-bar-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
}

.ram-used-label {
  font-size: 10px;
  color: var(--fleet-black-75);
}

.ram-free-label {
  font-size: 10px;
  color: var(--fleet-black-50);
}

.ram-pct-label {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.ram-total-label {
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  text-align: right;
}

.ram-device-count {
  font-size: 9px;
  color: var(--fleet-black-50);
}

/* ─── Responsive ──────────────────────────────────────── */
@media (max-width: 768px) {
  .arch-stat-row {
    flex-wrap: wrap;
  }

  .ram-tier-row {
    grid-template-columns: 1fr;
    gap: var(--pad-small);
  }
}
</style>
