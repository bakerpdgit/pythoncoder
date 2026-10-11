import { useEffect, useMemo, useState } from 'react'
import {
  buildEmbeddedShareLink, buildHostedShareLink, isTextContent, judgeShareLinkLength,
  type SharedBookContext, type UrlShareVerdict,
} from '../../utils/codeShare'
import { copyTextToClipboard } from '../../utils/clipboard'
import {
  describeSharedFiles, driveDirectUrl, fetchSharedFiles, sameSharedFiles, zipFileMap,
} from '../../utils/sharedResource'
import { getStoredGitHubToken } from '../../utils/storage'
import { downloadBlob } from '../../utils/virtualFS'
import { GistFindStep, type HostedChoice } from './share/GistFindStep'
import { ResourceFinder } from './ResourceFinder'
import { BigButton, ShareLinkRow, inputClass, primaryBtnClass, secondaryBtnClass } from './webWizardShared'

// Share my code: a wizard that ends in a link which opens the student's code in
// Coder for whoever clicks it.
//
// First *what* (this file, or every file in the filesystem), then *how*:
//   * inside the link itself, when it is short enough and all text;
//   * a GitHub Gist (one file) or public repository (a filesystem);
//   * Google Drive.
// The hosted routes walk through putting the code there, then point the wizard
// at it, and the last step fetches it exactly as the recipient's link will —
// so a link is never handed out for an address that does not hold the code.

export type ShareScope = 'file' | 'filesystem'

export interface ShareSource {
  /** The file on offer, e.g. `main.py`; null when there is none to share. */
  fileName: string | null
  filePath: string
  fileText: string
  /** Why the single file cannot be shared (an empty editor, a Parsons problem). */
  fileUnavailable?: string
  /** What the filesystem is called on screen. */
  filesystemLabel: string
  /** Every file to share, unsaved editor changes included. */
  loadFilesystem: () => Promise<Map<string, ArrayBuffer>>
  /** Why the filesystem cannot be shared (inside a book activity). */
  filesystemUnavailable?: string
  /** A book activity: the file shared alone may need files it does not carry. */
  inBookActivity: boolean
  /**
   * The online book and activity the file belongs to, when there is one: the
   * link then lets the recipient open the code inside that book.
   */
  bookContext?: SharedBookContext | null
  initialScope?: ShareScope
}

interface Props {
  source: ShareSource
  /**
   * Book edit mode: the files are a learning book. It is put online (or into a
   * link), and a hosted book then goes on to the Student links dialog.
   */
  bookEditMode: boolean
  onOpenStudentLinks: () => void
  /** Book mode: the book is online at this address — make the student link. */
  onContinueToStudentLink: (found: HostedChoice) => void
  onClose: () => void
}

type Route = 'link' | 'gist' | 'repo' | 'drive'
type Step =
  | 'what' | 'how' | 'link'
  | 'gist-create' | 'gist-find'
  | 'download' | 'repo-upload' | 'repo-find' | 'drive-upload' | 'drive-paste'
  | 'verify'

const ROUTE_STEPS: Record<Route, Step[]> = {
  link: ['link'],
  gist: ['gist-create', 'gist-find', 'verify'],
  repo: ['download', 'repo-upload', 'repo-find', 'verify'],
  drive: ['download', 'drive-upload', 'drive-paste', 'verify'],
}

const ICONS = {
  file: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
  folder: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />,
  link: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.5 6.5l1-1a4 4 0 015.66 5.66l-2.5 2.5a4 4 0 01-5.66 0M10.5 17.5l-1 1a4 4 0 01-5.66-5.66l2.5-2.5a4 4 0 015.66 0" />,
  github: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16M6 16l-4-4 4-4M18 8l4 4-4 4" />,
  drive: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 3h8l5 9-4 7H7l-4-7 5-9zM3.5 12h17M8 3l4 9-4 7M16 3l-4 9 4 7" />,
}

function lineCount(text: string): number {
  if (!text) return 0
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

export function ShareCodeDialog({ source, bookEditMode, onOpenStudentLinks, onContinueToStudentLink, onClose }: Props) {
  const fileShareable = !!source.fileName && !source.fileUnavailable
  const fsShareable = !source.filesystemUnavailable
  const initialScope: ShareScope | null = bookEditMode ? 'filesystem'
    : source.initialScope === 'file' && fileShareable ? 'file'
      : source.initialScope === 'filesystem' && fsShareable ? 'filesystem'
        : null
  const [whyNotLink, setWhyNotLink] = useState(false)

  const [scope, setScope] = useState<ShareScope | null>(initialScope)
  const [route, setRoute] = useState<Route | null>(null)
  const [step, setStep] = useState<Step>(initialScope ? 'how' : 'what')
  const [fsFiles, setFsFiles] = useState<Map<string, ArrayBuffer> | null>(null)
  const [fsError, setFsError] = useState('')
  const [embedded, setEmbedded] = useState<{ link: string; verdict: UrlShareVerdict } | null>(null)
  const [hosted, setHosted] = useState<HostedChoice | null>(null)
  const [driveAddress, setDriveAddress] = useState('')
  const token = useMemo(() => getStoredGitHubToken(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The filesystem is read once, up front, so step 1 can say how many files it holds.
  useEffect(() => {
    if (!fsShareable) return
    let cancelled = false
    source.loadFilesystem()
      .then(files => { if (!cancelled) setFsFiles(files) })
      .catch(e => { if (!cancelled) setFsError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [source, fsShareable])

  const fileMap = useMemo<Map<string, ArrayBuffer> | null>(() => {
    if (scope === 'file') {
      return new Map([[source.filePath, new TextEncoder().encode(source.fileText).buffer as ArrayBuffer]])
    }
    if (scope === 'filesystem') return fsFiles
    return null
  }, [scope, fsFiles, source.filePath, source.fileText])

  const nonText = useMemo(() => fileMap
    ? [...fileMap].filter(([, content]) => !isTextContent(content)).map(([path]) => path.slice(1))
    : [], [fileMap])

  useEffect(() => {
    setEmbedded(null)
    if (!fileMap || nonText.length || fileMap.size === 0) return
    let cancelled = false
    const decoder = new TextDecoder()
    const files = [...fileMap].map(([path, content]) => ({ path, text: decoder.decode(content) }))
    const open = scope === 'file' ? source.filePath
      : files.find(f => f.path === source.filePath)?.path ?? files.find(f => f.path === '/main.py')?.path ?? files[0].path
    const book = scope === 'file' && source.bookContext ? { book: source.bookContext } : {}
    void buildEmbeddedShareLink({ files, open, ...book, ...(bookEditMode ? { isBook: true } : {}) }).then(link => {
      if (!cancelled) setEmbedded({ link, verdict: judgeShareLinkLength(link) })
    })
    return () => { cancelled = true }
  }, [fileMap, nonText, scope, source.filePath, source.bookContext, bookEditMode])

  const shell = (body: React.ReactNode) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Share your code"
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-5 w-[520px] max-w-[95vw] max-h-[92vh] overflow-y-auto text-xs"
        onClick={e => e.stopPropagation()}>
        {body}
      </div>
    </div>
  )

  const fileName = scope === 'file' ? source.fileName ?? 'main.py' : null
  const zipName = `${(source.filesystemLabel || 'my-code').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'my-code'}.zip`

  // A book being edited has no "what" to choose, and is checked by the Student
  // links dialog rather than here.
  const routeSteps = route ? ROUTE_STEPS[route].filter(s => !(bookEditMode && s === 'verify')) : []
  const allSteps: Step[] = [...(bookEditMode ? [] : ['what' as const]), 'how', ...routeSteps]
  const stepIndex = allSteps.indexOf(step)
  const goBack = () => {
    if (step === 'how') { setStep('what'); setRoute(null); return }
    if (stepIndex > 0) {
      const previous = allSteps[stepIndex - 1]
      if (previous === 'how') setRoute(null)
      setStep(previous)
    }
  }
  const atLastStep = stepIndex === allSteps.length - 1
  const goNext = () => {
    if (bookEditMode && atLastStep && hosted) { onClose(); onContinueToStudentLink(hosted); return }
    if (!atLastStep) setStep(allSteps[stepIndex + 1])
  }
  const startRoute = (next: Route) => {
    setRoute(next); setHosted(null); setDriveAddress('')
    setStep(ROUTE_STEPS[next][0])
  }

  const stepLabel = route ? `Step ${stepIndex + 1} of ${allSteps.length}` : step === 'how' ? 'Step 2' : 'Step 1'

  // ── Step 1: what ──────────────────────────────────────────────────────────
  if (step === 'what') {
    const fsDesc = source.filesystemUnavailable
      ?? (fsError ? `Could not read the files: ${fsError}`
        : fsFiles ? `${fsFiles.size} file${fsFiles.size === 1 ? '' : 's'} in “${source.filesystemLabel}”.`
          : 'Reading the files…')
    return shell(
      <>
        <Header title="Share your code" subtitle="Make a link that opens your code in Coder for whoever you send it to. They get their own copy — nothing they do changes yours." step={stepLabel} />
        <div className="flex flex-col gap-2">
          <BigButton testId="share-scope-file" icon={ICONS.file} disabled={!fileShareable}
            title={source.fileName ? `This file — ${source.fileName}` : 'This file'}
            desc={source.fileUnavailable ?? `${lineCount(source.fileText)} lines, as it is in the editor now.`}
            onClick={() => { setScope('file'); setStep('how') }} />
          <BigButton testId="share-scope-filesystem" icon={ICONS.folder} disabled={!fsShareable || !fsFiles || fsFiles.size === 0}
            title="All my files" desc={fsDesc}
            onClick={() => { setScope('filesystem'); setStep('how') }} />
        </div>
        <Footer onCancel={onClose} />
      </>,
    )
  }

  // ── Step 2: how ───────────────────────────────────────────────────────────
  if (step === 'how') {
    const linkDisabledReason = !fileMap ? 'Reading the files…'
      : nonText.length ? `Holds files that are not text (${nonText.slice(0, 2).join(', ')}${nonText.length > 2 ? ', …' : ''}) — a link can only carry text.`
        : !embedded ? 'Working out how long the link would be…'
          : !embedded.verdict.ok ? `${embedded.verdict.reason} Use GitHub or Google Drive instead.`
            : null
    const linkDesc = linkDisabledReason ?? (embedded?.verdict.ok && embedded.verdict.long
      ? `${embedded.verdict.length.toLocaleString('en-GB')} characters — a long link. It works in browsers and email; some chat apps may cut it short.`
      : `${embedded?.verdict.length.toLocaleString('en-GB')} characters. Nothing to upload anywhere.`)
    if (bookEditMode) {
      return shell(
        <>
          <Header title={`Share “${source.filesystemLabel}”`}
            subtitle="Put the book online, then make a link for your students to it." step={stepLabel} />
          <div className="flex flex-col gap-2">
            <BigButton testId="share-route-github" icon={ICONS.github} title="GitHub repository"
              desc="Upload the book's files (or a ZIP of them) to a public repository. Updates you push reach your students."
              onClick={() => startRoute('repo')} />
            <BigButton testId="share-route-drive" icon={ICONS.drive} title="Google Drive"
              desc="Upload a ZIP of the book and share it with “Anyone with the link”."
              onClick={() => startRoute('drive')} />
            <BigButton testId="share-route-link" icon={ICONS.link} disabled={!!linkDisabledReason}
              title="A link with the whole book inside (not recommended)" desc={linkDesc} onClick={() => startRoute('link')} />
          </div>
          <button type="button" onClick={() => setWhyNotLink(o => !o)} aria-expanded={whyNotLink}
            className="mt-2 text-[11px] text-slate-400 hover:text-slate-200 underline decoration-dotted">
            Why is a link not recommended for a book?
          </button>
          {whyNotLink && (
            <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
              A link holds a copy of the book as it is now. To change the book you would have to send everyone a new
              link, and each student&apos;s ticks belong to the copy they opened. A book kept on GitHub or Drive is
              updated in one place, and the same student link keeps working.
            </p>
          )}
          <div className="flex justify-between items-center gap-2 mt-4">
            <button type="button" onClick={() => { onClose(); onOpenStudentLinks() }}
              className="text-[11px] text-sky-400 hover:text-sky-300 underline decoration-dotted">
              Already online? Create a student link…
            </button>
            <button type="button" onClick={onClose} className={secondaryBtnClass}>Cancel</button>
          </div>
        </>,
      )
    }
    return shell(
      <>
        <Header title={scope === 'file' ? `Share ${fileName}` : `Share all files in “${source.filesystemLabel}”`}
          subtitle="How would you like to share it?" step={stepLabel} />
        {scope === 'file' && source.inBookActivity && (
          <p className="text-slate-400 mb-2 leading-relaxed">
            Only this file is shared — not the activity&apos;s instructions or any data files it reads.
            {source.bookContext && <> The link also lets them open it inside the learning book
              {source.bookContext.title ? <> &ldquo;{source.bookContext.title}&rdquo;</> : null}.</>}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <BigButton testId="share-route-link" icon={ICONS.link} disabled={!!linkDisabledReason}
            title="A link with the code inside" desc={linkDesc} onClick={() => startRoute('link')} />
          <BigButton testId="share-route-github" icon={ICONS.github}
            title={scope === 'file' ? 'GitHub Gist' : 'GitHub repository'}
            desc={scope === 'file'
              ? 'The easiest way to put one file online: paste it into a gist. Needs a free GitHub account.'
              : 'Upload your files (or a ZIP of them) to a public repository. Needs a free GitHub account.'}
            onClick={() => startRoute(scope === 'file' ? 'gist' : 'repo')} />
          <BigButton testId="share-route-drive" icon={ICONS.drive}
            title="Google Drive"
            desc={`Upload ${scope === 'file' ? 'the file' : 'a ZIP of your files'} and share it with “Anyone with the link”.`}
            onClick={() => startRoute('drive')} />
        </div>
        <Footer onBack={goBack} onCancel={onClose} />
      </>,
    )
  }

  // ── Route steps ───────────────────────────────────────────────────────────
  const download = async () => {
    if (!fileMap) return
    if (scope === 'file') {
      downloadBlob(new Blob([source.fileText], { type: 'text/x-python' }), fileName ?? 'main.py')
    } else {
      downloadBlob(await zipFileMap(fileMap), zipName)
    }
  }

  const footer = (nextDisabled = false, nextLabel = bookEditMode && atLastStep ? 'Next: the student link' : 'Next') => (
    <Footer onBack={goBack} onCancel={onClose} onNext={goNext} nextDisabled={nextDisabled} nextLabel={nextLabel} />
  )

  if (step === 'link' && embedded) {
    return shell(
      <>
        <Header title="Your link" subtitle="Send this link to anyone. It opens your code in Coder as their own copy." step={stepLabel} />
        <LinkResult link={embedded.link} />
        <Notes items={[
          'The code is inside the link itself, so anyone who has the link can read it.',
          'Changes you make from now on are not in it. Share again for a new link.',
        ]} />
        <Footer onBack={goBack} onDone={onClose} />
      </>,
    )
  }

  if (step === 'gist-create') {
    return shell(
      <>
        <Header title="Put your code in a gist" subtitle="A gist is one file kept on GitHub. Sign in to GitHub first (a free account)." step={stepLabel} />
        <div className="flex gap-2 mb-3">
          <CopyButton text={source.fileText} label="Copy my code" />
          <a href="https://gist.github.com/" target="_blank" rel="noopener noreferrer" className={secondaryBtnClass}>
            Open gist.github.com ↗
          </a>
        </div>
        <Instructions items={[
          <>In the box <em>Filename including extension…</em> type <code className="font-mono text-emerald-300">{fileName}</code></>,
          'Click in the big box below it and paste your code (Ctrl+V).',
          <>Click <strong>Create public gist</strong> — use the arrow beside the green button if it says <em>Create secret gist</em>. (A secret gist works too, but you will have to paste its address in the next step.)</>,
          'Come back to this tab and press Next.',
        ]} />
        {footer()}
      </>,
    )
  }

  if (step === 'gist-find') {
    return shell(
      <>
        <Header title="Find your gist" subtitle="Paste the address from your browser's address bar, or find it by your GitHub username." step={stepLabel} />
        <GistFindStep token={token} selected={hosted} onSelect={setHosted} />
        {footer(!hosted)}
      </>,
    )
  }

  if (step === 'download') {
    return shell(
      <>
        <Header title={scope === 'file' ? `Download ${fileName}` : bookEditMode ? 'Download the book' : 'Download your files'}
          subtitle={scope === 'file'
            ? 'Save a copy of the file on your computer, ready to upload.'
            : `Save your files as one ZIP, ready to upload. (${fileMap?.size ?? 0} files.)`}
          step={stepLabel} />
        <button type="button" onClick={() => void download()} className={primaryBtnClass}>
          Download {scope === 'file' ? fileName : zipName}
        </button>
        {route === 'repo' && (
          <p className="text-slate-400 mt-3 leading-relaxed">
            You can upload the ZIP as it is, or unzip it and upload the files themselves — Coder can open either.
          </p>
        )}
        {footer()}
      </>,
    )
  }

  if (step === 'repo-upload') {
    return shell(
      <>
        <Header title="Upload to a public repository" subtitle="Sign in to GitHub first (a free account)." step={stepLabel} />
        <a href="https://github.com/new" target="_blank" rel="noopener noreferrer" className={`${secondaryBtnClass} inline-block mb-3`}>
          Open github.com/new ↗
        </a>
        <Instructions items={[
          <>Give the repository a name, choose <strong>Public</strong>, and click <strong>Create repository</strong>. (Or open a public repository you already have.)</>,
          <>Click <strong>uploading an existing file</strong> (or <strong>Add file → Upload files</strong>).</>,
          <>Drag in <code className="font-mono text-emerald-300">{zipName}</code> — or, if you unzipped it, all the files inside it.</>,
          <>Click <strong>Commit changes</strong>, then come back to this tab and press Next.</>,
        ]} />
        {footer()}
      </>,
    )
  }

  if (step === 'repo-find') {
    return shell(
      <>
        <Header title={bookEditMode ? 'Find your book' : 'Find your files'}
          subtitle={bookEditMode ? 'Choose the folder that holds book.json, or the ZIP you uploaded.' : 'Choose the ZIP you uploaded, or the folder that holds your files.'}
          step={stepLabel} />
        <ResourceFinder sources={['github']} selected={hosted} onSelect={setHosted} />
        {footer(!hosted)}
      </>,
    )
  }

  if (step === 'drive-upload') {
    return shell(
      <>
        <Header title="Upload to Google Drive" subtitle="Sign in to Google first." step={stepLabel} />
        <a href="https://drive.google.com/" target="_blank" rel="noopener noreferrer" className={`${secondaryBtnClass} inline-block mb-3`}>
          Open Google Drive ↗
        </a>
        <Instructions items={[
          <>Click <strong>New → File upload</strong> and choose <code className="font-mono text-emerald-300">{scope === 'file' ? fileName : zipName}</code>.</>,
          <>Right-click the uploaded file and choose <strong>Share → Share</strong>.</>,
          <>Under <strong>General access</strong>, change <em>Restricted</em> to <strong>Anyone with the link</strong> (Viewer).</>,
          <>Click <strong>Copy link</strong>, then come back to this tab and press Next.</>,
        ]} />
        <div className="dialog-warning-text text-amber-300 text-[11px] mt-3 leading-relaxed">
          School Google accounts often do not allow “Anyone with the link”. If yours only offers your school&apos;s name,
          Coder will not be able to open the file — use GitHub instead.
        </div>
        {footer()}
      </>,
    )
  }

  if (step === 'drive-paste') {
    const direct = driveDirectUrl(driveAddress)
    return shell(
      <>
        <Header title="Paste the Drive link" subtitle="The link you copied from Drive's Share box." step={stepLabel} />
        <input autoFocus type="url" value={driveAddress} aria-label="Google Drive link"
          onChange={e => {
            setDriveAddress(e.target.value)
            const next = driveDirectUrl(e.target.value)
            setHosted(next ? { url: next, label: 'Google Drive file' } : null)
          }}
          onKeyDown={e => { if (e.key === 'Enter' && direct) goNext() }}
          placeholder="https://drive.google.com/file/d/.../view?usp=sharing" className={inputClass} />
        {driveAddress.trim() && !direct && (
          <div className="dialog-warning-text text-amber-400 text-[11px] mt-1">
            That does not look like a Google Drive file link. Use <strong>Copy link</strong> in Drive&apos;s Share box.
          </div>
        )}
        {footer(!direct)}
      </>,
    )
  }

  if (step === 'verify' && hosted && fileMap) {
    return shell(
      <>
        <Header title="Checking your link" subtitle="Coder is opening the address the way the person you send it to will." step={stepLabel} />
        <VerifyStep
          url={hosted.url}
          name={route === 'drive' && scope === 'file' ? fileName ?? undefined : undefined}
          token={token}
          local={fileMap}
          singleFile={scope === 'file'}
          book={scope === 'file' ? source.bookContext ?? null : null} />
        <Footer onBack={goBack} onDone={onClose} />
      </>,
    )
  }

  return shell(<Footer onBack={goBack} onCancel={onClose} />)
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Header({ title, subtitle, step }: { title: string; subtitle: string; step?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-sm font-bold text-white">{title}</div>
        {step && <div className="text-[10px] text-slate-500 flex-shrink-0">{step}</div>}
      </div>
      <p className="text-slate-400 leading-relaxed">{subtitle}</p>
    </div>
  )
}

function Footer({ onBack, onCancel, onNext, nextDisabled, nextLabel = 'Next', onDone }: {
  onBack?: () => void
  onCancel?: () => void
  onNext?: () => void
  nextDisabled?: boolean
  nextLabel?: string
  onDone?: () => void
}) {
  return (
    <div className="flex justify-between items-center gap-2 mt-4">
      <div>{onBack && <button type="button" onClick={onBack} className={secondaryBtnClass}>Back</button>}</div>
      <div className="flex gap-2">
        {onCancel && <button type="button" onClick={onCancel} className={secondaryBtnClass}>Cancel</button>}
        {onNext && <button type="button" onClick={onNext} disabled={nextDisabled} className={primaryBtnClass}>{nextLabel}</button>}
        {onDone && <button type="button" onClick={onDone} className={primaryBtnClass}>Done</button>}
      </div>
    </div>
  )
}

function Instructions({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-decimal pl-5 space-y-1.5 text-slate-300 leading-relaxed">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ol>
  )
}

function Notes({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-1 text-[11px] text-slate-400 leading-relaxed list-disc pl-4">
      {items.map(item => <li key={item}>{item}</li>)}
    </ul>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button" className={primaryBtnClass} onClick={() => {
      void copyTextToClipboard(text).then(ok => {
        if (!ok) return
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
    }}>
      {copied ? 'Copied!' : label}
    </button>
  )
}

function LinkResult({ link }: { link: string }) {
  return (
    <>
      <ShareLinkRow link={link} label="Copy this link and send it:" />
      <a href={link} target="_blank" rel="noopener noreferrer"
        className="inline-block mt-2 text-[11px] text-sky-400 hover:text-sky-300 underline decoration-dotted">
        Open it in a new tab to try it ↗
      </a>
    </>
  )
}

function VerifyStep({ url, name, token, local, singleFile, book }: {
  url: string
  name?: string
  token: string
  local: Map<string, ArrayBuffer>
  singleFile: boolean
  book: SharedBookContext | null
}) {
  const [state, setState] = useState<
    | { status: 'checking' }
    | { status: 'ok'; found: string; matches: boolean }
    | { status: 'failed'; message: string }
  >({ status: 'checking' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'checking' })
    fetchSharedFiles(url, { name, token }).then(result => {
      if (cancelled) return
      // A single file is compared by content alone: the student may have
      // named the gist's file something else, and that is fine.
      const matches = singleFile
        ? result.files.size === 1 && sameSharedFiles(
          new Map([['/', [...result.files.values()][0]]]), new Map([['/', [...local.values()][0]]]))
        : sameSharedFiles(result.files, local)
      setState({ status: 'ok', found: describeSharedFiles(result.files), matches })
    }).catch(e => {
      if (!cancelled) setState({ status: 'failed', message: e instanceof Error ? e.message : String(e) })
    })
    return () => { cancelled = true }
  }, [url, name, token, local, singleFile, attempt])

  if (state.status === 'checking') {
    return <div className="text-slate-400" data-testid="share-verify-checking">Checking…</div>
  }
  if (state.status === 'failed') {
    return (
      <div data-testid="share-verify-failed">
        <div className="text-red-400 leading-relaxed">{state.message}</div>
        <p className="text-slate-400 mt-2 leading-relaxed">
          Go Back to check the earlier steps, or fix it and try again.
        </p>
        <button type="button" onClick={() => setAttempt(a => a + 1)} className={`${secondaryBtnClass} mt-2`}>Try again</button>
      </div>
    )
  }
  return (
    <div data-testid="share-verify-ok">
      <div className="text-emerald-300">✓ Found {state.found}</div>
      {state.matches
        ? <div className="text-slate-400 mt-1">It matches the code you have here.</div>
        : (
          <div className="dialog-warning-text text-amber-300 mt-1 leading-relaxed">
            It is not quite the same as the code you have here. That is fine if you meant it — otherwise upload the latest
            version and press Try again.
            <button type="button" onClick={() => setAttempt(a => a + 1)} className={`${secondaryBtnClass} ml-2`}>Try again</button>
          </div>
        )}
      <LinkResult link={buildHostedShareLink(url, { name, book })} />
      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
        The link opens whatever is at that address, so if you update the file there, the same link shares the update.
        Anyone with the link can see the code.
      </p>
    </div>
  )
}
