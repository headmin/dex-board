<script setup>
import { ref, onMounted, onBeforeUnmount, toRef } from 'vue'
import IconButton from './IconButton.vue'
import { useFocusTrap } from '../../composables/useFocusTrap'

const props = defineProps({
  title: { type: String, default: '' },
  // Panel width in px; clamped by max-width 92vw.
  width: { type: Number, default: 650 },
  // When false the modal renders nothing at all.
  open: { type: Boolean, default: true },
})

const emit = defineEmits(['close'])

const panelRef = ref(null)
useFocusTrap(panelRef, toRef(props, 'open'))

function onKeydown(e) {
  if (e.key === 'Escape' && props.open) emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="emit('close')">
      <div
        ref="panelRef"
        class="modal-panel"
        :style="{ width: width + 'px' }"
        role="dialog"
        aria-modal="true"
      >
        <div class="modal-header">
          <h2 class="modal-title">{{ title }}</h2>
          <IconButton label="Close" size="small" class="modal-close" @click="emit('close')">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </IconButton>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(25, 33, 71, 0.4);
  z-index: 1000;
  overflow-y: auto;
  animation: modal-fade-in 150ms ease-out;
}

.modal-panel {
  background: var(--fleet-white);
  border-radius: var(--radius-large);
  padding: var(--pad-xlarge);
  max-width: 92vw;
  max-height: 86vh;
  overflow: auto;
  margin: 48px auto 0;
  animation: modal-scale-up 150ms ease-out;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--pad-small);
  padding-bottom: var(--pad-small);
  border-bottom: 1px solid var(--fleet-black-10);
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--fleet-black);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.modal-close {
  flex-shrink: 0;
}

.modal-body {
  margin-top: var(--pad-large);
  font-size: 13px;
}

.modal-footer {
  display: flex;
  flex-direction: row-reverse;
  gap: 8px;
  margin-top: var(--pad-large);
}

@keyframes modal-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modal-scale-up {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
