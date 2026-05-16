<template>
  <div class="grade-card" :class="{ clickable: clickable }" @click="$emit('click')">
    <div class="card-header">
      <span class="card-label">{{ label }}</span>
      <div v-if="delta !== null" class="delta" :class="deltaClass">
        <svg v-if="delta > 0" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 8V2M5 2L2 5M5 2L8 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <svg v-else-if="delta < 0" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 2V8M5 8L8 5M5 8L2 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>{{ Math.abs(delta).toFixed(1) }}</span>
      </div>
    </div>
    <SkeletonLoader v-if="loading" variant="metric" />
    <template v-else>
      <div class="card-body">
        <div class="grade-display" :class="gradeClass">{{ grade }}</div>
        <div class="score-info">
          <span class="score-value">{{ score !== null ? score.toFixed(0) : '--' }}</span>
          <span class="score-divider">/</span>
          <span class="score-max">100</span>
        </div>
      </div>
      <div class="card-footer">
        <SparklineChart
          v-if="sparklineData.length"
          :data="sparklineData"
          :color="gradeColor"
          width="100%"
          height="32px"
        />
        <div v-if="subtitle" class="subtitle">{{ subtitle }}</div>
      </div>
      <span v-if="incomplete" class="incomplete-badge">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <circle cx="5" cy="5" r="4" stroke="currentColor" stroke-width="1.5"/>
          <path d="M5 3v2M5 7v.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Incomplete
      </span>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SkeletonLoader from './SkeletonLoader.vue'
import SparklineChart from './SparklineChart.vue'

const props = defineProps({
  label: { type: String, required: true },
  grade: { type: String, default: '--' },
  score: { type: Number, default: null },
  delta: { type: Number, default: null },
  sparklineData: { type: Array, default: () => [] },
  subtitle: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  incomplete: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false }
})

defineEmits(['click'])

const gradeClass = computed(() => {
  const g = props.grade?.toUpperCase()
  if (g === 'A') return 'grade-a'
  if (g === 'B') return 'grade-b'
  if (g === 'C') return 'grade-c'
  if (g === 'D') return 'grade-d'
  if (g === 'F') return 'grade-f'
  return ''
})

const gradeColor = computed(() => {
  const g = props.grade?.toUpperCase()
  if (g === 'A') return 'var(--fleet-success)'
  if (g === 'B') return 'var(--fleet-vibrant-blue)'
  if (g === 'C') return 'var(--fleet-warning)'
  if (g === 'D') return '#ea580c'
  if (g === 'F') return 'var(--fleet-error)'
  return 'var(--fleet-black-50)'
})

const deltaClass = computed(() => {
  if (props.delta > 0) return 'delta-up'
  if (props.delta < 0) return 'delta-down'
  return 'delta-flat'
})
</script>

<style scoped>
.grade-card {
  background: var(--fleet-white);
  border-radius: var(--radius-medium);
  border: 1px solid var(--fleet-black-10);
  padding: var(--pad-large);
  position: relative;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.grade-card:hover {
  border-color: var(--fleet-black-25);
  box-shadow: var(--shadow-sm);
}

.grade-card.clickable {
  cursor: pointer;
}

.grade-card.clickable:hover {
  border-color: var(--fleet-green);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--pad-medium);
}

.card-label {
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black-50);
}

.delta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: 600;
  padding: 3px 8px;
  border-radius: var(--radius);
}

.delta-up {
  color: var(--fleet-status-success);
  background: var(--fleet-status-success-light);
}

.delta-down {
  color: #dc2626;
  background: var(--fleet-error-light);
}

.delta-flat {
  color: var(--fleet-black-50);
  background: var(--fleet-black-5);
}

.card-body {
  display: flex;
  align-items: baseline;
  gap: var(--pad-medium);
  margin-bottom: var(--pad-medium);
}

.grade-display {
  font-family: var(--font-mono);
  font-size: 44px;
  font-weight: 700;
  line-height: 1;
  color: var(--fleet-black-33);
}

.grade-a { color: var(--fleet-success); }
.grade-b { color: var(--fleet-vibrant-blue); }
.grade-c { color: var(--fleet-warning); }
.grade-d { color: #ea580c; }
.grade-f { color: var(--fleet-error); }

.score-info {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.score-value {
  font-family: var(--font-mono);
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--fleet-black);
}

.score-divider {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--fleet-black-33);
  margin: 0 1px;
}

.score-max {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
}

.card-footer {
  margin-top: var(--pad-small);
}

.subtitle {
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  margin-top: var(--pad-xs);
}

.incomplete-badge {
  position: absolute;
  top: var(--pad-medium);
  right: var(--pad-medium);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--fleet-black-50);
  background: var(--fleet-black-5);
  padding: 4px 8px;
  border-radius: var(--radius);
}

.incomplete-badge svg {
  stroke: var(--fleet-black-50);
}
</style>
