// Types for scripts/isolationPolicy.mjs (plain JS so server.mjs can import it
// without a build step).
import type { IncomingMessage, ServerResponse } from 'node:http'

export const ISOLATION_COOKIE: 'coder_isolation'
export function isWebKitUserAgent(userAgent: string | null | undefined): boolean
export function wantsStrictIsolation(cookieHeader: string | null | undefined): boolean
export function embedderPolicyFor(cookieHeader: string | null | undefined): 'require-corp' | 'credentialless'
export function isolationHeadersFor(cookieHeader: string | null | undefined): {
  'Cross-Origin-Opener-Policy': 'same-origin'
  'Cross-Origin-Embedder-Policy': 'require-corp' | 'credentialless'
  'Origin-Agent-Cluster': '?1'
}
export function applyIsolationHeaders(req: Pick<IncomingMessage, 'headers'>, res: Pick<ServerResponse, 'setHeader' | 'getHeader'>): void
