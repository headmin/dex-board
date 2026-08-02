<template>
  <div class="gauge-bar">
    <div class="gauge-bar-fill" :style="fillStyle"></div>
    <div
      v-if="marker != null"
      class="gauge-bar-marker"
      :style="{ left: markerLeft }"
      aria-hidden="true"
    ></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 },
  color: { type: String, default: null },
  marker: { type: Number, default: null }
})

/* Utilization semantics: higher = worse. */
function utilizationColor(v) {
  if (v >= 70) return 'var(--status-critical)'
  if (v >= 50) return 'var(--status-elevated)'
  if (v >= 30) return 'var(--status-fair)'
  return 'var(--status-good)'
}

const fillStyle = computed(() => {
  const v = Math.max(0, Math.min(100, Number(props.value) || 0))
  return {
    width: v + '%',
    background: props.color || utilizationColor(v)
  }
})

const markerLeft = computed(() => {
  const m = Math.max(0, Math.min(100, Number(props.marker) || 0))
  return m + '%'
})
</script>

<style scoped>
.gauge-bar {
  position: relative;
  width: 100%;
  height: v-bind(height);
  background: var(--fleet-black-10);
  border-radius: var(--radius-full);
  overflow: visible;
}

.gauge-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 400ms ease-out;
}

.gauge-bar-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--fleet-black-33);
}
</style>
