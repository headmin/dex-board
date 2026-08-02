<template>
  <div class="dashboard page-stack">
    <PageHeader title="DEX overview">
      <template #actions>
        <TimeRangeFilter />
      </template>
    </PageHeader>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Fleet Summary -->
    <section class="section">
      <SectionHeader title="Fleet summary" />
      <div class="metrics-row five-col">
        <MetricCard label="Hosts" :value="summary.devices" :loading="loading.summary" />
        <MetricCard label="Avg memory %" :value="summary.avgMemory" :loading="loading.summary" />
        <MetricCard label="Avg disk %" :value="summary.avgDisk" :loading="loading.summary" />
        <MetricCard label="Security score" :value="summary.securityScore + '%'" subtitle="Encryption + Firewall + SIP + GK" :loading="loading.summary" />
        <MetricCard label="Avg uptime" :value="summary.avgUptime + 'd'" :loading="loading.summary" />
      </div>
    </section>

    <!-- Device Health Cards -->
    <section class="section">
      <SectionHeader title="Host health" />
      <div v-if="loading.devices" class="loading-row">Loading devices...</div>
      <div v-else class="device-grid">
        <div v-for="device in devices" :key="device.host_identifier" class="device-card" @click="openDevice(device)">
          <div class="device-header">
            <span class="device-name">{{ displayHost(device) }}</span>
            <Badge :tone="healthTone(device)" :label="healthLabel(device)" />
          </div>
          <div class="device-model">{{ device.hardware_model }} &middot; {{ device.os_name }} {{ device.os_version }}</div>
          <div class="device-stats">
            <div class="stat">
              <GaugeBar :value="clamp(device.memory_percent)" />
              <span class="stat-label">Mem {{ device.memory_percent }}%</span>
            </div>
            <div class="stat">
              <GaugeBar :value="clamp(device.disk_percent)" />
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
        <SectionHeader title="Security posture" />
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
        <SectionHeader title="Network quality" />
        <div v-if="loading.network" class="loading-row">Loading...</div>
        <EmptyState v-else-if="networkDevices.length === 0" small title="No WiFi data yet" />
        <div v-else class="network-list">
          <div v-for="n in networkDevices" :key="n.host_identifier" class="network-row">
            <span class="network-host">{{ displayHost(n) }}</span>
            <span class="network-ssid">{{ n.ssid }}</span>
            <Badge :tone="signalTone(n.quality)"><span class="signal-value">{{ n.rssi }} dBm</span></Badge>
            <span class="quality-label">{{ n.quality }}</span>
          </div>
        </div>
      </section>
    </div>

    <!-- Memory Usage Heatmap -->
    <section class="section">
      <SectionHeader title="Memory usage heatmap" />
      <HeatmapChart
        :data="memHeatmapData"
        :xLabels="memHeatmapHours"
        :yLabels="memHeatmapHosts"
        :loading="loading.heatmap"
        :colorRange="statusRamp"
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
        :colorScale="[palette.ink5, palette.goodBg, palette.greenSoft, palette.good, palette.greenOver]"
        valueLabel="apps seen"
        :valueFormatter="d => `${d.value} apps active (${d.hosts} hosts)`"
        legendLow="Low"
        legendHigh="High"
      >
        <template #controls>
          <div class="software-filter">
            <BaseSelect v-model="softwareFilter" :options="softwareFilterOptions" />
          </div>
        </template>
      </ContributionGrid>
    </section>

    <!-- Top Resource Consumers -->
    <section class="section">
      <SectionHeader title="Top resource consumers" />
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
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import Badge from '../components/base/Badge.vue'
import GaugeBar from '../components/base/GaugeBar.vue'
import BaseSelect from '../components/base/BaseSelect.vue'
import EmptyState from '../components/base/EmptyState.vue'
import { palette, statusRamp } from '../composables/uiPalette'
import { displayHost } from '../composables/displayName'
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

// Map the health/quality classes onto Badge tones.
const HEALTH_TONES = { healthy: 'good', warning: 'fair', critical: 'critical' }
function healthTone(d) {
  return HEALTH_TONES[healthClass(d)] || 'neutral'
}

const SIGNAL_TONES = { excellent: 'good', good: 'good', fair: 'fair', poor: 'critical' }
function signalTone(quality) {
  return SIGNAL_TONES[quality] || 'neutral'
}

// "All apps" sentinel ('') plus the top apps for the software-usage filter.
const softwareFilterOptions = computed(() => [
  { value: '', label: 'All apps' },
  ...topApps.value.map(a => ({ value: a, label: a })),
])

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
  padding: var(--pad-xlarge);
}

.loading-row { color: var(--fleet-black-50); padding: 24px; text-align: center; font-size: 14px; }

/* Sections stack their own blocks; the page-stack global handles inter-section gaps */
.section {
  display: flex;
  flex-direction: column;
  gap: var(--pad-medium);
}

/* Device Health Cards */
.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.device-card {
  background: var(--fleet-white);
  border-radius: var(--radius-large);
  border: 1px solid var(--fleet-black-10);
  padding: 14px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-base);
  cursor: pointer;
}

.device-card:hover { box-shadow: var(--shadow-md); }

.device-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.device-name { font-weight: 600; font-size: 14px; color: var(--fleet-black); }
.device-model { font-size: 12px; color: var(--fleet-black-50); margin-bottom: 12px; }

.stat { margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.stat > :first-child { flex: 1; min-width: 0; }
.stat-label { font-size: 13px; font-weight: 500; color: var(--fleet-black-75); min-width: 70px; text-align: right; }

.stat-row-bottom {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--fleet-black-50);
  margin-top: 4px;
}

/* Split layout */
.split-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.split-half {
  min-width: 0;
  background: var(--fleet-white);
  border-radius: var(--radius-large);
  border: 1px solid var(--fleet-black-10);
  padding: 22px;
  box-shadow: var(--shadow-sm);
}

/* Security Posture Rings */
.posture-grid {
  display: flex;
  justify-content: space-around;
  padding: 14px 0;
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

.posture-ring.good { border-color: var(--fleet-success); background: var(--status-good-bg); }
.posture-ring.bad { border-color: var(--fleet-error); background: var(--status-critical-bg); }
.posture-pct { font-size: 18px; font-weight: 600; color: var(--fleet-black); }
.posture-label { font-size: 13px; font-weight: 500; color: var(--fleet-black-75); }

/* Network Quality */
.network-list { display: flex; flex-direction: column; gap: 6px; }

.network-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto auto;
  gap: 11px;
  align-items: center;
  padding: 7px 11px;
  background: var(--fleet-off-white);
  border-radius: var(--radius);
  border: 1px solid var(--fleet-black-5-down);
  font-size: 12px;
}

.network-host { font-weight: 500; color: var(--fleet-black); }
.network-ssid { color: var(--fleet-black-75); }
.signal-value { font-variant-numeric: tabular-nums; }

.quality-label { font-size: 12px; color: var(--fleet-black-50); text-transform: capitalize; min-width: 60px; }

/* Software grid filter */
.software-filter { width: 160px; }

@media (max-width: 1024px) {
  .split-row { grid-template-columns: 1fr; }
}

/* ─── Compare overlay ─────────────────────────── */
.compare-overlay {
  position: fixed;
  inset: 0;
  background: rgba(25, 33, 71, 0.4);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 36px 22px;
  z-index: 1000;
  overflow-y: auto;
}

.compare-panel {
  width: 100%;
  max-width: 960px;
  background: var(--fleet-off-white);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
  box-shadow: var(--shadow-lg);
}
</style>
