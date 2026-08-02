<script setup>
import { computed } from 'vue'
import dayjs from 'dayjs'

const props = defineProps({
  // Vendor-published FMA release record:
  // { id, app, platform, version_from, version_to, timestamp, event_type }
  release: { type: Object, required: true },
  // Matched patch-wave rows for this release (fmaDeviceCounts[release.id]).
  // null/undefined = not loaded yet; [] = loaded with zero matches.
  rows: { type: Array, default: null },
  // True while the patch match for this release is being fetched.
  loading: { type: Boolean, default: false },
  // Patch-match window that follows the release, for empty-state copy.
  windowDays: { type: Number, default: 30 },
})

const emit = defineEmits(['load-devices'])

const loaded = computed(() => Array.isArray(props.rows))

const totalDevices = computed(() => {
  if (!loaded.value) return null
  return props.rows.reduce((sum, r) => sum + Number(r.device_count || 0), 0)
})

// Weighted-by-host avg lag plus max-of-max, matching the timeline views.
const aggregateLag = computed(() => {
  const rows = props.rows || []
  let totalHosts = 0
  let weightedSum = 0
  let maxLag = 0
  for (const r of rows) {
    const hosts = Number(r.device_count || 0)
    weightedSum += hosts * Number(r.avg_lag || 0)
    totalHosts += hosts
    const max = Number(r.max_lag || 0)
    if (max > maxLag) maxLag = max
  }
  const avg = totalHosts > 0 ? +(weightedSum / totalHosts).toFixed(1) : 0
  return { avg, max: +maxLag.toFixed(1) }
})

const platformLabel = computed(() => {
  const p = String(props.release.platform || '')
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : ''
})

function formatTime(ts) {
  return dayjs(ts).format('MMM DD HH:mm')
}
</script>

<template>
  <div class="fma-card">
    <div class="fma-head">
      <span class="fma-app">{{ release.app }}</span>
      <span v-if="platformLabel" class="fma-platform">{{ platformLabel }}</span>
      <span v-if="release.event_type === 'added'" class="fma-new">New app</span>
      <span class="fma-time">{{ formatTime(release.timestamp) }}</span>
    </div>
    <div class="fma-version">
      <template v-if="release.version_from">{{ release.version_from }} → </template>
      <strong>{{ release.version_to }}</strong>
    </div>

    <div v-if="loading" class="fma-stats fma-stats-loading">Loading…</div>
    <template v-else-if="loaded">
      <div class="fma-stats">
        <div class="fma-headline">
          <strong>{{ totalDevices || 0 }}</strong>
          <span class="fma-headline-label">{{ totalDevices === 1 ? 'host patched' : 'hosts patched' }}</span>
        </div>
        <div v-if="totalDevices > 0" class="fma-caption">
          avg {{ aggregateLag.avg }}d · max {{ aggregateLag.max }}d · via osquery
        </div>
        <div v-else class="fma-caption fma-caption-empty">
          no matching transitions in {{ windowDays }}d window
        </div>
      </div>
      <slot />
      <button class="fma-btn fma-btn-secondary" type="button" @click="emit('load-devices', release)">
        Refresh
      </button>
    </template>
    <button v-else class="fma-btn" type="button" @click="emit('load-devices', release)">
      Show hosts patched
    </button>
  </div>
</template>

<style scoped>
.fma-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-medium);
}

.fma-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.fma-app {
  font-size: 13px;
  font-weight: 600;
  color: var(--fleet-black);
}

.fma-platform {
  font-size: 10px;
  font-weight: 600;
  color: var(--fleet-black-75);
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-full);
  padding: 1px 8px;
  line-height: 1.5;
  white-space: nowrap;
}

.fma-new {
  font-size: 10px;
  font-weight: 600;
  color: var(--status-fair-text);
  background: var(--status-fair-bg);
  border-radius: var(--radius-full);
  padding: 1px 8px;
  line-height: 1.5;
  white-space: nowrap;
}

.fma-time {
  margin-left: auto;
  font-size: 12px;
  color: var(--fleet-black-50);
  text-align: right;
  white-space: nowrap;
}

.fma-version {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fleet-black-75);
}

.fma-stats {
  margin-top: 2px;
  padding-top: var(--pad-small);
  border-top: 1px solid var(--fleet-black-5);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fma-stats-loading {
  color: var(--fleet-black-50);
  font-size: var(--font-size-xs);
}

.fma-headline {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.fma-headline strong {
  font-size: 20px;
  font-weight: 700;
  color: var(--fleet-black);
  line-height: 1;
}

.fma-headline-label {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-75);
}

.fma-caption {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
}

.fma-caption-empty {
  font-style: italic;
}

.fma-btn {
  align-self: flex-start;
  font-size: var(--font-size-xs);
  padding: 6px 12px;
  border: 1px solid var(--fleet-black-25);
  background: var(--fleet-white);
  color: var(--fleet-black-75);
  border-radius: var(--radius);
  cursor: pointer;
  transition: background-color var(--transition-base), border-color var(--transition-base);
}
.fma-btn:hover {
  background: var(--fleet-black-5);
}
.fma-btn:focus-visible {
  outline: 1px solid var(--fleet-focused-outline);
  outline-offset: 1px;
}

.fma-btn-secondary {
  border-color: var(--fleet-black-10);
  padding: 4px 10px;
}
</style>
