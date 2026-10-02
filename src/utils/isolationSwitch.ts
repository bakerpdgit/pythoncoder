/**
 * `?isolation=on` / `?isolation=off`: ask the server to send this browser the
 * `require-corp` embedder policy, or stop asking.
 *
 * Nobody is sent `require-corp` by default any more (scripts/isolationPolicy.mjs
 * says why: it made every real Safari unable to start a worker). This switch is
 * how that arrangement is reached on one device, deliberately, to find out what
 * Safari objects to — the headers are chosen by the server, so the only way a
 * page can ask for different ones is a cookie and a reload.
 */

import { ISOLATION_COOKIE } from '../../scripts/isolationPolicy.mjs'

const THIRTY_DAYS = 60 * 60 * 24 * 30

export interface IsolationSwitch {
  /** What to assign to `document.cookie`. */
  cookie: string
  /** The address to reload at: the same one, without the switch. */
  url: string
}

/** What `?isolation=` in this address asks for, if anything. Pure. */
export function readIsolationSwitch(href: string): IsolationSwitch | null {
  const url = new URL(href)
  const wanted = url.searchParams.get('isolation')
  if (wanted !== 'on' && wanted !== 'off') return null
  url.searchParams.delete('isolation')
  const secure = url.protocol === 'https:' ? '; Secure' : ''
  const cookie = wanted === 'on'
    ? `${ISOLATION_COOKIE}=require-corp; Path=/; Max-Age=${THIRTY_DAYS}; SameSite=Lax${secure}`
    : `${ISOLATION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
  return { cookie, url: url.pathname + url.search + url.hash }
}

/**
 * Act on the switch, if the address carries one. Returns true when the page is
 * about to reload, in which case there is no point starting the app.
 */
export function applyIsolationSwitch(): boolean {
  const asked = readIsolationSwitch(window.location.href)
  if (!asked) return false
  document.cookie = asked.cookie
  // The switch is gone from the address reloaded, so this cannot loop.
  window.location.replace(asked.url)
  return true
}
