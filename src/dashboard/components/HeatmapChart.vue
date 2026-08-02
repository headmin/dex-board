<template>
  <!-- Not on ChartCard: title is optional (two call sites render header-less)
       and the skeleton is the heatmap variant with dynamic height — ChartCard
       always renders a header and uses a fixed chart skeleton. CSS is
       retargeted to the card spec tokens instead. -->
  <div class="chart-container">
    <h3 v-if="title">{{ title }}</h3>
    <SkeletonLoader v-if="loading" variant="heatmap" :height="chartHeight + 'px'" :rows="8" />
    <v-chart v-else class="chart" :style="{ height: chartHeight + 'px' }" :option="chartOption" autoresize @click="handleClick" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SkeletonLoader from './base/SkeletonLoader.vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { HeatmapChart as EChartsHeatmap } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  VisualMapComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { baseTooltip, baseAxisLabel } from '../composables/echartsTheme'
import { palette, statusRamp } from '../composables/uiPalette'

use([CanvasRenderer, EChartsHeatmap, GridComponent, TooltipComponent, VisualMapComponent])

const props = defineProps({
  title: { type: String, default: '' },
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  xLabels: { type: Array, default: () => [] },
  yLabels: { type: Array, default: () => [] },
  minValue: { type: Number, default: null },
  maxValue: { type: Number, default: null },
  colorRange: {
    type: Array,
    default: () => statusRamp
  },
  tooltipLabel: { type: String, default: 'Score' }
})

const emit = defineEmits(['cell-click'])

// Dynamic height: 28px per row, minimum 200px, plus space for axis + legend
const chartHeight = computed(() => {
  const rows = props.yLabels.length || 1
  return Math.max(200, rows * 28 + 80)
})

// Auto-compute min/max from data if not provided
const effectiveMin = computed(() => {
  if (props.minValue !== null) return props.minValue
  if (props.data.length === 0) return 0
  const values = props.data.map(d => d[2]).filter(v => v != null && v !== '-')
  if (values.length === 0) return 0
  const min = Math.min(...values)
  // Pad down slightly for visual room
  return Math.floor(min - (Math.max(1, (Math.max(...values) - min) * 0.1)))
})

const effectiveMax = computed(() => {
  if (props.maxValue !== null) return props.maxValue
  if (props.data.length === 0) return 100
  const values = props.data.map(d => d[2]).filter(v => v != null && v !== '-')
  if (values.length === 0) return 100
  const max = Math.max(...values)
  return Math.ceil(max + (Math.max(1, (max - Math.min(...values)) * 0.1)))
})

const chartOption = computed(() => ({
  tooltip: {
    ...baseTooltip,
    trigger: 'item',
    position: 'top',
    formatter(params) {
      const label = props.yLabels[params.value[1]] || ''
      const hour = props.xLabels[params.value[0]] || ''
      const score = params.value[2]
      if (score == null || score === '-') return `${label} @ ${hour}<br/>No data`
      return `${label}<br/>${hour}<br/>${props.tooltipLabel}: ${score}`
    }
  },
  grid: {
    left: '140px',
    right: '80px',
    bottom: '10px',
    top: '10px'
  },
  xAxis: {
    type: 'category',
    data: props.xLabels,
    position: 'top',
    splitArea: { show: false },
    axisLabel: {
      ...baseAxisLabel,
      interval: 'auto',
      rotate: 0
    },
    axisTick: { show: false },
    axisLine: { show: false }
  },
  yAxis: {
    type: 'category',
    data: props.yLabels,
    splitArea: { show: false },
    inverse: true,
    axisLabel: {
      fontSize: 11,
      color: palette.ink75,
      width: 130,
      overflow: 'truncate'
    },
    axisTick: { show: false },
    axisLine: { show: false }
  },
  visualMap: {
    min: effectiveMin.value,
    max: effectiveMax.value,
    calculable: true,
    orient: 'vertical',
    right: '0',
    top: 'center',
    itemHeight: Math.min(120, chartHeight.value - 80),
    itemWidth: 12,
    inRange: {
      color: props.colorRange
    },
    textStyle: { fontSize: 9, color: palette.ink50 },
    show: true
  },
  series: [{
    type: 'heatmap',
    data: props.data,
    label: { show: false },
    emphasis: {
      itemStyle: {
        shadowBlur: 8,
        shadowColor: 'rgba(0, 0, 0, 0.25)'
      }
    },
    itemStyle: {
      borderRadius: 2,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.8)'
    }
  }]
}))

function handleClick(params) {
  if (params.componentType === 'series') {
    const [xIndex, yIndex, value] = params.value
    emit('cell-click', {
      xIndex,
      yIndex,
      value,
      xLabel: props.xLabels[xIndex],
      yLabel: props.yLabels[yIndex]
    })
  }
}
</script>

<style scoped>
.chart-container {
  background: var(--fleet-white);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-large);
  padding: var(--card-pad);
}

h3 {
  font-size: var(--card-title-size);
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0 0 var(--pad-medium);
}

.chart {
  width: 100%;
}
</style>
