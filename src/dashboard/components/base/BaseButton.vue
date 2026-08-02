<script setup>
defineProps({
  variant: {
    type: String,
    default: 'secondary',
    validator: (v) => ['primary', 'secondary', 'subdued', 'link'].includes(v),
  },
  size: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'small'].includes(v),
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  type: {
    type: String,
    default: 'button',
  },
})

defineEmits(['click'])
</script>

<template>
  <button
    class="base-button"
    :class="[`variant--${variant}`, `size--${size}`]"
    :type="type"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <span v-if="$slots.icon" class="base-button__icon">
      <slot name="icon" />
    </span>
    <slot />
  </button>
</template>

<style scoped>
.base-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--radius);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--transition-base), background-color var(--transition-base), border-color var(--transition-base);
}

.base-button:focus-visible {
  outline: 1px solid var(--fleet-focused-outline);
  outline-offset: 1px;
}

.base-button:disabled {
  opacity: 0.5;
  filter: grayscale(0.5);
  pointer-events: none;
}

.base-button__icon {
  display: inline-flex;
  align-items: center;
}

.size--small {
  height: 26px;
  padding: 0 10px;
}

/* Primary */
.variant--primary {
  background-color: var(--fleet-green);
  color: var(--fleet-white);
}
.variant--primary:hover {
  background-color: var(--fleet-green-over);
}
.variant--primary:active {
  background-color: var(--fleet-green-down);
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

/* Subdued */
.variant--subdued {
  background-color: transparent;
  color: var(--fleet-black-75);
}
.variant--subdued:hover {
  background-color: var(--fleet-black-5);
}
.variant--subdued:active {
  background-color: var(--fleet-black-10);
}

/* Link */
.variant--link {
  background-color: transparent;
  padding: 0;
  height: auto;
  color: var(--link-color);
  font-weight: 600;
  font-size: inherit;
  text-decoration: none;
}
.variant--link:hover {
  color: var(--link-color-hover);
}
</style>
