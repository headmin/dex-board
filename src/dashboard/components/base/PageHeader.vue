<template>
  <div class="page-header">
    <div class="page-header-left">
      <h1 class="page-title">{{ title }}</h1>
      <div v-if="subtitle" class="page-subtitle">{{ subtitle }}</div>
    </div>
    <div class="page-header-actions">
      <slot name="actions"></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' }
})
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
}

.page-header-left {
  display: flex;
  flex-direction: column;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0;
}

.page-subtitle {
  font-size: 13px;
  color: var(--fleet-black-75);
  margin-top: 2px;
}

.page-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
