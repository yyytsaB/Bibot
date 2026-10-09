import { useState } from 'react'
import type { Question } from '../../../../shared/src/contracts'
import { Icon } from '../layout/Icon'
import '../../styles/question-design-preview.css'
import '../../styles/followup-design-preview.css'

// Literal reference transcription: gallery illustration only, never practice content.
const referenceText = 'A farmer sees dark clouds and feels a drop of rain. He concludes that it will likely rain soon. What type of reasoning is this?'
const referenceChoices = ['Deductive reasoning', 'Inductive reasoning', 'Abductive reasoning', 'Analogical reasoning'].map((text, index) => ({ id: String(index), text }))

type Props = { onBack: () => void; onCheckPreview: () => void; example?: Question }
export function FollowUpDesignPreview({ onBack, onCheckPreview, example }: Props) {
  const [selected, setSelected] = useState<string | null>(example ? null : '2')
  const choices = example?.choices ?? referenceChoices
  return <section className="followup-design-page">
    <header className="question-design-header"><div className="question-design-top"><button className="icon-button" type="button" onClick={onBack} aria-label="Go back"><Icon name="back" /></button><span className="question-design-menu" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg></span></div><p className="question-design-subject">Critical Thinking</p><p className="question-design-count">Follow-up Question 1 of 1</p><div className="question-design-progress" role="img" aria-label="Sample follow-up progress: 1 of 1"><span /></div></header>
    <h1 className="followup-design-text">{example?.text ?? referenceText}</h1>
    <fieldset className="question-design-choices"><legend className="visually-hidden">Choose an answer in the follow-up preview</legend>{choices.map((choice, index) => <label className={`question-design-choice ${selected === choice.id ? 'selected' : ''}`} key={choice.id}><input type="radio" name="mockup-followup-answer" checked={selected === choice.id} onChange={() => setSelected(choice.id)} /><span className="question-design-radio" aria-hidden="true">{selected === choice.id && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m7 12 4 4 6-8" /></svg>}</span><span>{String.fromCharCode(65 + index)}. {choice.text}</span></label>)}</fieldset>
    <button className="primary-button dark followup-design-check" type="button" disabled={selected === null} onClick={onCheckPreview} title="View sample result screen only — no scoring">Check Answer <Icon name="arrow" /></button>
  </section>
}
