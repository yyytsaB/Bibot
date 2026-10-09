import type { ReadinessDisplay } from './readiness-response'
import './readiness.css'

type Props = { state: ReadinessDisplay; className?: string }
export function ReadinessStatus({ state, className }: Props) {
  const label = state.kind === 'checking' ? 'Checking local AI…' : state.kind === 'ready' ? 'Local AI Ready' : 'Local AI unavailable'
  return <div className={`bibot-readiness bibot-readiness--${state.kind}${className ? ` ${className}` : ''}`} role="status" aria-live="polite" aria-atomic="true">
    <span className="bibot-readiness__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{state.kind === 'checking' ? <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></> : state.kind === 'ready' ? <><circle cx="12" cy="12" r="8" /><path d="m8 12 3 3 5-6" /></> : <><circle cx="12" cy="12" r="8" /><path d="M12 7v6M12 16h0" /></>}</svg></span>
    <span className="bibot-readiness__text"><strong>{label}</strong>{state.kind !== 'checking' && state.detail && <span className="bibot-readiness__detail">{state.detail}</span>}</span>
  </div>
}
