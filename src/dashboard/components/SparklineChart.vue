<template>
  <div class="sparkline-container" :style="{ width: width, height: height }">
    <v-chart v-if="data.length" class="sparkline" :option="chartOption" autoresize />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])

const props = defineProps({
  data: { type: Array, default: () => [] },
  color: { type: String, default: '#6a67fe' },
  width: { type: String, default: '120px' },
  height: { type: String, default: '32px' },
  showTooltip: { type: Boolean, default: false },
  // When true, yAxis auto-scales to the data range (with padding) instead of
  // pinning to 0–100. Use for trend charts where you want movement to be visible
  // even when values cluster in a narrow band.
  autoScale: { type: Boolean, default: false }
})

const yRange = computed(() => {
  if (!props.autoScale) return { min: 0, max: 100 }
  const nums = props.data.filter(v => typeof v === 'number')
  if (!nums.length) return { min: 0, max: 100 }
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  const pad = Math.max(2, Math.round((hi - lo) * 0.2))
  return { min: Math.max(0, lo - pad), max: Math.min(100, hi + pad) }
})

const chartOption = computed(() => ({
  grid: { left: 0, right: 0, top: 2, bottom: 2 },
  xAxis: { type: 'category', show: false, data: props.data.map((_, i) => i) },
  yAxis: { type: 'value', show: false, ...yRange.value },
  tooltip: props.showTooltip ? {
    trigger: 'axis',
    backgroundColor: '#3e4771',
    borderColor: '#3e4771',
    textStyle: { color: '#fff', fontSize: 11 },
    borderRadius: 4,
    formatter: (params) => `${params[0].value.toFixed(0)}`
  } : { show: false },
  series: [{
    type: 'line',
    data: props.data,
    smooth: true,
    symbol: 'none',
    lineStyle: { width: 2, color: props.color },
    areaStyle: {
      color: {
        type: 'linear',
        x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: props.color + '30' },
          { offset: 1, color: props.color + '05' }
        ]
      }
    }
  }]
}))
</script>

<style scoped>
.sparkline-container {
  display: inline-block;
}

.sparkline {
  width: 100%;
  height: 100%;
}
</style>
