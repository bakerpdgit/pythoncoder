import type { WorkerRunMode } from './urlRunMode'

// The published list of learning books (tutorials and Fun Challenges), served
// from `public/learning-tutorials.json`. Shared by the Learning menu, which
// opens them, and the student-link dialog, which links to them without opening.

export interface LearningTutorial {
  name: string
  github: string
  book?: string
  mode?: WorkerRunMode
}

export function isTutorialCatalog(value: unknown): value is LearningTutorial[] {
  return Array.isArray(value) && value.every(item =>
    typeof item === 'object' && item !== null
    && typeof (item as LearningTutorial).name === 'string'
    && typeof (item as LearningTutorial).github === 'string'
    && ((item as LearningTutorial).book === undefined || typeof (item as LearningTutorial).book === 'string')
    && ((item as LearningTutorial).mode === undefined
      || ['trace', 'run', 'debug'].includes((item as LearningTutorial).mode as string)))
}

export async function fetchTutorialCatalog(signal?: AbortSignal): Promise<LearningTutorial[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}learning-tutorials.json`, {
    cache: 'no-cache',
    signal,
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const catalog: unknown = await response.json()
  if (!isTutorialCatalog(catalog)) throw new Error('Invalid tutorial catalog')
  return catalog
}
