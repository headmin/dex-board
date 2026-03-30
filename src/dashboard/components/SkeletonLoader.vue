<template>
  <div class="skeleton" :class="variant" :style="containerStyle">
    <!-- Metric card skeleton -->
    <template v-if="variant === 'metric'">
      <div class="bone bone-text bone-short"></div>
      <div class="bone bone-value"></div>
    </template>

    <!-- Chart skeleton (line, bar, pie, multi-series) -->
    <template v-else-if="variant === 'chart'">
      <div class="chart-skeleton">
        <div class="chart-y-axis">
          <div class="bone bone-tick" v-for="i in 5" :key="i"></div>
        </div>
        <div class="chart-area">
          <svg viewBox="0 0 400 120" preserveAspectRatio="none" class="chart-wave">
            <path d="M0,80 C40,75 60,40 100,50 C140,60 160,30 200,35 C240,40 260,70 300,55 C340,40 380,60 400,45"
                  fill="none" stroke="currentColor" stroke-width="2" opacity="0.15"/>
            <path d="M0,80 C40,75 60,40 100,50 C140,60 160,30 200,35 C240,40 260,70 300,55 C340,40 380,60 400,45 L400,120 L0,120 Z"
                  fill="currentColor" opacity="0.04"/>
          </svg>
          <div class="chart-x-axis">
            <div class="bone bone-tick" v-for="i in 6" :key="i"></div>
          </div>
        </div>
      </div>
    </template>

    <!-- Table skeleton -->
    <template v-else-if="variant === 'table'">
      <div class="table-skeleton">
        <div class="table-header">
          <div class="bone bone-cell" v-for="i in columns" :key="'h'+i"></div>
        </div>
        <div class="table-row" v-for="r in rows" :key="r">
          <div class="bone bone-cell" v-for="i in columns" :key="'r'+r+'c'+i"
               :style="{ width: (50 + (r * i * 17) % 40) + '%' }"></div>
        </div>
      </div>
    </template>

    <!-- Heatmap skeleton -->
    <template v-else-if="variant === 'heatmap'">
      <div class="heatmap-skeleton">
        <div class="heatmap-row" v-for="r in rows" :key="r">
          <div class="bone bone-label"></div>
          <div class="heatmap-cells">
            <div class="bone bone-cell-sq" v-for="c in 12" :key="c"
                 :style="{ opacity: 0.3 + ((r * c * 7) % 70) / 100 }"></div>
          </div>
        </div>
      </div>
    </template>

    <!-- Generic block skeleton (fallback) -->
    <template v-else>
      <div class="bone bone-block" v-for="i in rows" :key="i"
           :style="{ width: (60 + (i * 23) % 40) + '%' }"></div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'block',
    validator: v => ['block', 'metric', 'chart', 'table', 'heatmap'].includes(v)
  },
  height: { type: [Number, String], default: null },
  rows: { type: Number, default: 5 },
  columns: { type: Number, default: 5 }
})

const containerStyle = computed(() => {
  if (!props.height) return {}
  const h = typeof props.height === 'number' ? props.height + 'px' : props.height
  return { height: h }
})
</script>

<style scoped>
/* ─── Shimmer animation ───────────────────────── */
@keyframes pulse {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.bone {
  background: linear-gradient(90deg, var(--fleet-black-5) 25%, var(--fleet-black-10) 50%, var(--fleet-black-5) 75%);
  background-size: 200% 100%;
  animation: pulse 1.5s ease-in-out infinite;
  border-radius: var(--radius);
}

.skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

/* ─── Metric variant ──────────────────────────── */
.skeleton.metric {
  gap: 10px;
}

.bone-text {
  height: 14px;
  width: 60%;
}

.bone-short {
  width: 40%;
}

.bone-value {
  height: 36px;
  width: 50%;
  border-radius: 6px;
}

/* ─── Chart variant ───────────────────────────── */
.skeleton.chart {
  padding: 0;
}

.chart-skeleton {
  display: flex;
  gap: 8px;
  height: 100%;
  min-height: 200px;
}

.chart-y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px 0;
}

.chart-y-axis .bone-tick {
  height: 10px;
  width: 28px;
}

.chart-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
}

.chart-wave {
  flex: 1;
  width: 100%;
  color: var(--fleet-black-50);
}

.chart-x-axis {
  display: flex;
  justify-content: space-between;
  padding-top: 8px;
}

.chart-x-axis .bone-tick {
  height: 10px;
  width: 36px;
}

/* ─── Table variant ───────────────────────────── */
.skeleton.table {
  gap: 0;
  padding: 0;
}

.table-skeleton {
  display: flex;
  flex-direction: column;
}

.table-header {
  display: flex;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--fleet-black-10);
}

.table-header .bone-cell {
  height: 12px;
  flex: 1;
}

.table-row {
  display: flex;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--fleet-black-5);
}

.table-row .bone-cell {
  height: 12px;
  flex: 1;
}

/* ─── Heatmap variant ─────────────────────────── */
.skeleton.heatmap {
  gap: 4px;
  padding: 0;
}

.heatmap-skeleton {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.heatmap-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bone-label {
  height: 12px;
  width: 100px;
  flex-shrink: 0;
}

.heatmap-cells {
  flex: 1;
  display: flex;
  gap: 2px;
}

.bone-cell-sq {
  flex: 1;
  height: 22px;
  border-radius: 3px;
}

/* ─── Block (generic) variant ─────────────────── */
.bone-block {
  height: 14px;
}
</style>
