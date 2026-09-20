import { demoAsset } from './shared/assetUrl'
import { loadManifest } from './shared/manifest'
import type { TestCaseId } from './testData'

export interface GraphRagStaticCase {
  id: TestCaseId
  label: string
  filename: string
  imageUrl: string
  width: number
  height: number
}

export const defaultCaseId: TestCaseId = 'countries-health-wealth'

let casesPromise: Promise<Record<TestCaseId, GraphRagStaticCase>> | null = null

/** The two bundled GraphRAG cases, described by the shared demo manifest. */
export function loadGraphRagCases(): Promise<Record<TestCaseId, GraphRagStaticCase>> {
  casesPromise ??= loadManifest().then((manifest) => {
    const cases = manifest.graphrag.map((entry) => ({
      id: entry.id as TestCaseId,
      label: entry.title,
      filename: entry.filename,
      imageUrl: demoAsset(entry.image),
      width: entry.width,
      height: entry.height,
    }))
    return Object.fromEntries(cases.map((item) => [item.id, item])) as Record<TestCaseId, GraphRagStaticCase>
  })
  return casesPromise
}
