import { createRouter, createWebHistory } from 'vue-router'
import ExperienceScore from './views/ExperienceScore.vue'
import FirehoseExperience from './views/FirehoseExperience.vue'
import FirehoseDevices from './views/FirehoseDevices.vue'
import FirehoseReports from './views/FirehoseReports.vue'
import FirehoseTimeline from './views/FirehoseTimeline.vue'
import FirehoseChangeboard from './views/FirehoseChangeboard.vue'
import FirehoseInsights from './views/FirehoseInsights.vue'
import Firehose from './views/Firehose.vue'
import DexOverview from './views/DexOverview.vue'
import AuditLogs from './views/AuditLogs.vue'

const routes = [
  { path: '/', name: 'Experience', component: ExperienceScore },
  { path: '/experience-details', name: 'Experience Details', component: FirehoseExperience },
  { path: '/devices', name: 'Devices', component: FirehoseDevices },
  { path: '/insights', name: 'Insights', component: FirehoseInsights },
  { path: '/reports', name: 'Reports', component: FirehoseReports },
  { path: '/timeline', name: 'Timeline', component: FirehoseTimeline },
  { path: '/changeboard', name: 'Changeboard', component: FirehoseChangeboard },
  { path: '/overview', name: 'Overview', component: DexOverview },
  { path: '/audit', name: 'Audit', component: AuditLogs },
  { path: '/raw', name: 'Raw', component: Firehose },
  // Legacy redirects
  { path: '/firehose', redirect: '/raw' },
  { path: '/firehose/experience', redirect: '/experience-details' },
  { path: '/firehose/devices', redirect: '/devices' },
  { path: '/firehose/reports', redirect: '/reports' },
  { path: '/firehose/insights', redirect: '/insights' },
  { path: '/firehose/timeline', redirect: '/timeline' },
  { path: '/firehose/changeboard', redirect: '/changeboard' },
]

export default createRouter({
  history: createWebHistory(),
  routes
})
