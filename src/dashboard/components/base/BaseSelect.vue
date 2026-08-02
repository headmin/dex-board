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
  disabled: {
    type: Boolean,
    default: false,
  },
  placeholder: {
    type: String,
    default: '',
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
  <div class="base-select">
    <select
      class="base-select__field"
      :value="modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option
        v-for="option in normalizedOptions"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
    <svg
      class="base-select__chevron"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </div>
</template>

<style scoped>
.base-select {
  position: relative;
  width: 100%;
}

.base-select__field {
  width: 100%;
  height: 32px;
  padding: 0 28px 0 12px;
  box-sizing: border-box;
  appearance: none;
  -webkit-appearance: none;
  background-color: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--fleet-black);
  cursor: pointer;
  transition: border-color 100ms ease-in-out;
}

.base-select__field:hover {
  border-color: var(--fleet-black-50);
}

.base-select__field:focus {
  border-color: var(--fleet-black-75);
  outline: none;
  box-shadow: none;
}

.base-select__field:disabled {
  color: var(--fleet-black-33);
  cursor: not-allowed;
}

.base-select__chevron {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--fleet-black-75);
}
</style>
