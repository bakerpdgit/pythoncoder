import { useCallback, useEffect, useState } from 'react'

/** Gap left between the bottom of an open menu and the bottom of the window. */
const VIEWPORT_GAP = 12
/** Never shrink a menu below this, even on a very short window. */
const MIN_HEIGHT = 140

/**
 * Keeps a dropdown panel inside the viewport.
 *
 * Header menus are absolutely positioned under their trigger button, so on a
 * short screen a long menu (the Learning book list, the Panels list) simply ran
 * off the bottom with no way to reach the entries below the fold. This measures
 * the space between the top of the panel and the bottom of the window and caps
 * the panel's height to it, so the overflow scrolls instead.
 *
 * Returns a callback ref for the panel element plus the style to spread on it.
 */
export function useMenuMaxHeight(isOpen: boolean) {
  const [panel, setPanel] = useState<HTMLElement | null>(null)
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined)

  const measure = useCallback(() => {
    if (!panel) return
    const { top } = panel.getBoundingClientRect()
    const available = window.innerHeight - top - VIEWPORT_GAP
    setMaxHeight(Math.max(Math.round(available), MIN_HEIGHT))
  }, [panel])

  useEffect(() => {
    if (!isOpen || !panel) {
      setMaxHeight(undefined)
      return
    }
    measure()
    window.addEventListener('resize', measure)
    // Capture phase so a scroll in any ancestor re-measures too.
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [isOpen, panel, measure])

  return {
    panelRef: setPanel,
    panelStyle: maxHeight === undefined ? undefined : { maxHeight },
    /** Apply alongside panelStyle so the capped panel scrolls. */
    panelClass: 'overflow-y-auto overscroll-contain',
  }
}
