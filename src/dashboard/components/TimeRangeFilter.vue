<template>
  <div class="time-range-filter">
    <span class="time-label">Time range</span>
    <div class="select-wrapper">
      <select :value="selectedRange" @change="onChange">
        <option v-for="range in timeRanges" :key="range.value" :value="range.value">
          {{ range.label }}
        </option>
      </select>
      <svg class="select-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none">
        <path d="M1 1l4 4 4-4" stroke="#515774" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { useTimeRange } from '../composables/useTimeRange'

const { selectedRange, timeRanges, setRange } = useTimeRange()

const onChange = (event) => {
  setRange(event.target.value)
}
</script>

<style scoped>
.time-range-filter {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-label {
  font-family: "Inter", sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: #8b8fa2;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.select-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

select {
  border: 1px solid #e2e4ea;
  border-radius: 4px;
  padding: 6px 28px 6px 10px;
  font-family: "Inter", sans-serif;
  font-size: 14px;
  color: #515774;
  background: #fff;
  cursor: pointer;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  transition: border-color 150ms ease-in-out;
}

select:hover {
  border-color: #c5c7d1;
}

select:focus {
  border-color: #192147;
}

.select-arrow {
  position: absolute;
  right: 10px;
  pointer-events: none;
}
</style>
