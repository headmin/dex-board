<template>
  <div class="timeline-page">
    <header class="timeline-header">
      <h1>GitOps timeline</h1>
      <div class="timeline-controls">
        <button
          v-for="r in ranges"
          :key="r.value"
          class="range-btn"
          :class="{ active: selectedRange === r.value }"
          @click="selectedRange = r.value"
        >{{ r.label }}</button>
      </div>
    </header>

    <!-- GitHub-style score heatmap -->
    <section class="section">
      <h2>Fleet health heatmap</h2>
      <p class="section-hint">Hourly fleet composite score · darker = healthier · dots mark git deployments</p>
      <div class="heatmap-scroll">
        <div class="heatmap-grid" :style="{ gridTemplateColumns: `60px repeat(24, 1fr)` }">
          <!-- Hour headers -->
          <div class="heatmap-label corner"></div>
          <div v-for="h in 24" :key="'h'+h" class="heatmap-hour">{{ String(h-1).padStart(2,'0') }}</div>
          <!-- Day rows -->
          <template v-for="day in heatmapDays" :key="day.date">
            <div class="heatmap-label">{{ day.label }}</div>
            <div
              v-for="h in 24"
              :key="day.date+'-'+h"
              class="heatmap-cell"
              :style="{ background: cellColor(day.cells[h-1]) }"
              :title="cellTooltip(day.date, h-1, day.cells[h-1])"
              :class="{ 'has-deploy': cellHasDeploy(day.date, h-1) }"
            >
              <span v-if="cellHasDeploy(day.date, h-1)" class="deploy-dot"></span>
            </div>
          </template>
        </div>
        <div class="heatmap-legend">
          <span class="legend-label">Lower</span>
          <div class="legend-block" style="background:#ef4444"></div>
          <div class="legend-block" style="background:#f97316"></div>
          <div class="legend-block" style="background:#eab308"></div>
          <div class="legend-block" style="background:#84cc16"></div>
          <div class="legend-block" style="background:#22c55e"></div>
          <span class="legend-label">Higher</span>
          <span class="legend-deploy"><span class="deploy-dot-legend"></span> Deploy</span>
        </div>
      </div>
    </section>

    <!-- Timeline -->
    <section class="section">
      <h2>Deployment timeline</h2>
      <p class="section-hint">Git commits to main with correlated fleet events · click to expand</p>

      <div v-if="loading" class="timeline-loading">Loading timeline data...</div>

      <div v-else class="timeline">
        <div
          v-for="(commit, idx) in enrichedCommits"
          :key="commit.hash"
          class="timeline-entry"
          :class="{ expanded: expandedHash === commit.hash, 'has-impact': commit.hasImpact }"
        >
          <!-- Timeline connector -->
          <div class="timeline-rail">
            <div class="timeline-dot" :class="commitDotClass(commit)"></div>
            <div v-if="idx < enrichedCommits.length - 1" class="timeline-line"></div>
          </div>

          <!-- Commit card -->
          <div class="timeline-card" @click="toggleExpand(commit.hash)">
            <div class="commit-header">
              <code class="commit-hash">{{ commit.hash }}</code>
              <span class="commit-time">{{ formatTime(commit.timestamp) }}</span>
              <!-- What this commit changed (from git diff, not guessed) -->
              <span v-for="ct in (commit.changeTypes || [])" :key="ct" class="change-type-pill" :class="'ct-' + ct">{{ changeTypeLabel(ct) }}</span>
              <span v-if="commit.tags.length" class="tag-count">{{ commit.tags.length }} pinned</span>
            </div>
            <div class="commit-message">{{ commit.message }}</div>
            <div class="commit-meta">
              <span class="commit-author">{{ commit.author }}</span>
              <span v-if="commit.teamsAffected && commit.teamsAffected.length" class="commit-teams">
                → {{ commit.teamsAffected.join(', ') }}
              </span>
              <span v-if="commit.files && commit.files.length" class="commit-files">
                · {{ commit.files.length }} file{{ commit.files.length > 1 ? 's' : '' }}
              </span>
            </div>

            <!-- Fleet observations (dismissable badges) -->
            <div v-if="visibleEvents(commit).length" class="fleet-events-summary">
              <span
                v-for="(fe, fi) in visibleEvents(commit).slice(0, 4)"
                :key="fe._idx"
                class="fleet-badge"
                :class="[fe.type, 'corr-' + fe.correlation, { 'badge-active': expandedEventKey === commit.hash + '-' + fe._idx }]"
                @click.stop="toggleEventDetail(commit.hash, fe._idx)"
              >
                <span v-if="fe.correlation === 'verified'" class="corr-icon" title="Verified: software name matches commit">&#10003;</span>
                <span v-else-if="fe.correlation === 'likely'" class="corr-icon" title="Likely: commit type matches event">~</span>
                {{ fe.label }}
                <button class="badge-dismiss" @click.stop="dismissEvent(commit.hash, fe._idx)" title="Dismiss">&times;</button>
              </span>
              <span v-if="visibleEvents(commit).length > 4" class="fleet-more">
                +{{ visibleEvents(commit).length - 4 }} more
              </span>
              <button
                v-if="dismissedEvents[commit.hash] && Object.keys(dismissedEvents[commit.hash]).length"
                class="badge-restore"
                @click.stop="restoreEvents(commit.hash)"
              >Show {{ Object.keys(dismissedEvents[commit.hash]).length }} dismissed</button>
            </div>

            <!-- Inline event detail (shown when a badge is clicked, even before full expand) -->
            <div
              v-for="(fe, fi) in commit.fleetEvents"
              :key="'detail-' + fi"
              v-show="expandedEventKey === commit.hash + '-' + fi"
              class="event-detail-panel"
              @click.stop
            >
              <div class="edp-header">
                <span class="fe-icon" :class="fe.type">{{ eventIcon(fe.type) }}</span>
                <span class="edp-title">{{ fe.label }}</span>
                <span class="fe-severity" :class="fe.severity">{{ fe.severity }}</span>
                <button class="edp-close" @click.stop="expandedEventKey = null">×</button>
              </div>

              <!-- Patch rollout detail (aggregated) -->
              <template v-if="fe.type === 'patch_wave' && fe.data">
                <div class="edp-score-detail">
                  <div class="edp-score-row">
                    <span class="edp-score-label">Software</span>
                    <span class="edp-score-value">{{ fe.data.software }} ({{ fe.data.patchType }})</span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Version</span>
                    <span class="edp-score-value edp-mono">{{ fe.data.oldVersion }} → {{ fe.data.newVersion }}</span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Devices patched</span>
                    <span class="edp-score-value">{{ fe.data.deviceCount }}</span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Avg patch lag</span>
                    <span class="edp-score-value" :class="lagClass(fe.data.avgLag)">{{ fe.data.avgLag }}d</span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Slowest device</span>
                    <span class="edp-score-value" :class="lagClass(fe.data.maxLag)">{{ fe.data.maxLag }}d</span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Rollout window</span>
                    <span class="edp-score-value">{{ formatTime(fe.data.firstApplied) }} – {{ formatTime(fe.data.lastApplied) }}</span>
                  </div>
                </div>
                <!-- Rollout adoption curve -->
                <button
                  class="rollout-btn"
                  :class="{ active: rolloutEventKey === commit.hash + '-' + fi }"
                  @click.stop="loadRollout(fe.data.software, fe.data.newVersion, commit.hash + '-' + fi)"
                >
                  {{ rolloutEventKey === commit.hash + '-' + fi ? 'Hide rollout' : 'Track rollout over time' }}
                </button>
                <div v-if="rolloutEventKey === commit.hash + '-' + fi" class="rollout-panel">
                  <div v-if="rolloutLoading" class="affected-loading">Loading rollout data...</div>
                  <template v-else-if="rolloutData">
                    <p class="rollout-summary">
                      <strong>{{ fe.data.software }} {{ fe.data.newVersion }}</strong> adopted by
                      <strong>{{ rolloutData.adoptedDevices }}</strong>
                      of {{ rolloutData.totalDevices }} fleet devices
                      over {{ rolloutDuration }}.
                      Each bar shows how many devices applied the update per {{ rolloutData.bucketType }}.
                    </p>
                    <div class="rollout-chart">
                      <BarChart
                        :title="fe.data.software + ' ' + fe.data.newVersion + ' — Devices per ' + rolloutData.bucketType"
                        :data="rolloutBarData"
                        :horizontal="false"
                      />
                    </div>
                  </template>
                </div>
              </template>

              <!-- Score change detail -->
              <template v-if="fe.type === 'score_drop' || fe.type === 'score_improvement'">
                <div class="edp-score-detail">
                  <div class="edp-score-row">
                    <span class="edp-score-label">Fleet avg score</span>
                    <span class="edp-score-value">{{ fe.data.score }}</span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Change</span>
                    <span class="edp-score-value" :class="deltaClass(fe.data.delta)">
                      {{ fe.data.delta > 0 ? '+' : '' }}{{ fe.data.delta.toFixed(1) }} points
                    </span>
                  </div>
                  <div class="edp-score-row">
                    <span class="edp-score-label">Devices reporting</span>
                    <span class="edp-score-value">{{ fe.data.devices }}</span>
                  </div>
                </div>
              </template>

            </div>

            <!-- Expanded detail (full commit drill-down) -->
            <div v-if="expandedHash === commit.hash" class="commit-detail" @click.stop>
              <!-- What changed (files from git) -->
              <div v-if="commit.files && commit.files.length" class="detail-section">
                <h4>Files changed</h4>
                <div class="file-list">
                  <code v-for="f in commit.files" :key="f" class="file-path">{{ f }}</code>
                </div>
              </div>

              <!-- Fleet observations -->
              <div v-if="commit.fleetEvents.length" class="detail-section">
                <h4>Fleet observations</h4>
                <p class="impact-explainer">
                  Events detected on the fleet within ±4 hours of this commit.
                  <template v-if="commit.fleetEvents.some(e => e.type === 'patch_wave')">
                    Patch events are a <strong>direct result</strong> of gitops changes — devices received the deployed software.
                  </template>
                  <template v-if="commit.fleetEvents.some(e => e.type === 'score_drop' || e.type === 'score_improvement')">
                    Score changes are <strong>correlated in time</strong> but may have other causes.
                  </template>
                </p>
                <div v-for="(fe, fi) in commit.fleetEvents" :key="fi"
                  class="fleet-event-row"
                  :class="{ clickable: hasDetail(fe) }"
                  @click.stop="hasDetail(fe) && toggleEventDetail(commit.hash, fi)"
                >
                  <span class="fe-icon" :class="fe.type">{{ eventIcon(fe.type) }}</span>
                  <span class="fe-time">{{ formatTime(fe.time) }}</span>
                  <span class="fe-label">{{ fe.label }}</span>
                  <span class="fe-corr" :class="'corr-' + fe.correlation">{{ fe.correlation }}</span>
                  <span v-if="hasDetail(fe)" class="fe-expand-hint">details →</span>
                </div>
              </div>
              <div v-else class="detail-section detail-empty">
                No fleet events detected within ±4 hours of this deploy.
              </div>

              <!-- Fleet impact summary -->
              <div class="detail-section">
                <div class="impact-header-row">
                  <h4>Fleet impact</h4>
                  <button class="score-info-btn" @click.stop="showScoreInfo = !showScoreInfo">
                    {{ showScoreInfo ? 'Hide score info' : 'What is the DEX score?' }}
                  </button>
                </div>
                <div v-if="showScoreInfo" class="score-info-box">
                  <p>The <strong>DEX composite score</strong> (0–100) measures overall device health. It's a weighted average of four categories, each computed hourly from real device telemetry:</p>
                  <div class="si-categories">
                    <span class="si-cat"><span class="si-dot" style="background:#4a90d9"></span><strong>Performance</strong> 35% — memory %, disk %, top process load, uptime</span>
                    <span class="si-cat"><span class="si-dot" style="background:#3db67b"></span><strong>Device health</strong> 25% — disk capacity, hardware age</span>
                    <span class="si-cat"><span class="si-dot" style="background:#8b5cf6"></span><strong>Security</strong> 20% — encryption, firewall, SIP, Gatekeeper</span>
                    <span class="si-cat"><span class="si-dot" style="background:#ec4899"></span><strong>Software</strong> 20% — app sprawl, browser extensions</span>
                  </div>
                  <p class="si-grades">Grades: <strong>A</strong> ≥90 · <strong>B</strong> ≥75 · <strong>C</strong> ≥60 · <strong>D</strong> ≥40 · <strong>F</strong> &lt;40. Network (WiFi) is tracked but excluded from scoring — it's environmental. If any scored category is F, the grade drops one letter.</p>
                  <p class="si-context">When this deploy happened, we compare the fleet-wide average composite score from 4h before to 4h after. Devices with a score change &gt;5 points are flagged as improved or degraded.</p>
                </div>
                <p class="impact-explainer">
                  Comparing fleet DEX composite scores from 4h before to 4h after this deploy.
                </p>
                <div v-if="affectedLoading" class="affected-loading">Scanning fleet...</div>
                <template v-else-if="impactSummary">
                  <div class="impact-summary">
                    <div class="impact-stat">
                      <span class="impact-number">{{ impactSummary.total_devices }}</span>
                      <span class="impact-label">devices with scores<br/>in the ±4h window</span>
                    </div>
                    <div class="impact-stat" :class="impactVerdictClass">
                      <span class="impact-number" :class="deltaClass(impactSummary.avg_delta)">
                        {{ parseFloat(impactSummary.avg_delta) > 0 ? '+' : '' }}{{ impactSummary.avg_delta }}
                      </span>
                      <span class="impact-label">avg composite score<br/>change (before → after)</span>
                    </div>
                    <div class="impact-stat">
                      <span class="impact-number delta-good">{{ impactSummary.improved_count }}</span>
                      <span class="impact-label">score improved<br/>(&gt;5 pts up)</span>
                    </div>
                    <div class="impact-stat">
                      <span class="impact-number delta-neutral">{{ impactSummary.stable_count }}</span>
                      <span class="impact-label">no significant<br/>change (±5 pts)</span>
                    </div>
                    <div class="impact-stat">
                      <span class="impact-number delta-bad">{{ impactSummary.degraded_count }}</span>
                      <span class="impact-label">score dropped<br/>(&gt;5 pts down)</span>
                    </div>
                    <div class="impact-stat">
                      <span class="impact-number">{{ impactSummary.fleet_score_before }} → {{ impactSummary.fleet_score_after }}</span>
                      <span class="impact-label">fleet-wide avg<br/>composite score</span>
                    </div>
                  </div>
                  <!-- Verdict sentence -->
                  <p class="impact-verdict" :class="impactVerdictClass">
                    {{ impactVerdict }}
                  </p>
                </template>
                <div v-else class="detail-empty">
                  Not enough DEX score data in the ±4h window to assess impact.
                </div>
              </div>

              <!-- Top movers (outliers only) -->
              <div v-if="topMovers.length" class="detail-section">
                <h4>Devices with largest score changes</h4>
                <p class="impact-explainer">
                  These devices had the biggest composite score shift in the ±4h window around this deploy.
                  Click a hostname to inspect its health and score breakdown.
                </p>
                <table class="edp-table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Platform</th>
                      <th>Before</th>
                      <th>After</th>
                      <th>Delta</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="dev in topMovers" :key="dev.host_identifier"
                      :class="{ 'row-selected': selectedDeviceId === dev.host_identifier }"
                    >
                      <td class="edp-hostname" @click.stop="selectDevice(commit, dev)" style="cursor:pointer">{{ dev.hostname }}</td>
                      <td>{{ dev.os_name }} · {{ dev.hardware_model || '' }}</td>
                      <td>{{ dev.score_before }}</td>
                      <td>{{ dev.score_after }}</td>
                      <td>
                        <span class="ad-delta" :class="deltaClass(dev.score_delta)">
                          {{ parseFloat(dev.score_delta) > 0 ? '+' : '' }}{{ dev.score_delta }}
                        </span>
                      </td>
                      <td>
                        <button class="ad-tag-btn"
                          @click.stop="quickTag(commit.hash, dev)"
                          :disabled="commit.tags.some(t => t.hostId === dev.host_identifier)"
                        >{{ commit.tags.some(t => t.hostId === dev.host_identifier) ? 'Pinned' : 'Pin' }}</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Device inspection panel (inline health view) -->
              <div v-if="selectedDeviceId && expandedHash === commit.hash" class="detail-section device-inspect-panel">
                <div class="inspect-header">
                  <h4>{{ selectedDeviceName }} — around deploy</h4>
                  <button class="inspect-close" @click.stop="clearDeviceSelection()">×</button>
                </div>
                <div v-if="deviceHealthLoading" class="affected-loading">Loading device data...</div>
                <template v-else>
                  <!-- DEX score categories chart (primary view) -->
                  <div v-if="deviceScoreLabels.length" class="inspect-chart">
                    <MultiSeriesChart
                      title="DEX score categories (±12h)"
                      :xLabels="deviceScoreLabels"
                      :series="deviceScoreSeries"
                      :yAxes="[{ name: 'Score', min: 0, max: 100 }]"
                      :events="scoreDeployMarker(commit)"
                      :zoomable="false"
                    />
                  </div>
                  <!-- Memory & Disk chart -->
                  <div v-if="deviceHealthLabels.length" class="inspect-chart">
                    <MultiSeriesChart
                      title="Memory & disk (±12h)"
                      :xLabels="deviceHealthLabels"
                      :series="deviceHealthSeries"
                      :yAxes="[{ name: '%', min: 0, max: 100 }]"
                      :thresholds="[{ value: 85, label: 'Warning', color: '#dc2626' }]"
                      :events="deployMarker(commit) ? [deployMarker(commit)] : []"
                      :zoomable="false"
                    />
                  </div>
                  <!-- Patches around this deploy -->
                  <div v-if="devicePatches.length" class="inspect-patches">
                    <h4>Patches applied (±24h)</h4>
                    <div v-for="(p, pi) in devicePatches" :key="pi" class="patch-row">
                      <span class="patch-type">{{ p.patch_type }}</span>
                      <span class="patch-name">{{ p.software_name }}</span>
                      <span class="patch-versions">{{ p.old_version }} → {{ p.new_version }}</span>
                      <span class="patch-lag" v-if="p.days_to_patch">{{ p.days_to_patch }}d lag</span>
                    </div>
                  </div>
                  <div v-if="!deviceScoreLabels.length && !deviceHealthLabels.length" class="detail-empty">
                    No telemetry data for this device in the ±12h window.
                  </div>
                </template>
              </div>

              <!-- Pinned devices -->
              <div class="detail-section">
                <h4>Pinned devices</h4>
                <div class="pinned-row">
                  <div v-for="tag in commit.tags" :key="tag.hostId" class="pinned-chip"
                    :class="{ active: selectedDeviceId === tag.hostId }"
                    @click.stop="selectDeviceById(commit, tag.hostId, tag.hostname)"
                  >
                    <span class="pin-icon">&#x1F4CC;</span>
                    <span class="pin-name">{{ tag.hostname }}</span>
                    <span v-if="tag.note" class="pin-note">{{ tag.note }}</span>
                    <button class="pin-remove" @click.stop="handleUntag(commit.hash, tag.hostId)" title="Unpin">×</button>
                  </div>
                  <!-- Search to pin any device -->
                  <div class="pin-search-wrap" @click.stop>
                    <input
                      v-model="deviceSearchText"
                      class="pin-search-input"
                      placeholder="Search device to pin..."
                      @input="onDeviceSearch"
                    />
                    <div v-if="deviceSearchResults.length" class="pin-search-results">
                      <div
                        v-for="d in deviceSearchResults"
                        :key="d.host_identifier"
                        class="pin-search-result"
                        @click.stop="pinFromSearch(commit.hash, d)"
                      >
                        <span class="psr-name">{{ d.hostname }}</span>
                        <span class="psr-meta">{{ d.os_name }} · {{ d.hardware_model || '' }}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p v-if="!commit.tags.length && !topMovers.length" class="pin-hint">
                  Use "Pin" on top movers above, or search for any device.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div v-if="enrichedCommits.length === 0 && !loading" class="timeline-empty">
          No deployments in the selected time range.
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import dayjs from 'dayjs'
import { useGitopsEvents } from '../composables/useGitopsEvents'
import { useTimelineEvents } from '../composables/useTimelineEvents'
import MultiSeriesChart from '../components/MultiSeriesChart.vue'
import BarChart from '../components/BarChart.vue'

const { gitopsEvents, fetchGitopsEvents } = useGitopsEvents()
const {
  deviceTags, tagDevice, untagDevice,
  fetchScoreHeatmap, fetchScoreChanges, fetchPatchSummary,
  fetchRolloutProgress, fetchImpactSummary, fetchTopMovers, searchDevices,
  fetchDeviceHealthAroundCommit, fetchDeviceScoresAroundCommit, fetchDevicePatchesAroundCommit,
  detectFleetEvents, correlateWithCommits
} = useTimelineEvents()

const ranges = [
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' }
]
const selectedRange = ref('7d')
const loading = ref(false)
const expandedHash = ref(null)
const expandedEventKey = ref(null)
const showScoreInfo = ref(false)
const dismissedEvents = ref({})  // { commitHash: { eventIdx: true } }

// Data
const scoreHeatmapData = ref([])
const scoreChanges = ref([])
const patchSummary = ref([])
const fleetEvents = ref([])

// Computed date range
const dateRange = computed(() => {
  const now = dayjs()
  const match = selectedRange.value.match(/(\d+)d/)
  const days = match ? parseInt(match[1]) : 7
  return {
    start: now.subtract(days, 'day').format('YYYY-MM-DD HH:mm:ss'),
    end: now.format('YYYY-MM-DD HH:mm:ss')
  }
})

// Git events in range
const commitsInRange = computed(() => {
  const start = dayjs(dateRange.value.start)
  const end = dayjs(dateRange.value.end)
  return gitopsEvents.value.filter(e => {
    const t = dayjs(e.timestamp)
    return t.isAfter(start) && t.isBefore(end)
  })
})

// Enriched commits with fleet event correlation
const enrichedCommits = computed(() =>
  correlateWithCommits(commitsInRange.value, fleetEvents.value, deviceTags.value)
)

// ─── Heatmap ────────────────────────────────────────

const heatmapDays = computed(() => {
  const match = selectedRange.value.match(/(\d+)d/)
  const days = match ? parseInt(match[1]) : 7
  const rows = []
  for (let d = days - 1; d >= 0; d--) {
    const date = dayjs().subtract(d, 'day').format('YYYY-MM-DD')
    const label = dayjs().subtract(d, 'day').format('MM/DD ddd')
    const cells = new Array(24).fill(null)
    // Fill from data
    for (const row of scoreHeatmapData.value) {
      if (row.day === date) {
        const hr = parseInt(row.hr)
        cells[hr] = {
          score: parseFloat(row.avg_score),
          devices: parseInt(row.device_count),
          min: parseFloat(row.min_score)
        }
      }
    }
    rows.push({ date, label, cells })
  }
  return rows
})

function cellColor(cell) {
  if (!cell) return '#f5f5f5'
  const s = cell.score
  if (s >= 80) return '#22c55e'
  if (s >= 65) return '#84cc16'
  if (s >= 50) return '#eab308'
  if (s >= 35) return '#f97316'
  return '#ef4444'
}

function cellTooltip(date, hour, cell) {
  const h = String(hour).padStart(2, '0')
  if (!cell) return `${date} ${h}:00 — no data`
  return `${date} ${h}:00\nScore: ${cell.score} (min ${cell.min})\nDevices: ${cell.devices}`
}

function cellHasDeploy(date, hour) {
  return commitsInRange.value.some(c => {
    const t = dayjs(c.timestamp)
    return t.format('YYYY-MM-DD') === date && t.hour() === hour
  })
}

// ─── Timeline helpers ───────────────────────────────

function formatTime(ts) {
  return dayjs(ts).format('MMM DD HH:mm')
}

function commitDotClass(commit) {
  if (commit.fleetEvents.some(e => e.severity === 'high')) return 'dot-red'
  if (commit.fleetEvents.some(e => e.severity === 'medium')) return 'dot-amber'
  if (commit.fleetEvents.length > 0) return 'dot-blue'
  return 'dot-default'
}

function eventIcon(type) {
  switch (type) {
    case 'score_drop': return '↓'
    case 'score_improvement': return '↑'
    case 'patch_wave': return '⟳'
    default: return '•'
  }
}

function changeTypeLabel(ct) {
  const labels = {
    software: 'Software',
    profile: 'Profile',
    script: 'Script',
    policy: 'Policy',
    os_update: 'OS update',
    bootstrap: 'Bootstrap',
    config: 'Config'
  }
  return labels[ct] || ct
}

function visibleEvents(commit) {
  const dismissed = dismissedEvents.value[commit.hash] || {}
  return commit.fleetEvents
    .map((fe, i) => ({ ...fe, _idx: i }))
    .filter(fe => !dismissed[fe._idx])
}

function dismissEvent(commitHash, eventIdx) {
  if (!dismissedEvents.value[commitHash]) dismissedEvents.value[commitHash] = {}
  dismissedEvents.value[commitHash][eventIdx] = true
  dismissedEvents.value = { ...dismissedEvents.value }  // trigger reactivity
  if (expandedEventKey.value === commitHash + '-' + eventIdx) expandedEventKey.value = null
}

function restoreEvents(commitHash) {
  delete dismissedEvents.value[commitHash]
  dismissedEvents.value = { ...dismissedEvents.value }
}

function toggleEventDetail(commitHash, eventIndex) {
  const key = commitHash + '-' + eventIndex
  expandedEventKey.value = expandedEventKey.value === key ? null : key
}

function hasDetail(fe) {
  return fe.type === 'patch_wave' || fe.type === 'score_drop' || fe.type === 'score_improvement'
}

const impactVerdict = computed(() => {
  const s = impactSummary.value
  if (!s) return ''
  const total = parseInt(s.total_devices)
  const degraded = parseInt(s.degraded_count)
  const improved = parseInt(s.improved_count)
  const delta = parseFloat(s.avg_delta)

  if (degraded === 0 && improved === 0) return `No significant score movement across ${total} devices. This deploy had no measurable effect on fleet health.`
  if (degraded === 0 && improved > 0) return `${improved} of ${total} devices saw score improvements after this deploy. No devices were negatively affected.`
  if (degraded > 0 && improved === 0) {
    const pct = Math.round(degraded / total * 100)
    return `${degraded} of ${total} devices (${pct}%) saw score drops after this deploy. Average change: ${delta > 0 ? '+' : ''}${delta} points. Investigate the top movers below.`
  }
  return `Mixed results: ${improved} devices improved, ${degraded} degraded out of ${total} total. Net change: ${delta > 0 ? '+' : ''}${delta} points.`
})

const impactVerdictClass = computed(() => {
  const s = impactSummary.value
  if (!s) return ''
  const degraded = parseInt(s.degraded_count)
  const improved = parseInt(s.improved_count)
  if (degraded > 0 && improved === 0) return 'verdict-negative'
  if (improved > 0 && degraded === 0) return 'verdict-positive'
  if (degraded > 0 && improved > 0) return 'verdict-mixed'
  return 'verdict-neutral'
})

function commitImpactLabel(commit) {
  if (!commit.fleetEvents.length) return null
  const types = commit.fleetEvents.map(e => e.type)
  const parts = []
  if (types.includes('score_drop')) parts.push('score drop')
  if (types.includes('score_improvement')) parts.push('score improved')
  if (types.includes('patch_wave')) {
    const pw = commit.fleetEvents.find(e => e.type === 'patch_wave')
    parts.push(`${pw.data.uniqueDevices} patched`)
  }
  return parts.length ? parts.join(' · ') : null
}

function commitImpactClass(commit) {
  const types = commit.fleetEvents.map(e => e.type)
  if (types.includes('score_drop')) return 'impact-negative'
  if (types.includes('score_improvement')) return 'impact-positive'
  return 'impact-neutral'
}

function lagClass(days) {
  const d = parseFloat(days)
  if (d <= 1) return 'lag-fast'
  if (d <= 7) return 'lag-ok'
  return 'lag-slow'
}

function toggleExpand(hash) {
  if (expandedHash.value === hash) {
    expandedHash.value = null
    clearDeviceSelection()
  } else {
    expandedHash.value = hash
    clearDeviceSelection()
    const commit = enrichedCommits.value.find(c => c.hash === hash)
    if (commit) loadImpactData(commit)
  }
}

function handleUntag(commitHash, hostId) {
  untagDevice(commitHash, hostId)
}

function quickTag(commitHash, dev) {
  tagDevice(commitHash, dev.host_identifier, dev.hostname, '')
}

// ─── Device search for pinning ─────────────────────
const deviceSearchText = ref('')
const deviceSearchResults = ref([])
let searchTimeout = null

function onDeviceSearch() {
  clearTimeout(searchTimeout)
  if (deviceSearchText.value.length < 2) {
    deviceSearchResults.value = []
    return
  }
  searchTimeout = setTimeout(async () => {
    deviceSearchResults.value = await searchDevices(deviceSearchText.value)
  }, 250)
}

function pinFromSearch(commitHash, device) {
  tagDevice(commitHash, device.host_identifier, device.hostname, '')
  deviceSearchText.value = ''
  deviceSearchResults.value = []
}

// ─── Device inspection ─────────────────────────────

const selectedDeviceId = ref(null)
const selectedDeviceName = ref('')
const impactSummary = ref(null)
const topMovers = ref([])
const affectedLoading = ref(false)
const deviceHealthLoading = ref(false)
const deviceHealthLabels = ref([])
const deviceHealthData = ref({ memory: [], disk: [] })
const deviceScoreLabels = ref([])
const deviceScoreData = ref({ composite: [], health: [], performance: [], network: [], security: [], software: [] })
const devicePatches = ref([])

// ─── Rollout tracking ──────────────────────────────
const rolloutData = ref(null)
const rolloutLoading = ref(false)
const rolloutEventKey = ref(null)

const rolloutBarData = computed(() => {
  if (!rolloutData.value?.buckets) return []
  return rolloutData.value.buckets.map(r => ({
    name: r.label,
    value: parseInt(r.devices)
  }))
})

const rolloutDuration = computed(() => {
  if (!rolloutData.value) return ''
  const hours = rolloutData.value.spanHours
  if (hours < 24) return `${hours} hours`
  const days = Math.floor(hours / 24)
  const rem = hours % 24
  return rem > 0 ? `${days}d ${rem}h` : `${days} days`
})

async function loadRollout(softwareName, newVersion, eventKey) {
  if (rolloutEventKey.value === eventKey) {
    // toggle off
    rolloutData.value = null
    rolloutEventKey.value = null
    return
  }
  rolloutLoading.value = true
  rolloutEventKey.value = eventKey
  try {
    rolloutData.value = await fetchRolloutProgress(softwareName, newVersion)
  } catch (e) {
    console.error('Rollout fetch failed:', e)
    rolloutData.value = null
  } finally {
    rolloutLoading.value = false
  }
}

const deviceHealthSeries = computed(() => [
  { name: 'Memory %', data: deviceHealthData.value.memory, color: '#4a90d9' },
  { name: 'Disk %', data: deviceHealthData.value.disk, color: '#f59e0b' }
])

const deviceScoreSeries = computed(() => [
  { name: 'Composite', data: deviceScoreData.value.composite, color: '#192147' },
  { name: 'Health', data: deviceScoreData.value.health, color: '#22c55e' },
  { name: 'Performance', data: deviceScoreData.value.performance, color: '#3b82f6' },
  { name: 'Network', data: deviceScoreData.value.network, color: '#f59e0b' },
  { name: 'Security', data: deviceScoreData.value.security, color: '#8b5cf6' },
  { name: 'Software', data: deviceScoreData.value.software, color: '#ec4899' },
])

function deltaClass(delta) {
  const d = parseFloat(delta)
  if (d < -5) return 'delta-bad'
  if (d < -2) return 'delta-warn'
  if (d > 2) return 'delta-good'
  return 'delta-neutral'
}

function scoreDeployMarker(commit) {
  const commitHour = dayjs(commit.timestamp).format('MM-DD HH:00')
  const idx = deviceScoreLabels.value.indexOf(commitHour)
  if (idx < 0) return []
  return [{ xIndex: idx, label: 'Deploy', hash: commit.hash, message: commit.message, color: '#6a67fe' }]
}

function deployMarker(commit) {
  // Place marker at the commit time position on the mini chart
  const commitHour = dayjs(commit.timestamp).format('MM-DD HH:00')
  const idx = deviceHealthLabels.value.indexOf(commitHour)
  if (idx < 0) return null
  return { xIndex: idx, label: 'Deploy', hash: commit.hash, message: commit.message, color: '#6a67fe' }
}

async function loadImpactData(commit) {
  affectedLoading.value = true
  try {
    const [summary, movers] = await Promise.all([
      fetchImpactSummary(commit.timestamp),
      fetchTopMovers(commit.timestamp)
    ])
    impactSummary.value = summary
    topMovers.value = movers
  } catch (e) {
    console.error('Failed to load impact data:', e)
    impactSummary.value = null
    topMovers.value = []
  } finally {
    affectedLoading.value = false
  }
}

async function selectDevice(commit, dev) {
  selectedDeviceId.value = dev.host_identifier
  selectedDeviceName.value = dev.hostname
  deviceHealthLoading.value = true
  try {
    const [health, scores, patches] = await Promise.all([
      fetchDeviceHealthAroundCommit(dev.host_identifier, commit.timestamp),
      fetchDeviceScoresAroundCommit(dev.host_identifier, commit.timestamp),
      fetchDevicePatchesAroundCommit(dev.host_identifier, commit.timestamp)
    ])
    deviceHealthLabels.value = health.map(r => r.time)
    deviceHealthData.value = {
      memory: health.map(r => parseFloat(r.memory_percent)),
      disk: health.map(r => parseFloat(r.disk_percent))
    }
    deviceScoreLabels.value = scores.map(r => r.time)
    deviceScoreData.value = {
      composite: scores.map(r => parseFloat(r.composite)),
      health: scores.map(r => parseFloat(r.health)),
      performance: scores.map(r => parseFloat(r.performance)),
      network: scores.map(r => parseFloat(r.network) >= 0 ? parseFloat(r.network) : null),
      security: scores.map(r => parseFloat(r.security) >= 0 ? parseFloat(r.security) : null),
      software: scores.map(r => parseFloat(r.software) >= 0 ? parseFloat(r.software) : null),
    }
    devicePatches.value = patches
  } catch (e) {
    console.error('Failed to load device health:', e)
  } finally {
    deviceHealthLoading.value = false
  }
}

function selectDeviceById(commit, hostId, hostname) {
  selectDevice(commit, { host_identifier: hostId, hostname })
}

function clearDeviceSelection() {
  selectedDeviceId.value = null
  selectedDeviceName.value = ''
  deviceHealthLabels.value = []
  deviceHealthData.value = { memory: [], disk: [] }
  deviceScoreLabels.value = []
  deviceScoreData.value = { composite: [], health: [], performance: [], network: [], security: [], software: [] }
  devicePatches.value = []
  deviceSearchText.value = ''
  deviceSearchResults.value = []
}

// ─── Data loading ───────────────────────────────────

async function loadTimeline() {
  loading.value = true
  try {
    const { start, end } = dateRange.value
    await fetchGitopsEvents()

    const [heatmap, scores, patches] = await Promise.all([
      fetchScoreHeatmap(start, end),
      fetchScoreChanges(start, end),
      fetchPatchSummary(start, end)
    ])

    scoreHeatmapData.value = heatmap
    scoreChanges.value = scores
    patchSummary.value = patches

    fleetEvents.value = detectFleetEvents(scores, patches)
  } catch (e) {
    console.error('Timeline load failed:', e)
  } finally {
    loading.value = false
  }
}

watch(selectedRange, () => loadTimeline())
onMounted(() => loadTimeline())
</script>

<style scoped>
.timeline-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--pad-large);
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--pad-large);
}

.timeline-header h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--fleet-black);
  font-family: var(--font-mono);
}

.timeline-controls {
  display: flex;
  gap: 4px;
  background: var(--fleet-black-10);
  border-radius: var(--radius);
  padding: 3px;
}

.range-btn {
  padding: 6px 14px;
  border: none;
  border-radius: calc(var(--radius) - 2px);
  background: transparent;
  color: var(--fleet-black-50);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  font-family: var(--font-body);
  transition: all 0.15s;
}

.range-btn.active {
  background: var(--fleet-white);
  color: var(--fleet-black);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.section {
  margin-bottom: var(--pad-xlarge);
}

.section h2 {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--fleet-black);
  font-family: var(--font-mono);
  margin-bottom: var(--pad-small);
}

.section-hint {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  margin-bottom: var(--pad-medium);
}

/* ─── Heatmap ──────────────────────────────────── */

.heatmap-scroll {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  padding: var(--pad-medium);
  box-shadow: var(--box-shadow);
  overflow-x: auto;
}

.heatmap-grid {
  display: grid;
  gap: 2px;
  min-width: 600px;
}

.heatmap-label {
  font-size: 11px;
  color: var(--fleet-black-50);
  display: flex;
  align-items: center;
  padding-right: 8px;
  white-space: nowrap;
}

.heatmap-hour {
  font-size: 10px;
  color: #8b8fa2;
  text-align: center;
}

.heatmap-cell {
  aspect-ratio: 1;
  border-radius: 2px;
  position: relative;
  min-height: 16px;
  min-width: 16px;
  transition: opacity 0.15s;
}

.heatmap-cell:hover {
  opacity: 0.8;
  outline: 2px solid var(--fleet-black);
  outline-offset: -1px;
}

.heatmap-cell.has-deploy {
  outline: 2px solid #6a67fe;
  outline-offset: -1px;
}

.deploy-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6a67fe;
  border: 1px solid white;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: var(--pad-small);
  justify-content: flex-end;
  font-size: 11px;
  color: var(--fleet-black-50);
}

.legend-block {
  width: 14px;
  height: 14px;
  border-radius: 2px;
}

.legend-deploy {
  margin-left: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.deploy-dot-legend {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6a67fe;
}

.corner {
  /* empty top-left cell */
}

/* ─── Timeline ─────────────────────────────────── */

.timeline-loading {
  text-align: center;
  padding: var(--pad-xlarge);
  color: var(--fleet-black-50);
  font-size: var(--font-size-sm);
}

.timeline-empty {
  text-align: center;
  padding: var(--pad-xlarge);
  color: var(--fleet-black-50);
}

.timeline {
  position: relative;
}

.timeline-entry {
  display: flex;
  gap: var(--pad-medium);
  min-height: 80px;
}

.timeline-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  flex-shrink: 0;
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #e2e4ea;
  background: var(--fleet-white);
  flex-shrink: 0;
  z-index: 1;
}

.dot-default { border-color: #c5c7d1; background: #e2e4ea; }
.dot-blue { border-color: #6a67fe; background: #6a67fe; }
.dot-amber { border-color: #eab308; background: #eab308; }
.dot-red { border-color: #ef4444; background: #ef4444; }

.timeline-line {
  width: 2px;
  flex: 1;
  background: #e2e4ea;
  min-height: 20px;
}

.timeline-card {
  flex: 1;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  padding: var(--pad-medium);
  margin-bottom: var(--pad-medium);
  box-shadow: var(--box-shadow);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.timeline-card:hover {
  border-color: #6a67fe40;
  box-shadow: 0 2px 8px rgba(106, 103, 254, 0.1);
}

.timeline-entry.has-impact .timeline-card {
  border-left: 3px solid #eab308;
}

.timeline-entry.expanded .timeline-card {
  border-color: #6a67fe;
}

.commit-header {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
  margin-bottom: 4px;
}

.commit-hash {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: #6a67fe;
  background: #f0efff;
  padding: 1px 6px;
  border-radius: 3px;
}

.commit-time {
  font-size: 12px;
  color: var(--fleet-black-50);
}

.impact-badge {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.impact-negative { color: #991b1b; background: #fee2e2; }
.impact-positive { color: #065f46; background: #d1fae5; }
.impact-neutral { color: #92400e; background: #fef3c7; }

.tag-count {
  font-size: 11px;
  color: #6a67fe;
  background: #f0efff;
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.commit-message {
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
  font-weight: 500;
  margin-bottom: 2px;
}

.commit-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--fleet-black-50);
}

.commit-author { }
.commit-teams { color: #6a67fe; }
.commit-files { }

/* Change type pills */
.change-type-pill {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.ct-software { background: #dbeafe; color: #1e40af; }
.ct-profile { background: #f3e8ff; color: #6b21a8; }
.ct-script { background: #fef3c7; color: #92400e; }
.ct-policy { background: #fce7f3; color: #9d174d; }
.ct-os_update { background: #d1fae5; color: #065f46; }
.ct-bootstrap { background: #e0e7ff; color: #3730a3; }
.ct-config { background: #f0f1f4; color: #515774; }

.fleet-obs-label {
  font-size: 11px;
  color: var(--fleet-black-50);
  margin-right: 2px;
}

/* File list */
.file-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-path {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 11px;
  color: var(--fleet-black-50);
  padding: 2px 6px;
  background: #f8f9fa;
  border-radius: 3px;
}

/* Fleet event badges */
.fleet-events-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: var(--pad-small);
}

.fleet-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.fleet-badge.score_drop { color: #991b1b; background: #fee2e2; }
.fleet-badge.score_improvement { color: #065f46; background: #d1fae5; }
.fleet-badge.patch_wave { color: #1e40af; background: #dbeafe; }

.fleet-badge { cursor: pointer; transition: all 0.15s; position: relative; padding-right: 20px; }
.fleet-badge:hover { filter: brightness(0.95); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.fleet-badge.badge-active { outline: 2px solid currentColor; outline-offset: 1px; }

.badge-dismiss {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: none;
  font-size: 13px;
  color: inherit;
  opacity: 0;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  transition: opacity 0.1s;
}

.fleet-badge:hover .badge-dismiss { opacity: 0.5; }
.badge-dismiss:hover { opacity: 1 !important; }

.badge-restore {
  border: none;
  background: none;
  font-size: 11px;
  color: #6a67fe;
  cursor: pointer;
  font-family: var(--font-body);
  padding: 2px 6px;
}

.badge-restore:hover { text-decoration: underline; }

/* Correlation strength on badges */
.fleet-badge.corr-verified { border: 1px solid #065f46; }
.fleet-badge.corr-likely { border: 1px solid transparent; }
.fleet-badge.corr-temporal { opacity: 0.7; border: 1px dashed #8b8fa2; }

.corr-icon {
  font-weight: 700;
  margin-right: 2px;
}

/* Correlation labels in event rows */
.fe-corr {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.fe-corr.corr-verified { background: #d1fae5; color: #065f46; }
.fe-corr.corr-likely { background: #dbeafe; color: #1e40af; }
.fe-corr.corr-temporal { background: #f0f1f4; color: #8b8fa2; }

.fleet-more {
  font-size: 11px;
  color: var(--fleet-black-50);
  padding: 2px 8px;
}

/* ─── Event detail panel (inline) ────────────── */

.event-detail-panel {
  background: #fafafe;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  padding: var(--pad-small) var(--pad-medium);
  margin-top: var(--pad-small);
}

.edp-header {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
  margin-bottom: var(--pad-small);
}

.edp-title {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
}

.edp-close {
  border: none;
  background: none;
  font-size: 16px;
  color: var(--fleet-black-50);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.edp-close:hover { color: var(--fleet-black); }

.edp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.edp-table th {
  text-align: left;
  font-weight: 600;
  color: var(--fleet-black-50);
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.5px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--fleet-black-10);
}

.edp-table td {
  padding: 5px 8px;
  border-bottom: 1px solid var(--fleet-black-10);
  color: var(--fleet-black);
}

.edp-table tr:last-child td { border-bottom: none; }

.edp-hostname {
  font-weight: 500;
  color: #6a67fe;
}

.edp-mono {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 11px;
  color: var(--fleet-black-50);
}

.edp-lag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 500;
}

.lag-fast { background: #d1fae5; color: #065f46; }
.lag-ok { background: #fef3c7; color: #92400e; }
.lag-slow { background: #fee2e2; color: #991b1b; }

.edp-score-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.edp-score-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  font-size: var(--font-size-sm);
}

.edp-score-label { color: var(--fleet-black-50); }
.edp-score-value { font-weight: 600; color: var(--fleet-black); }

.fleet-event-row.clickable { cursor: pointer; }
.fleet-event-row.clickable:hover { background: #f8f7ff; border-radius: var(--radius); }

.fe-expand-hint {
  font-size: 11px;
  color: #6a67fe;
  margin-left: auto;
}

/* ─── Expanded detail ────────────────────────── */

.commit-detail {
  margin-top: var(--pad-medium);
  border-top: 1px solid var(--fleet-black-10);
  padding-top: var(--pad-medium);
}

.detail-section {
  margin-bottom: var(--pad-medium);
}

.detail-section h4 {
  font-size: 12px;
  font-weight: 600;
  color: var(--fleet-black);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--pad-small);
}

.detail-empty {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  font-style: italic;
}

.fleet-event-row {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
  padding: 4px 0;
  font-size: var(--font-size-sm);
  border-bottom: 1px solid var(--fleet-black-10);
}

.fleet-event-row:last-child { border-bottom: none; }

.fe-icon {
  width: 20px;
  text-align: center;
  font-size: 14px;
}

.fe-icon.score_drop { color: #ef4444; }
.fe-icon.score_improvement { color: #22c55e; }
.fe-icon.patch_wave { color: #3b82f6; }

.fe-time {
  font-size: 12px;
  color: var(--fleet-black-50);
  min-width: 100px;
}

.fe-label {
  flex: 1;
  color: var(--fleet-black);
}

.fe-severity {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.fe-severity.high { color: #991b1b; background: #fee2e2; }
.fe-severity.medium { color: #92400e; background: #fef3c7; }
.fe-severity.low { color: #065f46; background: #d1fae5; }

/* Pinned devices */
.pinned-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.pinned-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #f0efff;
  border: 1px solid #d8d6ff;
  border-radius: 16px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.pinned-chip:hover {
  background: #e4e2ff;
  border-color: #6a67fe;
}

.pinned-chip.active {
  background: #6a67fe;
  border-color: #6a67fe;
  color: white;
}

.pinned-chip.active .pin-name { color: white; }
.pinned-chip.active .pin-note { color: rgba(255,255,255,0.7); }
.pinned-chip.active .pin-remove { color: rgba(255,255,255,0.7); }
.pinned-chip.active .pin-remove:hover { color: white; }

.pin-icon { font-size: 11px; }
.pin-name { font-weight: 500; color: #6a67fe; }
.pin-note { color: var(--fleet-black-50); font-size: 11px; }

.pin-remove {
  border: none;
  background: none;
  color: var(--fleet-black-50);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
  margin-left: 2px;
}

.pin-remove:hover { color: #ef4444; }

.pin-hint {
  font-size: 12px;
  color: var(--fleet-black-50);
  margin-top: 4px;
  font-style: italic;
}

/* ─── Score info + Impact explainer ────────────── */

.impact-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.impact-header-row h4 { margin-bottom: 0; }

.score-info-btn {
  border: none;
  background: none;
  font-size: 12px;
  color: #6a67fe;
  cursor: pointer;
  font-family: var(--font-body);
  font-weight: 500;
}

.score-info-btn:hover { text-decoration: underline; }

.score-info-box {
  background: #f8f9fa;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  padding: var(--pad-medium);
  margin: var(--pad-small) 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--fleet-black);
}

.score-info-box p { margin: 0 0 6px; }

.si-categories {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
}

.si-cat {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.si-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.si-grades {
  font-size: 12px;
  padding: 4px 0;
  border-top: 1px solid var(--fleet-black-10);
}

.si-context {
  font-size: 11px;
  color: var(--fleet-black-50);
  font-style: italic;
  margin-bottom: 0;
}

/* ─── Impact explainer and verdict ─────────────── */

.impact-explainer {
  font-size: 12px;
  color: var(--fleet-black-50);
  margin-bottom: var(--pad-small);
  line-height: 1.5;
}

.impact-verdict {
  font-size: var(--font-size-sm);
  line-height: 1.5;
  padding: var(--pad-small) var(--pad-medium);
  border-radius: var(--radius);
  margin-top: var(--pad-small);
}

.verdict-neutral { background: #f8f9fa; color: var(--fleet-black-50); }
.verdict-positive { background: #d1fae5; color: #065f46; }
.verdict-negative { background: #fee2e2; color: #991b1b; }
.verdict-mixed { background: #fef3c7; color: #92400e; }

/* ─── Impact summary ───────────────────────────── */

.impact-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pad-small);
}

.impact-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--pad-small) var(--pad-medium);
  background: #f8f9fa;
  border-radius: var(--radius);
  min-width: 80px;
}

.impact-number {
  font-size: 20px;
  font-weight: 700;
  color: var(--fleet-black);
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.impact-label {
  font-size: 11px;
  color: var(--fleet-black-50);
  text-align: center;
}

.row-selected { background: #f8f7ff; }

/* ─── Device search for pinning ────────────────── */

.pin-search-wrap {
  position: relative;
  flex: 1;
  min-width: 180px;
  max-width: 280px;
}

.pin-search-input {
  width: 100%;
  padding: 4px 10px;
  border: 1px dashed #d8d6ff;
  border-radius: 16px;
  font-size: 12px;
  font-family: var(--font-body);
  background: transparent;
  color: var(--fleet-black);
  outline: none;
}

.pin-search-input:focus {
  border-style: solid;
  border-color: #6a67fe;
  background: var(--fleet-white);
}

.pin-search-input::placeholder {
  color: #6a67fe;
}

.pin-search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 10;
  max-height: 200px;
  overflow-y: auto;
  margin-top: 4px;
}

.pin-search-result {
  display: flex;
  flex-direction: column;
  padding: 6px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--fleet-black-10);
  transition: background 0.1s;
}

.pin-search-result:last-child { border-bottom: none; }
.pin-search-result:hover { background: #f8f7ff; }

.psr-name {
  font-size: 12px;
  font-weight: 500;
  color: #6a67fe;
}

.psr-meta {
  font-size: 11px;
  color: var(--fleet-black-50);
}

/* ─── Rollout tracking ─────────────────────────── */

.rollout-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: var(--pad-small);
  padding: 5px 14px;
  border: 1px solid #6a67fe;
  border-radius: var(--radius);
  background: transparent;
  color: #6a67fe;
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-body);
  cursor: pointer;
  transition: all 0.15s;
}

.rollout-btn:hover { background: #f8f7ff; }
.rollout-btn.active { background: #6a67fe; color: white; }

.rollout-panel {
  margin-top: var(--pad-small);
}

.rollout-summary {
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
  line-height: 1.5;
  margin-bottom: var(--pad-small);
}

.rollout-chart :deep(.chart) {
  height: 220px !important;
}

.rollout-chart :deep(.chart-container) {
  padding: var(--pad-small);
  box-shadow: none;
  border: 1px solid var(--fleet-black-10);
}

.affected-loading {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  padding: var(--pad-small) 0;
}

.ad-delta {
  font-size: 13px;
  font-weight: 700;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.delta-bad { color: #ef4444; }
.delta-warn { color: #f59e0b; }
.delta-good { color: #22c55e; }
.delta-neutral { color: var(--fleet-black-50); }

.ad-tag-btn, .ad-inspect-btn {
  font-size: 11px;
  padding: 2px 10px;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  background: var(--fleet-white);
  cursor: pointer;
  font-family: var(--font-body);
  font-weight: 500;
  transition: all 0.15s;
}

.ad-tag-btn:hover { border-color: #6a67fe; color: #6a67fe; }
.ad-tag-btn:disabled { opacity: 0.4; cursor: default; }
.ad-inspect-btn { background: #6a67fe; color: white; border-color: #6a67fe; }
.ad-inspect-btn:hover { background: #5854d6; }

/* ─── Device inspection panel ──────────────────── */

.device-inspect-panel {
  background: #fafafe;
  border: 1px solid #e2e0ff;
  border-radius: var(--radius);
  padding: var(--pad-medium);
  margin-top: var(--pad-small);
}

.inspect-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--pad-small);
}

.inspect-header h4 {
  margin-bottom: 0;
}

.inspect-close {
  border: none;
  background: none;
  font-size: 18px;
  color: var(--fleet-black-50);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.inspect-close:hover { color: var(--fleet-black); }

.inspect-chart {
  margin-bottom: var(--pad-medium);
}

.inspect-chart :deep(.chart) {
  height: 200px !important;
}

.inspect-chart :deep(.chart-container) {
  padding: var(--pad-small);
  box-shadow: none;
  border: none;
  background: transparent;
}

.inspect-patches h4 {
  margin-bottom: var(--pad-small);
}

.patch-row {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
  padding: 4px 0;
  font-size: var(--font-size-sm);
  border-bottom: 1px solid var(--fleet-black-10);
}

.patch-row:last-child { border-bottom: none; }

.patch-type {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 8px;
  background: #dbeafe;
  color: #1e40af;
  font-weight: 500;
  text-transform: uppercase;
}

.patch-name {
  font-weight: 500;
  color: var(--fleet-black);
}

.patch-versions {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: var(--fleet-black-50);
}

.patch-lag {
  font-size: 11px;
  color: #92400e;
  background: #fef3c7;
  padding: 1px 6px;
  border-radius: 8px;
}
</style>
