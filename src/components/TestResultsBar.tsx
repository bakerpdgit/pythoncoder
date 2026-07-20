import { useState } from 'react'
import type { OverallTestResult, TestCaseResult, BookTestOutputReq } from '../types'

interface Props {
  result: OverallTestResult | null
  isRunning: boolean
  status: string
  onClose: () => void
}

function PassIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 flex-shrink-0">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function FailIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 flex-shrink-0">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function formatInputs(inputs: Array<string | number>): string {
  if (inputs.length === 0) return '(none)'
  return inputs.join('\n')
}

function formatExpected(out: string | BookTestOutputReq[]): string {
  if (typeof out === 'string') return out || '(any)'
  if (out.length === 0) return '(any)'
  if (out.length === 1 && out[0].pattern) return out[0].pattern
  return `${out.length} checks`
}

function TestCaseRow({ tc, index }: { tc: TestCaseResult; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = tc.reveal && tc.reqResults.length > 1

  return (
    <>
      <tr className={`border-t border-slate-700 ${tc.passed ? '' : 'bg-red-950/20'}`}>
        <td className="px-2 py-1.5 text-slate-400 text-center">{index + 1}</td>
        <td className="px-2 py-1.5 font-mono text-[10px] text-slate-300 max-w-[80px] whitespace-pre-line break-words">
          {tc.reveal ? formatInputs(tc.inputs) : <span className="text-slate-600 italic">hidden</span>}
        </td>
        <td className="px-2 py-1.5 font-mono text-[10px] text-slate-300 max-w-[100px] truncate">
          {tc.reveal ? formatExpected(tc.out) : <span className="text-slate-600 italic">hidden</span>}
        </td>
        <td className="px-2 py-1.5 text-center">
          <div className="flex items-center justify-center gap-1">
            {tc.passed ? <PassIcon /> : <FailIcon />}
            {hasDetail && (
              <button type="button" title="Toggle details" onClick={() => setExpanded(o => !o)}
                className="text-slate-500 hover:text-slate-300 transition-colors ml-1">
                <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && tc.reveal && tc.reqResults.length > 1 && (
        <tr className="border-t border-slate-700/50 bg-slate-900/40">
          <td colSpan={4} className="px-3 py-1.5">
            <div className="space-y-0.5">
              {tc.reqResults.map((rr, ri) => (
                <div key={ri} className="flex items-center gap-1.5 text-[10px]">
                  {rr.passed ? <PassIcon size={11} /> : <FailIcon size={11} />}
                  <span className="text-slate-500">[{rr.typ}]</span>
                  <span className="font-mono text-slate-400 truncate">{rr.statement ?? rr.filename ?? rr.pattern}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
      {!tc.passed && tc.reveal && tc.error && (
        <tr className="border-t border-slate-700/50 test-error-row">
          <td colSpan={4} className="px-3 py-1 text-[10px] test-error-text font-mono">
            {tc.error.split('\n').slice(-3).join('\n')}
          </td>
        </tr>
      )}
      {!tc.passed && tc.reveal && tc.output !== undefined && (
        <tr className="border-t border-slate-700/50 bg-slate-900/40">
          <td colSpan={4} className="px-3 py-1.5 text-[10px]">
            <span className="text-slate-500">Actual output:</span>
            <pre className="mt-0.5 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-slate-300">
              {tc.output || '(no output)'}
            </pre>
          </td>
        </tr>
      )}
    </>
  )
}

export function TestResultsBar({ result, isRunning, status, onClose }: Props) {
  const [showTable, setShowTable] = useState(false)

  if (!result && !isRunning) return null

  const passed = result?.results.filter(r => r.passed).length ?? 0
  const total = result?.results.length ?? 0
  const allPassed = result?.allPassed ?? false
  const hasRevealable = result?.results.some(r => r.reveal) ?? false

  return (
    <div className="flex-shrink-0 border-b border-slate-700 bg-slate-900/70">
      {/* Summary bar */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        {isRunning ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin text-sky-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-xs text-slate-400 flex-1 truncate">{status || 'Running tests…'}</span>
          </>
        ) : (
          <>
            <div className="flex-shrink-0">
              {allPassed ? <PassIcon size={15} /> : <FailIcon size={15} />}
            </div>
            <span className={`text-xs font-semibold flex-shrink-0 ${allPassed ? 'text-emerald-400' : 'text-red-400'}`}>
              {allPassed ? 'All passed' : `${passed}/${total} passed`}
            </span>
            {hasRevealable && (
              <button type="button"
                onClick={() => setShowTable(o => !o)}
                className="text-xs text-sky-400 hover:text-sky-300 transition-colors flex-1 text-left truncate">
                {showTable ? 'Hide test cases' : 'Show test cases'}
              </button>
            )}
            {!hasRevealable && <span className="flex-1" />}
          </>
        )}
        <button type="button" onClick={() => { setShowTable(false); onClose() }}
          title="Close test results"
          className="text-slate-500 hover:text-slate-200 flex-shrink-0 transition-colors p-0.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Expanded test table */}
      {showTable && result && (
        <>
          <div className="border-t border-slate-700" />
          <div className="test-results-scroll overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-900 z-[1]">
                <tr>
                  <th className="px-2 py-1 text-left text-slate-500 font-normal">#</th>
                  <th className="px-2 py-1 text-left text-slate-500 font-normal">Input</th>
                  <th className="px-2 py-1 text-left text-slate-500 font-normal">Expected</th>
                  <th className="px-2 py-1 text-left text-slate-500 font-normal w-10"><span className="sr-only">Result</span></th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((tc, i) => (
                  <TestCaseRow key={i} tc={tc} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
