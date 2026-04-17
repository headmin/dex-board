<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>Firehose experience</h1>
      <span class="subtitle">Fleet health overview from osquery result logs</span>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ═══ FLEET OVERVIEW ═══════════════════════════════════ -->
    <section class="section">
      <h2>Fleet overview</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Total hosts" :value="overview.totalDevices" :loading="loading.overview" />
        <MetricCard label="Unique apps" :value="overview.uniqueApps" :loading="loading.overview" />
        <MetricCard
          label="Hosts on Wi-Fi"
          :value="overview.wifiHosts"
          :subtitle="overview.totalDevices ? `${Math.round(overview.wifiHosts / overview.totalDevices * 100)}% of fleet` : ''"
          :loading="loading.overview"
        />
        <MetricCard
          label="Hosts reporting apps"
          :value="overview.appHosts"
          :subtitle="overview.totalDevices ? `${Math.round(overview.appHosts / overview.totalDevices * 100)}% of fleet` : ''"
          :loading="loading.overview"
        />
      </div>
    </section>

    <!-- ═══ 1. HARDWARE (Device health) ══════════════════════ -->
    <section class="section">
      <h2>Device health</h2>
      <div class="metrics-row four-col">
        <div class="clickable-wrap" :class="{ active: drillCondition === 'severe_swap' }" @click="toggleDrill('severe_swap')" role="button" tabindex="0">
          <MetricCard label="Severe swap" :value="deviceHealth.severeSwap" :loading="loading.deviceHealth" />
        </div>
        <div class="clickable-wrap" :class="{ active: drillCondition === 'elevated_swap' }" @click="toggleDrill('elevated_swap')" role="button" tabindex="0">
          <MetricCard label="Elevated swap" :value="deviceHealth.elevatedSwap" :loading="loading.deviceHealth" />
        </div>
        <div class="clickable-wrap" :class="{ active: drillCondition === 'degraded_battery' }" @click="toggleDrill('degraded_battery')" role="button" tabindex="0">
          <MetricCard label="Degraded battery" :value="deviceHealth.degradedBattery" :loading="loading.deviceHealth" />
        </div>
        <MetricCard label="Avg battery" :value="deviceHealth.avgBatteryPct" unit="%" :loading="loading.deviceHealth" />
      </div>
    </section>

    <!-- Drill-down: host tiles for the clicked condition -->
    <section v-if="drillCondition" class="section drill-section">
      <div class="drill-header">
        <h3>{{ drillTitle }} <span class="drill-count">· {{ drillHosts.length }} host{{ drillHosts.length === 1 ? '' : 's' }}</span></h3>
        <button class="drill-close" @click="drillCondition = null" aria-label="Close drill-down">✕</button>
      </div>
      <div v-if="drillLoading" class="drill-loading">Loading hosts...</div>
      <div v-else-if="!drillHosts.length" class="drill-empty">No hosts match this condition right now.</div>
      <div v-else class="host-tile-grid">
        <HostTile
          v-for="h in drillHosts"
          :key="h.host_id"
          :host="h"
          :condition="drillCondition"
        />
      </div>
    </section>

    <div class="charts-row two-col">
      <section class="section">
        <BarChart
          title="CPU class distribution"
          :data="cpuDistribution"
          :loading="loading.deviceHealth"
          nameKey="cpu_class"
          valueKey="device_count"
          :horizontal="true"
        />
      </section>
      <section class="section">
        <PieChart
          title="RAM distribution"
          :data="ramTiers"
          :loading="loading.hardware"
          nameKey="ram_tier"
          valueKey="device_count"
        />
      </section>
    </div>

    <div class="charts-row two-col">
      <section class="section">
        <BarChart
          title="Swap pressure"
          :data="swapDistribution"
          :loading="loading.deviceHealth"
          nameKey="swap_pressure"
          valueKey="device_count"
          :horizontal="true"
        />
      </section>
      <section class="section">
        <PieChart
          title="Battery health"
          :data="batteryDist"
          :loading="loading.deviceHealth"
          nameKey="battery_health_score"
          valueKey="device_count"
        />
      </section>
    </div>

    <!-- ═══ 2. OS HEALTH ═════════════════════════════════════ -->
    <section class="section">
      <h2>OS health</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Healthy" :value="osHealth.healthy" :loading="loading.osHealth" />
        <MetricCard label="Acceptable" :value="osHealth.acceptable" :loading="loading.osHealth" />
        <MetricCard label="Degraded" :value="osHealth.degraded" :loading="loading.osHealth" />
        <MetricCard label="Avg uptime" :value="osHealth.avgUptimeDays" unit="days" :loading="loading.osHealth" />
      </div>
    </section>

    <div class="charts-row two-col">
      <section class="section">
        <BarChart
          title="OS currency"
          :data="osCurrencyDist"
          :loading="loading.osHealth"
          nameKey="os_currency"
          valueKey="device_count"
          :horizontal="true"
        />
      </section>
      <section class="section">
        <BarChart
          title="Uptime risk"
          :data="uptimeRiskDist"
          :loading="loading.osHealth"
          nameKey="uptime_risk"
          valueKey="device_count"
          :horizontal="true"
        />
      </section>
    </div>

    <!-- ═══ 3. APPS (memory, adoption, crashes) ══════════════ -->
    <section class="section">
      <div class="section-header-with-caption">
        <h2>Application memory usage</h2>
        <span v-if="overview.appSamples" class="section-caption">
          Based on {{ overview.appSamples.toLocaleString() }} app samples across {{ overview.appHosts }} hosts
        </span>
      </div>
      <div class="metrics-row three-col">
        <MetricCard label="Avg app memory" :value="apps.avgMemory" unit="MB" :loading="loading.apps" />
        <MetricCard label="P95 memory" :value="apps.p95Memory" unit="MB" :loading="loading.apps" />
        <MetricCard label="Hosts reporting apps" :value="overview.appHosts" :loading="loading.overview" />
      </div>
    </section>

    <div class="charts-row two-col">
      <section class="section">
        <BarChart
          title="Top 10 apps by avg memory"
          :data="topApps"
          :loading="loading.apps"
          nameKey="app_name"
          valueKey="avg_memory_mb"
        />
      </section>
      <section class="section">
        <BarChart
          title="Peak memory hogs"
          :data="memoryHogs"
          :loading="loading.hogs"
          nameKey="label"
          valueKey="peak_memory_mb"
        />
      </section>
    </div>

    <section class="section">
      <h2>App adoption</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Devices" :value="adoption.totalDevices" :loading="loading.adoption" />
        <MetricCard label="Unique apps" :value="adoption.uniqueApps" :loading="loading.adoption" />
        <MetricCard label="Active this week" :value="adoption.activeWeek" :loading="loading.adoption" />
        <MetricCard label="Stale 90d+" :value="adoption.stale90Plus" :loading="loading.adoption" />
      </div>
    </section>

    <div class="charts-row two-col">
      <section class="section">
        <PieChart
          title="Usage tiers"
          :data="adoptionTierDist"
          :loading="loading.adoption"
          nameKey="usage_tier"
          valueKey="app_count"
        />
      </section>
      <section class="section">
        <BarChart
          title="Most stale apps (avg days)"
          :data="topStaleApps"
          :loading="loading.adoption"
          nameKey="app_name"
          valueKey="avg_days_stale"
        />
      </section>
    </div>

    <section class="section" v-if="crashes.totalCrashes > 0">
      <h2>Crash overview</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Devices w/ crashes" :value="crashes.devicesWithCrashes" :loading="loading.crashes" />
        <MetricCard label="Total crashes (7d)" :value="crashes.totalCrashes" :loading="loading.crashes" />
        <MetricCard label="Critical" :value="crashes.critical" :loading="loading.crashes" />
        <MetricCard label="Top crasher" :value="crashes.topCrasher" :loading="loading.crashes" />
      </div>
    </section>

    <!-- ═══ 4. NETWORK (Wi-Fi + VPN) ═════════════════════════ -->
    <section class="section">
      <div class="section-header-with-caption">
        <h2>Network health</h2>
        <span v-if="overview.wifiSamples" class="section-caption">
          Based on {{ overview.wifiSamples.toLocaleString() }} samples across {{ overview.wifiHosts }} hosts
        </span>
      </div>
      <div class="metrics-row three-col">
        <MetricCard label="Avg RSSI" :value="wifi.avgRssi" unit="dBm" :loading="loading.wifi" />
        <MetricCard label="Avg SNR" :value="wifi.avgSnr" unit="dB" :loading="loading.wifi" />
        <MetricCard label="Avg Tx Rate" :value="wifi.avgTxRate" unit="Mbps" :loading="loading.wifi" />
      </div>
    </section>

    <div class="charts-row two-col">
      <section class="section">
        <PieChart
          title="Wi-Fi signal quality"
          :data="wifiDistribution"
          :loading="loading.wifi"
          nameKey="signal_quality"
          valueKey="cnt"
        />
      </section>
      <section class="section">
        <BarChart
          title="Weakest Wi-Fi hosts"
          :data="worstWifi"
          :loading="loading.wifi"
          nameKey="hostname"
          valueKey="abs_rssi"
        />
      </section>
    </div>

    <section class="section">
      <TimeSeriesChart
        title="Fleet RSSI trend"
        :data="wifiTimeseries"
        :loading="loading.wifiTs"
        xKey="hour"
        yKey="avg_rssi"
        color="#3b82f6"
      />
    </section>

    <section class="section">
      <h2>VPN &amp; connectivity</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Total hosts" :value="vpn.totalDevices" :loading="loading.vpn" />
        <MetricCard label="VPN active" :value="vpn.vpnActive" :loading="loading.vpn" />
        <MetricCard label="Direct" :value="vpn.directConnected" :loading="loading.vpn" />
        <MetricCard label="Disconnected" :value="vpn.disconnected" :loading="loading.vpn" />
      </div>
    </section>

    <div class="charts-row">
      <section class="section">
        <PieChart
          title="Network path"
          :data="humanizedVpnConfDist"
          :loading="loading.vpn"
          nameKey="network_confidence"
          valueKey="device_count"
        />
      </section>
    </div>

    <!-- ═══ 5. USERS / AGENT DIAGNOSTICS ═════════════════════ -->
    <section class="section">
      <h2>Fleet agent health</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Total hosts" :value="fleetd.totalHosts" :loading="loading.fleetd" />
        <MetricCard label="Enrolled" :value="fleetd.enrolledHosts" :loading="loading.fleetd" />
        <MetricCard label="Versions" :value="fleetd.uniqueVersions" :loading="loading.fleetd" />
        <MetricCard label="Avg uptime" :value="fleetd.avgUptimeHours" unit="hrs" :loading="loading.fleetd" />
      </div>
    </section>

    <div class="charts-row">
      <section class="section">
        <PieChart
          title="Uptime distribution"
          :data="uptimeDist"
          :loading="loading.uptime"
          nameKey="uptime_bucket"
          valueKey="device_count"
        />
      </section>
    </div>

    <section class="section">
      <h2>Process landscape</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Unique processes" :value="processClassTotals.uniqueProcesses" :loading="loading.processes" />
        <MetricCard label="User apps" :value="processClassTotals.userApps" :loading="loading.processes" />
        <MetricCard label="Mgmt agents" :value="processClassTotals.mgmtAgents" :loading="loading.processes" />
        <MetricCard label="System" :value="processClassTotals.system" :loading="loading.processes" />
      </div>
    </section>

    <div class="charts-row two-col">
      <section class="section">
        <BarChart
          title="RAM by process class"
          :data="processClassData"
          :loading="loading.processes"
          nameKey="process_class"
          valueKey="total_rss_mb"
        />
      </section>
      <section class="section">
        <BarChart
          title="Management agent overhead"
          :data="mgmtAgents"
          :loading="loading.processes"
          nameKey="process_name"
          valueKey="avg_rss_mb"
        />
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { query } from '../services/api'
import MetricCard from '../components/MetricCard.vue'
import TimeSeriesChart from '../components/TimeSeriesChart.vue'
import PieChart from '../components/PieChart.vue'
import BarChart from '../components/BarChart.vue'
import HostTile from '../components/HostTile.vue'

const error = ref(null)
const loading = ref({
  overview: false, wifi: false, wifiTs: false, apps: false,
  hogs: false, hardware: false, fleetd: false, uptime: false,
  deviceHealth: false, osHealth: false,
  vpn: false, processes: false, adoption: false, crashes: false,
})

const overview = ref({ totalDevices: 0, wifiHosts: 0, appHosts: 0, uniqueApps: 0, wifiSamples: 0, appSamples: 0 })
const wifi = ref({ avgRssi: 0, avgSnr: 0, avgTxRate: 0 })
const wifiDistribution = ref([])
const wifiTimeseries = ref([])
const worstWifi = ref([])
const apps = ref({ uniqueApps: 0, avgMemory: 0, p95Memory: 0 })
const topApps = ref([])
const memoryHogs = ref([])
const ramTiers = ref([])
const fleetd = ref({ totalHosts: 0, enrolledHosts: 0, uniqueVersions: 0, avgUptimeHours: 0 })
const uptimeDist = ref([])
const deviceHealth = ref({ severeSwap: 0, elevatedSwap: 0, degradedBattery: 0, avgBatteryPct: 0 })
const cpuDistribution = ref([])
const swapDistribution = ref([])
const osHealth = ref({ healthy: 0, acceptable: 0, degraded: 0, avgUptimeDays: 0 })
const osCurrencyDist = ref([])
const uptimeRiskDist = ref([])
const vpn = ref({ totalDevices: 0, vpnActive: 0, directConnected: 0, disconnected: 0 })
const vpnConfDist = ref([])

// ─── Device-health drill-down (clickable metric cards) ──────
// Clicking a metric like "Degraded battery: 3" expands an inline tile grid
// of the matching hosts. Condition enum matches the SQL in hosts_by_condition.
const drillCondition = ref(null)
const drillHosts = ref([])
const drillLoading = ref(false)

const DRILL_TITLES = {
  severe_swap: 'Severe swap pressure',
  elevated_swap: 'Elevated swap pressure',
  degraded_battery: 'Degraded battery',
  replace_battery: 'Battery needs replacement',
  high_compression: 'High compression pressure',
}
const drillTitle = computed(() => DRILL_TITLES[drillCondition.value] || '')

async function toggleDrill(condition) {
  // Click same card again → close
  if (drillCondition.value === condition) {
    drillCondition.value = null
    drillHosts.value = []
    return
  }
  drillCondition.value = condition
  drillLoading.value = true
  drillHosts.value = []
  try {
    const rows = await query('firehose.health.hosts_by_condition', { condition, limit: 100 })
    drillHosts.value = rows
  } catch (e) {
    console.error('Drill-down fetch failed:', e)
  }
  drillLoading.value = false
}

// Humanize the raw enum values from ClickHouse so pie chart legend
// reads "Direct" / "VPN tunnel" / "Disconnected" instead of snake_case.
const VPN_LABELS = {
  direct_connected: 'Direct',
  tunnel_active: 'VPN tunnel',
  disconnected: 'Disconnected',
}
const humanizedVpnConfDist = computed(() =>
  vpnConfDist.value.map(row => ({
    ...row,
    network_confidence: VPN_LABELS[row.network_confidence] || row.network_confidence,
  }))
)
const batteryDist = ref([])
const processClassData = ref([])
const processClassTotals = ref({ uniqueProcesses: 0, userApps: 0, mgmtAgents: 0, system: 0 })
const mgmtAgents = ref([])
const adoption = ref({ totalDevices: 0, uniqueApps: 0, activeWeek: 0, stale90Plus: 0 })
const adoptionTierDist = ref([])
const topStaleApps = ref([])
const crashes = ref({ devicesWithCrashes: 0, totalCrashes: 0, critical: 0, topCrasher: '—' })

async function fetchAll() {
  error.value = null
  loading.value = { overview: true, wifi: true, wifiTs: true, apps: true, hogs: true, hardware: true, fleetd: true, uptime: true, deviceHealth: true, osHealth: true, vpn: true, processes: true, adoption: true, crashes: true }

  try {
    const [ov, wSummary, wDist, wDevices, wTs, appSummary, appTop, hogs, ram, fSummary, uptime, dhSummary, cpuDist, swapDist, battDist, osSummary, osCurrency, uptimeRisk, vpnSum, vpnConf, procClass, procAgents, adoptSum, adoptTiers, adoptStale, crashSum, crashTop] = await Promise.all([
      query('firehose.devices.overview'),
      query('firehose.wifi.summary'),
      query('firehose.wifi.quality_distribution'),
      query('firehose.wifi.quality', { limit: 10 }),
      query('firehose.wifi.timeseries'),
      query('firehose.apps.fleet_summary'),
      query('firehose.apps.top', { limit: 10 }),
      query('firehose.apps.memory_hogs', { limit: 10 }),
      query('firehose.hardware.memory_tiers'),
      query('firehose.fleetd.summary'),
      query('firehose.fleetd.uptime'),
      query('firehose.health.device_summary'),
      query('firehose.health.cpu_distribution'),
      query('firehose.health.swap_distribution'),
      query('firehose.health.battery_overview'),
      query('firehose.health.os_summary'),
      query('firehose.health.os_currency_distribution'),
      query('firehose.health.uptime_distribution'),
      query('firehose.vpn.summary'),
      query('firehose.vpn.confidence_distribution'),
      query('firehose.processes.by_class'),
      query('firehose.processes.mgmt_agents'),
      query('firehose.adoption.summary'),
      query('firehose.adoption.tier_distribution'),
      query('firehose.adoption.stale_apps', { limit: 10 }),
      query('firehose.crashes.summary'),
      query('firehose.crashes.top_crashers', { limit: 5 }),
    ])

    const o = ov[0] || {}
    overview.value = {
      totalDevices: Math.max(o.wifi_hosts || 0, o.app_hosts || 0, o.hw_hosts || 0, o.fleetd_hosts || 0),
      wifiHosts: o.wifi_hosts || 0,
      appHosts: o.app_hosts || 0,
      uniqueApps: o.unique_apps || 0,
      wifiSamples: o.wifi_samples || 0,
      appSamples: o.app_samples || 0,
    }

    const ws = wSummary[0] || {}
    wifi.value = { avgRssi: ws.avg_rssi || 0, avgSnr: ws.avg_snr || 0, avgTxRate: ws.avg_transmit_rate || 0 }
    wifiDistribution.value = wDist
    worstWifi.value = wDevices.slice(0, 10).map(d => ({
      hostname: d.hostname || d.host_id?.slice(0, 12),
      abs_rssi: Math.abs(Number(d.rssi)),
    }))
    wifiTimeseries.value = wTs

    const as = appSummary[0] || {}
    apps.value = { uniqueApps: as.unique_apps || 0, avgMemory: as.avg_app_memory_mb || 0, p95Memory: as.p95_memory_mb || 0 }
    topApps.value = appTop
    memoryHogs.value = hogs.map(h => ({ ...h, label: `${h.app_name} (${h.hostname || ''})` }))

    ramTiers.value = ram

    const fs = fSummary[0] || {}
    fleetd.value = {
      totalHosts: fs.total_hosts || 0,
      enrolledHosts: fs.enrolled_hosts || 0,
      uniqueVersions: fs.unique_versions || 0,
      avgUptimeHours: fs.avg_uptime_hours || 0,
    }
    uptimeDist.value = uptime

    const dh = dhSummary[0] || {}
    deviceHealth.value = {
      severeSwap: dh.severe_swap || 0,
      elevatedSwap: dh.elevated_swap || 0,
      degradedBattery: dh.degraded_battery || 0,
      avgBatteryPct: dh.avg_battery_pct || 0,
    }
    cpuDistribution.value = cpuDist
    swapDistribution.value = swapDist
    batteryDist.value = battDist

    const os = osSummary[0] || {}
    osHealth.value = {
      healthy: os.healthy || 0,
      acceptable: os.acceptable || 0,
      degraded: os.degraded || 0,
      avgUptimeDays: os.avg_uptime_days || 0,
    }
    osCurrencyDist.value = osCurrency
    uptimeRiskDist.value = uptimeRisk

    // VPN
    const v = vpnSum[0] || {}
    vpn.value = {
      totalDevices: v.total_devices || 0,
      vpnActive: v.vpn_active || 0,
      directConnected: v.direct_connected || 0,
      disconnected: v.disconnected || 0,
    }
    vpnConfDist.value = vpnConf

    // Process landscape
    processClassData.value = procClass
    const classMap = {}
    for (const c of procClass) classMap[c.process_class] = c.unique_processes || 0
    processClassTotals.value = {
      uniqueProcesses: procClass.reduce((s, c) => s + (Number(c.unique_processes) || 0), 0),
      userApps: classMap['user_app'] || 0,
      mgmtAgents: classMap['mgmt_agent'] || 0,
      system: classMap['system'] || 0,
    }
    mgmtAgents.value = procAgents

    // Adoption
    const ad = adoptSum[0] || {}
    adoption.value = {
      totalDevices: ad.total_devices || 0,
      uniqueApps: ad.unique_apps || 0,
      activeWeek: (Number(ad.active_today) || 0) + (Number(ad.active_week) || 0),
      stale90Plus: ad.stale_90d_plus || 0,
    }
    adoptionTierDist.value = adoptTiers
    topStaleApps.value = adoptStale

    // Crashes
    const cr = crashSum[0] || {}
    const topCr = crashTop[0] || {}
    crashes.value = {
      devicesWithCrashes: cr.devices_with_crashes || 0,
      totalCrashes: cr.total_crashes_7d || 0,
      critical: cr.critical_devices || 0,
      topCrasher: topCr.crashed_identifier || '—',
    }
  } catch (e) {
    error.value = e.message
  } finally {
    Object.keys(loading.value).forEach(k => loading.value[k] = false)
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
.error-banner { background: var(--fleet-white); color: var(--fleet-error); padding: 12px 16px; border-radius: var(--radius); border: 1px solid var(--fleet-black-10); border-left: 3px solid var(--fleet-error); margin-bottom: 24px; }
.section { margin-bottom: 32px; }
.metrics-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 24px; }
.metrics-row.four-col { grid-template-columns: repeat(4, 1fr); }
.metrics-row.three-col { grid-template-columns: repeat(3, 1fr); }
.charts-row { margin-bottom: 24px; }
.charts-row.two-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
.section-header-with-caption { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
.section-header-with-caption h2 { margin: 0; }
.section-caption { font-size: var(--font-size-xs); color: var(--fleet-black-50); font-style: italic; }

/* Clickable metric-card wrapper. Wraps around <MetricCard> to add interactivity
   without touching the base component. */
.clickable-wrap { cursor: pointer; border-radius: var(--radius); transition: box-shadow 150ms ease, transform 150ms ease; outline: none; }
.clickable-wrap:hover { box-shadow: 0 0 0 2px #c7d2fe; }
.clickable-wrap:focus-visible { box-shadow: 0 0 0 2px #4a90d9; }
.clickable-wrap.active { box-shadow: 0 0 0 2px #4a90d9; }
.clickable-wrap > :first-child { border-color: transparent; }

/* Drill-down panel — highlighted context using Fleet's vibrant-blue tint
   (same accent used for signal badges / methodology boxes elsewhere). */
.drill-section { background: rgba(106, 103, 254, 0.06); border: 1px solid rgba(106, 103, 254, 0.2); border-left: 3px solid var(--fleet-vibrant-blue); border-radius: var(--radius); padding: 20px 24px; margin-top: -8px; margin-bottom: 24px; }
.drill-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.drill-header h3 { color: var(--fleet-black); font-size: var(--font-size-sm); font-weight: 600; margin: 0; }
.drill-count { color: var(--fleet-black-50); font-weight: 400; margin-left: 4px; }
.drill-close { background: var(--fleet-white); border: 1px solid rgba(106, 103, 254, 0.25); color: var(--fleet-vibrant-blue); border-radius: var(--radius); width: 28px; height: 28px; cursor: pointer; font-size: 14px; transition: all 150ms ease; }
.drill-close:hover { background: rgba(106, 103, 254, 0.1); border-color: var(--fleet-vibrant-blue); }
.drill-loading, .drill-empty { color: var(--fleet-black-50); font-size: var(--font-size-sm); padding: 24px 0; text-align: center; }

.host-tile-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
@media (max-width: 1024px) { .host-tile-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .host-tile-grid { grid-template-columns: 1fr; } }
@media (max-width: 1024px) { .metrics-row.four-col { grid-template-columns: repeat(2, 1fr); } .metrics-row.three-col { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .metrics-row, .metrics-row.four-col, .metrics-row.three-col { grid-template-columns: 1fr; } .charts-row.two-col { grid-template-columns: 1fr; } .dashboard-header { flex-direction: column; gap: 8px; } }
</style>
