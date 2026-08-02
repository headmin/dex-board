<template>
  <div class="experience-score">
    <!-- ─── Page Header with Time Range ────────────────────── -->
    <section class="page-header">
      <div class="header-left">
        <h2 class="page-title">Experience score</h2>
        <span class="header-subtitle">Fleet-wide digital employee experience</span>
      </div>
      <div class="header-right">
        <div class="time-range-group">
          <TimeRangeFilter />
          <span class="time-range-hint" title="The time range only changes the charts further down — grade distribution, the breakdowns, biggest movers and the device list — which show hosts that checked in during the selected window. The scores at the top (composite, the category cards and the exposure tile) always show each host's most recent reading, so they don't change when you switch the range.">
            ⓘ affects the charts below, not the top scores
          </span>
        </div>
        <div class="comparison-label">
          tiles show Δ vs {{ tileDeltaLabel }} · 30-day trend
        </div>
      </div>
    </section>

    <!-- ─── Scoring readiness warning (SETUP.md §3.2a) ──────── -->
    <div v-if="missingSignals.length" class="readiness-banner">
      <strong>Scoring signals missing:</strong>
      {{ missingSignals.join(', ') }} — these tables are empty, so the affected
      categories default to "average" instead of real data. Check that the
      upstream DEX query pack is applied and its schedules are enabled
      (SETUP.md §3.1–3.2).
    </div>

    <!-- ─── Fleet Composite Grade Hero ─────────────────────── -->
    <section class="hero-section">
      <GradeCard
        label="Fleet experience score"
        :grade="fleet.grade"
        :score="fleet.score"
        :delta="tileDeltas.composite"
        :sparklineData="fleet.sparkline"
        :loading="loading.fleet"
        :subtitle="fleet.deviceCount ? `${fleet.deviceCount} devices` : ''"
      />
    </section>

    <!-- ─── Endpoint security-exposure delta (board callout, selectable window) ── -->
    <section class="exposure-section" :class="`exposure-section--${exposureView.dir}`">
      <div class="exposure-main">
        <div class="exposure-eyebrow-row">
          <span class="exposure-eyebrow">Endpoint exposure vs {{ exposureDays }} days ago</span>
          <div class="exposure-window-picker" role="group" aria-label="Comparison window">
            <button
              v-for="w in EXPOSURE_WINDOWS"
              :key="w"
              type="button"
              class="exposure-window-btn"
              :class="{ active: exposureDays === w }"
              @click="exposureDays = w"
            >{{ w }}d</button>
          </div>
        </div>
        <span v-if="loading.exposure" class="exposure-headline">Loading…</span>
        <span v-else class="exposure-headline">{{ exposureView.headline }}</span>
        <span class="exposure-detail">{{ exposureView.detail }}</span>
        <div v-if="exposureSignals.length" class="exposure-signals">
          <span v-for="s in exposureSignals" :key="s.key" class="exposure-signal">
            <span class="exposure-signal-label">{{ s.label }}</span>
            <span class="exposure-signal-now">{{ s.now }}%</span>
            <span v-if="s.delta !== null && s.delta !== 0"
                  class="exposure-signal-delta"
                  :class="s.delta < 0 ? 'sig-worse' : 'sig-better'">{{ s.delta > 0 ? '+' : '' }}{{ s.delta }}</span>
          </span>
        </div>
      </div>
      <div v-if="exposureView.available" class="exposure-delta" :class="`exposure-delta--${exposureView.dir}`">
        <span class="exposure-delta-arrow">{{ exposureView.dir === 'worse' ? '▼' : exposureView.dir === 'better' ? '▲' : '▬' }}</span>
        <span class="exposure-delta-val">{{ exposureView.delta > 0 ? '+' : '' }}{{ exposureView.delta }}</span>
        <span class="exposure-delta-unit">pts</span>
      </div>
      <p class="exposure-caption">
        "Exposure" here is endpoint security posture only (FileVault, firewall, Gatekeeper,
        SIP, OS currency) — not application, network, or cloud attack surface.
      </p>
    </section>

    <!-- ─── 30-day fleet composite trend ───────────────────── -->
    <section v-if="fleetTrendVisible" class="trend-section">
      <div class="trend-header">
        <span class="trend-title">30-day composite trend</span>
        <span class="trend-range">{{ trendRangeText }}</span>
      </div>
      <SparklineChart
        :data="fleet.sparkline"
        :color="trendColor"
        width="100%"
        height="120px"
        :showTooltip="true"
        :autoScale="true"
      />
      <div class="trend-axis">
        <span>30d ago</span>
        <span>today</span>
      </div>
    </section>

    <!-- ─── Per-Fleet breakdown ────────────────────────────── -->
    <!-- Always rendered (reserved layout) when any team exists, to avoid
         the filter-bar selection causing the rest of the page to jump. -->
    <section v-show="teamRows.length" class="team-breakdown">
      <div class="team-breakdown-header">
        <h3>Per-fleet breakdown</h3>
        <span class="team-breakdown-note">composite score grouped by Fleet (team-XXX) — small cohorts are noisy, watch the host count</span>
      </div>
      <div class="team-breakdown-grid">
        <div v-for="t in teamRows" :key="t.team_id" class="team-card" :class="{ 'team-card--missing': t.unscorable }">
          <div class="team-card-head">
            <span class="team-card-id" :title="t.team_id">{{ teamLabel(t.team_id) }}</span>
            <span class="team-card-hosts">{{ t.unscorable ? 'no scorable hosts' : `${t.hosts} host${t.hosts === 1 ? '' : 's'}` }}</span>
          </div>
          <template v-if="!t.unscorable">
            <div class="team-card-grade-row">
              <span class="team-card-grade" :class="'grade-' + (scoreToGrade(t.avg_composite) || '').toLowerCase()">{{ scoreToGrade(t.avg_composite) }}</span>
              <span class="team-card-score">{{ t.avg_composite != null ? t.avg_composite.toFixed(0) : '—' }}<span class="team-card-score-max">/100</span></span>
            </div>
            <div class="team-card-cats">
              <span class="team-cat" :title="`Device Health: ${t.avg_device_health}`"><span class="team-cat-key">DH</span><span class="team-cat-val">{{ t.avg_device_health != null ? t.avg_device_health.toFixed(0) : '—' }}</span></span>
              <span class="team-cat" :title="`Performance: ${t.avg_performance}`"><span class="team-cat-key">Perf</span><span class="team-cat-val">{{ t.avg_performance != null ? t.avg_performance.toFixed(0) : '—' }}</span></span>
              <span class="team-cat" :title="`Security: ${t.avg_security}`"><span class="team-cat-key">Sec</span><span class="team-cat-val">{{ t.avg_security != null ? t.avg_security.toFixed(0) : '—' }}</span></span>
              <span class="team-cat" :title="`Software: ${t.avg_software}`"><span class="team-cat-key">SW</span><span class="team-cat-val">{{ t.avg_software != null ? t.avg_software.toFixed(0) : '—' }}</span></span>
            </div>
          </template>
          <template v-else>
            <div class="team-card-missing">
              Hosts visible in <code>host_teams</code> but don't currently run the
              Hardware-experience + Device-health schedules required to score.
            </div>
          </template>
        </div>
      </div>
    </section>

    <!-- ─── Category Grade Cards ───────────────────────────── -->
    <section class="category-cards">
      <GradeCard
        v-for="cat in categories"
        :key="cat.key"
        :label="cat.label"
        :grade="cat.grade"
        :score="cat.score"
        :delta="tileDeltas[cat.key]"
        :sparklineData="cat.sparkline"
        :loading="loading.categories"
        :clickable="true"
        :subtitle="cat.key === 'network' ? 'Informational — not in composite' : ''"
        :title="cat.key === 'network' ? 'Network quality is shown for context but excluded from the composite score: Wi-Fi signal is too volatile for a number that drives quarterly decisions. See SCORE-IDEA.md.' : ''"
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
          <div v-for="sig in signals" :key="sig.name" class="signal-row" :class="{ 'signal-row--inactive': sig.inactive }">
            <div class="signal-info">
              <span class="signal-name">
                {{ sig.name }}
                <span v-if="sig.type" class="signal-type-pill" :class="`signal-type-pill--${sig.type}`">{{ sig.type === 'config' ? 'config' : 'time' }}</span>
                <span v-if="sig.inactive" class="signal-status-pill">paused</span>
              </span>
              <span class="signal-weight">{{ (sig.weight * 100).toFixed(0) }}% weight</span>
              <span v-if="sig.detail" class="signal-detail">{{ sig.detail }}</span>
            </div>
            <div class="signal-bar-track">
              <div
                v-if="!sig.inactive"
                class="signal-bar-fill"
                :style="{ width: sig.score + '%', backgroundColor: signalBarColor(sig.score) }"
              ></div>
              <div v-else class="signal-bar-empty">no data</div>
            </div>
            <span class="signal-score">{{ sig.inactive ? '—' : sig.score.toFixed(0) }}</span>
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
                          <span class="drill-hostname">{{ displayHost(d) }}</span>
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

            <div v-if="softwarePatchMovers.length" class="detail-section">
              <div class="patch-movers-head">
                <h4>Top patch movers (7d)</h4>
                <span v-if="patchTrendView" class="patch-trend" :class="`patch-trend--${patchTrendView.dir}`">
                  fleet MTTP {{ patchTrendView.current }}d
                  <span class="patch-trend-arrow">{{ patchTrendView.dir === 'faster' ? '▼' : patchTrendView.dir === 'slower' ? '▲' : '▬' }}</span>
                  {{ patchTrendView.txt }} vs prior 7d
                </span>
              </div>
              <p class="section-hint">Mean time to patch per app · sorted by hosts patched</p>
              <MttpTable :rows="softwarePatchMovers" :sla-days="config.patchSlaDays" />
            </div>
          </div>
        </template>
      </div>
    </section>

    <!-- ─── Biggest Movers (promoted: what changed overnight) ─ -->
    <section class="full-width">
      <BiggestMovers
        title="Biggest movers (7d)"
        :data="movers"
        :loading="loading.movers"
        :fetchDetail="buildMoverDetail"
      />
    </section>

    <!-- ─── Dimension Breakdown (pattern finder) ───────────── -->
    <section class="full-width">
      <DimensionBreakdown
        :data="dimensionData"
        :loading="loading.dimensions"
        @row-click="onDimensionClick"
      />
    </section>

    <!-- ─── Device Scores Table (with inline grade distribution) -->
    <section v-if="!wcMode" class="full-width">
      <div class="chart-container">
        <div class="device-table-header">
          <div class="device-table-title-group">
            <h3>Host scores ({{ filteredDeviceList.length }})</h3>
            <div v-if="totalGraded > 0" class="mini-distribution" :title="distributionTooltip">
              <div
                v-for="g in ['A','B','C','D','F']"
                :key="g"
                class="mini-dist-segment"
                :class="'grade-' + g"
                :style="{ width: distributionPct(g) + '%' }"
              >
                <span v-if="distributionPct(g) >= 8" class="mini-dist-label">{{ g }} {{ distribution[g] || 0 }}</span>
              </div>
            </div>
          </div>
          <div class="device-search-group">
            <svg class="device-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M7.333 12.667A5.333 5.333 0 107.333 2a5.333 5.333 0 000 10.667zM14 14l-2.9-2.9" stroke="#8b8fa2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <input
              type="text"
              class="device-search-input"
              placeholder="Search hostname..."
              v-model="deviceSearch"
            />
          </div>
        </div>
        <SkeletonLoader v-if="loading.deviceList" variant="chart" height="280px" />
        <div v-else-if="!filteredDeviceList.length" class="empty-state">No devices match your search</div>
        <div v-else class="device-table-wrap">
          <table class="device-table">
            <thead>
              <tr>
                <th @click="deviceSortBy('hostname')" class="sortable">Hostname {{ deviceSortIcon('hostname') }}</th>
                <th @click="deviceSortBy('composite_score')" class="sortable">Score {{ deviceSortIcon('composite_score') }}</th>
                <th @click="deviceSortBy('composite_grade')" class="sortable">Grade {{ deviceSortIcon('composite_grade') }}</th>
                <th @click="deviceSortBy('device_health_score')" class="sortable">Health {{ deviceSortIcon('device_health_score') }}</th>
                <th @click="deviceSortBy('software_score')" class="sortable">Software {{ deviceSortIcon('software_score') }}</th>
                <th @click="deviceSortBy('performance_score')" class="sortable">Perf {{ deviceSortIcon('performance_score') }}</th>
                <th @click="deviceSortBy('security_score')" class="sortable">Security {{ deviceSortIcon('security_score') }}</th>
                <th @click="deviceSortBy('network_score')" class="sortable">Network {{ deviceSortIcon('network_score') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in filteredDeviceList" :key="d.host_id"
                  class="device-row-clickable"
                  :title="`Open ${displayHost(d)} in host details`"
                  @click="inspectHost(d.host_id)">
                <td class="device-hostname">
                  {{ displayHost(d) }}
                  <span class="device-row-cta">→</span>
                </td>
                <td class="device-score-cell">{{ d.composite_score }}</td>
                <td><GradeBadge :grade="d.composite_grade" /></td>
                <td class="device-score-cell" :style="{ color: signalColor(d.device_health_score) }">{{ d.device_health_score }}</td>
                <td class="device-score-cell" :style="{ color: signalColor(d.software_score) }">{{ d.software_score }}</td>
                <td class="device-score-cell" :style="{ color: signalColor(d.performance_score) }">{{ d.performance_score }}</td>
                <td class="device-score-cell" :style="{ color: signalColor(d.security_score) }">{{ d.security_score }}</td>
                <td class="device-score-cell" :style="{ color: signalColor(d.network_score) }">{{ d.network_score }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
    <section v-else class="full-width">
      <div class="wc-drill-notice">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Per-device score table hidden — Workers Council mode active
      </div>
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
import SparklineChart from '../components/SparklineChart.vue'
import { useRouter } from 'vue-router'

const router = useRouter()
function inspectHost(hostId) {
  if (!hostId) return
  router.push({ path: '/devices', query: { hostId } })
}
import GradeBadge from '../components/GradeBadge.vue'
import SkeletonLoader from '../components/SkeletonLoader.vue'
import { useWorkersCouncil } from '../composables/useWorkersCouncil'
import BiggestMovers from '../components/BiggestMovers.vue'
import DimensionBreakdown from '../components/DimensionBreakdown.vue'
import MttpTable from '../components/MttpTable.vue'
import { displayHost } from '../composables/displayName'
import { useAppConfig } from '../composables/useAppConfig'

const { config } = useAppConfig()
// Friendly team label from the config map (TEAM_NAMES); falls back to the raw
// numeric id. Telemetry only carries the id, so names are config-driven.
function teamLabel(id) {
  return config.value.teamNames?.[id] || id
}
const { filterParams, setOSFilter, setModelFilter, setRAMFilter } = useFleetFilter()
const { wcMode } = useWorkersCouncil()
const { timeRangeHours, selectedRange } = useTimeRange()

// ─── Query params (replaces all SQL fragment computeds) ───────
// Drill-downs (grade distribution, dimensions, biggest movers, device list)
// are scoped to hosts active in the selected window, so they carry timeRange.
const queryParams = computed(() => ({
  timeRange: timeRangeHours.value,
  ...filterParams.value
}))
// Snapshot cards (composite, categories, exposure, per-fleet) reflect each
// host's latest snapshot and ignore the time range — filter-only params so a
// range switch never reloads them.
const snapshotParams = computed(() => ({ ...filterParams.value }))

const comparisonLabel = computed(() => {
  const labels = { '1h': 'hour', '6h': '6 hours', '1d': 'day', '7d': 'week', '30d': '30 days' }
  return labels[selectedRange.value] || 'period'
})

// Now-vs-window deltas for the top tiles: each tile's "now" score minus its
// score at the start of the selected window. Keyed by category key + composite.
// Recomputed on range change; the tiles' main scores never move.
const tileDeltas = ref({ composite: null, device_health: null, performance: null, network: null, security: null, software: null })
const tileDeltaLabel = computed(() => {
  const labels = { '1h': '1h ago', '6h': '6h ago', '1d': '1d ago', '7d': '7d ago', '30d': '30d ago' }
  return labels[selectedRange.value] || 'window start'
})

// ─── 30-day composite trend helpers ──────────────────────
const fleetTrendVisible = computed(() => {
  return fleet.value.sparkline && fleet.value.sparkline.filter(v => typeof v === 'number').length >= 2
})
const trendRangeText = computed(() => {
  const nums = (fleet.value.sparkline || []).filter(v => typeof v === 'number')
  if (!nums.length) return ''
  return `${Math.min(...nums).toFixed(0)} → ${Math.max(...nums).toFixed(0)}`
})
const trendColor = computed(() => {
  const g = (fleet.value.grade || '').toUpperCase()
  if (g === 'A') return '#009a7d'
  if (g === 'B') return '#009a7d'
  if (g === 'C') return '#ecc767'
  if (g === 'D') return '#eb6743'
  if (g === 'F') return '#eb4343'
  return '#6a67fe'
})

// ─── State ────────────────────────────────────────────────────
const loading = ref({
  fleet: false,
  categories: false,
  distribution: false,
  movers: false,
  dimensions: false,
  deviceList: false,
  exposure: false
})

const fleet = ref({ grade: '—', score: null, delta: null, sparkline: [], deviceCount: 0 })

// ─── Endpoint security-exposure delta (board Q: "more exposed than N days
// ago?"). Reuses the asOfDaysAgo time-travel param on firehose.scores.categories
// to diff the security sub-score now vs N days ago, where N is user-selectable.
// Scope is endpoint security posture only — NOT app/network/cloud attack
// surface (boundary is printed on the tile).
const EXPOSURE_WINDOWS = [14, 30, 45, 60, 90]
const exposureDays = ref(90)
const securityExposure = ref({ now: null, before: null, delta: null })
// Per-control adoption %s + their delta over the window — shows WHICH control moved.
const exposureSignals = ref([])

// Board-legible reading of the security delta. Higher security score = less
// exposed, so a negative delta means MORE exposed than the window start.
const exposureView = computed(() => {
  const { now, before, delta } = securityExposure.value
  const n = exposureDays.value
  if (delta == null) {
    return { available: false, headline: '—', detail: before == null ? `No security-posture history ${n} days back yet.` : 'Insufficient data.', dir: 'flat' }
  }
  const dir = delta < 0 ? 'worse' : delta > 0 ? 'better' : 'flat'
  const headline = dir === 'worse'
    ? `More exposed: security posture down ${Math.abs(delta)} pts vs ${n} days ago`
    : dir === 'better'
      ? `Less exposed: security posture up ${delta} pts vs ${n} days ago`
      : `Unchanged: security posture flat vs ${n} days ago`
  return {
    available: true,
    headline,
    detail: `Endpoint security score ${now} now vs ${before} ${n} days ago.`,
    dir,
    delta,
  }
})

// ─── Per-fleet (team) breakdown ───────────────────────────
// teamRows is the UNION of:
//   • scored teams (real composite + categories from firehose.scores.by_team)
//   • known-but-unscored teams (named placeholder card from filter_options)
// so every fleet visible in the team list gets its own card with status.
const teamRows = ref([])

async function fetchTeamBreakdown() {
  try {
    const [scored, allTeams] = await Promise.all([
      query('firehose.scores.by_team', snapshotParams.value).catch(() => []),
      query('firehose.devices.filter_options').catch(() => []),
    ])
    const scoredMap = new Map(
      (scored || []).map(r => [r.team_id, {
        team_id: r.team_id,
        hosts: Number(r.hosts || 0),
        avg_composite: r.avg_composite != null ? Number(r.avg_composite) : null,
        avg_device_health: r.avg_device_health != null ? Number(r.avg_device_health) : null,
        avg_performance: r.avg_performance != null ? Number(r.avg_performance) : null,
        avg_security: r.avg_security != null ? Number(r.avg_security) : null,
        avg_software: r.avg_software != null ? Number(r.avg_software) : null,
        unscorable: false,
      }])
    )
    const knownTeams = (allTeams || []).filter(r => r.type === 'team').map(r => r.value)
    const merged = []
    // First: every known team — scored or not — in the order from filter_options
    for (const t of knownTeams) {
      if (scoredMap.has(t)) {
        merged.push(scoredMap.get(t))
        scoredMap.delete(t)
      } else {
        merged.push({ team_id: t, hosts: 0, avg_composite: null, unscorable: true })
      }
    }
    // Then: any "unassigned" or otherwise-scored teams not in filter_options (defensive)
    for (const row of scoredMap.values()) merged.push(row)
    teamRows.value = merged
  } catch (e) {
    console.error('Team breakdown fetch failed:', e)
    teamRows.value = []
  }
}
const categories = ref([
  { key: 'device_health', label: 'Device Health', grade: '—', score: null, delta: null, sparkline: [] },
  { key: 'software', label: 'Software', grade: '—', score: null, delta: null, sparkline: [] },
  { key: 'performance', label: 'Performance', grade: '—', score: null, delta: null, sparkline: [] },
  { key: 'security', label: 'Security', grade: '—', score: null, delta: null, sparkline: [] },
  { key: 'network', label: 'Network', grade: '—', score: null, delta: null, sparkline: [] }
])
const distribution = ref({})
const movers = ref([])
const dimensionData = ref({ os: [], model: [], ram: [], team: [] })
const expandedCategory = ref(null)
const signals = ref([])
const showMethodology = ref(false)
const missingSignals = ref([])

// Software detail state
const patchStats = ref({})
const patchTimeline = ref([])
const mostUsedApps = ref([])
const leastUsedApps = ref([])
const softwarePatchMovers = ref([])
// Fleet MTTP this 7d vs prior 7d — "are we faster?"
const patchTrend = ref({ current: null, prior: null, delta: null })
const patchTrendView = computed(() => {
  const { current, prior, delta } = patchTrend.value
  if (current == null || delta == null) return null
  const dir = delta < 0 ? 'faster' : delta > 0 ? 'slower' : 'flat'
  const txt = dir === 'faster' ? `${Math.abs(delta)}d faster` : dir === 'slower' ? `${delta}d slower` : 'unchanged'
  return { current, prior, dir, txt }
})

// App drill-down state
const drillApp = ref(null)
const drillDevices = ref([])
const drillLoading = ref(false)

// Device list state
const deviceList = ref([])
const deviceSearch = ref('')
const deviceSortCol = ref('composite_score')
const deviceSortAsc = ref(true)

const filteredDeviceList = computed(() => {
  let list = deviceList.value
  if (deviceSearch.value) {
    const s = deviceSearch.value.toLowerCase()
    list = list.filter(d =>
      (d.hostname || '').toLowerCase().includes(s) ||
      (d.host_id || '').toLowerCase().includes(s) ||
      (d.cpu_class || '').toLowerCase().includes(s) ||
      (d.ram_tier || '').toLowerCase().includes(s)
    )
  }
  const col = deviceSortCol.value
  const asc = deviceSortAsc.value
  return [...list].sort((a, b) => {
    const av = a[col] ?? -1
    const bv = b[col] ?? -1
    if (av < bv) return asc ? -1 : 1
    if (av > bv) return asc ? 1 : -1
    return 0
  })
})

const totalGraded = computed(() =>
  ['A','B','C','D','F'].reduce((s, g) => s + (distribution.value[g] || 0), 0)
)

function distributionPct(grade) {
  const total = totalGraded.value
  if (!total) return 0
  return ((distribution.value[grade] || 0) / total) * 100
}

const distributionTooltip = computed(() => {
  const parts = ['A','B','C','D','F'].map(g => `${g}: ${distribution.value[g] || 0}`)
  return `Grade distribution — ${parts.join(', ')}`
})

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

// ─── Fetch Fleet Score (now + 7d ago for Δ tile + 30d sparkline) ──
async function fetchFleetScore() {
  loading.value.fleet = true
  try {
    // 30 daily samples (asOfDaysAgo 0..29). Each call wrapped in .catch so a
    // single failure doesn't blank the whole sparkline — the bad day just
    // shows as null (ECharts skips it).
    const trendDays = 30
    const trendRequests = Array.from({ length: trendDays }, (_, i) =>
      query('firehose.scores.fleet_summary', { ...snapshotParams.value, asOfDaysAgo: i })
        .catch(() => [])
    )
    const trendRows = await Promise.all(trendRequests)

    const todayRow = trendRows[0]?.[0]
    const score = todayRow?.avg_score ?? null
    const count = todayRow?.device_count ?? 0
    // The now-vs-window Δ badge is owned by fetchTileDeltas (range-aware); the
    // hero just shows the current score + 30-day sparkline.

    // Sparkline: newest → oldest from trendRequests, so reverse to oldest → newest.
    const sparkline = trendRows
      .map(rows => {
        const s = rows?.[0]?.avg_score
        return (typeof s === 'number') ? s : null
      })
      .reverse()

    console.log(`[ExperienceScore] sparkline: ${sparkline.filter(v => v != null).length}/${trendDays} days populated, range ${Math.min(...sparkline.filter(v => v != null))}–${Math.max(...sparkline.filter(v => v != null))}`)

    fleet.value = {
      grade: scoreToGrade(score),
      score,
      delta: null,
      sparkline,
      deviceCount: count,
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
      query('firehose.scores.categories', snapshotParams.value),
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

// ─── Fetch security-exposure delta (selectable window) ────────
// Two snapshots of the security sub-score (now and exposureDays ago) via the
// asOfDaysAgo time-travel param. A drop = more exposed than the window start.
async function fetchSecurityExposure() {
  loading.value.exposure = true
  try {
    const [nowRows, agoRows, nowPosture, agoPosture] = await Promise.all([
      query('firehose.scores.categories', { ...snapshotParams.value, asOfDaysAgo: 0 }).catch(() => []),
      query('firehose.scores.categories', { ...snapshotParams.value, asOfDaysAgo: exposureDays.value }).catch(() => []),
      query('firehose.security.posture_breakdown', { ...snapshotParams.value, asOfDaysAgo: 0 }).catch(() => []),
      query('firehose.security.posture_breakdown', { ...snapshotParams.value, asOfDaysAgo: exposureDays.value }).catch(() => []),
    ])
    const now = nowRows[0]?.avg_security ?? null
    const before = agoRows[0]?.avg_security ?? null
    const delta = (now != null && before != null)
      ? Math.round((now - before) * 10) / 10
      : null
    securityExposure.value = { now, before, delta }

    // Per-control breakdown: which signal moved (encryption/firewall/Gatekeeper/SIP)?
    const pn = nowPosture[0] || {}
    const pb = agoPosture[0] || {}
    const sig = (key, label) => {
      const n = pn[key] ?? null
      const b = pb[key] ?? null
      return { key, label, now: n, delta: (n != null && b != null) ? Math.round((n - b) * 10) / 10 : null }
    }
    exposureSignals.value = (pn.posture_hosts > 0)
      ? [sig('pct_encrypted', 'FileVault'), sig('pct_firewall', 'Firewall'), sig('pct_gatekeeper', 'Gatekeeper'), sig('pct_sip', 'SIP')]
      : []
  } catch (e) {
    console.error('Security exposure fetch failed:', e)
    securityExposure.value = { now: null, before: null, delta: null }
    exposureSignals.value = []
  }
  loading.value.exposure = false
}

// ─── Fetch now-vs-window tile deltas ──────────────────────────
// One categories row carries avg_composite + all 5 category averages, so two
// calls (now, and asOfHoursAgo = the selected window) yield every tile's delta
// from a consistent snapshot pair. Main scores are owned by the snapshot
// fetches; this only writes the delta badges.
const DELTA_KEYS = ['composite', 'device_health', 'performance', 'network', 'security', 'software']
async function fetchTileDeltas() {
  try {
    const [nowRows, beforeRows] = await Promise.all([
      query('firehose.scores.categories', { ...snapshotParams.value, asOfHoursAgo: 0 }).catch(() => []),
      query('firehose.scores.categories', { ...snapshotParams.value, asOfHoursAgo: timeRangeHours.value }).catch(() => []),
    ])
    const now = nowRows[0] || {}
    const before = beforeRows[0] || {}
    const deltas = {}
    for (const key of DELTA_KEYS) {
      const n = now[`avg_${key}`]
      const b = before[`avg_${key}`]
      deltas[key] = (n != null && b != null) ? Math.round((n - b) * 10) / 10 : null
    }
    tileDeltas.value = deltas
  } catch (e) {
    console.error('Tile delta fetch failed:', e)
  }
}

// ─── Fetch Grade Distribution ─────────────────────────────────
async function fetchDistribution(category = null) {
  loading.value.distribution = true
  try {
    let rows
    if (category) {
      rows = await query('firehose.scores.grade_distribution_category', { ...queryParams.value, category })
    } else {
      rows = await query('firehose.scores.grade_distribution', queryParams.value)
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
  try {
    const rows = await query('firehose.scores.biggest_movers', { ...queryParams.value, limit: 10 })
    // The query now returns per-category curr_*/prev_* so the expansion panel
    // doesn't need a second query — we pass the whole row through.
    movers.value = rows.map(r => ({
      host_identifier: r.host_id,
      hostname: r.hostname,
      computer_name: r.computer_name,
      hardware_model: '',
      prev_grade: r.prev_grade,
      curr_grade: r.curr_grade,
      delta: Number(r.delta),
      _raw: r,
    }))
  } catch (e) {
    console.error('Movers fetch failed:', e)
    movers.value = []
  }
  loading.value.movers = false
}

// ─── Build Mover Detail (category breakdown) from cached row ──
// No second fetch needed — biggest_movers already returns per-category
// curr_*/prev_* for the same host. Previously this called a query twice
// with identical params (so every delta rendered as "—").
function buildMoverDetail(hostId) {
  const mover = movers.value.find(m => m.host_identifier === hostId)
  const row = mover ? mover._raw : null

  const num = (v) => (v === null || v === undefined || v === '') ? null : Number(v)

  // Weights mirror the canonical composite (core-scores.ts):
  // 0.25*DH + 0.35*Perf + 0.20*Sec + 0.20*SW. Network is informational —
  // shown for context but excluded from the composite (see SCORE-IDEA.md).
  const cats = [
    { key: 'performance',   label: 'Performance',   weight: 35 },
    { key: 'device_health', label: 'Device Health', weight: 25 },
    { key: 'security',      label: 'Security',      weight: 20 },
    { key: 'software',      label: 'Software',      weight: 20 },
    { key: 'network',       label: 'Network',       weight: null },
  ].map(c => {
    const currVal = row ? num(row[`curr_${c.key}`]) : null
    const prevVal = row ? num(row[`prev_${c.key}`]) : null
    const delta = (currVal !== null && prevVal !== null) ? +(currVal - prevVal).toFixed(1) : null
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
    const weightNote = driver.weight === null
      ? 'informational — not in the composite'
      : `${driver.weight}% weight`
    insight = `${driver.label} ${dir} by ${Math.abs(driver.delta).toFixed(1)} points (${weightNote}), `
    if (Math.abs(driver.delta) > 5) {
      insight += `which was the primary driver of this device's score change.`
    } else {
      insight += `contributing to a small overall shift. Multiple categories moved in the same direction.`
    }
  }

  return { categories: cats, insight }
}

// ─── Fetch Dimension Breakdowns ───────────────────────────────
async function fetchDimensions() {
  loading.value.dimensions = true
  try {
    const [cpuRows, modelRows, ramRows, swapRows] = await Promise.all([
      query('firehose.scores.dimension_cpu', queryParams.value),
      query('firehose.scores.dimension_model', queryParams.value),
      query('firehose.scores.dimension_ram', queryParams.value),
      query('firehose.scores.dimension_swap', queryParams.value),
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

// ─── Fetch Device Scores List ────────────────────────────
async function fetchDeviceList() {
  if (wcMode.value) return
  loading.value.deviceList = true
  try {
    const rows = await query('firehose.scores.device_list', { ...queryParams.value, limit: 200 })
    deviceList.value = rows.map(r => ({
      host_id: r.host_id,
      hostname: r.hostname,
      cpu_class: r.cpu_class,
      ram_tier: r.ram_tier,
      device_health_score: Number(r.device_health_score),
      performance_score: Number(r.performance_score),
      network_score: Number(r.network_score),
      security_score: Number(r.security_score),
      software_score: Number(r.software_score),
      composite_score: Number(r.composite_score),
      composite_grade: r.composite_grade,
      data_sources: r.data_sources
    }))
  } catch (e) {
    console.error('Device list fetch failed:', e)
  }
  loading.value.deviceList = false
}

function deviceSortBy(col) {
  if (deviceSortCol.value === col) { deviceSortAsc.value = !deviceSortAsc.value }
  else { deviceSortCol.value = col; deviceSortAsc.value = col === 'hostname' }
}

function deviceSortIcon(col) {
  if (deviceSortCol.value !== col) return ''
  return deviceSortAsc.value ? '▲' : '▼'
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
        { name: 'WiFi Signal (RSSI)', weight: 0.40, score: rssiScore, detail: `Fleet avg ${rssi.toFixed(1)} dBm across ${w.unique_hosts || 0} hosts on WiFi` },
        { name: 'Signal-to-Noise', weight: 0.30, score: snrScore, detail: `Fleet avg ${snr.toFixed(1)} dB` },
        { name: 'Transmit Rate', weight: 0.20, score: txScore, detail: `Fleet avg ${Math.round(tx)} Mbps` },
        { name: 'Network Confidence', weight: 0.10, score: vpnConnPct, detail: `${vpnConnPct}% connected — ${v.vpn_active || 0} VPN, ${v.direct_connected || 0} direct, ${v.disconnected || 0} disconnected` },
      ]
    } else if (categoryKey === 'security') {
      const [osRows, fleetRows, postureRows] = await Promise.all([
        query('firehose.health.os_summary'),
        query('firehose.scores.fleet_summary'),
        query('firehose.security.posture_summary').catch(() => []),
      ])
      const os = osRows[0] || {}
      const fleet = fleetRows[0] || {}
      const posture = postureRows[0] || {}
      const reporting = os.total_devices || 0
      const fleetTotal = fleet.device_count || 1
      const postureHosts = Number(posture.posture_hosts || 0)
      const currentPct = reporting ? Math.round((os.os_current || 0) / reporting * 100) : 0
      const healthyPct = reporting ? Math.round((os.healthy || 0) / reporting * 100) : 0

      // 6 signal slots always rendered for transparency — config-based ones
      // (FileVault/Firewall/Gatekeeper/SIP) flip to `inactive` when the
      // Fleet posture schedule is paused. Weights below match the SQL
      // formula and sum to 100%.
      const hasPosture = postureHosts > 0
      const pct = (n) => Math.round((Number(n) || 0) / postureHosts * 100)
      const inactiveDetail = `Requires Fleet "DEX - Device security posture" schedule — currently paused, so this signal is not counted in the live Security score.`

      const sig = (name, type, weight, active, score, detail) => ({
        name, type, weight, score: active ? score : 0,
        detail: active ? detail : inactiveDetail,
        inactive: !active,
      })

      signalDefs = [
        sig('FileVault (disk encryption)', 'config', 0.25, hasPosture,
            hasPosture ? pct(posture.disk_encrypted_count) : 0,
            `${posture.disk_encrypted_count || 0}/${postureHosts} hosts encrypted`),
        sig('Firewall', 'config', 0.20, hasPosture,
            hasPosture ? pct(posture.firewall_enabled_count) : 0,
            `${posture.firewall_enabled_count || 0}/${postureHosts} hosts with firewall on`),
        sig('Gatekeeper', 'config', 0.15, hasPosture,
            hasPosture ? pct(posture.gatekeeper_enabled_count) : 0,
            `${posture.gatekeeper_enabled_count || 0}/${postureHosts} hosts with Gatekeeper active`),
        sig('SIP (System Integrity Protection)', 'config', 0.10, hasPosture,
            hasPosture ? pct(posture.sip_enabled_count) : 0,
            `${posture.sip_enabled_count || 0}/${postureHosts} hosts with SIP enabled`),
        sig('OS Currency', 'time', 0.15, true, currentPct,
            `${os.os_current || 0}/${reporting} reporting hosts on current OS (${fleetTotal - reporting} not reporting — scored as current)`),
        sig('DEX OS Health', 'time', 0.15, true, healthyPct,
            `${os.healthy || 0}/${reporting} reporting hosts rated healthy (${fleetTotal - reporting} not reporting — scored as acceptable)`),
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
    const end = new Date()
    const start = new Date(end.getTime() - 7 * 24 * 3600 * 1000)
    const prevStart = new Date(start.getTime() - 7 * 24 * 3600 * 1000)
    const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ')

    const [adoptRows, tierRows, osRows, crashTopRows, staleRows, patchSummaryRows, patchPrevRows] = await Promise.all([
      query('firehose.adoption.summary'),
      query('firehose.adoption.tier_distribution'),
      query('firehose.health.os_summary'),
      query('firehose.crashes.top_crashers', { limit: 8 }),
      query('firehose.adoption.stale_apps', { limit: 8 }),
      query('scores.timeline_patches_summary', { startDate: fmt(start), endDate: fmt(end), minHosts: 1 }).catch(() => []),
      query('scores.timeline_patches_summary', { startDate: fmt(prevStart), endDate: fmt(start), minHosts: 1 }).catch(() => []),
    ])

    // "Are we faster?" — host-weighted fleet MTTP, this 7d vs the prior 7d.
    // Lower MTTP = faster, so a negative delta is an improvement.
    const wtdMttp = (rows) => {
      let h = 0, wl = 0
      for (const r of (rows || [])) { const hosts = Number(r.hosts || 0); h += hosts; wl += hosts * Number(r.avg_lag || 0) }
      return h > 0 ? +(wl / h).toFixed(2) : null
    }
    const curMttp = wtdMttp(patchSummaryRows)
    const prevMttp = wtdMttp(patchPrevRows)
    patchTrend.value = {
      current: curMttp,
      prior: prevMttp,
      delta: (curMttp != null && prevMttp != null) ? +(curMttp - prevMttp).toFixed(2) : null,
    }

    // Collapse per-day rows into per-software for the table
    const bySw = new Map()
    for (const r of (patchSummaryRows || [])) {
      const k = r.software_name
      if (!bySw.has(k)) {
        bySw.set(k, {
          software_name: k,
          hosts: 0,
          weightedLagSum: 0,
          min_lag: Number(r.min_lag),
          max_lag: Number(r.max_lag),
          maxDistinct: Number(r.distinct_lags || 0),
        })
      }
      const agg = bySw.get(k)
      const hosts = Number(r.hosts || 0)
      agg.hosts += hosts
      agg.weightedLagSum += hosts * Number(r.avg_lag || 0)
      agg.min_lag = Math.min(agg.min_lag, Number(r.min_lag))
      agg.max_lag = Math.max(agg.max_lag, Number(r.max_lag))
      agg.maxDistinct = Math.max(agg.maxDistinct, Number(r.distinct_lags || 0))
    }
    softwarePatchMovers.value = Array.from(bySw.values())
      .map(a => ({
        software_name: a.software_name,
        hosts: a.hosts,
        avg_lag: a.hosts > 0 ? +(a.weightedLagSum / a.hosts).toFixed(2) : 0,
        min_lag: +a.min_lag.toFixed(2),
        max_lag: +a.max_lag.toFixed(2),
        distinct_lags: a.maxDistinct,
      }))
      .sort((x, y) => y.hosts - x.hosts)
      .slice(0, 10)

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

// Mockup convention for TEXT (table cells): healthy scores read as plain
// navy; only degraded scores are colored (gold -> orange -> red).
function signalColor(score) {
  if (score >= 75) return '#515774'
  if (score >= 60) return '#a47f1e'
  if (score >= 40) return '#eb6743'
  return '#eb4343'
}

// Mockup convention for BAR FILLS (score breakdown): the good band is brand
// green — never navy. Green -> gold -> orange -> red on the canonical scale.
function signalBarColor(score) {
  if (score >= 75) return '#009a7d'
  if (score >= 60) return '#ecc767'
  if (score >= 40) return '#eb6743'
  return '#eb4343'
}

// ─── Fetch All Data ───────────────────────────────────────────
function fetchAll() {
  fetchFleetScore()
  fetchCategoryScores()
  fetchSecurityExposure()
  fetchTileDeltas()
  fetchDrillDowns()
  fetchTeamBreakdown()
  fetchReadiness()
}

// Post-setup sanity check: scoring tables must be non-empty or the grade is
// built on ifNull() defaults. security_posture is excluded here — the score
// has an explicit OS-layer fallback for it (see SCORE-IDEA.md, Security).
async function fetchReadiness() {
  try {
    const rows = await query('firehose.scores.readiness')
    missingSignals.value = rows
      .filter(r => Number(r.row_count) === 0 && r.tbl !== 'security_posture')
      .map(r => r.tbl)
  } catch (e) {
    console.error('Readiness check failed:', e)
  }
}

// Time-range-scoped views only: refetch these (and nothing else) when the user
// switches the range, so the snapshot cards above don't flicker.
function fetchDrillDowns() {
  fetchDistribution(expandedCategory.value)
  fetchMovers()
  fetchDimensions()
  fetchDeviceList()
}

// Filter changes affect every cohort → refetch everything.
watch(filterParams, () => {
  fetchAll()
}, { deep: true })

// Time-range changes only scope the drill-downs → refetch just those. The
// composite/category/exposure cards reflect each host's latest snapshot and
// don't depend on the range, so they stay put (no reload, no flicker).
watch(selectedRange, () => {
  fetchTileDeltas()
  fetchDrillDowns()
})

// Exposure comparison window changed → re-diff security posture vs that point.
watch(exposureDays, () => {
  fetchSecurityExposure()
})

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

/* ─── 90-day endpoint security-exposure callout ─── */
.exposure-section {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "main delta" "caption caption";
  align-items: center;
  gap: 4px 20px;
  padding: 16px 20px;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-left: 4px solid var(--fleet-black-25);
  border-radius: var(--radius-large);
}
.exposure-section--worse { border-left-color: var(--status-critical); }
.exposure-section--better { border-left-color: var(--status-good); }
.exposure-main { grid-area: main; display: flex; flex-direction: column; gap: 2px; }
.exposure-eyebrow-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 2px;
}
.exposure-eyebrow {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black-75);
}
.exposure-window-picker {
  display: inline-flex;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  overflow: hidden;
}
.exposure-window-btn {
  appearance: none;
  border: none;
  background: var(--fleet-white);
  color: var(--fleet-black-50);
  font-size: var(--font-size-xs);
  font-weight: 600;
  padding: 2px 8px;
  cursor: pointer;
  border-left: 1px solid var(--fleet-black-10);
}
.exposure-window-btn:first-child { border-left: none; }
.exposure-window-btn:hover { background: var(--fleet-off-white); color: var(--fleet-black-75); }
.exposure-window-btn.active { background: #6a67fe; color: var(--fleet-white); }
.exposure-headline { font-size: var(--font-size-md); font-weight: 600; color: var(--fleet-black); }
.exposure-detail { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.exposure-signals { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.exposure-signal {
  display: inline-flex; align-items: baseline; gap: 5px; font-size: var(--font-size-xs);
  background: var(--fleet-off-white); border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius); padding: 2px 7px;
}
.exposure-signal-label { color: var(--fleet-black-50); }
.exposure-signal-now { font-weight: 700; color: var(--fleet-black-75); }
.exposure-signal-delta { font-weight: 700; }
.exposure-signal-delta.sig-worse { color: var(--status-critical); }
.exposure-signal-delta.sig-better { color: var(--status-good); }
.exposure-delta {
  grid-area: delta;
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-family: var(--font-mono);
  font-weight: 700;
}
.exposure-delta--worse { color: var(--status-critical); }
.exposure-delta--better { color: var(--status-good); }
.exposure-delta--flat { color: var(--fleet-black-50); }
.exposure-delta-arrow { font-size: var(--font-size-md); }
.exposure-delta-val { font-size: var(--font-size-xl, 28px); }
.exposure-delta-unit { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.exposure-caption {
  grid-area: caption;
  margin: 4px 0 0;
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  line-height: 1.4;
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
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0;
}

.header-subtitle {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black-75);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--pad-medium);
}

.comparison-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black-75);
  font-style: italic;
}

.time-range-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.time-range-hint {
  font-size: 11px;
  color: var(--fleet-black-50);
  font-style: italic;
  cursor: help;
}

/* ─── Hero: fleet-wide composite ──────────────── */
.hero-section {
  max-width: 400px;
}

/* ─── Per-fleet (team) breakdown ──────────────── */
.team-breakdown {
  margin-top: var(--pad-medium);
  padding: var(--pad-medium) var(--pad-large);
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
}
.team-breakdown-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.team-breakdown-header h3 {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: 700;
  color: var(--fleet-black);
}
.team-breakdown-note {
  font-size: 11px;
  color: var(--fleet-black-50);
  font-style: italic;
}
.team-breakdown-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.team-card {
  padding: 12px 14px;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  background: var(--fleet-off-white);
}
.team-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}
.team-card-id {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
}
.team-card-hosts {
  font-size: 11px;
  color: var(--fleet-black-50);
}
.team-card-grade-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}
.team-card-grade {
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
}
.team-card-grade.grade-a { color: var(--fleet-success); }
.team-card-grade.grade-b { color: var(--status-good); }
.team-card-grade.grade-c { color: var(--fleet-warning); }
.team-card-grade.grade-d { color: var(--fleet-ui-orange); }
.team-card-grade.grade-f { color: var(--fleet-error); }
.team-card-score {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--fleet-black);
}
.team-card-score-max {
  font-size: 11px;
  color: var(--fleet-black-50);
  margin-left: 2px;
}
.team-card-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.team-cat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
}
.team-cat-key {
  color: var(--fleet-black-75);
  font-weight: 500;
}
.team-cat-val {
  color: var(--fleet-black);
  font-weight: 600;
}
.team-card--missing {
  background: var(--fleet-black-5);
  border-style: dashed;
}
.team-card-missing {
  font-size: 11px;
  color: var(--fleet-black-50);
  line-height: 1.5;
}
.team-card-missing code {
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--fleet-black-10);
  padding: 1px 4px;
  border-radius: 3px;
}

/* ─── 30-day composite trend ──────────────────── */
.trend-section {
  margin-top: var(--pad-medium);
  padding: var(--pad-medium) var(--pad-large);
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  max-width: 800px;
}
.trend-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.trend-title {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--fleet-black);
}
.trend-range {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black-75);
}
.trend-axis {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 10px;
  color: var(--fleet-black-33);
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
  border-radius: var(--radius-large);
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
  font-weight: 700;
  color: var(--fleet-black);
}

.breakdown-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-toggle {
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-25);
  border-radius: var(--radius);
  padding: 4px 12px;
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--fleet-black-75);
  cursor: pointer;
  transition: all 150ms ease-in-out;
}

.info-toggle:hover {
  background: var(--fleet-black-5);
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

/* ─── Scoring readiness warning ───────────────── */
.readiness-banner {
  background: var(--status-fair-bg);
  border: 1px solid var(--fleet-yellow-banner-outline);
  border-radius: var(--radius-large);
  padding: var(--pad-smedium) var(--pad-medium);
  margin-bottom: var(--pad-medium);
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
}

/* ─── Methodology info box ────────────────────── */
.methodology-box {
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
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
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black-75);
}

/* Score bars (comparative, per the Score-breakdown mockup): thin trackless
   pills — the color stops at the value. Gauges keep tracks; these don't. */
.signal-bar-track {
  flex: 1;
  height: 10px;
  background: transparent;
  border-radius: var(--radius-full);
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
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  min-width: 32px;
  text-align: right;
}

.signal-row--inactive {
  opacity: 0.55;
}

.signal-row--inactive .signal-score {
  color: var(--fleet-black-33);
}

.signal-bar-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 11px;
  color: var(--fleet-black-33);
  font-style: italic;
  /* the track itself is transparent (score bars are trackless) — paused rows
     get their own soft strip so "no data" doesn't float in whitespace */
  background: var(--fleet-black-5);
  border-radius: var(--radius-full);
}

.signal-type-pill {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 500;
  border-radius: var(--radius-full);
  vertical-align: middle;
}

.signal-type-pill--config {
  background: var(--fleet-accent-purple-light);
  color: var(--fleet-accent-purple);
}

.signal-type-pill--time {
  background: var(--status-good-bg);
  color: var(--status-good-text);
}

.signal-status-pill {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 500;
  border-radius: var(--radius-full);
  background: var(--status-fair-bg);
  color: var(--status-fair-text);
  vertical-align: middle;
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
  font-weight: 700;
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
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--fleet-black);
}

.stat-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black-75);
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
  background: var(--fleet-black-10);
  border-radius: var(--radius-full);
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
  border-radius: var(--radius-large);
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
  color: var(--fleet-status-success);
}

.drill-usage.weekly {
  background: #e8f0fe;
  color: #2d5fba;
}

.drill-usage.monthly {
  background: #fef9e8;
  color: var(--status-fair-text);
}

.drill-usage.stale {
  background: #fef0e8;
  color: var(--fleet-ui-orange);
}

.drill-usage.never {
  background: #fee8ec;
  color: var(--fleet-status-error);
}

.drill-days {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  min-width: 80px;
  text-align: right;
}

.good-news {
  font-size: var(--font-size-sm);
  color: var(--status-good);
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

/* ─── Device scores table ────────────────────── */
.device-table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--pad-medium);
  flex-wrap: wrap;
  gap: 12px;
}

.device-table-title-group {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.device-table-header h3 {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--fleet-black);
  white-space: nowrap;
}

/* Mini stacked grade distribution (replaces the full GradeDistribution component) */
.mini-distribution {
  display: flex;
  height: 8px;
  border-radius: var(--radius-full);
  overflow: hidden;
  flex: 1;
  max-width: 360px;
  min-width: 180px;
}

.mini-dist-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 400ms ease-out;
  overflow: hidden;
}

.mini-dist-segment.grade-A { background: var(--fleet-success); }
.mini-dist-segment.grade-B { background: var(--status-good-soft); }
.mini-dist-segment.grade-C { background: var(--status-fair); }
.mini-dist-segment.grade-D { background: var(--fleet-ui-orange); }
.mini-dist-segment.grade-F { background: var(--fleet-error); }

.mini-dist-label {
  display: none;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  padding: 0 4px;
  letter-spacing: 0.3px;
}

.device-search-group {
  position: relative;
  display: flex;
  align-items: center;
}

.device-search-icon {
  position: absolute;
  left: 10px;
  pointer-events: none;
}

.device-search-input {
  font-size: var(--font-size-sm);
  padding: 6px 12px 6px 30px;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  width: 220px;
  background: var(--fleet-white);
  outline: none;
  transition: border-color 150ms ease-in-out;
}

.device-search-input:focus {
  border-color: var(--fleet-black);
}

.device-table-wrap {
  overflow-x: auto;
  background: var(--fleet-white);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-large);
}

.device-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.device-table th {
  text-align: left;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--fleet-black);
  background: var(--fleet-off-white);
  padding: 10px 14px;
  border-bottom: 1px solid var(--fleet-black-10);
  white-space: nowrap;
  user-select: none;
}
.device-table th:first-child { border-top-left-radius: var(--radius-large); }
.device-table th:last-child { border-top-right-radius: var(--radius-large); }

.device-table th.sortable {
  cursor: pointer;
}

.device-table th.sortable:hover {
  color: var(--fleet-black);
}

.device-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--fleet-black-10);
  color: var(--fleet-black-75);
}

.device-table tbody tr:last-child td {
  border-bottom: 0;
}

.device-table tbody tr:hover {
  background: var(--fleet-off-white);
}

.device-row-clickable {
  cursor: pointer;
  transition: background var(--transition-fast);
}

.device-row-clickable:hover {
  background: var(--fleet-off-white);
}

.device-row-clickable:hover .device-hostname {
  color: var(--fleet-black);
}

.device-row-cta {
  display: inline-block;
  margin-left: 6px;
  font-weight: 600;
  color: var(--fleet-black-25);
  transition: color var(--transition-fast), transform var(--transition-fast);
}

.device-row-clickable:hover .device-row-cta {
  color: var(--fleet-green);
  transform: translateX(2px);
}

.device-hostname {
  font-weight: 700;
  color: var(--fleet-black);
}

.device-score-cell {
  font-weight: 600;
  text-align: left;
}

.empty-state {
  text-align: center;
  padding: var(--pad-xlarge);
  color: var(--fleet-black-50);
  font-size: var(--font-size-sm);
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
  border-radius: var(--radius-large);
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

.patch-movers-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.patch-trend { font-size: var(--font-size-xs); font-weight: 600;
  padding: 2px 8px; border-radius: var(--radius-full); background: var(--fleet-off-white);
}
.patch-trend-arrow { font-weight: 700; }
.patch-trend--faster { color: var(--status-good); }
.patch-trend--slower { color: var(--status-critical); }
.patch-trend--flat { color: var(--fleet-black-50); }

/* small caption used by the software breakdown above the MttpTable */
.section-hint { font-size: var(--font-size-xs); color: var(--fleet-black-50); margin: 0 0 12px; }
</style>
