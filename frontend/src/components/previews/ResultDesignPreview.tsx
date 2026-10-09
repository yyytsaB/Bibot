import type { Question } from '../../../../shared/src/contracts'
import { Icon } from '../layout/Icon'
import { FeedbackDesignIcon } from './FeedbackDesignIcon'
import duck from '../../assets/bibot/duck-correct.png'
import '../../styles/question-design-preview.css'
import '../../styles/feedback-design-preview.css'
import '../../styles/result-design-preview.css'

// Literal gallery-only mockup transcription; never inserted into the practice bank.
const referenceExplanation = 'The farmer is proposing the most plausible explanation for an observation (dark clouds and a drop of rain).'
export type ResultDesignVariant = 'correct-follow-up' | 'correct-initial' | 'wrong-follow-up'
type Props = { variant: ResultDesignVariant; question: Question; onBack: () => void; onContinue: () => void; onExtraExample: () => void }
export function ResultDesignPreview({ variant, question, onBack, onContinue, onExtraExample }: Props) {
  const correct = variant !== 'wrong-follow-up'
  const mockup = variant === 'correct-follow-up'
  return <section className={`result-design-page ${correct ? 'correct' : 'incorrect'}`}>
    <header className="question-design-header"><div className="question-design-top"><button className="icon-button" type="button" onClick={onBack} aria-label="Go back"><Icon name="back" /></button></div><p className="question-design-subject">Critical Thinking</p></header>
    <section className="result-design-banner" role="status"><span className="result-design-symbol" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">{correct ? <path d="m7 16 6 6 12-14" /> : <path d="m9 9 14 14M23 9 9 23" />}</svg></span><div><h1>{correct ? 'Correct!' : 'Not quite!'}</h1><p>{mockup ? 'Great job! This is an example of abductive reasoning.' : correct ? 'Great job! Keep building your understanding.' : 'Review the explanation, then try another prepared example.'}</p></div></section>
    <section className="result-design-explanation"><FeedbackDesignIcon kind="book" /><div><h2>Explanation</h2><p>{mockup ? referenceExplanation : question.verified_explanation}</p></div></section>
    {correct && <div className="result-design-art"><svg viewBox="520 270 1062 978" role="img" aria-label="Bibot duck cheering with purple glasses and a yellow star"><image href={duck} width="2000" height="1500" /></svg></div>}
    <button className="primary-button dark result-design-continue" type="button" onClick={correct ? onContinue : onExtraExample} title="Navigate between gallery illustrations only — no scoring">{correct ? variant === 'correct-initial' ? 'Next Question' : 'Continue Practice' : 'Try Another Example'} <Icon name="arrow" /></button>
  </section>
}
