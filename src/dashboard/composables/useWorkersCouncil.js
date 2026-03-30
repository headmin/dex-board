import { ref, watch } from 'vue'

// ─── Module-level singleton state (shared across all components) ──
const STORAGE_KEY = 'fleet-wc-mode'
const wcMode = ref(localStorage.getItem(STORAGE_KEY) === 'true')

// Persist to localStorage on change
watch(wcMode, (val) => {
  localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false')
})

// ─── Constants ────────────────────────────────────────────────────
const BROWSER_APPS = [
  'Google Chrome', 'Safari', 'Firefox', 'Microsoft Edge',
  'Brave Browser', 'Arc', 'Opera', 'Vivaldi', 'Chromium'
]

const LICENSED_SOFTWARE = [
  // Adobe Suite
  'Adobe Photoshop', 'Adobe Illustrator', 'Adobe InDesign', 'Adobe Premiere Pro',
  'Adobe After Effects', 'Adobe Acrobat', 'Adobe Lightroom', 'Adobe XD',
  // Microsoft 365
  'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Microsoft Outlook',
  'Microsoft Teams', 'Microsoft OneNote',
  // Communication
  'Slack', 'Zoom', 'Webex',
  // Design
  'Figma', 'Sketch', 'Canva',
  // Productivity
  'Notion', '1Password', 'LastPass', 'Dashlane',
  // Development
  'Docker Desktop', 'IntelliJ IDEA', 'PyCharm', 'WebStorm', 'PhpStorm',
  'GoLand', 'CLion', 'DataGrip', 'Rider', 'RubyMine',
  'Sublime Text', 'Tower', 'Kaleidoscope',
  // Media
  'Final Cut Pro', 'Logic Pro', 'Motion', 'Compressor',
  // Other
  'Parallels Desktop', 'VMware Fusion', 'TablePlus', 'Postman'
]

// ─── Helper functions ─────────────────────────────────────────────

function toggleWcMode() {
  wcMode.value = !wcMode.value
}

function isAppAllowedInWcMode(appName) {
  return BROWSER_APPS.some(b => appName.toLowerCase().includes(b.toLowerCase()))
}

function isLicensedSoftware(appName) {
  return LICENSED_SOFTWARE.some(ls => appName.toLowerCase().includes(ls.toLowerCase()))
}

function computeBrowserBreakdown(apps) {
  const browsers = apps.filter(a => isAppAllowedInWcMode(a.app_name))
  if (!browsers.length) return []

  const total = browsers.length
  return browsers.map(b => ({
    name: b.app_name,
    percentage: Math.round((1 / total) * 100)
  }))
}

function computeUsageSummary(apps) {
  const total = apps.length
  const daily = apps.filter(a => a.usage_category === 'daily').length
  const weekly = apps.filter(a => a.usage_category === 'weekly').length
  const monthly = apps.filter(a => a.usage_category === 'monthly').length
  const unused = apps.filter(a => a.usage_category === 'stale' || a.usage_category === 'never').length
  return { total, daily, weekly, monthly, unused }
}

function getLicenseWasteApps(apps) {
  return apps
    .filter(a => isLicensedSoftware(a.app_name))
    .filter(a => a.usage_category === 'stale' || a.usage_category === 'never')
    .map(a => ({
      app_name: a.app_name,
      usage_category: a.usage_category,
      days_unused: a.days_since_opened
    }))
    .sort((a, b) => b.days_unused - a.days_unused)
}

// ─── Export ───────────────────────────────────────────────────────
export function useWorkersCouncil() {
  return {
    wcMode,
    toggleWcMode,
    isAppAllowedInWcMode,
    isLicensedSoftware,
    computeBrowserBreakdown,
    computeUsageSummary,
    getLicenseWasteApps,
    BROWSER_APPS,
    LICENSED_SOFTWARE
  }
}
