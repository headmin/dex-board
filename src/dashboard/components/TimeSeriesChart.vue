<template>
  <div class="chart-container">
    <h3>{{ title }}</h3>
    <SkeletonLoader v-if="loading" variant="chart" height="300px" />
    <v-chart v-else class="chart" :option="chartOption" autoresize />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SkeletonLoader from './SkeletonLoader.vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
  DataZoomComponent,
  MarkLineComponent,
  ToolboxComponent
} from 'echarts/components'
import VChart from 'vue-echarts'

use([
  CanvasRenderer, LineChart, GridComponent, TooltipComponent,
  TitleComponent, DataZoomComponent, MarkLineComponent, ToolboxComponent
])

const props = defineProps({
  title: { type: String, required: true },
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  xKey: { type: String, default: 'time' },
  yKey: { type: String, default: 'count' },
  zoomable: { type: Boolean, default: true },
  threshold: { type: Number, default: null },
  thresholdLabel: { type: String, default: 'High' },
  color: { type: String, default: 'var(--rainbow-blue)' },
  yMin: { type: Number, default: null },
  yMax: { type: Number, default: null }
})

// ECharts paints to canvas and CANNOT resolve CSS custom properties — if
// a caller passes 'var(--fleet-vibrant-blue)' it ends up unparsed and the
// chart silently falls back to ECharts' default color. Resolve once here.
function resolveColor(c) {
  if (!c) return c
  const m = String(c).match(/var\(\s*(--[\w-]+)\s*\)/)
  if (!m) return c
  if (typeof document === 'undefined') return c
  const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim()
  return v || c
}

const chartOption = computed(() => {
  const color = resolveColor(props.color)
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#3e4771',
      borderColor: '#3e4771',
      textStyle: { color: '#fff', fontSize: 12 },
      borderRadius: 4
    },
    toolbox: {
      right: 16,
      top: 0,
      feature: {
        saveAsImage: { title: 'Save', pixelRatio: 2 },
        dataZoom: { title: { zoom: 'Zoom', back: 'Reset' } }
      },
      iconStyle: { borderColor: '#8b8fa2' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: props.zoomable ? '60px' : '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.data.map(d => d[props.xKey]),
      axisLabel: { color: '#8b8fa2', fontSize: 12 },
      axisLine: { lineStyle: { color: '#e2e4ea' } }
    },
    yAxis: {
      type: 'value',
      min: props.yMin,
      max: props.yMax,
      axisLabel: { color: '#8b8fa2', fontSize: 12 },
      splitLine: { lineStyle: { color: '#f0f1f4' } }
    },
    series: [{
      name: props.title,
      type: 'line',
      smooth: true,
      // origin:'start' fills from the y-axis MIN up to the line (instead of
      // from y=0). For negative-value series like RSSI, that means "more
      // filled = closer to ideal" which matches the mental model.
      areaStyle: {
        opacity: 0.3,
        color: color,
        origin: 'start'
      },
      lineStyle: {
        width: 2,
        color: color
      },
      itemStyle: {
        color: color
      },
      data: props.data.map(d => d[props.yKey]),
      markLine: props.threshold != null ? {
        silent: true,
        symbol: 'none',
        lineStyle: {
          color: '#dc2626',
          type: 'dashed',
          width: 2
        },
        data: [{
          yAxis: props.threshold,
          label: {
            formatter: `${props.thresholdLabel} (${props.threshold})`,
            position: 'insideEndTop',
            fontSize: 11,
            color: '#dc2626'
          }
        }]
      } : undefined
    }]
  }

  if (props.zoomable) {
    option.dataZoom = [
      {
        type: 'slider',
        bottom: 10,
        height: 24,
        borderColor: '#e2e4ea',
        fillerColor: 'rgba(106, 103, 254, 0.15)',
        handleStyle: { color: '#6a67fe' }
      },
      {
        type: 'inside',
        filterMode: 'filter'
      }
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
  height: 300px;
}

</style>
