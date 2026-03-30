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
              <h4>Patch Velocity</h4>
              <div class="patch-stats">
                <div class="patch-stat">
                  <span class="stat-value">{{ patchStats.avgDays?.toFixed(1) || '—' }}</span>
                  <span class="stat-label">avg days to patch</span>
                </div>
                <div class="patch-stat">
                  <span class="stat-value">{{ patchStats.pctCurrent?.toFixed(0) || '—' }}%</span>
                  <span class="stat-label">fleet on latest OS</span>
                </div>
                <div class="patch-stat">
                  <span class="stat-value">{{ patchStats.p90Days?.toFixed(1) || '—' }}</span>
                  <span class="stat-label">p90 days to patch</span>
                </div>
              </div>
              <div v-if="patchTimeline.length" class="patch-timeline">
                <div v-for="p in patchTimeline" :key="p.software_name" class="patch-row">
                  <span class="patch-name">{{ p.software_name }}</span>
                  <div class="patch-bar-track">
                    <div class="patch-bar-fill" :style="{ width: p.pct_current + '%', backgroundColor: signalColor(p.pct_current) }"></div>
                  </div>
                  <span class="patch-pct">{{ p.pct_current.toFixed(0) }}% current</span>
                  <span class="patch-lag">avg {{ p.avg_days_to_patch.toFixed(1) }}d</span>
                </div>
              </div>
            </div>

            <div class="usage-tables">
              <div class="detail-section">
                <h4>Most Used Apps</h4>
                <div class="app-list">
                  <div v-for="app in mostUsedApps" :key="app.app_name">
                    <div class="app-row" :class="{ clickable: !wcMode }" @click="!wcMode && toggleAppDrill(app.app_name, 'used')">
                      <span class="app-name">{{ app.app_name }}</span>
                      <span class="app-devices">{{ app.device_count }} devices</span>
                      <GradeBadge :grade="app.usage_grade" />
                      <span v-if="!wcMode" class="drill-arrow">{{ drillApp === app.app_name ? '▾' : '▸' }}</span>
                    </div>
                    <div v-if="drillApp === app.app_name && !wcMode" class="device-drill">
                      <div v-if="drillLoading" class="drill-loading">Loading devices...</div>
                      <div v-else class="drill-device-list">
                        <div v-for="d in drillDevices" :key="d.host_identifier" class="drill-device-row">
                          <span class="drill-hostname">{{ d.hostname }}</span>
                          <span class="drill-version">v{{ d.app_version }}</span>
                          <span class="drill-usage" :class="d.usage_category">{{ d.usage_category }}</span>
                          <span class="drill-days">{{ d.days_since_opened }}d ago</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="detail-section">
                <h4>Least Used (Shelfware)</h4>
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
        title="Fleet grade distribution"
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
    const [summaryRows, prevRows, sparkRows] = await Promise.all([
      query('scores.fleet_summary', queryParams.value),
      query('scores.fleet_comparison', queryParams.value),
      query('scores.fleet_sparkline', queryParams.value)
    ])

    const score = summaryRows[0]?.avg_score ?? null
    const count = summaryRows[0]?.device_count ?? 0
    const prevScore = prevRows[0]?.avg_score ?? null
    const delta = (score !== null && prevScore !== null) ? score - prevScore : null

    fleet.value = {
      grade: scoreToGrade(score),
      score,
      delta,
      sparkline: sparkRows.map(r => r.score),
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
    const [rows, prevRows, sparkRows] = await Promise.all([
      query('scores.categories', queryParams.value),
      query('scores.categories_comparison', queryParams.value),
      query('scores.category_sparklines', queryParams.value)
    ])

    categories.value = categories.value.map(cat => {
      const score = rows[0]?.[`avg_${cat.key}`] ?? null
      const prev = prevRows[0]?.[`avg_${cat.key}`] ?? null
      return {
        ...cat,
        score,
        grade: scoreToGrade(score),
        delta: (score !== null && prev !== null) ? score - prev : null,
        sparkline: sparkRows.map(r => r[`avg_${cat.key}`] ?? 0)
      }
    })
  } catch (e) {
    console.error('Category scores fetch failed:', e)
  }
  loading.value.categories = false
}

// ─── Fetch Grade Distribution ─────────────────────────────────
async function fetchDistribution() {
  loading.value.distribution = true
  try {
    const rows = await query('scores.grade_distribution', queryParams.value)
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
  try {
    const rows = await query('scores.biggest_movers', { ...queryParams.value, limit: 8 })
    movers.value = rows
  } catch (e) {
    console.error('Movers fetch failed:', e)
  }
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
  try {
    const rows = await query('scores.dimension_breakdown', { ...queryParams.value, dimension: 'team_id' })
    teams.value = rows.map(r => ({
      team_id: r.name,
      name: `Fleet ${r.name}`,
      score: r.score,
      grade: scoreToGrade(r.score),
      device_count: r.count
    }))
  } catch (e) {
    console.error('Teams fetch failed:', e)
  }
  loading.value.teams = false
}

// ─── Fetch Dimension Breakdowns ───────────────────────────────
async function fetchDimensions() {
  loading.value.dimensions = true
  try {
    const [osRows, modelRows, ramRows, teamRows] = await Promise.all([
      query('scores.dimension_breakdown', { ...queryParams.value, dimension: 'os_name' }),
      query('scores.dimension_breakdown', { ...queryParams.value, dimension: 'hardware_model', limit: 15 }),
      query('scores.dimension_breakdown', { ...queryParams.value, dimension: 'ram_tier' }),
      query('scores.dimension_breakdown', { ...queryParams.value, dimension: 'team_id' })
    ])

    const addGrades = rows => rows.map(r => ({ ...r, grade: scoreToGrade(r.score) }))
    dimensionData.value = {
      os: addGrades(osRows),
      model: addGrades(modelRows),
      ram: addGrades(ramRows),
      team: addGrades(teamRows).map(r => ({ ...r, name: `Fleet ${r.name}` }))
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
    return
  }
  expandedCategory.value = categoryKey
  showMethodology.value = true  // Always show "how is this scored" on first open
  fetchSignals(categoryKey)
}

async function fetchSignals(categoryKey) {
  try {
    let signalDefs = []

    if (categoryKey === 'device_health') {
      const rows = await query('health.signals')
      const diskTotal = rows[0]?.avg_disk_total || 0
      const diskScore = diskTotal >= 512 ? 100 : diskTotal >= 256 ? 70 : 40
      signalDefs = [
        { name: 'Disk Capacity', weight: 0.50, score: diskScore },
        { name: 'Device Age (est.)', weight: 0.50, score: 80 }
      ]
    } else if (categoryKey === 'performance') {
      const rows = await query('health.signals')
      const mem = rows[0]?.avg_mem || 0
      const disk = rows[0]?.avg_disk || 0
      const uptime = rows[0]?.avg_uptime || 0

      const memScore = mem < 60 ? 100 : mem < 75 ? 80 : mem < 85 ? 60 : mem < 95 ? 40 : 20
      const diskScore = disk < 70 ? 100 : disk < 80 ? 80 : disk < 90 ? 60 : disk < 95 ? 40 : 20
      const uptimeScore = uptime < 7 ? 100 : uptime < 14 ? 80 : uptime < 30 ? 60 : 30

      signalDefs = [
        { name: 'Memory Usage', weight: 0.35, score: memScore },
        { name: 'Disk Usage', weight: 0.30, score: diskScore },
        { name: 'Process Pressure', weight: 0.20, score: 80 },
        { name: 'Uptime Staleness', weight: 0.15, score: uptimeScore }
      ]
    } else if (categoryKey === 'network') {
      const rows = await query('network.signals')
      const rssi = rows[0]?.avg_rssi || -70
      const noise = rows[0]?.avg_noise || -80
      const tx = rows[0]?.avg_tx || 100

      const rssiScore = rssi > -50 ? 100 : rssi > -60 ? 80 : rssi > -70 ? 60 : rssi > -80 ? 40 : 20
      const noiseScore = noise < -85 ? 100 : noise < -75 ? 70 : 40
      const txScore = tx > 400 ? 100 : tx > 200 ? 80 : tx > 100 ? 60 : 40

      signalDefs = [
        { name: 'WiFi Signal (RSSI)', weight: 0.40, score: rssiScore },
        { name: 'WiFi Noise', weight: 0.30, score: noiseScore },
        { name: 'Transmit Rate', weight: 0.30, score: txScore }
      ]
    } else if (categoryKey === 'security') {
      const rows = await query('security.compliance')
      signalDefs = [
        { name: 'Disk Encryption', weight: 0.25, score: rows[0]?.pct_encrypted || 0 },
        { name: 'Firewall', weight: 0.25, score: rows[0]?.pct_firewall || 0 },
        { name: 'SIP', weight: 0.20, score: rows[0]?.pct_sip || 0 },
        { name: 'Gatekeeper', weight: 0.15, score: rows[0]?.pct_gatekeeper || 0 },
        { name: 'OS Currency', weight: 0.15, score: 80 }
      ]
    } else if (categoryKey === 'software') {
      // ─── Patch Velocity signals ─────────────────────────────
      const [patchRows, osRows, usageRows] = await Promise.all([
        query('software.patch_velocity'),
        query('software.os_currency', { softwareName: 'macOS' }),
        query('software.usage_stats')
      ])

      const avgLag = patchRows[0]?.avg_lag ?? 10
      const patchScore = avgLag <= 3 ? 100 : avgLag <= 7 ? 80 : avgLag <= 14 ? 60 : avgLag <= 30 ? 40 : 20

      const osPct = osRows[0]?.pct_current ?? 0
      const osCurrScore = osPct >= 90 ? 100 : osPct >= 75 ? 80 : osPct >= 50 ? 60 : osPct >= 25 ? 40 : 20

      const stalePct = usageRows[0]?.stale_pct ?? 50
      const dailyPct = usageRows[0]?.daily_pct ?? 30
      const staleScore = stalePct < 10 ? 100 : stalePct < 25 ? 80 : stalePct < 40 ? 60 : stalePct < 60 ? 40 : 20
      const activeScore = dailyPct >= 50 ? 100 : dailyPct >= 35 ? 80 : dailyPct >= 20 ? 60 : 40

      signalDefs = [
        { name: 'Patch Velocity', weight: 0.30, score: patchScore, detail: `Avg ${avgLag.toFixed(1)} days to patch` },
        { name: 'OS Currency', weight: 0.20, score: osCurrScore, detail: `${osPct.toFixed(0)}% fleet on latest` },
        { name: 'Shelfware Ratio', weight: 0.25, score: staleScore, detail: `${stalePct.toFixed(0)}% apps unused 90d+` },
        { name: 'Active Usage Rate', weight: 0.25, score: activeScore, detail: `${dailyPct.toFixed(0)}% apps used daily` }
      ]

      // ─── Fetch software detail data ─────────────────────────
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
    const [statsRows, timelineRows, mostRows, leastRows, osRow] = await Promise.all([
      query('software.patch_velocity'),
      query('software.patch_summary', { limit: 8 }),
      query('software.top_active', { limit: 8 }),
      query('software.stale_apps', { limit: 8 }),
      query('software.os_currency', { softwareName: 'macOS' })
    ])

    patchStats.value = {
      avgDays: statsRows[0]?.avg_lag,
      pctCurrent: osRow[0]?.pct_current,
      p90Days: statsRows[0]?.p90_lag
    }

    patchTimeline.value = timelineRows
    mostUsedApps.value = mostRows.map(r => ({
      ...r,
      usage_grade: r.daily_count >= r.device_count * 0.8 ? 'A' : r.daily_count >= r.device_count * 0.5 ? 'B' : 'C'
    }))
    leastUsedApps.value = leastRows
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
    const rows = await query('software.app_drill', { appName })
    drillDevices.value = rows
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
  min-width: 160px;
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
