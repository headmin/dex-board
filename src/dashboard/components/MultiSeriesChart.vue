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
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent,
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
import { palette } from '../composables/uiPalette'

use([
  CanvasRenderer, LineChart, GridComponent, TooltipComponent,
  LegendComponent, DataZoomComponent, MarkLineComponent,
  MarkPointComponent, ToolboxComponent
])

const props = defineProps({
  title: { type: String, default: '' },
  xLabels: { type: Array, default: () => [] },
  series: { type: Array, default: () => [] },
  yAxes: { type: Array, default: () => [{ name: 'Value' }] },
  thresholds: { type: Array, default: () => [] },
  anomalies: { type: Array, default: () => [] },
  events: { type: Array, default: () => [] },
  zoomable: { type: Boolean, default: true },
  loading: { type: Boolean, default: false }
})

const chartOption = computed(() => {
  const yAxisConfigs = props.yAxes.map((axis, i) => ({
    type: 'value',
    name: axis.name || '',
    min: axis.min ?? null,
    max: axis.max ?? null,
    position: i === 0 ? 'left' : 'right',
    axisLine: { show: props.yAxes.length > 1 },
    axisLabel: { ...baseAxisLabel, fontSize: 11 },
    splitLine: { ...baseSplitLine },
    nameTextStyle: { fontSize: 10, color: palette.ink50 }
  }))

  const seriesConfigs = props.series.map((s, i) => {
    const seriesColor = resolveColor(s.color)
    const config = {
      name: s.name,
      type: 'line',
      smooth: true,
      yAxisIndex: s.yAxisIndex || 0,
      lineStyle: { width: 2, color: seriesColor || undefined },
      itemStyle: { color: seriesColor || undefined },
      areaStyle: { opacity: 0.1, color: seriesColor || undefined },
      data: s.data,
      symbol: 'circle',
      symbolSize: 4
    }

    // Add threshold markLines to the first series
    if (i === 0 && props.thresholds.length > 0) {
      config.markLine = {
        silent: true,
        symbol: 'none',
        data: props.thresholds.map(t => ({
          yAxis: t.value,
          lineStyle: {
            color: resolveColor(t.color) || palette.critical,
            type: 'dashed',
            width: 2
          },
          label: {
            formatter: `${t.label || ''} (${t.value})`,
            position: 'insideEndTop',
            fontSize: 10,
            color: resolveColor(t.color) || palette.critical
          }
        }))
      }
    }

    // Add anomaly markers to first series
    if (i === 0 && props.anomalies.length > 0) {
      config.markPoint = {
        symbol: 'triangle',
        symbolSize: 12,
        itemStyle: { color: palette.critical },
        label: { show: false },
        data: props.anomalies.map(a => ({
          coord: [a.xIndex, a.value],
          name: a.label || 'Anomaly'
        }))
      }
    }

    // Add deployment event markers (vertical lines) to first series
    if (i === 0 && props.events.length > 0) {
      if (!config.markLine) config.markLine = { silent: false, symbol: 'none', data: [] }
      config.markLine.silent = false
      for (const evt of props.events) {
        const evtColor = resolveColor(evt.color) || palette.info
        config.markLine.data.push({
          xAxis: evt.xIndex,
          lineStyle: { color: evtColor, type: 'solid', width: 1.5 },
          label: {
            formatter: evt.label,
            position: 'insideStartTop',
            fontSize: 9,
            color: evtColor,
            rotate: 90,
            offset: [0, 6]
          }
        })
      }
    }

    return config
  })

  const option = {
    tooltip: {
      ...baseTooltip,
      axisPointer: { type: 'cross' },
      formatter: props.events.length > 0 ? (params) => {
        const idx = Array.isArray(params) ? params[0]?.dataIndex : params?.dataIndex
        let html = Array.isArray(params)
          ? params.map(p => `${p.marker} ${p.seriesName}: <b>${p.value ?? '-'}</b>`).join('<br/>')
          : `${params.marker} ${params.seriesName}: <b>${params.value ?? '-'}</b>`
        const matchingEvents = props.events.filter(e => e.xIndex === idx)
        if (matchingEvents.length > 0) {
          html += '<br/><hr style="border-color:rgba(255,255,255,0.2);margin:4px 0"/>'
          for (const evt of matchingEvents) {
            html += `<span style="color:${palette.info}">&#9646;</span> Deploy <b>${evt.hash}</b>: ${evt.message}<br/>`
          }
        }
        return html
      } : undefined
    },
    legend: {
      top: 0,
      data: props.series.map(s => s.name),
      textStyle: { fontSize: 11, color: palette.ink75 }
    },
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
      right: props.yAxes.length > 1 ? '6%' : '4%',
      bottom: props.zoomable ? '60px' : '3%',
      top: '40px',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.xLabels,
      axisLabel: { ...baseAxisLabel, fontSize: 11 },
      axisLine: { ...baseAxisLine }
    },
    yAxis: yAxisConfigs,
    series: seriesConfigs
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
  height: 340px;
}
</style>
