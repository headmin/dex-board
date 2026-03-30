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
import { BarChart as EChartsBar } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'

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
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#3e4771',
        borderColor: '#3e4771',
        textStyle: { color: '#fff', fontSize: 12 },
        borderRadius: 4
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        axisLabel: { color: '#8b8fa2', fontSize: 12 },
        splitLine: { lineStyle: { color: '#f0f1f4' } }
      },
      yAxis: {
        type: 'category',
        data: names.reverse(),
        axisLabel: {
          width: 100,
          overflow: 'truncate',
          color: '#8b8fa2',
          fontSize: 12
        }
      },
      series: [{
        type: 'bar',
        data: values.reverse(),
        itemStyle: {
          color: '#6a67fe',
          borderRadius: [0, 4, 4, 0]
        }
      }]
    }
  }

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#3e4771',
      borderColor: '#3e4771',
      textStyle: { color: '#fff', fontSize: 12 },
      borderRadius: 4
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
        rotate: 45,
        width: 80,
        overflow: 'truncate',
        color: '#8b8fa2',
        fontSize: 12
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#8b8fa2', fontSize: 12 },
      splitLine: { lineStyle: { color: '#f0f1f4' } }
    },
    series: [{
      type: 'bar',
      data: values,
      itemStyle: {
        color: '#6a67fe',
        borderRadius: [4, 4, 0, 0]
      }
    }]
  }
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
