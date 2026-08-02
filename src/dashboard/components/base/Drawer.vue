<script setup>
import IconButton from './IconButton.vue'

defineProps({
  title: { type: String, default: '' },
})

const emit = defineEmits(['close'])
</script>

<!--
  Standard inline host/detail drawer card. Renders in-flow (like the
  existing .device-drawer sections) — NOT an overlay.
-->
<template>
  <div class="drawer">
    <div class="drawer-header">
      <div class="drawer-heading">
        <div class="drawer-title-row">
          <h2 class="drawer-title">{{ title }}</h2>
          <slot name="meta" />
        </div>
        <div v-if="$slots.subtitle" class="drawer-subtitle">
          <slot name="subtitle" />
        </div>
      </div>
      <div class="drawer-header-right">
        <slot name="actions" />
        <IconButton label="Close" size="small" @click="emit('close')">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </IconButton>
      </div>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.drawer {
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  padding: var(--card-pad);
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--pad-large);
}

.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--pad-small);
  margin-bottom: var(--pad-medium);
}

.drawer-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drawer-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--fleet-black);
}

.drawer-subtitle {
  margin-top: 2px;
  font-size: 13px;
  color: var(--fleet-black-50);
}

.drawer-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

</style>
