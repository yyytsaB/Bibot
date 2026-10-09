import { useEffect, useState } from 'react'
import { ReadinessStatus } from './ReadinessStatus'
import { parseReadinessResponse } from './readiness-response'
import type { ReadinessDisplay } from './readiness-response'

type Props = { className?: string; fetcher?: typeof fetch }
const unavailable: ReadinessDisplay = { kind: 'unavailable', detail: 'Unable to confirm local AI availability. We’ll check again shortly.' }

/** Standalone consumer of F12. Never calls Ollama or initiates warm-up. */
export function LocalAiReadiness({ className, fetcher = globalThis.fetch }: Props) {
  const [state, setState] = useState<ReadinessDisplay>({ kind: 'checking' })
  useEffect(() => {
    let disposed = false
    let inFlight = false
    let controller: AbortController | undefined
    let requestTimeout: ReturnType<typeof setTimeout> | undefined
    const check = async () => {
      if (disposed || inFlight) return
      inFlight = true
      const requestController = new AbortController()
      controller = requestController
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        requestController.abort()
        if (!disposed) setState(unavailable)
      }, 2000)
      requestTimeout = timer
      try {
        const response = await fetcher('/api/readiness', { method: 'GET', cache: 'no-store', signal: requestController.signal })
        if (!response.ok) throw new Error('Readiness HTTP error')
        const payload: unknown = await response.json()
        const readiness = parseReadinessResponse(payload)
        if (!readiness) throw new Error('Invalid readiness response')
        if (!disposed && !timedOut) setState({ kind: readiness.isReady ? 'ready' : 'unavailable', detail: readiness.detail })
      } catch {
        if (!disposed) setState(unavailable)
      } finally {
        clearTimeout(timer)
        requestTimeout = undefined
        controller = undefined
        inFlight = false
      }
    }
    void check()
    const interval = setInterval(() => { void check() }, 15000)
    return () => {
      disposed = true
      clearInterval(interval)
      if (requestTimeout !== undefined) clearTimeout(requestTimeout)
      controller?.abort()
    }
  }, [fetcher])
  return <ReadinessStatus state={state} className={className} />
}
