<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>Firehose reports</h1>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Tabs -->
    <div class="tabs">
      <button
        v-for="tab in tabs" :key="tab.id"
        class="tab" :class="{ active: activeTab === tab.id }"
        @click="switchTab(tab.id)"
      >{{ tab.label }}</button>
    </div>

    <!-- ═══ Wi-Fi Tab ═══════════════════════════════ -->
    <div v-if="activeTab === 'wifi'">
      <section class="section">
        <div class="metrics-row four-col">
          <MetricCard label="Hosts" :value="wifiSummary.unique_hosts" :loading="loading.wifi" />
          <MetricCard label="Avg RSSI" :value="wifiSummary.avg_rssi" unit="dBm" :loading="loading.wifi" />
          <MetricCard label="Avg SNR" :value="wifiSummary.avg_snr" unit="dB" :loading="loading.wifi" />
          <MetricCard label="Samples" :value="wifiSummary.total_samples" :loading="loading.wifi" />
        </div>
      </section>

      <div class="charts-row two-col">
        <section class="section">
          <PieChart title="Signal quality" :data="wifiDist" :loading="loading.wifi" nameKey="signal_quality" valueKey="cnt" />
        </section>
        <section class="section">
          <TimeSeriesChart title="Fleet RSSI trend" :data="wifiTs" :loading="loading.wifi" xKey="hour" yKey="avg_rssi" color="#3b82f6" />
        </section>
      </div>

      <section class="section">
        <DataTable title="All devices — Wi-Fi" :data="wifiDevices" :columns="wifiCols" :loading="loading.wifi" />
      </section>
    </div>

    <!-- ═══ Apps Tab ════════════════════════════════ -->
    <div v-if="activeTab === 'apps'">
      <section class="section">
        <div class="metrics-row four-col">
          <MetricCard label="Unique apps" :value="appSummary.unique_apps" :loading="loading.apps" />
          <MetricCard label="Hosts" :value="appSummary.unique_hosts" :loading="loading.apps" />
          <MetricCard label="Avg memory" :value="appSummary.avg_app_memory_mb" unit="MB" :loading="loading.apps" />
          <MetricCard label="P95 memory" :value="appSummary.p95_memory_mb" unit="MB" :loading="loading.apps" />
        </div>
      </section>

      <div class="charts-row two-col">
        <section class="section">
          <BarChart title="Top 10 by avg memory" :data="topApps" :loading="loading.apps" nameKey="app_name" valueKey="avg_memory_mb" />
        </section>
        <section class="section">
          <BarChart title="Peak memory hogs" :data="peakApps" :loading="loading.apps" nameKey="label" valueKey="peak_memory_mb" />
        </section>
      </div>

      <section class="section">
        <DataTable title="All apps (fleet-wide)" :data="allApps" :columns="appCols" :loading="loading.apps" />
      </section>
    </div>

    <!-- ═══ Hardware Tab ════════════════════════════ -->
    <div v-if="activeTab === 'hardware'">
      <section class="section">
        <div class="metrics-row four-col">
          <MetricCard label="Devices" :value="hwDeviceCount" :loading="loading.hw" />
          <MetricCard label="Unique models" :value="hwModelCount" :loading="loading.hw" />
          <MetricCard label="Avg RAM" :value="hwAvgRam" unit="GB" :loading="loading.hw" />
          <MetricCard label="Avg cores" :value="hwAvgCores" :loading="loading.hw" />
        </div>
      </section>

      <div class="charts-row two-col">
        <section class="section">
          <BarChart title="RAM tiers" :data="ramTiers" :loading="loading.hw" nameKey="ram_tier" valueKey="device_count" :horizontal="true" />
        </section>
        <section class="section">
          <BarChart title="Hardware models" :data="modelDist.slice(0, 15)" :loading="loading.hw" nameKey="hardware_model" valueKey="device_count" :horizontal="true" />
        </section>
      </div>

      <section class="section">
        <DataTable title="Hardware inventory" :data="hwInventory" :columns="hwCols" :loading="loading.hw" />
      </section>
    </div>

    <!-- ═══ Fleetd Tab ═════════════════════════════ -->
    <div v-if="activeTab === 'fleetd'">
      <section class="section">
        <div class="metrics-row four-col">
          <MetricCard label="Total hosts" :value="fleetdSummary.total_hosts" :loading="loading.fleetd" />
          <MetricCard label="Enrolled" :value="fleetdSummary.enrolled_hosts" :loading="loading.fleetd" />
          <MetricCard label="Versions" :value="fleetdSummary.unique_versions" :loading="loading.fleetd" />
          <MetricCard label="Avg uptime" :value="fleetdSummary.avg_uptime_hours" unit="hrs" :loading="loading.fleetd" />
        </div>
      </section>

      <div class="charts-row two-col">
        <section class="section">
          <PieChart title="Uptime distribution" :data="uptimeDist" :loading="loading.fleetd" nameKey="uptime_bucket" valueKey="device_count" />
        </section>
        <section class="section">
          <PieChart title="Version distribution" :data="versionDist" :loading="loading.fleetd" nameKey="orbit_version" valueKey="device_count" />
        </section>
      </div>

      <section class="section">
        <DataTable title="Devices with errors" :data="fleetdErrors" :columns="fleetdCols" :loading="loading.fleetd" />
      </section>
    </div>

    <!-- ═══ Device Health Tab ══════════════════════ -->
    <div v-if="activeTab === 'health'">
      <section class="section">
        <h2>Device health</h2>
        <div class="metrics-row four-col">
          <MetricCard label="Devices" :value="healthSummary.total_devices" :loading="loading.health" />
          <MetricCard label="Severe swap" :value="healthSummary.severe_swap" :loading="loading.health" />
          <MetricCard label="Degraded battery" :value="healthSummary.degraded_battery" :loading="loading.health" />
          <MetricCard label="Avg battery" :value="healthSummary.avg_battery_pct" unit="%" :loading="loading.health" />
        </div>
      </section>

      <div class="charts-row two-col">
        <section class="section">
          <BarChart title="CPU class" :data="cpuDist" :loading="loading.health" nameKey="cpu_class" valueKey="device_count" :horizontal="true" />
        </section>
        <section class="section">
          <BarChart title="Swap pressure" :data="swapDist" :loading="loading.health" nameKey="swap_pressure" valueKey="device_count" :horizontal="true" />
        </section>
      </div>

      <div class="charts-row two-col">
        <section class="section">
          <BarChart title="Battery health" :data="batteryDist" :loading="loading.health" nameKey="battery_health_score" valueKey="device_count" :horizontal="true" />
        </section>
        <section class="section">
          <BarChart title="Uptime risk" :data="uptimeRiskDist" :loading="loading.health" nameKey="uptime_risk" valueKey="device_count" :horizontal="true" />
        </section>
      </div>

      <section class="section">
        <DataTable title="Device health inventory" :data="healthDevices" :columns="healthDeviceCols" :loading="loading.health" />
      </section>

      <section class="section">
        <h2>OS health</h2>
        <div class="metrics-row four-col">
          <MetricCard label="Devices" :value="osSummary.total_devices" :loading="loading.health" />
          <MetricCard label="Healthy" :value="osSummary.healthy" :loading="loading.health" />
          <MetricCard label="Degraded" :value="osSummary.degraded" :loading="loading.health" />
          <MetricCard label="Avg uptime" :value="osSummary.avg_uptime_days" unit="days" :loading="loading.health" />
        </div>
      </section>

      <div class="charts-row two-col">
        <section class="section">
          <BarChart title="OS currency" :data="osCurrencyDist" :loading="loading.health" nameKey="os_currency" valueKey="device_count" :horizontal="true" />
        </section>
        <section class="section">
          <BarChart title="Uptime risk" :data="uptimeRiskDist" :loading="loading.health" nameKey="uptime_risk" valueKey="device_count" :horizontal="true" />
        </section>
      </div>

      <section class="section">
        <DataTable title="OS health inventory" :data="osDevices" :columns="osDeviceCols" :loading="loading.health" />
      </section>
    </div>

    <!-- ═══ VPN Tab ════════════════════════════════ -->
    <div v-if="activeTab === 'vpn'">
      <section class="section">
        <div class="metrics-row four-col">
          <MetricCard label="Total devices" :value="vpnSummary.total_devices" :loading="loading.vpn" />
          <MetricCard label="VPN active" :value="vpnSummary.vpn_active" :loading="loading.vpn" />
          <MetricCard label="Direct" :value="vpnSummary.direct_connected" :loading="loading.vpn" />
          <MetricCard label="Disconnected" :value="vpnSummary.disconnected" :loading="loading.vpn" />
        </div>
      </section>

      <div class="charts-row two-col">
        <section class="section">
          <PieChart title="Network confidence" :data="vpnConfDist" :loading="loading.vpn" nameKey="network_confidence" valueKey="device_count" />
        </section>
        <section class="section">&nbsp;</section>
      </div>

      <section class="section">
        <DataTable title="VPN status by device" :data="vpnDevices" :columns="vpnCols" :loading="loading.vpn" />
      </section>
    </div>

    <!-- ═══ Crashes Tab ════════════════════════════ -->
    <div v-if="activeTab === 'crashes'">
      <section class="section">
        <div class="metrics-row four-col">
          <MetricCard label="Devices w/ crashes" :value="crashSummary.devices_with_crashes" :loading="loading.crashes" />
          <MetricCard label="Total crashes (7d)" :value="crashSummary.total_crashes_7d" :loading="loading.crashes" />
          <MetricCard label="Critical" :value="crashSummary.critical_devices" :loading="loading.crashes" />
          <MetricCard label="Elevated" :value="crashSummary.elevated_devices" :loading="loading.crashes" />
        </div>
      </section>

      <div class="charts-row two-col">
        <section class="section">
          <PieChart title="Crash severity" :data="crashSevDist" :loading="loading.crashes" nameKey="crash_severity" valueKey="crash_count" />
        </section>
        <section class="section">&nbsp;</section>
      </div>

      <section class="section">
        <DataTable title="Top crashing apps" :data="topCrashers" :columns="crashCols" :loading="loading.crashes" />
      </section>
    </div>

    <!-- ═══ Adoption Tab ═══════════════════════════ -->
    <div v-if="activeTab === 'adoption'">
      <section class="section">
        <div class="metrics-row four-col">
          <MetricCard label="Devices" :value="adoptionSummary.total_devices" :loading="loading.adoption" />
          <MetricCard label="Unique apps" :value="adoptionSummary.unique_apps" :loading="loading.adoption" />
          <MetricCard label="Active today" :value="adoptionSummary.active_today" :loading="loading.adoption" />
          <MetricCard label="Stale 90d+" :value="adoptionSummary.stale_90d_plus" :loading="loading.adoption" />
        </div>
      </section>

      <div class="charts-row two-col">
        <section class="section">
          <PieChart title="Usage tier distribution" :data="adoptionTierDist" :loading="loading.adoption" nameKey="usage_tier" valueKey="app_count" />
        </section>
        <section class="section">&nbsp;</section>
      </div>

      <section class="section">
        <DataTable title="Most stale apps" :data="staleApps" :columns="adoptionCols" :loading="loading.adoption" />
      </section>
    </div>
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
const activeTab = ref('wifi')
const fetchedTabs = ref(new Set())
const loading = ref({ wifi: false, apps: false, hw: false, fleetd: false, health: false, vpn: false, crashes: false, adoption: false })

const tabs = [
  { id: 'wifi', label: 'Wi-Fi' },
  { id: 'apps', label: 'Applications' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'fleetd', label: 'Fleet agent' },
  { id: 'health', label: 'Device health' },
  { id: 'vpn', label: 'VPN' },
  { id: 'crashes', label: 'Crashes' },
  { id: 'adoption', label: 'Adoption' },
]

// ── Wi-Fi data ──────────────────────────────────────
const wifiSummary = ref({})
const wifiDist = ref([])
const wifiTs = ref([])
const wifiDevices = ref([])
const wifiCols = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'rssi', label: 'RSSI' },
  { key: 'snr', label: 'SNR' },
  { key: 'signal_quality', label: 'Quality' },
  { key: 'transmit_rate', label: 'Tx Rate' },
  { key: 'channel', label: 'Channel' },
  { key: 'security_type', label: 'Security' },
]

// ── Apps data ───────────────────────────────────────
const appSummary = ref({})
const topApps = ref([])
const peakApps = ref([])
const allApps = ref([])
const appCols = [
  { key: 'app_name', label: 'App' },
  { key: 'avg_memory_mb', label: 'Avg MB' },
  { key: 'max_memory_mb', label: 'Peak MB' },
  { key: 'avg_threads', label: 'Threads' },
  { key: 'device_count', label: 'Devices' },
  { key: 'sample_count', label: 'Samples' },
]

// ── Hardware data ───────────────────────────────────
const hwDeviceCount = ref(0)
const hwModelCount = ref(0)
const hwAvgRam = ref(0)
const hwAvgCores = ref(0)
const ramTiers = ref([])
const modelDist = ref([])
const hwInventory = ref([])
const hwCols = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'computer_name', label: 'Name' },
  { key: 'cpu_brand', label: 'CPU' },
  { key: 'cpu_logical_cores', label: 'Cores' },
  { key: 'hardware_model', label: 'Model' },
  { key: 'hardware_serial', label: 'Serial' },
  { key: 'memory_gb', label: 'RAM (GB)' },
]

// ── Fleetd data ─────────────────────────────────────
const fleetdSummary = ref({})
const uptimeDist = ref([])
const versionDist = ref([])
const fleetdErrors = ref([])
const fleetdCols = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'version', label: 'Version' },
  { key: 'platform', label: 'Platform' },
  { key: 'last_error', label: 'Last error' },
]

// ── Health data ────────────────────────────────────
const healthSummary = ref({})
const osSummary = ref({})
const cpuDist = ref([])
const swapDist = ref([])
const batteryDist = ref([])
const osCurrencyDist = ref([])
const uptimeRiskDist = ref([])
const healthDevices = ref([])
const osDevices = ref([])
const healthDeviceCols = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'cpu_class', label: 'CPU' },
  { key: 'ram_tier', label: 'RAM' },
  { key: 'swap_pressure', label: 'Swap' },
  { key: 'battery_health_score', label: 'Battery' },
  { key: 'battery_percent', label: 'Batt %' },
]
const osDeviceCols = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'os_version', label: 'Version' },
  { key: 'os_currency', label: 'Currency' },
  { key: 'uptime_days', label: 'Uptime (d)' },
  { key: 'uptime_risk', label: 'Risk' },
  { key: 'dex_os_health', label: 'Health' },
  { key: 'crashes_30d', label: 'Crashes' },
]

// ── VPN data ───────────────────────────────────────
const vpnSummary = ref({})
const vpnConfDist = ref([])
const vpnDevices = ref([])
const vpnCols = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'vpn_tunnels_active', label: 'Tunnels' },
  { key: 'network_confidence', label: 'Confidence' },
  { key: 'primary_interface', label: 'Interface' },
]

// ── Crashes data ───────────────────────────────────
const crashSummary = ref({})
const crashSevDist = ref([])
const topCrashers = ref([])
const crashCols = [
  { key: 'crashed_identifier', label: 'Identifier' },
  { key: 'app_name', label: 'App' },
  { key: 'total_crashes_7d', label: 'Crashes (7d)' },
  { key: 'affected_devices', label: 'Devices' },
  { key: 'worst_severity', label: 'Severity' },
  { key: 'last_crash', label: 'Last crash' },
]

// ── Adoption data ──────────────────────────────────
const adoptionSummary = ref({})
const adoptionTierDist = ref([])
const staleApps = ref([])
const adoptionCols = [
  { key: 'app_name', label: 'App' },
  { key: 'bundle_identifier', label: 'Bundle ID' },
  { key: 'avg_days_stale', label: 'Avg days stale' },
  { key: 'installed_on', label: 'Installed on' },
  { key: 'usage_tier', label: 'Tier' },
]

// ── Tab switching ───────────────────────────────────
async function switchTab(tab) {
  activeTab.value = tab
  if (!fetchedTabs.value.has(tab)) {
    await fetchTab(tab)
    fetchedTabs.value.add(tab)
  }
}

async function fetchTab(tab) {
  error.value = null
  try {
    if (tab === 'wifi') {
      loading.value.wifi = true
      const [s, d, ts, dev] = await Promise.all([
        query('firehose.wifi.summary'),
        query('firehose.wifi.quality_distribution'),
        query('firehose.wifi.timeseries'),
        query('firehose.wifi.quality', { limit: 100 }),
      ])
      wifiSummary.value = s[0] || {}
      wifiDist.value = d
      wifiTs.value = ts
      wifiDevices.value = dev
      loading.value.wifi = false
    }
    else if (tab === 'apps') {
      loading.value.apps = true
      const [s, top, peak, all] = await Promise.all([
        query('firehose.apps.fleet_summary'),
        query('firehose.apps.top', { limit: 10 }),
        query('firehose.apps.memory_hogs', { limit: 10 }),
        query('firehose.apps.top', { limit: 100 }),
      ])
      appSummary.value = s[0] || {}
      topApps.value = top
      peakApps.value = peak.map(h => ({ ...h, label: `${h.app_name} (${h.hostname || ''})` }))
      allApps.value = all
      loading.value.apps = false
    }
    else if (tab === 'hardware') {
      loading.value.hw = true
      const [tiers, models, inv] = await Promise.all([
        query('firehose.hardware.memory_tiers'),
        query('firehose.hardware.model_distribution'),
        query('firehose.hardware.inventory', { limit: 200 }),
      ])
      ramTiers.value = tiers
      hwInventory.value = inv
      hwDeviceCount.value = inv.length
      hwAvgRam.value = inv.length ? Math.round(inv.reduce((s, d) => s + (Number(d.memory_gb) || 0), 0) / inv.length) : 0
      hwAvgCores.value = inv.length ? Math.round(inv.reduce((s, d) => s + (Number(d.cpu_logical_cores) || 0), 0) / inv.length) : 0

      // Aggregate model distribution from raw rows
      const mc = {}
      for (const m of models) {
        const key = m.hardware_model || 'Unknown'
        mc[key] = (mc[key] || 0) + 1
      }
      modelDist.value = Object.entries(mc).map(([k, v]) => ({ hardware_model: k, device_count: v })).sort((a, b) => b.device_count - a.device_count)
      hwModelCount.value = modelDist.value.length

      loading.value.hw = false
    }
    else if (tab === 'fleetd') {
      loading.value.fleetd = true
      const [s, up, ver, err] = await Promise.all([
        query('firehose.fleetd.summary'),
        query('firehose.fleetd.uptime'),
        query('firehose.fleetd.versions'),
        query('firehose.fleetd.errors', { limit: 20 }),
      ])
      fleetdSummary.value = s[0] || {}
      uptimeDist.value = up
      versionDist.value = ver
      fleetdErrors.value = err
      loading.value.fleetd = false
    }
    else if (tab === 'health') {
      loading.value.health = true
      const [dh, os, cpu, swap, batt, osCurr, upRisk, devList, osList] = await Promise.all([
        query('firehose.health.device_summary'),
        query('firehose.health.os_summary'),
        query('firehose.health.cpu_distribution'),
        query('firehose.health.swap_distribution'),
        query('firehose.health.battery_overview'),
        query('firehose.health.os_currency_distribution'),
        query('firehose.health.uptime_distribution'),
        query('firehose.health.device_list', { limit: 200 }),
        query('firehose.health.os_list', { limit: 200 }),
      ])
      healthSummary.value = dh[0] || {}
      osSummary.value = os[0] || {}
      cpuDist.value = cpu
      swapDist.value = swap
      batteryDist.value = batt
      osCurrencyDist.value = osCurr
      uptimeRiskDist.value = upRisk
      healthDevices.value = devList
      osDevices.value = osList
      loading.value.health = false
    }
    else if (tab === 'vpn') {
      loading.value.vpn = true
      const [s, conf, dev] = await Promise.all([
        query('firehose.vpn.summary'),
        query('firehose.vpn.confidence_distribution'),
        query('firehose.vpn.list', { limit: 200 }),
      ])
      vpnSummary.value = s[0] || {}
      vpnConfDist.value = conf
      vpnDevices.value = dev
      loading.value.vpn = false
    }
    else if (tab === 'crashes') {
      loading.value.crashes = true
      const [s, sev, top] = await Promise.all([
        query('firehose.crashes.summary'),
        query('firehose.crashes.severity_distribution'),
        query('firehose.crashes.top_crashers', { limit: 25 }),
      ])
      crashSummary.value = s[0] || {}
      crashSevDist.value = sev
      topCrashers.value = top
      loading.value.crashes = false
    }
    else if (tab === 'adoption') {
      loading.value.adoption = true
      const [s, tiers, stale] = await Promise.all([
        query('firehose.adoption.summary'),
        query('firehose.adoption.tier_distribution'),
        query('firehose.adoption.stale_apps', { limit: 50 }),
      ])
      adoptionSummary.value = s[0] || {}
      adoptionTierDist.value = tiers
      staleApps.value = stale
      loading.value.adoption = false
    }
  } catch (e) {
    error.value = `${tab}: ${e.message}`
    loading.value[tab === 'hardware' ? 'hw' : tab] = false
  }
}

onMounted(() => {
  fetchTab('wifi')
  fetchedTabs.value.add('wifi')
})
</script>

<style scoped>
.dashboard { max-width: 1280px; margin: 0 auto; padding: var(--pad-xlarge); }
.dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
h1 { font-size: var(--font-size-lg); font-weight: 600; color: var(--fleet-black); font-family: var(--font-mono); }
h2 { font-size: var(--font-size-md); font-weight: 600; color: var(--fleet-black); font-family: var(--font-mono); margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--fleet-black-10); }
.error-banner { background: var(--fleet-white); color: var(--fleet-error); padding: 12px 16px; border-radius: var(--radius); border: 1px solid var(--fleet-black-10); border-left: 3px solid var(--fleet-error); margin-bottom: 24px; }
.section { margin-bottom: 32px; }
.metrics-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 24px; }
.metrics-row.four-col { grid-template-columns: repeat(4, 1fr); }
.charts-row.two-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 24px; }

/* Tabs */
.tabs { display: flex; gap: 0; margin-bottom: 24px; border-bottom: 2px solid var(--fleet-black-10); }
.tab { font-family: var(--font-mono); font-size: var(--font-size-sm); font-weight: 500; padding: 10px 20px; border: none; background: none; color: var(--fleet-black-50); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: color 150ms, border-color 150ms; }
.tab:hover { color: var(--fleet-black-75); }
.tab.active { color: var(--fleet-black); font-weight: 600; border-bottom-color: #3b82f6; }

@media (max-width: 1024px) { .metrics-row.four-col { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .metrics-row, .metrics-row.four-col { grid-template-columns: 1fr; } .charts-row.two-col { grid-template-columns: 1fr; } .tabs { overflow-x: auto; } }
</style>
