<script setup>
defineProps({
  modelValue: {
    type: [String, Number],
    default: '',
  },
  tabs: {
    type: Array,
    default: () => [],
  },
  variant: {
    type: String,
    default: 'pill',
    validator: (v) => ['pill', 'underline'].includes(v),
  },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div class="tabs" :class="`variant--${variant}`" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      class="tabs__tab"
      :class="{ 'is-selected': tab.value === modelValue }"
      type="button"
      role="tab"
      :aria-selected="tab.value === modelValue"
      @click="$emit('update:modelValue', tab.value)"
    >
      <span class="tabs__label" :data-text="tab.label">{{ tab.label }}</span>
      <span v-if="tab.count != null" class="tabs__count">{{ tab.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: inline-flex;
  align-items: center;
}

.tabs__tab {
  display: inline-flex;
  align-items: center;
  border: 0;
  background-color: transparent;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--fleet-black-75);
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--transition-base), background-color var(--transition-base);
}

.tabs__tab:focus-visible {
  outline: 1px solid var(--fleet-focused-outline);
  outline-offset: 1px;
}

/* Reserve bold width to prevent layout shift on selection */
.tabs__label {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}

.tabs__label::before {
  content: attr(data-text);
  display: block;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  font-weight: 600;
}

.tabs__count {
  padding: 1px 10px;
  margin-left: 8px;
  border-radius: var(--radius-full);
  background-color: var(--fleet-green);
  color: var(--fleet-white);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}

/* Pill variant */
.variant--pill {
  gap: 14px;
}

.variant--pill .tabs__tab {
  padding: 5px 8px;
  border-radius: var(--radius-large);
}

.variant--pill .tabs__tab:hover {
  background-color: var(--fleet-black-5);
}

.variant--pill .tabs__tab.is-selected {
  background-color: var(--fleet-black-5);
  color: var(--fleet-black);
  font-weight: 600;
}

/* Underline variant */
.variant--underline {
  gap: 28px;
  border-bottom: 1px solid var(--fleet-black-10);
  padding-bottom: 0;
}

.variant--underline .tabs__tab {
  position: relative;
  padding: 4px 0 12px;
  border-radius: 0;
}

.variant--underline .tabs__tab::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background-color: transparent;
  transition: background-color var(--transition-base);
}

.variant--underline .tabs__tab:hover::after,
.variant--underline .tabs__tab.is-selected::after {
  background-color: var(--fleet-black);
}

.variant--underline .tabs__tab.is-selected {
  color: var(--fleet-black);
  font-weight: 600;
}
</style>
