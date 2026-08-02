/**
 * Shared table-sort state + comparator.
 *
 * Usage:
 *   const { sortKey, sortAsc, toggleSort, sortRows } = useSort('hostname')
 *   const sorted = computed(() => sortRows(rows.value))
 *
 * Conventions:
 * - Clicking the active column flips direction.
 * - Clicking a new column selects it; numeric/datetime columns start
 *   DESCENDING (big numbers / most recent first), text columns ascending.
 * - Nulls always sort to the bottom regardless of direction.
 */
import { ref } from 'vue'

export function useSort(defaultKey = '', defaultAsc = true) {
  const sortKey = ref(defaultKey)
  const sortAsc = ref(defaultAsc)

  /**
   * @param {string} key column key to sort by
   * @param {boolean} isNumeric numeric/datetime columns start descending
   */
  function toggleSort(key, isNumeric = false) {
    if (sortKey.value === key) {
      sortAsc.value = !sortAsc.value
    } else {
      sortKey.value = key
      sortAsc.value = !isNumeric
    }
  }

  /**
   * Stable copy-sort of rows by the current sortKey/sortAsc.
   * @param {Array<object>} rows
   * @param {(key: string) => boolean} [isNumericFn] optional hint; when it
   *   returns true for the current key, non-finite values are treated as null
   */
  function sortRows(rows, isNumericFn) {
    const key = sortKey.value
    if (!key || !Array.isArray(rows)) return Array.isArray(rows) ? rows.slice() : []

    const dir = sortAsc.value ? 1 : -1
    const numericHint = typeof isNumericFn === 'function' && isNumericFn(key)

    const isNull = v => v == null || v === '' ||
      (numericHint && !Number.isFinite(Number(v)))

    return rows.slice().sort((a, b) => {
      const av = a?.[key]
      const bv = b?.[key]

      // Nulls to bottom regardless of direction.
      const aNull = isNull(av)
      const bNull = isNull(bv)
      if (aNull && bNull) return 0
      if (aNull) return 1
      if (bNull) return -1

      const an = Number(av)
      const bn = Number(bv)
      if (Number.isFinite(an) && Number.isFinite(bn)) {
        return (an - bn) * dir
      }
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir
    })
  }

  return { sortKey, sortAsc, toggleSort, sortRows }
}
