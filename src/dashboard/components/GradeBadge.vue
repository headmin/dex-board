<template>
  <span class="grade-badge" :class="gradeClass">{{ grade }}</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  grade: { type: String, required: true }
})

const gradeClass = computed(() => {
  const g = props.grade?.toUpperCase()
  if (g === 'A') return 'grade-a'
  if (g === 'B') return 'grade-b'
  if (g === 'C') return 'grade-c'
  if (g === 'D') return 'grade-d'
  if (g === 'F') return 'grade-f'
  return 'grade-incomplete'
})
</script>

<style scoped>
.grade-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--radius);
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.5px;
}

.grade-a {
  background: var(--status-good-bg);
  color: var(--status-good-text);
}

.grade-b {
  background: var(--status-good-bg);
  color: var(--status-good-text);
}

.grade-c {
  background: var(--status-fair-bg);
  color: var(--status-fair-text);
}

.grade-d {
  background: #fef0e8;
  color: var(--fleet-ui-orange);
}

.grade-f {
  background: #fee8ec;
  color: var(--fleet-status-error);
}

.grade-incomplete {
  background: var(--fleet-black-5);
  color: var(--fleet-black-50);
}
</style>
