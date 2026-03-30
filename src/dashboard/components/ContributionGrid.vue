<template>
  <div class="grid-container">
    <div class="grid-header">
      <h3>{{ title }}</h3>
      <div class="grid-controls">
        <slot name="controls" />
      </div>
    </div>

    <div v-if="loading" class="grid-loading">Loading...</div>
    <div v-else-if="weeks.length === 0" class="grid-empty">No data yet</div>
    <template v-else>
      <div class="grid-scroll">
        <!-- Month labels -->
        <div class="month-row">
          <div class="day-label-spacer"></div>
          <div class="months">
            <span
              v-for="m in monthLabels"
              :key="m.key"
              class="month-label"
              :style="{ gridColumn: `${m.col} / span ${m.span}` }"
            >{{ m.label }}</span>
          </div>
        </div>

        <!-- Grid rows (days of week) -->
        <div class="grid-body">
          <div class="day-labels">
            <span v-for="d in dayLabels" :key="d" class="day-label">{{ d }}</span>
          </div>
          <div class="cells-grid" :style="{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }">
            <template v-for="(week, wi) in weeks" :key="wi">
              <div
                v-for="(cell, di) in week"
                :key="`${wi}-${di}`"
                class="cell"
                :class="{ empty: cell === null }"
                :style="cell !== null ? { background: getColor(cell.value) } : {}"
                @mouseenter="showTooltip($event, cell, wi, di)"
                @mouseleave="hideTooltip"
                @click="cell && $emit('cell-click', cell)"
              />
            </template>
          </div>
        </div>
      </div>

      <!-- Legend -->
      <div class="grid-legend">
        <span class="legend-label">{{ legendLow }}</span>
        <div class="legend-cells">
          <div v-for="(c, i) in legendColors" :key="i" class="legend-cell" :style="{ background: c }" />
        </div>
        <span class="legend-label">{{ legendHigh }}</span>
      </div>
    </template>

    <!-- Tooltip -->
    <div v-if="tooltip.visible" class="grid-tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
      <div class="tooltip-date">{{ tooltip.date }}</div>
      <div class="tooltip-value">{{ tooltip.text }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import dayjs from 'dayjs'

const props = defineProps({
  title: { type: String, default: '' },
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  colorScale: {
    type: Array,
    default: () => ['#f0f1f4', '#c5ddf8', '#7bb8f0', '#3e8ed8', '#1a5fb4']
  },
  maxValue: { type: Number, default: null },
  valueLabel: { type: String, default: 'value' },
  valueFormatter: { type: Function, default: null },
  legendLow: { type: String, default: 'Low' },
  legendHigh: { type: String, default: 'High' }
})

defineEmits(['cell-click'])

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const tooltip = ref({ visible: false, x: 0, y: 0, date: '', text: '' })

// Build a map of date -> value from input data
// Expects data items with { date: 'YYYY-MM-DD', value: number, ...extra }
const dataMap = computed(() => {
  const map = {}
  for (const d of props.data) {
    map[d.date] = d
  }
  return map
})

const effectiveMax = computed(() => {
  if (props.maxValue !== null) return props.maxValue
  if (props.data.length === 0) return 1
  return Math.max(1, ...props.data.map(d => d.value || 0))
})

// Build weeks grid: array of 7-element arrays (Sun-Sat), spanning the data range
const weeks = computed(() => {
  if (props.data.length === 0) return []

  const dates = props.data.map(d => d.date).sort()
  const start = dayjs(dates[0]).startOf('week')
  const end = dayjs(dates[dates.length - 1]).endOf('week')

  const result = []
  let current = start
  let week = []

  while (current.isBefore(end) || current.isSame(end, 'day')) {
    const key = current.format('YYYY-MM-DD')
    const dayOfWeek = current.day()

    if (dayOfWeek === 0 && week.length > 0) {
      result.push(week)
      week = []
    }

    const entry = dataMap.value[key]
    week.push(entry ? { ...entry, dateStr: key, dayjs: current } : null)
    current = current.add(1, 'day')
  }

  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    result.push(week)
  }

  return result
})

// Month labels positioned above the grid
const monthLabels = computed(() => {
  if (weeks.value.length === 0) return []

  const labels = []
  let lastMonth = -1

  for (let wi = 0; wi < weeks.value.length; wi++) {
    // Find first non-null cell in the week
    const cell = weeks.value[wi].find(c => c !== null)
    if (!cell) continue

    const month = cell.dayjs.month()
    if (month !== lastMonth) {
      labels.push({
        key: `${cell.dayjs.year()}-${month}`,
        label: cell.dayjs.format('MMM'),
        col: wi + 1,
        span: 1
      })
      lastMonth = month
    } else if (labels.length > 0) {
      labels[labels.length - 1].span++
    }
  }

  return labels
})

const legendColors = computed(() => props.colorScale)

function getColor(value) {
  if (value == null || value === 0) return props.colorScale[0]
  const ratio = Math.min(value / effectiveMax.value, 1)
  const index = Math.min(Math.floor(ratio * (props.colorScale.length - 1)), props.colorScale.length - 1)
  return props.colorScale[Math.max(1, index)] // index 0 is "empty"
}

function showTooltip(event, cell, wi, di) {
  if (!cell) return
  const rect = event.target.getBoundingClientRect()
  const container = event.target.closest('.grid-container').getBoundingClientRect()

  tooltip.value = {
    visible: true,
    x: rect.left - container.left + rect.width / 2,
    y: rect.top - container.top - 8,
    date: cell.dayjs.format('dddd, MMMM D YYYY'),
    text: props.valueFormatter
      ? props.valueFormatter(cell)
      : `${cell.value} ${props.valueLabel}`
  }
}

function hideTooltip() {
  tooltip.value.visible = false
}
</script>

<style scoped>
.grid-container {
  background: var(--fleet-white);
  border-radius: var(--radius);
  border: 1px solid var(--fleet-black-10);
  padding: var(--pad-large);
  box-shadow: var(--box-shadow);
  position: relative;
}

.grid-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

h3 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  margin: 0;
}

.grid-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.grid-loading, .grid-empty {
  text-align: center;
  padding: 40px;
  color: #8b8fa2;
  font-size: 13px;
}

.grid-scroll {
  overflow-x: auto;
}

/* Month labels row */
.month-row {
  display: flex;
  margin-bottom: 4px;
}

.day-label-spacer {
  width: 36px;
  flex-shrink: 0;
}

.months {
  flex: 1;
  display: grid;
  font-size: 11px;
  color: #8b8fa2;
  font-weight: 500;
}

.month-label {
  padding-left: 2px;
}

/* Grid body */
.grid-body {
  display: flex;
  gap: 4px;
}

.day-labels {
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  width: 32px;
  flex-shrink: 0;
}

.day-label {
  font-size: 11px;
  color: #8b8fa2;
  display: flex;
  align-items: center;
  height: 14px;
}

.cells-grid {
  flex: 1;
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  grid-auto-flow: column;
  gap: 3px;
}

.cell {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: #f0f1f4;
  cursor: pointer;
  transition: outline 100ms;
}

.cell:hover:not(.empty) {
  outline: 2px solid #192147;
  outline-offset: -1px;
}

.cell.empty {
  background: transparent;
  cursor: default;
}

/* Legend */
.grid-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 12px;
}

.legend-label {
  font-size: 11px;
  color: #8b8fa2;
}

.legend-cells {
  display: flex;
  gap: 2px;
}

.legend-cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

/* Tooltip */
.grid-tooltip {
  position: absolute;
  transform: translate(-50%, -100%);
  background: var(--fleet-tooltip-bg);
  color: #fff;
  padding: 8px 12px;
  border-radius: var(--radius);
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(62, 71, 113, 0.4);
}

.grid-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: var(--fleet-tooltip-bg);
}

.tooltip-date {
  font-weight: 600;
  margin-bottom: 2px;
}

.tooltip-value {
  color: #c5c7d1;
}
</style>
