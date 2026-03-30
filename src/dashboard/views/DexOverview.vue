<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>DEX overview</h1>
      <TimeRangeFilter />
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Fleet Summary -->
    <section class="section">
      <h2>Fleet summary</h2>
      <div class="metrics-row five-col">
        <MetricCard label="Devices" :value="summary.devices" :loading="loading.summary" />
        <MetricCard label="Avg memory %" :value="summary.avgMemory" :loading="loading.summary" />
        <MetricCard label="Avg disk %" :value="summary.avgDisk" :loading="loading.summary" />
        <MetricCard label="Security score" :value="summary.securityScore + '%'" subtitle="Encryption + Firewall + SIP + GK" :loading="loading.summary" />
        <MetricCard label="Avg uptime" :value="summary.avgUptime + 'd'" :loading="loading.summary" />
      </div>
    </section>

    <!-- Device Health Cards -->
    <section class="section">
      <h2>Device health</h2>
      <div v-if="loading.devices" class="loading-row">Loading devices...</div>
      <div v-else class="device-grid">
        <div v-for="device in devices" :key="device.host_identifier" class="device-card" @click="openDevice(device)">
          <div class="device-header">
            <span class="device-name">{{ device.hostname || device.computer_name || 'Unknown' }}</span>
            <span class="device-badge" :class="healthClass(device)">{{ healthLabel(device) }}</span>
          </div>
          <div class="device-model">{{ device.hardware_model }} &middot; {{ device.os_name }} {{ device.os_version }}</div>
          <div class="device-stats">
            <div class="stat">
              <div class="stat-bar">
                <div class="stat-fill memory" :style="{ width: clamp(device.memory_percent) + '%' }"></div>
              </div>
              <span class="stat-label">Mem {{ device.memory_percent }}%</span>
            </div>
            <div class="stat">
              <div class="stat-bar">
                <div class="stat-fill disk" :style="{ width: clamp(device.disk_percent) + '%' }"></div>
              </div>
              <span class="stat-label">Disk {{ device.disk_percent }}%</span>
            </div>
            <div class="stat-row-bottom">
              <span>{{ device.os_name }} {{ device.os_version }}</span>
              <span>Uptime: {{ device.uptime_days }}d</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Security Posture + Network Quality side by side -->
    <div class="split-row">
      <!-- Security Posture -->
      <section class="section split-half">
        <h2>Security posture</h2>
        <div v-if="loading.security" class="loading-row">Loading...</div>
        <div v-else class="posture-grid">
          <div v-for="item in securityItems" :key="item.label" class="posture-item">
            <div class="posture-ring" :class="item.ok ? 'good' : 'bad'">
              <span class="posture-pct">{{ item.pct }}%</span>
            </div>
            <span class="posture-label">{{ item.label }}</span>
          </div>
        </div>
      </section>

      <!-- Network Quality -->
      <section class="section split-half">
        <h2>Network quality</h2>
        <div v-if="loading.network" class="loading-row">Loading...</div>
        <div v-else-if="networkDevices.length === 0" class="empty-state">No WiFi data yet</div>
        <div v-else class="network-list">
          <div v-for="n in networkDevices" :key="n.host_identifier" class="network-row">
            <span class="network-host">{{ n.hostname }}</span>
            <span class="network-ssid">{{ n.ssid }}</span>
            <span class="signal-badge" :class="n.quality">{{ n.rssi }} dBm</span>
            <span class="quality-label">{{ n.quality }}</span>
          </div>
        </div>
      </section>
    </div>

    <!-- Memory Usage Heatmap -->
    <section class="section">
      <h2>Memory usage heatmap</h2>
      <HeatmapChart
        :data="memHeatmapData"
        :xLabels="memHeatmapHours"
        :yLabels="memHeatmapHosts"
        :loading="loading.heatmap"
        :colorRange="['#e2e4ea','#c5ddf8','#7bb8f0','#3e8ed8','#1a5fb4']"
        :minValue="0"
        :maxValue="100"
        tooltipLabel="Memory %"
      />
    </section>

    <!-- Software Usage Grid -->
    <section class="section">
      <ContributionGrid
        title="Software usage"
        :data="softwareGridData"
        :loading="loading.software"
        :colorScale="['#f0f1f4', '#c5ddf8', '#7bb8f0', '#3e8ed8', '#1a5fb4']"
        valueLabel="apps seen"
        :valueFormatter="d => `${d.value} apps active (${d.hosts} hosts)`"
        legendLow="Low"
        legendHigh="High"
      >
        <template #controls>
          <div class="select-wrapper">
            <select v-model="softwareFilter" class="filter-select">
              <option value="">All apps</option>
              <option v-for="app in topApps" :key="app" :value="app">{{ app }}</option>
            </select>
            <svg class="select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1l4 4 4-4" stroke="#515774" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </template>
      </ContributionGrid>
    </section>

    <!-- Top Resource Consumers -->
    <section class="section">
      <h2>Top resource consumers</h2>
      <div class="charts-row two-col">
        <BarChart
          title="Heaviest processes (avg memory MB)"
          :data="topProcesses"
          :loading="loading.processes"
          nameKey="process_name"
          valueKey="avg_mb"
        />
        <BarChart
          title="Memory usage by device"
          :data="memoryByDevice"
          :loading="loading.processes"
          nameKey="hostname"
          valueKey="memory_pct"
        />
      </div>
    </section>

    <!-- Device Detail Panel -->
    <DeviceDetail
      v-if="selectedDevice && !compareMode"
      :device="selectedDevice"
      :fleetServerUrl="'http://192.168.1.123:8080'"
      @close="closeDevice"
      @compare="enterCompare"
    />

    <!-- Compare Mode Overlay -->
    <div v-if="compareMode" class="compare-overlay" @click.self="compareMode = false">
      <div class="compare-panel">
        <DeviceCompare
          :initialHostId="compareInitialId"
          :devices="devices"
          @close="compareMode = false"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { query } from '../services/api'
import { useTimeRange } from '../composables/useTimeRange'
import { useFleetFilter } from '../composables/useFleetFilter'
import TimeRangeFilter from '../components/TimeRangeFilter.vue'
import MetricCard from '../components/MetricCard.vue'
import BarChart from '../components/BarChart.vue'
import HeatmapChart from '../components/HeatmapChart.vue'
import ContributionGrid from '../components/ContributionGrid.vue'
import DeviceDetail from '../components/DeviceDetail.vue'
import DeviceCompare from '../components/DeviceCompare.vue'

const { timeRangeHours } = useTimeRange()
const { filterParams } = useFleetFilter()
const error = ref(null)

const loading = ref({ summary: false, devices: false, security: false, network: false, processes: false, heatmap: false, software: false })

const summary = ref({ devices: 0, avgMemory: 0, avgDisk: 0, securityScore: 0, avgUptime: 0 })
const devices = ref([])
const security = ref({ encrypted: 0, firewall: 0, sip: 0, gatekeeper: 0 })
const networkDevices = ref([])
const topProcesses = ref([])
const memoryByDevice = ref([])

// Memory heatmap (device rows x hour columns)
const memHeatmapData = ref([])
const memHeatmapHours = ref([])
const memHeatmapHosts = ref([])

// Software usage grid
const softwareGridData = ref([])
const softwareFilter = ref('')
const topApps = ref([])

// Device detail panel
const selectedDevice = ref(null)

function openDevice(device) {
  selectedDevice.value = device
}

function closeDevice() {
  selectedDevice.value = null
}

// Compare mode
const compareMode = ref(false)
const compareInitialId = ref('')

function enterCompare(hostId) {
  compareInitialId.value = hostId
  selectedDevice.value = null  // close the detail panel
  compareMode.value = true
}

const securityItems = computed(() => [
  { label: 'Encrypted', pct: security.value.encrypted, ok: security.value.encrypted >= 80 },
  { label: 'Firewall', pct: security.value.firewall, ok: security.value.firewall >= 80 },
  { label: 'SIP', pct: security.value.sip, ok: security.value.sip >= 80 },
  { label: 'Gatekeeper', pct: security.value.gatekeeper, ok: security.value.gatekeeper >= 80 }
])

function clamp(v) { return Math.min(Math.max(parseFloat(v) || 0, 0), 100) }

function healthClass(d) {
  const mem = parseFloat(d.memory_percent) || 0
  const disk = parseFloat(d.disk_percent) || 0
  if (mem > 90 || disk > 95) return 'critical'
  if (mem > 75 || disk > 85) return 'warning'
  return 'healthy'
}

function healthLabel(d) {
  const cls = healthClass(d)
  return cls === 'critical' ? 'Critical' : cls === 'warning' ? 'Warning' : 'Healthy'
}

async function fetchAll() {
  error.value = null
  const timeRange = timeRangeHours.value
  const fp = filterParams.value

  // Summary
  loading.value.summary = true
  try {
    const [health, sec] = await Promise.all([
      query('health.summary', { timeRange, ...fp }),
      query('security.summary', { timeRange, ...fp })
    ])
    const h = health[0] || {}
    const s = sec[0] || {}
    const secScore = Math.round(((parseFloat(s.enc)||0) + (parseFloat(s.fw)||0) + (parseFloat(s.sip)||0) + (parseFloat(s.gk)||0)) / 4)
    summary.value = {
      devices: h.devices || 0,
      avgMemory: h.avg_mem || 0,
      avgDisk: h.avg_disk || 0,
      securityScore: secScore,
      avgUptime: h.avg_uptime || 0
    }
    security.value = {
      encrypted: parseFloat(s.enc) || 0,
      firewall: parseFloat(s.fw) || 0,
      sip: parseFloat(s.sip) || 0,
      gatekeeper: parseFloat(s.gk) || 0
    }
  } catch (e) {
    error.value = `Summary: ${e.message}`
  } finally {
    loading.value.summary = false
    loading.value.security = false
  }

  // Device health cards
  loading.value.devices = true
  try {
    devices.value = await query('devices.health_cards', { timeRange, ...fp })
  } catch (e) {
    error.value = `Devices: ${e.message}`
  } finally {
    loading.value.devices = false
  }

  // Network quality
  loading.value.network = true
  try {
    const rows = await query('network.quality', { timeRange, ...fp })
    networkDevices.value = rows.map(r => ({ ...r, hostname: r.hostname || r.host_identifier }))
  } catch (e) {
    // Network data may not exist yet
    networkDevices.value = []
  } finally {
    loading.value.network = false
  }

  // Top processes + memory by device
  loading.value.processes = true
  try {
    const [procs, memDev] = await Promise.all([
      query('processes.top', { timeRange, ...fp }),
      query('health.latest_per_device', { timeRange, ...fp, limit: 10 })
    ])
    topProcesses.value = procs
    memoryByDevice.value = memDev
  } catch (e) {
    error.value = `Processes: ${e.message}`
  } finally {
    loading.value.processes = false
  }

  // Memory heatmap (device x hour)
  loading.value.heatmap = true
  try {
    const rows = await query('health.heatmap_unhealthiest', { timeRange, ...fp })

    // Build echarts heatmap format: [xIndex, yIndex, value]
    const hosts = [...new Set(rows.map(r => r.host || r.hostname))]
    const hours = [...new Set(rows.map(r => r.hour || r.hour_label))].sort()
    const hostIdx = Object.fromEntries(hosts.map((h, i) => [h, i]))
    const hourIdx = Object.fromEntries(hours.map((h, i) => [h, i]))

    memHeatmapHosts.value = hosts
    memHeatmapHours.value = hours
    memHeatmapData.value = rows.map(r => [hourIdx[r.hour || r.hour_label], hostIdx[r.host || r.hostname], parseFloat(r.avg_mem || r.health_score)])
  } catch (e) {
    // Heatmap is optional, don't block other sections
    console.error('Heatmap:', e)
  } finally {
    loading.value.heatmap = false
  }

  // Software usage grid
  loading.value.software = true
  try {
    // Load top apps for filter dropdown
    const apps = await query('software.top_apps', { timeRange }).catch(() => [])
    topApps.value = apps.map(a => a.app_name)

    // Build daily grid data
    const gridParams = { timeRange }
    if (softwareFilter.value) gridParams.appName = softwareFilter.value
    const daily = await query('software.daily_grid', gridParams).catch(() => [])

    softwareGridData.value = daily.map(r => ({
      date: r.date,
      value: parseInt(r.app_count) || 0,
      hosts: parseInt(r.host_count) || 0
    }))
  } catch (e) {
    console.error('Software usage:', e)
  } finally {
    loading.value.software = false
  }
}

watch(timeRangeHours, fetchAll)
watch(filterParams, fetchAll, { deep: true })
watch(softwareFilter, fetchAll)
onMounted(fetchAll)
</script>

<style scoped>
.dashboard {
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

h1 { font-size: var(--font-size-lg); font-weight: 600; color: var(--fleet-black); font-family: var(--font-mono); }
h2 { font-size: var(--font-size-md); font-weight: 600; color: var(--fleet-black); font-family: var(--font-mono); margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--fleet-black-10); }

.error-banner { background: var(--fleet-white); color: var(--fleet-error); padding: 12px 16px; border-radius: var(--radius); border: 1px solid var(--fleet-black-10); border-left: 3px solid var(--fleet-error); margin-bottom: 24px; font-size: 14px; }
.loading-row { color: var(--fleet-black-50); padding: 24px; text-align: center; font-size: 14px; }
.empty-state { color: var(--fleet-black-50); padding: 32px; text-align: center; }

.section { margin-bottom: 24px; }

.metrics-row { display: grid; gap: 16px; margin-bottom: 24px; }
.metrics-row.five-col { grid-template-columns: repeat(5, 1fr); }

/* Device Health Cards */
.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.device-card {
  background: #fff;
  border-radius: var(--radius);
  border: 1px solid #e2e4ea;
  padding: 16px;
  box-shadow: 0px 3px 0px rgba(226, 228, 234, 0.4);
  transition: box-shadow 150ms ease-in-out;
}

.device-card { cursor: pointer; }
.device-card:hover { box-shadow: 0 4px 10px rgba(52, 59, 96, 0.15); }

.device-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.device-name { font-weight: 600; font-size: 14px; color: #192147; }
.device-model { font-size: 12px; color: #8b8fa2; margin-bottom: 12px; }

.device-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.device-badge.healthy { background: rgba(61, 182, 123, 0.15); color: #2b7f56; }
.device-badge.warning { background: rgba(235, 188, 67, 0.2); color: #92400e; }
.device-badge.critical { background: rgba(214, 108, 123, 0.15); color: #991b1b; }

.stat { margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.stat-bar { flex: 1; height: 6px; background: #f4f4f6; border-radius: 3px; overflow: hidden; }
.stat-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
.stat-fill.memory { background: #6a67fe; }
.stat-fill.disk { background: #ebbc43; }
.stat-label { font-size: 12px; color: #515774; min-width: 70px; text-align: right; }

.stat-row-bottom {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #8b8fa2;
  margin-top: 4px;
}

/* Split layout */
.split-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.split-half {
  min-width: 0;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e2e4ea;
  padding: 24px;
  box-shadow: 0px 3px 0px rgba(226, 228, 234, 0.4);
}
.split-half h2 { border-bottom: none; margin-bottom: 12px; padding-bottom: 0; }

/* Security Posture Rings */
.posture-grid {
  display: flex;
  justify-content: space-around;
  padding: 16px 0;
}

.posture-item { display: flex; flex-direction: column; align-items: center; gap: 8px; }

.posture-ring {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid;
}

.posture-ring.good { border-color: #3db67b; background: rgba(61, 182, 123, 0.08); }
.posture-ring.bad { border-color: #d66c7b; background: rgba(214, 108, 123, 0.08); }
.posture-pct { font-size: 18px; font-weight: 600; color: #192147; }
.posture-label { font-size: 12px; font-weight: 500; color: #515774; }

/* Network Quality */
.network-list { display: flex; flex-direction: column; gap: 6px; }

.network-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  background: #f9fafc;
  border-radius: 4px;
  border: 1px solid #f0f1f4;
  font-size: 13px;
}

.network-host { font-weight: 500; color: #192147; }
.network-ssid { color: #515774; }

.signal-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.signal-badge.excellent { background: rgba(61, 182, 123, 0.15); color: #2b7f56; }
.signal-badge.good { background: rgba(106, 103, 254, 0.12); color: #4b4ab4; }
.signal-badge.fair { background: rgba(235, 188, 67, 0.2); color: #92400e; }
.signal-badge.poor { background: rgba(214, 108, 123, 0.15); color: #991b1b; }

.quality-label { font-size: 12px; color: #8b8fa2; text-transform: capitalize; min-width: 60px; }

/* Software grid filter */
.select-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.filter-select {
  border: 1px solid #e2e4ea;
  border-radius: 4px;
  padding: 5px 28px 5px 10px;
  font-family: "Inter", sans-serif;
  font-size: 13px;
  color: #515774;
  background: #fff;
  cursor: pointer;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  transition: border-color 150ms;
}

.filter-select:hover { border-color: #c5c7d1; }
.filter-select:focus { border-color: #192147; }

.select-arrow {
  position: absolute;
  right: 10px;
  pointer-events: none;
}

/* Charts */
.charts-row.two-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }

@media (max-width: 1024px) {
  .metrics-row.five-col { grid-template-columns: repeat(3, 1fr); }
  .split-row { grid-template-columns: 1fr; }
}

@media (max-width: 768px) {
  .metrics-row.five-col { grid-template-columns: repeat(2, 1fr); }
  .charts-row.two-col { grid-template-columns: 1fr; }
  .device-grid { grid-template-columns: 1fr; }
  .dashboard-header { flex-direction: column; align-items: flex-start; gap: 16px; }
}

/* ─── Compare overlay ─────────────────────────── */
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
