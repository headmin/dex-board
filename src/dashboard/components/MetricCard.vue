<template>
  <div class="metric-card">
    <div class="value">{{ formattedValue }}</div>
    <div class="label">{{ label }}</div>
    <div v-if="subtitle" class="subtitle">{{ subtitle }}</div>
    <SkeletonLoader v-if="loading" variant="metric" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SkeletonLoader from './SkeletonLoader.vue'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [Number, String], default: 0 },
  subtitle: { type: String, default: '' },
  loading: { type: Boolean, default: false }
})

const formattedValue = computed(() => {
  if (typeof props.value === 'number') {
    return props.value.toLocaleString()
  }
  return props.value
})
</script>

<style scoped>
.metric-card {
  background: var(--fleet-white);
  border-radius: var(--radius);
  border: 1px solid var(--fleet-black-10);
  padding: var(--pad-large);
}

.value {
  font-family: var(--font-mono);
  font-size: var(--font-size-xxl);
  font-weight: 600;
  color: var(--fleet-black);
  line-height: 1.1;
  margin-bottom: 4px;
}

.label {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--fleet-black-50);
  letter-spacing: 0.2px;
}

.subtitle {
  font-size: var(--font-size-xs);
  color: var(--fleet-black-33);
  margin-top: 2px;
}
</style>
