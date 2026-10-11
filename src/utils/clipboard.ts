/**
 * Put text on the clipboard.
 *
 * `navigator.clipboard` needs a secure context and can be refused outright, so
 * the old `execCommand` route stays as a fallback — students on a school
 * network are exactly the people most likely to hit a blocked permission.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch { /* fall through */ }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
