import { useState } from 'react'
import { WizardHeader, WizardFooter, ShareLinkRow, inputClass, type WizardProps } from './webWizardShared'

// Open a learning book (ZIP or book.json) from any public URL. CORS is assumed
// to fail on arbitrary hosts, so these are fetched through our /api/proxy.
export function PublicUrlWizard({ onBack, onOpen }: WizardProps) {
  const [url, setUrl] = useState('')
  const trimmed = url.trim()
  const valid = /^https:\/\//i.test(trimmed)

  return (
    <div>
      <WizardHeader title="Open from a public URL"
        subtitle="Paste a direct link to a book ZIP (or a book.json). It will be fetched via this site's proxy, so it works even if the host does not allow cross-origin access. The URL must be https." />
      <input autoFocus type="url" value={url} onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && valid) onOpen(trimmed) }}
        placeholder="https://example.com/mybook.zip" className={inputClass} />
      {trimmed && !valid && (
        <div className="text-amber-400 text-[11px] mt-1">Enter a full https:// URL.</div>
      )}
      {valid && <ShareLinkRow resourceUrl={trimmed} />}
      <WizardFooter onBack={onBack} onOpen={() => onOpen(trimmed)} openLabel="Open book" openDisabled={!valid} />
    </div>
  )
}
