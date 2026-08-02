<script setup>
import IconButton from './IconButton.vue'

defineProps({
  title: { type: String, required: true },
})

const emit = defineEmits(['close'])
</script>

<!--
  Generic expandable drill-down section. Neutral replacement for the
  repeated .drill-section blocks in FirehoseExperience.vue (which those
  views can adopt in a later wave).
-->
<template>
  <section class="drill-panel">
    <div class="drill-panel-header">
      <h3 class="drill-panel-title">{{ title }}</h3>
      <div class="drill-panel-actions">
        <slot name="actions" />
        <IconButton label="Close" size="small" @click="emit('close')">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </IconButton>
      </div>
    </div>
    <slot />
  </section>
</template>

<style scoped>
.drill-panel {
  background: var(--fleet-off-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--card-pad);
  margin-bottom: var(--pad-large);
}

.drill-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pad-small);
  margin-bottom: var(--pad-small);
}

.drill-panel-title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: 700;
  color: var(--fleet-black);
}

.drill-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

</style>
