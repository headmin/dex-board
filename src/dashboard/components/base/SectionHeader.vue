<template>
  <div class="section-header">
    <h2 class="section-title">{{ title }}</h2>
    <span v-if="caption" class="section-caption">{{ caption }}</span>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  caption: { type: String, default: '' }
})
</script>

<style scoped>
.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0;
}

.section-caption {
  display: block;
  font-size: 13px;
  color: var(--fleet-black-75);
  margin-top: 2px;
}
</style>
