<template>
  <div class="host-detail page-stack">
    <router-link to="/hosts" class="back-link">← All hosts</router-link>

    <!-- ─── Header ──────────────────────────────────────────── -->
    <div class="hd-header">
      <div class="hd-title-group">
        <div class="hd-title-row">
          <h1 class="hd-title">{{ displayHost(detail) || hostId }}</h1>
          <Badge v-if="staleness" :tone="staleness.tone" :label="staleness.label" :title="staleness.title" />
        </div>
        <div class="hd-subtitle">{{ specLine }}</div>
      </div>
      <div class="hd-actions">
        <a :href="fleetLink" target="_blank" rel="noopener">
          <BaseButton variant="secondary">Open in Fleet ↗</BaseButton>
        </a>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>
    <SkeletonLoader v-if="loading && !drivers" variant="chart" height="180px" />

    <!-- ─── Answer — host composite briefing hero ───────────── -->
    <section v-if="drivers" class="hd-hero">
      <div class="hero-composite">
        <span class="hero-eyebrow">Host composite</span>
        <div class="hero-grade-row">
          <span class="hero-grade" :style="{ color: heroGradeColor }">{{ composite.grade }}</span>
          <span class="hero-score">{{ composite.curr != null ? composite.curr : '—' }}<span class="hero-score-max">/100</span></span>
        </div>
        <span v-if="composite.delta != null && composite.delta !== 0" class="hero-delta" :class="composite.delta > 0 ? 'hero-delta--up' : 'hero-delta--down'">
          {{ composite.delta > 0 ? '▲' : '▼' }} {{ Math.abs(composite.delta) }} pts in 7 days · was {{ composite.prevGrade }} {{ composite.prev }}
        </span>
        <span v-else-if="composite.delta === 0" class="hero-flat">unchanged vs 7 days ago</span>
      </div>
      <div class="hero-narrative">
        <p class="hero-headline" v-html="narrativeHtml"></p>
        <p v-if="supportLine" class="hero-support">{{ supportLine }}</p>
      </div>
      <div class="hero-moved">
        <span class="hero-eyebrow">What moved — 7 days</span>
        <div v-if="movedCategories.length" class="hero-moved-list">
          <div v-for="c in movedCategories" :key="c.key" class="hero-moved-row">
            <span class="hero-moved-label">{{ c.label }}</span>
            <span class="hero-moved-delta" :class="c.delta >= 0 ? 'hero-up' : 'hero-down'">{{ c.delta >= 0 ? '+' : '−' }}{{ Math.abs(c.delta) }}</span>
          </div>
        </div>
        <span v-else class="hero-moved-empty">No category moved this week</span>
      </div>
    </section>

    <!-- ─── Why — score change drivers ──────────────────────── -->
    <section v-if="drivers" class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Why — score change drivers, last 7 days</h2>
        <span class="grammar-hint">Per-category move with the raw signal behind it</span>
      </div>
      <div class="drivers-card">
        <div class="driver-row driver-row--head">
          <span>Category</span><span>Now</span><span class="num">Before</span><span class="num">Now</span><span class="num">Change</span><span>What moved</span>
        </div>
        <div
          v-for="cat in driverRows"
          :key="cat.key"
          class="driver-row"
          :class="{ 'driver-row--primary': cat.key === drivers.primaryDriver, 'driver-row--context': cat.weight === 0 }"
        >
          <span class="driver-name">
            {{ cat.label }}
            <span v-if="cat.key === drivers.primaryDriver" class="driver-badge">Primary driver</span>
            <span v-else-if="cat.weight === 0" class="driver-not-scored">not scored</span>
          </span>
          <div class="driver-meter">
            <div class="driver-meter-fill" :style="{ width: (cat.curr || 0) + '%', background: cat.weight === 0 ? 'var(--fleet-black-33)' : signalBarColor(cat.curr) }"></div>
          </div>
          <span class="num driver-prev">{{ cat.prev ?? '—' }}</span>
          <span class="num driver-curr">{{ cat.curr ?? '—' }}</span>
          <span class="num driver-delta" :class="deltaClass(cat.delta)">{{ deltaText(cat.delta) }}</span>
          <span class="driver-moved">{{ whatMoved(cat) }}</span>
        </div>
      </div>
    </section>

    <!-- ─── Who — this host right now ───────────────────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Who — this host right now</h2>
      </div>
      <div class="who-grid">
        <div class="ram-card">
          <div class="ram-head">
            <h3 class="card-title">RAM utilization</h3>
            <span v-if="pressure.pct != null" class="ram-value" :style="{ color: utilizationColor(pressure.pct) }">
              {{ pressure.used_gb }} GB of {{ pressure.ram_gb }} GB ({{ pressure.pct }}%)
            </span>
          </div>
          <MeterBar v-if="pressure.pct != null" :value="pressure.pct" :marker="null" />
          <div class="ram-caption">
            <span>{{ pressure.free_gb != null ? `${pressure.free_gb} GB free` : 'no memory telemetry for this host' }}</span>
            <span v-if="pressure.pct >= 70" class="ram-critical">Critical — swap thrashing probable</span>
          </div>
          <div class="hd-chips">
            <Chip v-for="c in hostChips" :key="c.label" :tone="c.tone" :label="c.label" :value="c.value" :dot="false" :title="c.title" />
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat-tile" v-for="t in statTiles" :key="t.label">
            <span class="stat-label">{{ t.label }}</span>
            <span class="stat-value" :style="t.color ? { color: t.color } : {}">{{ t.value }}<span v-if="t.unit" class="stat-unit"> {{ t.unit }}</span></span>
            <span class="stat-caption">{{ t.caption }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ─── Act — evidence and remediation ──────────────────── -->
    <section class="grammar-section">
      <div class="grammar-head">
        <h2 class="grammar-title">Act — evidence and remediation</h2>
      </div>

      <div class="evidence-card">
        <Tabs v-model="activeTab" :options="evidenceTabs" variant="underline" class="evidence-tabs" />
        <div class="evidence-body">
          <template v-if="activeTab === 'crashes'">
            <DataTable v-if="crashes.length" :data="crashes" :columns="crashCols" density="compact" />
            <EmptyState v-else small title="No crashes recorded for this host (7d)" />
          </template>
          <template v-else-if="activeTab === 'patches'">
            <DataTable v-if="patches.length" :data="patches" :columns="patchCols" density="compact" />
            <EmptyState v-else small title="No patch events recorded for this host" />
          </template>
          <template v-else-if="activeTab === 'processes'">
            <DataTable v-if="processes.length" :data="processes" :columns="processCols" density="compact" :maxRows="15" />
            <EmptyState v-else small title="No process telemetry for this host" />
          </template>
          <template v-else-if="activeTab === 'apps'">
            <DataTable v-if="apps.length" :data="apps" :columns="appCols" density="compact" :maxRows="15" />
            <EmptyState v-else small title="No app telemetry for this host" />
          </template>
          <template v-else-if="activeTab === 'adoption'">
            <DataTable v-if="adoption.length" :data="adoption" :columns="adoptionCols" density="compact" :maxRows="15" />
            <EmptyState v-else small title="No adoption telemetry for this host" />
          </template>
          <template v-else-if="activeTab === 'wifi'">
            <TimeSeriesChart v-if="wifiTs.length" title="" :data="wifiTs" xKey="hour" yKey="avg_rssi" :color="palette.info" />
            <EmptyState v-else small title="No Wi-Fi timeline for this host" />
          </template>
        </div>
      </div>

      <div v-if="recommendation" class="recommend-callout">
        <span class="recommend-text"><strong>Recommended:</strong> {{ recommendation }}</span>
        <a :href="fleetLink" target="_blank" rel="noopener">
          <BaseButton variant="primary" size="small">Open in Fleet ↗</BaseButton>
        </a>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { query } from '../services/api'
import Badge from '../components/base/Badge.vue'
import Chip from '../components/base/Chip.vue'
import BaseButton from '../components/base/BaseButton.vue'
import Tabs from '../components/base/Tabs.vue'
import MeterBar from '../components/base/MeterBar.vue'
import EmptyState from '../components/base/EmptyState.vue'
import SkeletonLoader from '../components/base/SkeletonLoader.vue'
import DataTable from '../components/DataTable.vue'
import TimeSeriesChart from '../components/TimeSeriesChart.vue'
import { displayHost } from '../composables/displayName'
import { buildSignalDrivers } from '../composables/scoreFormulas'
import { scoreToGrade, gradeColor } from '../composables/gradeColors'
import { utilizationColor } from '../composables/statusTones'
import { chipInfo, ageTone } from '../composables/chipAge'
import { humanizeToken } from '../composables/humanize'
import { palette } from '../composables/uiPalette'
import { useAppConfig } from '../composables/useAppConfig'
import { useNow } from '../composables/useNow'

const route = useRoute()
const hostId = computed(() => String(route.params.hostId || ''))

const { config } = useAppConfig()
const { now } = useNow()

const error = ref(null)
const loading = ref(false)
const detail = ref({})
const health = ref({})
const os = ref({})
const vpn = ref({})
const drivers = ref(null)
const mttp = ref(null)
const pressure30d = ref(null)
const crashes = ref([])
const patches = ref([])
const processes = ref([])
const apps = ref([])
const adoption = ref([])
const wifiTs = ref([])

const activeTab = ref('crashes')

// ─── Fetch (same host-scoped batch the old drawer used) ───────
async function load() {
  if (!hostId.value) return
  error.value = null
  loading.value = true
  const id = hostId.value
  try {
    const [det, wTs, appRows, h, o, v, crashRows, procRows, adoptRows, patchRows, signalsCompare, mttpRows, pressRows] = await Promise.all([
      query('firehose.devices.detail', { hostId: id }).catch(() => []),
      query('firehose.wifi.device_timeseries', { hostId: id }).catch(() => []),
      query('firehose.apps.per_device', { hostId: id }).catch(() => []),
      query('firehose.health.device_list', { hostId: id, limit: 1 }).catch(() => []),
      query('firehose.health.os_list', { hostId: id, limit: 1 }).catch(() => []),
      query('firehose.vpn.list', { hostId: id, limit: 1 }).catch(() => []),
      query('firehose.crashes.per_device', { hostId: id }).catch(() => []),
      query('firehose.processes.per_device', { hostId: id }).catch(() => []),
      query('firehose.adoption.per_device', { hostId: id }).catch(() => []),
      query('firehose.scores.device_top_patches', { hostIdentifier: id, limit: 12 }).catch(() => []),
      query('firehose.scores.device_signals_compare', { hostId: id }).catch(() => []),
      query('firehose.scores.device_mttp', { hostIdentifier: id }).catch(() => []),
      // 30d pressure pattern (same source as the Lifecycle verdicts) — a
      // point-in-time "severe" is a workload moment; the pattern is the story.
      query('firehose.lifecycle.refresh_candidates', { hostId: id, limit: 1 }).catch(() => []),
    ])
    detail.value = det[0] || {}
    wifiTs.value = wTs || []
    apps.value = appRows || []
    health.value = h[0] || {}
    os.value = o[0] || {}
    vpn.value = v[0] || {}
    crashes.value = crashRows || []
    processes.value = procRows || []
    adoption.value = adoptRows || []
    patches.value = patchRows || []
    drivers.value = buildSignalDrivers((signalsCompare || [])[0])
    mttp.value = (mttpRows || [])[0] || null
    pressure30d.value = (pressRows || [])[0] || null
  } catch (e) {
    error.value = `Host detail: ${e.message}`
  }
  loading.value = false
}

onMounted(load)
watch(hostId, load)

// ─── Header ───────────────────────────────────────────────────
const specLine = computed(() => {
  const d = detail.value
  const parts = [
    d.hardware_model,
    d.cpu_brand || humanizeToken(String(health.value.cpu_class || '')),
    d.memory_gb ? `${d.memory_gb} GB RAM` : null,
    d.os_version || os.value.os_version,
  ].filter(Boolean)
  return parts.join(' · ') || '—'
})

const staleness = computed(() => {
  const lastSeenIso = detail.value?.last_seen
  if (!lastSeenIso) return null
  const lastSeenMs = new Date(lastSeenIso).getTime()
  if (!isFinite(lastSeenMs)) return null
  const m = Math.max(0, (now.value - lastSeenMs) / 60000)
  const title = `Last seen ${new Date(lastSeenMs).toLocaleString()}`
  const ago = m < 1 ? 'just now' : m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
  if (m < 1440) return { tone: 'good', label: `Last checked in ${ago}`, title }
  if (m < 1440 * 7) return { tone: 'fair', label: `Last checked in ${ago}`, title }
  return { tone: 'critical', label: `Last checked in ${ago}`, title }
})

// Fleet deep-link: /hosts/manage?query=<host UUID> — the UUID is unique and
// indexed by Fleet's host search, so the link resolves to exactly this host.
const fleetLink = computed(() => {
  const base = (config.value.fleetUrl || '').replace(/\/$/, '')
  return `${base}/hosts/manage?query=${encodeURIComponent(hostId.value || '')}`
})

// ─── Answer hero ──────────────────────────────────────────────
// Composite computed from the same category rules that produce the driver
// rows, so the hero and the Why table can never disagree.
const composite = computed(() => {
  const cats = drivers.value?.categories?.filter(c => c.weight > 0) || []
  if (!cats.length) return { curr: null, prev: null, delta: null, grade: '—', prevGrade: '—' }
  let curr = 0, prev = 0, hasPrev = true
  for (const c of cats) {
    curr += (c.curr || 0) * c.weight
    if (c.prev == null) hasPrev = false
    else prev += c.prev * c.weight
  }
  curr = Math.round(curr)
  prev = hasPrev ? Math.round(prev) : null
  return {
    curr,
    prev,
    delta: prev != null ? curr - prev : null,
    grade: scoreToGrade(curr) || '—',
    prevGrade: prev != null ? scoreToGrade(prev) : '—',
  }
})

const heroGradeColor = computed(() => {
  const g = composite.value.grade
  // On navy, F-red and D-orange read better slightly lifted
  if (g === 'F') return '#ff8a8a'
  if (g === 'D') return '#f0885f'
  return gradeColor(g)
})

const primaryCat = computed(() =>
  drivers.value?.categories?.find(c => c.key === drivers.value.primaryDriver) || null
)

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Narrative: primary driver + its strongest moved signal, all data-derived.
// A missing 7-day baseline is stated as missing — never spun as "steady".
const narrativeHtml = computed(() => {
  const p = primaryCat.value
  const d = composite.value.delta
  if (d == null) {
    const c = composite.value
    return c.curr != null
      ? `Not enough 7-day history to compare yet — current standing is <span class="hl">${esc(c.grade)} ${c.curr}/100</span>.`
      : `No score history for this host yet.`
  }
  if (!p || p.delta == null || d === 0) {
    return `This host is holding steady — no category moved materially in the last 7 days.`
  }
  const dir = d < 0 ? 'dropped' : 'recovered'
  const sig = (p.signals || []).filter(s => s.is_driver)[0]
  const sigTxt = sig
    ? ` — ${esc(sig.label.toLowerCase())} went from <span class="hl">${esc(sig.prev_display ?? '—')}</span> to <span class="hl">${esc(sig.curr_display ?? '—')}</span>`
    : ''
  return `This host ${dir} ${Math.abs(d)} points in 7 days. <span class="hl">${esc(p.label)}</span> is the primary driver (${p.delta > 0 ? '+' : ''}${p.delta})${sigTxt}.`
})

const supportLine = computed(() => {
  const facts = []
  const m = mttp.value
  if (m && Number(m.n_patches)) facts.push(`patches apply in ${Number(m.avg_lag).toFixed(1)}d on average`)
  const up = Number(os.value.uptime_days)
  if (isFinite(up) && up >= 14) facts.push(`no reboot in ${Math.round(up)} days`)
  const swap = health.value.swap_pressure
  if (swap === 'severe' || swap === 'elevated') {
    const pat = swapPattern.value
    if (pat?.sustained) facts.push(`sustained severe swap (${pat.severe} of ${pat.report} days)`)
    else if (pat) facts.push(`swap ${swap} today — only ${pat.severe} of ${pat.report} days severe, likely transient`)
    else facts.push(`swap pressure ${swap}`)
  }
  const crashN = crashes.value.reduce((s, c) => s + (Number(c.crash_count_7d ?? c.total_crashes_7d ?? c.crash_count) || 0), 0)
  if (crashN > 0) facts.push(`${crashN} crash${crashN === 1 ? '' : 'es'} this week`)
  if (!facts.length) return ''
  return facts[0].charAt(0).toUpperCase() + facts.slice(0, 3).join(' · ').slice(1) + '.'
})

const movedCategories = computed(() =>
  (drivers.value?.categories || [])
    .filter(c => c.delta != null && c.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
)

// ─── Why table ────────────────────────────────────────────────
const driverRows = computed(() => {
  const cats = drivers.value?.categories || []
  // Scored categories first (primary on top), context (weight 0) last.
  return [...cats].sort((a, b) => {
    if (a.key === drivers.value.primaryDriver) return -1
    if (b.key === drivers.value.primaryDriver) return 1
    return (b.weight || 0) - (a.weight || 0)
  })
})

function whatMoved(cat) {
  const sigs = cat.signals || []
  const driver = sigs.find(s => s.is_driver)
  if (driver) return `${driver.label} ${driver.prev_display ?? '—'} → ${driver.curr_display ?? '—'}`
  if (cat.delta == null) return 'No 7-day history for this category'
  if (cat.delta === 0) {
    const worst = [...sigs].filter(s => s.curr_score != null).sort((a, b) => a.curr_score - b.curr_score)[0]
    return worst ? `No change · ${worst.label.toLowerCase()} ${worst.curr_display ?? ''}` : 'No change'
  }
  return '—'
}

function deltaText(d) {
  if (d == null) return '—'
  if (d === 0) return '0'
  return `${d > 0 ? '+' : '−'}${Math.abs(d)}`
}
function deltaClass(d) {
  if (d == null || d === 0) return 'delta-flat'
  return d > 0 ? 'delta-up' : 'delta-down'
}
function signalBarColor(score) {
  if (score == null) return 'var(--fleet-black-25)'
  if (score >= 75) return palette.good
  if (score >= 60) return palette.fair
  if (score >= 40) return palette.elevated
  return palette.critical
}

// ─── Who row ──────────────────────────────────────────────────
const pressure = computed(() => {
  const d = detail.value
  if (!d.memory_gb || !d.total_memory_mb) return {}
  const ram = Number(d.memory_gb)
  const used = Number(d.total_memory_mb) / 1024
  const pct = Math.round((used / ram) * 1000) / 10
  return { ram_gb: ram, used_gb: Math.round(used * 10) / 10, free_gb: Math.round((ram - used) * 10) / 10, pct }
})

// 30d swap pattern: "severe" right now is a workload moment; whether it's
// chronic is what actually reads as over-utilization. Sustained = severe on
// >=50% of >=5 reporting days (same rule as the Lifecycle verdicts).
const swapPattern = computed(() => {
  const p = pressure30d.value
  if (!p) return null
  const report = Number(p.days_reporting_30d) || 0
  const severe = Number(p.days_severe_30d) || 0
  if (report < 5) return null
  return { severe, report, sustained: severe >= Math.max(3, report * 0.5) }
})

const hostChips = computed(() => {
  const chips = []
  const info = chipInfo(health.value.cpu_class)
  if (info) chips.push({ label: 'cpu', value: `${info.pretty} (${info.year ?? '—'})`, tone: ageTone(info.gensBehind) })
  if (health.value.ram_tier) chips.push({ label: 'ram', value: String(health.value.ram_tier).toUpperCase(), tone: String(health.value.ram_tier).toLowerCase() === '8gb' ? 'elevated' : 'neutral' })
  const swap = health.value.swap_pressure
  if (swap) {
    const pat = swapPattern.value
    if (pat) {
      // Tone follows the PATTERN, not the instant: chronic severe is
      // critical; a severe moment on an otherwise-quiet host is fair.
      const chronic = pat.sustained
      chips.push({
        label: 'swap',
        value: `${swap} · ${pat.severe}/${pat.report}d severe`,
        tone: chronic ? 'critical' : swap === 'severe' || swap === 'elevated' ? 'fair' : 'good',
        title: chronic
          ? `Severe swap on ${pat.severe} of ${pat.report} reporting days — chronic over-utilization, not a one-off`
          : `Swap ${swap} right now, but severe on only ${pat.severe} of ${pat.report} days in the last 30 — reads as a workload spike, not chronic strain`,
      })
    } else {
      chips.push({ label: 'swap', value: `${swap} · <5d history`, tone: 'neutral', title: 'Not enough reporting days in the last 30 to judge whether this is a pattern' })
    }
  }
  const batt = health.value.battery_health_score
  if (batt) chips.push({ label: 'battery', value: health.value.battery_percent ? `${batt} (${health.value.battery_percent}%)` : batt, tone: batt === 'replace' ? 'critical' : batt === 'degraded' ? 'fair' : 'good' })
  if (os.value.os_version) chips.push({ label: 'os', value: String(os.value.os_version), tone: 'neutral' })
  const curr = os.value.os_currency
  if (curr && curr !== 'current') chips.push({ label: 'os currency', value: humanizeToken(String(curr), { capitalize: false }), tone: curr === 'legacy' ? 'critical' : 'elevated' })
  const up = Number(os.value.uptime_days)
  if (isFinite(up) && up > 0) chips.push({ label: 'uptime', value: `${Math.round(up)}d`, tone: up >= 14 ? 'elevated' : up >= 7 ? 'fair' : 'neutral' })
  const conf = vpn.value.network_confidence
  if (conf) chips.push({ label: 'network', value: humanizeToken(String(conf), { capitalize: false }), tone: conf === 'disconnected' ? 'critical' : conf === 'proxy_suspected' ? 'fair' : 'neutral' })
  return chips
})

function formatUptime(seconds) {
  if (!seconds) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`
}

const statTiles = computed(() => {
  const m = mttp.value
  const crashN = crashes.value.reduce((s, c) => s + (Number(c.crash_count_7d ?? c.total_crashes_7d ?? c.crash_count) || 0), 0)
  return [
    {
      label: 'Time to patch',
      value: m && Number(m.n_patches) ? Number(m.avg_lag).toFixed(1) : '—',
      unit: m && Number(m.n_patches) ? 'days' : '',
      caption: m && Number(m.n_patches) ? `${m.n_patches} patches · ${Number(m.min_lag)}–${Number(m.max_lag)}d range` : 'no patches recorded',
      color: m && Number(m.avg_lag) > 14 ? palette.critical : null,
    },
    // 0 is the "no reading" sentinel on Wi-Fi metrics — show absence, not a number.
    {
      label: 'Wi-Fi SNR',
      value: Number(detail.value.snr) ? detail.value.snr : '—',
      unit: Number(detail.value.snr) ? 'dB' : '',
      caption: Number(detail.value.snr) && detail.value.signal_quality ? `quality: ${detail.value.signal_quality}` : 'no recent reading',
    },
    {
      label: 'Tx rate',
      value: Number(detail.value.transmit_rate) ? detail.value.transmit_rate : '—',
      unit: Number(detail.value.transmit_rate) ? 'Mbps' : '',
      caption: Number(detail.value.rssi) ? `${detail.value.rssi} dBm` : 'no recent reading',
    },
    { label: 'fleetd', value: detail.value.version || '—', unit: '', caption: 'agent version' },
    {
      label: 'Uptime',
      value: formatUptime(Number(detail.value.uptime_seconds)),
      unit: '',
      caption: Number(os.value.uptime_days) >= 14 ? 'reboot recommended' : '',
      color: Number(os.value.uptime_days) >= 14 ? palette.fairText : null,
    },
    { label: 'Crashes 7d', value: crashN, unit: '', caption: crashes.value.length ? `${crashes.value.length} distinct process${crashes.value.length === 1 ? '' : 'es'}` : 'none recorded', color: crashN > 4 ? palette.elevated : null },
  ]
})

// ─── Act ──────────────────────────────────────────────────────
const evidenceTabs = computed(() => [
  { value: 'crashes', label: 'Crashes', count: crashes.value.length || undefined },
  { value: 'patches', label: 'Recent patches', count: patches.value.length || undefined },
  { value: 'processes', label: 'Process health', count: processes.value.length || undefined },
  { value: 'apps', label: 'Running apps', count: apps.value.length || undefined },
  { value: 'adoption', label: 'App adoption', count: adoption.value.length || undefined },
  { value: 'wifi', label: 'Wi-Fi timeline' },
])

const crashCols = [
  { key: 'crashed_identifier', label: 'Identifier', mono: true },
  { key: 'crash_count_7d', label: 'Count 7d' },
  { key: 'crash_severity', label: 'Severity', tone: v => v === 'critical' ? 'critical' : v === 'elevated' ? 'elevated' : v === 'recurring' ? 'fair' : null },
  { key: 'last_crash', label: 'Last crash' },
]
const patchCols = [
  { key: 'software_name', label: 'Software' },
  { key: 'old_version', label: 'From', mono: true },
  { key: 'new_version', label: 'To', mono: true },
  { key: 'days_to_patch', label: 'Lag (d)', tone: v => Number(v) > 14 ? 'critical' : Number(v) > 7 ? 'fair' : null },
  { key: 'event_time', label: 'Applied' },
]
const processCols = [
  { key: 'process_name', label: 'Process', mono: true },
  { key: 'avg_rss_mb', label: 'Avg MB' },
  { key: 'max_rss_mb', label: 'Peak MB', tone: v => Number(v) > 4096 ? 'critical' : Number(v) > 2048 ? 'fair' : null },
  { key: 'process_class', label: 'Class' },
]
const appCols = [
  { key: 'app_name', label: 'App' },
  { key: 'memory_mb', label: 'Memory MB' },
  { key: 'threads', label: 'Threads' },
]
const adoptionCols = [
  { key: 'app_name', label: 'App' },
  { key: 'usage_tier', label: 'Usage', tone: v => String(v).startsWith('stale') ? 'fair' : v === 'never_opened' ? 'elevated' : null },
  { key: 'days_since_opened', label: 'Days since opened' },
]

// Recommended action: derived from the primary driver's playbook.
const recommendation = computed(() => {
  const p = primaryCat.value
  if (!p || composite.value.delta == null || composite.value.delta >= 0) {
    const worstCat = [...(drivers.value?.categories || [])].filter(c => c.weight > 0 && c.curr != null).sort((a, b) => a.curr - b.curr)[0]
    if (!worstCat || worstCat.curr >= 75) return ''
    return `${worstCat.label} is this host's weakest category (${worstCat.curr}/100) — start there.`
  }
  const ACTIONS = {
    software: 'check the patch pipeline for this host — its patch lag is what moved the score',
    performance: 'investigate the workload: sustained memory pressure suggests the host is under-provisioned or running something heavy',
    device_health: 'inspect the hardware — battery or memory strain moved the score',
    security: 'review the security posture profile — a compliance signal changed',
    network: 'check Wi-Fi placement or interface — signal quality moved',
  }
  const act = ACTIONS[p.key] || 'inspect the primary driver above'
  const recover = Math.abs(Math.round((p.delta || 0) * p.weight))
  return `${act.charAt(0).toUpperCase() + act.slice(1)}. Recovering ${p.label.toLowerCase()} alone returns ~${recover} composite point${recover === 1 ? '' : 's'}.`
})
</script>

<style scoped>
.host-detail {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--pad-large);
}

.back-link {
  font-size: var(--font-size-base);
  color: var(--fleet-black-75);
  text-decoration: none;
  font-weight: 500;
  align-self: flex-start;
}
.back-link:hover { color: var(--fleet-black); }

/* ─── Header ───────────────────────────────────── */
.hd-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--pad-large);
}

.hd-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hd-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--fleet-black);
}

.hd-subtitle {
  font-size: var(--font-size-base);
  color: var(--fleet-black-75);
  margin-top: 3px;
}

.hd-actions { display: flex; gap: 8px; }
.hd-actions a { text-decoration: none; }

/* ─── Hero (shared briefing language) ──────────── */
.hd-hero {
  background: var(--fleet-black);
  border-radius: var(--radius-xlarge);
  padding: var(--pad-xlarge) 32px;
  display: grid;
  grid-template-columns: 280px 1fr 280px;
  gap: 40px;
  align-items: center;
  color: var(--fleet-white);
}

.hero-eyebrow {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black-50);
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.hero-composite { display: flex; flex-direction: column; gap: 8px; }
.hero-grade-row { display: flex; align-items: baseline; gap: 14px; }
.hero-grade { font-size: 72px; font-weight: 700; line-height: 0.9; }
.hero-score { font-size: 36px; font-weight: 600; line-height: 1; }
.hero-score-max { font-size: 16px; color: var(--fleet-black-50); font-weight: 500; }

.hero-delta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 3px 9px;
  border-radius: var(--radius);
  font-size: var(--font-size-sm);
  font-weight: 600;
}
.hero-delta--up { background: rgba(0, 154, 125, 0.18); color: var(--status-good-soft); }
.hero-delta--down { background: rgba(235, 67, 67, 0.22); color: #ff9a9a; }
.hero-flat { font-size: var(--font-size-sm); color: var(--fleet-black-50); }

.hero-narrative {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-left: 1px solid var(--fleet-blue);
  padding-left: 40px;
}
.hero-headline { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.35; text-wrap: pretty; }
.hero-headline :deep(.hl) { color: var(--status-fair); }
.hero-support { margin: 0; font-size: var(--font-size-base); line-height: 1.6; color: var(--fleet-black-33); }

.hero-moved { display: flex; flex-direction: column; gap: 10px; }
.hero-moved-list { display: flex; flex-direction: column; gap: 8px; }
.hero-moved-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-medium);
}
.hero-moved-label { font-size: var(--font-size-base); }
.hero-moved-delta { font-family: var(--font-mono); font-size: var(--font-size-base); font-weight: 700; }
.hero-up { color: var(--status-good-soft); }
.hero-down { color: #ff9a9a; }
.hero-moved-empty { font-size: var(--font-size-sm); color: var(--fleet-black-50); font-style: italic; }

/* ─── Grammar sections ─────────────────────────── */
.grammar-section { display: flex; flex-direction: column; gap: var(--pad-smedium); }
.grammar-head { display: flex; align-items: baseline; justify-content: space-between; }
.grammar-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--fleet-black); }
.grammar-hint { font-size: var(--font-size-sm); color: var(--fleet-black-50); }

/* ─── Why: driver rows ─────────────────────────── */
.drivers-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  overflow: hidden;
}

.driver-row {
  display: grid;
  grid-template-columns: 190px 1fr 60px 60px 70px 1.2fr;
  align-items: center;
  gap: 16px;
  padding: 14px var(--pad-large);
  border-bottom: 1px solid var(--fleet-black-5);
}
.driver-row:last-child { border-bottom: 0; }

.driver-row--head {
  padding: 10px var(--pad-large);
  background: var(--fleet-off-white);
  border-bottom: 1px solid var(--fleet-black-10);
  font-size: var(--font-size-xxsmall);
  font-weight: 600;
  color: var(--fleet-black-50);
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.driver-row--primary { background: rgba(0, 154, 125, 0.05); }
.driver-row--context { opacity: 0.65; }

.driver-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--fleet-black);
}
.driver-row--primary .driver-name { font-weight: 700; }

.driver-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  border-radius: 3px;
  background: var(--info-tint);
  color: var(--fleet-vibrant-blue);
  font-size: var(--font-size-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  white-space: nowrap;
}
.driver-not-scored { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); }

.driver-meter { height: 8px; background: var(--fleet-black-5); border-radius: var(--radius-full); overflow: hidden; }
.driver-meter-fill { height: 100%; transition: width 400ms ease-out; }

.num { text-align: right; }
.driver-prev { font-size: var(--font-size-base); color: var(--fleet-black-50); }
.driver-curr { font-size: var(--font-size-base); font-weight: 700; color: var(--fleet-black); }
.driver-delta { font-family: var(--font-mono); font-size: var(--font-size-base); font-weight: 700; }
.delta-up { color: var(--status-good); }
.delta-down { color: var(--status-critical); }
.delta-flat { color: var(--fleet-black-50); }

.driver-moved { font-size: var(--font-size-sm); color: var(--fleet-black-75); }

/* ─── Who ──────────────────────────────────────── */
.who-grid {
  display: grid;
  grid-template-columns: 420px 1fr;
  gap: var(--pad-medium);
  align-items: start;
}

.ram-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ram-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.card-title { margin: 0; font-size: var(--font-size-md); font-weight: 700; color: var(--fleet-black); }
.ram-value { font-size: var(--font-size-base); font-weight: 600; }
.ram-caption { display: flex; align-items: baseline; justify-content: space-between; font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.ram-critical { color: var(--status-critical); font-weight: 600; }

.hd-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--fleet-black-5);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--pad-smedium);
}

.stat-tile {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-label { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.stat-value { font-size: 20px; font-weight: 700; color: var(--fleet-black); }
.stat-unit { font-size: var(--font-size-sm); color: var(--fleet-black-50); font-weight: 500; }
.stat-caption { font-size: var(--font-size-xxsmall); color: var(--fleet-black-50); min-height: 13px; }

/* ─── Act ──────────────────────────────────────── */
.evidence-card {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  overflow: hidden;
}

.evidence-tabs { padding: 0 var(--pad-medium); border-bottom: 1px solid var(--fleet-black-10); display: flex; }
.evidence-body { padding: var(--pad-medium) var(--pad-large) var(--pad-large); }

.recommend-callout {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px var(--pad-large);
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
}
.recommend-text { font-size: var(--font-size-base); color: var(--fleet-black-75); text-wrap: pretty; }
.recommend-text strong { color: var(--fleet-black); }
.recommend-callout a { margin-left: auto; flex-shrink: 0; text-decoration: none; }

@media (max-width: 1100px) {
  .hd-hero { grid-template-columns: 1fr; gap: 20px; }
  .hero-narrative { border-left: none; padding-left: 0; }
  .who-grid { grid-template-columns: 1fr; }
  .driver-row { grid-template-columns: 150px 1fr 50px 50px 60px 1fr; }
}
</style>
