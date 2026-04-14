<template>
  <div class="changeboard">
    <div v-if="error" class="error-banner">{{ error }}</div>
    <div v-if="loading" class="loading-state">Loading GitOps data...</div>

    <template v-if="!loading && commits.length">
      <!-- Header -->
      <header class="cb-header">
        <h1>GitOps changeboard</h1>
        <span class="cb-meta">{{ commits.length }} commits · {{ platformList.join(', ') }}</span>
      </header>

      <!-- Main 3-column layout -->
      <div class="cb-main">
        <!-- Left: File tree -->
        <div class="tree-panel">
          <h2>Structure</h2>
          <div class="tree-root">
            <div v-if="structure.global_config" class="tree-leaf" :class="{ highlight: isFileChanged('it-and-security/default.yml') }">
              <span class="tree-icon">&#9881;</span>
              <span class="tree-label">default.yml</span>
            </div>

            <div v-if="structure.fleets?.length" class="tree-folder">
              <div class="tree-node" @click="toggleFolder('fleets')">
                <span class="tree-chevron" :class="{ open: openFolders.fleets }">&#9654;</span>
                <span class="tree-label">fleets</span>
                <span class="tree-count">{{ structure.fleets.length }}</span>
              </div>
              <div class="tree-children" v-show="openFolders.fleets">
                <div v-for="f in structure.fleets" :key="f.name" class="tree-leaf" :class="{ highlight: isFileChanged(f.file) }">
                  <span class="tree-label">{{ f.name }}.yml</span>
                </div>
              </div>
            </div>

            <div v-for="(resources, platform) in structure.platforms || {}" :key="platform" class="tree-folder">
              <div class="tree-node" @click="toggleFolder(platform)">
                <span class="tree-chevron" :class="{ open: openFolders[platform] }">&#9654;</span>
                <span class="tree-label">{{ platformIcon(platform) }} {{ platform }}</span>
                <span class="tree-count">{{ platformItemCount(resources) }}</span>
              </div>
              <div class="tree-children" v-show="openFolders[platform]">
                <div v-for="(items, rtype) in resources" :key="rtype" class="tree-folder sub">
                  <div class="tree-node" @click.stop="toggleFolder(platform + '_' + rtype)">
                    <span class="tree-chevron" :class="{ open: openFolders[platform + '_' + rtype] }">&#9654;</span>
                    <span class="tree-label">{{ rtype.replace(/_/g, '-') }}</span>
                    <span class="tree-count">{{ items.length }}</span>
                  </div>
                  <div class="tree-children" v-show="openFolders[platform + '_' + rtype]">
                    <div v-for="item in items" :key="item.name" class="tree-leaf" :class="{ highlight: isFileChanged(item.file) }">
                      <span class="tree-label">{{ item.name }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Center: Diagram -->
        <div class="diagram-panel">
          <h2>Architecture</h2>
          <div class="diagram-zoom-controls">
            <button @click="zoomIn" title="Zoom in">+</button>
            <button @click="zoomReset" title="Reset">1:1</button>
            <button @click="zoomOut" title="Zoom out">&minus;</button>
          </div>
          <div class="diagram-container" ref="diagramRef" @wheel="onWheel" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" :class="{ panning: isPanning }">
            <div class="diagram-inner" :style="{ transform: `translate(${panX}px, ${panY}px) scale(${zoomLevel})`, transformOrigin: 'top center' }" v-html="diagramSvg"></div>
          </div>
        </div>

        <!-- Right: Detail -->
        <div class="detail-panel">
          <h2>Summary</h2>
          <div class="stats-grid" v-if="structure.summary">
            <div class="stat-card" v-for="s in summaryStats" :key="s.label">
              <div class="stat-value">{{ s.value }}</div>
              <div class="stat-label">{{ s.label }}</div>
            </div>
          </div>

          <h2>Selected commit</h2>
          <div v-if="currentCommit" class="commit-card">
            <div class="commit-msg">{{ currentCommit.message }}</div>
            <div class="commit-meta-row">
              <span>{{ currentCommit.author }}</span>
              <a :href="currentCommit.commit_url" target="_blank">{{ currentCommit.short_sha }}</a>
              <span class="badge" :class="'badge-' + currentCommit.change_type">{{ currentCommit.change_type }}</span>
              <span class="badge badge-config">{{ currentCommit.scope }}</span>
            </div>
            <div class="commit-cats" v-if="currentCommit.categories">
              <template v-for="(items, cat) in nonEmpty(currentCommit.categories)" :key="cat">
                <span class="cat-pill">{{ cat }}: {{ items.length }}</span>
              </template>
            </div>
          </div>
          <div v-else class="placeholder">Move the slider to select a commit</div>

          <h2>Changed files</h2>
          <ul class="file-list" v-if="currentCommit">
            <li v-for="f in currentCommit.files" :key="f">{{ f.replace('it-and-security/', '') }}</li>
          </ul>
        </div>
      </div>

      <!-- Timeline slider -->
      <div class="timeline-bar">
        <span class="tl-label">Timeline</span>
        <div class="tl-controls">
          <button @click="prevCommit">&larr;</button>
          <button @click="togglePlay" :class="{ active: playing }">{{ playing ? '\u23F8' : '\u25B6' }}</button>
          <button @click="nextCommit">&rarr;</button>
        </div>
        <input type="range" v-model.number="sliderIndex" :min="0" :max="commits.length - 1" class="tl-slider" />
        <span class="tl-date">{{ currentDateStr }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

const BASE_URL = 'https://raw.githubusercontent.com/headmin/fleet-gitops-changelog/refs/heads/main'

const loading = ref(true)
const error = ref(null)
const commits = ref([])
const structure = ref({})
const sliderIndex = ref(0)
const openFolders = ref({})
const diagramSvg = ref('')
const diagramRef = ref(null)
const playing = ref(false)
const zoomLevel = ref(1.4)
const panX = ref(0)
const panY = ref(0)
const isPanning = ref(false)
let panStart = { x: 0, y: 0, px: 0, py: 0 }
let playTimer = null
let mermaidInstance = null

const currentCommit = computed(() => commits.value[sliderIndex.value])

const currentDateStr = computed(() => {
  const c = currentCommit.value
  if (!c) return '\u2014'
  const d = new Date(c.timestamp)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' \u00B7 ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
})

const platformList = computed(() => structure.value.summary?.platforms || [])

const summaryStats = computed(() => {
  const s = structure.value.summary
  if (!s) return []
  return [
    { label: 'Fleets', value: s.fleets },
    { label: 'Policies', value: s.policies },
    { label: 'Profiles', value: s.configuration_profiles },
    { label: 'Scripts', value: s.scripts },
    { label: 'Software', value: s.software },
    { label: 'Reports', value: s.reports },
  ]
})

const changedFilesSet = computed(() => new Set(currentCommit.value?.files || []))

function isFileChanged(path) { return changedFilesSet.value.has(path) }
function toggleFolder(key) { openFolders.value[key] = !openFolders.value[key] }

function springOpenChanged() {
  // Close all folders first
  const newState = {}
  const files = currentCommit.value?.files || []

  for (const f of files) {
    const parts = f.split('/')
    // it-and-security/fleets/xxx.yml → open 'fleets'
    if (parts[1] === 'fleets') {
      newState['fleets'] = true
    }
    // it-and-security/lib/<platform>/<type>/xxx → open platform + platform_type
    if (parts[1] === 'lib' && parts.length >= 4) {
      const platform = parts[2]
      const rtype = parts[3]
      newState[platform] = true
      // Map folder names to structure keys (configuration-profiles → configuration_profiles)
      const rtypeKey = rtype.replace(/-/g, '_')
      newState[platform + '_' + rtypeKey] = true
    }
  }

  openFolders.value = newState
}
function platformIcon(p) { return ({ all: '\uD83C\uDF10', macos: '\uD83C\uDF4E', windows: '\uD83E\uDEDF', linux: '\uD83D\uDC27', ios: '\uD83D\uDCF1', ipados: '\uD83D\uDCF1', android: '\uD83E\uDD16' })[p] || '\uD83D\uDCC2' }
function platformItemCount(resources) { return Object.values(resources).reduce((s, arr) => s + arr.length, 0) }
function nonEmpty(cats) { const r = {}; for (const [k, v] of Object.entries(cats)) { if (v?.length) r[k] = v }; return r }
function sanitize(s) { return s.replace(/[^a-zA-Z0-9]/g, '_') }

function zoomIn() { zoomLevel.value = Math.min(3, zoomLevel.value + 0.15) }
function zoomOut() { zoomLevel.value = Math.max(0.3, zoomLevel.value - 0.15) }
function zoomReset() { zoomLevel.value = 1.4; panX.value = 0; panY.value = 0 }
function onWheel(e) { if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (e.deltaY < 0) zoomIn(); else zoomOut() } }
function onPointerDown(e) { isPanning.value = true; panStart = { x: e.clientX, y: e.clientY, px: panX.value, py: panY.value }; e.currentTarget.setPointerCapture(e.pointerId) }
function onPointerMove(e) { if (!isPanning.value) return; panX.value = panStart.px + (e.clientX - panStart.x); panY.value = panStart.py + (e.clientY - panStart.y) }
function onPointerUp() { isPanning.value = false }

function prevCommit() { sliderIndex.value = Math.max(0, sliderIndex.value - 1) }
function nextCommit() { sliderIndex.value = Math.min(commits.value.length - 1, sliderIndex.value + 1) }

function togglePlay() {
  if (playing.value) { clearInterval(playTimer); playTimer = null; playing.value = false }
  else {
    playing.value = true
    playTimer = setInterval(() => {
      if (sliderIndex.value >= commits.value.length - 1) sliderIndex.value = 0
      else sliderIndex.value++
    }, 1500)
  }
}

async function renderDiagram() {
  if (!structure.value.platforms) return
  const changed = changedFilesSet.value

  let def = 'graph LR\n'
  def += '  classDef default fill:#f8fafc,stroke:#e2e8f0,color:#1e293b\n'
  def += '  classDef changed fill:#dcfce7,stroke:#22c55e,color:#166534,stroke-width:2px\n'
  def += '  classDef fleet fill:#eff6ff,stroke:#3b82f6,color:#1e40af\n'
  def += '  classDef platform fill:#faf5ff,stroke:#a855f7,color:#6b21a8\n\n'
  def += '  ROOT["it-and-security"]:::default\n'

  const gcChanged = changed.has('it-and-security/default.yml')
  def += `  GC["default.yml"]${gcChanged ? ':::changed' : ':::default'}\n`
  def += '  ROOT --> GC\n'

  def += '  FLEETS["fleets/"]:::fleet\n'
  def += '  ROOT --> FLEETS\n'
  for (const f of (structure.value.fleets || [])) {
    const id = `FL_${sanitize(f.name)}`
    def += `  ${id}["${f.name}"]${changed.has(f.file) ? ':::changed' : ':::default'}\n`
    def += `  FLEETS --> ${id}\n`
  }

  for (const [platform, resources] of Object.entries(structure.value.platforms || {})) {
    const pid = `P_${sanitize(platform)}`
    def += `  ${pid}["${platform}"]:::platform\n`
    def += `  ROOT --> ${pid}\n`
    for (const [rtype, items] of Object.entries(resources)) {
      const rid = `${pid}_${sanitize(rtype)}`
      const anyChanged = items.some(i => changed.has(i.file))
      def += `  ${rid}["${rtype.replace(/_/g, '-')} (${items.length})"]${anyChanged ? ':::changed' : ':::default'}\n`
      def += `  ${pid} --> ${rid}\n`
    }
  }

  try {
    if (!mermaidInstance) {
      const mod = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')
      mermaidInstance = mod.default
      mermaidInstance.initialize({ startOnLoad: false, theme: 'neutral', flowchart: { curve: 'basis', padding: 16 } })
    }
    const { svg } = await mermaidInstance.render('mermaid-' + Date.now(), def)
    diagramSvg.value = svg
  } catch (e) {
    diagramSvg.value = `<div style="padding:20px;color:#999">Diagram error: ${e.message}</div>`
  }
}

watch(sliderIndex, () => {
  springOpenChanged()
  renderDiagram()
})

async function fetchData() {
  loading.value = true; error.value = null
  try {
    const [jsonlRes, structRes] = await Promise.all([
      fetch(`${BASE_URL}/changelog.jsonl`),
      fetch(`${BASE_URL}/gitops-structure.json`),
    ])
    if (jsonlRes.ok) {
      const text = await jsonlRes.text()
      commits.value = text.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    }
    if (structRes.ok) structure.value = await structRes.json()
    sliderIndex.value = commits.value.length - 1
    await nextTick()
    renderDiagram()
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

onMounted(() => fetchData())
onUnmounted(() => { if (playTimer) clearInterval(playTimer) })
</script>

<style scoped>
.changeboard { display: flex; flex-direction: column; height: calc(100vh - 120px); background: var(--fleet-off-white); overflow: hidden; }
.error-banner { background: var(--fleet-white); color: var(--fleet-error); padding: 12px 16px; border-radius: var(--radius); border-left: 3px solid var(--fleet-error); margin: 16px; }
.loading-state { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--fleet-black-50); font-family: var(--font-mono); }
.placeholder { color: var(--fleet-black-50); font-size: var(--font-size-sm); padding: 12px; }

.cb-header { padding: 12px 20px; display: flex; align-items: baseline; gap: 16px; border-bottom: 1px solid var(--fleet-black-10); background: var(--fleet-white); flex-shrink: 0; }
.cb-header h1 { font-family: var(--font-mono); font-size: var(--font-size-md); font-weight: 600; }
.cb-meta { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--fleet-black-50); }

.cb-main { display: grid; grid-template-columns: 280px 1fr 320px; flex: 1; overflow: hidden; }

/* Tree */
.tree-panel { border-right: 1px solid var(--fleet-black-10); overflow-y: auto; padding: 12px 0; background: var(--fleet-white); }
.tree-panel h2 { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--fleet-black-50); padding: 0 16px 8px; font-weight: 700; }
.tree-node { padding: 4px 16px; cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: var(--font-size-xs); transition: background 100ms; }
.tree-node:hover { background: var(--fleet-off-white); }
.tree-leaf { padding: 3px 16px 3px 32px; font-family: var(--font-mono); font-size: 11px; color: var(--fleet-black-75); transition: background 200ms; }
.tree-leaf.highlight { background: #dcfce7; color: #166534; font-weight: 600; }
.tree-folder.sub .tree-node { padding-left: 32px; }
.tree-folder.sub .tree-leaf { padding-left: 48px; }
.tree-chevron { font-size: 8px; color: var(--fleet-black-50); width: 12px; transition: transform 150ms; display: inline-block; }
.tree-chevron.open { transform: rotate(90deg); }
.tree-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-mono); }
.tree-count { margin-left: auto; font-size: 10px; color: var(--fleet-black-50); background: var(--fleet-off-white); padding: 0 6px; border-radius: 8px; }

/* Diagram */
.diagram-panel { overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.diagram-panel h2 { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--fleet-black-50); font-weight: 700; }
.diagram-zoom-controls { display: flex; gap: 4px; }
.diagram-zoom-controls button { background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius); width: 28px; height: 28px; cursor: pointer; font-size: 14px; font-weight: 600; color: var(--fleet-black-50); display: flex; align-items: center; justify-content: center; }
.diagram-zoom-controls button:hover { border-color: #3b82f6; color: var(--fleet-black); }
.diagram-container { flex: 1; overflow: hidden; background: var(--fleet-white); border-radius: var(--radius); border: 1px solid var(--fleet-black-10); padding: 16px; cursor: grab; user-select: none; }
.diagram-container.panning { cursor: grabbing; }
.diagram-inner { transition: transform 100ms ease; display: inline-block; pointer-events: none; }
.diagram-inner :deep(svg) { max-width: none; height: auto; }

/* Detail */
.detail-panel { border-left: 1px solid var(--fleet-black-10); overflow-y: auto; padding: 16px; background: var(--fleet-white); display: flex; flex-direction: column; gap: 12px; }
.detail-panel h2 { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--fleet-black-50); font-weight: 700; margin-top: 8px; }
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.stat-card { background: var(--fleet-off-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius); padding: 10px; text-align: center; }
.stat-value { font-family: var(--font-mono); font-size: var(--font-size-lg); font-weight: 700; color: #3b82f6; }
.stat-label { font-size: 10px; color: var(--fleet-black-50); }
.commit-card { background: var(--fleet-off-white); border: 1px solid var(--fleet-black-10); border-radius: var(--radius); padding: 12px; }
.commit-msg { font-size: var(--font-size-sm); font-weight: 600; line-height: 1.4; margin-bottom: 8px; }
.commit-meta-row { font-size: var(--font-size-xs); color: var(--fleet-black-50); display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.commit-meta-row a { color: #3b82f6; text-decoration: none; }
.commit-cats { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
.cat-pill { font-family: var(--font-mono); font-size: 10px; padding: 2px 6px; background: var(--fleet-white); border: 1px solid var(--fleet-black-10); border-radius: 6px; color: var(--fleet-black-50); }
.badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-family: var(--font-mono); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.badge-policy { background: #dbeafe; color: #1e40af; }
.badge-security { background: #fecaca; color: #991b1b; }
.badge-software { background: #fef3c7; color: #92400e; }
.badge-script { background: #dcfce7; color: #166534; }
.badge-config { background: var(--fleet-off-white); color: var(--fleet-black-50); }
.badge-profile { background: #fed7aa; color: #9a3412; }
.badge-report { background: #e0e7ff; color: #3730a3; }
.badge-other { background: var(--fleet-black-5); color: var(--fleet-black-50); }
.file-list { list-style: none; font-family: var(--font-mono); font-size: 11px; }
.file-list li { padding: 3px 8px; border-radius: 4px; word-break: break-all; color: var(--fleet-black-75); }
.file-list li:hover { background: var(--fleet-off-white); }
.file-list li::before { content: ''; display: inline-block; width: 5px; height: 5px; border-radius: 50%; margin-right: 6px; background: #22c55e; vertical-align: middle; }

/* Timeline bar */
.timeline-bar { border-top: 1px solid var(--fleet-black-10); padding: 12px 20px; display: flex; align-items: center; gap: 12px; background: var(--fleet-white); flex-shrink: 0; }
.tl-label { font-family: var(--font-mono); font-size: 10px; color: var(--fleet-black-50); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
.tl-controls { display: flex; gap: 4px; }
.tl-controls button { background: var(--fleet-off-white); border: 1px solid var(--fleet-black-10); color: var(--fleet-black); padding: 4px 10px; border-radius: var(--radius); cursor: pointer; font-size: 13px; }
.tl-controls button:hover { border-color: #3b82f6; }
.tl-controls button.active { background: #3b82f6; color: white; border-color: #3b82f6; }
.tl-slider { flex: 1; accent-color: #3b82f6; cursor: pointer; }
.tl-date { font-family: var(--font-mono); font-size: var(--font-size-xs); color: #3b82f6; min-width: 160px; text-align: right; }

@media (max-width: 1024px) { .cb-main { grid-template-columns: 1fr; } .tree-panel, .detail-panel { max-height: 300px; } }
</style>
