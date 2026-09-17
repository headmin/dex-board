<template>
  <ChartCard :title="title" :loading="loading" :empty="!points.length" :emptyText="emptyText">
    <v-chart class="chart" :option="chartOption" autoresize />
  </ChartCard>
</template>

<script setup>
import { computed } from 'vue'
import ChartCard from './base/ChartCard.vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { ScatterChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { baseTooltip, baseAxisLabel, baseAxisLine, baseSplitLine, resolveColor } from '../composables/echartsTheme'
import { palette, categorical } from '../composables/uiPalette'

use([CanvasRenderer, ScatterChart, LineChart, GridComponent, TooltipComponent, MarkLineComponent])

/**
 * One point per entity (host), x vs y. `highlightKey` marks a subset in the
 * status colour; `xLine` / `yLine` draw reference lines (fleet medians).
 * No trend line is fitted — a correlation coefficient belongs in text next
 * to the chart, where its sample size can be stated.
 */
const props = defineProps({
  title: { type: String, default: '' },
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  emptyText: { type: String, default: 'No data' },
  xKey: { type: String, required: true },
  yKey: { type: String, required: true },
  labelKey: { type: String, default: 'label' },
  xLabel: { type: String, default: '' },
  yLabel: { type: String, default: '' },
  highlightKey: { type: String, default: '' },
  color: { type: String, default: categorical[4] },
  highlightColor: { type: String, default: null },
  xLine: { type: Number, default: null },
  yLine: { type: Number, default: null },
})

const points = computed(() => props.data.filter(d => Number.isFinite(Number(d[props.xKey])) && Number.isFinite(Number(d[props.yKey]))))

const chartOption = computed(() => {
  const base = resolveColor(props.color)
  const hi = resolveColor(props.highlightColor || palette.critical)
  const series = (rows, color, name) => ({
    name,
    type: 'scatter',
    symbolSize: 9,
    itemStyle: { color, opacity: 0.85 },
    data: rows.map(d => ({ value: [Number(d[props.xKey]), Number(d[props.yKey])], label: d[props.labelKey] })),
  })
  const marked = props.highlightKey ? points.value.filter(d => d[props.highlightKey]) : []
  const plain = props.highlightKey ? points.value.filter(d => !d[props.highlightKey]) : points.value
  const markLine = (props.xLine != null || props.yLine != null) ? {
    silent: true,
    symbol: 'none',
    lineStyle: { color: palette.ink50, type: 'dashed', width: 1 },
    label: { fontSize: 10, color: palette.ink50 },
    data: [
      ...(props.xLine != null ? [{ xAxis: props.xLine, label: { formatter: 'fleet median' } }] : []),
      ...(props.yLine != null ? [{ yAxis: props.yLine, label: { formatter: 'fleet median' } }] : []),
    ],
  } : undefined
  return {
    tooltip: {
      ...baseTooltip,
      trigger: 'item',
      formatter: (p) => `<strong>${p.data.label ?? ''}</strong><br/>${props.xLabel || props.xKey}: ${p.value[0]}<br/>${props.yLabel || props.yKey}: ${p.value[1]}`,
    },
    grid: { left: '3%', right: '4%', top: 24, bottom: 28, containLabel: true },
    xAxis: {
      type: 'value',
      name: props.xLabel,
      nameLocation: 'middle',
      nameGap: 22,
      nameTextStyle: { ...baseAxisLabel, fontSize: 11 },
      axisLabel: { ...baseAxisLabel, fontSize: 11 },
      axisLine: { ...baseAxisLine },
      splitLine: { ...baseSplitLine },
    },
    yAxis: {
      type: 'value',
      name: props.yLabel,
      nameTextStyle: { ...baseAxisLabel, fontSize: 11 },
      axisLabel: { ...baseAxisLabel, fontSize: 11 },
      axisLine: { ...baseAxisLine },
      splitLine: { ...baseSplitLine },
    },
    series: [
      { ...series(plain, base, 'hosts'), markLine },
      ...(marked.length ? [series(marked, hi, 'flagged')] : []),
    ],
  }
})
</script>

<style scoped>
.chart { width: 100%; height: 260px; }
</style>
