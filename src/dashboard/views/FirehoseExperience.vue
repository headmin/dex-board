<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>Firehose experience</h1>
      <span class="subtitle">Fleet health overview from osquery result logs</span>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Fleet Overview Metrics -->
    <section class="section">
      <h2>Fleet overview</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Total devices" :value="overview.totalDevices" :loading="loading.overview" />
        <MetricCard label="Wi-Fi hosts" :value="overview.wifiHosts" :loading="loading.overview" />
        <MetricCard label="App hosts" :value="overview.appHosts" :loading="loading.overview" />
        <MetricCard label="Unique apps" :value="overview.uniqueApps" :loading="loading.overview" />
      </div>
    </section>

    <!-- Wi-Fi Health -->
    <section class="section">
      <h2>Network health</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Avg RSSI" :value="wifi.avgRssi" unit="dBm" :loading="loading.wifi" />
        <MetricCard label="Avg SNR" :value="wifi.avgSnr" unit="dB" :loading="loading.wifi" />
        <MetricCard label="Avg Tx Rate" :value="wifi.avgTxRate" unit="Mbps" :loading="loading.wifi" />
        <MetricCard label="Samples" :value="overview.wifiSamples" :loading="loading.overview" />
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
        <PieChart
          title="RAM distribution"
          :data="ramTiers"
          :loading="loading.hardware"
          nameKey="ram_tier"
          valueKey="device_count"
        />
      </section>
    </div>

    <!-- Wi-Fi Timeseries -->
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

    <!-- Top Memory Hogs -->
    <section class="section">
      <h2>Application health</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Unique apps" :value="apps.uniqueApps" :loading="loading.apps" />
        <MetricCard label="Avg app memory" :value="apps.avgMemory" unit="MB" :loading="loading.apps" />
        <MetricCard label="P95 memory" :value="apps.p95Memory" unit="MB" :loading="loading.apps" />
        <MetricCard label="App samples" :value="overview.appSamples" :loading="loading.overview" />
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

    <!-- Fleetd Health -->
    <section class="section">
      <h2>Fleet agent health</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Total hosts" :value="fleetd.totalHosts" :loading="loading.fleetd" />
        <MetricCard label="Enrolled" :value="fleetd.enrolledHosts" :loading="loading.fleetd" />
        <MetricCard label="Versions" :value="fleetd.uniqueVersions" :loading="loading.fleetd" />
        <MetricCard label="Avg uptime" :value="fleetd.avgUptimeHours" unit="hrs" :loading="loading.fleetd" />
      </div>
    </section>

    <div class="charts-row two-col">
      <section class="section">
        <PieChart
          title="Uptime distribution"
          :data="uptimeDist"
          :loading="loading.uptime"
          nameKey="uptime_bucket"
          valueKey="device_count"
        />
      </section>
      <section class="section">
        <BarChart
          title="Weakest Wi-Fi devices"
          :data="worstWifi"
          :loading="loading.wifi"
          nameKey="hostname"
          valueKey="abs_rssi"
        />
      </section>
    </div>

    <!-- Device Health -->
    <section class="section">
      <h2>Device health</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Severe swap" :value="deviceHealth.severeSwap" :loading="loading.deviceHealth" />
        <MetricCard label="Elevated swap" :value="deviceHealth.elevatedSwap" :loading="loading.deviceHealth" />
        <MetricCard label="Degraded battery" :value="deviceHealth.degradedBattery" :loading="loading.deviceHealth" />
        <MetricCard label="Avg battery" :value="deviceHealth.avgBatteryPct" unit="%" :loading="loading.deviceHealth" />
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
        <BarChart
          title="Swap pressure"
          :data="swapDistribution"
          :loading="loading.deviceHealth"
          nameKey="swap_pressure"
          valueKey="device_count"
          :horizontal="true"
        />
      </section>
    </div>

    <!-- OS Health -->
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

    <!-- Network Confidence (VPN) -->
    <section class="section">
      <h2>Network confidence</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Total devices" :value="vpn.totalDevices" :loading="loading.vpn" />
        <MetricCard label="VPN active" :value="vpn.vpnActive" :loading="loading.vpn" />
        <MetricCard label="Direct" :value="vpn.directConnected" :loading="loading.vpn" />
        <MetricCard label="Disconnected" :value="vpn.disconnected" :loading="loading.vpn" />
      </div>
    </section>

    <div class="charts-row two-col">
      <section class="section">
        <PieChart
          title="Network path"
          :data="vpnConfDist"
          :loading="loading.vpn"
          nameKey="network_confidence"
          valueKey="device_count"
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

    <!-- Process Landscape -->
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

    <!-- App Adoption -->
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

    <!-- Crashes -->
    <section class="section" v-if="crashes.totalCrashes > 0">
      <h2>Crash overview</h2>
      <div class="metrics-row four-col">
        <MetricCard label="Devices w/ crashes" :value="crashes.devicesWithCrashes" :loading="loading.crashes" />
        <MetricCard label="Total crashes (7d)" :value="crashes.totalCrashes" :loading="loading.crashes" />
        <MetricCard label="Critical" :value="crashes.critical" :loading="loading.crashes" />
        <MetricCard label="Top crasher" :value="crashes.topCrasher" :loading="loading.crashes" />
      </div>
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
.charts-row.two-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 24px; }
@media (max-width: 1024px) { .metrics-row.four-col { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .metrics-row, .metrics-row.four-col { grid-template-columns: 1fr; } .charts-row.two-col { grid-template-columns: 1fr; } .dashboard-header { flex-direction: column; gap: 8px; } }
</style>
