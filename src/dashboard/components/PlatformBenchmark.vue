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
    <div v-if="activeCohortData && activeCohortData.device_count < 5 && activeCohortData.device_count > 0" class="cohort-warning">
      Only {{ activeCohortData.device_count }} device{{ activeCohortData.device_count === 1 ? '' : 's' }} in this cohort — benchmarks may not be representative.
    </div>

    <!-- Loading -->
    <div v-if="loading" class="benchmark-loading">Loading benchmarks...</div>

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
  if (v >= 75) return '#4a90d9'
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

.lifecycle-top { background: #e8f8f0; color: #1a7a4c; }
.lifecycle-healthy { background: #e8f0fe; color: #2d5fba; }
.lifecycle-attention { background: #fef9e8; color: #9a7b1a; }
.lifecycle-under { background: #fef0e8; color: #b05c1a; }
.lifecycle-eol { background: #fee8ec; color: #b01a3a; }

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
  gap: 8px;
}

.benchmark-row {
  display: flex;
  align-items: center;
  gap: 12px;
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
  background: #4a90d9;
  border-radius: 1px;
}

.marker-p90::before {
  background: #1a7a4c;
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
.marker-p75 .marker-label { color: #4a90d9; }
.marker-p90 .marker-label { color: #1a7a4c; }

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

.pos-top { background: #e8f8f0; color: #1a7a4c; }
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
.legend-p75 { background: #4a90d9; }
.legend-p90 { background: #1a7a4c; }

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
