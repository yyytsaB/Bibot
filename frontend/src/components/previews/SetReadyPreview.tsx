import { Icon } from '../layout/Icon'
import { SetSummaryIcon } from './SetSummaryIcon'
import type { SetSummaryIconKind } from './SetSummaryIcon'
import duck from '../../assets/bibot/duck-ready.png'
import '../../styles/set-ready.css'

const summary: { label: string; value: string; icon: SetSummaryIconKind }[] = [
  { label: 'Set Name', value: 'Chapter 1 Review', icon: 'name' },
  { label: 'Subject', value: 'Critical Thinking', icon: 'subject' },
  { label: 'Questions', value: '10 questions', icon: 'questions' },
  { label: 'Type', value: 'Mixed', icon: 'type' },
  { label: 'Difficulty', value: 'Moderate', icon: 'difficulty' },
]

export function SetReadyPreview({ onBack, onClose, onEdit, onStart }: { onBack: () => void; onClose: () => void; onEdit: () => void; onStart?: () => void }) {
  return <section className="ready-set-page">
    <header className="ready-set-header"><button className="icon-button" type="button" onClick={onBack} aria-label="Go back"><Icon name="back" /></button><button className="icon-button" type="button" onClick={onClose} aria-label="Close ready-screen preview"><svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header>
    <svg className="ready-set-duck" viewBox="617 310 798 938" role="img" aria-label="Bibot duck smiling with purple glasses"><image href={duck} width="2000" height="1500" /></svg>
    <h1>Practice Set Ready!</h1>
    <p className="ready-set-description">Your practice set is ready.<br />Let’s start learning!</p>
    <dl className="ready-set-summary" aria-label="Sample practice set details">{summary.map(row => <div key={row.icon}><SetSummaryIcon kind={row.icon} /><div><dt>{row.label}</dt><dd>{row.value}</dd></div></div>)}</dl>
    <div className="ready-set-actions"><button className="primary-button dark ready-set-start" type="button" onClick={onStart} disabled={!onStart} title={onStart ? 'View the practice presentation only' : 'Practice presentation arrives in F9'}>Start Practice <Icon name="arrow" /></button><button className="ready-set-edit" type="button" onClick={onEdit}>Edit Set Details</button></div>
  </section>
}
