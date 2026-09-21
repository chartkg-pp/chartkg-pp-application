export type JobStatus =
  | 'idle'
  | 'queued'
  | 'ingesting'
  | 'context_built'
  | 'understanding'
  | 'planning'
  | 'generation'
  | 'visual_evaluating'
  | 'debugging'
  | 'requirement_analyzing'
  | 'mapping'
  | 'designing'
  | 'option_generating'
  | 'validating'
  | 'model_generating'
  | 'option_generated'
  | 'rendering'
  | 'refining'
  | 'completed'
  | 'failed'

export interface EntitySummary {
  id: string
  type: string
  properties: Record<string, unknown>
}

export interface MarkGroupContext {
  id: string
  properties: Record<string, unknown>
  visual_attributes: Array<Record<string, unknown>>
  records: Array<{ mark_id: string; values: Record<string, unknown>; derived?: Record<string, unknown> }>
}

export interface ViewContext {
  id: string
  properties: Record<string, unknown>
  mark_groups: MarkGroupContext[]
}

export interface ChartContext {
  schema: string
  chart: EntitySummary
  variables: EntitySummary[]
  views: ViewContext[]
  composition: Array<Record<string, unknown>>
}

export interface GroupCoverage {
  mark_count: number
  expected_encoded_variables: string[]
  observed_value_counts: Record<string, number>
  missing_value_counts: Record<string, number>
}

export interface ExtractionReport {
  contract_ref: string
  source_run_id?: string
  entity_count: number
  relation_count: number
  mark_count: number
  assigned_mark_count: number
  unassigned_marks: string[]
  unresolved_variable_value_refs: string[]
  group_coverage: Record<string, GroupCoverage>
  derived_ternary_record_count: number
}

export interface InspectResponse {
  datasetId: string
  filename: string
  valid: boolean
  context: ChartContext
  extraction: ExtractionReport
  warnings?: string[]
}

export interface SampleInfo {
  id: string
  name: string
  filename: string
  available: boolean
}

export interface GenerationListItem {
  id: string
  datasetId: string
  filename: string
  status: JobStatus
  progress: number
  message: string
  createdAt: string
  updatedAt: string
  pipeline?: 'agentic' | 'native'
  qualityScore?: number | null
}

export interface GenerationRequest {
  datasetId?: string
  file?: File
  pipeline?: 'agentic' | 'native'
  instruction?: string
  width: number
  height: number
  renderPng: boolean
  maxIterations?: number
  qualityThreshold?: number
}

export interface JobSnapshot {
  id: string
  status: JobStatus
  progress: number
  message: string
  error?: string | null
  createdAt: string
  updatedAt: string
  currentIteration?: number
  qualityScore?: number | null
  /** Dataset this snapshot belongs to, so History can restore the matching source panel. */
  datasetId?: string
  pipeline?: 'agentic' | 'native'
}

/** Artifacts published with this static demo. Iteration and raw model-response files are not migrated. */
export interface ArtifactMap {
  context?: string
  option?: string
  png?: string
  code?: string
  visual_assessment?: string
  report?: string
}

export interface GenerationResponse {
  id: string
  datasetId: string
  status: JobStatus
  outputDir?: string
  outputRelativeDir?: string
  option?: Record<string, unknown> | null
  code?: string
  artifacts: ArtifactMap
  report: Record<string, unknown>
  evaluation?: GenerationEvaluation
  pipeline?: string
  /** Pixel size of the stored result image, used to lay out very tall Agentic results. */
  width?: number
  height?: number
  qualityScore?: number | null
}

export interface GenerationEvaluation {
  entityCount: number
  relationCount: number
  tripleCount: number
  relationTypes: number
  sources: {
    kg: string
    nodes: string
    relations: string
  }
}
