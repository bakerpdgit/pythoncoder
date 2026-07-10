import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Markdown } from 'tiptap-markdown'

interface Props {
  // Remounted (via key) per challenge, so initialMarkdown seeds once.
  initialMarkdown: string
  onSave: (markdown: string) => void
}

type Mode = 'wysiwyg' | 'source'

// tiptap-markdown augments editor.storage.markdown at runtime; type it locally.
function getMarkdown(editor: Editor): string {
  return (editor.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? ''
}

function ToolbarButton({ active, disabled, title, onClick, children }: {
  active?: boolean; disabled?: boolean; title: string; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button type="button" title={title} disabled={disabled}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      className={`px-1.5 py-1 rounded text-xs flex items-center justify-center transition-colors disabled:opacity-40 ${
        active ? 'bg-sky-500/25 text-sky-200' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700'
      }`}>
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  // Re-render the toolbar on selection/state changes so active states update.
  const [, force] = useState(0)
  useEffect(() => {
    const h = () => force(n => n + 1)
    editor.on('transaction', h)
    editor.on('selectionUpdate', h)
    return () => { editor.off('transaction', h); editor.off('selectionUpdate', h) }
  }, [editor])

  return (
    <div className="flex items-center flex-wrap gap-0.5 px-1.5 py-1 border-b border-slate-700 bg-slate-900/60">
      <ToolbarButton title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><span className="font-bold">B</span></ToolbarButton>
      <ToolbarButton title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><span className="italic">I</span></ToolbarButton>
      <ToolbarButton title="Inline code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}><span className="font-mono">{'<>'}</span></ToolbarButton>
      <span className="w-px h-4 bg-slate-700 mx-0.5" />
      <ToolbarButton title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
      <ToolbarButton title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
      <ToolbarButton title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
      <span className="w-px h-4 bg-slate-700 mx-0.5" />
      <ToolbarButton title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>•</ToolbarButton>
      <ToolbarButton title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolbarButton>
      <ToolbarButton title="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><span className="font-mono">{'{ }'}</span></ToolbarButton>
      <ToolbarButton title="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>&ldquo;</ToolbarButton>
    </div>
  )
}

// WYSIWYG Markdown editor for exercise guides, with a toggle to raw Markdown.
// Custom tokens (fenced code blocks, `![preview](turtlepreview)` images) survive
// the round-trip because CodeBlock and Image nodes are enabled.
export function GuideEditor({ initialMarkdown, onSave }: Props) {
  const [mode, setMode] = useState<Mode>('wysiwyg')
  const [source, setSource] = useState(initialMarkdown)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleSave = useCallback((md: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onSave(md), 500)
  }, [onSave])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: true }),
      Markdown.configure({ html: false, transformPastedText: true, breaks: false }),
    ],
    content: initialMarkdown,
    onUpdate: ({ editor }) => {
      const md = getMarkdown(editor)
      setSource(md)
      scheduleSave(md)
    },
    editorProps: { attributes: { class: 'guide-prose focus:outline-none' } },
  })

  // Load initial markdown as markdown (not HTML) once the editor is ready.
  useEffect(() => {
    if (editor) editor.commands.setContent(initialMarkdown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const switchMode = (next: Mode) => {
    if (next === mode) return
    if (next === 'source') {
      // WYSIWYG → source: pull latest markdown out of the editor.
      if (editor) setSource(getMarkdown(editor))
    } else {
      // Source → WYSIWYG: push the edited markdown back into the editor.
      if (editor) editor.commands.setContent(source)
    }
    setMode(next)
  }

  const onSourceChange = (v: string) => {
    setSource(v)
    scheduleSave(v)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 border border-slate-700 rounded-md overflow-hidden bg-slate-950/40">
      <div className="flex items-center justify-between px-1.5 py-1 border-b border-slate-700 bg-slate-900">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 pl-1">Instructions</span>
        <div className="flex items-center gap-0.5 text-[11px]">
          <button type="button" onClick={() => switchMode('wysiwyg')}
            className={`px-2 py-0.5 rounded ${mode === 'wysiwyg' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}>Rich</button>
          <button type="button" onClick={() => switchMode('source')}
            className={`px-2 py-0.5 rounded ${mode === 'source' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}>Markdown</button>
        </div>
      </div>

      {mode === 'wysiwyg' ? (
        <>
          {editor && <Toolbar editor={editor} />}
          <div className="guide-editor-scroll flex-1 min-h-0 overflow-y-auto px-2 py-2">
            <EditorContent editor={editor} />
          </div>
        </>
      ) : (
        <textarea
          value={source}
          onChange={e => onSourceChange(e.target.value)}
          spellCheck={false}
          aria-label="Guide markdown source"
          className="w-full flex-1 min-h-0 bg-slate-950 text-slate-200 font-mono text-xs p-2 focus:outline-none resize-none" />
      )}
    </div>
  )
}
