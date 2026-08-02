<template>
  <div class="meter-bar">
    <div class="meter-bar-fill" :style="fillStyle"></div>
    <div
      v-if="marker != null"
      class="meter-bar-marker"
      :style="{ left: markerLeft }"
      aria-hidden="true"
    ></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { scoreBandColor } from '../../composables/gradeColors'
import { utilizationColor } from '../../composables/statusTones'

/**
 * The one horizontal meter. `semantics` names the value's direction so the
 * auto-color can't be applied backwards:
 *   score       higher = better  (scoreBandColor)
 *   utilization higher = worse   (utilizationColor)
 *   none        no auto-color — `color` is required
 * `color` overrides the auto-color in any mode.
 */
const props = defineProps({
  value: { type: Number, default: 0 },
  semantics: {
    type: String,
    default: 'utilization',
    validator: v => ['score', 'utilization', 'none'].includes(v)
  },
  color: { type: String, default: null },
  /** Reference tick (e.g. peak vs average) — position in 0–100. */
  marker: { type: Number, default: null },
  /** Track height. Defaults by context: score rows 10px, gauges 12px. */
  height: { type: String, default: null }
})

const trackHeight = computed(() =>
  props.height || (props.semantics === 'score' ? 'var(--bar-height)' : 'var(--gauge-track-height)')
)

const fillStyle = computed(() => {
  const v = Math.max(0, Math.min(100, Number(props.value) || 0))
  let auto = 'var(--fleet-black-25)'
  if (props.semantics === 'score') auto = scoreBandColor(props.value)
  else if (props.semantics === 'utilization') auto = utilizationColor(v)
  return {
    width: v + '%',
    background: props.color || auto
  }
})

const markerLeft = computed(() => {
  const m = Math.max(0, Math.min(100, Number(props.marker) || 0))
  return m + '%'
})
</script>

<style scoped>
.meter-bar {
  position: relative;
  width: 100%;
  height: v-bind(trackHeight);
  background: var(--fleet-black-10);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.meter-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 400ms ease-out;
}

.meter-bar-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--fleet-black-33);
}
</style>
