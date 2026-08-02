<template>
  <div class="score-bar" :style="{ height: height }">
    <div class="score-bar-fill" :style="fillStyle"></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { scoreBandColor } from '../../composables/gradeColors'

const props = defineProps({
  value: { type: Number, default: 0 },
  color: { type: String, default: null },
  height: { type: String, default: 'var(--bar-height)' }
})

const fillStyle = computed(() => {
  const v = Math.max(0, Math.min(100, Number(props.value) || 0))
  return {
    width: v + '%',
    background: props.color || scoreBandColor(props.value)
  }
})
</script>

<style scoped>
.score-bar {
  width: 100%;
  background: var(--fleet-black-10);
}

.score-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 400ms ease-out;
}
</style>
