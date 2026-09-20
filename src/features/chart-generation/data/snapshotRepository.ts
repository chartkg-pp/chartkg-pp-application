import {
  mockCreateGeneration,
  mockGetGeneration,
  mockGetJob,
  mockGetSample,
  mockInspect,
  mockListGenerations,
  mockListSamples,
} from './staticSnapshots'
import type {
  GenerationListItem,
  GenerationRequest,
  GenerationResponse,
  InspectResponse,
  JobSnapshot,
  SampleInfo,
} from '../types/chartkg'

/**
 * Static snapshot reader. Every call resolves against the bundled demo data; this site has no
 * server, so no endpoint, socket, or event stream exists here.
 */
export const chartApi = {
  artifactUrl(path: string) {
    return path
  },

  async listSamples(): Promise<SampleInfo[]> {
    return mockListSamples()
  },

  async getSample(sampleId: string): Promise<File> {
    return mockGetSample(sampleId)
  },

  async inspect(file: File): Promise<InspectResponse> {
    return mockInspect(file.name)
  },

  async createGeneration(request: GenerationRequest): Promise<{ jobId: string }> {
    return mockCreateGeneration(request)
  },

  async getJob(jobId: string): Promise<JobSnapshot> {
    return mockGetJob(jobId)
  },

  async getGeneration(jobId: string): Promise<GenerationResponse> {
    return mockGetGeneration(jobId)
  },

  async listGenerations(): Promise<GenerationListItem[]> {
    return mockListGenerations()
  },

  async createRevision(_generationId: string, _option: Record<string, unknown>, _settings: { width: number; height: number; renderPng: boolean }) {
    throw new Error('Revisions are unavailable in the static demo')
  },
}
