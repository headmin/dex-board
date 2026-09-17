/**
 * Unit tests for the pseudonym engine.
 *
 * Runs on plain `node --test src/dashboard/composables/pseudonyms.test.js` —
 * the repo has no test runner, and this module has no Vue/DOM dependency, so
 * it needs neither. Keep it that way: anything requiring jsdom belongs in a
 * component test, not here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hash32,
  pseudoHost,
  pseudoPerson,
  pseudoTeam,
  pseudoSerial,
  pseudoSoftware,
  pseudoIdentifier,
  isPublicSoftware,
  _clearPseudonymCache,
} from './pseudonyms.js'

// A realistic stand-in for a fleet: osquery host UUIDs.
function sampleKeys(n) {
  return Array.from({ length: n }, (_, i) =>
    `A1B2C3D4-0000-4000-8000-${String(i).padStart(12, '0')}`
  )
}

test('hash32 is deterministic and avalanches on small input changes', () => {
  assert.equal(hash32('dales-macbook-pro'), hash32('dales-macbook-pro'))
  // One character apart must not land nearby — that is the whole point of
  // using FNV over a char-code sum.
  const a = hash32('dales-macbook-pro')
  const b = hash32('dales-macbook-air')
  assert.notEqual(a, b)
  assert.ok(Math.abs(a - b) > 1000, 'single-char change should not be adjacent')
  // Stays inside uint32.
  for (const s of ['', 'x', 'a'.repeat(500)]) {
    const h = hash32(s)
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff)
  }
})

test('pseudoHost is stable across calls and across a cleared cache', () => {
  const key = 'A1B2C3D4-1111-4000-8000-000000000001'
  const first = pseudoHost(key)
  assert.equal(pseudoHost(key), first, 'repeat call must match')
  _clearPseudonymCache()
  assert.equal(pseudoHost(key), first, 'memo must not be the source of truth')
})

test('pseudoHost shape is an obviously-synthetic hostname', () => {
  const name = pseudoHost('A1B2C3D4-2222-4000-8000-000000000002')
  assert.match(name, /^[a-z]+-[a-z]+-\d{1,4}$/)
})

test('pseudoHost has no collisions across a 1000-host sample', () => {
  const names = sampleKeys(1000).map(pseudoHost)
  assert.equal(new Set(names).size, 1000)
})

test('pseudoHost uses the full word space, not a correlated subset', () => {
  // Guards the pick() bit-rotation: without it, adjective and noun indexes
  // are perfectly correlated (both lists are length 32) and the distinct
  // adjective-noun pair count collapses from ~1024 to 32.
  const pairs = new Set(
    sampleKeys(2000).map(k => pseudoHost(k).split('-').slice(0, 2).join('-'))
  )
  assert.ok(pairs.size > 500, `expected wide pair coverage, got ${pairs.size}`)
})

test('distinct host keys stay distinct, empty key is handled', () => {
  assert.notEqual(pseudoHost('host-a'), pseudoHost('host-b'))
  assert.equal(pseudoHost(''), 'unknown-host')
  assert.equal(pseudoHost(null), 'unknown-host')
  assert.equal(pseudoHost(undefined), 'unknown-host')
})

test('pseudoPerson yields an RFC 2606 address that cannot reach a mailbox', () => {
  const email = pseudoPerson('henry@fleetdm.com')
  assert.match(email, /^admin-[0-9a-f]{1,4}@example\.com$/)
  assert.equal(pseudoPerson('henry@fleetdm.com'), email)
  // Bare-label form for commit authors, where an address would be wrong.
  assert.match(pseudoPerson('Allen Houchins', { email: false }), /^Person [0-9a-f]{1,4}$/)
  assert.equal(pseudoPerson(''), 'unknown@example.com')
  assert.equal(pseudoPerson('', { email: false }), 'Unknown')
})

test('pseudoTeam is stable and visually distinct from a host name', () => {
  assert.equal(pseudoTeam('team-247'), pseudoTeam('team-247'))
  assert.match(pseudoTeam('team-247'), /^Team [A-Z][a-z]+$/)
  assert.equal(pseudoTeam(''), 'Unassigned')
})

test('pseudoSerial keeps a serial-like shape', () => {
  const sn = pseudoSerial('C02XK1ZBJGH5')
  assert.match(sn, /^SN-[0-9A-F]{8}$/)
  assert.equal(pseudoSerial('C02XK1ZBJGH5'), sn)
  assert.equal(pseudoSerial(''), '—')
})

test('public software passes through unmasked, including versioned titles', () => {
  for (const name of ['Slack', 'Adobe Photoshop', 'Adobe Photoshop 2024', 'Google Chrome.app']) {
    assert.ok(isPublicSoftware(name), `${name} should be recognised`)
    assert.equal(pseudoSoftware(name), name, `${name} must stay readable`)
  }
})

test('in-house software is pseudonymised — that is what identifies a company', () => {
  const masked = pseudoSoftware('AcmeCorp VPN Client')
  assert.ok(!isPublicSoftware('AcmeCorp VPN Client'))
  assert.match(masked, /^Internal Tool \d{1,2}$/)
  assert.equal(pseudoSoftware('AcmeCorp VPN Client'), masked)
  assert.equal(pseudoSoftware(''), '')
  assert.equal(pseudoSoftware(null), null)
})

test('the allow-list does not fail open on generic single-word entries', () => {
  // Regressions, all of which a plain substring test waved through as "public":
  //   Archive / Barcode  ← the list entry "Arc" sits inside both
  //   AcmeCorp Mail Relay ← "Mail" is a legitimate Apple entry, but far too
  //                          generic to match in the middle of a title
  // Failing open here leaks the company name, so these must be masked.
  for (const name of [
    'Archive.app', 'Barcode Reader.app', 'AcmeCorp Mail Relay',
    'Notesmith Internal', 'Contoso TV Wall', 'Globex Signal Processor',
  ]) {
    assert.ok(!isPublicSoftware(name), `${name} must NOT count as public software`)
    assert.match(pseudoSoftware(name), /^Internal Tool \d{1,2}$/)
  }
  // …while genuine public titles still pass, including .app-suffixed,
  // versioned, and vendor-prefixed variants.
  for (const name of [
    'Arc', 'Arc.app', 'Mail', 'Mail.app', 'Notes.app', 'TV.app',
    '1Password Launcher.app', 'Adobe Photoshop 2024', 'Install Adobe Acrobat',
    'Google Chrome.app', 'Visual Studio Code',
  ]) {
    assert.ok(isPublicSoftware(name), `${name} should count as public software`)
    assert.equal(pseudoSoftware(name), name)
  }
})

test('public bundle identifiers pass through', () => {
  for (const id of ['com.apple.Safari', 'com.google.Chrome', 'com.microsoft.Excel', 'com.fleetdm.orbit']) {
    assert.equal(pseudoIdentifier(id), id, `${id} must stay readable`)
  }
})

test('in-house bundle identifiers are masked but keep reverse-DNS shape', () => {
  // The bundle id leaks harder than the app title: com.acmecorp.* names the
  // company outright, so masking the title while leaving this raw is pointless.
  const masked = pseudoIdentifier('com.acmecorp.mdm-agent')
  assert.match(masked, /^com\.internal\.[a-z]+-\d{1,2}$/)
  assert.ok(!masked.includes('acmecorp'))
  assert.equal(pseudoIdentifier('com.acmecorp.mdm-agent'), masked)
  assert.equal(pseudoIdentifier(''), '')
  assert.equal(pseudoIdentifier(null), null)
})

test('pseudoIdentifier prefix matching is case-insensitive and anchored', () => {
  assert.equal(pseudoIdentifier('COM.APPLE.Finder'), 'COM.APPLE.Finder')
  // Anchored at the start: a hostile-looking name that merely *contains* a
  // public prefix must still be masked.
  assert.match(pseudoIdentifier('com.acmecorp.com.apple.shim'), /^com\.internal\./)
})

test('the same key never crosses kinds', () => {
  // A team id and a host id could coincidentally match; salting per kind
  // keeps their pseudonyms independent.
  assert.notEqual(pseudoHost('shared-key'), pseudoTeam('shared-key'))
  assert.notEqual(pseudoPerson('shared-key'), pseudoSerial('shared-key'))
})
