<template>
  <!-- ─── Why (expanded) — signal panel (design 1a briefing) ──── -->
  <section v-if="expandedCategory" class="signal-breakdown">
    <div class="breakdown-card">
      <div class="breakdown-header">
        <div class="breakdown-title-group">
          <h3 class="breakdown-title">
            {{ expandedCategoryLabel }}<template v-if="category && category.score != null"> ·
            <span :style="{ color: gradeColor(category.grade) }">{{ category.grade }}</span> {{ category.score }}</template>
          </h3>
          <span class="breakdown-count">{{ activeSignals.length }} signal{{ activeSignals.length === 1 ? '' : 's' }}, weighted</span>
          <button type="button" class="method-link" @click="$emit('update:showMethodology', !showMethodology)">
            {{ showMethodology ? 'Hide methodology' : 'How is this scored?' }}
          </button>
        </div>
        <IconButton label="Close" size="small" @click="$emit('close')">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </IconButton>
      </div>

      <!-- Methodology info popup.
           Every formula below restates core-scores.ts (the canonical scoring
           SQL) — if this copy and the SQL disagree, the SQL wins and this
           copy has a bug. Do not describe signals the score doesn't use. -->
      <div v-if="showMethodology" class="methodology-box">
        <div v-if="expandedCategory === 'software'" class="method-content">
          <p><strong>Software = crash frequency 40% + app adoption 35% + installed-app count 25%.</strong></p>
          <p><strong>Crash frequency</strong> counts each host's crashes over 7 days: none scores 100, a single crash 85, sliding to 20 at ten or more. <strong>App adoption</strong> is the share of installed apps opened this week — 80%+ scores 100, under 40% scores 40; shelfware drags it down. <strong>App count</strong> scores lean environments higher: under 80 apps is 100, 160+ is 40.</p>
          <p>The patch-velocity panel below is context for this category — patch speed is <em>not</em> part of the Software score today.</p>
        </div>
        <div v-else-if="expandedCategory === 'performance'" class="method-content">
          <p><strong>Performance = swap pressure 35% + memory compression 30% + largest process 20% + uptime staleness 15%.</strong></p>
          <p><strong>Swap pressure</strong> is the strongest "this machine feels slow" predictor: none scores 100, severe 30. <strong>Compression</strong> is scored gently — macOS compresses aggressively by design, so "high" scores 65, not a failure. <strong>Largest process</strong> looks at the single biggest resident process: under 2 GB scores 100, over 8 GB scores 30. <strong>Uptime</strong> penalizes stale sessions: 14+ days without a reboot scores 30. Thresholds are fixed constants, not fleet-relative.</p>
        </div>
        <div v-else-if="expandedCategory === 'network'" class="method-content">
          <p><strong>Network = Wi-Fi signal (RSSI) 40% + signal-to-noise 30% + transmit rate 20% + VPN confidence 10% — context only, excluded from the composite.</strong></p>
          <p>Values come from each host's latest snapshot, not continuous measurement, and Wi-Fi is volatile — a host that was excellent ten minutes ago may be in a bad spot now. That volatility is why Network is shown for correlation but never scored into the composite.</p>
        </div>
        <div v-else-if="expandedCategory === 'security'" class="method-content">
          <p><strong>Security = FileVault 25% + firewall 20% + Gatekeeper 15% + SIP 10% + OS currency 15% + OS health 15%</strong> for hosts reporting security posture. Posture checks are binary — enabled scores 100, disabled 0.</p>
          <p><strong>OS currency</strong> scores the latest release 100, one behind 70, legacy 20. <strong>OS health</strong> folds uptime risk and crash history into healthy / acceptable / degraded. Hosts without a posture row are scored on the OS pair alone (50/50) so missing telemetry reads as average, never as a failure.</p>
        </div>
        <div v-else class="method-content">
          <p><strong>Device Health = CPU generation 30% + RAM tier 25% + battery health 25% + swap pressure 20%.</strong></p>
          <p><strong>CPU</strong> scores by silicon class: M5 100 down to M1 80, Intel i9 75 down to i5 60. <strong>RAM</strong>: 32 GB+ scores 100, 16 GB 80, 8 GB 50, under 8 GB 30. <strong>Battery</strong>: good 100, degraded 60, replace 20 (hosts without a battery read as good). <strong>Swap</strong> is shared with Performance — sustained swap on capable hardware still signals strain.</p>
        </div>
        <div class="method-footer">
          <p><strong>Composite = 25% Device Health + 35% Performance + 20% Security + 20% Software.</strong> Grades: A ≥ 90 · B ≥ 75 · C ≥ 60 · D ≥ 40 · F below 40.</p>
          <p><strong>Missing data never penalizes:</strong> a host absent from a signal's table scores that signal's neutral default, not zero. The signal bars above summarize each input across the fleet — they contextualize the category score rather than sum to it exactly.</p>
          <p><strong>Platform coverage:</strong> Windows hosts are scored on Security (BitLocker 25% + firewall 20% + Secure Boot 15% + TPM 10% + antivirus 15% + UAC 15%) and Software (crash events only), with composite weights renormalized over what was measured; unmeasured categories show "—".</p>
        </div>
      </div>

      <div class="signal-grid">
        <div v-for="sig in signals" :key="sig.name" class="signal-cell" :class="{ 'signal-cell--inactive': sig.inactive }">
          <div class="signal-cell-head">
            <span class="signal-name">
              {{ sig.name }}
              <Badge v-if="sig.inactive" class="signal-status-badge" tone="fair" label="paused" />
            </span>
            <span class="signal-score" :style="{ color: sig.inactive ? 'var(--fleet-black-33)' : signalBarColor(sig.score) }">{{ sig.inactive ? '—' : sig.score.toFixed(0) }}</span>
          </div>
          <div class="signal-meter">
            <div
              v-if="!sig.inactive"
              class="signal-meter-fill"
              :style="{ width: sig.score + '%', backgroundColor: signalBarColor(sig.score) }"
            ></div>
          </div>
          <span class="signal-caption">
            {{ sig.detail || `${(sig.weight * 100).toFixed(0)}% weight` }}<template v-if="sig.detail"> · {{ (sig.weight * 100).toFixed(0) }}% weight</template>
          </span>
        </div>
      </div>

      <!-- Weakest signal = the biggest single lever. Data-derived, no copy. -->
      <div v-if="weakestSignal" class="lever-callout">
        <span class="lever-text">
          <strong>Biggest single lever:</strong>
          {{ expandedCategoryLabel }} loses most points to
          {{ weakestSignal.name.toLowerCase() }} ({{ weakestSignal.score.toFixed(0) }}/100 at {{ (weakestSignal.weight * 100).toFixed(0) }}% weight)<template v-if="weakestSignal.detail"> — {{ weakestSignal.detail }}</template>.
        </span>
        <router-link to="/hosts" custom v-slot="{ navigate }">
          <BaseButton variant="secondary" size="small" @click="navigate">View hosts</BaseButton>
        </router-link>
      </div>

      <!-- ─── Software Detail: Patch Velocity + Usage Tables ──── -->
      <slot />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import BaseButton from '../base/BaseButton.vue'
import IconButton from '../base/IconButton.vue'
import Badge from '../base/Badge.vue'
import { palette } from '../../composables/uiPalette'
import { gradeColor } from '../../composables/gradeColors'

const props = defineProps({
  expandedCategory: { type: String, default: null },
  expandedCategoryLabel: { type: String, default: '' },
  /** The expanded category object ({ grade, score }) for the panel title. */
  category: { type: Object, default: null },
  signals: { type: Array, default: () => [] },
  showMethodology: { type: Boolean, default: false },
})

defineEmits(['update:showMethodology', 'close'])

const activeSignals = computed(() => props.signals.filter(s => !s.inactive))

// Lowest score × meaningful weight = where the points are actually going.
const weakestSignal = computed(() => {
  const active = activeSignals.value.filter(s => s.score != null)
  if (!active.length) return null
  const worst = active.reduce((a, b) => (b.score < a.score ? b : a))
  return worst.score < 75 ? worst : null
})

// Mockup convention for BAR FILLS: green -> gold -> orange -> red on the
// canonical scale (full green from 75 up — not scoreBandColor's split band).
function signalBarColor(score) {
  if (score >= 75) return palette.good
  if (score >= 60) return palette.fair
  if (score >= 40) return palette.elevated
  return palette.critical
}
</script>

<style scoped>
/* Expanded panel echoes the expanded card: 2px ink border */
.breakdown-card {
  background: var(--fleet-white);
  border: 2px solid var(--fleet-black);
  border-radius: var(--radius-large);
  padding: var(--pad-large) var(--pad-xlarge);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.breakdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.breakdown-title-group {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.breakdown-title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: 700;
  color: var(--fleet-black);
}

.breakdown-count {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-50);
}

.method-link {
  border: 0;
  background: none;
  padding: 0;
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black-75);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.method-link:hover { color: var(--fleet-black); }

/* ─── Methodology info box ────────────────────── */
.methodology-box {
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--pad-medium);
}

.method-content p {
  font-size: var(--font-size-sm);
  color: var(--fleet-black-75);
  line-height: 1.5;
  margin: 0 0 7px 0;
}
.method-content p:last-child { margin-bottom: 0; }
.method-content strong { color: var(--fleet-black); }

.method-footer {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--fleet-black-10);
}
.method-footer p {
  font-size: var(--font-size-xxsmall);
  color: var(--fleet-black-50);
  line-height: 1.5;
  margin: 0 0 5px 0;
}
.method-footer p:last-child { margin-bottom: 0; }
.method-footer strong { color: var(--fleet-black-75); }

/* ─── Signal grid: one cell per signal ────────── */
.signal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 20px;
}

.signal-cell {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.signal-cell--inactive { opacity: 0.55; }

.signal-cell-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.signal-name {
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--fleet-black-75);
}

.signal-score {
  font-size: 15px;
  font-weight: 700;
}

.signal-meter {
  height: 6px;
  background: var(--fleet-black-5);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.signal-meter-fill {
  height: 100%;
  transition: width 400ms ease-out;
}

.signal-caption {
  font-size: var(--font-size-xxsmall);
  color: var(--fleet-black-50);
}

.signal-status-badge { margin-left: 4px; vertical-align: middle; }

/* ─── Lever callout ───────────────────────────── */
.lever-callout {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--fleet-off-white);
  border-radius: var(--radius-medium);
}

.lever-text {
  font-size: var(--font-size-base);
  color: var(--fleet-black-75);
  text-wrap: pretty;
}
.lever-text strong { color: var(--fleet-black); }

.lever-callout > :last-child { margin-left: auto; flex-shrink: 0; }
</style>
