<template>
  <div class="experience-score">
    <!-- ─── Page Header with Time Range ────────────────────── -->
    <section class="page-header">
      <div class="header-left">
        <h2 class="page-title">Experience score</h2>
        <span class="header-subtitle">Fleet-wide digital employee experience</span>
      </div>
      <div class="header-right">
        <TimeRangeFilter />
        <div class="comparison-label">
          vs. prior {{ comparisonLabel }}
        </div>
      </div>
    </section>

    <!-- ─── Fleet Composite Grade Hero ─────────────────────── -->
    <section class="hero-section">
      <GradeCard
        label="Fleet experience score"
        :grade="fleet.grade"
        :score="fleet.score"
        :delta="fleet.delta"
        :sparklineData="fleet.sparkline"
        :loading="loading.fleet"
        :subtitle="fleet.deviceCount ? `${fleet.deviceCount} devices` : ''"
      />
    </section>

    <!-- ─── Category Grade Cards ───────────────────────────── -->
    <section class="category-cards">
      <GradeCard
        v-for="cat in categories"
        :key="cat.key"
        :label="cat.label"
        :grade="cat.grade"
        :score="cat.score"
        :delta="cat.delta"
        :sparklineData="cat.sparkline"
        :loading="loading.categories"
        :clickable="true"
        @click="toggleSignals(cat.key)"
      />
    </section>

    <!-- ─── Signal Breakdown (appears when category card clicked) ── -->
    <section v-if="expandedCategory" class="signal-breakdown">
      <div class="chart-container">
        <div class="breakdown-header">
          <h3>{{ expandedCategoryLabel }} — Signal Breakdown</h3>
          <div class="breakdown-actions">
            <button class="info-toggle" @click="showMethodology = !showMethodology">
              {{ showMethodology ? 'Hide' : 'How is this scored?' }}
            </button>
            <button class="close-btn" @click="expandedCategory = null">Close</button>
          </div>
        </div>

        <!-- Methodology info popup -->
        <div v-if="showMethodology" class="methodology-box">
          <div v-if="expandedCategory === 'software'" class="method-content">
            <p><strong>Patch Velocity</strong> measures the gap between when a patch first appears on any fleet device and when each device applies it. The first device to update sets the "available" date — we then track how many days each other device trails behind. Faster patching = higher score.</p>
            <p><strong>Software Usage</strong> compares install time vs. last-opened time to classify every app as daily active, weekly, monthly, or shelfware (90+ days unopened). System utilities (Activity Monitor, Disk Utility, Font Book, etc.) are excluded — they're always installed but rarely opened, so counting them as shelfware would be misleading. Only user-installed and productivity apps are scored.</p>
          </div>
          <div v-else-if="expandedCategory === 'performance'" class="method-content">
            <p>Scores are computed from real-time telemetry: memory pressure, disk utilization, top-5 process memory footprint, and days since last reboot. Each signal is weighted and scored against fleet-wide thresholds.</p>
          </div>
          <div v-else-if="expandedCategory === 'network'" class="method-content">
            <p>WiFi signal strength (RSSI), noise floor, and transmit rate are measured continuously. Scores reflect connection quality — not bandwidth tests — because poor WiFi is the #1 cause of perceived "slow computer" complaints.</p>
          </div>
          <div v-else-if="expandedCategory === 'security'" class="method-content">
            <p>Binary compliance checks: is disk encrypted, firewall on, SIP enabled, Gatekeeper active? Plus OS currency — devices behind on updates carry known vulnerabilities. Each signal is weighted by risk severity.</p>
          </div>
          <div v-else class="method-content">
            <p>Hardware capability scoring: disk capacity for storage headroom and estimated device age. Older hardware with limited storage directly impacts employee productivity.</p>
          </div>
        </div>

        <div class="signal-list">
          <div v-for="sig in signals" :key="sig.name" class="signal-row">
            <div class="signal-info">
              <span class="signal-name">{{ sig.name }}</span>
              <span class="signal-weight">{{ (sig.weight * 100).toFixed(0) }}% weight</span>
              <span v-if="sig.detail" class="signal-detail">{{ sig.detail }}</span>
            </div>
            <div class="signal-bar-track">
              <div
                class="signal-bar-fill"
                :style="{ width: sig.score + '%', backgroundColor: signalColor(sig.score) }"
              ></div>
            </div>
            <span class="signal-score">{{ sig.score.toFixed(0) }}</span>
          </div>
        </div>

        <!-- ─── Software Detail: Patch Velocity + Usage Tables ──── -->
        <template v-if="expandedCategory === 'software'">
          <div class="software-detail">
            <div class="detail-section">
              <h4>Fleet Software Health</h4>
              <div class="patch-stats">
                <div class="patch-stat">
                  <span class="stat-value">{{ patchStats.pctCurrent || '—' }}%</span>
                  <span class="stat-label">fleet on current OS</span>
                </div>
                <div class="patch-stat">
                  <span class="stat-value">{{ mostUsedApps.length }}</span>
                  <span class="stat-label">crashing apps (7d)</span>
                </div>
                <div class="patch-stat">
                  <span class="stat-value">{{ leastUsedApps.length }}</span>
                  <span class="stat-label">stale apps (90d+)</span>
                </div>
              </div>
            </div>

            <div class="usage-tables">
              <div class="detail-section">
                <h4>Recent Crashes</h4>
                <div v-if="mostUsedApps.length" class="app-list">
                  <div v-for="app in mostUsedApps" :key="app.app_name">
                    <div class="app-row">
                      <span class="app-name">{{ app.app_name }}</span>
                      <span class="app-devices stale">{{ app.device_count }} devices</span>
                      <GradeBadge :grade="app.usage_grade" />
                    </div>
                  </div>
                </div>
                <div v-else class="good-news">No crashes in the last 7 days</div>
              </div>
              <div class="detail-section">
                <h4>Stale Apps (90d+ unused)</h4>
                <div class="app-list">
                  <div v-for="app in leastUsedApps" :key="app.app_name">
                    <div class="app-row" :class="{ clickable: !wcMode }" @click="!wcMode && toggleAppDrill(app.app_name, 'stale')">
                      <span class="app-name">{{ app.app_name }}</span>
                      <span class="app-devices stale">{{ app.stale_count }} devices unused</span>
                      <span class="app-avg-days">{{ app.avg_days }}d avg</span>
                      <span v-if="!wcMode" class="drill-arrow">{{ drillApp === app.app_name ? '▾' : '▸' }}</span>
                    </div>
                    <div v-if="drillApp === app.app_name && !wcMode" class="device-drill">
                      <div v-if="drillLoading" class="drill-loading">Loading devices...</div>
                      <div v-else class="drill-device-list">
                        <div v-for="d in drillDevices" :key="d.host_identifier" class="drill-device-row">
                          <span class="drill-hostname">{{ d.hostname }}</span>
                          <span class="drill-version">v{{ d.app_version }}</span>
                          <span class="drill-usage" :class="d.usage_category">{{ d.usage_category }}</span>
                          <span class="drill-days">{{ d.days_since_opened }}d since opened</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="wcMode" class="wc-drill-notice">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Per-device app drill-down disabled — Workers Council mode active
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>

    <!-- ─── Distribution + Movers Row ──────────────────────── -->
    <section class="two-col">
      <GradeDistribution
        :title="expandedCategory ? `${expandedCategoryLabel} grade distribution` : 'Fleet grade distribution'"
        :data="distribution"
        :loading="loading.distribution"
      />
      <BiggestMovers
        title="Biggest movers (WoW)"
        :data="movers"
        :loading="loading.movers"
        :fetchDetail="fetchMoverDetail"
      />
    </section>

    <!-- ─── Fleet Comparison ────────────────────────────────── -->
    <section class="full-width">
      <TeamComparisonBar
        title="Fleet comparison"
        :data="teams"
        :loading="loading.teams"
      />
    </section>

    <!-- ─── Dimension Breakdown ────────────────────────────── -->
    <section class="full-width">
      <DimensionBreakdown
        :data="dimensionData"
        :loading="loading.dimensions"
        @row-click="onDimensionClick"
      />
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { query } from '../services/api'
import { useFleetFilter } from '../composables/useFleetFilter'
import { useTimeRange } from '../composables/useTimeRange'
import TimeRangeFilter from '../components/TimeRangeFilter.vue'
import GradeCard from '../components/GradeCard.vue'
import GradeBadge from '../components/GradeBadge.vue'
import { useWorkersCouncil } from '../composables/useWorkersCouncil'
import GradeDistribution from '../components/GradeDistribution.vue'
import BiggestMovers from '../components/BiggestMovers.vue'
import TeamComparisonBar from '../components/TeamComparisonBar.vue'
import DimensionBreakdown from '../components/DimensionBreakdown.vue'

const { filterParams, setOSFilter, setModelFilter, setRAMFilter } = useFleetFilter()
const { wcMode } = useWorkersCouncil()
const { timeRangeHours, selectedRange } = useTimeRange()

// ─── Query params (replaces all SQL fragment computeds) ───────
const queryParams = computed(() => ({
  timeRange: timeRangeHours.value,
  ...filterParams.value
}))

const comparisonLabel = computed(() => {
  const labels = { '1h': 'hour', '6h': '6 hours', '1d': 'day', '7d': 'week', '30d': '30 days' }
  return labels[selectedRange.value] || 'period'
})

// ─── State ────────────────────────────────────────────────────
const loading = ref({
  fleet: false,
  categories: false,
  distribution: false,
  movers: false,
  teams: false,
  dimensions: false
})

const fleet = ref({ grade: '—', score: null, delta: null, sparkline: [], deviceCount: 0 })
const categories = ref([
  { key: 'device_health', label: 'Device Health', grade: '—', score: null, delta: null, sparkline: [] },
  { key: 'performance', label: 'Performance', grade: '—', score: null, delta: null, sparkline: [] },
  { key: 'network', label: 'Network', grade: '—', score: null, delta: null, sparkline: [] },
  { key: 'security', label: 'Security', grade: '—', score: null, delta: null, sparkline: [] },
  { key: 'software', label: 'Software', grade: '—', score: null, delta: null, sparkline: [] }
])
const distribution = ref({})
const movers = ref([])
const teams = ref([])
const dimensionData = ref({ os: [], model: [], ram: [], team: [] })
const expandedCategory = ref(null)
const signals = ref([])
const showMethodology = ref(false)

// Software detail state
const patchStats = ref({})
const patchTimeline = ref([])
const mostUsedApps = ref([])
const leastUsedApps = ref([])

// App drill-down state
const drillApp = ref(null)
const drillDevices = ref([])
const drillLoading = ref(false)

const expandedCategoryLabel = computed(() => {
  const cat = categories.value.find(c => c.key === expandedCategory.value)
  return cat?.label || ''
})

// ─── Grade helper ─────────────────────────────────────────────
function scoreToGrade(score) {
  if (score === null || score === undefined || score < 0) return '—'
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

// ─── Fetch Fleet Score ────────────────────────────────────────
async function fetchFleetScore() {
  loading.value.fleet = true
  try {
    const [summaryRows] = await Promise.all([
      query('firehose.scores.fleet_summary'),
    ])

    const score = summaryRows[0]?.avg_score ?? null
    const count = summaryRows[0]?.device_count ?? 0

    fleet.value = {
      grade: scoreToGrade(score),
      score,
      delta: null,  // No comparison period in firehose yet
      sparkline: [],
      deviceCount: count
    }
  } catch (e) {
    console.error('Fleet score fetch failed:', e)
  }
  loading.value.fleet = false
}

// ─── Fetch Category Scores ────────────────────────────────────
async function fetchCategoryScores() {
  loading.value.categories = true
  try {
    const [rows] = await Promise.all([
      query('firehose.scores.categories'),
    ])

    categories.value = categories.value.map(cat => {
      const score = rows[0]?.[`avg_${cat.key}`] ?? null
      return {
        ...cat,
        score,
        grade: scoreToGrade(score),
        delta: null,  // No comparison period in firehose yet
        sparkline: []
      }
    })
  } catch (e) {
    console.error('Category scores fetch failed:', e)
  }
  loading.value.categories = false
}

// ─── Fetch Grade Distribution ─────────────────────────────────
async function fetchDistribution(category = null) {
  loading.value.distribution = true
  try {
    let rows
    if (category) {
      rows = await query('firehose.scores.grade_distribution_category', { category })
    } else {
      rows = await query('firehose.scores.grade_distribution')
    }
    const dist = {}
    for (const r of rows) {
      if (r.grade) dist[r.grade] = Number(r.cnt)
    }
    distribution.value = dist
  } catch (e) {
    console.error('Distribution fetch failed:', e)
  }
  loading.value.distribution = false
}

// ─── Fetch Biggest Movers ─────────────────────────────────────
async function fetchMovers() {
  loading.value.movers = true
  // No WoW comparison data in firehose yet — show empty
  movers.value = []
  loading.value.movers = false
}

// ─── Fetch Mover Detail (category breakdown for a device) ─────
async function fetchMoverDetail(hostId) {
  const [currRows, prevRows] = await Promise.all([
    query('scores.device_categories', { hostIdentifier: hostId, timeRange: timeRangeHours.value }),
    query('scores.device_categories', { hostIdentifier: hostId, timeRange: timeRangeHours.value })
  ])

  const curr = currRows[0] || {}
  const prev = prevRows[0] || {}

  const cats = [
    { key: 'performance', label: 'Performance', weight: 30 },
    { key: 'device_health', label: 'Device Health', weight: 25 },
    { key: 'network', label: 'Network', weight: 20 },
    { key: 'security', label: 'Security', weight: 15 },
    { key: 'software', label: 'Software', weight: 10 }
  ].map(c => {
    const currVal = curr[c.key] ?? null
    const prevVal = prev[c.key] ?? null
    const delta = (currVal !== null && prevVal !== null) ? currVal - prevVal : null
    return { ...c, curr: currVal, prev: prevVal, delta, isDriver: false }
  })

  // Mark the category with the largest absolute delta as the primary driver
  let maxDelta = 0
  let driverIdx = -1
  cats.forEach((c, i) => {
    if (c.delta !== null && Math.abs(c.delta) > maxDelta) {
      maxDelta = Math.abs(c.delta)
      driverIdx = i
    }
  })
  if (driverIdx >= 0) cats[driverIdx].isDriver = true

  // Generate insight text
  let insight = ''
  const driver = driverIdx >= 0 ? cats[driverIdx] : null
  if (driver && driver.delta !== null) {
    const dir = driver.delta > 0 ? 'improved' : 'declined'
    insight = `${driver.label} ${dir} by ${Math.abs(driver.delta).toFixed(1)} points (${driver.weight}% weight), `
    if (Math.abs(driver.delta) > 5) {
      insight += `which was the primary driver of this device's score change.`
    } else {
      insight += `contributing to a small overall shift. Multiple categories moved in the same direction.`
    }
  }

  return { categories: cats, insight }
}

// ─── Fetch Team Scores ────────────────────────────────────────
async function fetchTeams() {
  loading.value.teams = true
  // No team_id in firehose data — show empty
  teams.value = []
  loading.value.teams = false
}

// ─── Fetch Dimension Breakdowns ───────────────────────────────
async function fetchDimensions() {
  loading.value.dimensions = true
  try {
    const [cpuRows, modelRows, ramRows, swapRows] = await Promise.all([
      query('firehose.scores.dimension_cpu'),
      query('firehose.scores.dimension_model'),
      query('firehose.scores.dimension_ram'),
      query('firehose.scores.dimension_swap'),
    ])

    const mapDim = rows => rows.map(r => ({
      name: r.dimension,
      score: r.avg_score,
      count: r.device_count,
      grade: scoreToGrade(r.avg_score)
    }))
    dimensionData.value = {
      os: mapDim(cpuRows),       // CPU class (full coverage, replaces sparse OS)
      model: mapDim(modelRows),
      ram: mapDim(ramRows),
      team: mapDim(swapRows),    // Swap pressure (actionable dimension)
    }
  } catch (e) {
    console.error('Dimensions fetch failed:', e)
  }
  loading.value.dimensions = false
}

function onDimensionClick({ dimension, value }) {
  if (dimension === 'os') setOSFilter(value)
  else if (dimension === 'model') setModelFilter(value)
  else if (dimension === 'ram') setRAMFilter(value)
}

// ─── Signal Breakdown for Category Drill-down ─────────────────
function toggleSignals(categoryKey) {
  if (expandedCategory.value === categoryKey) {
    expandedCategory.value = null
    signals.value = []
    fetchDistribution(null)  // Reset to composite distribution
    return
  }
  expandedCategory.value = categoryKey
  showMethodology.value = true
  fetchSignals(categoryKey)
  fetchDistribution(categoryKey)  // Show per-category distribution
}

async function fetchSignals(categoryKey) {
  try {
    let signalDefs = []

    if (categoryKey === 'device_health') {
      const [dhRows, cpuRows, ramRows] = await Promise.all([
        query('firehose.health.device_summary'),
        query('firehose.health.cpu_distribution'),
        query('firehose.hardware.memory_tiers'),
      ])
      const dh = dhRows[0] || {}
      const total = dh.total_devices || 1
      const swapOkPct = Math.round(((total - (dh.severe_swap || 0) - (dh.elevated_swap || 0)) / total) * 100)
      const battOkPct = Math.round(((total - (dh.degraded_battery || 0) - (dh.replace_battery || 0)) / total) * 100)
      const modernCpu = cpuRows.filter(r => ['apple_m3', 'apple_m4', 'apple_m5'].includes(r.cpu_class)).reduce((s, r) => s + Number(r.device_count), 0)
      const cpuPct = Math.round((modernCpu / total) * 100)
      // RAM: % of fleet at 16 GB+ from hardware.memory_tiers
      const ramTotal = ramRows.reduce((s, r) => s + Number(r.device_count || 0), 0) || 1
      const ramGood = ramRows.filter(r => {
        const gb = parseInt(r.ram_tier) || 0
        return gb >= 16 || r.ram_tier === '16 GB' || r.ram_tier === '32 GB' || r.ram_tier === '64 GB' || r.ram_tier === '128+ GB'
      }).reduce((s, r) => s + Number(r.device_count), 0)
      const ramPct = Math.round((ramGood / ramTotal) * 100)
      signalDefs = [
        { name: 'CPU Generation', weight: 0.30, score: cpuPct, detail: `${cpuPct}% on M3 or newer` },
        { name: 'RAM Tier', weight: 0.25, score: ramPct, detail: `${ramPct}% at 16 GB or higher (${ramTotal} devices)` },
        { name: 'Battery Health', weight: 0.25, score: battOkPct, detail: `${battOkPct}% good or better` },
        { name: 'Swap Pressure', weight: 0.20, score: swapOkPct, detail: `${swapOkPct}% not elevated/severe` },
      ]
    } else if (categoryKey === 'performance') {
      const [dhRows, procRows, osRows] = await Promise.all([
        query('firehose.health.device_summary'),
        query('firehose.processes.by_class'),
        query('firehose.health.os_summary'),
      ])
      const dh = dhRows[0] || {}
      const os = osRows[0] || {}
      const total = dh.total_devices || 1
      const swapOkPct = Math.round(((total - (dh.severe_swap || 0) - (dh.elevated_swap || 0)) / total) * 100)
      // Compression: show the SQL-aligned score (65 for high, 85 for moderate, 100 for low)
      const highComp = dh.high_compression || 0
      const modComp = dh.moderate_compression || 0
      const lowComp = total - highComp - modComp
      const compScore = Math.round((lowComp * 100 + modComp * 85 + highComp * 65) / total)
      const avgRss = procRows.reduce((s, r) => s + (Number(r.avg_rss_mb) || 0), 0) / (procRows.length || 1)
      const rssScore = avgRss < 200 ? 100 : avgRss < 500 ? 80 : avgRss < 1000 ? 60 : 40
      const avgUptime = os.avg_uptime_days || 0
      const uptimeScore = avgUptime < 3 ? 100 : avgUptime < 7 ? 90 : avgUptime < 14 ? 60 : 30
      signalDefs = [
        { name: 'Swap Pressure', weight: 0.35, score: swapOkPct, detail: `${swapOkPct}% fleet not pressured (${dh.severe_swap || 0} severe, ${dh.elevated_swap || 0} elevated)` },
        { name: 'Compression', weight: 0.30, score: compScore, detail: `Score ${compScore}: ${highComp} high, ${modComp} moderate, ${lowComp} low (macOS compression is normal)` },
        { name: 'Process Memory', weight: 0.20, score: rssScore, detail: `Avg ${avgRss.toFixed(0)} MB per process class` },
        { name: 'Uptime Staleness', weight: 0.15, score: uptimeScore, detail: `Fleet avg ${avgUptime.toFixed(1)} days uptime` },
      ]
    } else if (categoryKey === 'network') {
      const [wifiRows, vpnRows] = await Promise.all([
        query('firehose.wifi.summary'),
        query('firehose.vpn.summary'),
      ])
      const w = wifiRows[0] || {}
      const v = vpnRows[0] || {}
      const rssi = w.avg_rssi || -70
      const snr = w.avg_snr || 20
      const tx = w.avg_transmit_rate || 100
      const vpnTotal = v.total_devices || 1
      const vpnConnPct = Math.round(((v.vpn_active || 0) + (v.direct_connected || 0)) / vpnTotal * 100)

      const rssiScore = rssi >= -50 ? 100 : rssi >= -60 ? 85 : rssi >= -70 ? 65 : rssi >= -80 ? 40 : 20
      const snrScore = snr >= 30 ? 100 : snr >= 20 ? 80 : snr >= 10 ? 50 : 25
      const txScore = tx >= 400 ? 100 : tx >= 200 ? 85 : tx >= 100 ? 60 : 30

      signalDefs = [
        { name: 'WiFi Signal (RSSI)', weight: 0.40, score: rssiScore, detail: `Fleet avg ${rssi.toFixed(1)} dBm (${w.unique_hosts || 0} hosts reporting)` },
        { name: 'Signal-to-Noise', weight: 0.30, score: snrScore, detail: `Fleet avg ${snr.toFixed(1)} dB` },
        { name: 'Transmit Rate', weight: 0.20, score: txScore, detail: `Fleet avg ${Math.round(tx)} Mbps` },
        { name: 'Network Confidence', weight: 0.10, score: vpnConnPct, detail: `${vpnConnPct}% connected — ${v.vpn_active || 0} VPN, ${v.direct_connected || 0} direct, ${v.disconnected || 0} disconnected` },
      ]
    } else if (categoryKey === 'security') {
      const [osRows, fleetRows] = await Promise.all([
        query('firehose.health.os_summary'),
        query('firehose.scores.fleet_summary'),
      ])
      const os = osRows[0] || {}
      const fleet = fleetRows[0] || {}
      const reporting = os.total_devices || 0
      const fleetTotal = fleet.device_count || 1
      const currentPct = reporting ? Math.round((os.os_current || 0) / reporting * 100) : 0
      const healthyPct = reporting ? Math.round((os.healthy || 0) / reporting * 100) : 0
      signalDefs = [
        { name: 'OS Currency', weight: 0.50, score: currentPct, detail: `${os.os_current || 0}/${reporting} reporting devices on current OS (${fleetTotal - reporting} not reporting — scored as current)` },
        { name: 'DEX OS Health', weight: 0.50, score: healthyPct, detail: `${os.healthy || 0}/${reporting} reporting devices rated healthy (${fleetTotal - reporting} not reporting — scored as acceptable)` },
      ]
    } else if (categoryKey === 'software') {
      const [crashRows, adoptRows, tierRows] = await Promise.all([
        query('firehose.crashes.summary'),
        query('firehose.adoption.summary'),
        query('firehose.adoption.tier_distribution'),
      ])
      const cr = crashRows[0] || {}
      const ad = adoptRows[0] || {}

      // Crash score — aligned with SQL: 0→100, 1→85, 2-4→65, 5-9→40, 10+→20
      const totalCrashes = cr.total_crashes_7d || 0
      const crashScore = totalCrashes === 0 ? 100 : totalCrashes === 1 ? 85 : totalCrashes <= 4 ? 65 : totalCrashes <= 9 ? 40 : 20

      // Adoption — use tier distribution for unique_apps per tier (not app-device pair counts)
      const staleRow = tierRows.find(r => r.usage_tier === 'stale_90d_plus') || {}
      const totalUniqueApps = ad.unique_apps || 1
      const staleUniqueApps = staleRow.unique_apps || 0
      const stalePct = Math.round(staleUniqueApps / totalUniqueApps * 100)
      const staleScore = stalePct < 20 ? 100 : stalePct < 40 ? 75 : stalePct < 60 ? 50 : 30

      // Active % — app-device pairs active this week / total pairs
      const totalPairs = (Number(ad.active_today) || 0) + (Number(ad.active_week) || 0) + (Number(ad.stale_30d) || 0) + (Number(ad.stale_90d) || 0) + (Number(ad.stale_90d_plus) || 0)
      const activePairs = (Number(ad.active_today) || 0) + (Number(ad.active_week) || 0)
      const activePct = totalPairs ? Math.round(activePairs / totalPairs * 100) : 70
      const adoptScore = activePct >= 80 ? 100 : activePct >= 60 ? 80 : activePct >= 40 ? 60 : 40

      signalDefs = [
        { name: 'Crash Frequency', weight: 0.40, score: crashScore, detail: `${totalCrashes} crashes across ${cr.devices_with_crashes || 0} devices in 7d` },
        { name: 'App Adoption', weight: 0.35, score: adoptScore, detail: `${activePct}% of app installs used this week` },
        { name: 'Shelfware', weight: 0.25, score: staleScore, detail: `${staleUniqueApps} of ${totalUniqueApps} unique apps (${stalePct}%) stale 90d+` },
      ]

      fetchSoftwareDetail()
    }

    signals.value = signalDefs
  } catch (e) {
    console.error('Signal breakdown fetch failed:', e)
    signals.value = []
  }
}

async function fetchSoftwareDetail() {
  try {
    const [adoptRows, tierRows, osRows, crashTopRows, staleRows] = await Promise.all([
      query('firehose.adoption.summary'),
      query('firehose.adoption.tier_distribution'),
      query('firehose.health.os_summary'),
      query('firehose.crashes.top_crashers', { limit: 8 }),
      query('firehose.adoption.stale_apps', { limit: 8 }),
    ])

    const ad = adoptRows[0] || {}
    const os = osRows[0] || {}
    const osTotal = os.total_devices || 1
    const osPct = Math.round((os.os_current || 0) / osTotal * 100)
    const totalPairs = (Number(ad.active_today) || 0) + (Number(ad.active_week) || 0) + (Number(ad.stale_30d) || 0) + (Number(ad.stale_90d) || 0) + (Number(ad.stale_90d_plus) || 0)
    const activePairs = (Number(ad.active_today) || 0) + (Number(ad.active_week) || 0)
    const activePct = totalPairs ? Math.round(activePairs / totalPairs * 100) : 0

    patchStats.value = {
      avgDays: null,          // No patch velocity data in firehose yet
      pctCurrent: osPct,      // % fleet on current OS
      p90Days: null
    }
    patchTimeline.value = []

    // Most used: top crashers as a proxy for actively-used-but-problematic apps
    mostUsedApps.value = crashTopRows.filter(r => r.crashed_identifier).map(r => ({
      app_name: r.crashed_identifier,
      device_count: r.affected_devices,
      usage_grade: r.total_crashes_7d >= 5 ? 'F' : r.total_crashes_7d >= 2 ? 'C' : 'B'
    }))

    leastUsedApps.value = staleRows.map(r => ({
      app_name: r.app_name,
      bundle_identifier: r.bundle_identifier,
      stale_count: r.installed_on,
      avg_days: r.avg_days_stale
    }))
  } catch (e) {
    console.error('Software detail fetch failed:', e)
  }
}

// ─── App Drill-down: show devices for a specific app ──────────
async function toggleAppDrill(appName, mode) {
  if (drillApp.value === appName) {
    drillApp.value = null
    drillDevices.value = []
    return
  }
  drillApp.value = appName
  drillLoading.value = true
  drillDevices.value = []

  try {
    // Find the bundle_identifier for this app from the stale list
    const staleApp = leastUsedApps.value.find(a => a.app_name === appName)
    if (staleApp && staleApp.bundle_identifier) {
      const rows = await query('firehose.adoption.by_app', { bundleId: staleApp.bundle_identifier })
      drillDevices.value = rows.map(r => ({
        host_identifier: r.host_id,
        hostname: r.hostname,
        app_version: r.version,
        usage_category: r.usage_tier,
        days_since_opened: r.days_since_opened
      }))
    } else {
      // Fallback: search stale_apps for this app name
      const rows = await query('firehose.adoption.stale_apps', { limit: 200 })
      drillDevices.value = rows.filter(r => r.app_name === appName).map(r => ({
        hostname: `${r.installed_on} devices`,
        app_version: r.version,
        usage_category: r.usage_tier,
        days_since_opened: r.avg_days_stale
      }))
    }
  } catch (e) {
    console.error('App drill-down failed:', e)
  }
  drillLoading.value = false
}

function signalColor(score) {
  if (score >= 90) return '#3db67b'
  if (score >= 75) return '#4a90d9'
  if (score >= 60) return '#ebbc43'
  if (score >= 40) return '#e07b3a'
  return '#d66c7b'
}

// ─── Fetch All Data ───────────────────────────────────────────
function fetchAll() {
  fetchFleetScore()
  fetchCategoryScores()
  fetchDistribution()
  fetchMovers()
  fetchTeams()
  fetchDimensions()
}

// React to filter and time range changes
watch([filterParams, selectedRange], () => {
  fetchAll()
}, { deep: true })

onMounted(() => {
  fetchAll()
})
</script>

<style scoped>
.experience-score {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--pad-large);
  display: flex;
  flex-direction: column;
  gap: var(--pad-large);
}

/* ─── Page header ─────────────────────────────── */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--pad-medium);
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.page-title {
  font-family: var(--font-mono);
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--fleet-black);
  margin: 0;
}

.header-subtitle {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--pad-medium);
}

.comparison-label {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  font-style: italic;
}

/* ─── Hero: fleet-wide composite ──────────────── */
.hero-section {
  max-width: 400px;
}

/* ─── Category cards: 5 across ────────────────── */
.category-cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--pad-medium);
}

/* ─── Signal breakdown ────────────────────────── */
.signal-breakdown .chart-container {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  padding: var(--pad-large);
  box-shadow: var(--box-shadow);
}

.breakdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--pad-medium);
}

.breakdown-header h3 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
}

.breakdown-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-toggle {
  background: none;
  border: 1px solid var(--fleet-vibrant-blue);
  border-radius: var(--radius);
  padding: 4px 12px;
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--fleet-vibrant-blue);
  cursor: pointer;
  transition: all 150ms ease-in-out;
}

.info-toggle:hover {
  background: rgba(106, 103, 254, 0.08);
}

.close-btn {
  background: none;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  padding: 4px 12px;
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  color: var(--fleet-black-75);
  cursor: pointer;
  transition: all 150ms ease-in-out;
}

.close-btn:hover {
  background: var(--fleet-black-5);
  border-color: var(--fleet-black-25);
}

/* ─── Methodology info box ────────────────────── */
.methodology-box {
  background: #f0f0ff;
  border: 1px solid rgba(106, 103, 254, 0.2);
  border-radius: var(--radius-medium);
  padding: var(--pad-medium);
  margin-bottom: var(--pad-medium);
}

.method-content p {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  line-height: 1.5;
  margin: 0 0 8px 0;
}

.method-content p:last-child {
  margin-bottom: 0;
}

.method-content strong {
  color: var(--fleet-black);
}

.signal-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.signal-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.signal-info {
  width: 280px;
  min-width: 280px;
  flex-shrink: 0;
}

.signal-name {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
}

.signal-weight {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
}

.signal-bar-track {
  flex: 1;
  height: 16px;
  background: var(--fleet-black-5);
  border-radius: var(--radius);
  overflow: hidden;
}

.signal-bar-fill {
  height: 100%;
  border-radius: var(--radius);
  transition: width 400ms ease-out;
}

.signal-detail {
  display: block;
  font-size: 11px;
  color: var(--fleet-black-33);
  font-style: italic;
}

.signal-score {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  min-width: 32px;
  text-align: right;
}

/* ─── Software detail panel ───────────────────── */
.software-detail {
  margin-top: var(--pad-large);
  padding-top: var(--pad-large);
  border-top: 1px solid var(--fleet-black-10);
  display: flex;
  flex-direction: column;
  gap: var(--pad-large);
}

.detail-section h4 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  margin: 0 0 var(--pad-medium) 0;
}

.patch-stats {
  display: flex;
  gap: var(--pad-large);
  margin-bottom: var(--pad-medium);
}

.patch-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-family: var(--font-mono);
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--fleet-black);
}

.stat-label {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
}

.patch-timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.patch-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.patch-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
  min-width: 140px;
  flex-shrink: 0;
}

.patch-bar-track {
  flex: 1;
  height: 14px;
  background: var(--fleet-black-5);
  border-radius: var(--radius);
  overflow: hidden;
}

.patch-bar-fill {
  height: 100%;
  border-radius: var(--radius);
  transition: width 400ms ease-out;
}

.patch-pct {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--fleet-black);
  min-width: 80px;
}

.patch-lag {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  min-width: 60px;
  text-align: right;
}

.usage-tables {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--pad-large);
}

.app-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.app-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--fleet-black-5);
}

.app-row:last-child {
  border-bottom: none;
}

.app-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
  flex: 1;
}

.app-devices {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
}

.app-devices.stale {
  color: var(--fleet-error);
}

.app-avg-days {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-33);
  min-width: 50px;
  text-align: right;
}

.app-row.clickable {
  cursor: pointer;
  transition: background 150ms ease-in-out;
  border-radius: var(--radius);
  margin: 0 -4px;
  padding: 8px 4px;
}

.app-row.clickable:hover {
  background: var(--fleet-black-5);
}

.drill-arrow {
  font-size: 11px;
  color: var(--fleet-black-33);
  min-width: 16px;
  text-align: center;
}

/* ─── Device drill-down panel ─────────────────── */
.device-drill {
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  margin: 4px 0 8px 0;
  padding: var(--pad-small) var(--pad-medium);
}

.drill-loading {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  padding: var(--pad-small) 0;
}

.drill-device-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.drill-device-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--fleet-black-5);
}

.drill-device-row:last-child {
  border-bottom: none;
}

.drill-hostname {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
  flex: 1;
}

.drill-version {
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  color: var(--fleet-black-50);
}

.drill-usage {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.drill-usage.daily {
  background: #e8f8f0;
  color: #1a7a4c;
}

.drill-usage.weekly {
  background: #e8f0fe;
  color: #2d5fba;
}

.drill-usage.monthly {
  background: #fef9e8;
  color: #9a7b1a;
}

.drill-usage.stale {
  background: #fef0e8;
  color: #b05c1a;
}

.drill-usage.never {
  background: #fee8ec;
  color: #b01a3a;
}

.drill-days {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  min-width: 80px;
  text-align: right;
}

.good-news {
  font-size: var(--font-size-sm);
  color: #16a34a;
  font-weight: 500;
  padding: 8px 0;
}

/* ─── Two column layout ───────────────────────── */
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--pad-medium);
}

.full-width {
  width: 100%;
}

/* ─── Responsive ──────────────────────────────── */
@media (max-width: 1024px) {
  .category-cards {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .category-cards {
    grid-template-columns: repeat(2, 1fr);
  }
  .two-col {
    grid-template-columns: 1fr;
  }
  .signal-row {
    flex-direction: column;
    align-items: stretch;
  }
  .signal-info {
    min-width: 0;
  }
  .usage-tables {
    grid-template-columns: 1fr;
  }
  .patch-stats {
    flex-wrap: wrap;
  }
  .patch-row {
    flex-wrap: wrap;
  }
}

@media (max-width: 480px) {
  .category-cards {
    grid-template-columns: 1fr;
  }
}

/* ─── Workers Council drill-down notice ──────── */
.wc-drill-notice {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #f0fdf4;
  border: 1px solid #d1fae5;
  border-radius: var(--radius);
  padding: 10px 16px;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: #065f46;
  margin-top: var(--pad-medium);
}

.wc-drill-notice svg {
  stroke: #065f46;
  flex-shrink: 0;
}
</style>
