<template>
  <div id="app" class="app-layout">
    <!-- Top Navigation -->
    <header class="top-nav">
      <div class="top-nav__inner">
        <div class="top-nav__brand">
          <div class="top-nav__logo-mark">D</div>
          <span class="top-nav__logo-text">DEX<span class="top-nav__logo-accent">Board</span></span>
        </div>
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
            <span class="nav-section-label">Experience</span>
            <router-link to="/" class="nav-item" exact-active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="6" height="6" rx="1"/>
                <rect x="11" y="3" width="6" height="6" rx="1"/>
                <rect x="3" y="11" width="6" height="6" rx="1"/>
                <rect x="11" y="11" width="6" height="6" rx="1"/>
              </svg>
              Experience score
            </router-link>
            <router-link to="/analytics" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 4v12h12"/>
                <path d="M7 12l3-3 2 2 4-4"/>
              </svg>
              Analytics
            </router-link>
            <router-link to="/hosts" class="nav-item" active-class="active">
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
          </div>

          <div class="nav-section">
            <span class="nav-section-label">Cost &amp; lifecycle</span>
            <router-link to="/lifecycle" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M10 3a7 7 0 107 7"/>
                <path d="M10 3v4M17 10h-4"/>
              </svg>
              Lifecycle
            </router-link>
            <router-link to="/software-usage" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M5 6h10l-1 11H6L5 6z"/>
                <path d="M8 6V4h4v2"/>
              </svg>
              Software usage
            </router-link>
          </div>

          <div class="nav-section">
            <span class="nav-section-label">Operations</span>
            <router-link to="/gitops" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="10" cy="10" r="7"/>
                <path d="M10 6v4h3"/>
              </svg>
              GitOps timeline
            </router-link>
            <router-link to="/patch-velocity" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 16l4-8 4 5 3-9 3 12"/>
              </svg>
              Patch velocity
            </router-link>
            <router-link to="/connectivity" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M10 14v.01"/>
                <path d="M6.5 11a5 5 0 017 0M3.5 8a9 9 0 0113 0"/>
              </svg>
              Connectivity
            </router-link>
          </div>

          <div class="nav-section">
            <span class="nav-section-label">Governance</span>
            <router-link to="/audit" class="nav-item" active-class="active">
              <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M5 4h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/>
                <path d="M7 8h6M7 12h4"/>
              </svg>
              Audit log
            </router-link>
          </div>
        </nav>

        <div class="sidebar-footer">
          <router-link to="/styleguide" class="sidebar-footer-link">Style guide</router-link>
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

/* ── Links (canonical Fleet frontend style) ──────────────
   Content links are black-75, weight 600, no underline, darkening to
   black on hover — never vibrant-blue. Scoped to unclassed <a> so the
   dark-header nav, buttons, and external CTAs (all classed) are untouched.
   Use .custom-link for underlined inline links, .link-emphasized for
   green CTAs. */
a:not([class]) {
  color: var(--link-color);
  font-weight: 600;
  text-decoration: none;
}
a:not([class]):hover { color: var(--link-color-hover); }

.custom-link {
  color: var(--link-color);
  font-weight: var(--font-weight-regular);
  text-decoration: underline;
  text-decoration-color: var(--link-underline);
  text-underline-offset: 3px;
}
.custom-link:hover {
  color: var(--link-color-hover);
  text-decoration-color: var(--link-color-hover);
}

.link-emphasized {
  color: var(--link-emphasis);
  text-decoration-color: var(--link-emphasis);
}
.link-emphasized:hover { color: var(--link-emphasis-hover); }

.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--fleet-white);
}

/* ── Top Navigation (Fleet-style) ────────────── */
.top-nav {
  background: var(--fleet-black);
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
  max-width: 1440px;
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
  font-size: 14px;
}

.top-nav__logo-text {
  font-weight: 700;
  font-size: 14px;
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
  height: calc(100vh - 50px);
  position: sticky;
  top: 50px;
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
  padding: var(--pad-small) var(--pad-small) 4px;
  font-family: var(--font-body);
  font-size: var(--font-size-xxsmall);
  font-weight: 600;
  color: var(--fleet-black-50);
  letter-spacing: 0.4px;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px var(--pad-small);
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
  color: var(--fleet-white);
  background: var(--fleet-green);
  font-weight: 600;
  border-radius: var(--radius-medium);
}

.nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.7;
}

.nav-item.active .nav-icon {
  opacity: 1;
  stroke: var(--fleet-white);
}

.sidebar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: var(--pad-medium) var(--pad-large);
  border-top: 1px solid var(--fleet-black-10);
}

.sidebar-footer-link {
  font-size: var(--font-size-xxsmall);
  color: var(--fleet-black-50);
  text-decoration: none;
}
.sidebar-footer-link:hover {
  color: var(--fleet-black);
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
  max-width: 1300px;
  width: 100%;
}

/* ── WC Banner ───────────────────────────────── */
.wc-banner {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: var(--status-good-bg);
  color: var(--status-good-text);
  font-family: var(--font-body);
  font-size: var(--font-size-xsmall);
  font-weight: 500;
  padding: 9px 14px;
  margin: var(--pad-medium) var(--pad-large) 0;
  border-radius: var(--radius);
  border: 1px solid rgba(61, 182, 123, 0.3);
}

.wc-banner svg {
  stroke: var(--status-good-text);
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
