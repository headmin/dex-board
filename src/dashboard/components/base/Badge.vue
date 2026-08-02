<template>
  <span class="badge" :class="'badge--' + tone">
    <slot>{{ label }}</slot>
  </span>
</template>

<script setup>
defineProps({
  tone: {
    type: String,
    default: 'neutral',
    validator: v => ['neutral', 'good', 'fair', 'elevated', 'critical', 'info'].includes(v)
  },
  label: { type: String, default: '' }
})
</script>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 2px 6px;
  border-radius: var(--radius);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.badge--neutral {
  background: var(--fleet-black-10);
  color: var(--fleet-black-75);
}

.badge--good {
  background: var(--status-good-bg);
  color: var(--status-good-text);
}

.badge--fair {
  background: var(--status-fair-bg);
  color: var(--status-fair-text);
}

.badge--elevated {
  background: var(--status-elevated-bg);
  color: var(--status-elevated);
}

.badge--critical {
  background: var(--status-critical-bg);
  color: var(--status-critical);
}

.badge--info {
  background: var(--info-tint);
  color: var(--fleet-status-info);
}
</style>
