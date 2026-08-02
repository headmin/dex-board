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
  horizontal: { type: Boolean, default: true }
})

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
</style>
