<template>
  <!-- ─── Endpoint security-exposure delta (board callout, selectable window) ── -->
  <section class="exposure-section" :class="`exposure-section--${exposureView.dir}`">
    <div class="exposure-main">
      <div class="exposure-eyebrow-row">
        <span class="exposure-eyebrow">Endpoint exposure vs {{ exposureDays }} days ago</span>
        <SegmentedControl
          :modelValue="exposureDays"
          :options="exposureWindowOptions"
          aria-label="Comparison window"
          @update:modelValue="$emit('update:exposureDays', $event)"
        />
      </div>
      <span v-if="loading" class="exposure-headline">Loading…</span>
      <span v-else class="exposure-headline">{{ exposureView.headline }}</span>
      <span class="exposure-detail">{{ exposureView.detail }}</span>
      <div v-if="exposureSignals.length" class="exposure-signals">
        <span v-for="s in exposureSignals" :key="s.key" class="exposure-signal">
          <span class="exposure-signal-label">{{ s.label }}</span>
          <span class="exposure-signal-now">{{ s.now }}%</span>
          <span v-if="s.delta !== null && s.delta !== 0"
                class="exposure-signal-delta"
                :class="s.delta < 0 ? 'sig-worse' : 'sig-better'">{{ s.delta > 0 ? '+' : '' }}{{ s.delta }}</span>
        </span>
      </div>
    </div>
    <div v-if="exposureView.available" class="exposure-delta" :class="`exposure-delta--${exposureView.dir}`">
      <span class="exposure-delta-arrow">{{ exposureView.dir === 'worse' ? '▼' : exposureView.dir === 'better' ? '▲' : '▬' }}</span>
      <span class="exposure-delta-val">{{ exposureView.delta > 0 ? '+' : '' }}{{ exposureView.delta }}</span>
      <span class="exposure-delta-unit">pts</span>
    </div>
    <p class="exposure-caption">
      "Exposure" here is endpoint security posture only (FileVault, firewall, Gatekeeper,
      SIP, OS currency) — not application, network, or cloud attack surface.
    </p>
  </section>
</template>

<script setup>
import SegmentedControl from '../base/SegmentedControl.vue'

defineProps({
  exposureView: { type: Object, required: true },
  exposureSignals: { type: Array, default: () => [] },
  exposureDays: { type: Number, required: true },
  exposureWindowOptions: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

defineEmits(['update:exposureDays'])
</script>

<style scoped>
/* ─── 90-day endpoint security-exposure callout ─── */
.exposure-section {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "main delta" "caption caption";
  align-items: center;
  gap: 4px 18px;
  padding: 14px 18px;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
}
.exposure-section--worse { border-color: var(--status-critical-soft); background: var(--status-critical-bg); }
.exposure-section--better { border-color: var(--status-good); background: var(--status-good-bg); }
.exposure-main { grid-area: main; display: flex; flex-direction: column; gap: 2px; }
.exposure-eyebrow-row {
  display: flex;
  align-items: center;
  gap: 11px;
  flex-wrap: wrap;
  margin-bottom: 2px;
}
.exposure-eyebrow {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--fleet-black-75);
}
.exposure-headline { font-size: var(--font-size-md); font-weight: 600; color: var(--fleet-black); }
.exposure-detail { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.exposure-signals { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.exposure-signal {
  display: inline-flex; align-items: baseline; gap: 5px; font-size: var(--font-size-xs);
  background: var(--fleet-off-white); border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius); padding: 2px 7px;
}
.exposure-signal-label { color: var(--fleet-black-50); }
.exposure-signal-now { font-weight: 700; color: var(--fleet-black-75); }
.exposure-signal-delta { font-weight: 700; }
.exposure-signal-delta.sig-worse { color: var(--status-critical); }
.exposure-signal-delta.sig-better { color: var(--status-good); }
.exposure-delta {
  grid-area: delta;
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-family: var(--font-mono);
  font-weight: 700;
}
.exposure-delta--worse { color: var(--status-critical); }
.exposure-delta--better { color: var(--status-good); }
.exposure-delta--flat { color: var(--fleet-black-50); }
.exposure-delta-arrow { font-size: var(--font-size-md); }
.exposure-delta-val { font-size: var(--font-size-xl, 28px); }
.exposure-delta-unit { font-size: var(--font-size-sm); color: var(--fleet-black-50); }
.exposure-caption {
  grid-area: caption;
  margin: 4px 0 0;
  font-size: var(--font-size-xs);
  color: var(--fleet-black-50);
  line-height: 1.4;
}
</style>
