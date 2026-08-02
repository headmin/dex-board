<script setup>
defineProps({
  label: {
    type: String,
    required: true,
  },
  size: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'small'].includes(v),
  },
  variant: {
    type: String,
    default: 'subdued',
    validator: (v) => ['subdued', 'secondary'].includes(v),
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['click'])
</script>

<template>
  <button
    class="icon-button"
    :class="[`variant--${variant}`, `size--${size}`]"
    type="button"
    :aria-label="label"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background-color: transparent;
  cursor: pointer;
  transition: color var(--transition-base), background-color var(--transition-base), border-color var(--transition-base);
}

.icon-button:focus-visible {
  outline: 1px solid var(--fleet-focused-outline);
  outline-offset: 1px;
}

.icon-button:disabled {
  opacity: 0.5;
  filter: grayscale(0.5);
  pointer-events: none;
}

.size--small {
  width: 26px;
  height: 26px;
}

/* Subdued */
.variant--subdued {
  color: var(--fleet-black-75);
}
.variant--subdued:hover {
  background-color: var(--fleet-black-5);
}
.variant--subdued:active {
  background-color: var(--fleet-black-10);
}

/* Secondary */
.variant--secondary {
  background-color: var(--fleet-off-white);
  color: var(--fleet-black-75);
  border: 1px solid var(--fleet-black-25);
  box-sizing: border-box;
}
.variant--secondary:hover {
  background-color: var(--fleet-black-5);
}
.variant--secondary:active {
  background-color: var(--fleet-black-10);
}
</style>
