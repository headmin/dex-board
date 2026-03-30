<template>
  <div class="chart-container">
    <h3>{{ title }}</h3>
    <SkeletonLoader v-if="loading" variant="chart" height="300px" />
    <div v-else-if="!data.length" class="empty-state">No fleet data available</div>
    <div v-else class="bars">
      <div v-for="team in sortedData" :key="team.team_id" class="bar-row">
        <div class="bar-label">
          <span class="team-name">{{ team.name || `Fleet ${team.team_id}` }}</span>
          <GradeBadge :grade="team.grade" />
        </div>
        <div class="bar-track">
          <div
            class="bar-fill"
            :style="{ width: team.score + '%', backgroundColor: barColor(team.grade) }"
          ></div>
          <span class="bar-value">{{ team.score.toFixed(0) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SkeletonLoader from './SkeletonLoader.vue'
import GradeBadge from './GradeBadge.vue'

const props = defineProps({
  title: { type: String, default: 'Fleet Comparison' },
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})

const sortedData = computed(() =>
  [...props.data].sort((a, b) => b.score - a.score)
)

function barColor(grade) {
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

h3 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  margin-bottom: var(--pad-medium);
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bar-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bar-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.team-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
}

.bar-track {
  height: 24px;
  background: var(--fleet-black-5);
  border-radius: var(--radius);
  position: relative;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: var(--radius);
  transition: width 400ms ease-out;
  min-width: 2px;
}

.bar-value {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--fleet-black-75);
}

.empty-state {
  text-align: center;
  padding: var(--pad-xlarge);
  color: var(--fleet-black-50);
  font-size: var(--font-size-sm);
}
</style>
