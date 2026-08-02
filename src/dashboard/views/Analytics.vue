<template>
  <div class="dashboard page-stack">
    <PageHeader title="Analytics" subtitle="Fleet telemetry — cross-domain overview and per-dataset deep dives" />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Tabs -->
    <Tabs
      :model-value="activeTab"
      :options="tabItems"
      variant="underline"
      @update:model-value="switchTab"
    />

    <!-- ═══ Overview Tab (cross-domain summary) ═════ -->
    <OverviewPane v-if="activeTab === 'overview'" />

    <!-- ═══ Wi-Fi Tab ═══════════════════════════════ -->
    <div v-if="activeTab === 'wifi'" class="page-stack">
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
          <ChartCard title="Signal quality" :loading="loading.wifi" :empty="!wifiDist.length">
            <DistributionStrip :data="wifiDist" nameKey="signal_quality" valueKey="cnt" :order="SIGNAL_ORDER" :tones="SIGNAL_TONES" />
          </ChartCard>
        </section>
        <section class="section">
          <TimeSeriesChart title="Fleet RSSI trend" :data="wifiTs" :loading="loading.wifi" xKey="hour" yKey="avg_rssi" :color="palette.info" />
        </section>
      </div>

      <section class="section">
        <DataTable title="All hosts — Wi-Fi" :data="wifiDevices" :columns="wifiCols" :loading="loading.wifi" />
      </section>
    </div>

    <!-- ═══ Apps Tab ════════════════════════════════ -->
    <div v-if="activeTab === 'apps'" class="page-stack">
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
    <div v-if="activeTab === 'hardware'" class="page-stack">
      <section class="section">
        <div class="metrics-row four-col">
          <MetricCard label="Hosts" :value="hwDeviceCount" :loading="loading.hw" />
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
    <div v-if="activeTab === 'fleetd'" class="page-stack">
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
          <ChartCard title="Uptime distribution" :loading="loading.fleetd" :empty="!uptimeDist.length">
            <DistributionStrip :data="uptimeDist" nameKey="uptime_bucket" valueKey="device_count" :order="UPTIME_ORDER" :tones="UPTIME_TONES" />
          </ChartCard>
        </section>
        <section class="section">
          <ChartCard title="Version distribution" :loading="loading.fleetd" :empty="!versionDist.length">
            <BarList :data="versionDist" nameKey="orbit_version" valueKey="device_count" :maxRows="8" :humanize="false" />
          </ChartCard>
        </section>
      </div>

      <section class="section">
        <DataTable title="Hosts with errors" :data="fleetdErrors" :columns="fleetdCols" :loading="loading.fleetd" />
      </section>
    </div>

    <!-- ═══ Host Health Tab ══════════════════════ -->
    <div v-if="activeTab === 'health'" class="page-stack">
      <section class="section">
        <SectionHeader title="Host health" />
        <div class="metrics-row four-col">
          <MetricCard label="Hosts" :value="healthSummary.total_devices" :loading="loading.health" />
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
        <DataTable title="Host health inventory" :data="healthDevices" :columns="healthDeviceCols" :loading="loading.health" />
      </section>

      <section class="section">
        <SectionHeader title="OS health" />
        <div class="metrics-row four-col">
          <MetricCard label="Hosts" :value="osSummary.total_devices" :loading="loading.health" />
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
    <div v-if="activeTab === 'vpn'" class="page-stack">
      <section class="section">
        <div class="metrics-row four-col">
          <MetricCard label="Total hosts" :value="vpnSummary.total_devices" :loading="loading.vpn" />
          <MetricCard label="VPN active" :value="vpnSummary.vpn_active" :loading="loading.vpn" />
          <MetricCard label="Direct" :value="vpnSummary.direct_connected" :loading="loading.vpn" />
          <MetricCard label="Disconnected" :value="vpnSummary.disconnected" :loading="loading.vpn" />
        </div>
      </section>

      <div class="charts-row two-col">
        <section class="section">
          <ChartCard title="Network confidence" :loading="loading.vpn" :empty="!vpnConfDist.length">
            <DistributionStrip :data="vpnConfDist" nameKey="network_confidence" valueKey="device_count" :order="NETWORK_ORDER" :tones="NETWORK_TONES" />
          </ChartCard>
        </section>
      </div>

      <section class="section">
        <DataTable title="VPN status by host" :data="vpnDevices" :columns="vpnCols" :loading="loading.vpn" />
      </section>
    </div>

    <!-- ═══ Crashes Tab ════════════════════════════ -->
    <div v-if="activeTab === 'crashes'" class="page-stack">
      <section class="section">
        <div class="metrics-row four-col">
          <MetricCard label="Hosts w/ crashes" :value="crashSummary.devices_with_crashes" :loading="loading.crashes" />
          <MetricCard label="Total crashes (7d)" :value="crashSummary.total_crashes_7d" :loading="loading.crashes" />
          <MetricCard label="Critical" :value="crashSummary.critical_devices" :loading="loading.crashes" />
          <MetricCard label="Elevated" :value="crashSummary.elevated_devices" :loading="loading.crashes" />
        </div>
      </section>

      <div class="charts-row two-col">
        <section class="section">
          <ChartCard title="Crash severity" :loading="loading.crashes" :empty="!crashSevDist.length">
            <DistributionStrip :data="crashSevDist" nameKey="crash_severity" valueKey="crash_count" :order="CRASH_ORDER" :tones="CRASH_TONES" />
          </ChartCard>
        </section>
      </div>

      <section class="section">
        <DataTable title="Top crashing apps" :data="topCrashers" :columns="crashCols" :loading="loading.crashes" />
      </section>
    </div>

    <!-- ═══ Adoption Tab ═══════════════════════════ -->
    <div v-if="activeTab === 'adoption'" class="page-stack">
      <section class="section">
        <div class="metrics-row four-col">
          <MetricCard label="Hosts" :value="adoptionSummary.total_devices" :loading="loading.adoption" />
          <MetricCard label="Unique apps" :value="adoptionSummary.unique_apps" :loading="loading.adoption" />
          <MetricCard label="Active today" :value="adoptionSummary.active_today" :loading="loading.adoption" />
          <MetricCard label="Stale 90d+" :value="adoptionSummary.stale_90d_plus" :loading="loading.adoption" />
        </div>
      </section>

      <div class="charts-row two-col">
        <section class="section">
          <ChartCard title="Usage tier distribution" :loading="loading.adoption" :empty="!adoptionTierDist.length">
            <DistributionStrip :data="adoptionTierDist" nameKey="usage_tier" valueKey="app_count" :order="USAGE_ORDER" :tones="USAGE_TONES" />
          </ChartCard>
        </section>
      </div>

      <section class="section">
        <DataTable title="Most stale apps" :data="staleApps" :columns="adoptionCols" :loading="loading.adoption" />
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { query } from '../services/api'
import MetricCard from '../components/MetricCard.vue'
import TimeSeriesChart from '../components/TimeSeriesChart.vue'
import BarChart from '../components/BarChart.vue'
import ChartCard from '../components/base/ChartCard.vue'
import DistributionStrip from '../components/base/DistributionStrip.vue'
import BarList from '../components/base/BarList.vue'
import DataTable from '../components/DataTable.vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import Tabs from '../components/base/Tabs.vue'
import OverviewPane from '../components/analytics/OverviewPane.vue'
import { palette } from '../composables/uiPalette'
import { useFleetFilter } from '../composables/useFleetFilter'
import { displayHost } from '../composables/displayName'

const SIGNAL_ORDER = ['excellent', 'good', 'fair', 'weak', 'poor', 'very_weak', 'unknown']
const SIGNAL_TONES = { excellent: 'good', good: 'soft', fair: 'fair', weak: 'elevated', poor: 'critical', very_weak: 'critical', unknown: 'neutral' }
const NETWORK_ORDER = ['direct_connected', 'tunnel_active', 'vpn_active', 'proxy_suspected', 'disconnected', 'unknown']
const NETWORK_TONES = { direct_connected: 'good', tunnel_active: 'info', vpn_active: 'info', proxy_suspected: 'fair', disconnected: 'critical', unknown: 'neutral' }
const CRASH_ORDER = ['none', 'single', 'recurring', 'elevated', 'critical']
const CRASH_TONES = { none: 'good', single: 'soft', recurring: 'fair', elevated: 'elevated', critical: 'critical' }
const USAGE_ORDER = ['active_today', 'active_week', 'stale_30d', 'stale_90d', 'stale_90d_plus', 'never_opened']
const USAGE_TONES = { active_today: 'good', active_week: 'soft', stale_30d: 'fair', stale_90d: 'elevated', stale_90d_plus: 'elevated', never_opened: 'critical' }
// core.fleetd.uptime_distribution buckets (recently rebooted -> long-running)
const UPTIME_ORDER = ['< 1h', '1h - 1d', '1d - 7d', '7d - 30d', '30d+']
const UPTIME_TONES = { '< 1h': 'good', '1h - 1d': 'good', '1d - 7d': 'soft', '7d - 30d': 'fair', '30d+': 'elevated' }

// DataTable renders row[col.key], so the raw .local-suffixed hostname leaks
// into every "Hostname" column in this view. Mapping rows once at assignment
// time lets displayHost pick computer_name (when present) or strip .local
// (when only hostname is available), without changing every column config.
function withDisplayHost(rows) {
  if (!Array.isArray(rows)) return rows
  return rows.map(r => ({ ...r, hostname: displayHost(r) }))
}

// Wire the top filter bar (search / OS / model / RAM) into every query
// fired by /reports. Queries that don't accept FILTER_PARAMS will just
// ignore the extra params; queries that do will scope to the filter.
const { filterParams } = useFleetFilter()
const fp = () => ({ ...filterParams.value })

const error = ref(null)
const activeTab = ref('overview')
const fetchedTabs = ref(new Set())
const loading = ref({ wifi: false, apps: false, hw: false, fleetd: false, health: false, vpn: false, crashes: false, adoption: false })

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'wifi', label: 'Wi-Fi' },
  { id: 'apps', label: 'Applications' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'fleetd', label: 'Fleet agent' },
  { id: 'health', label: 'Host health' },
  { id: 'vpn', label: 'VPN' },
  { id: 'crashes', label: 'Crashes' },
  { id: 'adoption', label: 'Adoption' },
]
// Shape the existing tab list for the Tabs primitive ({value,label}).
const tabItems = tabs.map(t => ({ value: t.id, label: t.label }))

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
  { key: 'device_count', label: 'Hosts' },
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
  { key: 'affected_devices', label: 'Hosts' },
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
  // The overview pane owns its own fetching/refetching.
  if (tab === 'overview') return
  error.value = null
  try {
    if (tab === 'wifi') {
      loading.value.wifi = true
      const [s, d, ts, dev] = await Promise.all([
        query('firehose.wifi.summary', { ...fp() }),
        query('firehose.wifi.quality_distribution', { ...fp() }),
        query('firehose.wifi.timeseries', { ...fp() }),
        query('firehose.wifi.quality', { limit: 100, ...fp() }),
      ])
      wifiSummary.value = s[0] || {}
      wifiDist.value = d
      wifiTs.value = ts
      wifiDevices.value = withDisplayHost(dev)
      loading.value.wifi = false
    }
    else if (tab === 'apps') {
      loading.value.apps = true
      const [s, top, peak, all] = await Promise.all([
        query('firehose.apps.fleet_summary', { ...fp() }),
        query('firehose.apps.top', { limit: 10, ...fp() }),
        query('firehose.apps.memory_hogs', { limit: 10, ...fp() }),
        query('firehose.apps.top', { limit: 100, ...fp() }),
      ])
      appSummary.value = s[0] || {}
      topApps.value = top
      peakApps.value = peak.map(h => ({ ...h, label: `${h.app_name} (${displayHost(h)})` }))
      allApps.value = all
      loading.value.apps = false
    }
    else if (tab === 'hardware') {
      loading.value.hw = true
      const [tiers, models, inv] = await Promise.all([
        query('firehose.hardware.memory_tiers', { ...fp() }),
        query('firehose.hardware.model_distribution', { ...fp() }),
        query('firehose.hardware.inventory', { limit: 200, ...fp() }),
      ])
      ramTiers.value = tiers
      hwInventory.value = withDisplayHost(inv)
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
        query('firehose.fleetd.summary', { ...fp() }),
        query('firehose.fleetd.uptime', { ...fp() }),
        query('firehose.fleetd.versions', { ...fp() }),
        query('firehose.fleetd.errors', { limit: 20, ...fp() }),
      ])
      fleetdSummary.value = s[0] || {}
      uptimeDist.value = up
      versionDist.value = ver
      fleetdErrors.value = withDisplayHost(err)
      loading.value.fleetd = false
    }
    else if (tab === 'health') {
      loading.value.health = true
      const [dh, os, cpu, swap, batt, osCurr, upRisk, devList, osList] = await Promise.all([
        query('firehose.health.device_summary', { ...fp() }),
        query('firehose.health.os_summary', { ...fp() }),
        query('firehose.health.cpu_distribution', { ...fp() }),
        query('firehose.health.swap_distribution', { ...fp() }),
        query('firehose.health.battery_overview', { ...fp() }),
        query('firehose.health.os_currency_distribution', { ...fp() }),
        query('firehose.health.uptime_distribution', { ...fp() }),
        query('firehose.health.device_list', { limit: 200, ...fp() }),
        query('firehose.health.os_list', { limit: 200, ...fp() }),
      ])
      healthSummary.value = dh[0] || {}
      osSummary.value = os[0] || {}
      cpuDist.value = cpu
      swapDist.value = swap
      batteryDist.value = batt
      osCurrencyDist.value = osCurr
      uptimeRiskDist.value = upRisk
      healthDevices.value = withDisplayHost(devList)
      osDevices.value = withDisplayHost(osList)
      loading.value.health = false
    }
    else if (tab === 'vpn') {
      loading.value.vpn = true
      const [s, conf, dev] = await Promise.all([
        query('firehose.vpn.summary', { ...fp() }),
        query('firehose.vpn.confidence_distribution', { ...fp() }),
        query('firehose.vpn.list', { limit: 200, ...fp() }),
      ])
      vpnSummary.value = s[0] || {}
      vpnConfDist.value = conf
      vpnDevices.value = withDisplayHost(dev)
      loading.value.vpn = false
    }
    else if (tab === 'crashes') {
      loading.value.crashes = true
      const [s, sev, top] = await Promise.all([
        query('firehose.crashes.summary', { ...fp() }),
        query('firehose.crashes.severity_distribution', { ...fp() }),
        query('firehose.crashes.top_crashers', { limit: 25, ...fp() }),
      ])
      crashSummary.value = s[0] || {}
      crashSevDist.value = sev
      topCrashers.value = top
      loading.value.crashes = false
    }
    else if (tab === 'adoption') {
      loading.value.adoption = true
      const [s, tiers, stale] = await Promise.all([
        query('firehose.adoption.summary', { ...fp() }),
        query('firehose.adoption.tier_distribution', { ...fp() }),
        query('firehose.adoption.stale_apps', { limit: 50, ...fp() }),
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
  fetchedTabs.value.add('overview')
})

// When the top filter changes, invalidate the per-tab cache and re-fetch
// the currently-visible tab. Inactive tabs are marked stale; switchTab
// re-fetches them on demand.
watch(filterParams, () => {
  const current = activeTab.value
  fetchedTabs.value = new Set([current])
  fetchTab(current)
}, { deep: true })
</script>

<style scoped>
.dashboard { max-width: 1280px; margin: 0 auto; padding: var(--pad-xlarge); }

.section {
  display: flex;
  flex-direction: column;
  gap: var(--pad-medium);
}
</style>
