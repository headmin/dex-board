<template>
  <div class="grade-card" :class="{ clickable: clickable }" @click="$emit('click')">
    <div class="card-header">
      <div class="card-label">{{ label }}</div>
      <div v-if="delta !== null" class="delta" :class="deltaClass">
        <span class="delta-arrow">{{ delta > 0 ? '+' : '' }}{{ delta.toFixed(1) }}</span>
      </div>
    </div>
    <SkeletonLoader v-if="loading" variant="metric" />
    <template v-else>
      <div class="card-body">
        <div class="grade-display" :class="gradeClass">{{ grade }}</div>
        <div class="score-info">
          <div class="score-value">{{ score !== null ? score.toFixed(0) : '--' }}</div>
          <div class="score-label">/ 100</div>
        </div>
      </div>
      <div class="card-footer">
        <SparklineChart
          v-if="sparklineData.length"
          :data="sparklineData"
          :color="gradeColor"
          width="100%"
          height="28px"
        />
        <div v-if="subtitle" class="subtitle">{{ subtitle }}</div>
      </div>
      <div v-if="incomplete" class="incomplete-badge">Incomplete</div>
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
  if (g === 'A') return '#009a7d'
  if (g === 'B') return '#6a67fe'
  if (g === 'C') return '#ebbc43'
  if (g === 'D') return '#e07b3a'
  if (g === 'F') return '#d66c7b'
  return '#8b8fa2'
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
  border-radius: var(--radius);
  border: 1px solid var(--fleet-black-10);
  padding: var(--pad-large);
  position: relative;
}

.grade-card.clickable {
  cursor: pointer;
  transition: border-color 150ms, box-shadow 150ms;
}

.grade-card.clickable:hover {
  border-color: var(--fleet-black-25);
  box-shadow: var(--box-shadow);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--pad-medium);
}

.card-label {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--fleet-black-50);
  letter-spacing: 0.2px;
}

.delta {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius);
}

.delta-up {
  color: #065f46;
  background: #ecfdf5;
}

.delta-down {
  color: #9f1239;
  background: #fff1f2;
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
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
  color: var(--fleet-black-33);
}

.grade-a { color: var(--fleet-green); }
.grade-b { color: var(--fleet-vibrant-blue); }
.grade-c { color: var(--fleet-warning); }
.grade-d { color: #e07b3a; }
.grade-f { color: var(--fleet-error); }

.score-info {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.score-value {
  font-family: var(--font-mono);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--fleet-black);
}

.score-label {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--fleet-black-33);
}

.card-footer {
  margin-top: var(--pad-small);
}

.subtitle {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  margin-top: 4px;
}

.incomplete-badge {
  position: absolute;
  top: var(--pad-small);
  right: var(--pad-small);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--fleet-black-50);
  background: var(--fleet-black-5);
  padding: 2px 6px;
  border-radius: var(--radius);
}
</style>
