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
  background: #e8f8f0;
  color: #1a7a4c;
}

.grade-b {
  background: #e8f0fe;
  color: #2d5fba;
}

.grade-c {
  background: #fef9e8;
  color: #9a7b1a;
}

.grade-d {
  background: #fef0e8;
  color: #b05c1a;
}

.grade-f {
  background: #fee8ec;
  color: #b01a3a;
}

.grade-incomplete {
  background: var(--fleet-black-5);
  color: var(--fleet-black-50);
}
</style>
