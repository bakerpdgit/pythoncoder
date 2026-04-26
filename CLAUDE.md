# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

**Run locally:**
```
npm start
```
Serves on `http://localhost:3000`. No build step — all pages are static HTML files served by `server.mjs`.

**Encrypt prelim code** (when the AQA source Python changes):
```
node encrypt.mjs <input.py> enc.txt AQA_PRELIM_2026::       # A Level
node encrypt.mjs <input.py> enc_as.txt AQA_PRELIM_2026_AS:: # AS Level
```
You will be prompted for a password interactively. The output files `enc.txt` and `enc_as.txt` are committed and loaded by the interactives at runtime.

## Architecture

This is a zero-build, pure-HTML project. There is no bundler, no npm build script, and no separate JS source files — all application logic lives inline inside the HTML files.

### Pages
| File | Route | Purpose |
|------|-------|---------|
| `index.html` | `/` | Landing page — links to both interactives |
| `alevel.html` | `/alevel` | A Level Ants Simulation tracer |
| `as.html` | `/as` | AS Level Tile Game tracer |

### Tech stack (loaded from CDN, no local install)
- **React 18** (UMD dev build) + **Babel Standalone** for in-browser JSX compilation
- **Tailwind CSS** (CDN)
- **Monaco Editor** (loaded lazily for the code editor panel)
- **Pyodide v0.25.0** — runs Python in the browser via WebAssembly

### Cross-Origin Isolation requirement
`SharedArrayBuffer` (used to synchronise the Pyodide worker) requires Cross-Origin Isolation headers on every response:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`
- `Origin-Agent-Cluster: ?1`

These are set in three places: `server.mjs` (local dev), `serve.json` (Cloudflare Pages — the `headers` key there only applies to the `serve` CLI, not Cloudflare Pages), and `_headers` (Cloudflare Pages static headers file — this is what actually takes effect in production).

### How the tracer works
1. The user loads/pastes Python code into the Monaco editor.
2. On "Run", the main thread spawns a **Web Worker** whose source is inlined in a `<script id="worker-script">` tag and converted to a Blob URL.
3. The worker loads Pyodide, injects a Python `sys.settrace` hook that calls back into JS (`js_trace_callback`) on every line.
4. A **SharedArrayBuffer** (4 KB) is shared between the main thread and the worker. The worker blocks on `Atomics.wait` after each trace event; the main thread unblocks it via `Atomics.notify` when the user clicks Step/Continue.
5. Trace state (current line, variables, object graph) is posted back as structured messages and rendered by the React UI.

### Diagram panels
- **A Level** (`alevel.html`): Parses class definitions from the editor source using regex (`analyzePythonClasses`) and renders a live SVG UML class + composition diagram.
- **AS Level** (`as.html`): Parses `def` statements (`analyzePythonFunctions`) and renders a live SVG function call hierarchy chart.

### Encrypted code
The AQA preliminary code is not stored in plain text. `enc.txt` (A Level) and `enc_as.txt` (AS Level) contain AES-GCM encrypted JSON blobs (PBKDF2 key derivation, 250 000 iterations). The interactives fetch these files and decrypt them in-browser when the user clicks "Retrieve Prelim Code" and supplies the password.
