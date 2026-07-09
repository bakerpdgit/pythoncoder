import { useState } from 'react'
import { WizardHeader, WizardFooter, ShareLinkRow, inputClass, type WizardProps } from './webWizardShared'

// Convert a Google Drive share URL to a direct-download URL.
//   https://drive.google.com/file/d/<ID>/view?usp=sharing  ->  uc?export=download&id=<ID>
//   https://drive.google.com/open?id=<ID>                  ->  uc?export=download&id=<ID>
export function driveDirectUrl(shareUrl: string): string | null {
  const m = shareUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || shareUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : null
}

// Open a learning book ZIP shared from Google Drive. Drive does not send CORS
// headers, so the direct-download URL is fetched through our /api/proxy.
export function GoogleDriveWizard({ onBack, onOpen }: WizardProps) {
  const [url, setUrl] = useState('')
  const direct = driveDirectUrl(url.trim())

  return (
    <div>
      <WizardHeader title="Open from Google Drive"
        subtitle="Upload your book ZIP to Google Drive and set its sharing to “Anyone with the link”. Then paste the share link below." />
      <input autoFocus type="url" value={url} onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && direct) onOpen(direct) }}
        placeholder="https://drive.google.com/file/d/.../view?usp=sharing" className={inputClass} />
      {url.trim() && !direct && (
        <div className="text-amber-400 text-[11px] mt-1">
          That doesn't look like a Google Drive file link. Use the “Copy link” option from Drive's share dialog.
        </div>
      )}
      {direct && <ShareLinkRow resourceUrl={direct} />}
      <WizardFooter onBack={onBack} onOpen={() => direct && onOpen(direct)} openLabel="Open book" openDisabled={!direct} />
    </div>
  )
}
