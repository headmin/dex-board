<template>
  <div class="dashboard page-stack">
    <PageHeader title="Analytics" subtitle="The raw data behind the scores — browse it domain by domain" />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- ─── Answer — constant hero, content follows the tab ──── -->
    <section class="an-hero">
      <div class="hero-block">
        <span class="hero-eyebrow">{{ heroView.eyebrow }}</span>
        <div class="hero-count-row">
          <span class="hero-count">{{ heroView.count ?? '—' }}</span>
          <span class="hero-count-of">{{ heroView.countOf }}</span>
        </div>
        <span v-if="heroView.chip" class="hero-chip">{{ heroView.chip }}</span>
      </div>
      <div class="hero-narrative">
        <p class="hero-headline">
          <template v-if="activeTab === 'overview'">
            <template v-if="coverage.flowing != null && coverage.flowing === coverage.total">
              <span class="hl-good">Every telemetry domain is populated</span> — the deep dives read from live data, not defaults.
            </template>
            <template v-else-if="coverage.flowing != null">
              {{ coverage.flowing }} of {{ coverage.total }} telemetry domains are populated<template v-if="coverage.emptyNames.length"> — <span class="hl-fair">{{ coverage.emptyNames.join(', ') }}</span> {{ coverage.emptyNames.length === 1 ? 'is' : 'are' }} empty, so those tabs show gaps, not zeros</template>.
            </template>
            <template v-else>Checking telemetry readiness…</template>
          </template>
          <template v-else>{{ heroView.headline || 'Loading this domain…' }}</template>
        </p>
        <p class="hero-support">{{ heroView.support }}</p>
      </div>
      <div class="hero-rail">
        <span class="hero-eyebrow">{{ heroView.railLabel }}</span>
        <div v-if="heroView.rail.length" class="hero-rail-list">
          <div v-for="r in heroView.rail" :key="r.label" class="hero-rail-row" :class="{ 'hero-rail-row--dim': r.dim }">
            <span class="hero-rail-label">{{ r.label }}</span>
            <span class="hero-rail-count">{{ r.value }}</span>
          </div>
        </div>
        <span v-else class="hero-rail-empty">—</span>
      </div>
    </section>

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

      <section v-if="daemons.length" class="section">
        <SectionHeader
          title="Background apps &amp; daemons"
          :caption="`System services, helpers, security agents — software nobody opened, so app-adoption never sees it · ${daemons.length} services`"
        />

        <!-- Layer 1: what this fleet of agents amounts to -->
        <div class="metrics-row four-col">
          <MetricCard label="Services" :value="daemons.length" :loading="loading.apps" subtitle="non-Apple, seen in the last 2 days" />
          <MetricCard label="Hosts reporting" :value="daemonReportingHosts" :loading="loading.apps" subtitle="coverage denominator" />
          <MetricCard label="Fleet RAM footprint" :value="daemonFleetRamGb" unit="GB" :loading="loading.apps" subtitle="p95 per instance × hosts — estimate" />
          <MetricCard label="Universal services" :value="universalDaemonCount" :loading="loading.apps" subtitle="on every reporting host" />
        </div>

        <!-- Layer 2: agents that are almost everywhere — the gap list -->
        <div v-if="daemonGaps.length" class="daemon-gaps">
          <div class="daemon-gaps-head">
            <h3>Almost universal — coverage gaps</h3>
            <span class="daemon-gaps-hint">On ≥80% of reporting hosts but not all — services meant to be everywhere tend to live here</span>
          </div>
          <div class="daemon-gap-rows">
            <div v-for="g in daemonGaps" :key="g.bundle_identifier" class="daemon-gap-row">
              <div class="daemon-gap-label">
                <span class="daemon-gap-name">{{ g.app_name }}</span>
                <span class="daemon-gap-bundle">{{ g.bundle_identifier }}</span>
              </div>
              <MeterBar :value="g.coverage_pct" semantics="none" :color="palette.good" height="10px" />
              <span class="daemon-gap-count">{{ g.hosts_running }}/{{ g.reporting_hosts }} · {{ g.missing }} missing</span>
            </div>
          </div>
        </div>

        <!-- Layer 3: per-service footprint, sortable -->
        <DataTable
          :data="daemonRows"
          :columns="daemonCols"
          :loading="loading.apps"
          density="compact"
          :maxRows="20"
          defaultSortKey="fleet_ram_mb"
          :defaultSortAsc="false"
        />
        <p class="daemon-footnote">
          Fleet RAM = p95 memory per instance × hosts running — a standing-footprint estimate, not a simultaneous
          measurement. Coverage denominator: {{ daemonReportingHosts ?? '—' }} hosts reporting process telemetry in the last 2 days.
        </p>
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
import { useRoute, useRouter } from 'vue-router'
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
import MeterBar from '../components/base/MeterBar.vue'
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
const route = useRoute()
const router = useRouter()
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
  { key: 'rssi', label: 'RSSI', type: 'number' },
  { key: 'snr', label: 'SNR', type: 'number' },
  { key: 'signal_quality', label: 'Quality' },
  { key: 'transmit_rate', label: 'Tx Rate', type: 'number' },
  { key: 'channel', label: 'Channel', type: 'number' },
  { key: 'security_type', label: 'Security' },
]

// ── Apps data ───────────────────────────────────────
const appSummary = ref({})
const topApps = ref([])
const peakApps = ref([])
const allApps = ref([])
const appCols = [
  { key: 'app_name', label: 'App' },
  { key: 'avg_memory_mb', label: 'Avg MB', type: 'number' },
  { key: 'max_memory_mb', label: 'Peak MB', type: 'number' },
  { key: 'avg_threads', label: 'Threads', type: 'number' },
  { key: 'device_count', label: 'Hosts', type: 'number' },
  { key: 'sample_count', label: 'Samples', type: 'number' },
]

// Background daemons/services — running_apps minus what adoption_gap covers
// (no last_opened_time, so app-adoption never sees them). Moved here from
// the GitOps timeline: it's inventory, not change history.
const daemons = ref([])
const daemonCols = [
  { key: 'app_name', label: 'Service' },
  { key: 'bundle_identifier', label: 'Bundle ID' },
  { key: 'path', label: 'Path' },
  { key: 'hosts_running', label: 'Hosts', type: 'number', align: 'right' },
  { key: 'coverage_pct', label: 'Coverage %', type: 'number', align: 'right' },
  { key: 'p95_memory_mb', label: 'RAM/inst (p95 MB)', type: 'number', align: 'right' },
  { key: 'fleet_ram_mb', label: 'Fleet RAM (MB)', type: 'number', align: 'right' },
]

// Rows enriched with the two derived numbers the table sorts on. Coverage
// uses the hosts-reporting-process-telemetry denominator the query returns;
// fleet RAM is p95-per-instance × hosts — an estimate, labeled as such.
const daemonRows = computed(() => daemons.value.map(d => {
  const reporting = Number(d.reporting_hosts) || 0
  const hosts = Number(d.hosts_running) || 0
  return {
    ...d,
    coverage_pct: reporting ? Math.round((hosts / reporting) * 100) : null,
    fleet_ram_mb: d.p95_memory_mb != null ? Math.round(Number(d.p95_memory_mb) * hosts) : null,
  }
}))

const daemonReportingHosts = computed(() => Number(daemons.value[0]?.reporting_hosts) || null)

const daemonFleetRamGb = computed(() => {
  const totalMb = daemonRows.value.reduce((s, d) => s + (d.fleet_ram_mb || 0), 0)
  return totalMb ? +(totalMb / 1024).toFixed(1) : null
})

const universalDaemonCount = computed(() =>
  daemonRows.value.filter(d => d.coverage_pct === 100).length
)

// Services on ≥80% but <100% of reporting hosts — probably meant to be
// universal. Never padded: hidden entirely when nothing qualifies.
const daemonGaps = computed(() => daemonRows.value
  .filter(d => d.coverage_pct != null && d.coverage_pct >= 80 && d.coverage_pct < 100)
  .map(d => ({ ...d, missing: (Number(d.reporting_hosts) || 0) - (Number(d.hosts_running) || 0) }))
  .sort((a, b) => b.coverage_pct - a.coverage_pct)
  .slice(0, 6))

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
  { key: 'cpu_logical_cores', label: 'Cores', type: 'number' },
  { key: 'hardware_model', label: 'Model' },
  { key: 'hardware_serial', label: 'Serial' },
  { key: 'memory_gb', label: 'RAM (GB)', type: 'number' },
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
  { key: 'battery_percent', label: 'Batt %', type: 'number' },
]
const osDeviceCols = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'os_version', label: 'Version' },
  { key: 'os_currency', label: 'Currency' },
  { key: 'uptime_days', label: 'Uptime (d)', type: 'number' },
  { key: 'uptime_risk', label: 'Risk' },
  { key: 'dex_os_health', label: 'Health' },
  { key: 'crashes_30d', label: 'Crashes', type: 'number' },
]

// ── VPN data ───────────────────────────────────────
const vpnSummary = ref({})
const vpnConfDist = ref([])
const vpnDevices = ref([])
const vpnCols = [
  { key: 'hostname', label: 'Hostname' },
  { key: 'vpn_tunnels_active', label: 'Tunnels', type: 'number' },
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
  { key: 'total_crashes_7d', label: 'Crashes (7d)', type: 'number' },
  { key: 'affected_devices', label: 'Hosts', type: 'number' },
  { key: 'worst_severity', label: 'Severity' },
  { key: 'last_crash', label: 'Last crash', type: 'datetime' },
]

// ── Adoption data ──────────────────────────────────
const adoptionSummary = ref({})
const adoptionTierDist = ref([])
const staleApps = ref([])
const adoptionCols = [
  { key: 'app_name', label: 'App' },
  { key: 'bundle_identifier', label: 'Bundle ID' },
  { key: 'avg_days_stale', label: 'Avg days stale', type: 'number' },
  { key: 'installed_on', label: 'Installed on', type: 'number' },
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
      const [s, top, peak, all, daemonData] = await Promise.all([
        query('firehose.apps.fleet_summary', { ...fp() }),
        query('firehose.apps.top', { limit: 10, ...fp() }),
        query('firehose.apps.memory_hogs', { limit: 10, ...fp() }),
        query('firehose.apps.top', { limit: 100, ...fp() }),
        query('firehose.apps.daemon_inventory', { limit: 60, minHosts: 2 }).catch(() => []),
      ])
      appSummary.value = s[0] || {}
      topApps.value = top
      peakApps.value = peak.map(h => ({ ...h, label: `${h.app_name} (${displayHost(h)})` }))
      allApps.value = all
      daemons.value = daemonData || []
      loading.value.apps = false
    }
    else if (tab === 'hardware') {
      loading.value.hw = true
      const [summary, tiers, models, inv] = await Promise.all([
        query('firehose.hardware.summary', { ...fp() }),
        query('firehose.hardware.memory_tiers', { ...fp() }),
        query('firehose.hardware.model_distribution', { ...fp() }),
        query('firehose.hardware.inventory', { limit: 200, ...fp() }),
      ])
      ramTiers.value = tiers
      hwInventory.value = withDisplayHost(inv)
      // Tiles come from the server-side aggregate — the inventory list is
      // capped at 200 rows and must never be the basis for fleet math.
      const hs = summary[0] || {}
      hwDeviceCount.value = Number(hs.device_count) || 0
      hwAvgRam.value = Number(hs.avg_memory_gb) || 0
      hwAvgCores.value = Number(hs.avg_logical_cores) || 0
      modelDist.value = models.map(m => ({ ...m, hardware_model: m.hardware_model || 'Unknown' }))
      hwModelCount.value = Number(hs.model_count) || 0

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
      // Query returns one row per (orbit, osquery, desktop) version triple —
      // collapse to orbit_version for the bar chart so names stay unique.
      const vc = {}
      for (const v of ver) {
        const key = v.orbit_version || 'unknown'
        vc[key] = (vc[key] || 0) + Number(v.device_count || 0)
      }
      versionDist.value = Object.entries(vc)
        .map(([orbit_version, device_count]) => ({ orbit_version, device_count }))
        .sort((a, b) => b.device_count - a.device_count)
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

// ─── Coverage hero: readiness (flowing domains) + per-domain host
// coverage. Row counts are deliberately NOT shown — sampling frequency
// makes them meaningless as a coverage signal (process health logs
// millions of rows regardless of how many hosts it sees).
const coverage = ref({ flowing: null, total: null, hosts: null, emptyNames: [], domains: [] })

function humanizeTable(t) {
  return String(t).replace(/_/g, ' ')
}

async function fetchCoverage() {
  try {
    const [ready, ov] = await Promise.all([
      query('firehose.scores.readiness').catch(() => []),
      query('firehose.devices.overview').catch(() => []),
    ])
    const rows = (ready || []).map(r => ({ name: humanizeTable(r.tbl), rows: Number(r.row_count) || 0 }))
    const o = (ov || [])[0] || {}
    const fleetMax = Math.max(Number(o.wifi_hosts) || 0, Number(o.app_hosts) || 0, Number(o.hw_hosts) || 0, Number(o.fleetd_hosts) || 0)
    const domains = [
      { name: 'Fleet agent', hosts: Number(o.fleetd_hosts) || 0 },
      { name: 'Hardware', hosts: Number(o.hw_hosts) || 0 },
      { name: 'Apps', hosts: Number(o.app_hosts) || 0 },
      { name: 'Wi-Fi', hosts: Number(o.wifi_hosts) || 0 },
    ]
      .filter(d => d.hosts > 0)
      .sort((a, b) => b.hosts - a.hosts)
      // Dim domains that see meaningfully fewer hosts than the fleet —
      // that gap IS the finding (e.g. desktops never report Wi-Fi).
      .map(d => ({ ...d, low: fleetMax > 0 && d.hosts < fleetMax * 0.9 }))
    coverage.value = {
      total: rows.length || null,
      flowing: rows.length ? rows.filter(r => r.rows > 0).length : null,
      hosts: fleetMax || null,
      emptyNames: rows.filter(r => r.rows === 0).map(r => r.name),
      domains,
    }
  } catch { /* hero degrades to em-dashes */ }
}

// ─── Tab-aware hero content — every number from the tab's own fetch ──
const num = (v) => (v == null || v === '' ? null : Number(v))

const heroView = computed(() => {
  const tab = activeTab.value
  if (tab === 'overview') {
    return {
      eyebrow: 'Telemetry coverage',
      count: coverage.value.flowing,
      countOf: `of ${coverage.value.total ?? '—'} domains flowing`,
      chip: coverage.value.hosts ? `${coverage.value.hosts} hosts reporting` : '',
      support: 'Coverage = row counts per source table (the SETUP §3.2a readiness check), scoped to the whole fleet.',
      railLabel: 'Hosts covered by domain',
      rail: coverage.value.domains.map(d => ({ label: d.name, value: d.hosts, dim: d.low })),
    }
  }
  if (tab === 'wifi') {
    const s = wifiSummary.value
    return {
      eyebrow: 'Hosts on Wi-Fi',
      count: num(s.unique_hosts),
      countOf: 'hosts sampled',
      chip: num(s.total_samples) ? `${num(s.total_samples).toLocaleString()} samples` : '',
      headline: num(s.avg_rssi) != null ? `The fleet's median air: ${s.avg_rssi} dBm RSSI at ${s.avg_snr} dB SNR — endpoint-side signal, the host's view of the network.` : '',
      support: 'Distribution and per-host readings below.',
      railLabel: 'Signal quality',
      rail: wifiDist.value.slice(0, 3).map(r => ({ label: String(r.signal_quality).replace(/_/g, ' '), value: r.cnt })),
    }
  }
  if (tab === 'apps') {
    const s = appSummary.value
    return {
      eyebrow: 'Unique apps',
      count: num(s.unique_apps),
      countOf: `across ${num(s.unique_hosts) ?? '—'} hosts`,
      chip: '',
      headline: num(s.avg_app_memory_mb) != null ? `Apps average ${s.avg_app_memory_mb} MB resident; the heaviest 5% run past ${s.p95_memory_mb} MB.` : '',
      support: 'Memory rankings, the full inventory, and background daemons below.',
      railLabel: 'Memory footprint',
      rail: [
        num(s.avg_app_memory_mb) != null && { label: 'Average per app', value: `${s.avg_app_memory_mb} MB` },
        num(s.p95_memory_mb) != null && { label: 'P95 per app', value: `${s.p95_memory_mb} MB` },
      ].filter(Boolean),
    }
  }
  if (tab === 'hardware') {
    return {
      eyebrow: 'Hosts inventoried',
      count: hwDeviceCount.value || null,
      countOf: `${hwModelCount.value || '—'} models`,
      chip: '',
      headline: hwDeviceCount.value ? `${hwDeviceCount.value} hosts inventoried across ${hwModelCount.value} hardware models — averaging ${hwAvgRam.value} GB of RAM and ${hwAvgCores.value} cores.` : '',
      support: 'RAM tiers, model distribution, and the full inventory below.',
      railLabel: 'Fleet averages',
      rail: [
        hwAvgRam.value && { label: 'RAM', value: `${hwAvgRam.value} GB` },
        hwAvgCores.value && { label: 'CPU cores', value: hwAvgCores.value },
      ].filter(Boolean),
    }
  }
  if (tab === 'fleetd') {
    const s = fleetdSummary.value
    return {
      eyebrow: 'Enrolled hosts',
      count: num(s.enrolled_hosts),
      countOf: `of ${num(s.total_hosts) ?? '—'} tracked`,
      chip: num(s.unique_versions) ? `${s.unique_versions} agent version${num(s.unique_versions) === 1 ? '' : 's'} in the field` : '',
      headline: num(s.enrolled_hosts) != null ? `${s.enrolled_hosts} hosts run the Fleet agent${num(s.unique_versions) > 1 ? ` on ${s.unique_versions} different versions — version drift is patch surface` : ''}.` : '',
      support: 'Uptime and version distributions below, plus hosts reporting agent errors.',
      railLabel: 'Agent health',
      rail: [
        num(s.avg_uptime_hours) != null && { label: 'Avg agent uptime', value: `${s.avg_uptime_hours} h` },
        fleetdErrors.value.length > 0 && { label: 'Hosts with errors', value: fleetdErrors.value.length, dim: false },
      ].filter(Boolean),
    }
  }
  if (tab === 'health') {
    const s = healthSummary.value
    const os = osSummary.value
    return {
      eyebrow: 'Hosts reporting health',
      count: num(s.total_devices),
      countOf: 'hosts',
      chip: num(s.avg_battery_pct) != null ? `avg battery ${s.avg_battery_pct}%` : '',
      headline: num(s.total_devices) ? `${s.severe_swap || 0} host${num(s.severe_swap) === 1 ? ' is' : 's are'} in severe swap and ${os.degraded || 0} run a degraded OS — the raw signals behind Device health and Security.` : '',
      support: 'Hardware health first, then OS health — each with its inventory table.',
      railLabel: 'Worst signals',
      rail: [
        num(s.severe_swap) != null && { label: 'Severe swap', value: s.severe_swap },
        num(s.degraded_battery) != null && { label: 'Degraded battery', value: s.degraded_battery },
        num(os.degraded) != null && { label: 'Degraded OS', value: os.degraded },
      ].filter(Boolean),
    }
  }
  if (tab === 'vpn') {
    const s = vpnSummary.value
    return {
      eyebrow: 'Hosts checked',
      count: num(s.total_devices),
      countOf: 'hosts',
      chip: '',
      headline: num(s.total_devices) ? `${s.vpn_active || 0} host${num(s.vpn_active) === 1 ? ' is' : 's are'} on a tunnel, ${s.direct_connected || 0} direct${num(s.disconnected) ? `, and ${s.disconnected} disconnected` : ''}.` : '',
      support: 'Network-path confidence per host below.',
      railLabel: 'Network path',
      rail: [
        num(s.vpn_active) != null && { label: 'Tunnel / VPN', value: s.vpn_active },
        num(s.direct_connected) != null && { label: 'Direct', value: s.direct_connected },
        num(s.disconnected) != null && { label: 'Disconnected', value: s.disconnected, dim: !num(s.disconnected) },
      ].filter(Boolean),
    }
  }
  if (tab === 'crashes') {
    const s = crashSummary.value
    return {
      eyebrow: 'Crashes · 7 days',
      count: num(s.total_crashes_7d),
      countOf: `${num(s.devices_with_crashes) ?? '—'} hosts affected`,
      chip: '',
      headline: num(s.total_crashes_7d) ? `${s.total_crashes_7d} crashes across ${s.devices_with_crashes} host${num(s.devices_with_crashes) === 1 ? '' : 's'} this week${num(s.critical_devices) ? ` — ${s.critical_devices} host${num(s.critical_devices) === 1 ? '' : 's'} at critical severity` : ''}.` : 'No crashes recorded this week.',
      support: 'Severity distribution and the top crashing identifiers below.',
      railLabel: 'Severity',
      rail: [
        num(s.critical_devices) != null && { label: 'Critical hosts', value: s.critical_devices },
        num(s.elevated_devices) != null && { label: 'Elevated hosts', value: s.elevated_devices },
      ].filter(Boolean),
    }
  }
  // adoption
  const s = adoptionSummary.value
  return {
    eyebrow: 'Apps tracked',
    count: num(s.unique_apps),
    countOf: `across ${num(s.total_devices) ?? '—'} hosts`,
    chip: '',
    headline: num(s.stale_90d_plus) ? `${s.stale_90d_plus} installs have not been opened in 90+ days — shelfware that still gets patched and paid for.` : (num(s.unique_apps) ? 'Usage tiers below separate daily drivers from shelfware.' : ''),
    support: 'Usage-tier distribution and the most-stale apps below.',
    railLabel: 'Usage',
    rail: [
      num(s.active_today) != null && { label: 'Active today', value: s.active_today },
      num(s.stale_90d_plus) != null && { label: 'Stale 90d+', value: s.stale_90d_plus },
    ].filter(Boolean),
  }
})

onMounted(() => {
  fetchedTabs.value.add('overview')
  fetchCoverage()
  // Deep-linkable tabs: /analytics?tab=apps opens on that tab.
  const wanted = String(route.query.tab || '')
  if (wanted && wanted !== 'overview' && tabs.some(t => t.id === wanted)) switchTab(wanted)
})

// Keep the URL in sync so the current tab survives reload/share.
watch(activeTab, (tab) => {
  const q = { ...route.query }
  if (tab === 'overview') delete q.tab
  else q.tab = tab
  router.replace({ query: q })
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

/* ─── Briefing hero ────────────────────────────── */
.an-hero {
  background: var(--fleet-black);
  border-radius: var(--radius-xlarge);
  padding: var(--pad-large) 32px;
  display: grid;
  grid-template-columns: 280px 1fr 300px;
  gap: 40px;
  align-items: center;
  color: var(--fleet-white);
}
.hero-eyebrow { font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black-50); letter-spacing: 0.4px; text-transform: uppercase; }
.hero-block { display: flex; flex-direction: column; gap: 8px; }
.hero-count-row { display: flex; align-items: baseline; gap: 12px; }
.hero-count { font-size: 48px; font-weight: 700; line-height: 0.9; }
.hero-count-of { font-size: 14px; color: var(--fleet-black-33); }
.hero-chip { display: inline-flex; align-self: flex-start; padding: 3px 9px; border-radius: var(--radius); background: rgba(255,255,255,0.1); color: var(--fleet-black-10); font-size: var(--font-size-sm); font-weight: 600; }
.hero-narrative { display: flex; flex-direction: column; gap: 10px; border-left: 1px solid var(--fleet-blue); padding-left: 40px; }
.hero-headline { margin: 0; font-size: 18px; font-weight: 600; line-height: 1.35; text-wrap: pretty; }
.hl-good { color: var(--status-good-soft); }
.hl-fair { color: var(--status-fair); }
.hero-support { margin: 0; font-size: var(--font-size-sm); line-height: 1.6; color: var(--fleet-black-33); text-wrap: pretty; }
.hero-rail { display: flex; flex-direction: column; gap: 10px; }
.hero-rail-list { display: flex; flex-direction: column; gap: 8px; }
.hero-rail-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 12px; background: rgba(255,255,255,0.06); border-radius: var(--radius-medium); font-size: var(--font-size-base); }
.hero-rail-row--dim { opacity: 0.6; }
.hero-rail-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hero-rail-count { font-family: var(--font-mono); font-weight: 700; }
.hero-rail-empty { font-size: var(--font-size-sm); color: var(--fleet-black-50); font-style: italic; }

/* ─── Background apps & daemons — footprint & coverage ── */
.daemon-gaps {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.daemon-gaps-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.daemon-gaps-head h3 { margin: 0; font-size: var(--font-size-md); font-weight: 700; color: var(--fleet-black); }
.daemon-gaps-hint { font-size: var(--font-size-sm); color: var(--fleet-black-50); text-align: right; }
.daemon-gap-rows { display: flex; flex-direction: column; gap: 11px; }
.daemon-gap-row {
  display: grid;
  grid-template-columns: 260px 1fr 150px;
  align-items: center;
  gap: 14px;
}
.daemon-gap-label { display: flex; flex-direction: column; min-width: 0; }
.daemon-gap-name { font-size: var(--font-size-base); font-weight: 600; color: var(--fleet-black); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.daemon-gap-bundle { font-family: var(--font-mono); font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.daemon-gap-count { font-family: var(--font-mono); font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black-75); text-align: right; }
.daemon-footnote {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  text-wrap: pretty;
}
@media (max-width: 900px) {
  .daemon-gap-row { grid-template-columns: 1fr 90px; }
  .daemon-gap-row .meter-bar { display: none; }
}

@media (max-width: 1100px) {
  .an-hero { grid-template-columns: 1fr; gap: 20px; }
  .hero-narrative { border-left: none; padding-left: 0; }
}
</style>
