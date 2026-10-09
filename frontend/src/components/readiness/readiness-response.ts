/** F12 wire boundary only; readiness policy stays in the backend. */
export type ReadinessResponse = {
  isReady: boolean
  statusLabel: 'Local AI Ready' | 'Local AI Unavailable'
  detail: string
  model: string
  consecutiveFailures: number
}
export type ReadinessDisplay =
  | { kind: 'checking' }
  | { kind: 'ready' | 'unavailable'; detail: string }

export function parseReadinessResponse(value: unknown): ReadinessResponse | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  if (!('isReady' in value) || typeof value.isReady !== 'boolean') return null
  if (!('statusLabel' in value) || value.statusLabel !== (value.isReady ? 'Local AI Ready' : 'Local AI Unavailable')) return null
  if (!('detail' in value) || typeof value.detail !== 'string') return null
  if (!('model' in value) || typeof value.model !== 'string') return null
  if (!('consecutiveFailures' in value) || typeof value.consecutiveFailures !== 'number' || !Number.isInteger(value.consecutiveFailures) || value.consecutiveFailures < 0) return null
  return { isReady: value.isReady, statusLabel: value.isReady ? 'Local AI Ready' : 'Local AI Unavailable', detail: value.detail, model: value.model, consecutiveFailures: value.consecutiveFailures }
}
