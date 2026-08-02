import { watch, onBeforeUnmount } from 'vue'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Trap Tab focus inside `containerRef` while `activeRef` is true, and
 * restore focus to the previously-focused element when it turns false.
 * Complements (does not replace) Escape/overlay-close handling.
 */
export function useFocusTrap(containerRef, activeRef) {
  let previouslyFocused = null

  function onKeydown(e) {
    if (e.key !== 'Tab' || !containerRef.value) return
    const focusable = containerRef.value.querySelectorAll(FOCUSABLE)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function activate() {
    previouslyFocused = document.activeElement
    document.addEventListener('keydown', onKeydown)
    // Move focus into the dialog so Tab starts inside it.
    requestAnimationFrame(() => {
      const target = containerRef.value?.querySelector(FOCUSABLE)
      target?.focus()
    })
  }

  function deactivate() {
    document.removeEventListener('keydown', onKeydown)
    if (previouslyFocused?.focus) previouslyFocused.focus()
    previouslyFocused = null
  }

  watch(activeRef, (active) => (active ? activate() : deactivate()), { immediate: true })
  onBeforeUnmount(deactivate)
}
