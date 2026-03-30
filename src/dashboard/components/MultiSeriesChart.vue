<template>
  <div class="chart-container">
    <h3>{{ title }}</h3>
    <SkeletonLoader v-if="loading" variant="chart" height="340px" />
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
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent,
  ToolboxComponent
} from 'echarts/components'
import VChart from 'vue-echarts'

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
    axisLabel: { color: '#8b8fa2', fontSize: 12 },
    splitLine: { lineStyle: { color: '#f0f1f4' } },
    nameTextStyle: { fontSize: 11, color: '#8b8fa2' }
  }))

  const seriesConfigs = props.series.map((s, i) => {
    const config = {
      name: s.name,
      type: 'line',
      smooth: true,
      yAxisIndex: s.yAxisIndex || 0,
      lineStyle: { width: 2, color: s.color || undefined },
      itemStyle: { color: s.color || undefined },
      areaStyle: { opacity: 0.1, color: s.color || undefined },
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
            color: t.color || '#dc2626',
            type: 'dashed',
            width: 2
          },
          label: {
            formatter: `${t.label || ''} (${t.value})`,
            position: 'insideEndTop',
            fontSize: 11,
            color: t.color || '#dc2626'
          }
        }))
      }
    }

    // Add anomaly markers to first series
    if (i === 0 && props.anomalies.length > 0) {
      config.markPoint = {
        symbol: 'triangle',
        symbolSize: 12,
        itemStyle: { color: '#dc2626' },
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
        config.markLine.data.push({
          xAxis: evt.xIndex,
          lineStyle: { color: evt.color || '#6a67fe', type: 'solid', width: 1.5 },
          label: {
            formatter: evt.label,
            position: 'insideStartTop',
            fontSize: 10,
            color: evt.color || '#6a67fe',
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
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: '#3e4771',
      borderColor: '#3e4771',
      textStyle: { color: '#fff', fontSize: 12 },
      borderRadius: 4,
      formatter: props.events.length > 0 ? (params) => {
        const idx = Array.isArray(params) ? params[0]?.dataIndex : params?.dataIndex
        let html = Array.isArray(params)
          ? params.map(p => `${p.marker} ${p.seriesName}: <b>${p.value ?? '-'}</b>`).join('<br/>')
          : `${params.marker} ${params.seriesName}: <b>${params.value ?? '-'}</b>`
        const matchingEvents = props.events.filter(e => e.xIndex === idx)
        if (matchingEvents.length > 0) {
          html += '<br/><hr style="border-color:rgba(255,255,255,0.2);margin:4px 0"/>'
          for (const evt of matchingEvents) {
            html += `<span style="color:#6a67fe">&#9646;</span> Deploy <b>${evt.hash}</b>: ${evt.message}<br/>`
          }
        }
        return html
      } : undefined
    },
    legend: {
      top: 0,
      data: props.series.map(s => s.name),
      textStyle: { fontSize: 12, color: '#515774' }
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
      right: props.yAxes.length > 1 ? '6%' : '4%',
      bottom: props.zoomable ? '60px' : '3%',
      top: '40px',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.xLabels,
      axisLabel: { fontSize: 12, color: '#8b8fa2' },
      axisLine: { lineStyle: { color: '#e2e4ea' } }
    },
    yAxis: yAxisConfigs,
    series: seriesConfigs
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
  height: 340px;
}

</style>
