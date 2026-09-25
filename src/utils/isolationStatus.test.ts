import { describe, expect, it } from 'vitest'
import { diagnoseIsolationProblem, isolationProblemMessage } from './isolationStatus'

const SAFARI = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

describe('diagnoseIsolationProblem', () => {
  it('blames the framing page first — no header fixes that', () => {
    expect(diagnoseIsolationProblem({ inFrame: true, secure: false, userAgent: SAFARI, isolated: false })).toBe('embedded')
  })
  it('then an insecure address', () => {
    expect(diagnoseIsolationProblem({ inFrame: false, secure: false, userAgent: CHROME, isolated: false })).toBe('insecure')
  })
  it('then an isolated page that still has no SharedArrayBuffer — not a header problem', () => {
    expect(diagnoseIsolationProblem({ inFrame: false, secure: true, userAgent: SAFARI, isolated: true })).toBe('no-shared-memory')
  })
  it('then Safari/iPad, which needs its own header', () => {
    expect(diagnoseIsolationProblem({ inFrame: false, secure: true, userAgent: SAFARI, isolated: false })).toBe('webkit')
  })
  it('otherwise the headers did not arrive', () => {
    expect(diagnoseIsolationProblem({ inFrame: false, secure: true, userAgent: CHROME, isolated: false })).toBe('headers')
  })
})

describe('isolationProblemMessage', () => {
  it('only suggests npm commands to someone running it locally', () => {
    expect(isolationProblemMessage('headers', true)).toMatch(/npm run dev/)
    expect(isolationProblemMessage('headers', false)).not.toMatch(/npm/)
  })
  it('explains the Safari case in plain words', () => {
    expect(isolationProblemMessage('webkit', false)).toMatch(/iPad/)
  })
})
