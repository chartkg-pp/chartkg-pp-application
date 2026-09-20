import type { LayerId } from './types'

export interface SemanticLayerMeta {
  id: LayerId
  label: string
  color: string
  textColor: string
}

export const semanticLayers: Record<LayerId, SemanticLayerMeta> = {
  S1: { id: 'S1', label: 'Visual Specification', color: '#c98e98', textColor: '#8e4755' },
  S2: { id: 'S2', label: 'Data', color: '#c4a882', textColor: '#806336' },
  S3: { id: 'S3', label: 'Pattern', color: '#7e8db8', textColor: '#4f6195' },
  S4: { id: 'S4', label: 'Insight', color: '#96b898', textColor: '#4e7654' },
}

export const semanticLayerOrder: LayerId[] = ['S1', 'S2', 'S3', 'S4']

