# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

**Dev server (with HMR):**
```
npm run dev
```
Serves on `http://localhost:3000` with hot module replacement. Requires no build step.

**Production build:**
```
npm run build
```
Compiles TypeScript and bundles with Vite into `dist/`. TypeScript errors will fail the build.

**Serve production build locally:**
```
npm start
```
Runs `server.mjs` serving `dist/` on `http://localhost:3000`.

**Preview production build (Vite):**
```
npm run preview
```
Vite's own preview server serving `dist/` on `http://localhost:3000`.

## Testing / verifying changes

Three layers, all of which should pass before a change is called done:

- **`npm test`** — vitest, ~29 files. Pure logic, plus
  `tracer.worker.integration.test.ts`, which executes the tracer's *actual*
  embedded Python under native `python` and asserts the JSON protocol. That
  harness needs Python **3.11+** and skips itself (with a stated reason) below
  that — `co_qualname` and instruction `positions` arrived in 3.11, and without
  them closures cannot be tied to their defining activation.
- **`npm run test:e2e`** — Playwright (`e2e/`, Chromium), a real browser driving the real
  dev server and the real Pyodide. `smoke.spec.ts`: the app loads, a program runs
  and prints, a syntax error is reported against `simulation.py`, matplotlib draws
  a figure. `book.spec.ts`: the student's path — open a numbered book, read the
  instructions, run an exercise, see it tick — with the book served by the test
  itself through `page.route`, so it needs no fixture in `public/` (which would be
  deployed) and no repository staying where it is. `bookfiles.spec.ts` does the
  same for a `book.json` activity whose files sit in subfolders and whose program
  ends with `quit()`. `input.spec.ts` covers `input()` in every runtime (worker,
  main thread with JSPI, the `window.prompt` fallback, turtle, pygame, stdctx,
  fixed inputs, every input mode, Stop while waiting); `isolation.spec.ts` checks
  that everyone is sent `credentialless` (so WebKit is *not* isolated), that the
  runner is offered either way, and that `?isolation=on` / `off` switch
  `require-corp` on and off. `tkinter.spec.ts` drives tkinter
  programs (a form and message box, canvas keys, ttk, a GUI in an imported
  module, an `update()` game loop, `tkraise` pages, two `Tk()`s in a row, the
  no-JSPI fallback) and runs every page of the shipped Tkinter book.
  `workflow.spec.ts` covers the keyboard shortcuts (font size, F5 / Ctrl+F5 /
  Ctrl+Shift+F5, F11), Stay on run view, New file opening in the editor, and
  the tab group. `display.spec.ts` covers the Display pane across runs: emptied
  at every run's start, the console folding for a drawing and opening on the
  first print, and input() borrowing the Console tab until the next drawing.
  `indent.spec.ts` covers per-file indentation (a four-space exercise after a
  two-space one, Enter after a colon, re-indenting from the cog menu).
  `recovery.spec.ts` covers the unsaved-changes backup (offered after a reload,
  restored or discarded) and a crashed Pyodide being reset and re-run once.
  `transport.spec.ts` covers the trace worker's second way of waiting and the
  step down between them: a page stripped of its isolation headers still
  debugging, Trace stepping / Stop / `time.sleep` over the service worker,
  shared memory that silently does not work falling back to the service
  worker, no service worker either falling back to the main thread, and a
  browser that refuses to start workers by address still getting both the
  debugger and Submit from copies (the only e2e coverage Submit has). A
  program that only draws leaves its console folded, so specs read its
  transcript through the Copy button rather than the rows. `tkinter.spec.ts` sets the
  editor through Monaco's API rather than `insertText`, which re-indents every
  line after a colon, and reads the console through its copy button, because a
  finished run shrinks the console below what the program printed. Shared helpers live in
  `e2e/helpers.ts`; `watchForErrors` takes `ignoreRequestsTo` because a numbered
  book finds its end by asking for a file that is not there, and the browser logs
  that 404 as a console error. Needs network (Pyodide comes from a CDN), ~50s.
- **`npm run test:e2e:webkit`** — the Safari engine (after `npx playwright install
  webkit`): `isolation.spec.ts`, `input.spec.ts` and `transport.spec.ts` only. Playwright's WebKit build
  ships SharedArrayBuffer switched off (microsoft/playwright#28513), so the config
  passes `JSC_useSharedArrayBuffer=true`, and every test that needs SAB or JSPI
  skips itself with the reason when the build lacks it. WebKit is not isolated
  by default, so nearly everything here runs the worker over the service worker
  — which is what Safari students get. The one test that wants shared memory
  sets the `coder_isolation` cookie first. CI runs this as its own job.
- `E2E_BASE_URL=http://localhost:3100 npx playwright test …` points the suite
  at another server — the production build under `npm start`, whose workers
  are classic scripts where the dev server's are modules. Worth doing for
  anything that touches how a worker starts.
- **`npm run test:all`** — typecheck, then vitest and the Chromium e2e run.

`.github/workflows/ci.yml` runs the typecheck, vitest, the build, the Chromium
e2e run and the WebKit e2e run on every push and PR.

- When driving the app with Playwright to verify a change, **also capture the browser
  console** (`page.on('console', …)` for `error`/`warning` and `page.on('pageerror', …)`)
  and confirm no new errors appear. Don't rely on screenshots alone.
- **Never set editor text with `page.keyboard.type`.** Monaco closes brackets and
  quotes as you type, so `print("hi")` becomes `print("hi")")` and the test then
  asserts against a program nobody wrote. Use `page.keyboard.insertText`.
- **The console is an xterm terminal, and xterm paints on `requestAnimationFrame`.**
  A browser tab that is hidden or throttled does not paint, so reading
  `.xterm-rows` back from an automated session that is not actually displaying
  the page returns blank rows while `term.buffer.active` holds every line. This
  has been mistaken for "the runtime swallowed the output" more than once — read
  the buffer, or force a paint, before believing output is missing.
- `@monaco-editor/react` throws a harmless `Canceled` rejection when a Monaco editor model
  is disposed mid-operation. It is suppressed in `main.tsx` (unhandledrejection/error
  listeners), and the code editor keeps Monaco mounted (overlaying a placeholder rather than
  unmounting) to avoid churning it. If you see `Canceled` in Playwright's `pageerror`, it is
  this known-benign case (Playwright reports it pre-suppression) — verify it is absent in a
  real browser's console before treating it as a regression.

## Architecture

This is a **Vite 5 + React 18 + TypeScript** application. Source lives in `src/`, production output goes to `dist/`.

### Source layout

`App.tsx` is the large root component that owns essentially all state, effects, and
layout. Most features are wired there; the files below are the supporting pieces.

```
src/
  main.tsx                    # Entry point — wraps <App/> in <DialogProvider>
  App.tsx                     # Root component — all state, effects, layout
  types/index.ts              # Shared TypeScript types
  constants.ts                # App-wide constants
  fsa.d.ts                    # File System Access API type augmentations
  styles/index.css            # Global CSS + Tailwind directives + light-theme overrides
  data/
    explanations.ts           # Function explanation copy
  python/
    tkinter/                  # Coder's own tkinter package (real .py files, ?raw-imported)
  workers/
    tracer.worker.ts          # Pyodide trace worker (imported via ?worker)
    workerSync.ts             # how that worker blocks on the page: shared memory, or a held request
    tester.worker.ts          # Pyodide worker for running challenge tests
  utils/
    codeAnalysis.ts           # Python source parsing (classes, functions, outline)
    importGraph.ts            # which .py files a run can reach through its imports
    virtualFS.ts              # IndexedDB-backed virtual filesystem (multiple named FSes)
    bookLoader.ts             # Learning "book" manifest/challenge loading
    simpleBook.ts             # Books with no book.json — a flat folder of .py exercises
    githubRepo.ts             # Parse/browse a public GitHub repo (directory listings)
    htmlPreview.ts            # HTML file preview helpers
    stdctx.ts                 # sys.stdctx / sys.stdaud (Python bootstrap + renderers)
    matplotlib.ts             # Agg backend bootstrap; plt.show() → a PNG in the Display pane
    plotly.ts                 # plotly bootstrap (fig.show() → HTML) + micropip installs
    tkinter.ts                # tkinter detection + main-thread bootstrap (writes the package)
    tkinterRenderer.ts        # draws tkinter windows as DOM in the Display pane
    vfsMediaUrl.ts            # deduped blob URLs for VFS-backed media (stdaud, drawImage)
    pyodideFs.ts              # which Pyodide MEMFS dirs are off-limits when syncing back
    pyodideReset.ts           # Python-side reset that makes a reused Pyodide look fresh
    pyodideCrash.ts           # telling a dead Pyodide from a failed program
    traceSyncProtocol.ts      # what the page and the trace worker say to each other, either way
    traceChannel.ts           # the page's end of that, and the service worker's registration
    runtimeFallback.ts        # shared memory → service worker → main thread: when to step down
    workerBoot.ts             # starting a worker from a blob copy when its address is refused
    isolationSwitch.ts        # ?isolation=on|off: the cookie that asks the server for require-corp
    editorDraft.ts            # per-filesystem backup of the editor's unsaved changes
    testMatcher.ts            # Challenge test evaluation
    download.ts               # File download helpers
    export.ts                 # Note/docstring export formatting
    mainThread.ts             # Main-thread Pyodide loader + Pygame bootstrap
    mainThreadInput.ts        # input() on the main thread: JSPI, pop-up fallback
    isolationStatus.ts        # Why a tab is not cross-origin isolated, in words
    storage.ts                # localStorage helpers (theme, notes, fixed inputs, layout)
    shortcuts.ts              # F5 / Ctrl+F5 / Ctrl+Shift+F5 / F10 / F11 → an action
    tabGroup.ts               # the central column's tab group (pure layout rules)
    versionCheck.ts           # Background poll for new deployed versions
  components/
    InspectorPane.tsx         # Variable inspector with breadcrumb navigation
    FileSystemPanel.tsx       # Virtual filesystem browser + local-folder connect/sync
    BookPanel.tsx             # Learning book navigation + challenge runner
    ConsoleTerminal.tsx       # xterm-based interactive console (inline-console input mode)
    DisplayPane.tsx           # All visual output, directly below the Console
                              #   surfaces: canvas | tkinter | turtle | stdctx | plot
    CanvasPane.tsx            # stdctx canvas (a surface of the Display pane)
    TurtleScrubber.tsx        # Turtle SVG history scrubber (Display pane header)
    HtmlPreviewDialog.tsx     # Sandboxed HTML preview
    TestResultsBar.tsx        # Challenge test results
    dialogs/
      DialogProvider.tsx      # Promise-based styled confirm/choose/prompt/alert (useDialogs)
      ConfirmDialog.tsx       # Styled confirm dialog (with optional warning + checkbox)
      SaveFileDialog.tsx      # Save-to-VFS path/name picker
      GitHubRepoBrowser.tsx   # Pick a book.json / ZIP / folder inside a repository
      SimpleBookOption.tsx    # The "simple learning book" tick and its (i) explainer
    ui/
      IconButton.tsx  FoldButton.tsx  ThemeToggleButton.tsx  ExecutionModeDialog.tsx
      PanelVisibilityMenu.tsx  DiagramFontControls.tsx  SettingsDialog.tsx
      TabGroupDialog.tsx  PanelTabStrip.tsx
    diagrams/
      diagramLayout.ts        # Layout algorithms for SVG diagrams
      HierarchyChart.tsx      # Function call hierarchy SVG
      UmlDiagram.tsx          # UML class/composition SVG
      OutlinePanel.tsx        # Code outline tree
```

### Tech stack

- **Vite 5** — dev server with HMR, production bundler
- **React 18 + TypeScript** — component framework
- **Tailwind CSS v3** — utility styles via PostCSS (not CDN)
- **`@monaco-editor/react`** — Monaco Editor React wrapper
- **Pyodide v0.29.3** — Python runtime in the browser via WebAssembly (loaded from CDN in the worker)

### Cross-origin isolation: Chromium and Firefox have it, WebKit deliberately does not

`SharedArrayBuffer` (the trace worker's first choice for waiting on the page;
see *Two ways for the worker to wait* for what happens without it) requires the
page to be cross-origin isolated. Every response carries:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`
- `Origin-Agent-Cluster: ?1`

Chromium and Firefox honour `credentialless` and are isolated. **WebKit — Safari
on Mac, and *every* browser on an iPad or iPhone (Chrome, Edge and Firefox on
iOS are WebKit underneath) — has never implemented it, reads it as no policy,
and so is not isolated. That is now on purpose.**

**What happened when WebKit was isolated.** For a week WebKit was sent
`require-corp` instead, chosen by User-Agent, which it does honour. On every
real Safari it met (two Macs and an iPad) the page then *was* isolated and could
not start a single worker: `new Worker(...)` fired a bare `error` event with no
message, for the trace worker and — presumably — the test runner alike, so
students lost Debug and were left on the main thread with pop-up input. The
worker script was arriving with a matching `require-corp` (checked against the
live site as Safari: plain, compressed, revalidated, from an iPad UA), which is
the one thing WebKit is known to demand of it. **The cause is still unknown.**
It does not reproduce in WebKitGTK or in Playwright's WebKit, on the dev server
or the production build; both of those need SharedArrayBuffer forced on by a
JavaScriptCore option, so neither arrives at isolation the way Safari does.

So the arrangement that is known to work is the one in use: a WebKit page that
is not isolated starts workers like any other site, and the trace worker waits
on a service worker there, which needs no isolation and is how Python Sponge
ran on Safari.

**`?isolation=on`** is how the isolated arrangement is still reached, on one
device and on purpose: `utils/isolationSwitch.ts` (called from `main.tsx`,
before anything renders) sets the `coder_isolation` cookie and reloads without
the parameter; from then on that browser is sent `require-corp`, page and
worker scripts alike. **`?isolation=off`** clears it. It exists so the Safari
failure can be investigated — with the diagnostics below — without putting any
student back in it. A cookie rather than the query string because the worker
scripts have to be served to match the page, and they are requested without it.

`scripts/isolationPolicy.mjs` (`embedderPolicyFor`, `isolationHeadersFor`,
`applyIsolationHeaders`) reads the cookie, adds `Vary: Cookie`, and is the only
place the choice is made. `isWebKitUserAgent` survives there for the page's own
explanations (`utils/isolationStatus.ts`); the headers no longer depend on it.

Where it is applied:
- `vite.config.ts` — `isolationHeadersPlugin`, a middleware on every dev/preview
  response (it cannot go in the static `server.headers`).
- `server.mjs` — production Node server, every response.
- **Cloudflare Pages** — `public/_headers` is static and says `credentialless`,
  which is right for everything unless the cookie is present. It cannot read a
  cookie, so `functions/_middleware.ts` sets the headers on the two kinds of
  response that decide isolation, and `public/_routes.json` routes only those
  through the Function, so it runs once per page load and once per worker
  rather than per asset:
  - `/` and `/index.html` — the page's COEP decides whether it is isolated;
  - `/assets/workers/*` — a `require-corp` page cannot start a dedicated worker
    whose script's COEP does not match its own (verified in WebKitGTK). That is
    why `vite.config.ts` sends worker bundles to `assets/workers/`
    (`worker.rollupOptions.output`), and why those responses vary on the
    cookie: they are cached for a year.
  Cloudflare does not apply `_headers` to a response that passed through a
  Function, so the middleware repeats the cache headers for those routes.
  `pagesMiddleware.test.ts` runs the function itself; `wrangler pages dev dist`
  runs it locally. The live site is `pythoncoder.pages.dev` — `curl -A` with a
  Safari user agent against it is how the headers were checked.

What `require-corp` costs, where it is switched on: a cross-origin resource
loaded *without* CORS must send `Cross-Origin-Resource-Policy`. jsDelivr
(Pyodide and its packages, Monaco) and raw.githubusercontent.com send
`cross-origin-resource-policy: cross-origin` and `access-control-allow-origin: *`
(checked September 2026). Checked in WebKitGTK:
- **plotly figures are unaffected**: plotly's own `<script>` tag carries
  `crossorigin="anonymous"` and an SRI hash, so it is a CORS load. Do not rewrite
  its URL — the SRI hash is for cdn.plot.ly's exact bytes.
- **The HTML preview keeps `credentialless` whatever the page has**
  (`public/vfs-preview-sw.js`), so a student's page can use images from any
  server. Giving the frame `require-corp` blocked every image whose server sends
  no CORP.
- A guide or page `<img>` straight from a site that sends neither CORP nor CORS
  is blocked under `require-corp` (it loads under `credentialless`).

The banner shown when the trace worker cannot run at all says *why* in plain
words. A tab that tried and failed quotes what went wrong
(`workerUnavailableMessage`); one that never could — no shared memory *and* no
service worker — gets `utils/isolationStatus.ts`: framed by another page, not
https, isolated but no SharedArrayBuffer, a WebKit tab with no service worker
(a private window, usually), or headers missing generally.

### How the tracer works

1. The user pastes Python code into the Monaco editor.
2. On "Run", the main thread creates a **Web Worker** from `src/workers/tracer.worker.ts` (bundled by Vite as an IIFE so it can call `importScripts`).
3. The worker calls `importScripts` to load Pyodide from CDN, then injects a Python `sys.settrace` hook that calls back into JS (`js_trace_callback`) on every line.
4. The worker **blocks** after each trace event until the user clicks Step/Continue. Normally that is `Atomics.wait` on a **SharedArrayBuffer** (4 KB) the main thread writes to and notifies; where that is unavailable or does not work, it is a synchronous request a service worker holds open (next section).
5. Trace state (current line, variables, object graph) is posted back as structured messages and rendered by the React UI.

### Two ways for the worker to wait, and stepping down when one fails

- A tab used to be judged once, at load, by `crossOriginIsolated`: isolated
  meant the trace worker was offered, not isolated meant a banner and the main
  thread. That check says the worker *should* work. Safari, isolated by the
  `require-corp` experiment (previous section), passed it and then failed
  **every** run, leaving students to find the Execution setting.
- **The first version of this fallback did not help Safari**, and it is worth
  knowing why: both transports live *inside* the worker, and Safari's failure
  was that the worker would not start at all. The tab went shared memory →
  service worker → main thread and reported `Worker failed to start: unknown
  worker error`. What fixed Safari was no longer isolating it; what this
  section adds on top is a worker that can be started a second way (*A worker
  the browser will not start*, below).
- So there are now three rungs (`utils/runtimeFallback.ts`), and **a run
  proves its rung**:
  1. **`sab`** — the trace worker, waiting on shared memory;
  2. **`xhr`** — the trace worker, waiting on a **synchronous XMLHttpRequest
     to an address that does not exist**, which `public/trace-sync-sw.js`
     holds open until the page posts the answer. This is what Python Sponge
     did (`oldpythongsponge/public/pysw.js`). It needs no isolation at all;
  3. **`none`** — the main thread, without stepping or the inspector.
- **A tab that is not isolated starts on `xhr`, not on a banner.** That is
  every WebKit tab, and also a school filter stripping the headers or an
  embedding page: none of them costs the student the debugger.
- **The handshake.** The first thing a run's worker does, before Pyodide or
  any Python, is `sync.probe`: announce (`sync-probe`), block, and expect the
  page's answer within `PROBE_TIMEOUT_MS`. It has to be then — a program that
  is already executing cannot be moved to another transport.
- **What counts as the runtime's failure** rather than the program's — the
  worker marks it on its `error` message as `failure`:
  `transport` (the handshake failed, or a wait threw mid-run — `watchSync`
  notes it where it happens, because it reaches the catch block wrapped in a
  Python exception), `load` (Pyodide would not load in the worker), `start`
  (the worker's own code threw, or `worker.onerror`). A fourth, `crash`, is
  decided by the page: Pyodide dead again straight after the automatic reset,
  in a tab where no worker run has ever reached the program
  (`workerProvenRef`, set by the worker's `started` message).
- **What happens then** (`decideFallback`, carried out by
  `scheduleWorkerFallback` in `App.tsx`): any failure on shared memory except
  `load` moves the tab to the service worker and runs the program again there
  — a crash as much as a failed handshake, because on a browser nobody can
  debug, "it might be the shared memory" cannot be ruled out by reasoning. A
  `load` failure is the same download on either transport, and a worker that
  fails on the service worker too has nothing left to change, so those run the
  program on the main thread at once, and the worker is given one more run
  before the tab settles on `none` (a dropped connection while Pyodide loads
  looks identical). Either way the re-run opens with a note saying what happened
  and `What went wrong: …`, which is the worker's own account plus
  `[while <stage>; waiting by …; isolated: …; SharedArrayBuffer: …]`
  (`withContext`). On a browser nobody can attach a debugger to, the Copy
  button on that note is the diagnosis.
- The rung is remembered per tab (`sessionStorage`) **and per build**, so a
  tab does not fail the same way on every run — but a tab reloaded onto a newer
  version starts from the top again. Without the version, a tab that had
  settled on the main thread stayed there through the very release that fixed
  what sent it there (the "new version, reload" prompt reloads in place, and
  sessionStorage survives a reload). The banner for `none` quotes the reason
  and offers **Try again**. With `none`, `selectedRuntime` is the main thread by
  itself — nobody has to find the setting.
- **`?transport=sab|xhr|none`** puts a tab on one rung, which is how one is
  tried on a particular browser (and how the e2e spec reaches `xhr` in a
  browser that has shared memory).
- `App.tsx` never touches a SharedArrayBuffer or the service worker. It holds
  one `TraceChannel` per run (`utils/traceChannel.ts`); the worker holds the
  matching `WorkerSync` (`workers/workerSync.ts`); `utils/traceSyncProtocol.ts`
  is what both agree on, including the buffer layout. `workerSync.test.ts`
  joins the two halves of each transport directly.
- **The service worker is a relay, never a source of truth**, because the
  browser may kill it at any moment. A held request is released with `204`
  after 20s and the worker asks again; a request for a session the service
  worker has never heard of makes it post `coder-sync-resync`, and the page
  sends its state and any unanswered reply again. It answers only under
  `/__coder_sync__/`; every other request returns from its fetch handler
  untouched.
- It is registered **only when the `xhr` rung is used**, at scope `/` — it
  has to control the page, because in Chromium a worker inherits its
  controller from the page that made it. A worker created before the service
  worker took control never hears from it, which is why changing rung discards
  the parked worker and `prepareTraceWorker` waits for the controller.
- An answer is recognised by its `X-Coder-Sync` header. Plenty of servers —
  this app's dev server included — answer any unknown address with their index
  page and a `200`, and a worker that believed that would parse HTML as its
  debugger command.
- Things the worker *polls* rather than waits for cannot cost a request per
  traced line: the stop flag is asked for at most every 200ms and held keys
  every 25ms, and a `time.sleep()` response carries the key state, so a game
  loop that sleeps each frame never polls at all.
- **The page often answers before the worker has begun to wait** — the
  message is handled faster than the worker gets from `postMessage` to
  `Atomics.wait` (measured in Chromium). Shared memory copes because the wait
  compares a value the answer has already changed, so every answer, a stop
  request included, must *change the state word*, not merely notify. The
  service worker copes by keeping an early reply for the turn it answers.
- A stepping round trip over the service worker measured ~4ms in Chromium and
  ~70ms in Playwright's WebKit. A plain Run or Debug with no breakpoints makes
  no round trips at all.
- **`page.route` cannot see a request once a service worker controls the
  page** (Playwright, WebKit at least), and a WebKit page registers one as it
  loads. A WebKit test that serves a book through `page.route` therefore has to
  keep the page off the `xhr` rung (`?transport=none`); the real site is
  unaffected, since the service worker passes every other request straight on.

### A worker the browser will not start

- `new Worker(<address>)` asks the browser to fetch the script *as a worker*,
  and a browser can refuse that fetch — the script's embedder policy against
  the page's, its MIME type, a filter in between — and says only that it
  failed: a bare `error` event, no message. That is what Safari did.
- `utils/workerBoot.ts` starts the worker a second way: the page fetches the
  same script as ordinary data and the worker is made from a `blob:` copy. A
  blob has no response headers to object to, and a blob worker takes its
  policies and its service worker from the page that made it. In the dev
  server, whose workers are modules importing other modules by address, the
  blob is a one-line `import` of the real script instead.
- It applies to **both** workers — the trace worker and the tester behind
  Submit (`startAppWorker` in `App.tsx`). Submit had no fallback of any kind.
- A worker counts as "would not start" only if it failed **before saying
  anything** and was started the ordinary way (`failedToBoot`): each worker's
  boot is recorded, and each is noted as heard from on its first message. Every
  other `onerror` is a `start` failure and goes down the ladder as before.
- The warm-up worker usually finds out first, at page load, so the switch has
  happened before the student presses anything and nothing is printed. A run
  that finds out itself gets the failure kind `boot`: same rung, started from a
  copy, with a note — and `What went wrong` carries what the page's own fetch
  of the script saw (`describeWorkerScript`: status, type, embedder policy)
  and whether the page is isolated. That is the diagnosis the bare event
  withheld. Submit retries itself the same way without the student pressing it
  again.
- A worker started from a copy lives at a `blob:` address, so the page sends
  its own origin in `init` (`syncOrigin`) rather than the worker reading
  `self.location`.
- The worker also listens for `messageerror`: an `init` carrying a
  SharedArrayBuffer to a worker that may not have one is delivered as that and
  nothing else, which would be a run that never started and never said why.

### One Pyodide per session, not per run

- Compiling Pyodide dwarfs everything else about starting a run, so **neither
  runtime reloads it**: the main thread caches its instance
  (`loadMainThreadPyodide`) and the trace worker is *recycled* after a run
  instead of terminated. `holdIdleTraceWorker` (`App.tsx`) parks the idle worker
  — a freshly warmed one and a recycled one land in the same place — and the next
  Debug/Trace/Run claims it.
- A reused runtime has to be made to look freshly started, which is
  `PYODIDE_RUNTIME_RESET_CODE` (`utils/pyodideReset.ts`), run by both runtimes
  before mounting the next run's files: drop a live `sys.settrace` hook, restore
  the `time.sleep` the stdctx bootstrap patched, and evict every module whose
  `__file__` is outside `/lib` — Pyodide's own stdlib and site-packages live
  there, so anything else came from the working directory and would otherwise be
  served stale after the student edits it. It also sets `dont_write_bytecode`,
  since a `__pycache__` beside a student's module would be swept into their
  filesystem by the post-run walk.
- The worker additionally unlinks every path it has mounted *or written*
  (`touchedPaths` in `tracer.worker.ts`), so a file the last activity created
  cannot appear in the next one.
- `releaseWorker(recycle)` only recycles after a terminal `done`/`error`, which
  proves the worker's Python has unwound and it is back in its own event loop.
  A forced stop, a failed worker, and a trace that hit the event limit (it parks
  itself in `Atomics.wait` on purpose) all terminate instead.
- A pygame run ends with `pygame.quit()`, which tears down SDL and resizes the
  shared canvas to 0x0 — wiping the drawing the instant the program that made it
  ends. Skipping quit() is not an option (this Pyodide is reused and the next run
  needs a clean SDL), so `js_pygame_snapshot_canvas` lifts the finished frame off
  the canvas and `js_pygame_restore_canvas` paints it back, either side of the
  quit. A pygame drawing then outlives its program exactly as a turtle drawing
  does.
- **Reset Pyodide is the only full teardown** — and therefore drops a worker
  mid-run as well as the parked one, or the next Debug would pick the same
  runtime straight back up.
- The main thread's equivalent of `touchedPaths` is
  `mainThreadMountedPathsRef`, unlinked by `cleanFilesFromPyodide` before the
  next run mounts. It must **not** be cleared when the editor switches
  filesystem: it records what is in the cached Pyodide's own filesystem, which a
  UI-level switch does not change, and forgetting it left the last activity's
  files in place for the post-run walk to sweep into the next activity's
  filesystem.

### A crashed Pyodide is reset and the run tried again, once

- A Python exception leaves Pyodide usable; a *fatal* error (a wasm trap, an
  internal failure) does not. Pyodide then marks the error
  `pyodide_fatal_error` and makes every public property of the instance throw
  "Pyodide already fatally failed". Both runtimes keep their Pyodide between
  runs, and the trace worker was recycled after *any* reported error — so one
  crash broke every later run until the student found Reset Pyodide. The next
  `init` even threw from `pyodide.globals.set`, outside any try, and the run sat
  on "Debug runtime starting..." for good.
- **A fatal error inside `runPythonAsync` can leave that promise unsettled
  forever**, so no catch block ever hears of it. Pyodide calls
  `pyodide._api.on_fatal` as it dies; the worker (`reportFatal`) and the
  main-thread run both hook it, and the run is ended from there.
- `utils/pyodideCrash.ts`: `isPyodideFatalError` reads the error,
  `isPyodideUsable` runs `None` — the error text alone is not enough, because
  what the program reports is often the trap, not Pyodide's message. The worker
  also checks a recycled Pyodide is usable before its first `globals.set`.
- A fatal worker `error` carries `fatal: true` and the worker is terminated,
  never recycled. `scheduleCrashRecovery` (`App.tsx`) then waits for React to
  commit the run's end, does what Reset Pyodide does (`resetPyodideRuntimes`),
  and starts the same run again with a note saying why. `crashRetryRunRef`
  marks that run as the retry, so a second crash is reset but *not* retried —
  a program that crashes Pyodide by itself cannot loop. Any run the student
  starts meanwhile cancels a pending recovery (`crashRecoveryTokenRef`).
- The e2e spec crashes it on purpose with `pyodide_js._api.fatal_error(...)`.

### Unsaved changes survive the page closing

- One file is open at a time and every file or filesystem switch already asks
  about unsaved changes, so the only way to lose them was the page itself going
  — the browser closed, the tab crashed. `utils/editorDraft.ts` keeps what the
  editor holds whenever it differs from the saved file: **one backup per
  filesystem**, so per book activity as well as the student's own.
- It is **localStorage, not a hidden file in the virtual filesystem.** A file
  there would be mounted into every run, swept into ZIP downloads, mirrored to
  a connected folder's disk, and need hiding everywhere. localStorage is also
  synchronous, which is what lets `pagehide` / `visibilitychange` write the
  last keystrokes as the tab goes; the rest is written 500ms after typing stops.
- Cleared by every save — `saveCurrentToVFS`, so every run too — by an explicit
  "Don't save", and by `deleteFilesystem` (Reset challenge, Reset book).
- Offered when a filesystem becomes active, but only after startup routing has
  settled (`startupSettled`), so a `?book=` link offers the activity the student
  lands in rather than `default`. Nothing is offered unless the backup differs
  from the saved file. **Restore** puts the changes back *unsaved*, exactly as
  left; **Use last saved version** discards it. While the question is open
  `draftGateFsRef` stops the auto-opened file's clean state from clearing it,
  and a dismissed dialog keeps it until the student types.
- Off in book edit mode: its Solution tab saves into the book's source
  filesystem, not the one on screen.

### UI conventions

- **No native browser dialogs.** Never use `window.confirm`, `window.alert`, or
  `window.prompt`. Use the promise-based styled dialogs from `DialogProvider`
  via the `useDialogs()` hook: `confirm`, `choose` (arbitrary buttons), `prompt`,
  `alert`. They are theme-aware and match the app's look. The one deliberate
  exception is `js_input_prompt` in `App.tsx` — the fallback for Pyodide
  `input()` on the main thread in a browser without JSPI, which must stay
  synchronous (see *input() on the main thread* below). It is commented as such;
  leave it.
- The app is **theme-aware** via `html[data-theme="light"]` overrides in
  `styles/index.css` (default is dark). Components use dark-oriented Tailwind
  `slate-*` classes; the light theme remaps them. If you introduce a color that
  must read in both themes and isn't already overridden (e.g. a translucent
  `bg-*/10` tint or an amber warning), verify it in light mode or add an override.
- Prefer translucent tints (e.g. `bg-slate-500/20`, `bg-emerald-500/10`) for
  subtle selection/highlight states so they work in both themes without overrides.
- A scroller nested in the left sidebar's scrolling column takes
  `section-scroll` (`styles/index.css`): thinner and trackless, so when both
  scroll it reads as the card's own bar rather than a second copy of the
  column's. Inside a flex-column scroller, a child with `overflow-hidden` (for
  rounded corners) needs `flex-shrink-0` — `overflow-hidden` drops a flex
  item's minimum height to zero, so it shrinks to fit and clips instead of
  letting the scroller scroll. That is why the variable inspector never showed
  a scroll bar.

### Student links (URL parameters)

- The app reads these query parameters at startup (`App.tsx`, `utils/urlRunMode.ts`):
  `?book=<url>` (a `book.json` or a book ZIP), `?challenge=<id>`, `?showFirst`,
  `?simple` (read `?book=` as a *simple learning book*), `?mode=trace|run|debug`,
  and `?filesystem=<url>`. `buildShareLink` (`utils/bookSource.ts`) is the only
  place that composes them. (`?transport=` and `?isolation=` are diagnostics,
  not student links: see *Two ways for the worker to wait* and the isolation
  section.)
- `?challenge=` resolves through `findBookTargetById` (`utils/bookLoader.ts`),
  which walks the whole tree depth-first: an **activity** id enters that
  activity, a **sub-book** id opens that section's contents. Ids are not
  guaranteed unique across a tree — one shipped template reuses one — so it
  takes the first match, and the link dialog warns when the chosen id is
  ambiguous.
- A link always names the **root** book plus an id, never a sub-book as the
  root. Completion ticks are keyed `${rootUrl}::${challengeId}`, so promoting a
  sub-book to root would silently give the student a separate tick history.
- A target that no longer exists must not strand the student: `handleOpenBookTarget`
  leaves the book open at its contents with a status message.
- Teachers reach link building two ways, both opening `dialogs/StudentLinkDialog.tsx`:
  right-clicking a row or breadcrumb in the Book panel, or the **Student links**
  box in Teacher Tools. The Teacher Tools route builds links from the catalog
  (`public/learning-tutorials.json`, via `utils/tutorialCatalog.ts`) or a pasted
  URL **without opening the book** — deliberately, because `openResourceUrl`
  calls `hideTeacherToolsPanel()` and would pull the panel out from under them.
- `resolveBookShareSource` decides whether a book can be linked at all. A book
  unzipped from a URL still can: `loadFilesystemFromUrl` names the filesystem
  after its source URL. A locally authored or locally imported book cannot, and
  the dialog shows publishing instructions instead of a useless `vfs://` link.
- **A link is never built from an address that does not hold a book.** The
  dialog loads the manifest to fill its target picker anyway, so a failure there
  replaces the link with an explanation. Pasting a bare repository address used
  to produce a link that opened to "Cannot parse book.json" for every student.

### A repository address is somewhere to look, not something to fetch

- Teachers paste `https://github.com/them/their-repo`, not the address of a file
  inside it. `utils/githubRepo.ts` parses github.com and raw.githubusercontent.com
  addresses (`parseGitHubLocation`) and lists directories, and
  `dialogs/GitHubRepoBrowser.tsx` is the picker built on it: click into folders,
  choose the `book.json` or ZIP — or, with the simple-book tick, the folder
  itself. It is shared by the student-link dialog and the open-from-GitHub wizard.
- Directory listings go through GitHub's API; **file contents never do**, they
  come from raw.githubusercontent.com through `bookSource` as before.
- The API allows ~60 unauthenticated requests an hour **per IP**, and a school
  NATs a whole cohort behind one, so `listDirectory` falls back to jsDelivr's
  data API on a rate-limit. jsDelivr is the fallback and not the default because
  its cache can lag a teacher's push by hours.
- Only a **teacher browsing for a book** ever reaches any of this. Opening a book
  does not: a `book.json` or ZIP is fetched by address, and a simple learning book
  finds its exercises by number (see below). A class of thirty opening a student
  link therefore spends no API requests at all.
- What counts as openable is `isBookFileName`, matched exactly as `isBookUrl`
  routes it, so nothing is offered in the picker that the loader would then
  decline to read.

### Simple learning books (no book.json)

- A folder, repo, sub-folder of a repo or ZIP of numbered `.py` files is a
  learning book with no manifest: `01.py` is an activity titled *01*, `01.txt`
  is its instructions, and `#! data.txt` lines at the top of that `.txt` name
  files to mount beside the exercise. Subfolders are ignored. Nothing can
  declare a test, so every activity is an example.
- **The folder is never listed.** The book is found by asking for `01.py`, then
  `02.py`, up to `99.py`, and it ends at the first number that is not there.
  Listing a GitHub folder means the GitHub API, which allows ~60 unauthenticated
  requests an hour *per IP* — and a school NATs a whole cohort behind one, so a
  class opening two books in a lesson could exhaust it and be told the book does
  not exist. Numbered files come from raw.githubusercontent.com instead, which
  has no such limit, and `HEAD` as the ref means not even the default branch is
  looked up. (`GitHubRepoBrowser` still uses the API, but only a teacher
  building a link ever opens it.)
- Because a missing file is now *data*, it has to be told apart from an
  unreachable one: `fetchResourceBufferOptional` (`utils/bookSource.ts`) returns
  null only on a 404 and throws when no mirror could be reached, so a dropped
  connection reports a problem instead of quietly shortening the book.
- A probe answered with a **web page** counts as missing (`looksLikeWebPage`).
  Plenty of hosts — this app's own dev server included — answer anything they do
  not have with their index page and a cheerful 200, and believing that publishes
  99 exercises, 97 of them holding somebody's HTML.
- Numbers are probed `PROBE_BATCH` at a time, so a lesson's worth of exercises
  costs one round trip. Everything a batch asks for past the gap is wasted, which
  is the trade for not listing.
- `utils/simpleBook.ts` owns it. The pure half (`parseSimpleBookGuide`,
  `buildSimpleBookManifest`, `simpleBookExerciseNumber`) is tested directly; the
  rest turns a source address into something with a `read(name)` on it.
- **It is addressed as a URL, not special-cased.** A root is
  `simplebook:<source>` and a file `simplebook:<source>#<name>`, which
  `fetchBookManifest` and `resolveBookUrl` recognise. Everything downstream —
  challenge filesystems, guides, student links, completion ticks, Reset book —
  then works with no branch of its own.
- The root URL is the **source address**, never a freshly-minted filesystem id,
  so completion ticks (`${rootUrl}::${challengeId}`) survive closing and
  reopening the book. Activity ids carry an FNV-1a digest of that address
  (`simpleBookIdPrefix`) because every simple book holds an `01.py` and the
  challenge filesystem is named `__book__:<id>`.
- **`#!` lines are directives, not prose.** `parseSimpleBookGuide` takes them off
  the top of the `.txt` (blank lines between them are still the top) and mounts
  each named file under its own name. A `.txt` with nothing else in it leaves the
  exercise with no instructions at all, exactly as if the file were absent — the
  panel then shows `SIMPLE_BOOK_NO_INSTRUCTIONS`.
- The guide is headed `NN Instructions` by `BookPanel.tsx`, not by anything
  embedded in the text: a simple book's `.txt` renders as plain text
  (`isPlainTextGuide`), so a markdown heading would show as literal `#` — and
  plain text is the point, since these are typed in Notepad and the markdown
  renderer would eat the asterisks and underscores a teacher writing about
  Python is very likely to use.
- Probing has to read every `NN.py` to know it exists, so opening a book reads
  the book; only the `#!` files are left until an activity is entered. Reads are
  memoised per source, so re-entering an activity costs nothing.
- The opened book is cached per source. Opening the book, **Reset challenge** and
  **Reset book** all call `invalidateSimpleBook`, because each of those means
  "give me the teacher's files again".

### Shared files live anywhere up the book tree

- A challenge's `py`, `guide` and `additionalFiles` are looked up in the
  sub-book holding the activity **and then in each enclosing book up to the
  root** (`bookFileBaseUrls` in `utils/bookLoader.ts`), nearest first.
- Books keep one helper module at the top and `import` it from activities
  sections down — tutorial 4 declares a bare `"fp_utils.py"` in `lists/`,
  `standard_functions/` and `practice_exercises_a/` while the file sits beside
  the root `book.json`. Resolving only against the sub-book 404s, and because a
  missing additional file aborts the whole load, the student got
  "Failed to load challenge" and an empty editor for every activity in those
  sections.
- The walk is a list of candidate *directories*, not a `../` prefix, because
  `resolveBookUrl` concatenates strings for a `vfs://` book (one unzipped into
  the virtual filesystem), where `../` would mean nothing. A declared `../` is
  therefore stripped by `challengeFilePath` and answered by the same walk.
- It never climbs above the root book: a sub-book hosted on a different origin
  gets no fallback at all.
- Whatever directory a file is found in, it is written to the challenge
  filesystem at its declared name (`/fp_utils.py`), because the exercise does a
  plain `import fp_utils`.

### Files in subfolders get real folders

- The file browser lists a folder's children by `parentPath`, starting from
  `/`. A file stored at `/data/stations.csv` with no `/data` folder entry was
  therefore unreachable: mounted into Pyodide and readable by the program, but
  never shown. Book `additionalFiles` in subfolders (a multi-file project with a
  `data/` or package folder) and programs that write into a subfolder both
  produced exactly that.
- `writeFile` (`utils/virtualFS.ts`) now creates any missing ancestor folders
  first (`ensureAncestorFolders`, pure half `ancestorFolderPaths`), so every
  caller gets them — book loading, the post-run sync and book editing. The ZIP
  and file-map importers, which had their own copies of the loop, now share
  it. A folder created by a racing sibling write is refused by the unique
  `byFsAndPath` index, and that refusal is ignored.
- A folder whose files are **all** hidden is hidden with them
  (`foldersHoldingOnlyHidden` in `utils/bookLoader.ts`), otherwise a hidden
  `instance/database.db` leaves an empty `instance` folder on show. A folder
  with anything visible beneath it stays.

### Parsons problems (drag-and-drop activities)

- A challenge with `"typ": "parsons"` is a **Parsons problem**: its `py` file is
  the *answer*, split into fragments, shuffled, and reassembled by dragging.
  The authoring contract is inherited verbatim from Python Sponge so existing
  books keep working — a line ending `#distractor` is a wrong fragment, an
  optional single `# start` … `# end` region fences the draggable body (the rest
  becomes fixed header/footer code), a two-character backslash-n escape inside a
  line makes one multi-line fragment, and blank lines are dropped. Parsons
  activities carry **no `tests`**.
- The logic is a native port of js-parsons in `utils/parsons.ts` (parsing,
  distractors, indent normalisation, an LIS-based line grader, code assembly);
  `components/ParsonsPane.tsx` is the UI. Nothing from `oldpythongsponge/` runs —
  no jQuery, no jQuery-UI, no prettify. Fragments are syntax-highlighted with
  `monaco.editor.colorize` (Monaco is already loaded, so they match the editor in
  both themes); `colorize` appends a trailing `<br>` that has to be stripped.
  Highlighting is skipped unless `py` ends `.py` — tutorial 4's Parsons files
  are maths proofs in `.md`/`.txt`.
- **`codeText` stays the source of truth.** Every arrangement change reassembles
  the program and pushes it through `replaceProgrammaticEditorCode`, so Run,
  Debug, Trace and the runtime switches all work on a Parsons puzzle without a
  single branch of their own.
- **`openFilePath` deliberately stays null.** `handleEnterChallenge` skips
  `loadCodeText` for a Parsons activity, which makes `saveCurrentToVFS` a no-op
  (`App.tsx`), so a shuffled arrangement can never overwrite the pristine model
  solution — every re-entry re-parses the puzzle from it. The `py` file is also
  added to the challenge filesystem's `hiddenPaths` (`parsonsHiddenPaths` in
  `utils/bookLoader.ts`); it must stay *in* the filesystem, just out of the
  file browser, or the student is looking at the answer in order.
- **Indentation is auto-disabled** when no model line is indented (`canIndent`).
  Tutorial 4's proofs indent with U+2800 BRAILLE PATTERN BLANK, which is not
  `\s`, so every line normalises to level 0; offering indentation there would
  let the student only lose. Student indents are re-normalised before grading,
  so an over-indented but structurally correct answer still passes.
- Submit has no tester worker: `submitParsons` grades in-process and writes a
  single synthetic `TestCaseResult` with `reveal: false`, so `TestResultsBar`
  shows only pass/fail and hides its Input/Expected table — the real feedback
  (message list plus per-fragment highlighting) lives in the pane. Completion
  ticks go through the same `persistCompletion` path as tested challenges, which
  is why `isTaskChallenge` has to accept a challenge with no `tests`.
- The student's arrangement persists (`pythoncoder-parsons-state` in
  `utils/storage.ts`, keyed `${rootUrl}::${challengeId}` exactly like
  completions). A saved arrangement is discarded unless its fragment ids still
  match the freshly parsed pool, so editing the source file cannot strand a
  student. **Reset challenge** and **Reset book** clear it; opening a different
  book clears the active challenge so its puzzle does not linger.
- `isParsonsChallenge` is gated on the *parsed problem*, not just on
  `activeBookChallenge.typ` — `activeBookChallenge` outlives a walk back to the
  book contents, and the panel header must not keep claiming a Parsons problem
  once the pane has gone.
- In **book edit mode** a Parsons node falls back to the plain Monaco editor so
  the teacher can author the source.

### Turning the page stops the run

- Every book navigation (`handleBookNavStateChange`, `handleEnterChallenge`,
  `handleCloseBook`) first calls `stopRunBeforeNavigating`. Without it the panel
  moved to the next activity but `canSwitchCodeSource()` refused the swap, so the
  student read page 3 with page 2's code and filesystem still loaded.
- Stopping is not instant — a trace worker acknowledges and flushes its final
  events before terminating, and a pygame/turtle main-thread run only unwinds
  when its loop next sees the stop flag — so `stopAndAwaitRuntimeRelease`
  (`utils/runtimeRelease.ts`) polls `isRuntimeSourceLocked` until the runtime
  lets go, with a timeout so a wedged runtime cannot freeze navigation.
- It also restores the layout if the run being left was still presenting,
  otherwise navigating out of a pygame run left the student in the full-canvas
  presentation layout. A run that ended normally has already done this itself.
- Navigation reads `challengeLoadIdRef` before awaiting and bails if it moved:
  the await is long enough for a second click to land.

### Resetting an activity, or a whole book

- Both live in the Book panel's options (⋯) menu, which is rendered at the
  contents level too — **Reset book** belongs there, and only **Reset challenge**
  is challenge-only. Both confirm through `useDialogs()` first; never a native
  dialog.
- Reset is never disabled. It used to be gated on "does this activity have a
  saved filesystem", tested with an exact match on `__book__:<id>` — but
  `getOrCreateChallengeFs` names them `__book__:<id>:<display name>`, so the
  check never matched and the menu item was permanently greyed out. Anything
  matching a challenge filesystem by name must accept both forms
  (`isChallengeFsName`); resetting an activity that has no saved work is
  harmless anyway, it just re-fetches.
- **Reset challenge** re-enters the activity with `forceReset`, which deletes
  its filesystem and re-creates it from the book's files.
- **Reset book** (`handleResetBook` in `App.tsx`) walks the whole tree with
  `collectBookChallengeIds` and deletes every challenge filesystem in it. The
  activity on screen goes through `handleEnterChallenge(…, true)` instead, so
  the editor is never left pointing at a filesystem that has just been deleted;
  the ref holding it outlives a walk back to the contents, so it is only used
  when `bookNavState.activeChallengeId` agrees.
- Completion ticks are a separate button in that dialog rather than a silent
  side effect: starting the exercises again and handing the book to someone else
  are different wishes. Clearing them is `clearCompletionsForBook`, which only
  touches keys prefixed with this book's root URL.

### How far through the book the student is

- A tick on an activity was the only progress a student could see, and it was
  only visible from inside the section holding it: the contents one level up
  showed a row of identical sub-books whether they were untouched or finished.
- `collectBookProgressIds` (`utils/bookLoader.ts`) walks the tree once and
  returns both halves of the answer — every activity id beneath the book being
  browsed, and the same ids split per sub-book child. The split is keyed
  `${index}-${child.id}`, matching the contents row's React key, because ids are
  **not unique across a tree** (one shipped template reuses one) and two
  identically-named sections must not share a count.
- A sub-book that fails to load contributes an empty list rather than aborting
  the walk, exactly as `collectBookChallengeIds` does — one broken section must
  not cost the rest of the book its figures. Cycles are refused against the
  *chain of ancestors*, not a global visited set, so two sections are still
  allowed to point at the same sub-book.
- The ids are fetched once per book being browsed and held in state; the counts
  themselves are derived at render time against `completedChallenges`. Ticking
  an activity changes which ids are complete, never which ids exist, so nothing
  re-walks the tree on a tick.
- A section row shows a **tick** when every activity beneath it is complete, a
  part-filled **`ProgressRing`** and `done/total` when some are, and nothing at
  all when none are — an empty ring on every untouched section is noise. Both
  use the same emerald as an activity's tick, so there is no second colour to
  learn.
- The **percentage bar is the root's only**. Inside a section it would report
  that section alone while looking like the book's, which is why it is gated on
  `breadcrumb.length === 0` rather than on whichever contents are on screen.
- All of it is skipped in **book edit mode**: the live manifest there is owned
  by `bookEditStore`, and a teacher arranging exercises is not a student with
  progress.

### Prev / next works at the contents level too

- The header's arrows move between *activities* while one is open, and between
  *sections* while a sub-book's contents are. `findSiblingSection`
  (`BookPanel.tsx`, exported for its test) asks the **parent** manifest for the
  sub-book before or after this one, stepping past any loose activities between
  them.
- It stops at the parent rather than climbing further, which is the difference
  between it and `findChallengeOutsideCurrentBook`: the activity arrows run the
  whole book end to end, the section arrows move within one level of contents.
- A sibling replaces the **last breadcrumb entry** rather than pushing a new
  one. A crumb records a section's own name against its *parent's* url (that is
  what `navigateInto` pushes), so appending instead would read "Selection ›
  Loops" for two sections that are siblings.
- The arrows render only when a sibling exists in either direction, so the root
  of a book — which has no siblings — is unchanged.

### Virtual filesystem & local folders

- `utils/virtualFS.ts` is an IndexedDB-backed store of multiple named filesystems
  (`default` always exists with `main.py`). `FileSystemPanel` browses them.
- A local OS folder can be connected via the File System Access API. When the
  active filesystem is the connected one, mutations (save, new file/folder,
  rename, delete) are **mirrored to disk** through `syncToLocalFolder` in
  `App.tsx`. There is no inbound file-watching (the API can't); a manual
  "Reload from folder" button re-reads disk. Permissions reset on page reload.

### The right sidebar

- Mirrors the left sidebar: one card, one collapse control at the very top, and a
  divider between sections. It stacks, top to bottom, **Learning book · Teacher
  Tools · Structure** — the book is always the top section because it is what a
  student is working through.
- The **last visible section fills the leftover height**; the ones above it are
  sized in pixels and dragged with a `row-booksec` / `row-teachersec` handle. Each
  section scrolls its own content, so a long Teacher Tools list never pushes the
  Structure panel off screen. A newly opened book resets to **75%** of the stack
  (`bookSectionHeight` back to `null`); a drag pins it to a pixel height.
- The collapse strip is present whenever the sidebar has *anything*, and the whole
  sidebar disappears only when it has nothing — no book, no Teacher Tools, no
  Structure. Collapsed, it becomes a 32px rail with an icon per section.
- A section **arriving** re-opens a collapsed sidebar (`prevRightSectionsRef`).
  Without that, opening a book or ticking Structure looks like nothing happened.
- The Structure panel used to live in two places (bottom of the right column in
  developer view, its own column in minimal view). It now has one home in both
  view modes, which is why `rightColSplit` and `structureColWidth` are gone.

### Folding the editor and console

- The Code Editor and Console headers carry a double chevron (`FoldButton`)
  that folds the panel vertically to its header strip, the up/down counterpart
  of the sidebars' collapse. Both folds persist in `LayoutPrefs` and
  `NamedLayout`, and **Restore defaults** and switching view mode clear them.
- A fold is offered only where a neighbour can take the height it gives up:
  the editor only in minimal view (the output panel is below it), the console
  only when the Display pane is below it or the editor above it. Anywhere else
  it would just leave a gap, so `canCollapseEditor` / `canCollapseConsole` hide
  the control and a remembered fold waits until it can apply.
- Both folded with no Display pane would fold neither, so the editor yields and
  stays open, with the console's header at the bottom of the column
  (`isOutputHeaderOnly`). The console's chevron then points down, because that
  is the way that panel folds.
- Folding hides, never unmounts: Monaco (the dispose churn) and the xterm
  console (its buffer) stay mounted under `hidden`. The other console tabs
  unmount, as they already do when not selected.
- **xterm's fit must be skipped while hidden** (`fitToBox` in
  `ConsoleTerminal.tsx`). FitAddon reads a `display: none` box's computed
  width as `"100%"` — 100px — and refits to ~11 columns; a prompt written then
  stayed broken across lines after the console came back.
- Something arriving opens its panel: an `input()` request opens the console
  (except in popup-dialog input mode), and opening a file or turning to a book
  activity opens the editor.
- **The console folds for a drawing** (`consoleAutoFolded`, never persisted).
  When a run's Display surface appears before the program has written to the
  console (`foldConsoleForDisplay`: pygame/tkinter/stdctx starting, a chart, the
  first turtle frame), the console folds to its header so the drawing gets the
  room. The run's **first program output** — print, stderr, an error, an input
  echo, `input()` itself — opens it again (`appendProgramOutput`), and opens a
  student's own fold too, so an error is never behind a header. Only the first,
  so a student who folds it again mid-run is not overruled on every print. The
  app's own lines (`[INFO]`, `[RUN FINISHED]`) go through plain `appendOutput`
  and open nothing, or the console would pop open at the end of every run. The
  automatic fold lapses whenever there is no Display pane, and each run
  (`resetExecutionState`) decides afresh.

### The Display pane

- **Every** kind of visual output lives in one **Display pane**, rendered directly
  below the Console inside the Console Output panel, with a draggable divider
  between them (`DisplayPane.tsx`, wired in the output region of `App.tsx`).
  Console and drawing are therefore always on screen together — the common case
  is a program whose console input drives what it draws. The Structure panel is
  purely static analysis (Outline / Hierarchy / Class / Notes) and owns no
  program output.
- The surfaces share the pane, chosen by `DisplaySurface`
  (`'canvas' | 'tkinter' | 'turtle' | 'stdctx' | 'plot'`): the shared main-thread
  `<canvas id="canvas">` (pygame and the pyo-js turtle), tkinter windows, the
  Basthon SVG turtle, the stdctx canvas and charts.
  A surface is offered once it has something to show; a tab strip appears in the
  Display header **only** when a program drives more than one.
- **Every Debug/Run/Trace starts with an empty Display pane**
  (`resetExecutionState`): the canvas, tkinter, turtle and plot surfaces are all
  retired, and the ones this run uses come back as it starts or draws. A
  drawing outlives its program only until the next run. tkinter was once missed
  here, and a finished GUI from another book stayed on screen through every
  later run of an unrelated `print("hello")`.
- All three surfaces stay mounted and are hidden with the `hidden` class, never
  unmounted — both canvases are driven imperatively through refs, so a remount
  throws the drawing away. For the same reason `DisplayPane` itself stays mounted
  while it has nothing to show: a run starts drawing into the canvases before
  React has flushed the state that reveals the pane.
- The console/visual divider remembers two percentages, because the same number
  means different things in a corner panel and on a full screen: `displaySplit`
  while editing and `presentationDisplaySplit` during a full-run presentation.
  Both live in `LayoutPrefs` (so they survive a reload — the only sizes that do),
  in `NamedLayout`, and in **Restore defaults**.
- Because the Display pane rides inside the output panel, every presentation mode
  now wants the same panel set — output and nothing else. One
  `enterRunPresentationMode(kind)` / `restoreRunPresentationMode()` pair over one
  snapshot ref covers pygame, turtle canvas, SVG turtle and plain console; `kind`
  only picks which run flag to raise.
- **A run restores the layout the moment it ends** — worker `done`, worker
  `error`, forced stop, and the main-thread `finally` all call
  `restoreRunPresentationMode()`. The old "Return to editor" bar depended on
  every one of those endings remembering to arm a `pendingRestore` callback, and
  pygame and turtle runs (which end in the most places) kept missing one,
  stranding the student in the full-screen layout. The one exception is opt-in:
  see *Stay on run view* below — and it still lives inside that single function,
  so no ending can miss it.
- Restoring always forces `visiblePanels.output` back on, snapshot or not,
  because the Display pane lives in that panel — a pygame window or turtle
  drawing must outlive the program that made it.
- The snapshot is taken from `visiblePanelsRef` / `leftWidthRef`, not the render
  closure: a run can now start before React has re-rendered with the restored
  panels, and a stale closure would snapshot the presentation layout and never
  give the screen back.
- Debug and trace deliberately keep the normal layout, so `showTurtleSvg`,
  `beginStdctxRun` and `beginMainThreadCanvasRun` each force `visiblePanels.output`
  true and select their surface. Without that, a debug run draws into a hidden
  panel and looks as though it did nothing.

### Keyboard shortcuts

- `utils/shortcuts.ts` (`resolveShortcut`, tested as a table) decides every
  function key from the key and two facts: is a program running, and is the
  debugger paused with the step buttons on screen and enabled.
  **F5** Debug · **Ctrl+F5** Run · **Ctrl+Shift+F5** Trace · **Shift+F5** Stop ·
  while paused **F5** Continue, **F10** Step Over, **F11** Step Into,
  **Shift+F11** Step Out · otherwise **F11** toggles the full-screen editor.
  F11 means Step Into only while paused, which is VS Code's convention and what
  the step buttons' tooltips always said.
- A shortcut that starts a run **is a choice in the Debug / Run / Trace menu**:
  it sets `runModeChoice`, so the split button then offers the same mode.
- One listener on `window`, **capture phase**, so the key arrives before Monaco
  or the xterm console act on it. It always `preventDefault`s a key it claims —
  even one with nothing to do right now (`swallow`) — because F5 is the
  browser's reload and a student pressing it to run must never lose unsaved
  code. With a modal open (`[aria-modal="true"]`, `dialog[open]`) the key is
  still claimed but does nothing, which is why `DialogProvider` and
  `SaveFileDialog` now carry `role="dialog" aria-modal="true"`.
- The handler is re-pointed every render through `shortcutHandlerRef`, like
  `saveCodeRef`, because the listener is installed once.
- **Ctrl+Shift+> / <** size the editor font (a Monaco action, so inside the
  editor), as in Python Sponge; the older Ctrl+Alt+Shift chord still works.
  Monaco's own binding for those keys (in-place replace) gives way because an
  action's keybinding is registered after the defaults. The steps are the
  header dropdown's sizes (`EDITOR_FONT_SIZES`), so the dropdown always agrees.

### The full-screen editor (F11)

- `isEditorFullScreen` shows the editor alone. It is a render-time override,
  not a change to `visiblePanels`, so leaving it needs no snapshot: the sidebars
  unmount (they already do when toggled) but the output column is **hidden, not
  unmounted**, so the console transcript and any drawing are still there on the
  way back.
- It gives way to anything that needs the rest of the screen: a run of any mode,
  choosing a view or layout, toggling a panel, opening the Tab Group dialog.
- F11 from a held run view (below) first releases it to the pre-run layout, so
  the second F11 lands there rather than back on the run view.
- A button beside the editor's fold control does the same for the mouse.

### Stay on run view

- The Run entry of the Debug / Run / Trace menu (now Debug · Trace · Run, so the
  setting sits under Run) carries a checkbox, `appSettings.stayOnRunView`.
  Ticking it leaves the menu open: it is a setting of Run's, not a way to start.
- Ticked, `restoreRunPresentationMode()` at a run's ending keeps the run layout
  and its snapshot and sets `runViewHeld`. A bar above the panels then offers
  **Previous** (the snapshot), **Minimal**, **Developer**, and — only when the
  student has any — a dropdown of saved layouts.
- `restoreRunPresentationMode({ release: true })` always restores; the bar's
  Previous, book navigation (`stopRunBeforeNavigating`) and a Debug/Trace start
  use it. A new Run from the held view keeps the old snapshot, so Previous
  still means the layout from before the first of them.
- Choosing a view or layout drops the snapshot instead (`leaveTransientLayouts`).
- While held, `isRunLayout` stays true: the presentation display split is kept
  and the Panels menu stays disabled, as during the run itself.
- The hold needs a snapshot, so it applies to exactly the runs that took over
  the screen — every Run, and every main-thread run — never to Debug or Trace.

### The tab group

- **Tab group…** in the Panels menu (`TabGroupDialog`) ticks any of the central
  column's Code editor, Console and Display into one tabbed panel. The group
  always comes **last** in the column; a panel left out goes first. It is saved
  in `LayoutPrefs` and `NamedLayout`, and **choosing Minimal or Developer**,
  and **Restore defaults**, break it up.
- A group needs **two members on screen** (`visibleTabGroup`). The Display pane
  only exists once a program draws, and a Run's presentation layout hides the
  editor, so with fewer than two the column simply lays out as usual — the tabs
  come back by themselves when the second member does. A strip holding one tab
  would only be a header.
- **It is CSS, never a remount.** Each member keeps its place in the tree; the
  output column's two wrappers become `display: contents`, so the console and
  display boxes sit in the column beside the editor, and `order` places them:
  the left-out panel (`lead`) at the column's usual split, a handle, then the
  chosen tab filling the rest; other tabs are `hidden`. Monaco, the xterm
  buffer and both canvases survive every tab switch and every change of group.
  `groupSlot` (`utils/tabGroup.ts`) is the pure half and is tested.
- Every grouped panel draws the same `PanelTabStrip` in its own header, and only
  the chosen one is on screen, so the group reads as one panel while each
  member keeps its own tools (font size, copy, zoom, sub-tabs).
- Folding is off while grouped, as it is in full screen: the tabs already decide
  who has the room.
- **Something arriving brings its tab forward**, the tab-group form of the
  fold rule above: `input()` → Console; a Run → Console, Debug/Trace → Code; a
  breakpoint hit → Code; pygame/tkinter/stdctx starting, a chart, or a run's
  first turtle frame → Display; opening a file or an activity → Code
  (`revealEditor`). Later turtle frames deliberately do not, or a student
  stepping in the Code tab would be pulled away on every line.
- **input() borrows the Console tab from Display, and only until the next
  drawing** (`displayTabAfterInputRef`, `displayUpdated`). Printed output never
  moves the tab; what the program prints in reply to the answer stays in front
  of the student until it draws again — a changed turtle frame, a stdctx batch,
  a non-empty tkinter flush, a chart. pygame and the canvas turtle paint with
  nothing to hear, so their Display tab returns with the answer itself.

### New file opens in the editor

- **New file** in the File System panel asks about the editor's unsaved changes
  first (Save / Don't save / Cancel — `handleBeforeNewFile`), then for a name,
  then opens the new file. Only one file is ever open, deliberately: a second,
  unsaved tab is too easily lost in a browser.
- Uploads never do this — only New file, which is marked `isNewFile` on the
  panel's pending entry. The name dialog refuses an existing file's name
  (`refuseExistingFile`), because saving an empty new file over it would wipe
  it, and the new file is typed by its own name rather than always as `.py`.

### Indentation follows the file

- Books arrive indented with two spaces as often as four. One Monaco model
  serves every file and a model only guesses indentation when it is created,
  so `replaceProgrammaticEditorCode` (and `handleEditorMount`) set each file's
  indentation as it arrives: `detectIndentUnit` (`utils/indentation.ts`), or
  **4 spaces** when nothing in the file is indented. The editor's `options`
  prop carries no `tabSize`/`insertSpaces` (and `detectIndentation: false`) so
  a re-render can never put a fixed value back.
- The cog menu's **Indent** dropdown shows what was detected. Choosing another
  re-indents the open file (`reindentEdits`) as one undoable edit, leaving it
  unsaved. Disabled while running and on a Parsons problem.
- Both read the file as Python, not text: only lines that start a statement
  count, block depth is worked out as the tokenizer does, and lines inside
  brackets, after a backslash or inside a multi-line string are not indents.
  A multi-line string is never re-indented — that would change what the
  program prints — except a docstring, whose indentation follows the code.
  `indentation.test.ts` runs a converted program under native `python` and
  checks it prints the same.

### Display zoom

- The Display header's Zoom dropdown (`displayZoom`, persisted as
  `coder_display_zoom`) is **Fit** or a percentage of actual size. Fit is what
  the surfaces always did — shrink to the pane, never enlarge — except that the
  stdctx canvas now fits too, rather than scrolling at full size.
- A percentage is CSS `zoom` on the surface's content, not a transform. `zoom`
  scales the layout box along with the pixels, so the scroll area grows with it
  and scroll bars appear exactly when it stops fitting. The wrapper switches to
  `w-max min-w-full` so wide content scrolls instead of being squeezed.
- No surface needs to know what a program drew: a canvas zooms from whatever
  size pygame, turtle or `stdctx.resize` gave it, an SVG from its attributes, a
  matplotlib PNG from its natural size (`max-w-none`, beating preflight's
  `img { max-width: 100% }`). A plotly iframe fills any frame it is given, so
  zoomed it starts from plotly's default 700x440.
- Input survives zoom, checked at 200% in Chromium: `getBoundingClientRect`
  reports the zoomed box, which is what SDL maps the mouse through, so a click
  on pixel (50, 40) of a pygame window reaches pygame as (50, 40). An iframe's
  content is scaled with its box (the frame still sees a 700px viewport), so
  plotly's hover labels appear under the pointer.
- The stdctx canvas's container is a block, not a flex row: `max-width` /
  `max-height` preserve a block replaced element's aspect ratio when fitting it,
  and a flex item's are not guaranteed to.

### A run loads only what its imports reach

- A run's source decides what gets installed before it starts: matplotlib's
  Agg bootstrap, seaborn and plotly from PyPI, the stdctx bootstrap. Those
  checks used to scan every `.py` in the filesystem, so a sibling file that
  plots made "Hello, World!" load matplotlib, and one importing seaborn sent it
  to PyPI.
- `programPythonFiles` (`utils/importGraph.ts`) follows imports instead, from
  the file being run through every module they reach, and the detectors
  (`detectSpongeLibs`, `detectPlottingLibs`, `detectMatplotlib`) are handed that
  set. Both runtimes and the tester worker use it.
- It errs towards including a file, because a miss breaks the program while an
  extra only costs load time. Imports are matched by pattern (inside `if`,
  `try`, functions, even docstrings); a module is looked for beside the file
  being run, in the working directory (Pyodide's `sys.path[0]` is `''`), at the
  root and beside its importer; a package pulls in every `__init__.py` on the
  way; a star import takes the whole package. Anything no pattern can follow —
  `importlib`, `__import__`, `exec`, `runpy`, touching `sys.path` or `chdir` —
  falls back to every file.
- `loadPackagesFromImports` installs only what it is shown, and it used to be
  shown only the open file: a helper module's own `import numpy` failed with
  `ModuleNotFoundError` — unless a plotting file anywhere in the filesystem
  happened to drag numpy in behind matplotlib, which hid the bug. Every reached
  module is scanned now too: `moduleSources` in the trace worker's `init`
  message, a loop in the main-thread run, `initPyodide(code, modules)` in the
  tester.

### Data science: matplotlib, seaborn, numpy and plotly

- `numpy`, `pandas`, `scipy` and `matplotlib` ship with Pyodide, so they need no
  installing. **seaborn and plotly do not** — they are pure Python wheels fetched
  from PyPI with micropip (`micropipPackagesFor`), which is why a plotting run
  says "Installing seaborn..." the first time.
- The student cannot install them: their code is compiled without
  `PyCF_ALLOW_TOP_LEVEL_AWAIT`, so `await micropip.install(...)` is a SyntaxError
  in user code. `micropipInstallCode` runs through `runPythonAsync`, which allows
  it, before the program starts.
- `pyodidePackagesFor` loads two more from Pyodide's own repository: **matplotlib**
  for seaborn (a seaborn program need never name it) and **pandas** for plotly
  (`plotly.express` refuses plain lists without it — "Pandas installation is
  required if no dataframe is provided").
- `plotly[express]`, not plain `plotly`: without the extra, `plotly.express`
  raises an ImportError telling the student to run pip, which is advice they
  cannot act on in a browser.
- **seaborn needs no rendering support of its own.** It is a styling and
  statistics layer over pyplot, so `detectPlottingLibs` sets `matplotlib` too and
  everything below applies unchanged.
- The shipped **Data Science** book (`DataScience/`, in the tutorial catalog) is
  twelve worked examples across all four libraries. All are `isExample: true`.

### matplotlib has no screen, so it is given a picture frame

- Pyodide ships matplotlib and `loadPackagesFromImports` installs it as soon as
  a student's `import matplotlib.pyplot` is scanned. What it cannot supply is a
  display: matplotlib's default interactive backend is webagg, whose first act is
  `from js import document`. There is no document in a Web Worker, so `plt.show()`
  died with `ImportError: cannot import name 'document' from 'js'`.
- `utils/matplotlib.ts` fixes the backend to **Agg**, which needs no DOM at all,
  and replaces `plt.show()` with one that renders each open figure to a PNG and
  hands the data URI to `js_matplotlib_figure`. The Display pane's `plot`
  surface shows it.
- **The backend must be chosen before pyplot is imported** — it binds at import
  time — so `MATPLOTLIB_BOOTSTRAP` sets `MPLBACKEND` and imports pyplot itself
  *before* the user's code, ahead of every other bootstrap.
- Plotting therefore stays on **whichever runtime the student is using**, rather
  than forcing the main thread. A chart-drawing program can still be stepped
  through in Debug and recorded in Trace, which moving it to the main thread
  would have cost.
- `MATPLOTLIB_FLUSH_CODE` runs after the program and delivers figures that were
  built but never shown — forgetting `plt.show()` is a beginner's mistake, and an
  empty Display pane teaches nothing. On the main thread it runs in the `finally`,
  so a run that failed halfway still shows what it drew.
- The tester worker installs the same bootstrap with a bridge that discards the
  figures: a plotting challenge still has to import and run under test, and there
  is nowhere in a tester to show a chart.
- Figures are cleared at the start of each run. Unlike the canvases (latched so a
  drawing outlives its program) they are a list, which would otherwise grow
  without bound across runs.

### plotly is shown, not drawn

- plotly does not render a picture: it describes one, and plotly.js draws it in a
  browser. The static renderer (kaleido) is a native binary with no wasm build, so
  there is nothing to turn a figure into a PNG.
- So a plotly figure reaches the Display pane as what it actually is — a small
  HTML document — in an **iframe sandboxed without `allow-same-origin`**. It runs
  on an opaque origin and can touch nothing of ours. Hovering for values, zooming
  a range and toggling a series off the legend all survive, which is most of why
  anyone reaches for plotly.
- `include_plotlyjs='cdn'` keeps a figure a few KB. Inlining the bundle would add
  ~4MB to every single one. The CDN script loads under both COEP values: plotly
  emits it with `crossorigin="anonymous"` and an SRI hash, a CORS load, which
  `require-corp` (WebKit) accepts as readily as `credentialless`.
- `PLOTLY_BOOTSTRAP` patches `plotly.io.show`, not `Figure.show`: `BaseFigure.show()`
  defers to `pio.show`, so the one patch catches `fig.show()`, `pio.show(fig)` and
  anything built on them.
- `PlotFigure` (`types/index.ts`) is the union the Display pane's Plot surface
  renders: `{kind:'image'}` for an Agg PNG, `{kind:'html'}` for plotly.

### Getting console output out of the page

- The console is an xterm terminal: it owns its own selection and scrollback, so
  the browser's own Copy and any page text selection cannot reach it. Without
  help there is **no way at all** to get an error message out — which is what a
  student needs when asking for help.
- `Ctrl+C` is two things in a terminal. With text selected it copies; with
  nothing selected it keeps its terminal meaning and stops the running program.
  Right-click copies a selection too, because xterm draws its selection as an
  overlay the native context menu cannot see.
- The copy icon in the console header copies the selection if there is one
  and the whole buffer otherwise, and works in the non-terminal console mode too.
- `copyTextToClipboard` falls back to `execCommand('copy')` when
  `navigator.clipboard` is refused — a school network is exactly where that
  permission gets denied — and returns false rather than pretending, so the
  button never claims a copy that did not happen.

### tkinter is Coder's own, drawn in the page

- Pyodide has no Tcl/Tk. `src/python/tkinter` is a pure-Python `tkinter`
  (plus `ttk`, `messagebox`, `simpledialog`, `filedialog`, `colorchooser`,
  `font`, `scrolledtext`, and a `PIL.ImageTk` stand-in) that keeps every
  widget's state in Python and has `utils/tkinterRenderer.ts` draw it. They talk
  through `_coder_tk_host`: `flush(ops)` (batched, deduplicated per flush),
  `query` (sizes, carets — things only the page knows), `poll` (queued clicks
  and keys), `dialog`/`dialog_sync`, `sleep`.
- **Fidelity is the point**: option names, defaults, `TclError` messages
  (`unknown option "-bg"`, `cannot use geometry manager pack inside . which
  already has slaves managed by grid`, `bad event type or keysym "enter"`),
  auto-names (`.!frame.!button2`, from the Python class), Text's final newline,
  menu tearoff indices, Treeview's int-looking values, ttk having no `bg`. A
  program that errors in IDLE should error here the same way.
- The package is real `.py` files, `?raw`-imported by `utils/tkinter.ts` and
  written to `/lib/coder_tk` at run start. `/lib` keeps them out of the post-run
  filesystem sweep, which also means the module eviction in
  `PYODIDE_RUNTIME_RESET_CODE` skips them — so both the bootstrap and the reset
  code pop `tkinter*` from `sys.modules` by name.
- **Main thread only**, like pygame: `isTkinterLocked` (the open file imports
  it) locks the runtime, and `startTraceWorker` reroutes to the main thread when
  `detectTkinter` finds it in any module the program can import (a GUI in
  `gui.py`).
- **mainloop() is a real loop** when JSPI is available: pump events and
  timers, then `run_sync` on a timer promise (`renderer.sleep`, which resolves
  early when an event arrives). `time.sleep` is patched the same way for a
  tkinter run (restored by the reset code via `_coder_real_sleep`), so
  `while True: root.update(); time.sleep()` games keep painting. Without JSPI,
  mainloop() returns at once and `_coder_keepalive` pumps from an async loop
  after the program's last line; message boxes then fall back to the browser's
  `alert`/`confirm`/`prompt` — the same deliberate native-dialog exception as
  `js_input_prompt`.
- With JSPI, callbacks run inside a Python stack entered by `runPythonAsync`,
  so `input()` and `messagebox.askyesno()` work *inside* callbacks.
- **Layout is CSS**: grid → CSS grid (weights as `fr`); pack → nested flex boxes
  of "parcels" (so `expand` and `fill` stay separate) and "cavities" (what is
  left after each run of same-side slaves); place → absolute. The look is Tk on
  Windows whatever the app theme (`color-scheme: light`, 3-D reliefs drawn by
  `drawRelief`), because tkinter programs pick colours assuming Tk's.
- The renderer applies Display zoom itself (`setZoom`, including a real Fit that
  shrinks big windows) so event coordinates can be divided back through it.
  `attach()` moves its DOM if React remounts the Display pane.
- Stop sets the flag, cancels any open dialog and wakes the loop; the run ends as
  `[MAIN-THREAD RUN STOPPED]`. A finished run's windows stay on screen, inert.
- **Known gap**: the tester worker has no tkinter, so a *tested* challenge whose
  program imports it fails there. The package runs headless (no host → nothing
  drawn, mainloop() returns), which is how the vitest suite runs it, and is what
  the tester would need.
- Tests: `tkinterShim.test.ts` runs the package under native Python against a
  fake host (including a faked `pyodide.ffi` so mainloop's JSPI loop runs);
  `tkinterRenderer.test.ts` checks the DOM the ops build; `tkinter.test.ts`
  detection and that the generated bootstrap compiles.
- The **Tkinter** book (`Tkinter/`, in the catalog) is twelve worked examples.

### stdctx canvas and stdaud audio

- `sys.stdctx` (canvas) and `sys.stdaud` (audio) are carried over from Python
  Sponge, so older funchallenge books that do `from sys import stdctx` keep
  working. stdctx mirrors the HTML5 Canvas 2D API; every call becomes a JSON
  command replayed against a `<canvas>` in the **Display pane** (see *The Display
  pane* below).
- The Python source and the JS renderers all live in `utils/stdctx.ts`;
  `CanvasPane.tsx` hosts the canvas. One bootstrap installs both objects.
- Detection is `detectSpongeLibs(editorSource, files)` over **every module the
  program can import** (see *A run loads only what its imports reach*), not
  just the open file. Book challenges routinely keep their
  drawing in an imported module (`import UI`), so the file on screen never
  mentions stdctx even though the run needs it — checking only the editor left
  those programs with `ImportError: cannot import name 'stdctx' from 'sys'`.
  The stdctx surface needs stdctx specifically, so an audio-only program does not
  grow one.
- Because that detection happens at run start, the stdctx surface can appear only
  once a run begins. `CanvasPane` therefore sizes its canvas on attach rather
  than relying on `clear()`: a bare `<canvas>` already reports the HTML default
  of 300x150, so a "size it if unset" guard silently never fires.
- The canvas starts at Sponge's fixed 500x400. `stdctx.resize(w, h)` — or
  assigning `stdctx.width` / `stdctx.height` — sends a `resize` command, which
  (like the HTML canvas) clears the bitmap. Every run restarts at the default.
  `CanvasPane` deliberately keeps the canvas dimensions out of React props so a
  later render cannot undo a resize.
- Draw calls are sent one per command until the program calls `present()`, which
  switches it to double buffering (batch until the next `present()`).
- `sys.stdaud.load(source)` then `.play()` drives a hidden `<audio>` element, and
  `stdctx.drawImage(uri, ...)` accepts the same kind of source. Both resolve
  through `utils/vfsMediaUrl.ts`: a real URL passes through untouched, and a
  virtual-filesystem path becomes a blob URL **cached per (filesystem, path)**.
  The cache is the point — without it a `load()` in a loop mints a fresh URL,
  and a copy of the clip, on every iteration. `resetStdaud()` releases the whole
  cache at the start of each run. Autoplay rejections are swallowed.
- A blob URL is a short opaque handle, not an encoded copy — that is `data:`,
  which inflates ~33%. Serving VFS media from `vfs-preview-sw.js` instead would
  not work here anyway: that worker is scoped to `/__vfs_preview__/`, so it only
  sees iframe *navigations* into its scope, never subresources of the app page.
- `drawImage` keys its image cache on the URI the program passed, never the
  resolved URL, and holds in-flight and failed URIs so an animation loop starts
  one load rather than one per frame, and a typo fails once. `CanvasPane.clear()`
  calls `clearStdctxImageCache()` so each run re-reads its images.
- Four JS bridges back the Python side: `js_stdctx_send`, `js_stdctx_check_key`,
  `js_stdctx_sleep` and `js_stdaud_send`, supplied differently per runtime:
  - **trace worker** — draws go over `postMessage`; `check_key` reads a separate
    256-byte `SharedArrayBuffer` written by the canvas' key handlers; and
    `time.sleep` is replaced by an `Atomics.wait` so the worker parks (letting
    the already-queued draws paint) instead of spinning.
  - **main thread** — draws call straight into the canvas. Blocking would freeze
    the tab, so `STDCTX_MAIN_THREAD_BOOTSTRAP` rewrites module-level
    `time.sleep(x)` into `await asyncio.sleep(x)` and appends a yield to every
    module-level loop. A `time.sleep` inside a `def` still blocks.
  - **tester worker** — draws and audio are discarded and sleeps skipped, so a
    canvas challenge's output assertions still run, and run fast.

### File sync boundaries

- After a run, both runtimes walk the working directory to pick up files the
  program created or changed. The working directory is usually `/` — and so is
  the root of Pyodide's own Emscripten filesystem, which holds `/lib`, `/dev`,
  `/home`, `/proc` and `/tmp`. An unguarded walk therefore swept Pyodide's whole
  standard library (a ~2 MB `/lib/python313.zip`) into the user's filesystem on
  every run, where it showed up in the file browser and in every "download as
  zip".
- `utils/pyodideFs.ts` holds the guard. `pyodideSkipDirs(mountedPaths)` returns
  the system directories to skip, minus any the app actually mounted files into
  — a learning book is allowed to contain a folder called `lib`. Both
  `collectUpdatedFiles` (`workers/tracer.worker.ts`) and `readFilesFromPyodide`
  (`utils/virtualFS.ts`) consult it. Programs can still *read* the stdlib; it
  just never syncs back.

### File sync must not retype files

- `syncFilesFromPyodide` writes back everything a run touched. The runtimes have
  no MIME opinion, so they send an empty `mimeType` and the stored type survives;
  only a specific type (not blank, not `application/octet-stream`) overwrites it.
  Before this, every run retyped every file to `text/plain`, which silently broke
  audio playback and image decoding for anything a program merely read.

### stderr is not a failed run

- Pyodide writes warnings to stderr. The trace worker posts those as a
  non-fatal `stderr` message that the console shows as `[stderr] …`; only the
  explicit `error` messages posted from the worker's catch blocks end a run.
  (Treating any stderr byte as fatal used to kill book challenges over a
  harmless `SyntaxWarning`.)
- The user's source is parsed three times per run — Pyodide's import scan, our
  `ast.parse`, and `compile` — so both runtimes silence `SyntaxWarning` during
  the import scan (it reports against an anonymous `<unknown>` file) and then
  set it to `once`, leaving a single warning naming `simulation.py`.

### quit() is not a failed run

- `quit()`, `exit()` and `sys.exit()` end a program by raising `SystemExit`.
  CPython treats that as a normal ending; Pyodide does not, so a menu-driven
  program that finished with `quit()` ended on a red traceback.
- `runProgramPython` (`utils/programExit.ts`) wraps the statement that executes
  the student's code in the trace worker and the plain main-thread run: an
  integer or empty exit ends quietly, `sys.exit("message")` prints the message
  to stderr as CPython does, and every other exception still propagates. The
  pygame, turtle and stdctx main-thread paths and the tester worker already
  caught `SystemExit` themselves.
- It catches `SystemExit` only. The trace worker's own stop signals subclass
  `BaseException` directly, so a Stop or a trace-limit halt is never mistaken
  for the program choosing to end. `programExit.test.ts` runs the generated
  Python under native `python` to pin all of this down.

### Fixed inputs

- When "Use Fixed Inputs" is on, the Console panel becomes a two-tab panel
  (Console / Inputs); the Inputs tab hosts the fixed-input textarea. Every run
  rebuilds the input queue from the top of the textarea (`fixedInputsQueueRef` in
  `startTraceWorker` and `startMainThreadRun`), so runs always re-consume inputs
  from the start. Both runtimes echo a fixed input into the console as if typed.

### input() on the main thread

- pygame and the canvas turtle always run on the main thread, and any program
  does when the trace worker is unavailable. `input()` there used to be a
  blocking `window.prompt`: the page could not paint while Python waited, so the
  student answered a pop-up without seeing anything the program had printed, and
  the whole transcript arrived at the end.
- **JSPI** (WebAssembly JavaScript Promise Integration — Chrome 137+, Firefox,
  Safari 27+) lets Pyodide suspend the whole interpreter on a promise:
  `pyodide.ffi.run_sync`. `MAIN_THREAD_INPUT_BOOTSTRAP`
  (`utils/mainThreadInput.ts`) runs before every main-thread mode and defines
  `__coder_read_line`, which every mode's `input()`/`textinput`/`numinput` calls:
  if `can_run_sync()` it awaits `js_input_async`, which raises the same
  `inputRequest` the worker uses, so every input mode (terminal, inline field,
  pop-up dialog) and fixed inputs work unchanged; `handleInputSubmit` resolves it
  through `mainThreadInputResolveRef`. The console paints and Stop works while
  Python waits.
- `can_run_sync()` needs every frame since the run began to be Python. The runs
  start through `runPythonAsync`, so plain code, the pygame/stdctx/turtle async
  rewrites and turtle key callbacks polled from Python all qualify. Python called
  synchronously back from a JS event handler would not, and falls back.
- **Stop while waiting** resolves the promise with the stop flag up;
  `__coder_read_line` raises `SystemExit`, which every main-thread path already
  treats as a normal ending, so the run finishes as `[MAIN-THREAD RUN STOPPED]`.
  Reset Pyodide drops a suspended program with its runtime and never resumes it.
- **Without JSPI** it falls back to `js_input_prompt` → `window.prompt`, which now
  shows the last lines the program printed above the question
  (`promptWithRecentOutput`, fed by `mainThreadRecentOutputRef`), and echoes
  `prompt + answer` into the console so the transcript reads as typed.
- JSPI does not un-freeze a tight loop that never calls `input()` or `sleep` —
  nothing yields — which is why the worker stays the default.

### Diagram panels

- **UML diagram** (`UmlDiagram.tsx`): Parses class definitions from the editor source using `analyzePythonClasses` and renders a live SVG UML class + composition diagram.
- **Hierarchy chart** (`HierarchyChart.tsx`): Parses `def` statements via `analyzePythonFunctions` and renders a live SVG function call hierarchy chart.
- **Outline panel** (`OutlinePanel.tsx`): Renders an expandable symbol tree from `analyzePythonOutline`.
