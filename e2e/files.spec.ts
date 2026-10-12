import { test, expect, type Page } from '@playwright/test'
import { setProgram, watchForErrors } from './helpers'

/**
 * Save as from the editor's split save button, and Copy to… from a file's
 * right-click menu in the File System panel.
 */

const editor = (page: Page) => page.locator('.monaco-editor').first()
const fileRow = (page: Page, name: string) => page.getByText(name, { exact: true }).first()

test('Save as writes the editor to a new file, and the button then stays on Save as', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgram(page, 'print("saved as a new file")')
  await page.getByTitle('Expand sidebar').click()

  // Choosing Save as from the menu switches the button and does it at once.
  await page.getByRole('button', { name: 'Choose Save or Save as' }).click()
  await page.getByRole('menuitemradio', { name: 'Save as…' }).click()
  const saveAs = page.getByRole('dialog', { name: 'Save as' })
  await expect(saveAs.getByPlaceholder('filename.py')).toHaveValue('main.py')

  // Its own name is plain Save: nothing to ask.
  await saveAs.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved as /main.py.')).toBeVisible()

  await page.getByRole('button', { name: /^Save as… \(choose/ }).click()
  await saveAs.getByPlaceholder('filename.py').fill('second.py')
  await saveAs.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Code Editor (second.py)')).toBeVisible()
  await expect(fileRow(page, 'second.py')).toBeVisible()

  // A taken name asks first, and Cancel leaves the dialog for another name.
  await setProgram(page, 'print("version two")')
  await page.getByRole('button', { name: /^Save as… \(choose/ }).click()
  await saveAs.getByPlaceholder('filename.py').fill('main.py')
  await saveAs.getByRole('button', { name: 'Save', exact: true }).click()
  const replace = page.getByRole('dialog', { name: 'Replace file?' })
  await expect(replace).toContainText('"main.py" already exists')
  await replace.getByRole('button', { name: 'Cancel' }).click()
  await saveAs.getByPlaceholder('filename.py').fill('third.py')
  await saveAs.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Code Editor (third.py)')).toBeVisible()

  // second.py kept what it was saved with.
  await fileRow(page, 'second.py').click()
  await expect(editor(page)).toContainText('saved as a new file')

  // Back to plain Save through the same menu.
  await page.getByRole('button', { name: 'Choose Save or Save as' }).click()
  await page.getByRole('menuitemradio', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save to virtual filesystem' })).toBeVisible()
  expect(problems).toEqual([])
})

test('Copy to… copies a file into a folder of another filesystem, refusing a taken name', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgram(page, 'print("copied across")')
  await page.getByRole('button', { name: 'Save to virtual filesystem' }).click()
  await page.getByTitle('Expand sidebar').click()

  // A second filesystem to copy into; making it switches to it, so switch back.
  const fsMenu = page.getByRole('button', { name: 'Default', exact: true })
  await fsMenu.click()
  await page.getByRole('button', { name: /New filesystem/ }).click()
  await page.getByPlaceholder('FS name...').fill('Other')
  await page.getByPlaceholder('FS name...').press('Enter')
  await page.getByRole('button', { name: 'Other', exact: true }).click()
  await page.getByRole('button', { name: 'Default', exact: true }).click()
  await expect(fileRow(page, 'main.py')).toBeVisible()

  const copyMain = async () => {
    await fileRow(page, 'main.py').click({ button: 'right' })
    await page.getByRole('button', { name: 'Copy to…' }).click()
    return page.getByRole('dialog', { name: 'Copy main.py to' })
  }

  let dialog = await copyMain()
  await dialog.getByLabel('Filesystem:').selectOption({ label: 'Other' })
  await dialog.getByRole('button', { name: 'New folder here' }).click()
  await dialog.getByPlaceholder('Folder name...').fill('backup')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toContainText('Copying to Other › /backup/main.py')
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Copied main.py to /backup/main.py in Other.')).toBeVisible()

  // The same place again: refused, the name offered for changing.
  dialog = await copyMain()
  await dialog.getByLabel('Filesystem:').selectOption({ label: 'Other' })
  await dialog.getByRole('button', { name: 'backup' }).click()
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('A file named "main.py" already exists in /backup of Other')
  const name = dialog.getByLabel('Name of copy:')
  await expect(name).toBeFocused()
  await name.fill('main_v2.py')
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(dialog).toBeHidden()

  // Both copies are there, with the saved code in them.
  await fsMenu.click()
  await page.getByRole('button', { name: 'Other', exact: true }).click()
  await fileRow(page, 'backup').click()
  await expect(fileRow(page, 'main_v2.py')).toBeVisible()
  await fileRow(page, 'main_v2.py').click()
  await expect(editor(page)).toContainText('copied across')

  // Cancel copies nothing.
  dialog = await (async () => {
    await fileRow(page, 'main_v2.py').click({ button: 'right' })
    await page.getByRole('button', { name: 'Copy to…' }).click()
    return page.getByRole('dialog', { name: 'Copy main_v2.py to' })
  })()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  expect(problems).toEqual([])
})

/** Put files into the default virtual filesystem, as if the student had made them. */
async function seedFiles(page: Page, files: Record<string, string>): Promise<void> {
  // A string, not a function: see the same helper in panels.spec.ts.
  await page.evaluate(`(async files => {
    const vfs = await import('/src/utils/virtualFS.ts')
    for (const [path, source] of Object.entries(files)) {
      await vfs.writeFile('default', path, new TextEncoder().encode(source).buffer)
    }
  })(${JSON.stringify(files)})`)
}

test('Ctrl+click and Shift+click select several files, which copy and delete together', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await seedFiles(page, {
    '/a.py': 'print("a")', '/b.py': 'print("b")', '/c.py': 'print("c")', '/d.py': 'print("d")',
    '/data/x.csv': '1,2,3',
  })
  await page.reload()
  await page.getByTitle('Expand sidebar').click()
  const count = page.getByTestId('fs-selection-count')

  // A plain click opens b.py; Shift+click runs the selection on to d.py
  // without opening it; Ctrl+click adds the folder.
  await fileRow(page, 'b.py').click()
  await expect(page.getByText('Code Editor (b.py)')).toBeVisible()
  await fileRow(page, 'd.py').click({ modifiers: ['Shift'] })
  await expect(count).toHaveText(/^3 selected/)
  await expect(page.getByText('Code Editor (b.py)')).toBeVisible()
  await fileRow(page, 'data').click({ modifiers: ['ControlOrMeta'] })
  await expect(count).toHaveText(/^4 selected/)
  // Still at the root: Ctrl+click on a folder chooses it rather than going in.
  await expect(fileRow(page, 'a.py')).toBeVisible()

  // Right-click inside the selection: the menu is for all four.
  await fileRow(page, 'c.py').click({ button: 'right' })
  await expect(page.getByText('4 items selected')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rename' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Copy to…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Copy 4 items to' })
  await dialog.getByRole('button', { name: 'New folder here' }).click()
  await dialog.getByPlaceholder('Folder name...').fill('backup')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toContainText('keeping their names')
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Copied 4 items to /backup.')).toBeVisible()

  // The same place again: refused as a whole, nothing half-copied.
  await fileRow(page, 'c.py').click({ button: 'right' })
  await page.getByRole('button', { name: 'Copy to…' }).click()
  await dialog.getByRole('button', { name: 'backup' }).click()
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('"data", "b.py", "c.py", "d.py" already exist in /backup')
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  // Delete keeps the file open in the editor and says so.
  await fileRow(page, 'c.py').click({ button: 'right' })
  await page.getByRole('button', { name: 'Delete 3 items' }).click()
  await expect(page.getByText(/Delete these 3 items\?/)).toBeVisible()
  await expect(page.getByText(/Kept: b\.py is open in the editor/)).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(fileRow(page, 'c.py')).toBeHidden()
  await expect(fileRow(page, 'd.py')).toBeHidden()
  await expect(fileRow(page, 'data')).toBeHidden()
  await expect(fileRow(page, 'b.py')).toBeVisible()
  await expect(count).toBeHidden()

  // The copies survived, in their folder.
  await fileRow(page, 'backup').click()
  for (const name of ['b.py', 'c.py', 'd.py', 'data']) await expect(fileRow(page, name)).toBeVisible()

  // Ctrl+A in the list selects everything; Escape lets it go.
  await fileRow(page, 'c.py').click({ modifiers: ['ControlOrMeta'] })
  await page.keyboard.press('ControlOrMeta+a')
  await expect(count).toHaveText(/^4 selected/)
  await page.keyboard.press('Escape')
  await expect(count).toBeHidden()
  expect(problems).toEqual([])
})

test('the New file / New folder menu stays inside a narrow sidebar', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await page.getByTitle('Expand sidebar').click()
  const newButton = page.getByTitle('New file or folder')
  await expect(newButton).toBeVisible()

  // Drag the sidebar to its narrowest.
  const handle = page.locator('.resize-handle-col').first()
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x - 400, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()

  const rootCrumb = page.getByRole('button', { name: 'Root', exact: true })
  const panelLeft = (await rootCrumb.boundingBox())!.x
  await newButton.hover()
  const item = page.getByRole('button', { name: 'New file', exact: true })
  await expect(item).toBeVisible()
  expect((await item.boundingBox())!.x).toBeGreaterThanOrEqual(panelLeft - 8)
  expect(problems).toEqual([])
})

test('Share… on a selection shares just those files, from the folder they are in', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await seedFiles(page, {
    '/proj/game.py': 'import helper', '/proj/helper.py': 'X = 1', '/proj/notes.txt': 'not this one',
    '/proj/data/level.txt': '###',
  })
  await page.reload()
  await page.getByTitle('Expand sidebar').click()
  await fileRow(page, 'proj').click()
  await fileRow(page, 'data').click({ modifiers: ['ControlOrMeta'] })
  await fileRow(page, 'game.py').click({ modifiers: ['ControlOrMeta'] })
  await fileRow(page, 'helper.py').click({ modifiers: ['ControlOrMeta'] })
  await fileRow(page, 'helper.py').click({ button: 'right' })
  await page.getByRole('button', { name: 'Share…' }).click()

  const dialog = page.getByRole('dialog', { name: 'Share your code' })
  await expect(dialog).toContainText('Share 3 selected items')
  await dialog.getByRole('button', { name: 'Back' }).click()
  // Re-rooted at /proj: the recipient gets game.py at the top, as a ZIP would hold it.
  await expect(dialog.getByTestId('share-scope-selection')).toContainText('3 files: data/level.txt, game.py, helper.py')
  await dialog.getByTestId('share-scope-selection').click()
  await dialog.getByTestId('share-route-link').click()
  const link = await dialog.locator('input[readonly]').inputValue()
  const encoded = link.slice(link.indexOf('#share=') + '#share='.length)
  const paths = await page.evaluate(`(async () => {
    const share = await import('/src/utils/codeShare.ts')
    const payload = await share.decodeSharePayload(${JSON.stringify(encoded)})
    return payload.files.map(f => f.path).sort()
  })()`)
  expect(paths).toEqual(['/data/level.txt', '/game.py', '/helper.py'])
  expect(problems).toEqual([])
})
