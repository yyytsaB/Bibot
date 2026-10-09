import type { ReactNode } from 'react'
import type { FeedbackResult, Question } from '../../../../shared/src/contracts'
import { Icon } from '../layout/Icon'
import thinkingDuck from '../../assets/bibot/duck-thinking.png'
import correctDuck from '../../assets/bibot/duck-correct.png'
import celebratingDuck from '../../assets/bibot/duck-celebrating.png'

export type PracticeView = 'question' | 'reasoning' | 'analysis' | 'feedback' | 'follow-up' | 'correct' | 'incorrect' | 'completed'
export type PracticePresentationProps = {
  view: PracticeView
  question: Question
  selectedChoiceId: string | null
  reasoning: string
  feedback?: FeedbackResult
  progress: { current: number; total: number }
  onSelectChoice: (id: string) => void
  onReasoningChange: (value: string) => void
  onCheckAnswer: () => void
  onAnalyze: () => void
  onFollowUp: () => void
  onContinue: () => void
  onExtraExample: () => void
  onBack: () => void
  onReview: () => void
  onLibrary: () => void
  busy?: boolean
  correctInitial?: boolean
  sampleStatistics?: { correct: number; incorrect: number; timeLabel: string }
}

function PracticeHeader({ onBack, current, total, followUp, hideProgress }: { onBack: () => void; current: number; total: number; followUp?: boolean; hideProgress?: boolean }) {
  return <header className="practice-header"><div className="practice-top"><button className="icon-button" aria-label="Go back" onClick={onBack}><Icon name="back" /></button><span aria-hidden="true" className="practice-menu">⋮</span></div><p className="practice-subject">Critical Thinking</p>{!hideProgress && <><p className="practice-count">{followUp ? 'Follow-up Question' : 'Question'} {current} of {total}</p><progress className="practice-progress" max={Math.max(total, 1)} value={current} aria-label={followUp ? 'Follow-up progress' : 'Question progress'} /></>}</header>
}

function FeedbackCard({ title, symbol, tone, children }: { title: string; symbol: ReactNode; tone: string; children: ReactNode }) {
  return <section className={`feedback-card ${tone}`}><span className="feedback-symbol" aria-hidden="true">{symbol}</span><div><h2>{title}</h2>{children}</div></section>
}

function ResultBanner({ correct }: { correct: boolean }) {
  return <div className={`answer-banner ${correct ? 'answer-correct' : 'answer-wrong'}`} role="status"><span aria-hidden="true">{correct ? '✓' : '×'}</span><div><strong>{correct ? 'Correct!' : 'Not quite!'}</strong><p>{correct ? 'Great job! Keep building your understanding.' : "Let’s understand your thinking."}</p></div></div>
}

function ReasoningField({ value, onChange, prompt, disabled }: { value: string; onChange: (value: string) => void; prompt: string; disabled?: boolean }) {
  return <div className="reasoning-field"><label htmlFor="student-reasoning">{prompt}</label><div className="reasoning-input"><textarea id="student-reasoning" value={value} onChange={e => onChange(e.target.value)} maxLength={500} placeholder="Type your explanation here..." disabled={disabled} /><span aria-hidden="true">{value.length}/500</span></div></div>
}

export function PracticeScreens(props: PracticePresentationProps) {
  const { view, question, selectedChoiceId, reasoning, feedback, progress, busy } = props
  const selected = question.choices.find(choice => choice.id === selectedChoiceId)
  if (view === 'completed') return <section className="completion-page"><button className="icon-button" onClick={props.onBack} aria-label="Go back"><Icon name="back" /></button><div className="completion-art"><img src={celebratingDuck} alt="Bibot duck celebrating with a purple flag" /></div><h1>Practice Set Completed!</h1><p>You finished your practice in<br />Critical Thinking.</p>{props.sampleStatistics && <><p className="sample-statistics-label">Sample statistics · illustration only</p><div className="completion-statistics">{[{ value: props.sampleStatistics.correct, label: 'Correct', symbol: '✓', tone: 'mint' }, { value: props.sampleStatistics.incorrect, label: 'Incorrect', symbol: '×', tone: 'pink' }, { value: props.sampleStatistics.timeLabel, label: 'Time Spent', symbol: '◷', tone: 'purple' }].map(stat => <div className={stat.tone} key={stat.label}><span aria-hidden="true">{stat.symbol}</span><strong>{stat.value}</strong><small>{stat.label}</small></div>)}</div></>}<button className="primary-button pale" onClick={props.onReview}>Review Questions</button><button className="primary-button dark" onClick={props.onLibrary}>Back to Practice Sets</button></section>

  return <section className={`practice-page practice-${view}`}><PracticeHeader onBack={props.onBack} current={progress.current} total={progress.total} followUp={view === 'follow-up'} hideProgress={view === 'correct' || view === 'incorrect'} />
    {(view === 'question' || view === 'follow-up') && <><h1 className="question-text">{question.text}</h1><fieldset className="answer-choices"><legend className="visually-hidden">Choose your answer</legend>{question.choices.map((choice, index) => <label key={choice.id} className={`answer-choice ${selectedChoiceId === choice.id ? 'selected' : ''}`}><input type="radio" name="answer" value={choice.id} checked={selectedChoiceId === choice.id} onChange={() => props.onSelectChoice(choice.id)} /><span className="answer-radio" aria-hidden="true">{selectedChoiceId === choice.id ? '✓' : ''}</span><span>{String.fromCharCode(65 + index)}. {choice.text}</span></label>)}</fieldset>{view === 'question' && <div className="question-art"><img src={thinkingDuck} alt="Bibot duck thinking beside a question mark" /></div>}<button className="primary-button dark practice-action" disabled={!selected || busy} onClick={props.onCheckAnswer}>Check Answer <Icon name="arrow" /></button></>}

    {(view === 'reasoning' || view === 'analysis') && <><ResultBanner correct={false} /><h1 className="question-text">{question.text}</h1>{selected && <p className="preserved-answer"><strong>Your answer:</strong> {selected.text}</p>}<ReasoningField value={reasoning} onChange={props.onReasoningChange} prompt="Why did you choose this answer? Explain your understanding in your own words." disabled={busy || view === 'analysis'} /><button className="primary-button dark practice-action" disabled={!reasoning.trim() || busy || view === 'analysis'} onClick={props.onAnalyze}>{view === 'analysis' || busy ? 'Analyzing your answer…' : 'Analyze My Answer'} <Icon name="arrow" /></button>{view === 'analysis' && <p className="analysis-status" role="status">Waiting for feedback…</p>}</>}

    {view === 'feedback' && (!feedback ? <p role="status">Feedback is not available yet.</p> : feedback.kind === 'clarification' ? <><FeedbackCard title="Tell me a little more" symbol="?" tone="clarification-card"><p>{feedback.clarification_prompt}</p></FeedbackCard><ReasoningField value={reasoning} onChange={props.onReasoningChange} prompt="Add more detail to your explanation." disabled={busy} /><button className="primary-button dark practice-action" disabled={!reasoning.trim() || busy} onClick={props.onAnalyze}>Submit Explanation <Icon name="arrow" /></button></> : <>{feedback.kind === 'diagnosis' && <FeedbackCard title="Possible Misconception" symbol="☀" tone="diagnosis-card"><p>{feedback.possible_misconception}</p>{feedback.confidence === 'low' && <p className="uncertainty-note">This is a possibility based on limited evidence.</p>}</FeedbackCard>}<FeedbackCard title={feedback.kind === 'fallback' ? 'Verified Explanation' : "Let’s Clear It Up"} symbol={<Icon name="book" />} tone="explanation-card"><p>{feedback.kind === 'fallback' ? feedback.verified_explanation : feedback.explanation}</p></FeedbackCard><FeedbackCard title="Try a Follow-up Question" symbol="◎" tone="followup-card"><p>Answer a reviewed question to check your understanding.</p></FeedbackCard><button className="primary-button dark practice-action" onClick={props.onFollowUp}>Try Again <Icon name="arrow" /></button></>)}

    {(view === 'correct' || view === 'incorrect') && <><ResultBanner correct={view === 'correct'} /><FeedbackCard title="Explanation" symbol={<Icon name="book" />} tone="explanation-card"><p>{question.verified_explanation}</p></FeedbackCard>{view === 'correct' && <div className="correct-art"><img src={correctDuck} alt="Bibot duck cheering" /></div>}<button className="primary-button dark practice-action" onClick={view === 'incorrect' ? props.onExtraExample : props.onContinue}>{view === 'incorrect' ? 'Try Another Example' : props.correctInitial ? 'Next Question' : 'Continue Practice'} <Icon name="arrow" /></button></>}
  </section>
}
