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

**Encrypt prelim code** (when the AQA source Python changes):
```
node encrypt.mjs <input.py> enc.txt AQA_PRELIM_2026::       # A Level
node encrypt.mjs <input.py> enc_as.txt AQA_PRELIM_2026_AS:: # AS Level
```
You will be prompted for a password interactively. The output files `enc.txt` and `enc_as.txt` are committed and loaded by the interactives at runtime.

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

### Fixed inputs

- When "Use Fixed Inputs" is on, the Console panel becomes a two-tab panel
  (Console / Inputs); the Inputs tab hosts the fixed-input textarea. Every run
  rebuilds the input queue from the top of the textarea (`fixedInputsQueueRef` in
  `startTraceWorker`), so runs always re-consume inputs from the start.

### Diagram panels

- **UML diagram** (`UmlDiagram.tsx`): Parses class definitions from the editor source using `analyzePythonClasses` and renders a live SVG UML class + composition diagram.
- **Hierarchy chart** (`HierarchyChart.tsx`): Parses `def` statements via `analyzePythonFunctions` and renders a live SVG function call hierarchy chart.
- **Outline panel** (`OutlinePanel.tsx`): Renders an expandable symbol tree from `analyzePythonOutline`.
