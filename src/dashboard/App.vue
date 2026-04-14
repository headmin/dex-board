<template>
  <div id="app" class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="brand-dot"></div>
        <span class="brand-name">DEX Board</span>
      </div>
      <nav class="sidebar-nav">
        <router-link to="/" class="nav-item" exact-active-class="active">
          <span class="nav-icon">&#9670;</span> Experience
        </router-link>
        <router-link to="/experience-details" class="nav-item" active-class="active">
          <span class="nav-icon">&#9670;</span> Exp. Details
        </router-link>
        <router-link to="/devices" class="nav-item" active-class="active">
          <span class="nav-icon">&#9670;</span> Devices
        </router-link>
        <router-link to="/insights" class="nav-item" active-class="active">
          <span class="nav-icon">&#9670;</span> Insights
        </router-link>
        <router-link to="/reports" class="nav-item" active-class="active">
          <span class="nav-icon">&#9670;</span> Reports
        </router-link>
        <router-link to="/timeline" class="nav-item" active-class="active">
          <span class="nav-icon">&#9632;</span> Timeline
        </router-link>
        <router-link to="/changeboard" class="nav-item" active-class="active">
          <span class="nav-icon">&#9632;</span> Changeboard
        </router-link>
        <div class="nav-group">
          <span class="nav-group-label">Admin</span>
          <router-link to="/overview" class="nav-item sub" active-class="active">
            <span class="nav-icon">&#9656;</span> Overview
          </router-link>
          <router-link to="/audit" class="nav-item sub" active-class="active">
            <span class="nav-icon">&#9656;</span> Audit log
          </router-link>
          <router-link to="/raw" class="nav-item sub" active-class="active">
            <span class="nav-icon">&#9656;</span> Raw data
          </router-link>
        </div>
      </nav>
    </aside>
    <main class="main-content">
      <FleetFilterBar />
      <div v-if="wcMode" class="wc-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Workers Council Approved
      </div>
      <router-view />
    </main>
  </div>
</template>

<script setup>
import FleetFilterBar from './components/FleetFilterBar.vue'
import { useWorkersCouncil } from './composables/useWorkersCouncil'

const { wcMode } = useWorkersCouncil()
</script>

<style>
.app-layout {
  display: flex;
  min-height: 100vh;
  background: var(--fleet-off-white);
}

/* ── Sidebar ─────────────────────────────────── */
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  padding: var(--pad-large) 0;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 var(--pad-large);
  margin-bottom: var(--pad-xlarge);
}

.brand-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--fleet-green);
}

.brand-name {
  font-family: var(--font-mono);
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--fleet-black);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px var(--pad-large);
  color: var(--fleet-black-50);
  text-decoration: none;
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  font-weight: 500;
  transition: color 150ms, background 150ms;
}

.nav-item:hover {
  color: var(--fleet-black-75);
  background: var(--fleet-black-5);
}

.nav-item.active {
  color: var(--fleet-black);
  font-weight: 600;
}

.nav-icon {
  font-size: 8px;
  width: 14px;
  text-align: center;
  color: inherit;
}

.nav-item.active .nav-icon {
  color: var(--fleet-green);
}

.nav-group {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--fleet-black-10);
}

.nav-group-label {
  display: block;
  padding: 4px var(--pad-large);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--fleet-black-50);
}

.nav-item.sub {
  padding-left: calc(var(--pad-large) + 8px);
  font-size: var(--font-size-xs);
}

/* ── Main Content ────────────────────────────── */
.main-content {
  flex: 1;
  min-width: 0;
  padding: var(--pad-xlarge);
  max-width: 1400px;
}

/* ── WC Banner ───────────────────────────────── */
.wc-banner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #ecfdf5;
  color: #065f46;
  font-family: var(--font-body);
  font-size: var(--font-size-xs);
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--radius);
  border: 1px solid #a7f3d0;
  margin-bottom: var(--pad-medium);
}

.wc-banner svg {
  stroke: #065f46;
  flex-shrink: 0;
}

/* ── Global Typography ───────────────────────── */
h1 {
  font-family: var(--font-mono);
  font-size: var(--font-size-xxl);
  font-weight: 600;
  color: var(--fleet-black);
  margin: 0;
}

h2 {
  font-family: var(--font-mono);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--fleet-black);
  margin: 0 0 var(--pad-medium) 0;
}

h3 {
  font-family: var(--font-mono);
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--fleet-black);
  margin: 0;
}
</style>
