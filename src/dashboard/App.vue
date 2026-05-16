<template>
  <div id="app" class="app-layout">
    <!-- Top Navigation -->
    <header class="top-nav">
      <div class="top-nav__inner">
        <div class="top-nav__brand">
          <div class="top-nav__logo-mark">D</div>
          <span class="top-nav__logo-text">DEX<span class="top-nav__logo-accent">Board</span></span>
        </div>
        <nav class="top-nav__links">
          <router-link to="/" class="top-nav__link" exact-active-class="top-nav__link--active">Dashboard</router-link>
          <router-link to="/devices" class="top-nav__link" active-class="top-nav__link--active">Hosts</router-link>
          <router-link to="/reports" class="top-nav__link" active-class="top-nav__link--active">Reports</router-link>
          <router-link to="/insights" class="top-nav__link" active-class="top-nav__link--active">Insights</router-link>
        </nav>
        <div class="top-nav__account">
          <div class="top-nav__avatar">A</div>
          <span class="top-nav__user">admin@fleet.co</span>
        </div>
      </div>
    </header>

    <div class="app-body">
      <aside class="sidebar">
        <nav class="sidebar-nav">
          <div class="nav-section">
            <span class="nav-section-label">Analytics</span>
            <router-link to="/" class="nav-item" exact-active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="6" height="6" rx="1"/>
                <rect x="11" y="3" width="6" height="6" rx="1"/>
                <rect x="3" y="11" width="6" height="6" rx="1"/>
                <rect x="11" y="11" width="6" height="6" rx="1"/>
              </svg>
              Experience
            </router-link>
            <router-link to="/experience-details" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 10h14M3 6h8M3 14h11"/>
              </svg>
              Exp. Details
            </router-link>
            <router-link to="/devices" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="4" y="3" width="12" height="14" rx="2"/>
                <path d="M8 17h4"/>
              </svg>
              Hosts
            </router-link>
            <router-link to="/insights" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="10" cy="10" r="7"/>
                <path d="M10 6v4l2.5 2.5"/>
              </svg>
              Insights
            </router-link>
            <router-link to="/reports" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 4v12h12"/>
                <path d="M7 12l3-3 2 2 4-4"/>
              </svg>
              Reports
            </router-link>
          </div>

          <div class="nav-section">
            <span class="nav-section-label">Operations</span>
            <router-link to="/timeline" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="10" cy="10" r="7"/>
                <path d="M10 6v4h3"/>
              </svg>
              Timeline
            </router-link>
            <router-link to="/changeboard" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 6h12M4 10h8M4 14h10"/>
              </svg>
              Changeboard
            </router-link>
          </div>

          <div class="nav-section">
            <span class="nav-section-label">Admin</span>
            <router-link to="/overview" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="10" cy="10" r="7"/>
                <path d="M10 7v3M10 13v.01"/>
              </svg>
              Overview
            </router-link>
            <router-link to="/audit" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M5 4h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/>
                <path d="M7 8h6M7 12h4"/>
              </svg>
              Audit log
            </router-link>
            <router-link to="/raw" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 6h12M4 10h12M4 14h12"/>
              </svg>
              Raw data
            </router-link>
          </div>
        </nav>

        <div class="sidebar-footer">
          <div class="version-badge">v1.0.0</div>
        </div>
      </aside>

      <main class="main-content">
        <FleetFilterBar />
        <div v-if="wcMode" class="wc-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Workers Council Mode Active
        </div>
        <div class="content-wrapper">
          <router-view />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import FleetFilterBar from './components/FleetFilterBar.vue'
import { useWorkersCouncil } from './composables/useWorkersCouncil'

const { wcMode } = useWorkersCouncil()
</script>

<style>
/* Reset & Base */
*, *::before, *::after {
  box-sizing: border-box;
}

html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  padding: 0;
  font-family: var(--font-body);
}

.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--fleet-off-white);
}

/* ── Top Navigation (Fleet-style) ────────────── */
.top-nav {
  background: var(--gradients-dark-gradient);
  color: var(--fleet-white);
  padding: 0 var(--pad-page);
  position: sticky;
  top: 0;
  z-index: 100;
}

.top-nav__inner {
  display: flex;
  align-items: center;
  gap: var(--pad-xlarge);
  max-width: 1600px;
  margin: 0 auto;
}

.top-nav__brand {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
  padding: var(--pad-smedium) 0;
}

.top-nav__logo-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background-color: var(--fleet-green);
  color: var(--fleet-white);
  font-weight: 700;
  font-size: 16px;
}

.top-nav__logo-text {
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.3px;
}

.top-nav__logo-accent {
  color: var(--fleet-green);
}

.top-nav__links {
  display: flex;
  gap: var(--pad-smedium);
  margin: 0;
  padding: 0;
  list-style: none;
}

.top-nav__link {
  display: inline-block;
  padding: var(--pad-smedium) var(--pad-medium);
  color: var(--fleet-black-10);
  font-weight: 700;
  font-size: var(--font-size-xsmall);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.top-nav__link:hover {
  color: var(--fleet-white);
  text-decoration: none;
}

.top-nav__link--active {
  color: var(--fleet-white);
  border-bottom-color: var(--fleet-green);
}

.top-nav__account {
  display: flex;
  align-items: center;
  gap: var(--pad-small);
  margin-left: auto;
  padding: var(--pad-smedium) 0;
}

.top-nav__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background-color: var(--fleet-green);
  color: var(--fleet-white);
  font-weight: 700;
  font-size: var(--font-size-xsmall);
  text-transform: uppercase;
}

.top-nav__user {
  font-size: var(--font-size-xsmall);
  color: var(--fleet-black-10);
  font-family: var(--font-mono);
}

/* ── App Body ────────────────────────────────── */
.app-body {
  display: flex;
  flex: 1;
}

/* ── Sidebar ─────────────────────────────────── */
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  height: calc(100vh - 52px);
  position: sticky;
  top: 52px;
  overflow-y: auto;
}

.sidebar-nav {
  flex: 1;
  padding: var(--pad-medium) 0;
  display: flex;
  flex-direction: column;
  gap: var(--pad-small);
}

.nav-section {
  padding: 0 var(--pad-smedium);
}

.nav-section-label {
  display: block;
  padding: var(--pad-small) var(--pad-small);
  font-family: var(--font-body);
  font-size: var(--font-size-xxsmall);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--fleet-black-50);
  margin-bottom: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px var(--pad-small);
  color: var(--fleet-black-75);
  text-decoration: none;
  font-family: var(--font-body);
  font-size: var(--font-size-xsmall);
  font-weight: 500;
  border-radius: var(--radius);
  transition: all var(--transition-fast);
  margin-bottom: 2px;
}

.nav-item:hover {
  color: var(--fleet-black);
  background: var(--fleet-black-5);
}

.nav-item.active {
  color: var(--fleet-green);
  background: var(--sidebar-active-bg);
  font-weight: 700;
}

.nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.7;
}

.nav-item.active .nav-icon {
  opacity: 1;
  stroke: var(--fleet-green);
}

.sidebar-footer {
  padding: var(--pad-medium) var(--pad-large);
  border-top: 1px solid var(--fleet-black-10);
}

.version-badge {
  font-family: var(--font-mono);
  font-size: var(--font-size-xxsmall);
  color: var(--fleet-black-50);
}

/* ── Main Content ────────────────────────────── */
.main-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.content-wrapper {
  flex: 1;
  padding: var(--pad-large);
  max-width: 1440px;
  width: 100%;
}

/* ── WC Banner ───────────────────────────────── */
.wc-banner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(61, 182, 123, 0.1);
  color: #065f46;
  font-family: var(--font-body);
  font-size: var(--font-size-xsmall);
  font-weight: 500;
  padding: 10px 16px;
  margin: var(--pad-medium) var(--pad-large) 0;
  border-radius: var(--radius);
  border: 1px solid rgba(61, 182, 123, 0.3);
}

.wc-banner svg {
  stroke: #065f46;
  flex-shrink: 0;
}

/* ── Global Typography ───────────────────────── */
h1 {
  font-family: var(--font-body);
  font-size: var(--font-size-large);
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0;
}

h2 {
  font-family: var(--font-body);
  font-size: var(--font-size-medium);
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0 0 var(--pad-medium) 0;
}

h3 {
  font-family: var(--font-body);
  font-size: var(--font-size-small);
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0;
}

h4 {
  font-family: var(--font-body);
  font-size: var(--font-size-xsmall);
  font-weight: 700;
  color: var(--fleet-black);
  margin: 0;
}

/* ── Global Form Elements ────────────────────── */
input, select, textarea {
  font-family: var(--font-body);
}

button {
  font-family: var(--font-body);
  cursor: pointer;
}

/* ── Utility Classes ─────────────────────────── */
.text-muted {
  color: var(--fleet-black-50);
}

.text-success {
  color: var(--fleet-success);
}

.text-warning {
  color: var(--fleet-warning);
}

.text-error {
  color: var(--fleet-error);
}
</style>
