// Why this tab is not cross-origin isolated, in words a student or teacher can
// act on. The trace worker needs isolation (for SharedArrayBuffer); without it
// the app offers the main thread instead, and the banner that says so used to
// report `window.crossOriginIsolated is false` and suggest `npm run dev`.

import { isWebKitUserAgent } from '../../scripts/isolationPolicy.mjs'

export type IsolationProblem = 'embedded' | 'insecure' | 'no-shared-memory' | 'webkit' | 'headers'

export interface IsolationEnvironment {
  /** The app is framed by another page. */
  inFrame: boolean
  /** `window.isSecureContext` — https, or localhost. */
  secure: boolean
  userAgent: string
  /** `window.crossOriginIsolated` — the headers did their job. */
  isolated: boolean
}

/** The most likely reason, most specific first. */
export function diagnoseIsolationProblem(env: IsolationEnvironment): IsolationProblem {
  if (env.inFrame) return 'embedded'
  if (!env.secure) return 'insecure'
  if (env.isolated) return 'no-shared-memory'
  if (isWebKitUserAgent(env.userAgent)) return 'webkit'
  return 'headers'
}

export function isolationProblemMessage(problem: IsolationProblem, isLocalhost: boolean): string {
  switch (problem) {
    case 'embedded':
      return 'Coder is running inside another web page. Open it in a tab of its own to get the step-by-step runner.'
    case 'insecure':
      return 'The page was not opened from a secure (https) address, which the step-by-step runner needs.'
    case 'no-shared-memory':
      return 'This browser does not offer the shared memory (SharedArrayBuffer) the step-by-step runner uses, even though the page is set up for it. Updating the browser usually fixes this.'
    case 'webkit':
      return 'Safari, and every browser on an iPad or iPhone, needs the site to send a "require-corp" isolation header. It did not arrive — reload the page, and if this keeps appearing, a school web filter may be removing it.'
    case 'headers':
      return isLocalhost
        ? 'The page was served without cross-origin isolation headers. Run it with `npm run dev`, or `npm start` on the built output.'
        : 'The page arrived without the isolation headers the step-by-step runner needs. Reload the page; if this keeps appearing, a web filter may be removing them.'
  }
}

/** Read the environment from the live page. */
export function currentIsolationEnvironment(): IsolationEnvironment {
  let inFrame = false
  try { inFrame = window.self !== window.top } catch { inFrame = true }
  return {
    inFrame,
    secure: window.isSecureContext === true,
    userAgent: navigator.userAgent,
    isolated: window.crossOriginIsolated === true,
  }
}
