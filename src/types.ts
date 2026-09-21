export type LayerId = 'S1' | 'S2' | 'S3' | 'S4'

export interface Evidence {
  id: string
  label: string
  kind: 'image-region' | 'ocr' | 'calculation' | 'agent'
  region?: { x: number; y: number; width: number; height: number }
  confidence: number
  detail: string
}

export interface KGNode {
  id: string
  label: string
  type: string
  layer: LayerId
  details: Record<string, string>
  claimIds: string[]
}

export interface KGEdge {
  id: string
  source: string
  target: string
  relation: string
  claimIds: string[]
}

export interface GraphData {
  revisionId: string
  ontologyRef: string
  nodes: KGNode[]
  edges: KGEdge[]
  stats?: {
    sourceNodeCount: number
    sourceEdgeCount: number
    visibleNodeCount: number
    visibleEdgeCount: number
    verificationStatus: string
    runStatus: string
    communityCount?: number
    retrievalEngine?: string
  }
}

export interface Citation {
  id: string
  claimIds: string[]
  entityIds: string[]
  evidenceIds: string[]
  graphPath: string[]
}

export interface SummarySentence {
  id: string
  layer: LayerId
  text: string
  citations: string[]
  status?: 'grounded' | 'unavailable'
}

export interface SummaryData {
  id: string
  revisionId: string
  sentences: SummarySentence[]
  citations: Record<string, Citation>
  coverage: number
}

export type QAMode = 'graphrag' | 'vision'

export interface QAProcessStep {
  id: string
  label: string
  status: 'active' | 'done' | 'error'
}

export interface QATurn {
  id: string
  question: string
  answer: string
  citationIds: string[]
  createdAt: number
  status: 'streaming' | 'verified' | 'answered' | 'abstained'
  generationMode?: 'deepseek' | 'extractive' | 'vision' | 'abstained'
  qaMode?: QAMode
  model?: string
  process?: QAProcessStep[]
  retrieval?: {
    strategy: 'graph-local' | 'graph-global'
    planner: 'deepseek' | 'deterministic' | 'system'
    maxHops: number
    seedEntityIds: string[]
    communityIds: string[]
    expandedEntityIds: string[]
    relationIds: string[]
    paths: Array<{
      source: string
      target: string
      nodeIds: string[]
      relationIds: string[]
      hops: Array<{ from: string; relation: string; to: string; direction: 'forward' | 'reverse' }>
    }>
    rankedEvidence: Array<{
      entityId: string
      type: string
      score: number
      lexicalScore: number
      distance: number | null
      hops: number | null
    }>
  }
}

export interface QAAnswer {
  answer: string
  citationIds: string[]
  status: QATurn['status'] | 'failed'
  generationMode?: QATurn['generationMode']
  model?: string
  process?: QAProcessStep[]
  retrieval?: QATurn['retrieval']
  error?: string
}

export interface ConversationTurn {
  id: string
  question: string
  createdAt: number
  status: 'streaming' | 'complete' | 'partial' | 'failed'
  answers: Record<QAMode, QAAnswer>
  availableModes?: QAMode[]
}

export interface RunState {
  status: 'idle' | 'uploading' | 'queued' | 'extracting' | 'validating' | 'ready' | 'failed'
  progress: number
  message: string
}
