<template>
  <div class="empty-state" :class="{ 'empty-state--small': small }">
    <!-- Decorative ghost table backdrop -->
    <div class="ghost-table" aria-hidden="true">
      <div class="ghost-header"></div>
      <div v-for="(w, i) in barWidths" :key="i" class="ghost-row">
        <div class="ghost-col ghost-col--first">
          <div class="ghost-bar" :style="{ width: w + '%' }"></div>
        </div>
        <div class="ghost-col">
          <div class="ghost-bar ghost-bar--thin" :style="{ width: barWidths[(i + 2) % barWidths.length] + '%' }"></div>
        </div>
        <div class="ghost-col">
          <div class="ghost-bar ghost-bar--thin" :style="{ width: barWidths[(i + 3) % barWidths.length] + '%' }"></div>
        </div>
      </div>
    </div>

    <div class="veil" aria-hidden="true"></div>

    <div class="empty-content">
      <div class="empty-title">{{ title }}</div>
      <div v-if="info" class="empty-info">{{ info }}</div>
      <div class="empty-actions">
        <slot name="actions"></slot>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  info: { type: String, default: '' },
  small: { type: Boolean, default: false }
})

/* Deterministic jitter for skeleton bar widths. */
const barWidths = [62, 45, 71, 38, 55]
</script>

<style scoped>
.empty-state {
  position: relative;
  height: 300px;
  background: var(--fleet-white);
  border: 1px solid var(--fleet-black-10);
  border-radius: var(--radius-large);
  overflow: hidden;
}

.empty-state--small {
  height: 200px;
}

/* ─── Ghost table backdrop ────────────────────── */
.ghost-table {
  position: absolute;
  inset: 0;
}

.ghost-header {
  height: 36px;
  background: var(--fleet-off-white);
  border-bottom: 1px solid var(--fleet-black-10);
}

.ghost-row {
  display: flex;
  align-items: center;
  height: 36px;
  border-bottom: 1px solid var(--fleet-black-10);
}

.ghost-col {
  flex: 1;
  padding: 0 14px;
}

.ghost-col--first {
  flex: 0 0 60%;
}

.ghost-bar {
  height: 10px;
  border-radius: var(--radius-full);
  background: var(--fleet-black-10);
}

.ghost-bar--thin {
  height: 8px;
  opacity: 0.6;
}

/* ─── Veil ────────────────────────────────────── */
.veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.55), var(--fleet-white) 78%);
}

/* ─── Content ─────────────────────────────────── */
.empty-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  max-width: 420px;
  margin: auto;
}

.empty-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--fleet-black);
}

.empty-info {
  font-size: 12px;
  color: var(--fleet-black-50);
}

.empty-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.empty-actions:empty {
  display: none;
}
</style>
