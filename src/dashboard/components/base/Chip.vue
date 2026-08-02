<template>
  <span class="chip" :class="'chip--' + tone">
    <span v-if="dot" class="chip-dot" aria-hidden="true"></span>
    <slot>
      <span v-if="label" class="chip-label">{{ label }}</span>
      <span v-if="value != null" class="chip-value">{{ value }}</span>
    </slot>
  </span>
</template>

<script setup>
import { TINT_TONES } from '../../composables/statusTones'

defineProps({
  tone: {
    type: String,
    default: 'neutral',
    validator: v => TINT_TONES.includes(v)
  },
  label: { type: String, default: '' },
  value: { type: String, default: null },
  dot: { type: Boolean, default: true }
})
</script>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: var(--chip-height);
  padding: 0 var(--chip-pad-x);
  border-radius: var(--radius-full);
  font-size: var(--chip-font-size);
  font-weight: 500;
  white-space: nowrap;
  border: 1px solid transparent;
}

.chip-dot {
  width: var(--chip-dot-size);
  height: var(--chip-dot-size);
  border-radius: var(--radius-full);
  background: currentColor;
  flex-shrink: 0;
}

.chip-value {
  font-weight: 600;
}

/* ─── Tones ───────────────────────────────────── */
.chip--neutral {
  background: var(--fleet-off-white);
  border-color: var(--fleet-black-10);
  color: var(--fleet-black-75);
}
.chip--neutral .chip-dot {
  background: var(--fleet-black-33);
}
.chip--neutral .chip-value {
  color: var(--fleet-black);
}

.chip--good {
  background: var(--status-good-bg);
  color: var(--status-good-text);
}

.chip--fair {
  background: var(--status-fair-bg);
  color: var(--status-fair-text);
}

.chip--elevated {
  background: var(--status-elevated-bg);
  color: var(--status-elevated-text);
}

.chip--critical {
  background: var(--status-critical-bg);
  color: var(--status-critical-text);
  border-color: var(--status-critical);
}

.chip--info {
  background: var(--info-tint);
  color: var(--fleet-status-info);
}
</style>
