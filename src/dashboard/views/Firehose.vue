<template>
  <div class="dashboard page-stack">
    <PageHeader title="Firehose" subtitle="osquery result logs — direct from S3 ClickPipe" />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ── Device Detail Drawer ──────────────────── -->
    <Drawer v-if="selectedDevice" :title="displayHost(selectedDevice)" @close="closeDevice">
      <div class="drawer-body">
        <div class="metrics-row four-col">
          <MetricCard label="RSSI" :value="selectedDevice.rssi" unit="dBm" />
          <MetricCard label="SNR" :value="selectedDevice.snr" unit="dB" />
          <MetricCard label="Quality" :value="selectedDevice.signal_quality" />
          <MetricCard label="Tx Rate" :value="selectedDevice.transmit_rate" unit="Mbps" />
        </div>

        <!-- Device Wi-Fi timeseries -->
        <TimeSeriesChart
          v-if="deviceWifiTs.length"
          :title="`RSSI over time — ${displayHost(selectedDevice)}`"
          :data="deviceWifiTs"
          :loading="loading.deviceWifi"
          xKey="hour"
          yKey="avg_rssi"
          :color="palette.info"
        />

        <!-- Device running apps -->
        <div v-if="deviceApps.length">
          <h3>Running apps (latest snapshot)</h3>
          <DataTable
            :data="deviceApps"
            :columns="deviceAppColumns"
            :loading="loading.deviceApps"
          />
        </div>
      </div>
    </Drawer>

    <!-- ── Wi-Fi Signal Summary ──────────────────── -->
    <section class="section">
      <SectionHeader title="Wi-Fi signal quality" />
      <div class="metrics-row four-col">
        <MetricCard label="Unique hosts" :value="wifi.uniqueHosts" :loading="loading.wifi" />
        <MetricCard label="Avg RSSI" :value="wifi.avgRssi" unit="dBm" :loading="loading.wifi" />
        <MetricCard label="Avg SNR" :value="wifi.avgSnr" unit="dB" :loading="loading.wifi" />
        <MetricCard label="Avg Tx Rate" :value="wifi.avgTxRate" unit="Mbps" :loading="loading.wifi" />
      </div>
    </section>

    <!-- Signal Quality Distribution + Wi-Fi Per Device -->
    <div class="charts-row two-col">
      <section class="section">
        <PieChart
          title="Signal quality distribution"
          :data="wifiDistribution"
          :loading="loading.wifiDistribution"
          nameKey="signal_quality"
          valueKey="cnt"
        />
      </section>
      <section class="section">
        <BarChart
          title="Weakest signal devices (by RSSI)"
          :data="wifiWorstBar"
          :loading="loading.wifiDevices"
          nameKey="hostname"
          valueKey="abs_rssi"
        />
      </section>
    </div>

    <!-- Wi-Fi Timeseries -->
    <section class="section">
      <TimeSeriesChart
        title="Fleet avg RSSI over time"
        :data="wifiTimeseries"
        :loading="loading.wifiTimeseries"
        xKey="hour"
        yKey="avg_rssi"
        :color="palette.info"
      />
    </section>

    <!-- Wi-Fi Devices Table (clickable; kept hand-rolled for the
         selected-row highlight + composite unit cells) -->
    <section class="section">
      <SectionHeader title="All hosts — Wi-Fi" />
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Hostname</th>
              <th>RSSI</th>
              <th>SNR</th>
              <th>Quality</th>
              <th>Tx Rate</th>
              <th>Channel</th>
              <th>Security</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in wifiDevices"
              :key="d.host_id"
              class="clickable-row"
              :class="{ selected: selectedDevice?.host_id === d.host_id }"
              @click="selectDevice(d)"
            >
              <td class="hostname">{{ displayHost(d) }}</td>
              <td :class="rssiClass(d.rssi)">{{ d.rssi }} dBm</td>
              <td>{{ d.snr }} dB</td>
              <td><Badge :tone="qualityTone(d.signal_quality)" :label="qualityLabel(d.signal_quality)" /></td>
              <td>{{ d.transmit_rate }} Mbps</td>
              <td>{{ d.channel }} ({{ d.channel_width }}MHz)</td>
              <td>{{ d.security_type }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Running Apps ──────────────────────────── -->
    <section class="section">
      <SectionHeader title="Running apps" />
      <div class="metrics-row four-col">
        <MetricCard label="Unique apps" :value="apps.uniqueApps" :loading="loading.apps" />
        <MetricCard label="Unique hosts" :value="apps.uniqueHosts" :loading="loading.apps" />
        <MetricCard label="Avg memory" :value="apps.avgMemory" unit="MB" :loading="loading.apps" />
        <MetricCard label="P95 memory" :value="apps.p95Memory" unit="MB" :loading="loading.apps" />
      </div>
    </section>

    <section class="section">
      <DataTable
        title="Top apps by avg memory"
        :data="topApps"
        :columns="appColumns"
        :loading="loading.topApps"
      />
    </section>

    <!-- ── Hardware Inventory ────────────────────── -->
    <section class="section">
      <SectionHeader title="Hardware inventory" />
      <div class="charts-row two-col">
        <PieChart
          title="RAM tiers"
          :data="ramTiers"
          :loading="loading.hardware"
          nameKey="ram_tier"
          valueKey="device_count"
        />
        <DataTable
          :data="hardwareRows"
          :columns="hardwareColumns"
          :loading="loading.hardware"
          clickable
          @row-click="row => selectDeviceById(row.host_id, row.hostname)"
        />
      </div>
    </section>

    <!-- ── Fleetd Info ───────────────────────────── -->
    <section class="section">
      <SectionHeader title="Fleet agent (fleetd)" />
      <DataTable
        title="Devices with errors"
        :data="fleetdErrors"
        :columns="fleetdColumns"
        :loading="loading.fleetd"
      />
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { query } from '../services/api'
import MetricCard from '../components/MetricCard.vue'
import TimeSeriesChart from '../components/TimeSeriesChart.vue'
import PieChart from '../components/PieChart.vue'
import BarChart from '../components/BarChart.vue'
import { displayHost } from '../composables/displayName'
import DataTable from '../components/DataTable.vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import Drawer from '../components/base/Drawer.vue'
import Badge from '../components/base/Badge.vue'
import { palette } from '../composables/uiPalette'

const error = ref(null)

const loading = ref({
  wifi: false,
  wifiDistribution: false,
  wifiDevices: false,
  wifiTimeseries: false,
  apps: false,
  topApps: false,
  hardware: false,
  fleetd: false,
  deviceWifi: false,
  deviceApps: false,
})

// ── Fleet data refs ─────────────────────────────────
const wifi = ref({ uniqueHosts: 0, avgRssi: 0, avgSnr: 0, avgTxRate: 0 })
const wifiDistribution = ref([])
const wifiDevices = ref([])
const wifiWorstBar = ref([])
const wifiTimeseries = ref([])

const apps = ref({ uniqueApps: 0, uniqueHosts: 0, avgMemory: 0, p95Memory: 0 })
const topApps = ref([])

const ramTiers = ref([])
const hardwareList = ref([])
const fleetdErrors = ref([])

// ── Device drill-down refs ──────────────────────────
const selectedDevice = ref(null)
const deviceWifiTs = ref([])
const deviceApps = ref([])

// ── Column defs ─────────────────────────────────────
const appColumns = [
  { key: 'app_name', label: 'App' },
  { key: 'avg_memory_mb', label: 'Avg MB' },
  { key: 'max_memory_mb', label: 'Peak MB' },
  { key: 'avg_threads', label: 'Threads' },
  { key: 'device_count', label: 'Devices' },
]

const deviceAppColumns = [
  { key: 'app_name', label: 'App' },
  { key: 'memory_mb', label: 'Memory (MB)' },
  { key: 'threads', label: 'Threads' },
  { key: 'bundle_identifier', label: 'Bundle ID' },
]

const fleetdColumns = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'version', label: 'Version' },
  { key: 'platform', label: 'Platform' },
  { key: 'last_error', label: 'Last error' },
]

const hardwareColumns = [
  { key: 'display_host', label: 'Hostname' },
  { key: 'cpu_brand', label: 'CPU' },
  { key: 'memory_gb', label: 'RAM (GB)', type: 'number' },
  { key: 'hardware_model', label: 'Model' },
]

// Display rows for the hardware DataTable; keeps hardwareList untouched.
const hardwareRows = computed(() =>
  hardwareList.value.map(h => ({ ...h, display_host: displayHost(h) }))
)

// ── Helpers ─────────────────────────────────────────
function rssiClass(rssi) {
  if (rssi >= -50) return 'rssi-excellent'
  if (rssi >= -60) return 'rssi-good'
  if (rssi >= -70) return 'rssi-fair'
  return 'rssi-poor'
}

// signal_quality value → Badge tone on the canonical status scale.
const QUALITY_TONES = {
  excellent: 'good',
  good: 'good',
  fair: 'fair',
  weak: 'critical',
  poor: 'critical',
  very_weak: 'critical',
}
function qualityTone(q) {
  return QUALITY_TONES[q] || 'neutral'
}
function qualityLabel(q) {
  const s = String(q || '').replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Device drill-down ───────────────────────────────
async function selectDevice(device) {
  selectedDevice.value = device
  window.scrollTo({ top: 0, behavior: 'smooth' })
  await fetchDeviceDetail(device.host_id)
}

async function selectDeviceById(hostId, hostname) {
  selectedDevice.value = { host_id: hostId, hostname }
  window.scrollTo({ top: 0, behavior: 'smooth' })
  await fetchDeviceDetail(hostId)
}

function closeDevice() {
  selectedDevice.value = null
  deviceWifiTs.value = []
  deviceApps.value = []
}

async function fetchDeviceDetail(hostId) {
  loading.value.deviceWifi = true
  loading.value.deviceApps = true
  try {
    const [wTs, dApps] = await Promise.all([
      query('firehose.wifi.device_timeseries', { hostId }).catch(() => []),
      query('firehose.apps.per_device', { hostId }).catch(() => []),
    ])
    deviceWifiTs.value = wTs
    deviceApps.value = dApps
  } catch (e) {
    error.value = `Device detail: ${e.message}`
  } finally {
    loading.value.deviceWifi = false
    loading.value.deviceApps = false
  }
}

// ── Fleet fetch functions ───────────────────────────
async function fetchWifi() {
  loading.value.wifi = true
  loading.value.wifiDistribution = true
  loading.value.wifiDevices = true
  loading.value.wifiTimeseries = true
  try {
    const [summary, dist, devices, ts] = await Promise.all([
      query('firehose.wifi.summary'),
      query('firehose.wifi.quality_distribution'),
      query('firehose.wifi.quality', { limit: 100 }),
      query('firehose.wifi.timeseries'),
    ])

    const s = summary[0] || {}
    wifi.value = {
      uniqueHosts: s.unique_hosts || 0,
      avgRssi: s.avg_rssi || 0,
      avgSnr: s.avg_snr || 0,
      avgTxRate: s.avg_transmit_rate || 0,
    }
    wifiDistribution.value = dist
    wifiDevices.value = devices
    wifiWorstBar.value = devices.slice(0, 10).map(d => ({
      hostname: d.hostname || d.host_id?.slice(0, 12),
      abs_rssi: Math.abs(Number(d.rssi)),
    }))
    wifiTimeseries.value = ts
  } catch (e) {
    error.value = `Wi-Fi: ${e.message}`
  } finally {
    loading.value.wifi = false
    loading.value.wifiDistribution = false
    loading.value.wifiDevices = false
    loading.value.wifiTimeseries = false
  }
}

async function fetchApps() {
  loading.value.apps = true
  loading.value.topApps = true
  try {
    const [summary, top] = await Promise.all([
      query('firehose.apps.fleet_summary'),
      query('firehose.apps.top', { limit: 20 }),
    ])

    const s = summary[0] || {}
    apps.value = {
      uniqueApps: s.unique_apps || 0,
      uniqueHosts: s.unique_hosts || 0,
      avgMemory: s.avg_app_memory_mb || 0,
      p95Memory: s.p95_memory_mb || 0,
    }
    topApps.value = top
  } catch (e) {
    error.value = `Apps: ${e.message}`
  } finally {
    loading.value.apps = false
    loading.value.topApps = false
  }
}

async function fetchHardware() {
  loading.value.hardware = true
  try {
    const [tiers, inventory] = await Promise.all([
      query('firehose.hardware.memory_tiers'),
      query('firehose.hardware.inventory', { limit: 100 }),
    ])
    ramTiers.value = tiers
    hardwareList.value = inventory
  } catch (e) {
    error.value = `Hardware: ${e.message}`
  } finally {
    loading.value.hardware = false
  }
}

async function fetchFleetd() {
  loading.value.fleetd = true
  try {
    const rows = await query('firehose.fleetd.errors', { limit: 20 })
    fleetdErrors.value = rows
  } catch (e) {
    error.value = `Fleetd: ${e.message}`
  } finally {
    loading.value.fleetd = false
  }
}

async function fetchAll() {
  error.value = null
  await Promise.all([fetchWifi(), fetchApps(), fetchHardware(), fetchFleetd()])
}

onMounted(() => fetchAll())
</script>

<style scoped>
.dashboard {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--pad-xlarge);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--pad-medium);
}

h3 {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0 0 7px;
}

/* ── Device Drawer content ───────────────────── */
.drawer-body {
  display: flex;
  flex-direction: column;
  gap: var(--pad-medium);
}

/* ── Wi-Fi hosts table (kept hand-rolled for the selected-row
     highlight; styled to the shared table spec) ── */
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

.data-table td {
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
  border-bottom: 1px solid var(--fleet-black-10);
  color: var(--fleet-black-75);
}
.data-table tbody tr:last-child td { border-bottom: 0; }

.clickable-row {
  cursor: pointer;
  transition: background 100ms;
}

.clickable-row:hover {
  background: var(--fleet-off-white);
}

.clickable-row.selected {
  background: var(--sidebar-active-bg);
}

.hostname {
  font-weight: 700;
  color: var(--fleet-black);
}

/* ── RSSI colors ─────────────────────────────── */
.rssi-excellent { color: var(--status-good); font-weight: 600; }
.rssi-good { color: var(--status-good); }
.rssi-fair { color: var(--status-fair-text); }
.rssi-poor { color: var(--status-critical); font-weight: 600; }
</style>
