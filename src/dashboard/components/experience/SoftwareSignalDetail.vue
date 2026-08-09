<template>
  <!-- ─── Software Detail: Patch Velocity + Usage Tables ──── -->
  <div class="software-detail">
    <div class="detail-section">
      <h4>Fleet Software Health</h4>
      <div class="patch-stats">
        <div class="patch-stat">
          <span class="stat-value">{{ patchStats.pctCurrent != null ? `${patchStats.pctCurrent}%` : '—' }}</span>
          <span class="stat-label">fleet on current OS</span>
        </div>
        <!-- Both lists are fetched with limit 8 — a capped list length must
             never read as a fleet count, so show "8+" at the cap. -->
        <div class="patch-stat">
          <span class="stat-value">{{ mostUsedApps.length >= 8 ? '8+' : mostUsedApps.length }}</span>
          <span class="stat-label">crashing apps (7d)</span>
        </div>
        <div class="patch-stat">
          <span class="stat-value">{{ leastUsedApps.length >= 8 ? '8+' : leastUsedApps.length }}</span>
          <span class="stat-label">stale apps (90d+)</span>
        </div>
      </div>
    </div>

    <div class="usage-tables">
      <div class="detail-section">
        <h4>Recent Crashes</h4>
        <div v-if="mostUsedApps.length" class="app-list">
          <div v-for="app in mostUsedApps" :key="app.app_name">
            <div class="app-row">
              <span class="app-name">{{ app.app_name }}</span>
              <span class="app-devices stale">{{ app.device_count }} hosts</span>
              <GradeBadge :grade="app.usage_grade" />
            </div>
          </div>
        </div>
        <div v-else class="good-news">No crashes in the last 7 days</div>
      </div>
      <div class="detail-section">
        <h4>Stale Apps (90d+ unused)</h4>
        <div class="app-list">
          <div v-for="app in leastUsedApps" :key="app.app_name">
            <div class="app-row" :class="{ clickable: !wcMode }" @click="!wcMode && $emit('toggle-app-drill', app.app_name, 'stale')">
              <span class="app-name">{{ app.app_name }}</span>
              <span class="app-devices stale">{{ app.stale_count }} hosts unused</span>
              <span class="app-avg-days">{{ app.avg_days }}d avg</span>
              <span v-if="!wcMode" class="drill-arrow">{{ drillApp === app.app_name ? '▾' : '▸' }}</span>
            </div>
            <div v-if="drillApp === app.app_name && !wcMode" class="device-drill">
              <div v-if="drillLoading" class="drill-loading">Loading hosts...</div>
              <div v-else class="drill-device-list">
                <div v-for="d in drillDevices" :key="d.host_identifier" class="drill-device-row">
                  <span class="drill-hostname">{{ displayHost(d) }}</span>
                  <span class="drill-version">v{{ d.app_version }}</span>
                  <Badge :tone="usageTone(d.usage_category)" :label="d.usage_category" />
                  <span class="drill-days">{{ d.days_since_opened }}d since opened</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="wcMode" class="wc-drill-notice">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Per-host app drill-down disabled — Workers Council mode active
      </div>
    </div>

    <div v-if="softwarePatchMovers.length" class="detail-section">
      <div class="patch-movers-head">
        <h4>Top patch movers (7d)</h4>
        <span v-if="patchTrendView" class="patch-trend" :class="`patch-trend--${patchTrendView.dir}`">
          fleet MTTP {{ patchTrendView.current }}d
          <span class="patch-trend-arrow">{{ patchTrendView.dir === 'faster' ? '▼' : patchTrendView.dir === 'slower' ? '▲' : '▬' }}</span>
          {{ patchTrendView.txt }} vs prior 7d
        </span>
      </div>
      <p class="section-hint">Mean time to patch per app · sorted by hosts patched</p>
      <MttpTable :rows="softwarePatchMovers" :sla-days="config.patchSlaDays" />
    </div>
  </div>
</template>

<script setup>
import GradeBadge from '../GradeBadge.vue'
import MttpTable from '../MttpTable.vue'
import Badge from '../base/Badge.vue'
import { displayHost } from '../../composables/displayName'
import { useAppConfig } from '../../composables/useAppConfig'
import { useWorkersCouncil } from '../../composables/useWorkersCouncil'

defineProps({
  patchStats: { type: Object, default: () => ({}) },
  mostUsedApps: { type: Array, default: () => [] },
  leastUsedApps: { type: Array, default: () => [] },
  softwarePatchMovers: { type: Array, default: () => [] },
  patchTrendView: { type: Object, default: null },
  drillApp: { type: String, default: null },
  drillDevices: { type: Array, default: () => [] },
  drillLoading: { type: Boolean, default: false },
})

defineEmits(['toggle-app-drill'])

const { config } = useAppConfig()
const { wcMode } = useWorkersCouncil()

// App-usage tier -> Badge tone for the stale-app device drill-down.
function usageTone(cat) {
  return {
    daily: 'good',
    weekly: 'info',
    monthly: 'fair',
    stale: 'elevated',
    never: 'critical',
  }[cat] || 'neutral'
}
</script>

<style scoped>
/* ─── Software detail panel ───────────────────── */
.software-detail {
  margin-top: var(--pad-large);
  padding-top: var(--pad-large);
  border-top: 1px solid var(--fleet-black-10);
  display: flex;
  flex-direction: column;
  gap: var(--pad-large);
}

.detail-section h4 {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0 0 var(--pad-medium) 0;
}

.patch-stats {
  display: flex;
  gap: var(--pad-large);
  margin-bottom: var(--pad-medium);
}

.patch-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--fleet-black);
}

.stat-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black-75);
}

.usage-tables {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--pad-large);
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
}

.app-devices {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
}

.app-devices.stale {
  color: var(--fleet-error);
}

.app-avg-days {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-33);
  min-width: 50px;
  text-align: right;
}

.app-row.clickable {
  cursor: pointer;
  transition: background 150ms ease-in-out;
  border-radius: var(--radius);
  margin: 0 -4px;
  padding: 7px 4px;
}

.app-row.clickable:hover {
  background: var(--fleet-black-5);
}

.drill-arrow {
  font-size: 10px;
  color: var(--fleet-black-33);
  min-width: 16px;
  text-align: center;
}

/* ─── Device drill-down panel ─────────────────── */
.device-drill {
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  margin: 4px 0 7px 0;
  padding: var(--pad-small) var(--pad-medium);
}

.drill-loading {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  padding: var(--pad-small) 0;
}

.drill-device-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.drill-device-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 5px 0;
  border-bottom: 1px solid var(--fleet-black-5);
}

.drill-device-row:last-child {
  border-bottom: none;
}

.drill-hostname {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
  flex: 1;
}

.drill-version {
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  color: var(--fleet-black-50);
}

.drill-days {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  min-width: 80px;
  text-align: right;
}

.good-news {
  font-size: var(--font-size-sm);
  color: var(--status-good);
  font-weight: 500;
  padding: 7px 0;
}

/* ─── Workers Council drill-down notice ──────── */
.wc-drill-notice {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: var(--status-good-bg);
  border: 1px solid var(--fleet-status-success-border);
  border-radius: var(--radius-large);
  padding: 9px 14px;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--status-good-text);
  margin-top: var(--pad-medium);
}

.wc-drill-notice svg {
  stroke: var(--status-good-text);
  flex-shrink: 0;
}

.patch-movers-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.patch-trend { font-size: var(--font-size-xs); font-weight: 600;
  padding: 2px 7px; border-radius: var(--radius-full); background: var(--fleet-off-white);
}
.patch-trend-arrow { font-weight: 700; }
.patch-trend--faster { color: var(--status-good); }
.patch-trend--slower { color: var(--status-critical); }
.patch-trend--flat { color: var(--fleet-black-50); }

/* small caption used by the software breakdown above the MttpTable */
.section-hint { font-size: var(--font-size-xs); color: var(--fleet-black-50); margin: 0 0 12px; }

/* ─── Responsive ──────────────────────────────── */
@media (max-width: 768px) {
  .usage-tables {
    grid-template-columns: 1fr;
  }
  .patch-stats {
    flex-wrap: wrap;
  }
}
</style>
