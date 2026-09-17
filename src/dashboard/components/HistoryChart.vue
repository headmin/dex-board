<template>
  <ChartCard :title="title" :loading="loading" :empty="!points.length" empty-text="No history yet">
    <template #actions>
      <!-- The toggle is always available, not gated behind expert mode: a
           compressed axis is unusual enough that anyone should be able to
           check the shape against a plain one. -->
      <button class="hc-toggle" type="button" @click="scaleMode = scaleMode === 'log' ? 'linear' : 'log'"
        :title="scaleMode === 'log'
          ? 'Recent days are given more width than old ones. Switch to an even axis.'
          : 'Every day is given equal width. Switch to the age-compressed axis.'">
        {{ scaleMode === 'log' ? 'Compressed' : 'Even' }} time
      </button>
    </template>

    <v-chart class="chart" :option="chartOption" autoresize />

    <p class="hc-note">
      <template v-if="scaleMode === 'log'">
        Recent days get more width; older history compresses. Positions are not
        to scale — read the axis labels, not the distances.
      </template>
      <template v-else>Every day gets equal width.</template>
      <span v-if="expertMode && points.length"> · {{ points.length }} days plotted, oldest {{ oldestLabel }}</span>
    </p>
  </ChartCard>
</template>

<script setup>
import { computed, ref } from 'vue'
import ChartCard from './base/ChartCard.vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkAreaComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { baseTooltip, baseAxisLabel, baseSplitLine } from '../composables/echartsTheme'
import { palette } from '../composables/uiPalette'
import { scoreToGrade, gradeColor } from '../composables/gradeColors'
import { timeScale, projectSeries, labelForDays } from '../composables/logTime'
import { useExpertMode } from '../composables/useExpertMode'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, MarkAreaComponent])

const props = defineProps({
  title: { type: String, default: 'History' },
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  dateKey: { type: String, default: 'score_date' },
  valueKey: { type: String, default: 'composite' },
  // Defaults to the full span present in the data, so the axis never claims
  // depth the history does not have.
  maxAgeDays: { type: Number, default: null },
  initialMode: { type: String, default: 'log' },
})

const { expertMode } = useExpertMode()
const scaleMode = ref(props.initialMode)

// Grade bands, not gridlines. The manager reading is "are we in the green
// band and did we leave it" — a number on an axis is the expert reading.
const BANDS = [
  { from: 90, to: 100, grade: 'A' },
  { from: 75, to: 90, grade: 'B' },
  { from: 60, to: 75, grade: 'C' },
  { from: 40, to: 60, grade: 'D' },
  { from: 0, to: 40, grade: 'F' },
]

const spanDays = computed(() => {
  if (props.maxAgeDays) return props.maxAgeDays
  const now = Date.now()
  const ages = (props.data ?? [])
    .map(r => (now - new Date(r?.[props.dateKey]).getTime()) / 86400000)
    .filter(a => Number.isFinite(a) && a >= 0)
  return ages.length ? Math.ceil(Math.max(...ages)) : 30
})

const scale = computed(() => timeScale(spanDays.value, scaleMode.value))
const points = computed(() => projectSeries(props.data, {
  dateKey: props.dateKey, valueKey: props.valueKey, scale: scale.value,
}))

const oldestLabel = computed(() =>
  points.value.length ? labelForDays(points.value[0].age) + ' ago' : '—')

const chartOption = computed(() => {
  const ticks = scale.value.ticks()
  const tickX = ticks.map(t => t.x)
  const labelByX = new Map(ticks.map(t => [t.x, t.label]))
  const pts = points.value

  return {
    grid: { left: 8, right: 14, top: 16, bottom: 24, containLabel: true },
    tooltip: {
      ...baseTooltip,
      trigger: 'axis',
      // The axis is compressed, so the tooltip carries the exact date — the
      // one place a precise reading is safe, because only one point is shown.
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        const pt = pts[p?.dataIndex]
        if (!pt) return ''
        const d = new Date(pt.date)
        const date = Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '—'
        const g = scoreToGrade(pt.y)
        return `<strong>${date}</strong> · ${labelForDays(pt.age)} ago<br/>`
          + `Grade ${g ?? '—'}${expertMode.value ? ` · ${Math.round(pt.y * 10) / 10}` : ''}`
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 1,
      // Ticks sit at age positions, not even intervals — that IS the axis.
      axisLabel: {
        ...baseAxisLabel,
        fontSize: 11,
        customValues: tickX,
        formatter: (v) => labelByX.get(v) ?? '',
      },
      axisTick: { customValues: tickX },
      splitLine: { ...baseSplitLine, customValues: tickX },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      // Numbers are the expert reading; the default view is carried by the
      // coloured bands and the grade letters beside them.
      axisLabel: expertMode.value
        ? { ...baseAxisLabel, fontSize: 11 }
        : { show: false },
      splitLine: { show: false },
    },
    series: [{
      type: 'line',
      data: pts.map(p => [p.x, p.y]),
      showSymbol: expertMode.value,
      symbolSize: 4,
      smooth: false,
      lineStyle: { width: 2, color: palette.ink ?? '#25283d' },
      itemStyle: { color: palette.ink ?? '#25283d' },
      z: 3,
      markArea: {
        silent: true,
        z: 0,
        label: { show: true, position: 'insideEndTop', color: palette.ink50, fontSize: 10 },
        data: BANDS.map(b => ([
          { yAxis: b.from, itemStyle: { color: gradeColor(b.grade), opacity: 0.12 }, label: { formatter: b.grade } },
          { yAxis: b.to },
        ])),
      },
    }],
  }
})
</script>

<style scoped>
.chart { width: 100%; height: 260px; }
.hc-toggle {
  border: 1px solid var(--fleet-black-10);
  background: var(--fleet-white);
  color: var(--fleet-black-75);
  font-size: var(--font-size-sm);
  font-family: inherit;
  padding: 3px 9px;
  border-radius: var(--radius-small, 4px);
  cursor: pointer;
}
.hc-toggle:hover { color: var(--fleet-black); border-color: var(--fleet-black-25, var(--fleet-black-10)); }
.hc-note {
  margin: 6px 0 0;
  font-size: var(--font-size-xs, 11px);
  color: var(--fleet-black-50);
}
</style>
