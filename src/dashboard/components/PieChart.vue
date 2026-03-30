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
import { PieChart as EChartsPie } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, EChartsPie, TooltipComponent, LegendComponent])

const props = defineProps({
  title: { type: String, required: true },
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  nameKey: { type: String, default: 'name' },
  valueKey: { type: String, default: 'value' }
})

const chartOption = computed(() => ({
  color: ['#6a67fe', '#009a7d', '#ae6ddf', '#ebbc43', '#5cabdf', '#ff5c83'],
  tooltip: {
    trigger: 'item',
    formatter: '{b}: {c} ({d}%)',
    backgroundColor: '#3e4771',
    borderColor: '#3e4771',
    textStyle: { color: '#fff', fontSize: 12 },
    borderRadius: 4
  },
  legend: {
    orient: 'vertical',
    right: 10,
    top: 'center',
    textStyle: { color: '#515774', fontSize: 12 }
  },
  series: [{
    type: 'pie',
    radius: ['40%', '70%'],
    center: ['35%', '50%'],
    avoidLabelOverlap: false,
    itemStyle: {
      borderRadius: 4,
      borderColor: '#fff',
      borderWidth: 2
    },
    label: {
      show: false
    },
    emphasis: {
      label: {
        show: true,
        fontSize: 14,
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
