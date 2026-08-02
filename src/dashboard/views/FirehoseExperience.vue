<template>
  <div class="dashboard page-stack">
    <PageHeader title="Firehose experience" subtitle="Fleet health overview from osquery result logs" />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ═══ FLEET OVERVIEW ═══════════════════════════════════ -->
    <section class="section">
      <SectionHeader title="Fleet overview" />
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
      <SectionHeader title="Host health" />
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

    <!-- Drill-down for Device Health — renders here when a DH card was clicked -->
    <DrillPanel v-if="drillCondition && drillAnchor === 'device_health'" :title="drillPanelTitle" @close="closeDrill">
      <div v-if="drillLoading" class="drill-loading">Loading hosts...</div>
      <EmptyState v-else-if="!drillHosts.length" small title="No hosts match this condition right now." />
      <div v-else class="host-tile-grid">
        <HostTile v-for="h in drillHosts" :key="h.host_id" :host="h" :condition="drillCondition" />
      </div>
    </DrillPanel>

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
        <ChartCard title="RAM distribution" :loading="loading.hardware" :empty="!ramTiers.length">
          <BarList :data="ramTiers" nameKey="ram_tier" valueKey="device_count" :humanize="false" />
        </ChartCard>
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
        <ChartCard title="Battery health" :loading="loading.deviceHealth" :empty="!batteryDist.length">
          <DistributionStrip :data="batteryDist" nameKey="battery_health_score" valueKey="device_count"
            :order="BATTERY_ORDER" :tones="BATTERY_TONES" />
        </ChartCard>
      </section>
    </div>

    <!-- ═══ 2. OS HEALTH ═════════════════════════════════════ -->
    <section class="section">
      <SectionHeader title="OS health" />
      <div class="metrics-row four-col">
        <div class="clickable-wrap" :class="{ active: drillCondition === 'healthy_os' }" @click="toggleDrill('healthy_os')" role="button" tabindex="0">
          <MetricCard label="Healthy" :value="osHealth.healthy" :loading="loading.osHealth" />
        </div>
        <div class="clickable-wrap" :class="{ active: drillCondition === 'acceptable_os' }" @click="toggleDrill('acceptable_os')" role="button" tabindex="0">
          <MetricCard label="Acceptable" :value="osHealth.acceptable" :loading="loading.osHealth" />
        </div>
        <div class="clickable-wrap" :class="{ active: drillCondition === 'degraded_os' }" @click="toggleDrill('degraded_os')" role="button" tabindex="0">
          <MetricCard label="Degraded" :value="osHealth.degraded" :loading="loading.osHealth" />
        </div>
        <MetricCard label="Avg uptime" :value="osHealth.avgUptimeDays" unit="days" :loading="loading.osHealth" />
      </div>
    </section>

    <!-- Drill-down for OS health -->
    <DrillPanel v-if="drillCondition && drillAnchor === 'os'" :title="drillPanelTitle" @close="closeDrill">
      <div v-if="drillLoading" class="drill-loading">Loading hosts...</div>
      <EmptyState v-else-if="!drillHosts.length" small title="No hosts match this condition right now." />
      <div v-else class="host-tile-grid">
        <HostTile v-for="h in drillHosts" :key="h.host_id" :host="h" :condition="drillCondition" />
      </div>
    </DrillPanel>

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
      <SectionHeader
        title="Application memory usage"
        :caption="overview.appSamples ? `Based on ${overview.appSamples.toLocaleString()} app samples across ${overview.appHosts} hosts` : ''"
      />
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
      <SectionHeader title="App adoption" />
      <div class="metrics-row four-col">
        <MetricCard label="Hosts" :value="adoption.totalDevices" :loading="loading.adoption" />
        <MetricCard label="Unique apps" :value="adoption.uniqueApps" :loading="loading.adoption" />
        <MetricCard label="Active this week" :value="adoption.activeWeek" :loading="loading.adoption" />
        <MetricCard label="Stale 90d+" :value="adoption.stale90Plus" :loading="loading.adoption" />
      </div>
    </section>

    <div class="charts-row two-col">
      <section class="section">
        <ChartCard title="Usage tiers" :loading="loading.adoption" :empty="!adoptionTierDist.length">
          <DistributionStrip :data="adoptionTierDist" nameKey="usage_tier" valueKey="app_count"
            :order="USAGE_ORDER" :tones="USAGE_TONES" />
        </ChartCard>
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
      <SectionHeader title="Crash overview" />
      <div class="metrics-row four-col">
        <div class="clickable-wrap" :class="{ active: drillCondition === 'has_crashes' }" @click="toggleDrill('has_crashes')" role="button" tabindex="0">
          <MetricCard label="Hosts w/ crashes" :value="crashes.devicesWithCrashes" :loading="loading.crashes" />
        </div>
        <MetricCard label="Total crashes (7d)" :value="crashes.totalCrashes" :loading="loading.crashes" />
        <MetricCard label="Critical" :value="crashes.critical" :loading="loading.crashes" />
        <MetricCard label="Top crasher" :value="crashes.topCrasher" :loading="loading.crashes" />
      </div>
    </section>

    <!-- Drill-down for Crashes -->
    <DrillPanel v-if="drillCondition && drillAnchor === 'crashes'" :title="drillPanelTitle" @close="closeDrill">
      <div v-if="drillLoading" class="drill-loading">Loading hosts...</div>
      <EmptyState v-else-if="!drillHosts.length" small title="No hosts match this condition right now." />
      <div v-else class="host-tile-grid">
        <HostTile v-for="h in drillHosts" :key="h.host_id" :host="h" :condition="drillCondition" />
      </div>
    </DrillPanel>

    <!-- ═══ TOP MOVERS — MTTP per app over the selected window ═══ -->
    <section class="section" v-if="topPatchMovers.length">
      <SectionHeader
        title="Top patch movers"
        :caption="`Mean time to patch per app over the last ${topPatchMoversWindowDays}d · ${topPatchMovers.length} apps · sorted by hosts patched`"
      />
      <MttpTable :rows="topPatchMovers" :sla-days="config.patchSlaDays" />
    </section>

    <!-- ═══ 4. NETWORK (Wi-Fi + VPN) ═════════════════════════ -->
    <section class="section">
      <SectionHeader
        title="Network health"
        :caption="overview.wifiSamples ? `Based on ${overview.wifiSamples.toLocaleString()} samples across ${overview.wifiHosts} hosts` : ''"
      />
      <div class="metrics-row three-col">
        <MetricCard label="Avg RSSI" :value="wifi.avgRssi" unit="dBm" :loading="loading.wifi" />
        <MetricCard label="Avg SNR" :value="wifi.avgSnr" unit="dB" :loading="loading.wifi" />
        <MetricCard label="Avg Tx Rate" :value="wifi.avgTxRate" unit="Mbps" :loading="loading.wifi" />
      </div>
    </section>

    <div class="charts-row two-col">
      <section class="section">
        <ChartCard title="Wi-Fi signal quality" :loading="loading.wifi" :empty="!wifiDistribution.length">
          <DistributionStrip :data="wifiDistribution" nameKey="signal_quality" valueKey="cnt"
            :order="SIGNAL_ORDER" :tones="SIGNAL_TONES" />
        </ChartCard>
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
        :color="palette.info"
      />
    </section>

    <section class="section">
      <SectionHeader title="VPN &amp; connectivity" />
      <div class="metrics-row four-col">
        <MetricCard label="Total hosts" :value="vpn.totalDevices" :loading="loading.vpn" />
        <MetricCard label="VPN active" :value="vpn.vpnActive" :loading="loading.vpn" />
        <MetricCard label="Direct" :value="vpn.directConnected" :loading="loading.vpn" />
        <div class="clickable-wrap" :class="{ active: drillCondition === 'vpn_disconnected' }" @click="toggleDrill('vpn_disconnected')" role="button" tabindex="0">
          <MetricCard label="Disconnected" :value="vpn.disconnected" :loading="loading.vpn" />
        </div>
      </div>
    </section>

    <!-- Drill-down for VPN -->
    <DrillPanel v-if="drillCondition && drillAnchor === 'vpn'" :title="drillPanelTitle" @close="closeDrill">
      <div v-if="drillLoading" class="drill-loading">Loading hosts...</div>
      <EmptyState v-else-if="!drillHosts.length" small title="No hosts match this condition right now." />
      <div v-else class="host-tile-grid">
        <HostTile v-for="h in drillHosts" :key="h.host_id" :host="h" :condition="drillCondition" />
      </div>
    </DrillPanel>

    <div class="charts-row">
      <section class="section">
        <ChartCard title="Network path" :loading="loading.vpn" :empty="!vpnConfDist.length">
          <DistributionStrip :data="vpnConfDist" nameKey="network_confidence" valueKey="device_count"
            :order="NETWORK_ORDER" :tones="NETWORK_TONES" />
        </ChartCard>
      </section>
    </div>

    <!-- ═══ 5. USERS / AGENT DIAGNOSTICS ═════════════════════ -->
    <section class="section">
      <SectionHeader title="Fleet agent health" />
      <div class="metrics-row four-col">
        <MetricCard label="Total hosts" :value="fleetd.totalHosts" :loading="loading.fleetd" />
        <MetricCard label="Enrolled" :value="fleetd.enrolledHosts" :loading="loading.fleetd" />
        <MetricCard label="Versions" :value="fleetd.uniqueVersions" :loading="loading.fleetd" />
        <MetricCard label="Avg uptime" :value="fleetd.avgUptimeHours" unit="hrs" :loading="loading.fleetd" />
      </div>
    </section>

    <div class="charts-row">
      <section class="section">
        <ChartCard title="Uptime distribution" :loading="loading.uptime" :empty="!uptimeDist.length">
          <DistributionStrip :data="uptimeDist" nameKey="uptime_bucket" valueKey="device_count"
            :order="UPTIME_ORDER" :tones="UPTIME_TONES" />
        </ChartCard>
      </section>
    </div>

    <section class="section">
      <SectionHeader title="Process landscape" />
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
import { ref, computed, onMounted, watch } from 'vue'
import { query } from '../services/api'
import { useFleetFilter } from '../composables/useFleetFilter'
import MetricCard from '../components/MetricCard.vue'
import TimeSeriesChart from '../components/TimeSeriesChart.vue'
import BarChart from '../components/BarChart.vue'
import ChartCard from '../components/base/ChartCard.vue'
import DistributionStrip from '../components/base/DistributionStrip.vue'
import BarList from '../components/base/BarList.vue'
import HostTile from '../components/HostTile.vue'
import MttpTable from '../components/MttpTable.vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import DrillPanel from '../components/base/DrillPanel.vue'
import EmptyState from '../components/base/EmptyState.vue'
import { palette } from '../composables/uiPalette'
import { displayHost } from '../composables/displayName'
import { useAppConfig } from '../composables/useAppConfig'

const SIGNAL_ORDER = ['excellent', 'good', 'fair', 'weak', 'poor', 'very_weak', 'unknown']
const SIGNAL_TONES = { excellent: 'good', good: 'soft', fair: 'fair', weak: 'elevated', poor: 'critical', very_weak: 'critical', unknown: 'neutral' }
const NETWORK_ORDER = ['direct_connected', 'tunnel_active', 'vpn_active', 'proxy_suspected', 'disconnected', 'unknown']
const NETWORK_TONES = { direct_connected: 'good', tunnel_active: 'info', vpn_active: 'info', proxy_suspected: 'fair', disconnected: 'critical', unknown: 'neutral' }
const BATTERY_ORDER = ['good', 'degraded', 'replace']
const BATTERY_TONES = { good: 'good', degraded: 'fair', replace: 'critical' }
const USAGE_ORDER = ['active_today', 'active_week', 'stale_30d', 'stale_90d', 'stale_90d_plus', 'never_opened']
const USAGE_TONES = { active_today: 'good', active_week: 'soft', stale_30d: 'fair', stale_90d: 'elevated', stale_90d_plus: 'elevated', never_opened: 'critical' }
// firehose.fleetd.uptime buckets (recently rebooted -> long-running)
const UPTIME_ORDER = ['< 1h', '1h - 1d', '1d - 7d', '7d - 30d', '30d+']
const UPTIME_TONES = { '< 1h': 'good', '1h - 1d': 'good', '1d - 7d': 'soft', '7d - 30d': 'fair', '30d+': 'elevated' }

const { config } = useAppConfig()

// Shared filter bar — propagates to every firehose query that respects
// FILTER_PARAMS. Wrap this in a computed so queries re-fetch when the user
// changes the filter.
const { filterParams } = useFleetFilter()
const queryParams = computed(() => ({ ...filterParams.value }))

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

// ─── Drill-down state (clickable metric cards across sections) ──────
// Clicking a metric like "Degraded battery: 3" expands an inline tile grid
// of the matching hosts. Condition enum matches the SQL in hosts_by_condition.
// `drillAnchor` drives WHICH section renders the tile panel, so tiles always
// appear right below the card that was clicked.
const drillCondition = ref(null)
const drillAnchor = ref(null)
const drillHosts = ref([])
const drillLoading = ref(false)

const DRILL_TITLES = {
  severe_swap: 'Severe swap pressure',
  elevated_swap: 'Elevated swap pressure',
  degraded_battery: 'Degraded battery',
  replace_battery: 'Battery needs replacement',
  high_compression: 'High compression pressure',
  healthy_os: 'Healthy OS',
  acceptable_os: 'Acceptable OS',
  degraded_os: 'Degraded OS',
  uptime_risk_stale: 'Stale uptime (≥7d)',
  vpn_disconnected: 'Disconnected from network',
  has_crashes: 'Hosts with crashes (7d)',
}

// Maps each condition to the section that renders its drill panel.
const DRILL_ANCHORS = {
  severe_swap: 'device_health',
  elevated_swap: 'device_health',
  degraded_battery: 'device_health',
  replace_battery: 'device_health',
  high_compression: 'device_health',
  healthy_os: 'os',
  acceptable_os: 'os',
  degraded_os: 'os',
  uptime_risk_stale: 'os',
  vpn_disconnected: 'vpn',
  has_crashes: 'crashes',
}

const drillTitle = computed(() => DRILL_TITLES[drillCondition.value] || '')
const drillPanelTitle = computed(() =>
  `${drillTitle.value} · ${drillHosts.value.length} host${drillHosts.value.length === 1 ? '' : 's'}`
)

function closeDrill() {
  drillCondition.value = null
  drillAnchor.value = null
  drillHosts.value = []
}

async function toggleDrill(condition) {
  // Click same card again → close
  if (drillCondition.value === condition) {
    closeDrill()
    return
  }
  drillCondition.value = condition
  drillAnchor.value = DRILL_ANCHORS[condition] || 'device_health'
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
      // The 7 summary/overview queries respect the fleet filter bar; others
      // still return fleet-wide data for now (see Phase 2 follow-up).
      query('firehose.devices.overview', queryParams.value),
      query('firehose.wifi.summary'),
      query('firehose.wifi.quality_distribution'),
      query('firehose.wifi.quality', { limit: 10 }),
      query('firehose.wifi.timeseries'),
      query('firehose.apps.fleet_summary'),
      query('firehose.apps.top', { limit: 10 }),
      query('firehose.apps.memory_hogs', { limit: 10 }),
      query('firehose.hardware.memory_tiers'),
      query('firehose.fleetd.summary', queryParams.value),
      query('firehose.fleetd.uptime'),
      query('firehose.health.device_summary', queryParams.value),
      query('firehose.health.cpu_distribution'),
      query('firehose.health.swap_distribution'),
      query('firehose.health.battery_overview'),
      query('firehose.health.os_summary', queryParams.value),
      query('firehose.health.os_currency_distribution'),
      query('firehose.health.uptime_distribution'),
      query('firehose.vpn.summary', queryParams.value),
      query('firehose.vpn.confidence_distribution'),
      query('firehose.processes.by_class'),
      query('firehose.processes.mgmt_agents'),
      query('firehose.adoption.summary', queryParams.value),
      query('firehose.adoption.tier_distribution'),
      query('firehose.adoption.stale_apps', { limit: 10 }),
      query('firehose.crashes.summary', queryParams.value),
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
      hostname: displayHost(d),
      abs_rssi: Math.abs(Number(d.rssi)),
    }))
    wifiTimeseries.value = wTs

    const as = appSummary[0] || {}
    apps.value = { uniqueApps: as.unique_apps || 0, avgMemory: as.avg_app_memory_mb || 0, p95Memory: as.p95_memory_mb || 0 }
    topApps.value = appTop
    memoryHogs.value = hogs.map(h => ({ ...h, label: `${h.app_name} (${displayHost(h)})` }))

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

// Top patch movers — MTTP aggregate from dex_patch_events on ALT.
// Pulls the same scores.timeline_patches_summary feeding the /timeline page,
// collapsed across the window so each (software_name) shows up once with
// summed hosts, mean lag, range and distinct-lag count.
const topPatchMoversWindowDays = 7
const topPatchMovers = ref([])

async function fetchTopPatchMovers() {
  try {
    const end = new Date()
    const start = new Date(end.getTime() - topPatchMoversWindowDays * 24 * 3600 * 1000)
    const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ')
    const rows = await query('scores.timeline_patches_summary', {
      startDate: fmt(start), endDate: fmt(end), minHosts: 1,
    })
    // Collapse per-day rows into per-software rows for the table.
    const bySw = new Map()
    for (const r of (rows || [])) {
      const k = r.software_name
      if (!bySw.has(k)) {
        bySw.set(k, {
          software_name: k,
          hosts: 0,
          weightedLagSum: 0,
          min_lag: Number(r.min_lag),
          max_lag: Number(r.max_lag),
          distinctSet: new Set(),
        })
      }
      const agg = bySw.get(k)
      const hosts = Number(r.hosts || 0)
      agg.hosts += hosts
      agg.weightedLagSum += hosts * Number(r.avg_lag || 0)
      agg.min_lag = Math.min(agg.min_lag, Number(r.min_lag))
      agg.max_lag = Math.max(agg.max_lag, Number(r.max_lag))
      agg.distinctSet.add(Number(r.distinct_lags || 0))
    }
    topPatchMovers.value = Array.from(bySw.values())
      .map(a => ({
        software_name: a.software_name,
        hosts: a.hosts,
        avg_lag: a.hosts > 0 ? +(a.weightedLagSum / a.hosts).toFixed(2) : 0,
        min_lag: +a.min_lag.toFixed(2),
        max_lag: +a.max_lag.toFixed(2),
        // For collapsed rows, use the max single-day distinct count as a proxy —
        // a true distinct count across days would need a server-side rewrite.
        distinct_lags: Math.max(...a.distinctSet, 0) || 0,
      }))
      .sort((a, b) => b.hosts - a.hosts)
      .slice(0, 12)
  } catch (e) {
    topPatchMovers.value = []
  }
}

onMounted(() => { fetchAll(); fetchTopPatchMovers() })

// Re-fetch when the fleet filter bar changes. Any open drill-down is
// invalidated (its host list may no longer be in scope) so close it too.
watch(filterParams, () => {
  closeDrill()
  fetchAll()
}, { deep: true })
</script>

<style scoped>
.dashboard { max-width: 1280px; margin: 0 auto; padding: var(--pad-xlarge); }

/* Sections stack their own blocks; the page-stack global handles inter-section gaps */
.section {
  display: flex;
  flex-direction: column;
  gap: var(--pad-medium);
}

/* Clickable metric-card wrapper. Wraps around <MetricCard> to add interactivity
   without touching the base component. */
.clickable-wrap { cursor: pointer; border-radius: var(--radius); transition: box-shadow var(--transition-base); outline: none; }
.clickable-wrap:hover { box-shadow: 0 0 0 2px var(--fleet-black-25); }
.clickable-wrap:focus-visible { box-shadow: 0 0 0 2px var(--fleet-focused-outline); }
.clickable-wrap.active { box-shadow: 0 0 0 2px var(--fleet-black-75); }
.clickable-wrap > :first-child { border-color: transparent; }

.drill-loading { color: var(--fleet-black-50); font-size: var(--font-size-sm); padding: 24px 0; text-align: center; }

.host-tile-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
@media (max-width: 1024px) { .host-tile-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .host-tile-grid { grid-template-columns: 1fr; } }
</style>
