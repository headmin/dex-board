<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1>Hosts</h1>
    </header>

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
    <section v-if="selected" class="device-drawer">
      <a
        v-if="focusedHost"
        class="back-link"
        href="#"
        @click.prevent="closeDevice"
      >← All hosts</a>
      <div class="drawer-header">
        <div>
          <div class="drawer-title">
            <h2>{{ displayHost(detail) || displayHost(selected) }}</h2>
            <span v-if="staleness" class="staleness-badge" :class="'stale-' + staleness.tier" :title="staleness.title">
              <span class="stale-dot"></span>{{ staleness.label }}
            </span>
          </div>
          <span class="drawer-sub">{{ detail.hardware_model }} &middot; {{ detail.cpu_brand }} &middot; {{ detail.memory_gb }} GB RAM</span>
        </div>
        <div class="drawer-actions">
          <button class="compare-btn" @click="openCompare(selected.host_id)" title="Compare this host with another">
            Compare with…
          </button>
          <button class="close-btn" @click="closeDevice">&times;</button>
        </div>
      </div>

      <!-- RAM utilization bar -->
      <div v-if="devicePressure.ram_gb" class="device-ram-section">
        <div class="ram-bar-header">
          <span class="ram-bar-title">RAM utilization</span>
          <span class="ram-bar-numbers" :class="pressureColorClass(devicePressure.pct)">
            {{ devicePressure.used_gb }} GB used of {{ devicePressure.ram_gb }} GB
            ({{ devicePressure.pct }}%)
          </span>
        </div>
        <div class="ram-bar-track">
          <div
            class="ram-bar-used"
            :class="pressureColorClass(devicePressure.pct)"
            :style="{ width: Math.min(devicePressure.pct, 100) + '%' }"
          ></div>
        </div>
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
        <MetricCard label="RSSI" :value="detail.rssi" unit="dBm" :loading="loading.detail" />
        <MetricCard label="SNR" :value="detail.snr" unit="dB" :loading="loading.detail" />
        <MetricCard label="Quality" :value="detail.signal_quality" :loading="loading.detail" />
        <MetricCard label="Tx Rate" :value="detail.transmit_rate" unit="Mbps" :loading="loading.detail" />
        <MetricCard label="Fleetd" :value="detail.version" :loading="loading.detail" />
        <MetricCard label="Uptime" :value="formatUptime(detail.uptime_seconds)" :loading="loading.detail" />
      </div>

      <!-- Health, OS & VPN badges -->
      <div v-if="deviceHealth.cpu_class || deviceOS.os_version || deviceVPN.network_confidence" class="detail-badges">
        <span v-if="deviceHealth.cpu_class" class="badge">{{ deviceHealth.cpu_class }}</span>
        <span v-if="deviceHealth.ram_tier" class="badge">{{ deviceHealth.ram_tier }}</span>
        <span v-if="deviceHealth.swap_pressure" class="badge" :class="'swap-' + deviceHealth.swap_pressure">swap: {{ deviceHealth.swap_pressure }}</span>
        <span v-if="deviceHealth.battery_health_score" class="badge" :class="'batt-' + deviceHealth.battery_health_score">battery: {{ deviceHealth.battery_health_score }} ({{ deviceHealth.battery_percent }}%)</span>
        <span v-if="deviceOS.os_version" class="badge">macOS {{ deviceOS.os_version }}</span>
        <span v-if="deviceOS.os_currency" class="badge" :class="'os-' + deviceOS.os_currency">{{ deviceOS.os_currency }}</span>
        <span v-if="deviceOS.uptime_risk" class="badge" :class="'uptime-' + deviceOS.uptime_risk">uptime: {{ deviceOS.uptime_days }}d ({{ deviceOS.uptime_risk }})</span>
        <span v-if="deviceOS.dex_os_health" class="badge" :class="'dex-' + deviceOS.dex_os_health">OS: {{ deviceOS.dex_os_health }}</span>
        <span v-if="deviceVPN.network_confidence" class="badge" :class="'vpn-' + deviceVPN.network_confidence">{{ deviceVPN.network_confidence }}</span>
      </div>

      <!-- Crashes -->
      <div v-if="deviceCrashes.length" class="crash-section">
        <h3>Crashes (7d)</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Identifier</th><th>Count</th><th>Severity</th><th>Last crash</th></tr></thead>
            <tbody>
              <tr v-for="c in deviceCrashes" :key="c.crashed_identifier">
                <td class="hostname">{{ c.crashed_identifier }}</td>
                <td>{{ c.crash_count_7d }}</td>
                <td><span class="quality-badge" :class="c.crash_severity">{{ c.crash_severity }}</span></td>
                <td class="muted">{{ c.last_crash_at }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Device Wi-Fi timeseries -->
      <section class="section" v-if="deviceWifiTs.length">
        <TimeSeriesChart
          :title="`RSSI — ${detail.hostname || selected.hostname}`"
          :data="deviceWifiTs"
          :loading="loading.deviceWifi"
          xKey="hour"
          yKey="avg_rssi"
          color="var(--fleet-vibrant-blue)"
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
              <tr><th>Process</th><th>Class</th><th>RSS (MB)</th><th>Threads</th><th>Pressure</th></tr>
            </thead>
            <tbody>
              <tr v-for="p in deviceProcesses" :key="p.pid">
                <td class="hostname">{{ p.process_name }}</td>
                <td><span class="quality-badge" :class="p.process_class">{{ p.process_class }}</span></td>
                <td :class="memClass(p.rss_mb)">{{ p.rss_mb }}</td>
                <td>{{ p.threads }}</td>
                <td><span class="quality-badge" :class="p.mem_pressure">{{ p.mem_pressure }}</span></td>
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
              <tr><th>App</th><th>Version</th><th>Days stale</th><th>Tier</th></tr>
            </thead>
            <tbody>
              <tr v-for="a in deviceAdoption" :key="a.bundle_identifier">
                <td class="hostname">{{ a.app_name }}</td>
                <td class="muted">{{ a.version }}</td>
                <td>{{ a.days_since_opened || '—' }}</td>
                <td><span class="quality-badge" :class="a.usage_tier">{{ a.usage_tier }}</span></td>
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
              <tr><th>When</th><th>App</th><th>From → To</th><th>Lag (days)</th></tr>
            </thead>
            <tbody>
              <tr v-for="(p, pi) in devicePatches" :key="pi">
                <td class="muted">{{ formatPatchTime(p.event_time) }}</td>
                <td class="hostname">{{ p.software_name }}</td>
                <td class="muted mono">{{ p.old_version || '—' }} → {{ p.new_version }}</td>
                <td>{{ Number(p.days_to_patch).toFixed(2) }}d</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div v-if="detail.last_error" class="error-box">
        <strong>Last fleetd error:</strong>
        <pre>{{ detail.last_error }}</pre>
      </div>
    </section>

    <!-- All-hosts list. Hidden when arriving via deep-link with a hostId
         set — that flow is "inspect one host," not "browse the fleet." -->
    <section class="section" v-if="!focusedHost">
      <h2>All hosts ({{ filteredDevices.length }})</h2>
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
              <td class="hostname">{{ d.hostname || d.computer_name || d.host_id.slice(0, 12) }}</td>
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
              <td :class="rssiClass(d.rssi)">{{ d.rssi ? `${d.rssi} dBm` : '—' }}</td>
              <td>
                <span v-if="d.signal_quality" class="quality-badge" :class="d.signal_quality">{{ d.signal_quality }}</span>
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
import { buildSignalDrivers } from '../composables/scoreFormulas'
import { displayHost } from '../composables/displayName'
import { useNow } from '../composables/useNow'
import { useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// True when the page is being viewed in "inspect one host" mode (arrived
// via deep-link with ?hostId=…). In that mode we suppress the all-hosts
// list so the user sees just the host's drawer, top-to-bottom.
const focusedHost = computed(() => !!(route.query.hostId && selected.value))

const { searchText: globalSearch, selectedModel, selectedRAMTier } = useFleetFilter()

const error = ref(null)
const loading = ref({ list: false, detail: false, deviceWifi: false, deviceApps: false })

const devices = ref([])
const sortCol = ref('hostname')
const sortAsc = ref(true)
const appSortCol = ref('memory_mb')
const appSortAsc = ref(false)  // memory desc by default — biggest hogs at the top

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
const deviceDrivers = ref(null)
const driversFlash = ref(false)

const sortedDeviceApps = computed(() => {
  const rows = deviceApps.value.slice()
  const col = appSortCol.value
  const asc = appSortAsc.value
  rows.sort((a, b) => {
    const av = a[col]
    const bv = b[col]
    const aNum = Number(av), bNum = Number(bv)
    let cmp
    if (isFinite(aNum) && isFinite(bNum) && !(typeof av === 'string' && av && isNaN(Number(av)))) {
      cmp = aNum - bNum
    } else {
      cmp = String(av ?? '').localeCompare(String(bv ?? ''))
    }
    return asc ? cmp : -cmp
  })
  return rows
})

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
  return [...list].sort((a, b) => {
    const av = a[sortCol.value] ?? ''
    const bv = b[sortCol.value] ?? ''
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return sortAsc.value ? cmp : -cmp
  })
})

const devicePressure = computed(() => {
  const d = selected.value
  if (!d || !d.memory_gb || !d.total_memory_mb) return {}
  const ram = Number(d.memory_gb)
  const used = Number(d.total_memory_mb) / 1024
  const pct = Math.round(used / ram * 100 * 10) / 10
  return { ram_gb: ram, used_gb: Math.round(used * 10) / 10, free_gb: Math.round((ram - used) * 10) / 10, pct }
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
  if (appSortCol.value === col) { appSortAsc.value = !appSortAsc.value }
  // First click on a numeric column defaults to descending (high → low,
  // which is what you usually want for "Memory" and "Threads").
  else { appSortCol.value = col; appSortAsc.value = !['memory_mb', 'threads'].includes(col) }
}

function appSortIcon(col) {
  if (appSortCol.value !== col) return ''
  return appSortAsc.value ? '▲' : '▼'
}

function sortBy(col) {
  if (sortCol.value === col) { sortAsc.value = !sortAsc.value }
  else { sortCol.value = col; sortAsc.value = true }
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
  deviceDrivers.value = null
  window.scrollTo({ top: 0, behavior: 'smooth' })

  loading.value.detail = true
  loading.value.deviceWifi = true
  loading.value.deviceApps = true

  try {
    const [det, wTs, apps, health, os, vpn, crashes, procs, adoption, patches, signalsCompare] = await Promise.all([
      query('firehose.devices.detail', { hostId: device.host_id }).catch(() => []),
      query('firehose.wifi.device_timeseries', { hostId: device.host_id }).catch(() => []),
      query('firehose.apps.per_device', { hostId: device.host_id }).catch(() => []),
      query('firehose.health.device_list', { limit: 1 }).then(r => r.filter(d => d.host_id === device.host_id)).catch(() => []),
      query('firehose.health.os_list', { limit: 1 }).then(r => r.filter(d => d.host_id === device.host_id)).catch(() => []),
      query('firehose.vpn.list', { limit: 500 }).then(r => r.filter(d => d.host_id === device.host_id)).catch(() => []),
      query('firehose.crashes.per_device', { hostId: device.host_id }).catch(() => []),
      query('firehose.processes.per_device', { hostId: device.host_id }).catch(() => []),
      query('firehose.adoption.per_device', { hostId: device.host_id }).catch(() => []),
      query('scores.device_top_patches', { hostIdentifier: device.host_id, limit: 10 }).catch(() => []),
      query('firehose.scores.device_signals_compare', { hostId: device.host_id }).catch(() => []),
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
.dashboard-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
h1 { font-size: var(--font-size-lg); font-weight: 600; color: var(--fleet-black); font-family: var(--font-mono); }
h2 { font-size: var(--font-size-md); font-weight: 600; color: var(--fleet-black); font-family: var(--font-mono); margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--fleet-black-10); }
h3 { font-size: var(--font-size-sm); font-weight: 600; color: var(--fleet-black); font-family: var(--font-mono); margin: 16px 0 8px; }
.error-banner { background: var(--fleet-white); color: var(--fleet-error); padding: 12px 16px; border-radius: var(--radius); border: 1px solid var(--fleet-black-10); border-left: 3px solid var(--fleet-error); margin-bottom: 24px; }
.section { margin-bottom: 32px; }
.metrics-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px; }
.metrics-row.six-col { grid-template-columns: repeat(6, 1fr); }

.search-input { font-family: var(--font-mono); font-size: var(--font-size-sm); padding: 8px 14px; border: 1px solid var(--fleet-black-10); border-radius: var(--radius); width: 260px; background: var(--fleet-white); }
.search-input:focus { outline: none; border-color: var(--fleet-vibrant-blue); box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }

/* ── Device Drawer ───────────────────────── */
.device-drawer { background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-left: 3px solid var(--fleet-vibrant-blue); border-radius: var(--radius); padding: 20px 24px; margin-bottom: 32px; }
.drawer-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; gap: 12px; }
.drawer-header h2 { margin: 0; padding: 0; border: none; }
.drawer-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.drawer-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.staleness-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid;
}
.staleness-badge .stale-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: currentColor;
  position: relative;
  flex-shrink: 0;
}
.staleness-badge.stale-active   { color: var(--fleet-status-success); background: var(--fleet-status-success-light); border-color: var(--fleet-status-success-border); }
.staleness-badge.stale-stale    { color: var(--fleet-status-warning-dark); background: var(--fleet-status-warning-light); border-color: var(--fleet-status-warning-border); }
.staleness-badge.stale-inactive { color: var(--fleet-status-error); background: var(--fleet-status-error-light); border-color: var(--fleet-status-error-border); }
.staleness-badge.stale-offline  { color: var(--fleet-black-50); background: var(--fleet-black-5); border-color: var(--fleet-black-10); }

/* Heartbeat: only the Active tier pulses — a quiet halo expanding off the
   dot every ~1.6s says "this host is alive right now". Stale / Inactive /
   Offline stay static so the visual distinction reinforces the label. */
.staleness-badge.stale-active .stale-dot::before,
.staleness-badge.stale-active .stale-dot::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
  animation: heartbeat 1.6s ease-out infinite;
}
.staleness-badge.stale-active .stale-dot::after {
  animation-delay: 0.8s;
}
@keyframes heartbeat {
  0%   { transform: scale(1);   opacity: 0.6; }
  80%  { transform: scale(2.6); opacity: 0; }
  100% { transform: scale(2.6); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .staleness-badge.stale-active .stale-dot::before,
  .staleness-badge.stale-active .stale-dot::after {
    animation: none;
  }
}
.compare-btn {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: 600;
  padding: 6px 12px;
  color: var(--fleet-vibrant-blue);
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 100ms;
}
.compare-btn:hover {
  border-color: var(--fleet-vibrant-blue);
  background: var(--fleet-vibrant-blue-10);
}

.compare-overlay {
  position: fixed; inset: 0;
  background: rgba(25, 33, 71, 0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 32px 16px;
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
.drawer-sub { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.close-btn { background: none; border: 1px solid var(--fleet-black-10); border-radius: var(--radius); font-size: 20px; cursor: pointer; color: var(--fleet-black-50); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; }
.close-btn:hover { background: var(--fleet-off-white); color: var(--fleet-black); }

.back-link {
  display: inline-block;
  margin-bottom: var(--pad-small);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--fleet-vibrant-blue);
  text-decoration: none;
}
.back-link:hover { text-decoration: underline; }
.error-box { background: var(--fleet-status-error-light); border: 1px solid #fecaca; border-radius: var(--radius); padding: 12px 16px; margin-top: 16px; }
.error-box pre { font-size: var(--font-size-xs); white-space: pre-wrap; word-break: break-all; margin: 8px 0 0; color: var(--fleet-status-error); }

/* ── Tables ──────────────────────────────── */
.table-wrap { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-family: var(--font-body); font-size: var(--font-size-sm); }
.data-table th { text-align: left; padding: 8px 12px; font-weight: 600; color: var(--fleet-black-50); border-bottom: 2px solid var(--fleet-black-10); font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.5px; }
.data-table th.sortable { cursor: pointer; user-select: none; }
.data-table th.sortable:hover { color: var(--fleet-black); }
.data-table td { padding: 8px 12px; border-bottom: 1px solid var(--fleet-black-5); color: var(--fleet-black); }
.clickable-row { cursor: pointer; transition: background 100ms; }
.clickable-row:hover { background: var(--fleet-off-white); }
.clickable-row.selected { background: #eff6ff; }
.hostname { font-family: var(--font-mono); font-weight: 500; }
.muted { color: var(--fleet-black-50); font-size: var(--font-size-xs); }
.mono { font-family: var(--font-mono); }

.drivers-section { transition: box-shadow 600ms ease-out; border-radius: var(--radius); }
.drivers-section.flash { box-shadow: 0 0 0 3px rgba(106, 103, 254, 0.35); }
.drivers-hint { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); margin: 0 0 12px; }
.rssi-excellent { color: #16a34a; font-weight: 600; }
.rssi-good { color: #65a30d; }
.rssi-fair { color: #ca8a04; }
.rssi-poor { color: #dc2626; font-weight: 600; }
.mem-high { color: #dc2626; font-weight: 600; }
.mem-med { color: #ca8a04; }
.quality-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: var(--font-size-xs); font-weight: 600; }
.quality-badge.excellent { background: var(--fleet-status-success-light); color: var(--fleet-status-success); }
.quality-badge.good { background: #ecfccb; color: #3f6212; }
.quality-badge.fair { background: #fef9c3; color: #854d0e; }
.quality-badge.weak, .quality-badge.poor { background: var(--fleet-status-error-light); color: var(--fleet-status-error); }
.quality-badge.very_weak { background: #fecaca; color: #7f1d1d; }

@media (max-width: 1024px) { .metrics-row.six-col { grid-template-columns: repeat(3, 1fr); } }
/* RAM utilization bar — device drawer */
.device-ram-section { margin-bottom: 16px; padding: 12px 16px; background: var(--fleet-off-white); border-radius: var(--radius); }
.ram-bar-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.ram-bar-title { font-family: var(--font-mono); font-size: var(--font-size-xs); font-weight: 600; color: var(--fleet-black-50); text-transform: uppercase; letter-spacing: 0.5px; }
.ram-bar-numbers { font-family: var(--font-mono); font-size: var(--font-size-sm); font-weight: 600; }
.ram-bar-track { height: 20px; background: var(--fleet-black-5); border-radius: 4px; overflow: hidden; }
.ram-bar-used { height: 100%; border-radius: 4px; transition: width 400ms ease; }
.ram-bar-used.pressure-ok { background: linear-gradient(90deg, #86efac, #22c55e); }
.ram-bar-used.pressure-moderate { background: linear-gradient(90deg, #fde68a, #eab308); }
.ram-bar-used.pressure-high { background: linear-gradient(90deg, #fdba74, #ea580c); }
.ram-bar-used.pressure-critical { background: linear-gradient(90deg, #fca5a5, #dc2626); }
.ram-bar-footer { display: flex; justify-content: space-between; margin-top: 6px; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }
.ram-verdict { font-weight: 600; }
.ram-verdict.good { color: #16a34a; }
.ram-verdict.moderate { color: #ca8a04; }
.ram-verdict.high { color: #ea580c; }
.ram-verdict.critical { color: #dc2626; }

/* Mini RAM bar — device list table */
.mini-ram { display: flex; align-items: center; gap: 6px; min-width: 90px; }
.mini-ram-bar { flex: 1; height: 6px; background: var(--fleet-black-5); border-radius: 3px; overflow: hidden; min-width: 50px; }
.mini-ram-fill { height: 100%; border-radius: 3px; }
.mini-ram-fill.pressure-ok { background: #22c55e; }
.mini-ram-fill.pressure-moderate { background: #eab308; }
.mini-ram-fill.pressure-high { background: #ea580c; }
.mini-ram-fill.pressure-critical { background: #dc2626; }
.mini-ram-pct { font-family: var(--font-mono); font-size: 11px; font-weight: 600; min-width: 32px; }

/* Pressure colors */
.pressure-ok { color: #16a34a; }
.pressure-moderate { color: #ca8a04; }
.pressure-high { color: #ea580c; }
.pressure-critical { color: #dc2626; }

/* Detail badges */
.detail-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-family: var(--font-mono); font-size: var(--font-size-xs); font-weight: 500; background: var(--fleet-off-white); color: var(--fleet-black-75); border: 1px solid var(--fleet-black-10); }
.swap-severe { background: var(--fleet-status-error-light); color: var(--fleet-status-error); border-color: #fecaca; }
.swap-elevated { background: #fffbeb; color: var(--fleet-status-warning-dark); border-color: #fde68a; }
.swap-light { background: #f0fdf4; color: var(--fleet-status-success); border-color: #bbf7d0; }
.swap-none { background: #f0fdf4; color: var(--fleet-status-success); border-color: #bbf7d0; }
.batt-good { background: #f0fdf4; color: var(--fleet-status-success); border-color: #bbf7d0; }
.batt-degraded { background: #fffbeb; color: var(--fleet-status-warning-dark); border-color: #fde68a; }
.batt-replace { background: var(--fleet-status-error-light); color: var(--fleet-status-error); border-color: #fecaca; }
.os-current { background: #f0fdf4; color: var(--fleet-status-success); border-color: #bbf7d0; }
.os-n_minus_1 { background: #fffbeb; color: var(--fleet-status-warning-dark); border-color: #fde68a; }
.os-n_minus_2, .os-legacy { background: var(--fleet-status-error-light); color: var(--fleet-status-error); border-color: #fecaca; }
.dex-healthy { background: #f0fdf4; color: var(--fleet-status-success); border-color: #bbf7d0; }
.dex-acceptable { background: #fffbeb; color: var(--fleet-status-warning-dark); border-color: #fde68a; }
.dex-degraded { background: var(--fleet-status-error-light); color: var(--fleet-status-error); border-color: #fecaca; }
.vpn-tunnel_active { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }
.vpn-direct_connected { background: #f0fdf4; color: var(--fleet-status-success); border-color: #bbf7d0; }
.vpn-disconnected { background: var(--fleet-status-error-light); color: var(--fleet-status-error); border-color: #fecaca; }
.uptime-fresh, .uptime-just_rebooted { background: #f0fdf4; color: var(--fleet-status-success); border-color: #bbf7d0; }
.uptime-normal { background: var(--fleet-off-white); color: var(--fleet-black-75); }
.uptime-stale_7d { background: #fffbeb; color: var(--fleet-status-warning-dark); border-color: #fde68a; }
.uptime-stale_14d { background: var(--fleet-status-error-light); color: var(--fleet-status-error); border-color: #fecaca; }

.crash-section { margin-bottom: 16px; }

/* Badge color mapping for process classes & tiers */
.quality-badge.user_app { background: #eff6ff; color: #1e40af; }
.quality-badge.mgmt_agent { background: #faf5ff; color: #6b21a8; }
.quality-badge.system { background: var(--fleet-off-white); color: var(--fleet-black-75); }
.quality-badge.other { background: var(--fleet-off-white); color: var(--fleet-black-50); }
.quality-badge.normal { background: #f0fdf4; color: var(--fleet-status-success); }
.quality-badge.elevated_500mb { background: #fffbeb; color: var(--fleet-status-warning-dark); }
.quality-badge.high_1gb { background: #fff7ed; color: #9a3412; }
.quality-badge.critical_2gb { background: var(--fleet-status-error-light); color: var(--fleet-status-error); }
.quality-badge.single { background: var(--fleet-off-white); color: var(--fleet-black-75); }
.quality-badge.recurring { background: #fffbeb; color: var(--fleet-status-warning-dark); }
.quality-badge.elevated { background: #fff7ed; color: #9a3412; }
.quality-badge.critical { background: var(--fleet-status-error-light); color: var(--fleet-status-error); }
.quality-badge.active_today { background: #f0fdf4; color: var(--fleet-status-success); }
.quality-badge.active_week { background: #ecfccb; color: #3f6212; }
.quality-badge.stale_30d { background: #fffbeb; color: var(--fleet-status-warning-dark); }
.quality-badge.stale_90d { background: #fff7ed; color: #9a3412; }
.quality-badge.stale_90d_plus { background: var(--fleet-status-error-light); color: var(--fleet-status-error); }
.quality-badge.never_opened { background: var(--fleet-off-white); color: var(--fleet-black-50); }

@media (max-width: 768px) { .metrics-row, .metrics-row.six-col { grid-template-columns: 1fr; } .dashboard-header { flex-direction: column; gap: 12px; align-items: flex-start; } .search-input { width: 100%; } }
</style>
