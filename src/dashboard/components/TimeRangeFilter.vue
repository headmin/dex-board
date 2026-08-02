<template>
  <div class="time-range-filter">
    <SegmentedControl
      :model-value="selectedRange"
      :options="timeRanges"
      @update:model-value="setRange"
    />
  </div>
</template>

<script setup>
import SegmentedControl from './base/SegmentedControl.vue'
import { useTimeRange } from '../composables/useTimeRange'

const { selectedRange, timeRanges, setRange } = useTimeRange()
</script>

<style scoped>
.time-range-filter {
  display: flex;
  align-items: center;
}
</style>
