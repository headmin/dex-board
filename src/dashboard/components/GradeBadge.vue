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
  min-width: var(--grade-badge-size);
  width: var(--grade-badge-size);
  height: var(--grade-badge-size);
  padding: 0;
  border-radius: var(--grade-badge-radius);
  font-family: var(--font-body);
  font-size: var(--grade-badge-font-size);
  font-weight: 700;
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
