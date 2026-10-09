import { Icon } from '../layout/Icon'
import '../../styles/question-design-preview.css'
import '../../styles/reasoning-design-preview.css'

export function ReasoningDesignPreview({ reasoning, onReasoningChange, onBack, onAnalyzePreview, waiting }: { reasoning: string; onReasoningChange: (value: string) => void; onBack: () => void; onAnalyzePreview: () => void; waiting: boolean }) {
  return <section className="reasoning-design-page">
    <header className="question-design-header"><div className="question-design-top"><button className="icon-button" type="button" onClick={onBack} aria-label="Go back"><Icon name="back" /></button><span className="question-design-menu" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg></span></div><p className="question-design-subject">Critical Thinking</p><p className="question-design-count">Question 3 of 10</p><div className="question-design-progress" role="img" aria-label="Sample question progress: 3 of 10"><span /></div></header>
    <div className="reasoning-design-banner"><span className="reasoning-design-error" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg></span><div><strong>Not quite!</strong><p>Let’s understand your thinking.</p></div></div>
    <h1 className="reasoning-design-question">A detective finds a wet floor in the kitchen. Which type of reasoning is this an example of?</h1>
    <p className="reasoning-design-answer"><strong>Your answer:</strong> B. Inductive reasoning</p>
    <div className="reasoning-design-field"><label htmlFor="mockup-reasoning">Why did you choose this answer?<br />Explain your understanding in your own words.</label><div className="reasoning-design-input"><textarea id="mockup-reasoning" placeholder="Type your explanation here..." maxLength={500} value={reasoning} onChange={event => onReasoningChange(event.target.value)} disabled={waiting} /><span aria-hidden="true">{reasoning.length}/500</span></div></div>
    <button className="primary-button dark reasoning-design-analyze" type="button" disabled={!reasoning.trim() || waiting} onClick={onAnalyzePreview} title={waiting ? 'Waiting-state illustration only' : reasoning.trim() ? 'View feedback preview only — no AI analysis' : 'Enter an explanation to view the feedback preview'}>{waiting ? 'Analyzing your answer…' : 'Analyze My Answer'} <Icon name="arrow" /></button>
    {waiting && <p className="reasoning-design-waiting" role="status">Waiting for feedback… (preview only)</p>}
  </section>
}

