<template>
  <ChartCard :title="title" :loading="loading" :empty="!data.length" empty-text="No data">
    <v-chart class="chart" :style="{ height: chartHeight }" :option="chartOption" autoresize />
  </ChartCard>
</template>

<script setup>
import { computed } from 'vue'
import ChartCard from './base/ChartCard.vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import {
  baseTooltip,
  baseAxisLabel,
  baseSplitLine,
  baseDataZoom
} from '../composables/echartsTheme'
import { palette, categorical } from '../composables/uiPalette'

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
    // Categorical identity palette first (fair/purple swapped to keep the
    // historical ordering), then status/neutral extras.
    default: () => [
      palette.info, palette.good, palette.fair, palette.purple,
      categorical[4], categorical[5], palette.good, palette.critical,
      palette.ink33, palette.ink75
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
      ...baseTooltip,
      trigger: 'item'
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
        ...baseAxisLabel,
        fontSize: 9,
        formatter(val) {
          const idx = Math.round(val)
          return props.timeLabels[idx] || ''
        },
        interval: 0
      },
      // Show a label every few ticks
      splitNumber: Math.min(props.timeLabels.length, 12),
      splitLine: { show: true, lineStyle: { ...baseSplitLine.lineStyle, type: 'dashed' } }
    },
    yAxis: {
      type: 'category',
      data: props.categories,
      inverse: true,
      axisLabel: { fontSize: 11, color: palette.ink75, width: 120, overflow: 'truncate' },
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { show: true, ...baseSplitLine }
    },
    series
  }

  if (props.zoomable) {
    option.dataZoom = [
      {
        ...baseDataZoom,
        type: 'slider',
        xAxisIndex: 0,
        bottom: 10,
        height: 24,
        borderColor: palette.ink10
      },
      { type: 'inside', xAxisIndex: 0, filterMode: 'weakFilter' }
    ]
  }

  return option
})
</script>

<style scoped>
.chart {
  width: 100%;
  min-height: 200px;
}
</style>
