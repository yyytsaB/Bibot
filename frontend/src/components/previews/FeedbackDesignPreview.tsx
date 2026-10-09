import type { FeedbackResult } from '../../../../shared/src/contracts'
import { Icon } from '../layout/Icon'
import { FeedbackDesignIcon } from './FeedbackDesignIcon'
import '../../styles/question-design-preview.css'
import '../../styles/feedback-design-preview.css'

// Supplied mockup transcription, confined to the diagnosis gallery illustration.
const referenceDiagnosis = 'You may be treating any observation-based conclusion as inductive reasoning.'
const referenceExplanation = 'Inductive reasoning forms generalizations from multiple observations. Abductive reasoning proposes the most plausible explanation for a specific observation.'

export function FeedbackDesignPreview({ feedback, reasoning, onReasoningChange, onBack, onFollowUp, onClarify }: { feedback: FeedbackResult; reasoning: string; onReasoningChange: (value: string) => void; onBack: () => void; onFollowUp: () => void; onClarify: () => void }) {
  return <section className={`feedback-design-page feedback-design-${feedback.kind}`}>
    <header className="question-design-header"><div className="question-design-top"><button className="icon-button" type="button" onClick={onBack} aria-label="Go back"><Icon name="back" /></button><span className="question-design-menu" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg></span></div><p className="question-design-subject">Critical Thinking</p><p className="question-design-count">Question 3 of 10</p><div className="question-design-progress" role="img" aria-label="Sample question progress: 3 of 10"><span /></div></header>
    <div className="feedback-design-cards">
      {feedback.kind === 'clarification' ? <>
        <section className="feedback-design-card clarify"><span className="feedback-design-question-mark" aria-hidden="true">?</span><div><h1>Tell me a little more</h1><p>{feedback.clarification_prompt}</p></div></section>
        <div className="feedback-design-reasoning"><label htmlFor="gallery-clarification">Add more detail to your explanation.</label><textarea id="gallery-clarification" value={reasoning} onChange={event => onReasoningChange(event.target.value)} maxLength={500} placeholder="Type your explanation here..." /><span aria-hidden="true">{reasoning.length}/500</span></div>
      </> : <>
        {feedback.kind === 'diagnosis' && <section className="feedback-design-card diagnosis"><FeedbackDesignIcon kind="bulb" /><div><h1>Possible Misconception</h1><p>{referenceDiagnosis}</p>{feedback.confidence === 'low' && <p className="feedback-design-uncertainty">This is a possibility based on limited evidence.</p>}</div></section>}
        <section className="feedback-design-card explanation"><FeedbackDesignIcon kind="book" /><div><h2>{feedback.kind === 'fallback' ? 'Verified Explanation' : 'Let’s Clear It Up'}</h2><p>{feedback.kind === 'fallback' ? feedback.verified_explanation : referenceExplanation}</p></div></section>
        <section className="feedback-design-card followup"><span className="feedback-design-target"><FeedbackDesignIcon kind="target" /></span><div><h2>Try a Follow-up Question</h2><p>Answer a new question to check your understanding.</p></div></section>
      </>}
    </div>
    <button className="primary-button dark feedback-design-next" type="button" onClick={feedback.kind === 'clarification' ? onClarify : onFollowUp} disabled={feedback.kind === 'clarification' && !reasoning.trim()} title="Navigate the gallery only — no AI or learning-state update">{feedback.kind === 'clarification' ? 'Submit Explanation' : 'Next Question'} <Icon name="arrow" /></button>
  </section>
}
