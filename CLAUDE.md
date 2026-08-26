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

- When driving the app with Playwright to verify a change, **also capture the browser
  console** (`page.on('console', …)` for `error`/`warning` and `page.on('pageerror', …)`)
  and confirm no new errors appear. Don't rely on screenshots alone.
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
  workers/
    tracer.worker.ts          # Pyodide trace worker (imported via ?worker)
    tester.worker.ts          # Pyodide worker for running challenge tests
  utils/
    codeAnalysis.ts           # Python source parsing (classes, functions, outline)
    virtualFS.ts              # IndexedDB-backed virtual filesystem (multiple named FSes)
    bookLoader.ts             # Learning "book" manifest/challenge loading
    htmlPreview.ts            # HTML file preview helpers
    stdctx.ts                 # sys.stdctx / sys.stdaud (Python bootstrap + renderers)
    vfsMediaUrl.ts            # deduped blob URLs for VFS-backed media (stdaud, drawImage)
    pyodideFs.ts              # which Pyodide MEMFS dirs are off-limits when syncing back
    testMatcher.ts            # Challenge test evaluation
    download.ts               # File download helpers
    export.ts                 # Note/docstring export formatting
    mainThread.ts             # Main-thread Pyodide loader + Pygame bootstrap
    storage.ts                # localStorage helpers (theme, notes, fixed inputs, layout)
    versionCheck.ts           # Background poll for new deployed versions
  components/
    InspectorPane.tsx         # Variable inspector with breadcrumb navigation
    FileSystemPanel.tsx       # Virtual filesystem browser + local-folder connect/sync
    BookPanel.tsx             # Learning book navigation + challenge runner
    ConsoleTerminal.tsx       # xterm-based interactive console (inline-console input mode)
    DisplayPane.tsx           # All visual output, directly below the Console
    CanvasPane.tsx            # stdctx canvas (a surface of the Display pane)
    TurtleScrubber.tsx        # Turtle SVG history scrubber (Display pane header)
    HtmlPreviewDialog.tsx     # Sandboxed HTML preview
    TestResultsBar.tsx        # Challenge test results
    dialogs/
      DialogProvider.tsx      # Promise-based styled confirm/choose/prompt/alert (useDialogs)
      ConfirmDialog.tsx       # Styled confirm dialog (with optional warning + checkbox)
      SaveFileDialog.tsx      # Save-to-VFS path/name picker
    ui/
      IconButton.tsx  ThemeToggleButton.tsx  RuntimeSettingsMenu.tsx
      PanelVisibilityMenu.tsx  DiagramFontControls.tsx  SettingsDialog.tsx
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

### Cross-Origin Isolation requirement

`SharedArrayBuffer` (used to synchronise the Pyodide worker) requires Cross-Origin Isolation headers on every response:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`
- `Origin-Agent-Cluster: ?1`

These are set in:
- `vite.config.ts` — dev and preview servers
- `server.mjs` — production Node server
- `public/_headers` — Cloudflare Pages (copied to `dist/_headers` at build time)

### How the tracer works

1. The user pastes Python code into the Monaco editor.
2. On "Run", the main thread creates a **Web Worker** from `src/workers/tracer.worker.ts` (bundled by Vite as an IIFE so it can call `importScripts`).
3. The worker calls `importScripts` to load Pyodide from CDN, then injects a Python `sys.settrace` hook that calls back into JS (`js_trace_callback`) on every line.
4. A **SharedArrayBuffer** (4 KB) is shared between the main thread and the worker. The worker blocks on `Atomics.wait` after each trace event; the main thread unblocks it via `Atomics.notify` when the user clicks Step/Continue.
5. Trace state (current line, variables, object graph) is posted back as structured messages and rendered by the React UI.

### UI conventions

- **No native browser dialogs.** Never use `window.confirm`, `window.alert`, or
  `window.prompt`. Use the promise-based styled dialogs from `DialogProvider`
  via the `useDialogs()` hook: `confirm`, `choose` (arbitrary buttons), `prompt`,
  `alert`. They are theme-aware and match the app's look. The one deliberate
  exception is `js_input_prompt` in `App.tsx` (Pyodide `input()` on the main
  thread), which must stay synchronous — a React modal can't return a value
  synchronously. It is commented as such; leave it.
- The app is **theme-aware** via `html[data-theme="light"]` overrides in
  `styles/index.css` (default is dark). Components use dark-oriented Tailwind
  `slate-*` classes; the light theme remaps them. If you introduce a color that
  must read in both themes and isn't already overridden (e.g. a translucent
  `bg-*/10` tint or an amber warning), verify it in light mode or add an override.
- Prefer translucent tints (e.g. `bg-slate-500/20`, `bg-emerald-500/10`) for
  subtle selection/highlight states so they work in both themes without overrides.

### Student links (URL parameters)

- The app reads these query parameters at startup (`App.tsx`, `utils/urlRunMode.ts`):
  `?book=<url>` (a `book.json` or a book ZIP), `?challenge=<id>`, `?showFirst`,
  `?mode=trace|run|debug`, and `?filesystem=<url>`. `buildShareLink`
  (`utils/bookSource.ts`) is the only place that composes them.
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
- It also applies the `pendingRestore` the post-run "Return to editor" bar would
  have, otherwise navigating out of a pygame run left the student in the
  full-canvas presentation layout.
- Navigation reads `challengeLoadIdRef` before awaiting and bails if it moved:
  the await is long enough for a second click to land.

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

### The Display pane

- **Every** kind of visual output lives in one **Display pane**, rendered directly
  below the Console inside the Console Output panel, with a draggable divider
  between them (`DisplayPane.tsx`, wired in the output region of `App.tsx`).
  Console and drawing are therefore always on screen together — the common case
  is a program whose console input drives what it draws. The Structure panel is
  purely static analysis (Outline / Hierarchy / Class / Notes) and owns no
  program output.
- Three surfaces share the pane, chosen by `DisplaySurface`
  (`'canvas' | 'turtle' | 'stdctx'`): the shared main-thread `<canvas id="canvas">`
  (pygame and the pyo-js turtle), the Basthon SVG turtle, and the stdctx canvas.
  A surface is offered once it has something to show; a tab strip appears in the
  Display header **only** when a program drives more than one.
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
- Debug and trace deliberately keep the normal layout, so `showTurtleSvg`,
  `beginStdctxRun` and `beginMainThreadCanvasRun` each force `visiblePanels.output`
  true and select their surface. Without that, a debug run draws into a hidden
  panel and looks as though it did nothing.

### stdctx canvas and stdaud audio

- `sys.stdctx` (canvas) and `sys.stdaud` (audio) are carried over from Python
  Sponge, so older funchallenge books that do `from sys import stdctx` keep
  working. stdctx mirrors the HTML5 Canvas 2D API; every call becomes a JSON
  command replayed against a `<canvas>` in the **Display pane** (see *The Display
  pane* below).
- The Python source and the JS renderers all live in `utils/stdctx.ts`;
  `CanvasPane.tsx` hosts the canvas. One bootstrap installs both objects.
- Detection is `detectSpongeLibs(editorSource, files)`, which scans **every
  mounted `.py`**, not just the open file. Book challenges routinely keep their
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

### Fixed inputs

- When "Use Fixed Inputs" is on, the Console panel becomes a two-tab panel
  (Console / Inputs); the Inputs tab hosts the fixed-input textarea. Every run
  rebuilds the input queue from the top of the textarea (`fixedInputsQueueRef` in
  `startTraceWorker`), so runs always re-consume inputs from the start.

### Diagram panels

- **UML diagram** (`UmlDiagram.tsx`): Parses class definitions from the editor source using `analyzePythonClasses` and renders a live SVG UML class + composition diagram.
- **Hierarchy chart** (`HierarchyChart.tsx`): Parses `def` statements via `analyzePythonFunctions` and renders a live SVG function call hierarchy chart.
- **Outline panel** (`OutlinePanel.tsx`): Renders an expandable symbol tree from `analyzePythonOutline`.
