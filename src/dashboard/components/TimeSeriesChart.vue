<template>
  <ChartCard :title="title" :loading="loading">
    <v-chart class="chart" :option="chartOption" autoresize />
  </ChartCard>
</template>

<script setup>
import { computed } from 'vue'
import ChartCard from './base/ChartCard.vue'
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
import {
  baseTooltip,
  baseAxisLabel,
  baseAxisLine,
  baseSplitLine,
  baseDataZoom,
  resolveColor
} from '../composables/echartsTheme'
import { palette, categorical } from '../composables/uiPalette'

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
  color: { type: String, default: categorical[4] },
  yMin: { type: Number, default: null },
  yMax: { type: Number, default: null }
})

const chartOption = computed(() => {
  const color = resolveColor(props.color)
  const option = {
    tooltip: { ...baseTooltip },
    toolbox: {
      right: 16,
      top: 0,
      feature: {
        saveAsImage: { title: 'Save', pixelRatio: 2 },
        dataZoom: { title: { zoom: 'Zoom', back: 'Reset' } }
      },
      iconStyle: { borderColor: palette.ink50 }
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
      axisLabel: { ...baseAxisLabel, fontSize: 11 },
      axisLine: { ...baseAxisLine }
    },
    yAxis: {
      type: 'value',
      min: props.yMin,
      max: props.yMax,
      axisLabel: { ...baseAxisLabel, fontSize: 11 },
      splitLine: { ...baseSplitLine }
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
          color: palette.critical,
          type: 'dashed',
          width: 2
        },
        data: [{
          yAxis: props.threshold,
          label: {
            formatter: `${props.thresholdLabel} (${props.threshold})`,
            position: 'insideEndTop',
            fontSize: 10,
            color: palette.critical
          }
        }]
      } : undefined
    }]
  }

  if (props.zoomable) {
    option.dataZoom = [
      {
        ...baseDataZoom,
        type: 'slider',
        bottom: 10,
        height: 24,
        borderColor: palette.ink10
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
.chart {
  width: 100%;
  height: 300px;
}
</style>
