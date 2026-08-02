<template>
  <!-- ─── Signal Breakdown (appears when category card clicked) ── -->
  <section v-if="expandedCategory" class="signal-breakdown">
    <div class="chart-container">
      <div class="breakdown-header">
        <h3>{{ expandedCategoryLabel }} — Signal Breakdown</h3>
        <div class="breakdown-actions">
          <BaseButton size="small" @click="$emit('update:showMethodology', !showMethodology)">
            {{ showMethodology ? 'Hide' : 'How is this scored?' }}
          </BaseButton>
          <BaseButton size="small" @click="$emit('close')">Close</BaseButton>
        </div>
      </div>

      <!-- Methodology info popup -->
      <div v-if="showMethodology" class="methodology-box">
        <div v-if="expandedCategory === 'software'" class="method-content">
          <p><strong>Patch Velocity</strong> measures the gap between when a patch first appears on any fleet host and when each host applies it. The first host to update sets the "available" date — we then track how many days each other host trails behind. Faster patching = higher score.</p>
          <p><strong>Software Usage</strong> compares install time vs. last-opened time to classify every app as daily active, weekly, monthly, or shelfware (90+ days unopened). System utilities (Activity Monitor, Disk Utility, Font Book, etc.) are excluded — they're always installed but rarely opened, so counting them as shelfware would be misleading. Only user-installed and productivity apps are scored.</p>
        </div>
        <div v-else-if="expandedCategory === 'performance'" class="method-content">
          <p>Scores are computed from real-time telemetry: memory pressure, disk utilization, top-5 process memory footprint, and days since last reboot. Each signal is weighted and scored against fleet-wide thresholds.</p>
        </div>
        <div v-else-if="expandedCategory === 'network'" class="method-content">
          <p>WiFi signal strength (RSSI), noise floor, and transmit rate are measured continuously. Scores reflect connection quality — not bandwidth tests — because poor WiFi is the #1 cause of perceived "slow computer" complaints.</p>
        </div>
        <div v-else-if="expandedCategory === 'security'" class="method-content">
          <p>Binary compliance checks: is disk encrypted, firewall on, SIP enabled, Gatekeeper active? Plus OS currency — hosts behind on updates carry known vulnerabilities. Each signal is weighted by risk severity.</p>
        </div>
        <div v-else class="method-content">
          <p>Hardware capability scoring: disk capacity for storage headroom and estimated hardware age. Older hardware with limited storage directly impacts employee productivity.</p>
        </div>
      </div>

      <div class="signal-list">
        <div v-for="sig in signals" :key="sig.name" class="signal-row" :class="{ 'signal-row--inactive': sig.inactive }">
          <div class="signal-info">
            <span class="signal-name">
              {{ sig.name }}
              <Badge v-if="sig.type" class="signal-type-badge" :tone="sig.type === 'config' ? 'info' : 'good'" :label="sig.type === 'config' ? 'config' : 'time'" />
              <Badge v-if="sig.inactive" class="signal-status-badge" tone="fair" label="paused" />
            </span>
            <span class="signal-weight">{{ (sig.weight * 100).toFixed(0) }}% weight</span>
            <span v-if="sig.detail" class="signal-detail">{{ sig.detail }}</span>
          </div>
          <div class="signal-bar-track">
            <div
              v-if="!sig.inactive"
              class="signal-bar-fill"
              :style="{ width: sig.score + '%', backgroundColor: signalBarColor(sig.score) }"
            ></div>
            <div v-else class="signal-bar-empty">no data</div>
          </div>
          <span class="signal-score">{{ sig.inactive ? '—' : sig.score.toFixed(0) }}</span>
        </div>
      </div>

      <!-- ─── Software Detail: Patch Velocity + Usage Tables ──── -->
      <slot />
    </div>
  </section>
</template>

<script setup>
import BaseButton from '../base/BaseButton.vue'
import Badge from '../base/Badge.vue'
import { palette } from '../../composables/uiPalette'

defineProps({
  expandedCategory: { type: String, default: null },
  expandedCategoryLabel: { type: String, default: '' },
  signals: { type: Array, default: () => [] },
  showMethodology: { type: Boolean, default: false },
})

defineEmits(['update:showMethodology', 'close'])

// Mockup convention for BAR FILLS (score breakdown): the good band is brand
// green — never navy. Green -> gold -> orange -> red on the canonical scale.
// NOT gradeColors.scoreBandColor: that splits the green band (soft green for
// 75–89, full green only at 90+), while these bars stay full green from 75 up.
function signalBarColor(score) {
  if (score >= 75) return palette.good
  if (score >= 60) return palette.fair
  if (score >= 40) return palette.elevated
  return palette.critical
}
</script>

<style scoped>
/* ─── Signal breakdown ────────────────────────── */
.signal-breakdown .chart-container {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-large);
  box-shadow: var(--box-shadow);
}

.breakdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--pad-medium);
}

.breakdown-header h3 {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--fleet-black);
}

.breakdown-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

/* ─── Methodology info box ────────────────────── */
.methodology-box {
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-medium);
  margin-bottom: var(--pad-medium);
}

.method-content p {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  line-height: 1.5;
  margin: 0 0 7px 0;
}

.method-content p:last-child {
  margin-bottom: 0;
}

.method-content strong {
  color: var(--fleet-black);
}

.signal-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.signal-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.signal-info {
  width: 280px;
  min-width: 280px;
  flex-shrink: 0;
}

.signal-name {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black);
}

.signal-weight {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--fleet-black-75);
}

/* Score bars (comparative, per the Score-breakdown mockup): thin trackless
   pills — the color stops at the value. Gauges keep tracks; these don't. */
.signal-bar-track {
  flex: 1;
  height: var(--bar-height);
  background: var(--fleet-black-10);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.signal-bar-fill {
  height: 100%;
  border-radius: var(--radius);
  transition: width 400ms ease-out;
}

.signal-detail {
  display: block;
  font-size: 10px;
  color: var(--fleet-black-33);
  font-style: italic;
}

.signal-score {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black);
  min-width: 32px;
  text-align: right;
}

.signal-row--inactive {
  opacity: 0.55;
}

.signal-row--inactive .signal-score {
  color: var(--fleet-black-33);
}

.signal-bar-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 10px;
  color: var(--fleet-black-33);
  font-style: italic;
  /* the track itself is transparent (score bars are trackless) — paused rows
     get their own soft strip so "no data" doesn't float in whitespace */
  background: var(--fleet-black-5);
  border-radius: var(--radius-full);
}

.signal-name .signal-type-badge {
  margin-left: 5px;
  vertical-align: middle;
}

.signal-name .signal-status-badge {
  margin-left: 4px;
  vertical-align: middle;
}

/* ─── Responsive ──────────────────────────────── */
@media (max-width: 768px) {
  .signal-row {
    flex-direction: column;
    align-items: stretch;
  }
  .signal-info {
    min-width: 0;
  }
}
</style>
