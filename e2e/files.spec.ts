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
