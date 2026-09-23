/**
 * `quit()`, `exit()` and `sys.exit()` end a program by raising `SystemExit`.
 * Under CPython that is a normal ending: the interpreter catches it at the top
 * and stops quietly. Under Pyodide nothing does, so it escaped the student's
 * program like any other exception and the run was reported as a failure — a
 * menu-driven program that ends with `quit()` finished on a red traceback.
 *
 * `runProgramPython` wraps the statement that executes the student's code so
 * that it ends the way CPython would: silently for `exit()`, `exit(0)` or any
 * integer status, and with the message on stderr for `sys.exit("message")`.
 * Every other exception still propagates unchanged.
 *
 * It catches `SystemExit` only. The trace worker's own stop signals derive
 * from `BaseException` directly, so a Stop or a trace-limit halt is not
 * mistaken for the program choosing to end.
 */
export function runProgramPython(execStatement: string): string {
  return [
    'try:',
    `    ${execStatement}`,
    'except SystemExit as __coder_exit:',
    '    if __coder_exit.code is not None and not isinstance(__coder_exit.code, int):',
    '        import sys as __coder_sys',
    '        print(__coder_exit.code, file=__coder_sys.stderr)',
    '',
  ].join('\n')
}
