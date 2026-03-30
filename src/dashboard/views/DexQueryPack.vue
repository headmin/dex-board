<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>DEX query pack</h1>
      <TimeRangeFilter />
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Overview Metrics -->
    <section class="section">
      <h2>Overview</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Active devices" :value="overview.deviceCount" :loading="loading.overview" />
        <MetricCard label="Health events" :value="overview.healthEvents" :loading="loading.overview" />
        <MetricCard label="P95 memory %" :value="overview.p95Memory" :loading="loading.overview" />
        <MetricCard label="P95 disk %" :value="overview.p95Disk" :loading="loading.overview" />
      </div>
    </section>

    <!-- Category Tabs -->
    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >{{ tab.label }}</button>
    </div>

    <!-- System Performance -->
    <template v-if="activeTab === 'performance'">
      <section class="section">
        <h2>System performance</h2>
        <div class="charts-row two-col">
          <TimeSeriesChart
            title="Average memory usage %"
            :data="perf.memoryOverTime"
            :loading="loading.performance"
            xKey="time"
            yKey="avg_memory"
            :threshold="85"
            thresholdLabel="Warning"
            color="#4a90d9"
          />
          <TimeSeriesChart
            title="Average disk usage %"
            :data="perf.diskOverTime"
            :loading="loading.performance"
            xKey="time"
            yKey="avg_disk"
            :threshold="90"
            thresholdLabel="Critical"
            color="#f59e0b"
          />
        </div>
        <div class="charts-row two-col">
          <BarChart
            title="Memory by device (latest)"
            :data="perf.memoryByDevice"
            :loading="loading.performance"
            nameKey="device"
            valueKey="memory_pct"
          />
          <PieChart
            title="Uptime distribution"
            :data="perf.uptimeDistribution"
            :loading="loading.performance"
            nameKey="uptime_bucket"
            valueKey="count"
          />
        </div>
        <DataTable
          title="Disk status by device"
          :data="perf.diskByDevice"
          :columns="diskColumns"
          :loading="loading.performance"
          :clickable="true"
          @row-click="selectDevice"
        />
      </section>
    </template>

    <!-- Top Processes -->
    <template v-if="activeTab === 'processes'">
      <section class="section">
        <h2>Process analysis</h2>
        <div class="metrics-row four-col">
          <MetricCard label="Unique processes" :value="proc.uniqueCount" :loading="loading.processes" />
          <MetricCard label="Avg threads (top 5)" :value="proc.avgThreads" :loading="loading.processes" />
          <MetricCard label="Heaviest process" :value="proc.heaviest" :loading="loading.processes" />
          <MetricCard label="P95 process memory" :value="proc.p95Memory + ' MB'" :loading="loading.processes" />
        </div>
        <div class="charts-row two-col">
          <BarChart
            title="Top 10 processes by average memory (MB)"
            :data="proc.topByMemory"
            :loading="loading.processes"
            nameKey="process_name"
            valueKey="avg_mb"
          />
          <BarChart
            title="Top 10 processes by max memory (MB)"
            :data="proc.topByPeak"
            :loading="loading.processes"
            nameKey="process_name"
            valueKey="peak_mb"
          />
        </div>
        <div class="charts-row two-col">
          <TimeSeriesChart
            title="Top 5 processes — memory over time"
            :data="proc.trend"
            :loading="loading.processes"
            xKey="time"
            yKey="avg_mb"
          />
          <PieChart
            title="Process state distribution"
            :data="proc.stateDistribution"
            :loading="loading.processes"
            nameKey="state"
            valueKey="count"
          />
        </div>
        <DataTable
          title="All processes (latest snapshot)"
          :data="proc.latestSnapshot"
          :columns="processColumns"
          :loading="loading.processes"
          :clickable="true"
          @row-click="selectDevice"
        />
      </section>
    </template>

    <!-- Hardware Inventory -->
    <template v-if="activeTab === 'hardware'">
      <section class="section">
        <h2>Hardware inventory</h2>
        <div class="metrics-row four-col">
          <MetricCard label="Total devices" :value="hw.deviceCount" :loading="loading.hardware" />
          <MetricCard label="Avg RAM (GB)" :value="hw.avgRam" :loading="loading.hardware" />
          <MetricCard label="Avg disk (GB)" :value="hw.avgDiskTotal" :loading="loading.hardware" />
          <MetricCard label="Hardware models" :value="hw.modelCount" :loading="loading.hardware" />
        </div>
        <div class="charts-row two-col">
          <PieChart
            title="Hardware model distribution"
            :data="hw.modelDistribution"
            :loading="loading.hardware"
            nameKey="hardware_model"
            valueKey="count"
          />
          <PieChart
            title="OS distribution"
            :data="hw.osDistribution"
            :loading="loading.hardware"
            nameKey="os"
            valueKey="count"
          />
        </div>
        <DataTable
          title="Device inventory"
          :data="hw.devices"
          :columns="deviceColumns"
          :loading="loading.hardware"
          :clickable="true"
          @row-click="selectDevice"
        />
      </section>
    </template>

    <!-- Security & Compliance -->
    <template v-if="activeTab === 'security'">
      <section class="section">
        <h2>Security & compliance</h2>
        <div class="metrics-row four-col">
          <MetricCard label="Encrypted" :value="sec.encryptedPct + '%'" :loading="loading.security" />
          <MetricCard label="Firewall on" :value="sec.firewallPct + '%'" :loading="loading.security" />
          <MetricCard label="SIP enabled" :value="sec.sipPct + '%'" :loading="loading.security" />
          <MetricCard label="Gatekeeper on" :value="sec.gatekeeperPct + '%'" :loading="loading.security" />
        </div>
        <div class="charts-row two-col">
          <PieChart
            title="Encryption status"
            :data="sec.encryptionBreakdown"
            :loading="loading.security"
            nameKey="status"
            valueKey="count"
          />
          <PieChart
            title="OS version distribution"
            :data="sec.osVersions"
            :loading="loading.security"
            nameKey="os_version"
            valueKey="count"
          />
        </div>
        <DataTable
          title="Security posture by device"
          :data="sec.devicePosture"
          :columns="securityColumns"
          :loading="loading.security"
          :clickable="true"
          @row-click="selectDevice"
        />
      </section>
    </template>

    <!-- Device Detail Panel -->
    <DeviceDetail
      v-if="selectedDevice && !compareMode"
      :device="selectedDevice"
      :fleetServerUrl="'http://192.168.1.123:8080'"
      @close="selectedDevice = null"
      @compare="enterCompare"
    />

    <!-- Compare Mode Overlay -->
    <div v-if="compareMode" class="compare-overlay" @click.self="compareMode = false">
      <div class="compare-panel">
        <DeviceCompare
          :initialHostId="compareInitialId"
          :devices="allDevices"
          @close="compareMode = false"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { query } from '../services/api'
import { useTimeRange } from '../composables/useTimeRange'
import { useFleetFilter } from '../composables/useFleetFilter'
import TimeRangeFilter from '../components/TimeRangeFilter.vue'
import MetricCard from '../components/MetricCard.vue'
import TimeSeriesChart from '../components/TimeSeriesChart.vue'
import PieChart from '../components/PieChart.vue'
import BarChart from '../components/BarChart.vue'
import DataTable from '../components/DataTable.vue'
import DeviceDetail from '../components/DeviceDetail.vue'
import DeviceCompare from '../components/DeviceCompare.vue'

const { timeRangeHours } = useTimeRange()
const { filterParams } = useFleetFilter()
const error = ref(null)
const activeTab = ref('performance')

const tabs = [
  { key: 'performance', label: 'System performance' },
  { key: 'processes', label: 'Processes' },
  { key: 'hardware', label: 'Hardware' },
  { key: 'security', label: 'Security' }
]

const loading = ref({
  overview: false,
  performance: false,
  processes: false,
  hardware: false,
  security: false
})

// ===================== Column Definitions =====================

const diskColumns = [
  { key: 'hostname', label: 'Host' },
  { key: 'disk_total_gb', label: 'Total GB', type: 'number' },
  { key: 'disk_free_gb', label: 'Free GB', type: 'number' },
  { key: 'disk_percent', label: 'Used %', type: 'number' },
  { key: 'memory_percent', label: 'Memory %', type: 'number' },
  { key: 'last_seen', label: 'Last seen', type: 'datetime' }
]

const processColumns = [
  { key: 'hostname', label: 'Host' },
  { key: 'process_name', label: 'Process' },
  { key: 'memory_mb', label: 'Memory MB', type: 'number' },
  { key: 'memory_percent', label: 'Memory %', type: 'number' },
  { key: 'threads', label: 'Threads', type: 'number' },
  { key: 'state', label: 'State' }
]

const deviceColumns = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'hardware_model', label: 'Model' },
  { key: 'os_name', label: 'OS' },
  { key: 'os_version', label: 'Version' },
  { key: 'serial_number', label: 'Serial' },
  { key: 'cpu_brand', label: 'CPU' },
  { key: 'memory_total_gb', label: 'RAM GB', type: 'number' },
  { key: 'last_seen', label: 'Last seen', type: 'datetime' }
]

const securityColumns = [
  { key: 'hostname', label: 'Host' },
  { key: 'os_version', label: 'OS version' },
  { key: 'encrypted', label: 'Encrypted' },
  { key: 'encryption_type', label: 'Encryption' },
  { key: 'firewall', label: 'Firewall' },
  { key: 'sip', label: 'SIP' },
  { key: 'gatekeeper', label: 'Gatekeeper' },
  { key: 'last_seen', label: 'Last seen', type: 'datetime' }
]

// ===================== Reactive Data =====================

const overview = ref({ deviceCount: 0, healthEvents: 0, p95Memory: 0, p95Disk: 0 })
const perf = ref({ memoryOverTime: [], diskOverTime: [], memoryByDevice: [], uptimeDistribution: [], diskByDevice: [] })
const proc = ref({ uniqueCount: 0, avgThreads: 0, heaviest: '-', p95Memory: 0, topByMemory: [], topByPeak: [], trend: [], stateDistribution: [], latestSnapshot: [] })
const hw = ref({ deviceCount: 0, avgRam: 0, avgDiskTotal: 0, modelCount: 0, modelDistribution: [], osDistribution: [], devices: [] })
const sec = ref({ encryptedPct: 0, firewallPct: 0, sipPct: 0, gatekeeperPct: 0, encryptionBreakdown: [], osVersions: [], devicePosture: [] })

// ===================== Device Detail =====================

const selectedDevice = ref(null)

function selectDevice(row) {
  selectedDevice.value = row
}

// Compare mode
const compareMode = ref(false)
const compareInitialId = ref('')
const allDevices = ref([])

function enterCompare(hostId) {
  compareInitialId.value = hostId
  selectedDevice.value = null
  compareMode.value = true
  // Ensure we have a device list for the comparison dropdowns
  if (!allDevices.value.length) {
    query('devices.inventory', {
        timeRange: timeRangeHours.value,
        ...filterParams.value
      })
      .then(rows => { allDevices.value = rows })
      .catch(() => {})
  }
}

// ===================== Fetch Functions =====================

async function fetchOverview() {
  loading.value.overview = true
  try {
    const rows = await query('health.summary', {
      timeRange: timeRangeHours.value,
      ...filterParams.value
    })
    const r = rows[0] || {}
    overview.value = {
      deviceCount: r.device_count || 0,
      healthEvents: r.health_events || 0,
      p95Memory: r.p95_memory || 0,
      p95Disk: r.p95_disk || 0
    }
  } catch (e) {
    error.value = `Overview: ${e.message}`
  } finally {
    loading.value.overview = false
  }
}

async function fetchPerformance() {
  loading.value.performance = true
  try {
    const queryParams = {
      timeRange: timeRangeHours.value,
      ...filterParams.value
    }
    const [memTime, diskTime, memDevice, uptime, diskDevice] = await Promise.all([
      query('health.timeseries', queryParams),
      query('health.timeseries', queryParams),
      query('health.latest_per_device', { ...queryParams, limit: 15 }),
      query('devices.uptime_distribution', queryParams),
      query('health.latest_per_device', { ...queryParams, limit: 200 })
    ])

    perf.value = {
      memoryOverTime: memTime,
      diskOverTime: diskTime,
      memoryByDevice: memDevice,
      uptimeDistribution: uptime,
      diskByDevice: diskDevice
    }
  } catch (e) {
    error.value = `Performance: ${e.message}`
  } finally {
    loading.value.performance = false
  }
}

async function fetchProcesses() {
  loading.value.processes = true
  try {
    const queryParams = {
      timeRange: timeRangeHours.value,
      ...filterParams.value
    }
    const [metrics, topMem, topPeak, trend, states, snapshot] = await Promise.all([
      query('processes.metrics', queryParams),
      query('processes.top', { ...queryParams, limit: 10 }),
      query('processes.top_peak', { ...queryParams, limit: 10 }),
      query('processes.trend', queryParams),
      query('processes.states', queryParams),
      query('processes.snapshot', { ...queryParams, limit: 100 })
    ])

    const m = metrics[0] || {}
    proc.value = {
      uniqueCount: m.unique_count || 0,
      avgThreads: m.avg_threads || 0,
      heaviest: m.heaviest || '-',
      p95Memory: m.p95_memory || 0,
      topByMemory: topMem,
      topByPeak: topPeak,
      trend,
      stateDistribution: states,
      latestSnapshot: snapshot
    }
  } catch (e) {
    error.value = `Processes: ${e.message}`
  } finally {
    loading.value.processes = false
  }
}

async function fetchHardware() {
  loading.value.hardware = true
  try {
    const queryParams = {
      timeRange: timeRangeHours.value,
      ...filterParams.value
    }
    const [metrics, models, osDist, devices] = await Promise.all([
      query('health.summary', queryParams),
      query('devices.model_distribution', { ...filterParams.value }),
      query('devices.os_distribution', { ...filterParams.value }),
      query('devices.inventory', queryParams)
    ])

    const m = metrics[0] || {}
    hw.value = {
      deviceCount: m.device_count || 0,
      avgRam: m.avg_ram || 0,
      avgDiskTotal: m.avg_disk_total || 0,
      modelCount: m.model_count || 0,
      modelDistribution: models,
      osDistribution: osDist,
      devices
    }
  } catch (e) {
    error.value = `Hardware: ${e.message}`
  } finally {
    loading.value.hardware = false
  }
}

async function fetchSecurity() {
  loading.value.security = true
  try {
    const queryParams = {
      timeRange: timeRangeHours.value,
      ...filterParams.value
    }
    const [posture, encBreakdown, osVersions, devicePosture] = await Promise.all([
      query('security.summary', queryParams),
      query('security.encryption_breakdown', queryParams),
      query('security.os_versions', queryParams),
      query('security.posture', queryParams)
    ])

    const p = posture[0] || {}
    sec.value = {
      encryptedPct: p.encrypted_pct || 0,
      firewallPct: p.firewall_pct || 0,
      sipPct: p.sip_pct || 0,
      gatekeeperPct: p.gatekeeper_pct || 0,
      encryptionBreakdown: encBreakdown,
      osVersions: osVersions,
      devicePosture
    }
  } catch (e) {
    error.value = `Security: ${e.message}`
  } finally {
    loading.value.security = false
  }
}

// ===================== Tab Loading =====================

const tabFetchers = {
  performance: fetchPerformance,
  processes: fetchProcesses,
  hardware: fetchHardware,
  security: fetchSecurity
}

const fetchedTabs = ref(new Set())

async function fetchTabData(tab) {
  if (tabFetchers[tab] && !fetchedTabs.value.has(tab)) {
    fetchedTabs.value.add(tab)
    await tabFetchers[tab]()
  }
}

watch(activeTab, (tab) => {
  fetchTabData(tab)
})

watch(timeRangeHours, () => {
  fetchedTabs.value = new Set()
  error.value = null
  fetchOverview()
  fetchTabData(activeTab.value)
})

// Fleet filter changes → invalidate tab cache and re-fetch
watch(filterParams, () => {
  fetchedTabs.value = new Set()
  error.value = null
  fetchOverview()
  fetchTabData(activeTab.value)
}, { deep: true })

onMounted(() => {
  fetchOverview()
  fetchTabData(activeTab.value)
})
</script>

<style scoped>
.dashboard {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--pad-xlarge);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

h1 {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--fleet-black);
  font-family: var(--font-mono);
}

h2 {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--fleet-black);
  font-family: var(--font-mono);
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--fleet-black-10);
}

.error-banner {
  background: var(--fleet-white);
  color: var(--fleet-error);
  padding: 12px 16px;
  border-radius: var(--radius);
  border: 1px solid var(--fleet-black-10);
  border-left: 3px solid var(--fleet-error);
  margin-bottom: 24px;
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 24px;
  padding: 4px;
  background: var(--fleet-black-5);
  border-radius: var(--radius-large);
  overflow-x: auto;
}

.tab {
  padding: 10px 20px;
  border: none;
  background: transparent;
  border-radius: var(--radius-medium);
  font-size: 14px;
  font-weight: 500;
  color: var(--fleet-black-50);
  cursor: pointer;
  white-space: nowrap;
  transition: all 150ms;
}

.tab:hover {
  color: var(--fleet-black-75);
  background: rgba(255, 255, 255, 0.5);
}

.tab.active {
  color: var(--fleet-black);
  background: var(--fleet-white);
  box-shadow: var(--box-shadow);
  font-weight: 600;
}

.section {
  margin-bottom: 32px;
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-bottom: 24px;
}

.metrics-row.four-col {
  grid-template-columns: repeat(4, 1fr);
}

.charts-row {
  margin-bottom: 24px;
}

.charts-row.two-col {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

@media (max-width: 1024px) {
  .metrics-row.four-col {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .metrics-row {
    grid-template-columns: 1fr;
  }

  .metrics-row.four-col {
    grid-template-columns: 1fr;
  }

  .charts-row.two-col {
    grid-template-columns: 1fr;
  }

  .dashboard-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .tabs {
    flex-wrap: wrap;
  }
}

.compare-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(25, 33, 71, 0.4);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 40px 24px;
  z-index: 1000;
  overflow-y: auto;
}

.compare-panel {
  width: 100%;
  max-width: 960px;
  background: var(--fleet-off-white);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
  box-shadow: 0 8px 32px rgba(25, 33, 71, 0.2);
}
</style>
