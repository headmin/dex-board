<template>
  <div class="benchmark-container">
    <!-- Lifecycle Badge -->
    <Badge v-if="lifecycleLabel" class="lifecycle-badge" :tone="lifecycleTone">
      {{ lifecycleLabel }}
    </Badge>

    <!-- Cohort Tabs -->
    <SegmentedControl
      class="cohort-tabs"
      :model-value="activeCohort"
      :options="cohortTabs"
      @update:model-value="$emit('update:activeCohort', $event)"
    />

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
          <BaseButton
            v-for="(s, i) in siblingCohortsWithData" :key="s.key"
            variant="link"
            class="cohort-suggest"
            @click="$emit('update:activeCohort', s.key)"
          >{{ s.label }} ({{ s.count }})</BaseButton><template v-if="i < siblingCohortsWithData.length - 1">, </template>.
        </template>
      </p>
    </div>

    <!-- Score Benchmark Rows -->
    <div v-else-if="activeCohortData" class="benchmark-rows">
      <div v-for="row in benchmarkRows" :key="row.key" class="benchmark-row">
        <span class="bench-label">{{ row.label }}</span>
        <div class="bench-bar-wrapper">
          <div class="bench-bar-track">
            <div class="bench-bar-fill" :style="{ width: clamp(row.deviceScore) + '%', backgroundColor: scoreBandColor(row.deviceScore) }"></div>
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
        <Badge class="bench-position" :tone="positionTone(row)" :label="positionLabel(row)" />
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
<script setup>
import { computed } from 'vue'
import Badge from './base/Badge.vue'
import BaseButton from './base/BaseButton.vue'
import SegmentedControl from './base/SegmentedControl.vue'
import { scoreBandColor } from '../composables/gradeColors'

const props = defineProps({
  deviceScores: { type: Object, default: null },
  benchmarkData: { type: Object, default: null },
  lifecycleLabel: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  activeCohort: { type: String, default: 'fleet' }
})

defineEmits(['update:activeCohort'])

const lifecycleTone = computed(() => {
  const map = {
    'Top performer': 'good',
    'Healthy': 'good',
    'Needs attention': 'fair',
    'Underperforming': 'elevated',
    'End of life candidate': 'critical'
  }
  return map[props.lifecycleLabel] || 'neutral'
})

const cohortTabs = computed(() => {
  const bd = props.benchmarkData
  if (!bd) return []
  return [
    { value: 'fleet', label: `Fleet (${bd.fleet?.device_count || 0})` },
    { value: 'os', label: `Same OS (${bd.os?.device_count || 0})` },
    { value: 'model', label: `Same Model (${bd.model?.device_count || 0})` },
    { value: 'ram', label: `Same RAM (${bd.ram?.device_count || 0})` }
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

function positionTone(row) {
  if (row.deviceScore < 0) return 'neutral'
  if (row.deviceScore >= row.p75) return 'good'
  if (row.deviceScore >= row.avg) return 'neutral'
  return 'elevated'
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
  align-self: flex-start;
}

/* ─── Cohort Tabs ────────────────────────────── */
.cohort-tabs {
  align-self: flex-start;
}

/* ─── Cohort suggestions (small-cohort empty state) ── */
.cohort-suggest {
  margin: 0 2px;
  font-size: var(--font-size-xs);
}

/* ─── Cohort Warning ─────────────────────────── */
.cohort-warning {
  font-size: var(--font-size-xs);
  color: var(--status-fair-text);
  background: var(--status-fair-bg);
  padding: var(--pad-xsmall) var(--pad-smedium);
  border-radius: var(--radius);
  border: 1px solid var(--fleet-yellow-banner-outline);
}

/* ─── Benchmark Rows ─────────────────────────── */
.benchmark-rows {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.benchmark-row {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.bench-label,
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
  height: var(--bar-height);
  background: var(--fleet-black-10);
  border-radius: var(--radius-full);
  overflow: visible;
}

.bench-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
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
  font-size: 8px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: auto;
}

.marker-avg .marker-label { color: var(--fleet-black-33); }
.marker-p75 .marker-label { color: var(--rainbow-blue); }
.marker-p90 .marker-label { color: var(--fleet-status-success); }

/* ─── Position Labels ────────────────────────── */
.bench-position {
  margin-top: 2px;
  min-width: 72px;
  justify-content: center;
}

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
  gap: 14px;
  margin-top: 4px;
  padding-top: 7px;
  border-top: 1px solid var(--fleet-black-5);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
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
  gap: 11px;
  margin-top: 14px;
  font-size: 10px;
  color: var(--fleet-black-75);
  font-family: var(--font-mono, var(--font-body));
}

.bench-stat-key {
  font-weight: 600;
  color: var(--fleet-black-50);
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
