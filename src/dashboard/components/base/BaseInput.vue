<script setup>
defineProps({
  modelValue: {
    type: [String, Number],
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    default: 'text',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <input
    class="base-input"
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="$emit('update:modelValue', $event.target.value)"
  />
</template>

<style scoped>
.base-input {
  width: 100%;
  height: 32px;
  padding: 0 12px;
  box-sizing: border-box;
  background-color: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--fleet-black);
  transition: border-color 100ms ease-in-out;
}

.base-input::placeholder {
  color: var(--fleet-black-50);
}

.base-input:hover {
  border-color: var(--fleet-black-50);
}

.base-input:focus {
  border-color: var(--fleet-black-75);
  outline: none;
  box-shadow: none;
}

.base-input:disabled {
  color: var(--fleet-black-33);
  cursor: not-allowed;
}
</style>
