<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>DEX insights</h1>
      <span class="subtitle">Memory pressure, agent overhead, risk signals</span>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Fleet Summary -->
    <section class="section">
      <h2>Fleet summary</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Devices" :value="summary.total_devices" :loading="loading" />
        <MetricCard label="Avg memory pressure" :value="summary.avg_mem_pressure_pct" unit="%" :loading="loading" />
        <MetricCard label="High pressure (>50%)" :value="summary.high_pressure_devices" :loading="loading" />
        <MetricCard label="Critical (>70%)" :value="summary.critical_pressure_devices" :loading="loading" />
      </div>
    </section>

    <!-- Architecture Comparison -->
    <section class="section">
      <h2>Architecture comparison</h2>
      <div class="arch-cards">
        <div v-for="a in archData" :key="a.arch" class="arch-card">
          <div class="arch-name">{{ a.arch }}</div>
          <div class="arch-stat-row">
            <div class="arch-stat">
              <span class="stat-value">{{ a.device_count }}</span>
              <span class="stat-label">devices</span>
            </div>
            <div class="arch-stat">
              <span class="stat-value">{{ a.avg_ram_gb }}</span>
              <span class="stat-label">avg RAM (GB)</span>
            </div>
            <div class="arch-stat">
              <span class="stat-value" :class="pressureClass(a.avg_mem_pressure_pct)">{{ a.avg_mem_pressure_pct }}%</span>
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
      <h2>RAM utilization by tier</h2>
      <p class="section-desc">Devices with more RAM show higher pressure — not because they're struggling, but because they run heavier workloads (VMs, IDEs). The real risk is <strong>headroom</strong>: 8 GB devices at 8% have only ~0.6 GB of app memory — one heavy app away from swap. 128 GB at 28% has 92 GB free.</p>
      <div class="ram-tiers">
        <div v-for="t in ramTierData" :key="t.ram_tier" class="ram-tier-row">
          <div class="ram-tier-label">
            <span class="ram-tier-name">{{ t.ram_tier }}</span>
            <span class="ram-tier-count">{{ t.device_count }} device{{ t.device_count !== 1 ? 's' : '' }}</span>
          </div>
          <div class="ram-bar-container">
            <div class="ram-bar-track">
              <div
                class="ram-bar-used"
                :class="pressureClass(t.avg_mem_pressure_pct)"
                :style="{ width: Math.min(t.avg_mem_pressure_pct, 100) + '%' }"
              ></div>
              <div
                class="ram-bar-peak"
                :style="{ left: Math.min(t.max_mem_pressure_pct, 100) + '%' }"
              ></div>
            </div>
            <div class="ram-bar-labels">
              <span class="ram-used-label">{{ t.avg_used_gb }} GB used</span>
              <span class="ram-free-label">{{ Math.round((t.avg_total_ram_gb - t.avg_used_gb) * 10) / 10 }} GB free</span>
              <span class="ram-pct-label" :class="pressureClass(t.avg_mem_pressure_pct)">{{ t.avg_mem_pressure_pct }}%</span>
            </div>
          </div>
          <div class="ram-total-label">of {{ t.avg_total_ram_gb }} GB<br/><span class="ram-device-count">{{ t.device_count }} device{{ t.device_count !== 1 ? 's' : '' }}</span></div>
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
      <p class="chart-desc"><strong>Higher bar = worse.</strong> Compares CPU generations on memory pressure. Older chips (M1) with less RAM may show lower absolute pressure but be closer to their ceiling. Newer chips with more RAM absorb heavier workloads.</p>
    </section>

    <!-- Device Drill-Down -->
    <section v-if="selectedDevice" class="device-drawer" ref="drawerRef">
      <div class="drawer-header">
        <div>
          <h2>{{ selectedDevice.hostname }}</h2>
          <span class="drawer-sub">{{ selectedDevice.cpu_brand }} · {{ selectedDevice.hardware_model }} · {{ selectedDevice.memory_gb }} GB RAM · {{ selectedDevice.avg_mem_pressure_pct }}% pressure</span>
        </div>
        <button class="close-btn" @click="selectedDevice = null; deviceApps = []">&times;</button>
      </div>
      <div class="pressure-bar-wrap">
        <div class="pressure-bar">
          <div class="pressure-fill" :style="{ width: Math.min(selectedDevice.peak_mem_pressure_pct, 100) + '%' }" :class="pressureClass(selectedDevice.peak_mem_pressure_pct)"></div>
        </div>
        <span class="pressure-label">Peak: {{ selectedDevice.peak_mem_pressure_pct }}% of {{ selectedDevice.memory_gb }} GB</span>
      </div>
      <div v-if="deviceApps.length" class="table-wrap">
        <table class="data-table compact">
          <thead><tr><th>App</th><th>Memory (MB)</th><th>Threads</th><th>Bundle ID</th></tr></thead>
          <tbody>
            <tr v-for="a in deviceApps" :key="a.pid">
              <td class="hostname">{{ a.app_name }}</td>
              <td :class="memClass(a.memory_mb)">{{ a.memory_mb }}</td>
              <td>{{ a.threads }}</td>
              <td class="muted">{{ a.bundle_identifier }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Devices Under Pressure -->
    <section class="section">
      <h2>Devices by memory pressure</h2>
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
              <td class="hostname">{{ d.hostname }}</td>
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
      <h2>Management agent overhead</h2>
      <p class="section-desc">Memory cost of security and management agents across the fleet.</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Agent</th><th>Avg MB</th><th>P95 MB</th><th>Peak MB</th><th>Devices</th><th>Total RAM</th></tr></thead>
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
      <h2>Top user applications by total RAM footprint</h2>
      <p class="section-desc">Non-system apps ranked by avg memory × device count. Apps with high total RAM footprint across the fleet are candidates for optimization or license review.</p>
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
      <h2>Risk assessment</h2>
      <p class="section-desc">Devices scored on: Intel architecture (+1), RAM ≤ 8 GB (+1), memory pressure > 50% (+1). Score 2+ = likely poor DEX.</p>
      <div class="risk-summary">
        <span class="risk-badge risk-0">{{ riskCounts[0] || 0 }} healthy</span>
        <span class="risk-badge risk-1">{{ riskCounts[1] || 0 }} low risk</span>
        <span class="risk-badge risk-2">{{ riskCounts[2] || 0 }} moderate</span>
        <span class="risk-badge risk-3">{{ riskCounts[3] || 0 }} high risk</span>
      </div>
      <div v-if="riskyDevices.length" class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Hostname</th><th>CPU</th><th>RAM</th><th>Pressure</th><th>Risk</th><th>Factors</th></tr></thead>
          <tbody>
            <tr v-for="d in riskyDevices" :key="d.host_id">
              <td class="hostname">{{ d.hostname }}</td>
              <td>{{ d.cpu_brand }}</td>
              <td>{{ d.memory_gb }} GB</td>
              <td :class="pressureClass(d.avg_mem_pressure_pct)">{{ d.avg_mem_pressure_pct }}%</td>
              <td><span class="risk-badge" :class="'risk-' + d.risk_score">{{ d.risk_score }}/3</span></td>
              <td class="muted">{{ riskFactors(d) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="good-news">All devices scored 0 — no high-risk devices detected.</div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { query } from '../services/api'
import MetricCard from '../components/MetricCard.vue'
import BarChart from '../components/BarChart.vue'

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
const appSortCol = ref('fleet_cost_mb')
const appSortAsc = ref(false)
const devSortCol = ref('avg_mem_pressure_pct')
const devSortAsc = ref(false)

const totalAgentOverhead = computed(() => agentData.value.reduce((s, a) => s + (Number(a.fleet_cost_mb) || 0), 0))

const riskCounts = computed(() => {
  const c = {}
  for (const d of riskData.value) c[d.risk_score] = (c[d.risk_score] || 0) + 1
  return c
})

const riskyDevices = computed(() => riskData.value.filter(d => d.risk_score > 0))

const sortedPressureDevices = computed(() => {
  return [...pressureDevices.value].sort((a, b) => {
    const av = a[devSortCol.value] ?? ''
    const bv = b[devSortCol.value] ?? ''
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return devSortAsc.value ? cmp : -cmp
  })
})

function sortDevBy(col) {
  if (devSortCol.value === col) devSortAsc.value = !devSortAsc.value
  else { devSortCol.value = col; devSortAsc.value = col === 'hostname' }
}

function devSortIcon(col) {
  if (devSortCol.value !== col) return ''
  return devSortAsc.value ? '\u25B2' : '\u25BC'
}

const sortedTopApps = computed(() => {
  return [...topApps.value].sort((a, b) => {
    const av = a[appSortCol.value] ?? ''
    const bv = b[appSortCol.value] ?? ''
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return appSortAsc.value ? cmp : -cmp
  })
})

function sortAppsBy(col) {
  if (appSortCol.value === col) appSortAsc.value = !appSortAsc.value
  else { appSortCol.value = col; appSortAsc.value = col === 'app_name' }
}

function appSortIcon(col) {
  if (appSortCol.value !== col) return ''
  return appSortAsc.value ? '\u25B2' : '\u25BC'
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
.dashboard { max-width: 1280px; margin: 0 auto; padding: var(--pad-xlarge); }
.dashboard-header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 24px; }
.subtitle { font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--fleet-black-50); }
h1 { font-size: var(--font-size-lg); font-weight: 600; color: var(--fleet-black); font-family: var(--font-mono); }
h2 { font-size: var(--font-size-md); font-weight: 600; color: var(--fleet-black); font-family: var(--font-mono); margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--fleet-black-10); }
.section-desc { font-size: var(--font-size-sm); color: var(--fleet-black-50); margin: -8px 0 16px; }
.chart-desc { font-size: var(--font-size-xs); color: var(--fleet-black-50); margin-top: 8px; line-height: 1.5; }
.error-banner { background: var(--fleet-white); color: var(--fleet-error); padding: 12px 16px; border-radius: var(--radius); border: 1px solid var(--fleet-black-10); border-left: 3px solid var(--fleet-error); margin-bottom: 24px; }
.section { margin-bottom: 32px; }
.metrics-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 24px; }
.metrics-row.four-col { grid-template-columns: repeat(4, 1fr); }
.charts-row.two-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 24px; }

/* Architecture cards */
.arch-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.arch-card { background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius); padding: 16px 20px; }
.arch-name { font-family: var(--font-mono); font-size: var(--font-size-md); font-weight: 700; margin-bottom: 12px; }
.arch-stat-row { display: flex; gap: 20px; }
.arch-stat { display: flex; flex-direction: column; }
.stat-value { font-family: var(--font-mono); font-size: var(--font-size-lg); font-weight: 600; }
.stat-label { font-size: var(--font-size-xs); color: var(--fleet-black-50); }

/* Pressure colors */
.pressure-ok { color: #16a34a; }
.pressure-moderate { color: #ca8a04; font-weight: 600; }
.pressure-high { color: #ea580c; font-weight: 600; }
.pressure-critical { color: #dc2626; font-weight: 700; }

/* Pressure bar */
.pressure-bar-wrap { margin: 12px 0 16px; }
.pressure-bar { height: 8px; background: var(--fleet-black-5); border-radius: 4px; overflow: hidden; }
.pressure-fill { height: 100%; border-radius: 4px; transition: width 300ms; }
.pressure-fill.pressure-ok { background: #16a34a; }
.pressure-fill.pressure-moderate { background: #ca8a04; }
.pressure-fill.pressure-high { background: #ea580c; }
.pressure-fill.pressure-critical { background: #dc2626; }
.pressure-label { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); margin-top: 4px; display: block; }

/* Device drawer */
.device-drawer { background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-left: 3px solid #3b82f6; border-radius: var(--radius); padding: 20px 24px; margin-bottom: 32px; }
.drawer-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.drawer-header h2 { margin: 0; padding: 0; border: none; }
.drawer-sub { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.close-btn { background: none; border: 1px solid var(--fleet-black-10); border-radius: var(--radius); font-size: 20px; cursor: pointer; color: var(--fleet-black-50); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; }
.close-btn:hover { background: var(--fleet-off-white); }

/* Tables */
.table-wrap { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-family: var(--font-body); font-size: var(--font-size-sm); }
.data-table.compact { font-size: var(--font-size-xs); }
.data-table th { text-align: left; padding: 8px 12px; font-weight: 600; color: var(--fleet-black-50); border-bottom: 2px solid var(--fleet-black-10); font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.5px; }
.data-table th.sortable { cursor: pointer; user-select: none; }
.data-table th.sortable:hover { color: var(--fleet-black); }
.data-table td { padding: 8px 12px; border-bottom: 1px solid var(--fleet-black-5); }
.data-table tfoot td { padding: 10px 12px; border-top: 2px solid var(--fleet-black-10); border-bottom: none; }
.total-row { background: var(--fleet-off-white); }
.clickable-row { cursor: pointer; transition: background 100ms; }
.clickable-row:hover { background: var(--fleet-off-white); }
.clickable-row.selected { background: #eff6ff; }
.hostname { font-family: var(--font-mono); font-weight: 500; }
.muted { color: var(--fleet-black-50); font-size: var(--font-size-xs); }

/* Risk badges */
.risk-summary { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.risk-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-family: var(--font-mono); font-size: var(--font-size-xs); font-weight: 600; }
.risk-0 { background: #dcfce7; color: #166534; }
.risk-1 { background: #fef9c3; color: #854d0e; }
.risk-2 { background: #fed7aa; color: #9a3412; }
.risk-3 { background: #fecaca; color: #991b1b; }

/* RAM tier utilization */
.ram-tiers { display: flex; flex-direction: column; gap: 16px; }
.ram-tier-row { display: grid; grid-template-columns: 100px 1fr 70px; gap: 12px; align-items: center; }
.ram-tier-label { display: flex; flex-direction: column; }
.ram-tier-name { font-family: var(--font-mono); font-size: var(--font-size-sm); font-weight: 700; color: var(--fleet-black); }
.ram-tier-count { font-size: 10px; color: var(--fleet-black-50); }
.ram-bar-container { flex: 1; }
.ram-bar-track { height: 24px; background: var(--fleet-black-5); border-radius: 4px; position: relative; overflow: visible; }
.ram-bar-used { height: 100%; border-radius: 4px; transition: width 500ms ease; min-width: 2px; }
.ram-bar-used.pressure-ok { background: linear-gradient(90deg, #86efac, #22c55e); }
.ram-bar-used.pressure-moderate { background: linear-gradient(90deg, #fde68a, #eab308); }
.ram-bar-used.pressure-high { background: linear-gradient(90deg, #fdba74, #ea580c); }
.ram-bar-used.pressure-critical { background: linear-gradient(90deg, #fca5a5, #dc2626); }
.ram-bar-peak { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--fleet-black-50); border-radius: 1px; }
.ram-bar-labels { display: flex; justify-content: space-between; margin-top: 4px; }
.ram-used-label { font-family: var(--font-mono); font-size: 10px; color: var(--fleet-black-75); }
.ram-free-label { font-family: var(--font-mono); font-size: 10px; color: var(--fleet-black-50); }
.ram-pct-label { font-family: var(--font-mono); font-size: 11px; font-weight: 700; }
.ram-total-label { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); text-align: right; }
.ram-device-count { font-size: 10px; color: var(--fleet-black-50); }

.good-news { background: #dcfce7; color: #166534; padding: 16px 20px; border-radius: var(--radius); font-family: var(--font-mono); font-size: var(--font-size-sm); }

@media (max-width: 1024px) { .metrics-row.four-col { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .metrics-row, .metrics-row.four-col { grid-template-columns: 1fr; } .charts-row.two-col { grid-template-columns: 1fr; } .dashboard-header { flex-direction: column; gap: 8px; } .arch-stat-row { flex-wrap: wrap; } }
</style>
