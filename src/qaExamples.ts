import { demoAsset } from './shared/assetUrl'
import { loadManifest } from './shared/manifest'
import type { TestCaseId } from './testData'
import type { QATurn } from './types'

interface StoredExample {
  id: string
  question: string
  origin: string
  /** False for questions the original project also used but that duplicate a shown example. */
  suggested?: boolean
  turn: Omit<QATurn, 'id' | 'question' | 'createdAt'>
}

interface StoredExamplesFile {
  caseId: string
  sourceProject: string
  revisionId: string
  examples: StoredExample[]
}

const cache = new Map<TestCaseId, Promise<StoredExamplesFile>>()

async function loadExamples(id: TestCaseId): Promise<StoredExamplesFile> {
  let pending = cache.get(id)
  if (!pending) {
    pending = loadManifest().then(async (manifest) => {
      const entry = manifest.graphrag.find((item) => item.id === id)
      if (!entry) throw new Error(`Unknown GraphRAG case: ${id}`)
      const response = await fetch(demoAsset(entry.qa))
      if (!response.ok) throw new Error('The bundled GraphRAG examples could not be loaded')
      return response.json() as Promise<StoredExamplesFile>
    })
    cache.set(id, pending)
  }
  return pending
}

/** Questions offered as clickable examples, in the order recorded by the export script. */
export async function storedExampleQuestions(id: TestCaseId): Promise<string[]> {
  return (await loadExamples(id)).examples
    .filter((item) => item.suggested !== false)
    .map((item) => item.question)
}

export async function storedExampleAnswer(id: TestCaseId, question: string): Promise<QATurn | null> {
  const example = (await loadExamples(id)).examples.find((item) => item.question === question)
  if (!example) return null
  return {
    id: `static_${id}_${Date.now()}`,
    question,
    createdAt: Date.now(),
    ...example.turn,
  }
}
