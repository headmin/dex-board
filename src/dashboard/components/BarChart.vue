<template>
  <ChartCard :title="title" :loading="loading">
    <v-chart class="chart" :class="{ 'chart--clickable': clickable }" :option="chartOption" autoresize @click="onBarClick" />
  </ChartCard>
</template>

<script setup>
import { computed } from 'vue'
import ChartCard from './base/ChartCard.vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart as EChartsBar } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { baseTooltip, baseAxisLabel, baseSplitLine } from '../composables/echartsTheme'
import { palette } from '../composables/uiPalette'

use([CanvasRenderer, EChartsBar, GridComponent, TooltipComponent])

const props = defineProps({
  title: { type: String, required: true },
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  nameKey: { type: String, default: 'name' },
  valueKey: { type: String, default: 'value' },
  horizontal: { type: Boolean, default: true },
  // Only affects the cursor. The emit fires regardless; a parent that does
  // not listen simply drops it, so the ~20 existing BarCharts are untouched.
  clickable: { type: Boolean, default: false }
})

const emit = defineEmits(['bar-click'])

// ECharts reports the clicked index; the parent wants its own row object back,
// not the bare label, so it can key a drill-down off whatever it put in `data`.
//
// The horizontal branch below renders `names.reverse()` / `values.reverse()`,
// because a category y-axis draws index 0 at the BOTTOM and the fleet reads
// top-down. That reversal means the chart's dataIndex runs opposite to
// `props.data`, so handing back `props.data[dataIndex]` returns the wrong row
// -- clicking M2 opened the M5 Pro cohort. Map the index back before emitting.
function onBarClick(params) {
  const di = params?.dataIndex
  if (di == null || di < 0 || di >= props.data.length) return
  const i = props.horizontal ? props.data.length - 1 - di : di
  emit('bar-click', props.data[i], i)
}

const chartOption = computed(() => {
  const names = props.data.map(d => d[props.nameKey])
  const values = props.data.map(d => d[props.valueKey])

  if (props.horizontal) {
    return {
      tooltip: {
        ...baseTooltip,
        axisPointer: { type: 'shadow' }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        axisLabel: { ...baseAxisLabel, fontSize: 11 },
        splitLine: { ...baseSplitLine }
      },
      yAxis: {
        type: 'category',
        data: names.reverse(),
        axisLabel: {
          ...baseAxisLabel,
          width: 100,
          overflow: 'truncate',
          fontSize: 11
        }
      },
      series: [{
        type: 'bar',
        data: values.reverse(),
        itemStyle: {
          color: palette.info,
          borderRadius: [0, 4, 4, 0]
        }
      }]
    }
  }

  return {
    tooltip: {
      ...baseTooltip,
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: names,
      axisLabel: {
        ...baseAxisLabel,
        rotate: 45,
        width: 80,
        overflow: 'truncate',
        fontSize: 11
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: { ...baseAxisLabel, fontSize: 11 },
      splitLine: { ...baseSplitLine }
    },
    series: [{
      type: 'bar',
      data: values,
      itemStyle: {
        color: palette.info,
        borderRadius: [4, 4, 0, 0]
      }
    }]
  }
})
</script>

<style scoped>
.chart {
  width: 100%;
  height: 300px;
}
.chart--clickable {
  cursor: pointer;
}
</style>
