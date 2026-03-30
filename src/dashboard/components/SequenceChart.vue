<template>
  <div class="chart-container">
    <h3>{{ title }}</h3>
    <SkeletonLoader v-if="loading" variant="chart" height="200px" />
    <div v-else-if="!data.length" class="no-data">No data</div>
    <v-chart v-else class="chart" :style="{ height: chartHeight }" :option="chartOption" autoresize />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SkeletonLoader from './SkeletonLoader.vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent
} from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, DataZoomComponent])

const props = defineProps({
  title: { type: String, default: '' },
  // Array of { category, start, end, label, value, tooltip }
  // start/end are numeric indices into timeLabels
  data: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  timeLabels: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  zoomable: { type: Boolean, default: true },
  colors: {
    type: Array,
    default: () => [
      '#6a67fe', '#009a7d', '#ebbc43', '#ae6ddf',
      '#5cabdf', '#ff5c83', '#3db67b', '#d66c7b', '#b3b6c1', '#515774'
    ]
  }
})

const chartHeight = computed(() => {
  const rows = Math.max(props.categories.length, 1)
  const base = props.zoomable ? 100 : 60
  return `${base + rows * 40}px`
})

// Build one stacked-bar series per span:
// Each span = invisible offset bar + visible duration bar
// Grouped by category for stacking
const chartOption = computed(() => {
  // Group spans by category
  const spansByCategory = {}
  for (const item of props.data) {
    if (!spansByCategory[item.category]) spansByCategory[item.category] = []
    spansByCategory[item.category].push(item)
  }

  const series = []
  let spanIndex = 0

  for (const [cat, spans] of Object.entries(spansByCategory)) {
    const catIdx = props.categories.indexOf(cat)
    const color = props.colors[catIdx % props.colors.length]

    for (const span of spans) {
      const startIdx = typeof span.start === 'number' ? span.start : props.timeLabels.indexOf(span.start)
      let endIdx = typeof span.end === 'number' ? span.end : props.timeLabels.indexOf(span.end)
      if (endIdx <= startIdx) endIdx = startIdx + 1

      const stackId = `span-${spanIndex}`

      // Invisible offset bar (gap before the span starts)
      const offsetData = new Array(props.categories.length).fill(0)
      offsetData[catIdx] = startIdx

      series.push({
        type: 'bar',
        stack: stackId,
        data: offsetData,
        itemStyle: { color: 'transparent' },
        emphasis: { itemStyle: { color: 'transparent' } },
        tooltip: { show: false },
        barWidth: 18
      })

      // Visible duration bar
      const durationData = new Array(props.categories.length).fill(0)
      durationData[catIdx] = endIdx - startIdx

      series.push({
        type: 'bar',
        stack: stackId,
        name: cat,
        data: durationData,
        itemStyle: {
          color: color,
          borderRadius: 3
        },
        barWidth: 18,
        tooltip: {
          formatter() {
            const startLabel = props.timeLabels[startIdx] || startIdx
            const endLabel = props.timeLabels[endIdx] || endIdx
            let html = `<strong>${span.label || cat}</strong><br/>${startLabel} &mdash; ${endLabel}`
            if (span.value != null) html += `<br/>Avg: ${span.value} MB`
            if (span.tooltip) html += `<br/>${span.tooltip}`
            return html
          }
        }
      })

      spanIndex++
    }
  }

  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: '#3e4771',
      borderColor: '#3e4771',
      textStyle: { color: '#fff', fontSize: 12 },
      borderRadius: 4
    },
    grid: {
      left: '140px',
      right: '40px',
      top: '10px',
      bottom: props.zoomable ? '60px' : '20px'
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: props.timeLabels.length,
      axisLabel: {
        fontSize: 10,
        color: '#8b8fa2',
        formatter(val) {
          const idx = Math.round(val)
          return props.timeLabels[idx] || ''
        },
        interval: 0
      },
      // Show a label every few ticks
      splitNumber: Math.min(props.timeLabels.length, 12),
      splitLine: { show: true, lineStyle: { color: '#f0f1f4', type: 'dashed' } }
    },
    yAxis: {
      type: 'category',
      data: props.categories,
      inverse: true,
      axisLabel: { fontSize: 12, color: '#515774', width: 120, overflow: 'truncate' },
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { show: true, lineStyle: { color: '#f0f1f4' } }
    },
    series
  }

  if (props.zoomable) {
    option.dataZoom = [
      {
        type: 'slider',
        xAxisIndex: 0,
        bottom: 10,
        height: 24,
        borderColor: '#e2e4ea',
        fillerColor: 'rgba(106, 103, 254, 0.15)',
        handleStyle: { color: '#6a67fe' }
      },
      { type: 'inside', xAxisIndex: 0, filterMode: 'weakFilter' }
    ]
  }

  return option
})
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

.chart {
  width: 100%;
  min-height: 200px;
}

.no-data {
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8b8fa2;
}
</style>
