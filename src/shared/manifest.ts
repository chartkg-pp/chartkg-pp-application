import { demoAsset } from './assetUrl'

export interface GraphRagManifestEntry {
  id: string
  title: string
  filename: string
  image: string
  kg: string
  qa: string
  width: number
  height: number
  sha256: string
}

export interface PaManifestMode {
  generationId: string
  image: string
  preview?: string
  context: string
  code?: string
  option?: string
  assessment?: string
  report: string
  width: number
  height: number
  sha256: string
  qualityScore?: number
}

export interface PaManifestEntry {
  id: string
  title: string
  shortTitle?: string
  filename: string
  source: string
  modes: { agentic: PaManifestMode; native: PaManifestMode }
}

export interface DemoManifest {
  version: number
  evidenceRegions: string
  graphrag: GraphRagManifestEntry[]
  pa: PaManifestEntry[]
}

let manifestPromise: Promise<DemoManifest> | null = null

/** Read the single manifest that describes every bundled demo asset. */
export async function loadManifest(): Promise<DemoManifest> {
  manifestPromise ??= fetch(demoAsset('manifest.json')).then((response) => {
    if (!response.ok) throw new Error('The demo manifest could not be loaded')
    return response.json() as Promise<DemoManifest>
  })
  return manifestPromise
}
