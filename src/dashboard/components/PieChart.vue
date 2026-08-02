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
import { PieChart as EChartsPie } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { baseTooltip } from '../composables/echartsTheme'
import { palette, categorical } from '../composables/uiPalette'

use([CanvasRenderer, EChartsPie, TooltipComponent, LegendComponent])

const props = defineProps({
  title: { type: String, required: true },
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  nameKey: { type: String, default: 'name' },
  valueKey: { type: String, default: 'value' }
})

const chartOption = computed(() => ({
  color: categorical,
  tooltip: {
    ...baseTooltip,
    trigger: 'item',
    formatter: '{b}: {c} ({d}%)'
  },
  legend: {
    orient: 'vertical',
    right: 10,
    top: 'center',
    textStyle: { color: palette.ink75, fontSize: 11 }
  },
  series: [{
    type: 'pie',
    radius: ['40%', '70%'],
    center: ['35%', '50%'],
    avoidLabelOverlap: false,
    itemStyle: {
      borderRadius: 4,
      borderColor: palette.white,
      borderWidth: 2
    },
    label: {
      show: false
    },
    emphasis: {
      label: {
        show: true,
        fontSize: 13,
        fontWeight: 'bold'
      }
    },
    data: props.data.map(d => ({
      name: d[props.nameKey],
      value: d[props.valueKey]
    }))
  }]
}))
</script>

<style scoped>
.chart {
  width: 100%;
  height: 300px;
}
</style>
