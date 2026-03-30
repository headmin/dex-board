import { ref } from 'vue'
import dayjs from 'dayjs'

const gitopsEvents = ref([])
let fetched = false

async function fetchGitopsEvents() {
  if (fetched) return
  try {
    const res = await fetch('/gitops-events.json')
    if (res.ok) gitopsEvents.value = await res.json()
  } catch {
    // silent — markers simply won't appear if file is missing
  }
  fetched = true
}

function eventsInRange(startTime, endTime) {
  const start = dayjs(startTime)
  const end = dayjs(endTime)
  return gitopsEvents.value.filter(e => {
    const t = dayjs(e.timestamp)
    return t.isAfter(start) && t.isBefore(end)
  })
}

function eventsAsChartMarkers(xLabels, events) {
  if (!xLabels.length || !events.length) return []

  const markers = []
  for (const evt of events) {
    const evtTime = dayjs(evt.timestamp)
    // Find nearest xLabel index by minimal time distance
    let bestIdx = -1
    let bestDiff = Infinity
    for (let i = 0; i < xLabels.length; i++) {
      // xLabels are partial time strings — try parsing with today's date context
      const labelTime = parseXLabel(xLabels[i], evtTime)
      if (!labelTime) continue
      const diff = Math.abs(evtTime.diff(labelTime, 'minute'))
      if (diff < bestDiff) {
        bestDiff = diff
        bestIdx = i
      }
    }
    if (bestIdx >= 0) {
      const truncMsg = evt.message.length > 30
        ? evt.message.slice(0, 27) + '...'
        : evt.message
      markers.push({
        xIndex: bestIdx,
        label: truncMsg,
        hash: evt.hash,
        timestamp: evt.timestamp,
        message: evt.message,
        author: evt.author,
        color: '#6a67fe'
      })
    }
  }
  return markers
}

// Parse xLabel strings like "14:00", "03-13 14:00", "03-13" into dayjs
function parseXLabel(label, refTime) {
  // Format: "HH:00" (hour bucket)
  if (/^\d{2}:\d{2}$/.test(label)) {
    const [h, m] = label.split(':').map(Number)
    return refTime.startOf('day').hour(h).minute(m)
  }
  // Format: "MM-DD HH:00" (4h bucket)
  if (/^\d{2}-\d{2} \d{2}:\d{2}$/.test(label)) {
    const [date, time] = label.split(' ')
    const [mo, da] = date.split('-').map(Number)
    const [h, m] = time.split(':').map(Number)
    return refTime.year(refTime.year()).month(mo - 1).date(da).hour(h).minute(m)
  }
  // Format: "MM-DD" (day bucket)
  if (/^\d{2}-\d{2}$/.test(label)) {
    const [mo, da] = label.split('-').map(Number)
    return refTime.year(refTime.year()).month(mo - 1).date(da).startOf('day')
  }
  return null
}

export function useGitopsEvents() {
  return {
    gitopsEvents,
    fetchGitopsEvents,
    eventsInRange,
    eventsAsChartMarkers
  }
}
