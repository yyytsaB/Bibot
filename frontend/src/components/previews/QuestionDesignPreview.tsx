import { useState } from 'react'
import { Icon } from '../layout/Icon'
import duck from '../../assets/bibot/duck-thinking.png'
import '../../styles/question-design-preview.css'

// Exact mockup transcription for the isolated gallery, never a practice bank.
const referenceChoices = ['Deductive reasoning', 'Inductive reasoning', 'Abductive reasoning', 'Analogical reasoning']

export function QuestionDesignPreview({ onBack, onCheckPreview }: { onBack: () => void; onCheckPreview: () => void }) {
  const [selected, setSelected] = useState(1)
  return <section className="question-design-page">
    <header className="question-design-header"><div className="question-design-top"><button className="icon-button" type="button" onClick={onBack} aria-label="Go back"><Icon name="back" /></button><span className="question-design-menu" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg></span></div><p className="question-design-subject">Critical Thinking</p><p className="question-design-count">Question 3 of 10</p><div className="question-design-progress" role="img" aria-label="Sample question progress: 3 of 10"><span /></div></header>
    <h1 className="question-design-text">A detective finds a wet floor in the kitchen. Which type of reasoning is this an example of?</h1>
    <fieldset className="question-design-choices"><legend className="visually-hidden">Choose an answer in the mockup</legend>{referenceChoices.map((text, index) => <label className={`question-design-choice ${selected === index ? 'selected' : ''}`} key={text}><input type="radio" name="mockup-answer" checked={selected === index} onChange={() => setSelected(index)} /><span className="question-design-radio" aria-hidden="true">{selected === index && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m7 12 4 4 6-8" /></svg>}</span><span>{String.fromCharCode(65 + index)}. {text}</span></label>)}</fieldset>
    <svg className="question-design-duck" viewBox="572 134 872 1253" role="img" aria-label="Bibot duck thinking beside a purple question mark"><image href={duck} width="2000" height="1500" /></svg>
    <button className="primary-button dark question-design-check" type="button" onClick={onCheckPreview} title="View reasoning-screen preview only — no scoring">Check Answer <Icon name="arrow" /></button>
  </section>
}
