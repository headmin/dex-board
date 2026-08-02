<script setup>
import { onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: 'Search…',
  },
  debounce: {
    type: Number,
    default: 300,
  },
})

const emit = defineEmits(['update:modelValue', 'search'])

let timer = null

function onInput(event) {
  const value = event.target.value
  emit('update:modelValue', value)
  clearTimeout(timer)
  timer = setTimeout(() => emit('search', value), props.debounce)
}

function clear() {
  clearTimeout(timer)
  emit('update:modelValue', '')
  emit('search', '')
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="search-input">
    <svg
      class="search-input__icon"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.5" />
      <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
    <input
      class="search-input__field"
      type="text"
      :value="modelValue"
      :placeholder="placeholder"
      @input="onInput"
    />
    <button
      v-if="modelValue"
      class="search-input__clear"
      type="button"
      aria-label="Clear search"
      @click="clear"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.search-input {
  position: relative;
  width: 100%;
}

.search-input__icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--fleet-black-50);
  transition: color var(--transition-base);
  pointer-events: none;
}

.search-input:focus-within .search-input__icon {
  color: var(--fleet-black);
}

.search-input__field {
  width: 100%;
  height: 32px;
  padding: 0 32px;
  box-sizing: border-box;
  background-color: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius);
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--fleet-black);
  transition: border-color 100ms ease-in-out;
}

.search-input__field::placeholder {
  color: var(--fleet-black-50);
}

.search-input__field:hover {
  border-color: var(--fleet-black-50);
}

.search-input__field:focus {
  border-color: var(--fleet-black-75);
  outline: none;
  box-shadow: none;
}

.search-input__clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background-color: transparent;
  color: var(--fleet-black-50);
  cursor: pointer;
  transition: color var(--transition-base), background-color var(--transition-base);
}

.search-input__clear:hover {
  background-color: var(--fleet-black-5);
  color: var(--fleet-black);
}

.search-input__clear:focus-visible {
  outline: 1px solid var(--fleet-focused-outline);
  outline-offset: 1px;
}
</style>
