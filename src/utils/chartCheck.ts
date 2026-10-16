// ── Marking a chart ─────────────────────────────────────────────────────────
//
// A test requirement `{"typ": "chart", "filename": "sol.py"}` passes when the
// student's program draws the same chart as the solution file: the same titles
// and axis labels, the same kind of series plotting the same numbers, the same
// legend and text. The comparison itself is Python (src/python/coder_charts.py),
// run in the tester worker where both programs' figures exist; this is the half
// both the tester and the matcher need.

import type { BookTestOutputReq } from '../types'

/** Whether a requirement also compares the series' colours. */
export function chartComparesColours(req: BookTestOutputReq): boolean {
  return req.colours === true || req.colours === 'true'
}

/** One comparison per solution file and option set: the key both the tester and the matcher use. */
export function chartReqKey(req: BookTestOutputReq): string {
  return JSON.stringify([req.filename ?? '', chartComparesColours(req)])
}

/** A guide that asks for the solution's chart above the instructions. */
export const CHART_PREVIEW_TOKEN = /!\[[^\]]*\]\(chartpreview\)/
