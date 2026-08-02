<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: '',
  },
  options: {
    type: Array,
    default: () => [],
  },
})

defineEmits(['update:modelValue'])

const normalizedOptions = computed(() =>
  props.options.map((option) =>
    typeof option === 'object' && option !== null
      ? option
      : { value: option, label: String(option) }
  )
)
</script>

<template>
  <div class="segmented-control" role="group">
    <button
      v-for="option in normalizedOptions"
      :key="option.value"
      class="segmented-control__segment"
      :class="{ 'is-selected': option.value === modelValue }"
      type="button"
      :aria-pressed="option.value === modelValue"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented-control {
  display: inline-flex;
  height: var(--toggle-height);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--toggle-radius);
  overflow: hidden;
  background-color: var(--fleet-white);
  box-sizing: content-box;
}

.segmented-control__segment {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--toggle-seg-pad-x);
  border: 0;
  border-right: 1px solid var(--fleet-black-10);
  background-color: transparent;
  font-family: var(--font-body);
  font-size: var(--toggle-font-size);
  font-weight: 500;
  color: var(--fleet-black-75);
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--transition-base), background-color var(--transition-base);
}

.segmented-control__segment:last-child {
  border-right: none;
}

.segmented-control__segment:hover {
  background-color: var(--fleet-black-5);
}

.segmented-control__segment:focus { outline: none; }

.segmented-control__segment:focus-visible {
  outline: 1px solid var(--fleet-focused-outline);
  outline-offset: -1px;
}

.segmented-control__segment.is-selected {
  background-color: var(--fleet-black-10);
  color: var(--fleet-black);
  font-weight: 600;
}
</style>
