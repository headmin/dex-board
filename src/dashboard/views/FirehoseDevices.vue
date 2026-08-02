<template>
  <div class="dashboard page-stack">
    <PageHeader title="Hosts" />

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Compare Mode Overlay -->
    <div v-if="compareMode" class="compare-overlay" @click.self="compareMode = false">
      <div class="compare-panel">
        <DeviceCompare
          :initialHostId="compareInitialId"
          :devices="compareDevices"
          @close="compareMode = false"
        />
      </div>
    </div>

    <!-- Host Detail Drawer -->
    <template v-if="selected">
      <div v-if="focusedHost">
        <BaseButton variant="link" @click="closeDevice">← All hosts</BaseButton>
      </div>
      <Drawer :title="displayHost(detail) || displayHost(selected)" @close="closeDevice">
        <template #meta>
          <Badge
            v-if="staleness"
            :tone="stalenessTone[staleness.tier] || 'neutral'"
            :label="staleness.label"
            :title="staleness.title"
          />
        </template>
        <template #subtitle>{{ detail.hardware_model }} &middot; {{ detail.cpu_brand }} &middot; {{ detail.memory_gb }} GB RAM</template>
        <template #actions>
          <a
            class="open-fleet-btn"
            :href="openInFleetUrl"
            target="_blank"
            rel="noopener noreferrer"
            :title="`Open ${displayHost(detail) || displayHost(selected)} in Fleet (new tab)`"
          >
            Open in Fleet
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3h7v7M13 3L6 10M10 2H3v11h11v-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </a>
          <BaseButton size="small" title="Compare this host with another" @click="openCompare(selected.host_id)">
            Compare with…
          </BaseButton>
        </template>

      <!-- RAM utilization bar -->
      <div v-if="devicePressure.ram_gb" class="device-ram-section">
        <div class="ram-bar-header">
          <span class="ram-bar-title">RAM utilization</span>
          <span class="ram-bar-numbers" :class="pressureColorClass(devicePressure.pct)">
            {{ devicePressure.used_gb }} GB used of {{ devicePressure.ram_gb }} GB
            ({{ devicePressure.pct }}%)
          </span>
        </div>
        <GaugeBar :value="devicePressure.pct" />
        <div class="ram-bar-footer">
          <span>{{ devicePressure.free_gb }} GB free</span>
          <span v-if="devicePressure.pct < 30" class="ram-verdict good">Healthy headroom</span>
          <span v-else-if="devicePressure.pct < 50" class="ram-verdict moderate">Moderate pressure</span>
          <span v-else-if="devicePressure.pct < 70" class="ram-verdict high">High pressure — likely swapping</span>
          <span v-else class="ram-verdict critical">Critical — swap thrashing probable</span>
        </div>
      </div>

      <!-- Device summary cards -->
      <div class="metrics-row six-col">
        <MetricCard label="MTTP" :value="mttpValue" :subtitle="mttpSubtitle" :loading="loading.detail" />
        <MetricCard label="SNR" :value="detail.snr || null" unit="dB" :loading="loading.detail" />
        <MetricCard label="Quality" :value="detail.signal_quality" :loading="loading.detail" />
        <MetricCard label="Tx Rate" :value="detail.transmit_rate || null" unit="Mbps" :loading="loading.detail" />
        <MetricCard label="Fleetd" :value="detail.version" :loading="loading.detail" />
        <MetricCard label="Uptime" :value="formatUptime(detail.uptime_seconds)" :loading="loading.detail" />
      </div>

      <!-- Health, OS & VPN fact chips -->
      <div v-if="deviceHealth.cpu_class || deviceOS.os_version || deviceVPN.network_confidence" class="detail-badges">
        <Chip v-if="deviceHealth.cpu_class" label="CPU" :value="humanizeToken(deviceHealth.cpu_class)" />
        <Chip v-if="deviceHealth.ram_tier" label="RAM" :value="String(deviceHealth.ram_tier)" />
        <Chip
          v-if="deviceHealth.swap_pressure"
          :tone="chipTone('swap', deviceHealth.swap_pressure)"
          label="Swap"
          :value="humanizeToken(deviceHealth.swap_pressure, { capitalize: false })"
        />
        <Chip
          v-if="deviceHealth.battery_health_score"
          :tone="chipTone('battery', deviceHealth.battery_health_score)"
          label="Battery"
          :value="`${deviceHealth.battery_health_score} (${deviceHealth.battery_percent}%)`"
        />
        <Chip v-if="deviceOS.os_version" :label="osChipLabel" :value="String(deviceOS.os_version)" />
        <Chip
          v-if="deviceOS.os_currency"
          :tone="chipTone('os', deviceOS.os_currency)"
          label="OS currency"
          :value="String(deviceOS.os_currency)"
        />
        <Chip
          v-if="deviceOS.uptime_risk"
          :tone="chipTone('uptime', deviceOS.uptime_risk)"
          label="Uptime"
          :value="`${deviceOS.uptime_days}d (${humanizeToken(deviceOS.uptime_risk, { capitalize: false })})`"
        />
        <Chip
          v-if="deviceOS.dex_os_health"
          :tone="chipTone('dex', deviceOS.dex_os_health)"
          label="OS health"
          :value="humanizeToken(deviceOS.dex_os_health, { capitalize: false })"
        />
        <Chip
          v-if="deviceVPN.network_confidence"
          :tone="chipTone('vpn', deviceVPN.network_confidence)"
          label="Network"
          :value="humanizeToken(deviceVPN.network_confidence, { capitalize: false })"
        />
      </div>

      <!-- Crashes -->
      <div v-if="deviceCrashes.length" class="crash-section">
        <h3>Crashes (7d)</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Identifier</th><th>Count</th><th>Severity</th><th>Last crash</th></tr></thead>
            <tbody>
              <tr v-for="c in deviceCrashes" :key="c.crashed_identifier">
                <td class="mono-id">{{ c.crashed_identifier }}</td>
                <td>{{ c.crash_count_7d }}</td>
                <td><Badge :tone="badgeTone(c.crash_severity)" :label="c.crash_severity" /></td>
                <td class="muted">{{ c.last_crash_at }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Device Wi-Fi timeseries -->
      <section class="section" v-if="deviceWifiTs.length">
        <TimeSeriesChart
          :title="`RSSI — ${displayHost(detail) || displayHost(selected)}`"
          :data="deviceWifiTs"
          :loading="loading.deviceWifi"
          xKey="hour"
          yKey="avg_rssi"
          :color="palette.info"
        />
      </section>

      <!-- Score change drivers (last 7d) -->
      <section
        class="section drivers-section"
        id="score-drivers"
        :class="{ flash: driversFlash }"
        v-if="deviceDrivers"
      >
        <h3>Score change drivers (last 7 days)</h3>
        <p class="drivers-hint">
          Per-category sub-score moves with the raw signal that drove each one.
          The category with the largest weighted composite swing is the primary driver.
        </p>
        <ScoreDriverPanel
          v-for="cat in deviceDrivers.categories"
          :key="cat.key"
          :category="cat"
          :is-primary="cat.key === deviceDrivers.primaryDriver"
        />
      </section>

      <!-- Device running apps -->
      <section class="section" v-if="deviceApps.length">
        <h3>Running apps (latest snapshot) — {{ deviceApps.length }} processes</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th @click="sortAppsBy('app_name')" class="sortable">App {{ appSortIcon('app_name') }}</th>
                <th @click="sortAppsBy('memory_mb')" class="sortable">Memory (MB) {{ appSortIcon('memory_mb') }}</th>
                <th @click="sortAppsBy('threads')" class="sortable">Threads {{ appSortIcon('threads') }}</th>
                <th @click="sortAppsBy('bundle_identifier')" class="sortable">Bundle ID {{ appSortIcon('bundle_identifier') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in sortedDeviceApps" :key="a.pid">
                <td class="hostname">{{ a.app_name }}</td>
                <td :class="memClass(a.memory_mb)">{{ a.memory_mb }}</td>
                <td>{{ a.threads }}</td>
                <td class="muted">{{ a.bundle_identifier }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Process health (classified) -->
      <section class="section" v-if="deviceProcesses.length">
        <h3>Process health (latest snapshot) — {{ deviceProcesses.length }} processes</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th @click="procSortBy('process_name')" class="sortable">Process {{ procSortIcon('process_name') }}</th>
                <th @click="procSortBy('process_class')" class="sortable">Class {{ procSortIcon('process_class') }}</th>
                <th @click="procSortBy('rss_mb', true)" class="sortable">RSS (MB) {{ procSortIcon('rss_mb') }}</th>
                <th @click="procSortBy('threads', true)" class="sortable">Threads {{ procSortIcon('threads') }}</th>
                <th @click="procSortBy('mem_pressure')" class="sortable">Pressure {{ procSortIcon('mem_pressure') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in sortedDeviceProcesses" :key="p.pid">
                <td class="hostname">{{ p.process_name }}</td>
                <td><Badge :tone="badgeTone(p.process_class)" :label="p.process_class" /></td>
                <td :class="memClass(p.rss_mb)">{{ p.rss_mb }}</td>
                <td>{{ p.threads }}</td>
                <td><Badge :tone="badgeTone(p.mem_pressure)" :label="p.mem_pressure" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Adoption gap -->
      <section class="section" v-if="deviceAdoption.length">
        <h3>App adoption — {{ deviceAdoption.length }} apps</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th @click="adoptSortBy('app_name')" class="sortable">App {{ adoptSortIcon('app_name') }}</th>
                <th @click="adoptSortBy('version')" class="sortable">Version {{ adoptSortIcon('version') }}</th>
                <th @click="adoptSortBy('days_since_opened', true)" class="sortable">Days stale {{ adoptSortIcon('days_since_opened') }}</th>
                <th @click="adoptSortBy('usage_tier')" class="sortable">Tier {{ adoptSortIcon('usage_tier') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in sortedDeviceAdoption" :key="a.bundle_identifier">
                <td class="hostname">{{ a.app_name }}</td>
                <td class="muted">{{ a.version }}</td>
                <td>{{ a.days_since_opened || '—' }}</td>
                <td><Badge :tone="badgeTone(a.usage_tier)" :label="a.usage_tier" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="section" v-if="devicePatches.length">
        <h3>Top patches — last {{ devicePatches.length }} app upgrades on this host</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th @click="patchSortBy('event_time', true)" class="sortable">When {{ patchSortIcon('event_time') }}</th>
                <th @click="patchSortBy('software_name')" class="sortable">App {{ patchSortIcon('software_name') }}</th>
                <th>From → To</th>
                <th @click="patchSortBy('days_to_patch', true)" class="sortable">Lag (days) {{ patchSortIcon('days_to_patch') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, pi) in sortedDevicePatches" :key="pi">
                <td class="muted">{{ formatPatchTime(p.event_time) }}</td>
                <td class="hostname">{{ p.software_name }}</td>
                <td class="muted mono">{{ p.old_version || '—' }} → {{ p.new_version }}</td>
                <td>{{ Number(p.days_to_patch).toFixed(2) }}d</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div v-if="detail.last_error" class="error-box" :class="{ 'error-box--stale': fleetdErrorIsStale }">
        <div class="error-box-head">
          <strong>Last fleetd error</strong>
          <span v-if="fleetdErrorRelative" class="error-box-time">{{ fleetdErrorRelative }}</span>
          <Badge v-if="fleetdErrorIsStale" tone="fair">Stale — not a current incident</Badge>
        </div>
        <pre>{{ detail.last_error }}</pre>
      </div>
      </Drawer>
    </template>

    <!-- All-hosts list. Hidden when arriving via deep-link with a hostId
         set — that flow is "inspect one host," not "browse the fleet." -->
    <section class="section" v-if="!focusedHost">
      <SectionHeader :title="`All hosts (${filteredDevices.length})`" />
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th @click="sortBy('hostname')" class="sortable">Hostname {{ sortIcon('hostname') }}</th>
              <th @click="sortBy('hardware_model')" class="sortable">Model {{ sortIcon('hardware_model') }}</th>
              <th @click="sortBy('cpu_brand')" class="sortable">CPU {{ sortIcon('cpu_brand') }}</th>
              <th @click="sortBy('memory_gb')" class="sortable">RAM {{ sortIcon('memory_gb') }}</th>
              <th @click="sortBy('mem_pressure')" class="sortable">RAM Usage {{ sortIcon('mem_pressure') }}</th>
              <th @click="sortBy('rssi')" class="sortable">RSSI {{ sortIcon('rssi') }}</th>
              <th @click="sortBy('signal_quality')" class="sortable">Quality {{ sortIcon('signal_quality') }}</th>
              <th>Apps</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in filteredDevices"
              :key="d.host_id"
              class="clickable-row"
              :class="{ selected: selected?.host_id === d.host_id }"
              @click="selectDevice(d)"
            >
              <td class="hostname">{{ displayHost(d) }}</td>
              <td>{{ d.hardware_model }}</td>
              <td>{{ d.cpu_brand }}</td>
              <td>{{ d.memory_gb }} GB</td>
              <td>
                <div v-if="d.total_memory_mb && d.memory_gb" class="mini-ram">
                  <div class="mini-ram-bar">
                    <div class="mini-ram-fill" :class="pressureColorClass(calcPressure(d))" :style="{ width: Math.min(calcPressure(d), 100) + '%' }"></div>
                  </div>
                  <span class="mini-ram-pct" :class="pressureColorClass(calcPressure(d))">{{ calcPressure(d) }}%</span>
                </div>
                <span v-else class="muted">—</span>
              </td>
              <td class="nowrap" :class="rssiClass(d.rssi)">{{ d.rssi ? `${d.rssi} dBm` : '—' }}</td>
              <td>
                <Badge v-if="d.signal_quality" :tone="badgeTone(d.signal_quality)" :label="d.signal_quality" />
                <span v-else>—</span>
              </td>
              <td>{{ d.app_count || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { query } from '../services/api'
import { useFleetFilter } from '../composables/useFleetFilter'
import MetricCard from '../components/MetricCard.vue'
import TimeSeriesChart from '../components/TimeSeriesChart.vue'
import ScoreDriverPanel from '../components/ScoreDriverPanel.vue'
import DeviceCompare from '../components/DeviceCompare.vue'
import PageHeader from '../components/base/PageHeader.vue'
import SectionHeader from '../components/base/SectionHeader.vue'
import Drawer from '../components/base/Drawer.vue'
import BaseButton from '../components/base/BaseButton.vue'
import Badge from '../components/base/Badge.vue'
import Chip from '../components/base/Chip.vue'
import GaugeBar from '../components/base/GaugeBar.vue'
import { buildSignalDrivers } from '../composables/scoreFormulas'
import { displayHost } from '../composables/displayName'
import { humanizeToken } from '../composables/humanize'
import { useSort } from '../composables/useSort'
import { palette } from '../composables/uiPalette'
import dayjs from 'dayjs'
import { useAppConfig } from '../composables/useAppConfig'
import { useNow } from '../composables/useNow'
import { useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// True when the page is being viewed in "inspect one host" mode (arrived
// via deep-link with ?hostId=…). In that mode we suppress the all-hosts
// list so the user sees just the host's drawer, top-to-bottom.
const focusedHost = computed(() => !!(route.query.hostId && selected.value))

const { searchText: globalSearch, selectedModel, selectedRAMTier } = useFleetFilter()
const { config: appConfig } = useAppConfig()

// Open the current host in the configured Fleet instance. Fleet's hosts
// page accepts a `query=` substring search across hostname/serial/UUID, so
// we prefer hardware_serial (globally unique, short) → host_id → hostname
// for highest-precision lookup, matching the convention used by HostTile.
const FLEET_ALL_HOSTS_LABEL_ID = 7
// OS chip label follows the host platform (was hardcoded "macOS")
const osChipLabel = computed(() => {
  const p = String(detail.value?.platform || selected.value?.platform || '').toLowerCase()
  // darwin contains "win" — check Apple platforms FIRST
  if (p.includes('darwin') || p.includes('mac')) return 'macOS'
  if (p.includes('linux') || p.includes('ubuntu')) return 'Linux'
  if (p.includes('win')) return 'Windows'
  return 'OS'
})

const openInFleetUrl = computed(() => {
  const base = appConfig.value.fleetUrl
  const d = detail.value || {}
  const s = selected.value || {}
  const q = d.hardware_serial || s.hardware_serial || s.host_id || d.hostname || s.hostname || ''
  const params = new URLSearchParams({
    query: q,
    page: '0',
    order_key: 'display_name',
    order_direction: 'asc',
  })
  return `${base}/hosts/manage/labels/${FLEET_ALL_HOSTS_LABEL_ID}?${params.toString()}`
})

const error = ref(null)
const loading = ref({ list: false, detail: false, deviceWifi: false, deviceApps: false })

const devices = ref([])
const { sortKey: sortCol, sortAsc, toggleSort: sortBy, sortRows: sortDeviceRows } = useSort('hostname', true)
// Drawer tables: sortable (user request) — sensible severity-first defaults
const { sortKey: procSortCol, sortAsc: procSortAsc, toggleSort: procSortBy, sortRows: sortProcRows } = useSort('rss_mb', false)
const sortedDeviceProcesses = computed(() => sortProcRows(deviceProcesses.value))
function procSortIcon(col) { return procSortCol.value === col ? (procSortAsc.value ? '▲' : '▼') : '' }

const { sortKey: adoptSortCol, sortAsc: adoptSortAsc, toggleSort: adoptSortBy, sortRows: sortAdoptRows } = useSort('days_since_opened', false)
const sortedDeviceAdoption = computed(() => sortAdoptRows(deviceAdoption.value))
function adoptSortIcon(col) { return adoptSortCol.value === col ? (adoptSortAsc.value ? '▲' : '▼') : '' }

const { sortKey: patchSortCol, sortAsc: patchSortAsc, toggleSort: patchSortBy, sortRows: sortPatchRows } = useSort('event_time', false)
const sortedDevicePatches = computed(() => sortPatchRows(devicePatches.value))
function patchSortIcon(col) { return patchSortCol.value === col ? (patchSortAsc.value ? '▲' : '▼') : '' }

// memory desc by default — biggest hogs at the top
const { sortKey: appSortCol, sortAsc: appSortAsc, toggleSort: toggleAppSort, sortRows: sortAppRows } = useSort('memory_mb', false)

// Fleetd's last_error field starts with an ISO timestamp ("2026-02-17T21:02:22Z: …").
// Parse that out so we can show how old the error is and grey out anything older
// than 30 days (likely a long-resolved transient, not a current incident).
const fleetdErrorParsedAt = computed(() => {
  const raw = detail.value?.last_error
  if (!raw) return null
  const m = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/)
  return m ? dayjs(m[1]) : null
})
const fleetdErrorRelative = computed(() => {
  const t = fleetdErrorParsedAt.value
  if (!t || !t.isValid()) return ''
  const days = dayjs().diff(t, 'day')
  if (days >= 30) return t.format('YYYY-MM-DD') + ` · ${days} days ago`
  if (days >= 1)  return `${days} day${days === 1 ? '' : 's'} ago`
  const hours = dayjs().diff(t, 'hour')
  if (hours >= 1) return `${hours}h ago`
  return 'just now'
})
const fleetdErrorIsStale = computed(() => {
  const t = fleetdErrorParsedAt.value
  return !!(t && t.isValid() && dayjs().diff(t, 'day') >= 30)
})

const selected = ref(null)
const detail = ref({})
const deviceWifiTs = ref([])
const deviceApps = ref([])
const deviceHealth = ref({})
const deviceOS = ref({})
const deviceVPN = ref({})
const deviceCrashes = ref([])
const deviceProcesses = ref([])
const deviceAdoption = ref([])
const devicePatches = ref([])
const deviceMttp = ref(null)
const deviceDrivers = ref(null)
const driversFlash = ref(false)

const sortedDeviceApps = computed(() => sortAppRows(deviceApps.value))

// ── Status tones for primitives ─────────────────────
// Staleness tier → Badge tone.
const stalenessTone = { active: 'good', stale: 'fair', inactive: 'critical', offline: 'neutral' }

// Detail fact chips: classifier value → Chip tone, per fact family.
// Unlisted values (and neutral facts like CPU class / RAM tier) stay neutral.
const CHIP_TONES = {
  swap:    { severe: 'critical', elevated: 'elevated', light: 'good', none: 'good' },
  battery: { good: 'good', degraded: 'fair', replace: 'critical' },
  os:      { current: 'good', n_minus_1: 'fair', n_minus_2: 'critical', legacy: 'critical' },
  uptime:  { fresh: 'good', just_rebooted: 'good', stale_7d: 'fair', stale_14d: 'elevated' },
  dex:     { healthy: 'good', acceptable: 'fair', degraded: 'critical' },
  vpn:     { tunnel_active: 'info', direct_connected: 'good', disconnected: 'critical' },
}
function chipTone(group, value) {
  return CHIP_TONES[group]?.[value] || 'neutral'
}

// Table status badges: raw classifier value → Badge tone.
const BADGE_TONES = {
  // Wi-Fi signal quality
  excellent: 'good', good: 'good', fair: 'fair', weak: 'critical', poor: 'critical', very_weak: 'critical',
  // crash severity
  single: 'neutral', recurring: 'fair', elevated: 'elevated', critical: 'critical',
  // process class
  user_app: 'info', mgmt_agent: 'info', system: 'neutral', other: 'neutral',
  // memory pressure
  normal: 'good', elevated_500mb: 'fair', high_1gb: 'elevated', critical_2gb: 'critical',
  // app adoption tier
  active_today: 'good', active_week: 'good', stale_30d: 'fair', stale_90d: 'elevated', stale_90d_plus: 'critical', never_opened: 'neutral',
}
function badgeTone(value) {
  return BADGE_TONES[value] || 'neutral'
}

// Staleness — bucket the time since last check-in into Active / Stale / Inactive.
// last_seen = max(timestamp) across every firehose table this host writes to,
// not just hardware_inventory (which snapshots rarely and would mark an
// actively-working host stale within a few days).
//
// Compute "minutes since" client-side from `last_seen` + a ticking `now` so
// the label ages on its own (Active · 12m → 13m → 14m) without refetching.
const { now } = useNow()
const staleness = computed(() => {
  const lastSeenIso = detail.value?.last_seen
  if (!lastSeenIso) return null
  const lastSeenMs = new Date(lastSeenIso).getTime()
  if (!isFinite(lastSeenMs)) return null
  const m = Math.max(0, (now.value - lastSeenMs) / 60000)
  const lastSeenStr = new Date(lastSeenMs).toLocaleString()
  const ago =
    m < 1            ? 'just now' :
    m < 60           ? `${Math.round(m)}m ago` :
    m < 60 * 24      ? `${Math.round(m / 60)}h ago` :
                       `${Math.round(m / 60 / 24)}d ago`
  if (m < 60 * 24)        return { tier: 'active',   label: `Active · ${ago}`,   title: `Last seen ${lastSeenStr}` }
  if (m < 60 * 24 * 7)    return { tier: 'stale',    label: `Stale · ${ago}`,    title: `Last seen ${lastSeenStr}` }
  if (m < 60 * 24 * 30)   return { tier: 'inactive', label: `Inactive · ${ago}`, title: `Last seen ${lastSeenStr}` }
  return                         { tier: 'offline',  label: `Offline · ${ago}`,  title: `Last seen ${lastSeenStr}` }
})

// Compare overlay — opens DeviceCompare seeded with the selected host on the left side.
// DeviceCompare expects each device row to expose a `host_identifier` key (it was
// originally fed from the score queries that use that name); FirehoseDevices' list
// uses `host_id`. Alias the field so the lookup in DeviceCompare resolves.
const compareMode = ref(false)
const compareInitialId = ref('')
const compareDevices = computed(() =>
  devices.value.map(d => ({ ...d, host_identifier: d.host_id }))
)
function openCompare(hostId) {
  compareInitialId.value = hostId
  compareMode.value = true
}

function formatPatchTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return String(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  return sameDay ? time : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`
}

// ── Computed ────────────────────────────────────────
const filteredDevices = computed(() => {
  let list = devices.value.map(d => ({
    ...d,
    mem_pressure: calcPressure(d),
  }))
  // Text search — from global filter bar
  if (globalSearch.value) {
    const s = globalSearch.value.toLowerCase()
    list = list.filter(d =>
      (d.hostname || '').toLowerCase().includes(s) ||
      (d.computer_name || '').toLowerCase().includes(s) ||
      (d.hardware_model || '').toLowerCase().includes(s) ||
      (d.host_id || '').toLowerCase().includes(s)
    )
  }
  // Model filter
  if (selectedModel.value) {
    list = list.filter(d => d.hardware_model === selectedModel.value)
  }
  // RAM tier filter
  if (selectedRAMTier.value) {
    const ramVal = selectedRAMTier.value
    list = list.filter(d => {
      const gb = Number(d.memory_gb) || 0
      if (ramVal === '128GB+') return gb >= 128
      const target = parseInt(ramVal)
      return target && gb >= target && gb < target * 2
    })
  }
  return sortDeviceRows(list)
})

const devicePressure = computed(() => {
  const d = selected.value
  if (!d || !d.memory_gb || !d.total_memory_mb) return {}
  const ram = Number(d.memory_gb)
  const used = Number(d.total_memory_mb) / 1024
  const pct = Math.round(used / ram * 100 * 10) / 10
  return { ram_gb: ram, used_gb: Math.round(used * 10) / 10, free_gb: Math.round((ram - used) * 10) / 10, pct }
})

const mttpValue = computed(() => {
  const m = deviceMttp.value
  if (!m || !Number(m.n_patches)) return '—'
  return `${Number(m.avg_lag).toFixed(1)}d`
})

const mttpSubtitle = computed(() => {
  const m = deviceMttp.value
  if (!m || !Number(m.n_patches)) return 'no patches recorded'
  const n = Number(m.n_patches)
  return `${n} patch${n === 1 ? '' : 'es'} · ${Number(m.min_lag)}–${Number(m.max_lag)}d`
})

// ── Helpers ─────────────────────────────────────────
function rssiClass(rssi) {
  if (!rssi) return ''
  if (rssi >= -50) return 'rssi-excellent'
  if (rssi >= -60) return 'rssi-good'
  if (rssi >= -70) return 'rssi-fair'
  return 'rssi-poor'
}

function memClass(mb) {
  if (mb > 1000) return 'mem-high'
  if (mb > 500) return 'mem-med'
  return ''
}

function calcPressure(d) {
  if (!d.total_memory_mb || !d.memory_gb) return 0
  return Math.round(Number(d.total_memory_mb) / (Number(d.memory_gb) * 1024) * 1000) / 10
}

function pressureColorClass(pct) {
  if (pct >= 70) return 'pressure-critical'
  if (pct >= 50) return 'pressure-high'
  if (pct >= 30) return 'pressure-moderate'
  return 'pressure-ok'
}

function formatUptime(seconds) {
  if (!seconds) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`
}

function sortAppsBy(col) {
  // First click on a numeric column defaults to descending (high → low,
  // which is what you usually want for "Memory" and "Threads").
  toggleAppSort(col, ['memory_mb', 'threads'].includes(col))
}

function appSortIcon(col) {
  if (appSortCol.value !== col) return ''
  return appSortAsc.value ? '▲' : '▼'
}

function sortIcon(col) {
  if (sortCol.value !== col) return ''
  return sortAsc.value ? '▲' : '▼'
}

// ── Device selection ────────────────────────────────
async function selectDevice(device) {
  selected.value = device
  detail.value = device
  deviceWifiTs.value = []
  deviceApps.value = []
  deviceHealth.value = {}
  deviceOS.value = {}
  deviceVPN.value = {}
  deviceCrashes.value = []
  deviceProcesses.value = []
  deviceAdoption.value = []
  devicePatches.value = []
  deviceMttp.value = null
  deviceDrivers.value = null
  window.scrollTo({ top: 0, behavior: 'smooth' })

  loading.value.detail = true
  loading.value.deviceWifi = true
  loading.value.deviceApps = true

  try {
    const [det, wTs, apps, health, os, vpn, crashes, procs, adoption, patches, signalsCompare, mttp] = await Promise.all([
      query('firehose.devices.detail', { hostId: device.host_id }).catch(() => []),
      query('firehose.wifi.device_timeseries', { hostId: device.host_id }).catch(() => []),
      query('firehose.apps.per_device', { hostId: device.host_id }).catch(() => []),
      query('firehose.health.device_list', { hostId: device.host_id, limit: 1 }).catch(() => []),
      query('firehose.health.os_list', { hostId: device.host_id, limit: 1 }).catch(() => []),
      query('firehose.vpn.list', { hostId: device.host_id, limit: 1 }).catch(() => []),
      query('firehose.crashes.per_device', { hostId: device.host_id }).catch(() => []),
      query('firehose.processes.per_device', { hostId: device.host_id }).catch(() => []),
      query('firehose.adoption.per_device', { hostId: device.host_id }).catch(() => []),
      query('scores.device_top_patches', { hostIdentifier: device.host_id, limit: 10 }).catch(() => []),
      query('firehose.scores.device_signals_compare', { hostId: device.host_id }).catch(() => []),
      query('firehose.scores.device_mttp', { hostIdentifier: device.host_id }).catch(() => []),
    ])
    if (det[0]) detail.value = { ...device, ...det[0] }
    deviceWifiTs.value = wTs
    deviceApps.value = apps
    deviceHealth.value = health[0] || {}
    deviceOS.value = os[0] || {}
    deviceVPN.value = vpn[0] || {}
    deviceCrashes.value = crashes
    deviceProcesses.value = procs
    deviceAdoption.value = adoption
    devicePatches.value = patches || []
    deviceMttp.value = (mttp || [])[0] || null
    deviceDrivers.value = buildSignalDrivers((signalsCompare || [])[0])

    if (route.query.focus === 'movers') {
      await nextTick()
      const el = document.getElementById('score-drivers')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        driversFlash.value = true
        setTimeout(() => { driversFlash.value = false }, 2400)
      }
    }
  } catch (e) {
    error.value = `Device detail: ${e.message}`
  } finally {
    loading.value.detail = false
    loading.value.deviceWifi = false
    loading.value.deviceApps = false
  }
}

function closeDevice() {
  selected.value = null
  detail.value = {}
  deviceWifiTs.value = []
  deviceApps.value = []
  // Clear the deep-link query so the all-hosts list re-shows naturally.
  if (route.query.hostId || route.query.focus) {
    router.replace({ path: '/devices' })
  }
}

// ── Fetch ───────────────────────────────────────────
async function fetchDevices() {
  loading.value.list = true
  error.value = null
  try {
    devices.value = await query('firehose.devices.list', { limit: 200 })
  } catch (e) {
    error.value = `Devices: ${e.message}`
  } finally {
    loading.value.list = false
  }
}

// Deep-link from HostTile: /devices?hostId=<uuid> auto-opens the drawer for
// that host. Runs after fetch so `devices` is populated and we can match.
async function autoSelectFromQuery() {
  const hostId = route.query.hostId
  if (!hostId) return
  const match = devices.value.find(d => d.host_id === hostId)
  if (match) {
    await selectDevice(match)
  } else {
    // Fall back to a minimal stub so the drawer still opens with whatever
    // fields we have from the URL alone; the detail fetch will fill it in.
    await selectDevice({ host_id: hostId, hostname: '' })
  }
}

onMounted(async () => {
  await fetchDevices()
  await autoSelectFromQuery()
})

// If the user navigates between hosts without unmounting (e.g. clicks another
// HostTile while already on /devices), re-select when hostId changes.
watch(() => route.query.hostId, (newId, oldId) => {
  if (newId && newId !== oldId) autoSelectFromQuery()
})
</script>

<style scoped>
.dashboard { max-width: 1400px; margin: 0 auto; padding: var(--pad-xlarge); }
h3 { font-size: var(--font-size-sm); font-weight: 700; color: var(--fleet-black); margin: 16px 0 8px; }
.section { margin-bottom: 32px; }

/* ── Device Drawer ───────────────────────── */
/* Mirrors BaseButton secondary/small so the two drawer actions read as a
   pair while staying a real anchor (target=_blank). */
.open-fleet-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  box-sizing: border-box;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  color: var(--fleet-black-75);
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-25);
  border-radius: var(--radius);
  text-decoration: none;
  transition: background-color var(--transition-base);
}
.open-fleet-btn:hover { background: var(--fleet-black-5); }
.open-fleet-btn svg { stroke: currentColor; }

.compare-overlay {
  position: fixed; inset: 0;
  background: rgba(25, 33, 71, 0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 29px 14px;
  z-index: 100;
  overflow-y: auto;
}
.compare-panel {
  background: var(--fleet-white);
  border-radius: var(--radius-large);
  box-shadow: var(--shadow-lg);
  max-width: 1200px;
  width: 100%;
  max-height: calc(100vh - 64px);
  overflow-y: auto;
}
.error-box { background: var(--fleet-status-error-light); border: 1px solid var(--status-critical-bg); border-radius: var(--radius); padding: 12px 16px; margin-top: 16px; }
.error-box pre { font-size: var(--font-size-xs); white-space: pre-wrap; word-break: break-all; margin: 8px 0 0; color: var(--fleet-status-error); }
.error-box-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.error-box-time { font-family: var(--font-mono); font-size: 11px; color: var(--fleet-black-50); }
.error-box--stale { background: var(--fleet-black-5); border-color: var(--fleet-black-10); }
.error-box--stale pre { color: var(--fleet-black-50); }
.error-box--stale strong { color: var(--fleet-black-50); }

/* ── Tables ──────────────────────────────── */
.table-wrap { overflow-x: auto; background: var(--fleet-white); border: 1px solid var(--border-color); border-radius: var(--radius-large); }
.data-table { width: 100%; border-collapse: collapse; font-family: var(--font-body); font-size: var(--font-size-sm); }
.data-table th { text-align: left; padding: 10px 14px; font-weight: 700; color: var(--fleet-black); background: var(--fleet-off-white); border-bottom: 1px solid var(--fleet-black-10); font-size: var(--font-size-sm); white-space: nowrap; }
.data-table th:first-child { border-top-left-radius: var(--radius-large); }
.data-table th:last-child { border-top-right-radius: var(--radius-large); }
.data-table th.sortable { cursor: pointer; user-select: none; }
.data-table th.sortable:hover { color: var(--fleet-black); }
.data-table td { padding: 10px 14px; border-bottom: 1px solid var(--fleet-black-10); color: var(--fleet-black-75); }
.data-table tbody tr:last-child td { border-bottom: 0; }
.clickable-row { cursor: pointer; transition: background 100ms; }
.clickable-row:hover { background: var(--fleet-off-white); }
.clickable-row.selected { background: var(--sidebar-active-bg); }
.hostname { font-weight: 700; color: var(--fleet-black); }
.muted { color: var(--fleet-black-50); font-size: var(--font-size-xs); }
.mono { font-family: var(--font-mono); }
.mono-id { font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--fleet-black-75); }
.nowrap { white-space: nowrap; }

.drivers-section { transition: box-shadow 600ms ease-out; border-radius: var(--radius); }
.drivers-section.flash { box-shadow: 0 0 0 3px rgba(106, 103, 254, 0.35); }
.drivers-hint { font-size: var(--font-size-xs); color: var(--fleet-black-50); margin: 0 0 12px; }
.rssi-excellent { color: var(--status-good); font-weight: 600; }
.rssi-good { color: var(--status-good); }
.rssi-fair { color: var(--status-fair-text); }
.rssi-poor { color: var(--fleet-status-error); font-weight: 600; }
.mem-high { color: var(--fleet-status-error); font-weight: 600; }
.mem-med { color: var(--status-fair-text); }

/* RAM utilization bar — device drawer */
.device-ram-section { margin-bottom: 16px; padding: 12px 16px; background: var(--fleet-off-white); border-radius: var(--radius); }
.ram-bar-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.ram-bar-title { font-family: var(--font-body); font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black-75); }
.ram-bar-numbers { font-size: var(--font-size-sm); font-weight: 600; }
.ram-bar-footer { display: flex; justify-content: space-between; margin-top: 6px; font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.ram-verdict { font-weight: 600; }
.ram-verdict.good { color: var(--status-good); }
.ram-verdict.moderate { color: var(--status-fair-text); }
.ram-verdict.high { color: var(--fleet-ui-orange); }
.ram-verdict.critical { color: var(--fleet-status-error); }

/* Mini RAM bar — device list table */
.mini-ram { display: flex; align-items: center; gap: 6px; min-width: 90px; }
.mini-ram-bar { flex: 1; height: 6px; background: var(--fleet-black-5); border-radius: 3px; overflow: hidden; min-width: 50px; }
.mini-ram-fill { height: 100%; border-radius: 3px; }
.mini-ram-fill.pressure-ok { background: var(--status-good); }
.mini-ram-fill.pressure-moderate { background: var(--status-fair); }
.mini-ram-fill.pressure-high { background: var(--status-elevated); }
.mini-ram-fill.pressure-critical { background: var(--status-critical); }
.mini-ram-pct { font-family: var(--font-mono); font-size: 11px; font-weight: 600; min-width: 32px; }

/* Pressure colors */
.pressure-ok { color: var(--status-good); }
.pressure-moderate { color: var(--status-fair-text); }
.pressure-high { color: var(--fleet-ui-orange); }
.pressure-critical { color: var(--fleet-status-error); }

/* Detail fact chips */
.detail-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: var(--pad-medium) 0 var(--pad-large);
}

.crash-section { margin-bottom: 16px; }
</style>
