<template>
  <div class="time-range-filter">
    <div class="range-buttons">
      <button
        v-for="range in timeRanges"
        :key="range.value"
        class="range-btn"
        :class="{ active: selectedRange === range.value }"
        @click="setRange(range.value)"
      >
        {{ range.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { useTimeRange } from '../composables/useTimeRange'

const { selectedRange, timeRanges, setRange } = useTimeRange()
</script>

<style scoped>
.time-range-filter {
  display: flex;
  align-items: center;
}

.range-buttons {
  display: flex;
  background: var(--fleet-black-5);
  border-radius: var(--radius);
  padding: 3px;
  gap: 2px;
}

.range-btn {
  padding: 6px 12px;
  border: none;
  background: transparent;
  border-radius: calc(var(--radius) - 2px);
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black-50);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.range-btn:hover {
  color: var(--fleet-black-75);
}

.range-btn.active {
  background: var(--fleet-white);
  color: var(--fleet-black);
  box-shadow: var(--shadow-xs);
}
</style>
