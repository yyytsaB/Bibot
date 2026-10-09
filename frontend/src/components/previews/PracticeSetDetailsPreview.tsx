import { useState } from 'react'
import { Icon } from '../layout/Icon'
import { PracticeTypeIcon } from './PracticeTypeIcon'
import type { PracticeTypeIconKind } from './PracticeTypeIcon'
import '../../styles/practice-set-details.css'

const questionTypes: { name: string; description: string; icon: PracticeTypeIconKind }[] = [
  { name: 'Definition-based', description: 'Focuses on key terms and meanings', icon: 'definition' },
  { name: 'Scenario-based', description: 'Real-life situations and applications', icon: 'scenario' },
  { name: 'Mixed', description: 'Combination of both', icon: 'mixed' },
]

export function PracticeSetDetailsPreview({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const [name, setName] = useState('')
  const [count, setCount] = useState(10)
  const [questionType, setQuestionType] = useState('Mixed')
  const [difficulty, setDifficulty] = useState('Moderate')
  return <section className="set-details-page">
    <button className="icon-button set-details-back" type="button" onClick={onBack} aria-label="Go back"><Icon name="back" /></button>
    <h1>Practice Set Details</h1>
    <p className="set-details-subtitle">Customize your practice set.</p>
    <div className="set-name-field">
      <label htmlFor="preview-set-name">Set Name</label>
      <input id="preview-set-name" placeholder="e.g. Chapter 1 Review" maxLength={50} value={name} onChange={event => setName(event.target.value)} />
      <span className="set-name-counter" aria-hidden="true">{name.length}/50</span>
    </div>
    <div className="set-subject-field">
      <label htmlFor="preview-set-subject">Subject</label>
      <div className="set-subject-select"><span className="set-subject-icon"><Icon name="book" /></span><select id="preview-set-subject" defaultValue=""><option value="" disabled>Select a subject</option><option value="critical-thinking">Critical Thinking</option></select><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></div>
    </div>
    <fieldset className="set-count-field"><legend>Number of Questions</legend><div className="set-pills">{[5, 10, 15, 20].map(value => <button key={value} type="button" aria-pressed={count === value} onClick={() => setCount(value)}>{value}</button>)}</div></fieldset>
    <fieldset className="set-type-field"><legend>Question Type</legend><div className="set-type-list">{questionTypes.map(type => <button key={type.name} className={`set-type-card ${type.icon}`} type="button" aria-pressed={questionType === type.name} onClick={() => setQuestionType(type.name)}><span className="set-type-icon"><PracticeTypeIcon kind={type.icon} /></span><span><strong>{type.name}</strong><small>{type.description}</small></span></button>)}</div></fieldset>
    <fieldset className="set-difficulty-field"><legend>Difficulty Level</legend><div className="set-pills set-difficulty-pills">{['Easy', 'Moderate', 'Hard', 'Mixed'].map(value => <button key={value} type="button" aria-pressed={difficulty === value} onClick={() => setDifficulty(value)}>{value}</button>)}</div></fieldset>
    <button className="primary-button set-generate-preview" type="button" onClick={onContinue} title="View the generation illustration only">Generate Practice Set <Icon name="arrow" /></button>
  </section>
}
