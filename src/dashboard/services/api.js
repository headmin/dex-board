/**
 * API client — calls the Worker's /api/query endpoint.
 *
 * Replaces clickhouse.js. No SQL is constructed in the browser.
 * All queries are named registry entries executed server-side.
 */

export async function query(name, params = {}) {
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: name, params })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }))
    throw new Error(err.error?.message || `Query '${name}' failed with status ${res.status}`)
  }

  const { data } = await res.json()
  return data
}
