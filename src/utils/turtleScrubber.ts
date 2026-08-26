/**
 * Deciding when the turtle playback bar is worth showing.
 *
 * Every runtime pushes a turtle SVG snapshot each time it pauses, plus a final
 * one when the run ends. A run that never pauses — a plain "Run", or a debug
 * run whose breakpoints are never hit — therefore leaves a single snapshot, and
 * a run that only paused before any drawing happened leaves a blank one and the
 * finished picture. Neither has anything to scrub through, so the bar is hidden
 * unless at least two snapshots actually contain drawing.
 */

// The turtle cursor itself is re-emitted in every snapshot (see `_get_svg` /
// `_refresh_svg` in utils/mainThread.ts), so it is not evidence of drawing.
// Filled shapes are polygons too, but carry stroke="none".
const TURTLE_CURSOR_RE =
  /<polygon points="[^"]*" fill="[^"]*" stroke="white" stroke-width="1" stroke-linejoin="round"\/>/g

/** True when a snapshot holds anything beyond the background and the cursor. */
export function turtleSvgHasDrawing(svg: string): boolean {
  if (!svg) return false
  const body = svg
    .replace(/^\s*<svg[^>]*>/, '')
    .replace(/^\s*<rect[^>]*\/>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(TURTLE_CURSOR_RE, '')
  return body.trim().length > 0
}

/** True when the history has enough distinct drawing stages to be replayed. */
export function shouldShowTurtleScrubber(history: string[]): boolean {
  let drawn = 0
  for (const svg of history) {
    if (turtleSvgHasDrawing(svg) && ++drawn >= 2) return true
  }
  return false
}
