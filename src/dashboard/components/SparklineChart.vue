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
  showTooltip: { type: Boolean, default: false }
})

const chartOption = computed(() => ({
  grid: { left: 0, right: 0, top: 2, bottom: 2 },
  xAxis: { type: 'category', show: false, data: props.data.map((_, i) => i) },
  yAxis: { type: 'value', show: false, min: 0, max: 100 },
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
