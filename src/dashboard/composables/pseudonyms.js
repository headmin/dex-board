/**
 * Deterministic pseudonyms for demo mode.
 *
 * Pure module — no Vue, no DOM, no imports — so it stays unit-testable with
 * plain `node --test` (see pseudonyms.test.js) and matches the style of the
 * other leaf composables here (displayName.js, humanize.js).
 *
 * Every pseudonym is a pure function of a stable input key, which is what
 * makes the demo coherent: the same host resolves to the same fake name in
 * the host queue, the score table, the reports tables and its detail page,
 * across reloads and across machines. There is no lookup table and no
 * insertion-order dependence — the memo Map below is a speed optimisation
 * only, never a source of truth.
 *
 * The output is deliberately *obviously* synthetic ("amber-otter-4173"). A
 * demo audience should never wonder whether they are looking at a real
 * employee's laptop.
 *
 * NOT a privacy control: masking happens at render time, so raw values still
 * arrive in /api/query responses. See docs/docs/privacy.md.
 */

// ─── Hash ─────────────────────────────────────────────────────────
// FNV-1a, 32-bit. Chosen over crypto.subtle because it is synchronous
// (display helpers run inside computed()) and over a char-code sum because
// it actually avalanches — "dales-macbook-pro" and "dales-macbook-air"
// must not land on adjacent words.
export function hash32(str) {
  let h = 0x811c9dc5
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// Pull an independent index out of one hash by rotating first. Using
// h % listA and h % listB directly correlates the two picks when the list
// lengths share factors (both 32 here), which visibly clusters the output.
function pick(list, h, rotate) {
  const r = ((h >>> rotate) | (h << (32 - rotate))) >>> 0
  return list[r % list.length]
}

// ─── Word lists ───────────────────────────────────────────────────
// 32 x 32 x 10000 ≈ 10.2M combinations, so a few-hundred-host fleet has a
// sub-1% chance of any collision at all. Neutral, non-anthropomorphic words
// only — no first names, which is the thing we are masking.
const ADJECTIVES = [
  'amber', 'azure', 'brisk', 'calm', 'clear', 'copper', 'crisp', 'dusty',
  'eager', 'fleet', 'gentle', 'grand', 'hollow', 'ivory', 'jade', 'keen',
  'lively', 'lunar', 'mellow', 'north', 'olive', 'plain', 'quiet', 'rapid',
  'rustic', 'silver', 'solar', 'steady', 'sunny', 'tidal', 'velvet', 'warm',
]

const NOUNS = [
  'anchor', 'basin', 'beacon', 'birch', 'canyon', 'cedar', 'cobalt', 'delta',
  'ember', 'fern', 'forge', 'harbor', 'heron', 'juniper', 'lantern', 'ledger',
  'meadow', 'mesa', 'orchid', 'otter', 'pebble', 'prairie', 'quarry', 'ridge',
  'sable', 'summit', 'thicket', 'tundra', 'valley', 'walnut', 'willow', 'zenith',
]

// Team names get their own list so a team never collides visually with a
// host — "Team Aurora" can't be mistaken for "amber-otter-4173".
const TEAM_WORDS = [
  'Aurora', 'Basalt', 'Cinder', 'Drift', 'Echo', 'Flint', 'Glacier', 'Halo',
  'Indigo', 'Juno', 'Kestrel', 'Lumen', 'Mistral', 'Nimbus', 'Onyx', 'Pilot',
]

/**
 * Public software titles that stay unmasked.
 *
 * Masking every app name would gut the demo — "Adobe Photoshop idle on 40
 * seats" *is* the reclaim story, and "Internal Tool 7 idle on 40 seats"
 * tells nobody anything. What actually identifies a company is its bespoke
 * in-house tooling, so we pass through well-known public software and
 * pseudonymise the rest.
 *
 * This deliberately mirrors (and extends) BROWSER_APPS + LICENSED_SOFTWARE in
 * useWorkersCouncil.js. Expect some over-masking of legitimate public
 * software at first; the fix is to add a line here.
 */
const PUBLIC_SOFTWARE = [
  // Browsers
  'Google Chrome', 'Chrome', 'Safari', 'Firefox', 'Microsoft Edge',
  'Brave Browser', 'Arc', 'Opera', 'Vivaldi', 'Chromium',
  // Adobe
  'Adobe Photoshop', 'Adobe Illustrator', 'Adobe InDesign', 'Adobe Premiere Pro',
  'Adobe After Effects', 'Adobe Acrobat', 'Adobe Lightroom', 'Adobe XD',
  'Adobe Creative Cloud',
  // Microsoft
  'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Microsoft Outlook',
  'Microsoft Teams', 'Microsoft OneNote', 'Microsoft Defender', 'OneDrive',
  // Communication
  'Slack', 'Zoom', 'Webex', 'Discord', 'Signal', 'Telegram',
  // Design
  'Figma', 'Sketch', 'Canva', 'Affinity Designer', 'Affinity Photo',
  // Productivity
  'Notion', '1Password', 'LastPass', 'Dashlane', 'Bitwarden', 'Obsidian',
  'Alfred', 'Raycast', 'Rectangle', 'Bartender', 'CleanMyMac',
  // Development
  'Docker Desktop', 'IntelliJ IDEA', 'PyCharm', 'WebStorm', 'PhpStorm',
  'GoLand', 'CLion', 'DataGrip', 'Rider', 'RubyMine', 'Android Studio',
  'Visual Studio Code', 'Xcode', 'Sublime Text', 'iTerm', 'Warp', 'Ghostty',
  'Tower', 'Kaleidoscope', 'TablePlus', 'Postman', 'Insomnia', 'GitHub Desktop',
  // Media
  'Final Cut Pro', 'Logic Pro', 'Motion', 'Compressor', 'Spotify', 'VLC',
  'IINA', 'GarageBand', 'iMovie',
  // Virtualisation & security
  'Parallels Desktop', 'VMware Fusion', 'UTM', 'CrowdStrike Falcon',
  'Nudge', 'Munki', 'Jamf', 'Fleet osquery', 'osqueryd',
  // Apple first-party
  'Mail', 'Calendar', 'Notes', 'Reminders', 'Messages', 'FaceTime',
  'Photos', 'Music', 'TV', 'Podcasts', 'Preview', 'Terminal',
  'System Settings', 'App Store', 'Keynote', 'Pages', 'Numbers',
]

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Matchers, built once at module load. Deliberately NOT a plain substring test
 * (which is what useWorkersCouncil's isLicensedSoftware does) — that fails in
 * both directions, and failing "open" here means leaking a company's name.
 *
 * The rule depends on how distinctive the entry is:
 *
 *   Multi-word / branded ("Adobe Photoshop", "Google Chrome") → word-boundary
 *     match anywhere, so "Adobe Photoshop 2024" and "Install Adobe Acrobat"
 *     both count as public.
 *
 *   Single-word ("Mail", "Arc", "TV", "Notes") → must be the *start* of the
 *     title. These are too generic to match anywhere: naive substring matching
 *     waved through "Archive" and "Barcode Reader" on "Arc", and — the real
 *     hazard — an in-house "AcmeCorp Mail Relay" on "Mail". Anchoring keeps
 *     Apple's "Mail.app" and "1Password Launcher" public while masking those.
 *
 * The residual failure mode is over-masking a legitimate public title, which
 * is the safe direction: the fix is to add a line to PUBLIC_SOFTWARE.
 */
const PUBLIC_SOFTWARE_RE = PUBLIC_SOFTWARE.map((s) => {
  const body = escapeRe(s)
  return s.includes(' ')
    ? new RegExp(`\\b${body}\\b`, 'i')
    : new RegExp(`^${body}(?![\\w])`, 'i')
})

/** Titles arrive as "Figma.app"; the suffix is noise for matching. */
const stripAppSuffix = (name) => String(name).replace(/\.app$/i, '').trim()

// ─── Memo ─────────────────────────────────────────────────────────
// displayHost() runs inside computed() for every row of every table, so the
// same handful of keys is hashed thousands of times per render pass. This is
// purely a cache — clearing it cannot change any output.
const memo = new Map()

function memoized(kind, key, fn) {
  const k = `${kind}:${key}`
  let v = memo.get(k)
  if (v === undefined) {
    v = fn()
    memo.set(k, v)
  }
  return v
}

/** Test seam — the memo is transparent, so dropping it is always safe. */
export function _clearPseudonymCache() {
  memo.clear()
}

// ─── Generators ───────────────────────────────────────────────────

/**
 * Host name → "amber-otter-4173".
 *
 * Callers must pass a *stable* key (host_id / host_identifier), not the
 * display string, so that a host's `computer_name` and its `hostname`
 * collapse to the same pseudonym instead of two different ones.
 */
export function pseudoHost(key) {
  if (!key) return 'unknown-host'
  return memoized('host', key, () => {
    const h = hash32(`host:${key}`)
    return `${pick(ADJECTIVES, h, 0)}-${pick(NOUNS, h, 11)}-${h % 10000}`
  })
}

/**
 * Person → "admin-7f2c@example.com", or a bare "Person 7f2c" label.
 *
 * example.com is reserved by RFC 2606, so a pseudonymised address can never
 * accidentally resolve to a real mailbox if someone copies it out of a demo.
 */
export function pseudoPerson(key, { email = true } = {}) {
  if (!key) return email ? 'unknown@example.com' : 'Unknown'
  return memoized(email ? 'email' : 'person', key, () => {
    const tag = hash32(`person:${key}`).toString(16).slice(0, 4)
    return email ? `admin-${tag}@example.com` : `Person ${tag}`
  })
}

/** Team id → "Team Aurora". */
export function pseudoTeam(key) {
  if (!key) return 'Unassigned'
  return memoized('team', key, () => {
    const h = hash32(`team:${key}`)
    return `Team ${pick(TEAM_WORDS, h, 0)}`
  })
}

/** Serial → "SN-4A7C2E91". Preserves the "looks like a serial" shape. */
export function pseudoSerial(key) {
  if (!key) return '—'
  return memoized('serial', key, () => {
    const h = hash32(`serial:${key}`).toString(16).toUpperCase().padStart(8, '0')
    return `SN-${h}`
  })
}

/** True when a title is recognised public software and should stay readable. */
export function isPublicSoftware(name) {
  if (!name) return false
  const s = stripAppSuffix(name)
  return PUBLIC_SOFTWARE_RE.some(re => re.test(s))
}

/**
 * Software title → unchanged for public software, "Internal Tool 7" otherwise.
 *
 * Keeps the ".app" suffix off the pseudonym; SoftwareUsage strips it for
 * filenames anyway, and it reads as noise in a table cell.
 */
export function pseudoSoftware(name) {
  if (!name) return name
  if (isPublicSoftware(name)) return name
  return memoized('software', name, () => {
    const h = hash32(`software:${name}`)
    return `Internal Tool ${h % 100}`
  })
}

/**
 * Vendor prefixes whose reverse-DNS bundle identifiers are public knowledge.
 * Everything else is treated as in-house.
 */
const PUBLIC_BUNDLE_PREFIXES = [
  'com.apple.', 'com.google.', 'com.microsoft.', 'com.adobe.', 'com.slack',
  'us.zoom.', 'com.tinyspeck.', 'com.docker.', 'com.jetbrains.', 'com.figma.',
  'com.spotify.', 'org.mozilla.', 'com.brave.', 'com.operasoftware.',
  'com.vivaldi.', 'company.thebrowser.', 'com.1password', 'com.agilebits.',
  'notion.id', 'md.obsidian', 'com.postmanlabs.', 'com.crowdstrike.',
  'com.github.', 'com.sublimetext.', 'com.googlecode.iterm2', 'dev.warp.',
  'com.vmware.', 'com.parallels.', 'com.cisco.', 'com.citrix.',
  'com.fleetdm.', 'io.fleetdm.', 'com.facebook.osquery',
]

/**
 * Reverse-DNS identifier (bundle id, crash identifier) → masked form.
 *
 * These leak harder than app titles do: `com.acmecorp.mdm-agent` names the
 * company outright, so masking the title beside it while leaving the bundle id
 * raw would be self-defeating. Public vendor prefixes pass through, since
 * `com.apple.Safari` identifies nobody.
 *
 * The output keeps reverse-DNS shape so the column still reads as a bundle id.
 */
export function pseudoIdentifier(value) {
  if (!value) return value
  const s = String(value)
  const lc = s.toLowerCase()
  if (PUBLIC_BUNDLE_PREFIXES.some(p => lc.startsWith(p))) return s
  return memoized('identifier', s, () => {
    const h = hash32(`identifier:${s}`)
    return `com.internal.${pick(NOUNS, h, 0)}-${h % 100}`
  })
}

export { ADJECTIVES, NOUNS, TEAM_WORDS, PUBLIC_SOFTWARE, PUBLIC_BUNDLE_PREFIXES }
