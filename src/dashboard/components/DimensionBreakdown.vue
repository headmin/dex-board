<template>
  <div class="chart-container">
    <div class="header">
      <h3>Score Breakdown</h3>
      <div class="dimension-tabs">
        <button
          v-for="dim in dimensions"
          :key="dim.key"
          class="dim-tab"
          :class="{ active: activeDimension === dim.key }"
          @click="activeDimension = dim.key"
        >{{ dim.label }}</button>
      </div>
    </div>
    <SkeletonLoader v-if="loading" variant="chart" height="280px" />
    <div v-else-if="!activeData.length" class="empty-state">No data for this dimension</div>
    <div v-else class="breakdown-rows">
      <div v-for="row in activeData" :key="row.name" class="breakdown-row clickable" @click="$emit('row-click', { dimension: activeDimension, value: row.name })" :title="'Filter fleet by ' + row.name">
        <div class="row-label">
          <span class="row-name">{{ row.name }}</span>
          <span class="row-count">{{ row.count }} devices</span>
        </div>
        <div class="row-scores">
          <div class="score-bar-group">
            <div class="score-bar-track">
              <div
                class="score-bar-fill"
                :style="{ width: row.score + '%', backgroundColor: gradeColor(row.grade) }"
              ></div>
            </div>
            <div class="score-number">
              <GradeBadge :grade="row.grade" />
              <span class="score-val">{{ row.score.toFixed(0) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import SkeletonLoader from './SkeletonLoader.vue'
import GradeBadge from './GradeBadge.vue'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false }
})

defineEmits(['row-click'])

const dimensions = [
  { key: 'os', label: 'CPU' },
  { key: 'model', label: 'Model' },
  { key: 'ram', label: 'RAM' },
  { key: 'team', label: 'Swap' }
]

const activeDimension = ref('os')

const activeData = computed(() => {
  const dimData = props.data[activeDimension.value] || []
  return [...dimData].sort((a, b) => b.score - a.score)
})

function gradeColor(grade) {
  const colors = { A: '#3db67b', B: '#4a90d9', C: '#ebbc43', D: '#e07b3a', F: '#d66c7b' }
  return colors[grade?.toUpperCase()] || '#8b8fa2'
}
</script>

<style scoped>
.chart-container {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  padding: var(--pad-large);
  box-shadow: var(--box-shadow);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--pad-medium);
  flex-wrap: wrap;
  gap: 8px;
}

h3 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
}

.dimension-tabs {
  display: flex;
  gap: 0;
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  overflow: hidden;
}

.dim-tab {
  padding: 6px 14px;
  border: none;
  background: var(--fleet-white);
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--fleet-black-75);
  cursor: pointer;
  border-right: 1px solid var(--fleet-black-10);
  transition: all 150ms ease-in-out;
}

.dim-tab:last-child {
  border-right: none;
}

.dim-tab:hover {
  background: var(--fleet-black-5);
}

.dim-tab.active {
  background: var(--fleet-black);
  color: var(--fleet-white);
}

.breakdown-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.breakdown-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.breakdown-row.clickable {
  cursor: pointer;
  border-radius: var(--radius);
  padding: 6px 8px;
  margin: 0 -8px;
  transition: background 150ms ease-in-out;
}

.breakdown-row.clickable:hover {
  background: var(--fleet-black-5);
}

.row-label {
  min-width: 160px;
  flex-shrink: 0;
}

.row-name {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
}

.row-count {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
}

.row-scores {
  flex: 1;
}

.score-bar-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.score-bar-track {
  flex: 1;
  height: 18px;
  background: var(--fleet-black-5);
  border-radius: var(--radius);
  overflow: hidden;
}

.score-bar-fill {
  height: 100%;
  border-radius: var(--radius);
  transition: width 400ms ease-out;
}

.score-number {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 72px;
}

.score-val {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
}

.empty-state {
  text-align: center;
  padding: var(--pad-xlarge);
  color: var(--fleet-black-50);
  font-size: var(--font-size-sm);
}

@media (max-width: 768px) {
  .breakdown-row {
    flex-direction: column;
    align-items: stretch;
  }
  .row-label {
    min-width: 0;
  }
}
</style>
