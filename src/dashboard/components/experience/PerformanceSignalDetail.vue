<template>
  <!-- ─── Performance Detail: swap strain, largest processes, stale sessions ── -->
  <div class="performance-detail">
    <div v-if="!loaded" class="detail-loading">Loading performance signals...</div>

    <div v-else class="perf-lists">
      <!-- Swap pressure — 35% of Performance -->
      <div class="detail-section">
        <h4>Sustained swap strain</h4>
        <p class="section-hint">Hosts pressured on 3+ of their reporting days (30d) · swap is 35% of Performance</p>
        <div v-if="swapQualifying === null" class="data-unavailable">Swap-pressure data unavailable</div>
        <div v-else-if="swapQualifying.length" class="app-list">
          <div v-for="h in swapTop" :key="h.host_id" class="app-row">
            <span class="app-name">{{ displayHost(h) }}</span>
            <span class="row-metric strained">{{ h.days_pressured_30d }} of {{ h.days_reporting_30d }} days pressured</span>
            <Badge v-if="h.days_severe_30d > 0" tone="critical" :label="`${h.days_severe_30d} severe`" />
          </div>
          <p v-if="swapQualifying.length > 8" class="cap-note">Showing 8 of {{ swapQualifying.length }} hosts</p>
        </div>
        <div v-else class="good-news">No sustained swap strain in the last 30 days</div>
      </div>

      <!-- Max process RSS — 20% of Performance -->
      <div class="detail-section">
        <h4>Largest single processes</h4>
        <p class="section-hint">Top 8 fleet-wide by average resident memory · max RSS is 20% of Performance</p>
        <div v-if="topProcesses === null" class="data-unavailable">Process data unavailable</div>
        <div v-else-if="topProcesses.length" class="app-list">
          <div v-for="p in topProcesses" :key="p.process_name + p.process_class" class="app-row">
            <span class="app-name">{{ p.process_name }}</span>
            <span class="row-metric">{{ p.device_count != null ? `${p.device_count} hosts` : '—' }}</span>
            <span class="row-mb">{{ p.max_rss_mb != null ? `${Math.round(p.max_rss_mb).toLocaleString()} MB max` : '—' }}</span>
          </div>
        </div>
        <div v-else class="good-news">No process samples reported</div>
      </div>

      <!-- Uptime risk — 15% of Performance -->
      <div class="detail-section">
        <h4>Stale sessions</h4>
        <p class="section-hint">Hosts 7+ days since reboot · uptime is 15% of Performance</p>
        <div v-if="staleQualifying === null" class="data-unavailable">Uptime data unavailable</div>
        <div v-else-if="staleQualifying.length" class="app-list">
          <div v-for="h in staleQualifying.slice(0, 8)" :key="h.host_id" class="app-row">
            <span class="app-name">{{ displayHost(h) }}</span>
            <span class="row-metric">{{ h.uptime_days != null ? `${Math.round(h.uptime_days)} days since reboot` : '—' }}</span>
            <Badge :tone="uptimeTone(h.uptime_risk)" :label="uptimeLabel(h.uptime_risk)" />
          </div>
          <p v-if="staleQualifying.length > 8" class="cap-note">Showing 8 of {{ staleQualifying.length }} hosts</p>
        </div>
        <div v-else class="good-news">No stale sessions — every host rebooted within 7 days</div>
      </div>
    </div>

    <p class="detail-footnote">
      Swap strain is scoped by the fleet filter. Largest processes and stale sessions are
      fleet-wide — their queries are not scoped by the fleet filter.
    </p>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import Badge from '../base/Badge.vue'
import { query } from '../../services/api'
import { displayHost } from '../../composables/displayName'
import { useFleetFilter } from '../../composables/useFleetFilter'

const { filterParams } = useFleetFilter()

const loaded = ref(false)
// null = fetch failed (data unavailable) · [] = genuinely empty (good news)
const swapRows = ref(null)
const procRows = ref(null)
const osRows = ref(null)

async function fetchAll() {
  const [swap, procs, os] = await Promise.all([
    // Filter-aware (declares FILTER_PARAMS in core-lifecycle.ts).
    query('firehose.lifecycle.refresh_candidates', { limit: 200, ...filterParams.value }).catch(() => null),
    // Fleet-wide only — no FILTER_PARAMS in core-processes.ts.
    query('firehose.processes.top_fleet', { limit: 8 }).catch(() => null),
    // Fleet-wide only — no FILTER_PARAMS in core-health.ts.
    query('firehose.health.os_list', { limit: 200 }).catch(() => null),
  ])
  swapRows.value = swap
  procRows.value = procs
  osRows.value = os
  loaded.value = true
}

onMounted(fetchAll)
watch(filterParams, fetchAll, { deep: true })

// Hosts pressured on 3+ reporting days in the last 30 — sustained strain,
// not a one-day spike. null propagates fetch failure to the template.
const swapQualifying = computed(() => {
  if (!Array.isArray(swapRows.value)) return null
  return swapRows.value
    .filter(r => (r.days_pressured_30d ?? 0) >= 3)
    .sort((a, b) => (b.days_pressured_30d ?? 0) - (a.days_pressured_30d ?? 0))
})
const swapTop = computed(() => (swapQualifying.value || []).slice(0, 8))

const topProcesses = computed(() =>
  Array.isArray(procRows.value) ? procRows.value : null
)

const staleQualifying = computed(() => {
  if (!Array.isArray(osRows.value)) return null
  return osRows.value
    .filter(r => r.uptime_risk === 'stale_7d' || r.uptime_risk === 'stale_14d')
    .sort((a, b) => (b.uptime_days ?? 0) - (a.uptime_days ?? 0))
})

function uptimeTone(risk) {
  return { stale_7d: 'elevated', stale_14d: 'critical' }[risk] || 'neutral'
}
function uptimeLabel(risk) {
  return { stale_7d: '7d+ stale', stale_14d: '14d+ stale' }[risk] || (risk || '—')
}
</script>

<style scoped>
/* ─── Performance detail panel ────────────────── */
.performance-detail {
  margin-top: var(--pad-large);
  padding-top: var(--pad-large);
  border-top: 1px solid var(--fleet-black-10);
  display: flex;
  flex-direction: column;
  gap: var(--pad-large);
}

.detail-loading {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  padding: 7px 0;
}

.perf-lists {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--pad-large);
}

.detail-section h4 {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0 0 var(--pad-medium) 0;
}

.section-hint {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  margin: 0 0 12px;
}

.app-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.app-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 7px 0;
  border-bottom: 1px solid var(--fleet-black-5);
}

.app-row:last-child {
  border-bottom: none;
}

.app-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-metric {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  white-space: nowrap;
}

.row-metric.strained {
  color: var(--fleet-error);
}

.row-mb {
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  color: var(--fleet-black-50);
  min-width: 80px;
  text-align: right;
}

.cap-note {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-33);
  margin: 6px 0 0;
}

.good-news {
  font-size: var(--font-size-sm);
  color: var(--status-good);
  font-weight: 500;
  padding: 7px 0;
}

.data-unavailable {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  font-weight: 500;
  padding: 7px 0;
}

.detail-footnote {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
  text-wrap: pretty;
}

/* ─── Responsive ──────────────────────────────── */
@media (max-width: 900px) {
  .perf-lists {
    grid-template-columns: 1fr;
  }
}
</style>
