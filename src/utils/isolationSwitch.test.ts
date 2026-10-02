import { describe, expect, it } from 'vitest'
import { readIsolationSwitch } from './isolationSwitch'
import { wantsStrictIsolation } from '../../scripts/isolationPolicy.mjs'

/** The cookie a browser would send back after `document.cookie = <that>`. */
const sentBack = (assignment: string) => assignment.split(';')[0]

describe('readIsolationSwitch', () => {
  it('does nothing for an ordinary address', () => {
    expect(readIsolationSwitch('https://coder.example/')).toBeNull()
    expect(readIsolationSwitch('https://coder.example/?book=x&transport=xhr')).toBeNull()
    expect(readIsolationSwitch('https://coder.example/?isolation=maybe')).toBeNull()
  })

  it('turns isolation on with a cookie the server recognises', () => {
    const asked = readIsolationSwitch('https://coder.example/?isolation=on')!
    expect(wantsStrictIsolation(sentBack(asked.cookie))).toBe(true)
    expect(asked.cookie).toMatch(/Path=\//)
    expect(asked.cookie).toMatch(/Secure/)
  })

  it('turns it off by expiring the cookie', () => {
    const asked = readIsolationSwitch('https://coder.example/?isolation=off')!
    expect(asked.cookie).toMatch(/Max-Age=0/)
    expect(wantsStrictIsolation(sentBack(asked.cookie))).toBe(false)
  })

  it('reloads at the same address without the switch, so it cannot loop', () => {
    const asked = readIsolationSwitch('https://coder.example/?book=https%3A%2F%2Fx%2Fbook.json&isolation=on&showFirst#top')!
    expect(asked.url).toBe('/?book=https%3A%2F%2Fx%2Fbook.json&showFirst=#top')
    expect(readIsolationSwitch(`https://coder.example${asked.url}`)).toBeNull()
  })

  it('leaves Secure off where the page is not https, or the cookie would be refused', () => {
    expect(readIsolationSwitch('http://localhost:3000/?isolation=on')!.cookie).not.toMatch(/Secure/)
  })
})
