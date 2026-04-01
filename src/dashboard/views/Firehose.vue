<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>Firehose</h1>
      <span class="subtitle">osquery result logs — direct from S3 ClickPipe</span>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ── Device Detail Drawer ──────────────────── -->
    <section v-if="selectedDevice" class="device-drawer">
      <div class="drawer-header">
        <h2>{{ selectedDevice.hostname || selectedDevice.host_id }}</h2>
        <button class="close-btn" @click="closeDevice">&times;</button>
      </div>

      <div class="metrics-row four-col">
        <MetricCard label="RSSI" :value="selectedDevice.rssi" unit="dBm" />
        <MetricCard label="SNR" :value="selectedDevice.snr" unit="dB" />
        <MetricCard label="Quality" :value="selectedDevice.signal_quality" />
        <MetricCard label="Tx Rate" :value="selectedDevice.transmit_rate" unit="Mbps" />
      </div>

      <!-- Device Wi-Fi timeseries -->
      <TimeSeriesChart
        v-if="deviceWifiTs.length"
        :title="`RSSI over time — ${selectedDevice.hostname}`"
        :data="deviceWifiTs"
        :loading="loading.deviceWifi"
        xKey="hour"
        yKey="avg_rssi"
        color="#3b82f6"
      />

      <!-- Device running apps -->
      <h3 v-if="deviceApps.length">Running apps (latest snapshot)</h3>
      <DataTable
        v-if="deviceApps.length"
        :data="deviceApps"
        :columns="deviceAppColumns"
        :loading="loading.deviceApps"
      />
    </section>

    <!-- ── Wi-Fi Signal Summary ──────────────────── -->
    <section class="section">
      <h2>Wi-Fi signal quality</h2>
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
          labelKey="hostname"
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
        color="#3b82f6"
      />
    </section>

    <!-- Wi-Fi Devices Table (clickable) -->
    <section class="section">
      <h2>All devices — Wi-Fi</h2>
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
              <td class="hostname">{{ d.hostname || d.host_id.slice(0, 12) }}</td>
              <td :class="rssiClass(d.rssi)">{{ d.rssi }} dBm</td>
              <td>{{ d.snr }} dB</td>
              <td><span class="quality-badge" :class="d.signal_quality">{{ d.signal_quality }}</span></td>
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
      <h2>Running apps</h2>
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
      <h2>Hardware inventory</h2>
      <div class="charts-row two-col">
        <PieChart
          title="RAM tiers"
          :data="ramTiers"
          :loading="loading.hardware"
          nameKey="ram_tier"
          valueKey="device_count"
        />
        <div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>CPU</th>
                  <th>RAM</th>
                  <th>Model</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="h in hardwareList"
                  :key="h.host_id"
                  class="clickable-row"
                  @click="selectDeviceById(h.host_id, h.hostname)"
                >
                  <td class="hostname">{{ h.hostname || h.computer_name }}</td>
                  <td>{{ h.cpu_brand }}</td>
                  <td>{{ h.memory_gb }} GB</td>
                  <td>{{ h.hardware_model }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Fleetd Info ───────────────────────────── -->
    <section class="section">
      <h2>Fleet agent (fleetd)</h2>
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
import { ref, onMounted } from 'vue'
import { query } from '../services/api'
import MetricCard from '../components/MetricCard.vue'
import TimeSeriesChart from '../components/TimeSeriesChart.vue'
import PieChart from '../components/PieChart.vue'
import BarChart from '../components/BarChart.vue'
import DataTable from '../components/DataTable.vue'

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

// ── Helpers ─────────────────────────────────────────
function rssiClass(rssi) {
  if (rssi >= -50) return 'rssi-excellent'
  if (rssi >= -60) return 'rssi-good'
  if (rssi >= -70) return 'rssi-fair'
  return 'rssi-poor'
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

.dashboard-header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 24px;
}

.subtitle {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
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

h3 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  font-family: var(--font-mono);
  margin: 16px 0 8px;
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

.charts-row.two-col {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  margin-bottom: 24px;
}

/* ── Device Drawer ───────────────────────────── */
.device-drawer {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-left: 3px solid #3b82f6;
  border-radius: var(--radius);
  padding: 20px 24px;
  margin-bottom: 32px;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.drawer-header h2 {
  margin: 0;
  padding: 0;
  border: none;
}

.close-btn {
  background: none;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  font-size: 20px;
  cursor: pointer;
  color: var(--fleet-black-50);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--fleet-off-white);
  color: var(--fleet-black);
}

/* ── Data Tables ─────────────────────────────── */
.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
}

.data-table th {
  text-align: left;
  padding: 8px 12px;
  font-weight: 600;
  color: var(--fleet-black-50);
  border-bottom: 2px solid var(--fleet-black-10);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--fleet-black-5);
  color: var(--fleet-black);
}

.clickable-row {
  cursor: pointer;
  transition: background 100ms;
}

.clickable-row:hover {
  background: var(--fleet-off-white);
}

.clickable-row.selected {
  background: #eff6ff;
}

.hostname {
  font-family: var(--font-mono);
  font-weight: 500;
}

/* ── RSSI colors ─────────────────────────────── */
.rssi-excellent { color: #16a34a; font-weight: 600; }
.rssi-good { color: #65a30d; }
.rssi-fair { color: #ca8a04; }
.rssi-poor { color: #dc2626; font-weight: 600; }

/* ── Quality badges ──────────────────────────── */
.quality-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.quality-badge.excellent { background: #dcfce7; color: #166534; }
.quality-badge.good { background: #ecfccb; color: #3f6212; }
.quality-badge.fair { background: #fef9c3; color: #854d0e; }
.quality-badge.weak, .quality-badge.poor { background: #fef2f2; color: #991b1b; }
.quality-badge.very_weak { background: #fecaca; color: #7f1d1d; }

@media (max-width: 1024px) {
  .metrics-row.four-col {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .metrics-row, .metrics-row.four-col {
    grid-template-columns: 1fr;
  }
  .charts-row.two-col {
    grid-template-columns: 1fr;
  }
  .dashboard-header {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
