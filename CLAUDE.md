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
    CanvasPane.tsx            # stdctx canvas (Canvas tab of the console panel)
    TurtleScrubber.tsx        # Turtle SVG history scrubber
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

### Virtual filesystem & local folders

- `utils/virtualFS.ts` is an IndexedDB-backed store of multiple named filesystems
  (`default` always exists with `main.py`). `FileSystemPanel` browses them.
- A local OS folder can be connected via the File System Access API. When the
  active filesystem is the connected one, mutations (save, new file/folder,
  rename, delete) are **mirrored to disk** through `syncToLocalFolder` in
  `App.tsx`. There is no inbound file-watching (the API can't); a manual
  "Reload from folder" button re-reads disk. Permissions reset on page reload.

### stdctx canvas and stdaud audio

- `sys.stdctx` (canvas) and `sys.stdaud` (audio) are carried over from Python
  Sponge, so older funchallenge books that do `from sys import stdctx` keep
  working. stdctx mirrors the HTML5 Canvas 2D API; every call becomes a JSON
  command replayed against a `<canvas>` in a **Canvas tab** of the console panel.
- The Python source and the JS renderers all live in `utils/stdctx.ts`;
  `CanvasPane.tsx` hosts the canvas. One bootstrap installs both objects, gated
  on `codeUsesSpongeLibs`; the Canvas tab needs `codeUsesStdctx` specifically, so
  an audio-only program does not grow one.
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
