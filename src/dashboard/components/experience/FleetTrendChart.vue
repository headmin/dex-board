<template>
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
</template>

<script setup>
import { computed } from 'vue'
import SparklineChart from '../SparklineChart.vue'
import { gradeColor } from '../../composables/gradeColors'
import { palette } from '../../composables/uiPalette'

const props = defineProps({
  fleet: { type: Object, required: true },
})

// ─── 30-day composite trend helpers ──────────────────────
const fleetTrendVisible = computed(() => {
  return props.fleet.sparkline && props.fleet.sparkline.filter(v => typeof v === 'number').length >= 2
})
const trendRangeText = computed(() => {
  const nums = (props.fleet.sparkline || []).filter(v => typeof v === 'number')
  if (!nums.length) return ''
  return `${Math.min(...nums).toFixed(0)} → ${Math.max(...nums).toFixed(0)}`
})
const trendColor = computed(() => {
  const g = (props.fleet.grade || '').toUpperCase()
  // Known grades follow the shared grade scale; unknown/"—" falls back to
  // the info accent (not ink) so a loading sparkline stays on-brand.
  return ['A', 'B', 'C', 'D', 'F'].includes(g) ? gradeColor(g) : palette.info
})
</script>

<style scoped>
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
  margin-bottom: 7px;
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
  font-size: 9px;
  color: var(--fleet-black-33);
}
</style>
