import { test, expect, type Page } from '@playwright/test'
import { watchForErrors } from './helpers'

/**
 * A learning book built in the browser is kept: closing it (or reloading)
 * leaves it listed in the File System panel, from where it reopens to edit or
 * to try as a student, and a second book can never take its name.
 */

async function showTeacherTools(page: Page) {
  await page.getByRole('button', { name: 'Panels' }).click()
  await page.getByLabel('Teacher Tools').check()
  await page.keyboard.press('Escape')
}

async function startNewBook(page: Page, name: string) {
  await page.getByRole('button', { name: /New learning book/ }).click()
  const prompt = page.getByRole('dialog', { name: 'New learning book' })
  await prompt.getByRole('textbox').fill(name)
  return prompt
}

/** The File System panel's filesystem list (the sidebar starts folded). */
async function openFsMenu(page: Page) {
  const expand = page.getByTitle('Expand sidebar')
  if (await expand.isVisible()) await expand.click()
  await page.getByRole('button', { name: 'Default', exact: true }).click()
}

test('a book built in this browser survives closing and reopens to edit or as a student', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await showTeacherTools(page)

  const prompt = await startNewBook(page, 'Kept Book')
  await prompt.getByRole('button', { name: 'Next' }).click()
  const where = page.getByRole('dialog', { name: 'Where should "Kept Book" be built?' })
  await expect(where.getByRole('button', { name: 'Build in this browser' })).toBeVisible()
  await where.getByRole('button', { name: 'Build in this browser' }).click()
  await expect(page.getByText('Editing: Kept Book')).toBeVisible()

  await page.getByRole('button', { name: 'Close book' }).last().click()
  await expect(page.getByText('Editing: Kept Book')).toHaveCount(0)
  // Teacher Tools offers to carry on with it.
  await expect(page.getByRole('button', { name: /Continue a book in this browser/ })).toBeVisible()

  // The File System list has it, and asks what to do with it.
  await openFsMenu(page)
  const books = page.getByRole('group', { name: 'Learning books you are writing' })
  await books.getByRole('button', { name: 'Kept Book' }).click()
  const open = page.getByRole('dialog', { name: 'Open "Kept Book"' })
  await open.getByRole('button', { name: 'Edit the book' }).click()
  await expect(page.getByText('Editing: Kept Book')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Example/ }).first()).toBeVisible()

  // A reload ends the edit session, and the book is still listed.
  await page.reload()
  await openFsMenu(page)
  await page.getByRole('group', { name: 'Learning books you are writing' }).getByRole('button', { name: 'Kept Book' }).click()
  await page.getByRole('dialog', { name: 'Open "Kept Book"' }).getByRole('button', { name: 'Open as a student' }).click()
  await expect(page.getByRole('button', { name: 'Close book' }).first()).toBeVisible()
  await expect(page.getByText('Editing: Kept Book')).toHaveCount(0)
  expect(problems).toEqual([])
})

test('a new book cannot take the name of one already in this browser', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await showTeacherTools(page)

  const first = await startNewBook(page, 'Same Name')
  await first.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('dialog', { name: 'Where should "Same Name" be built?' })
    .getByRole('button', { name: 'Build in this browser' }).click()
  await expect(page.getByText('Editing: Same Name')).toBeVisible()
  await page.getByRole('button', { name: 'Close book' }).last().click()

  const second = await startNewBook(page, 'same name')
  await expect(second.getByText(/already have a book with this name/)).toBeVisible()
  await expect(second.getByRole('button', { name: 'Next' })).toBeDisabled()
  expect(problems).toEqual([])
})
