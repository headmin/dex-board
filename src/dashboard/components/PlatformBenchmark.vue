<template>
  <div class="benchmark-container">
    <!-- Lifecycle Badge -->
    <div v-if="lifecycleLabel" class="lifecycle-badge" :class="lifecycleClass">
      {{ lifecycleLabel }}
    </div>

    <!-- Cohort Tabs -->
    <div class="cohort-tabs">
      <button
        v-for="tab in cohortTabs"
        :key="tab.key"
        class="cohort-tab"
        :class="{ active: activeCohort === tab.key }"
        @click="$emit('update:activeCohort', tab.key)"
      >{{ tab.label }}</button>
    </div>

    <!-- Small cohort warning -->
    <div v-if="activeCohortData && activeCohortData.device_count >= 3 && activeCohortData.device_count < 5" class="cohort-warning">
      Only {{ activeCohortData.device_count }} hosts in this cohort — percentiles may not be representative.
    </div>

    <!-- Loading -->
    <div v-if="loading" class="benchmark-loading">Loading benchmarks...</div>

    <!-- Cohort too small to benchmark — show honest empty state rather than degenerate bars -->
    <div v-else-if="activeCohortData && activeCohortData.device_count < 3" class="benchmark-empty">
      <strong>Not enough hosts in this cohort to benchmark.</strong>
      <p>
        Need at least 3 hosts; this cohort has {{ activeCohortData.device_count }}.
        <template v-if="siblingCohortsWithData.length">
          Try
          <button
            v-for="(s, i) in siblingCohortsWithData" :key="s.key"
            class="cohort-suggest"
            @click="$emit('update:activeCohort', s.key)"
          >{{ s.label }} ({{ s.count }})</button><template v-if="i < siblingCohortsWithData.length - 1">, </template>.
        </template>
      </p>
    </div>

    <!-- Score Benchmark Rows -->
    <div v-else-if="activeCohortData" class="benchmark-rows">
      <div v-for="row in benchmarkRows" :key="row.key" class="benchmark-row">
        <span class="bench-label">{{ row.label }}</span>
        <div class="bench-bar-wrapper">
          <div class="bench-bar-track">
            <div class="bench-bar-fill" :style="{ width: clamp(row.deviceScore) + '%', backgroundColor: barColor(row.deviceScore) }"></div>
            <!-- Marker lines -->
            <div class="bench-marker marker-avg" :style="{ left: clamp(row.avg) + '%' }" title="Cohort average">
              <span class="marker-label">avg</span>
            </div>
            <div class="bench-marker marker-p75" :style="{ left: clamp(row.p75) + '%' }" title="75th percentile">
              <span class="marker-label">p75</span>
            </div>
            <div class="bench-marker marker-p90" :style="{ left: clamp(row.p90) + '%' }" title="90th percentile">
              <span class="marker-label">p90</span>
            </div>
          </div>
          <!-- Cohort numerics under the bar — was previously implicit
               from marker positions only. Now you can read the actual
               values, not eyeball them. -->
          <div class="bench-stats">
            <span class="bench-stat"><span class="bench-stat-key">avg</span> {{ Math.round(row.avg) }}</span>
            <span class="bench-stat"><span class="bench-stat-key">p75</span> {{ Math.round(row.p75) }}</span>
            <span class="bench-stat"><span class="bench-stat-key">p90</span> {{ Math.round(row.p90) }}</span>
            <span class="bench-stat bench-stat-diff" :class="diffClass(row)" v-if="row.deviceScore >= 0">
              <span class="bench-stat-key">vs avg</span> {{ deltaLabel(row) }}
            </span>
          </div>
        </div>
        <span class="bench-position" :class="positionClass(row)">{{ positionLabel(row) }}</span>
        <span class="bench-value">{{ formatScore(row.deviceScore) }}</span>
      </div>

      <!-- Legend -->
      <div class="benchmark-legend">
        <span class="legend-item"><span class="legend-line legend-avg"></span> Cohort avg</span>
        <span class="legend-item"><span class="legend-line legend-p75"></span> 75th pctl</span>
        <span class="legend-item"><span class="legend-line legend-p90"></span> 90th pctl</span>
      </div>
    </div>

    <div v-else class="benchmark-empty">No benchmark data available.</div>
  </div>
</template>
<style scoped>
.cohort-suggest {
  display: inline;
  padding: 2px 8px;
  margin: 0 2px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--fleet-vibrant-blue);
  background: var(--fleet-vibrant-blue-10);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  cursor: pointer;
}
.cohort-suggest:hover { border-color: var(--fleet-vibrant-blue); }
</style>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  deviceScores: { type: Object, default: null },
  benchmarkData: { type: Object, default: null },
  lifecycleLabel: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  activeCohort: { type: String, default: 'fleet' }
})

defineEmits(['update:activeCohort'])

const lifecycleClass = computed(() => {
  const map = {
    'Top performer': 'lifecycle-top',
    'Healthy': 'lifecycle-healthy',
    'Needs attention': 'lifecycle-attention',
    'Underperforming': 'lifecycle-under',
    'End of life candidate': 'lifecycle-eol'
  }
  return map[props.lifecycleLabel] || ''
})

const cohortTabs = computed(() => {
  const bd = props.benchmarkData
  if (!bd) return []
  return [
    { key: 'fleet', label: `Fleet (${bd.fleet?.device_count || 0})` },
    { key: 'os', label: `Same OS (${bd.os?.device_count || 0})` },
    { key: 'model', label: `Same Model (${bd.model?.device_count || 0})` },
    { key: 'ram', label: `Same RAM (${bd.ram?.device_count || 0})` }
  ]
})

const activeCohortData = computed(() => {
  if (!props.benchmarkData) return null
  return props.benchmarkData[props.activeCohort] || null
})

// When the active cohort is too small, suggest other cohorts that DO have
// enough hosts to benchmark against. Skips the active one and any empty ones.
const siblingCohortsWithData = computed(() => {
  const bd = props.benchmarkData
  if (!bd) return []
  const labels = { fleet: 'Fleet', os: 'Same OS', model: 'Same Model', ram: 'Same RAM' }
  return ['fleet', 'os', 'model', 'ram']
    .filter(key => key !== props.activeCohort)
    .map(key => ({ key, label: labels[key], count: bd[key]?.device_count || 0 }))
    .filter(s => s.count >= 3)
})

const scoreDimensions = [
  { key: 'composite', label: 'Composite', field: 'composite_score' },
  { key: 'performance', label: 'Performance', field: 'performance_score' },
  { key: 'device_health', label: 'Device Health', field: 'device_health_score' },
  { key: 'network', label: 'Network', field: 'network_score' },
  { key: 'security', label: 'Security', field: 'security_score' },
  { key: 'software', label: 'Software', field: 'software_score' }
]

const benchmarkRows = computed(() => {
  const cohort = activeCohortData.value
  const scores = props.deviceScores
  if (!cohort || !scores) return []

  return scoreDimensions.map(dim => {
    const deviceScore = scores[dim.field] ?? -1
    const stats = cohort[dim.key]
    if (!stats) return null
    return {
      key: dim.key,
      label: dim.label,
      deviceScore,
      avg: stats.avg,
      p25: stats.p25,
      p75: stats.p75,
      p90: stats.p90
    }
  }).filter(Boolean)
})

function clamp(v) {
  if (v === null || v === undefined || v < 0) return 0
  return Math.min(100, Math.max(0, v))
}

function barColor(v) {
  if (v < 0) return '#8b8fa2'
  if (v >= 90) return '#3db67b'
  if (v >= 75) return 'var(--rainbow-blue)'
  if (v >= 60) return '#ebbc43'
  if (v >= 40) return '#e07b3a'
  return '#d66c7b'
}

function formatScore(v) {
  if (v === null || v === undefined || v < 0) return '—'
  return Math.round(v).toString()
}

function positionLabel(row) {
  if (row.deviceScore < 0) return '—'
  if (row.deviceScore >= row.p90) return 'Top 10%'
  if (row.deviceScore >= row.p75) return 'Above avg'
  if (row.deviceScore >= row.avg) return 'Average'
  return 'Below avg'
}

function positionClass(row) {
  if (row.deviceScore < 0) return ''
  if (row.deviceScore >= row.p90) return 'pos-top'
  if (row.deviceScore >= row.p75) return 'pos-above'
  if (row.deviceScore >= row.avg) return 'pos-avg'
  return 'pos-below'
}

function deltaLabel(row) {
  const d = row.deviceScore - row.avg
  const sign = d > 0 ? '+' : ''
  return `${sign}${d.toFixed(1)}`
}

function diffClass(row) {
  const d = row.deviceScore - row.avg
  if (d >= 5) return 'diff-good'
  if (d <= -5) return 'diff-bad'
  return 'diff-neutral'
}
</script>

<style scoped>
.benchmark-container {
  display: flex;
  flex-direction: column;
  gap: var(--pad-medium);
}

/* ─── Lifecycle Badge ────────────────────────── */
.lifecycle-badge {
  display: inline-flex;
  align-self: flex-start;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: var(--font-size-sm);
  font-weight: 700;
  letter-spacing: 0.2px;
}

.lifecycle-top { background: #e8f8f0; color: var(--fleet-status-success); }
.lifecycle-healthy { background: #e8f0fe; color: #2d5fba; }
.lifecycle-attention { background: #fef9e8; color: #9a7b1a; }
.lifecycle-under { background: #fef0e8; color: #b05c1a; }
.lifecycle-eol { background: #fee8ec; color: var(--fleet-status-error); }

/* ─── Cohort Tabs ────────────────────────────── */
.cohort-tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: #f0f0f0;
  border-radius: 8px;
  align-self: flex-start;
}

.cohort-tab {
  padding: 6px 14px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  font-family: var(--font-body);
}

.cohort-tab:hover {
  color: var(--fleet-black-75);
  background: rgba(255, 255, 255, 0.5);
}

.cohort-tab.active {
  color: var(--fleet-black);
  background: var(--fleet-white);
  box-shadow: var(--box-shadow);
  font-weight: 600;
}

/* ─── Cohort Warning ─────────────────────────── */
.cohort-warning {
  font-size: var(--font-size-xs);
  color: #9a7b1a;
  background: #fef9e8;
  padding: 6px 12px;
  border-radius: var(--radius);
  border: 1px solid #f5e6a3;
}

/* ─── Benchmark Rows ─────────────────────────── */
.benchmark-rows {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.benchmark-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.bench-label,
.bench-position,
.bench-value {
  /* Align with the bar (which is positioned at the top of the wrapper, before
     the cohort-stats line) — without this, the row's vertical centering
     pushes them halfway down the now-taller bar+stats block. */
  padding-top: 2px;
}

.bench-label {
  font-size: var(--font-size-sm);
  color: var(--fleet-black);
  min-width: 110px;
  font-weight: 500;
}

.bench-bar-wrapper {
  flex: 1;
}

.bench-bar-track {
  position: relative;
  height: 20px;
  background: var(--fleet-black-5);
  border-radius: var(--radius);
  overflow: visible;
}

.bench-bar-fill {
  height: 100%;
  border-radius: var(--radius);
  transition: width 400ms ease-out;
  position: relative;
  z-index: 1;
}

/* ─── Marker Lines ───────────────────────────── */
.bench-marker {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 0;
  z-index: 2;
  pointer-events: none;
}

.bench-marker::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -1px;
  width: 2px;
}

.marker-avg::before {
  background: var(--fleet-black-33);
  border-radius: 1px;
}

.marker-p75::before {
  background: var(--rainbow-blue);
  border-radius: 1px;
}

.marker-p90::before {
  background: var(--fleet-status-success);
  border-radius: 1px;
}

.marker-label {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: auto;
}

.marker-avg .marker-label { color: var(--fleet-black-33); }
.marker-p75 .marker-label { color: var(--rainbow-blue); }
.marker-p90 .marker-label { color: var(--fleet-status-success); }

/* ─── Position Labels ────────────────────────── */
.bench-position {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius);
  min-width: 72px;
  text-align: center;
  white-space: nowrap;
}

.pos-top { background: #e8f8f0; color: var(--fleet-status-success); }
.pos-above { background: #e8f0fe; color: #2d5fba; }
.pos-avg { background: var(--fleet-black-5); color: var(--fleet-black-75); }
.pos-below { background: #fef0e8; color: #b05c1a; }

.bench-value {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  min-width: 28px;
  text-align: right;
}

/* ─── Legend ──────────────────────────────────── */
.benchmark-legend {
  display: flex;
  gap: 16px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--fleet-black-5);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--fleet-black-50);
}

.legend-line {
  display: inline-block;
  width: 12px;
  height: 2px;
  border-radius: 1px;
}

.legend-avg { background: var(--fleet-black-33); }
.legend-p75 { background: var(--rainbow-blue); }
.legend-p90 { background: var(--fleet-status-success); }

/* ─── Cohort numeric stats under each bar ───── */
.bench-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
  font-size: 11px;
  color: var(--fleet-black-75);
  font-family: var(--font-mono, var(--font-body));
}

.bench-stat-key {
  font-weight: 600;
  color: var(--fleet-black-50);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-right: 4px;
  font-family: var(--font-body);
}

.bench-stat-diff {
  margin-left: auto;
  font-weight: 700;
}

.bench-stat-diff.diff-good  { color: var(--fleet-status-success); }
.bench-stat-diff.diff-bad   { color: var(--fleet-status-error); }
.bench-stat-diff.diff-neutral { color: var(--fleet-black-50); }

/* ─── States ─────────────────────────────────── */
.benchmark-loading, .benchmark-empty {
  text-align: center;
  padding: var(--pad-large) 0;
  color: var(--fleet-black-50);
  font-size: var(--font-size-sm);
}

@media (max-width: 768px) {
  .cohort-tabs {
    flex-wrap: wrap;
  }
  .benchmark-row {
    flex-wrap: wrap;
  }
  .bench-label {
    min-width: 100%;
  }
}
</style>
