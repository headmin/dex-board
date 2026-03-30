import { ref, computed } from 'vue'

const selectedRange = ref('1d')

const timeRanges = [
  { value: '1h', label: 'Last hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '1d', label: 'Last day' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' }
]

// Map display values to hours (used by the Worker's query registry)
const RANGE_TO_HOURS = {
  '1h': '1',
  '6h': '6',
  '1d': '24',
  '7d': '168',
  '30d': '720'
}

export function useTimeRange() {
  // Hours value for API params (e.g., '24' for 1 day)
  const timeRangeHours = computed(() => {
    return RANGE_TO_HOURS[selectedRange.value] || '24'
  })

  const setRange = (range) => {
    selectedRange.value = range
  }

  return {
    selectedRange,
    timeRanges,
    timeRangeHours,
    setRange
  }
}
