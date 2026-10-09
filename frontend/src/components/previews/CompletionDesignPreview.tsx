import { Icon } from '../layout/Icon'
import duck from '../../assets/bibot/duck-celebrating.png'
import '../../styles/completion-design-preview.css'

type SampleStatistics = { correct: number; incorrect: number; timeLabel: string }
type Props = { sampleStatistics?: SampleStatistics; onBack: () => void; onReview: () => void; onLibrary: () => void }
function StatisticIcon({ kind }: { kind: 'correct' | 'incorrect' | 'time' }) {
  return <svg className={`completion-design-stat-icon ${kind}`} viewBox="0 0 44 44" fill="none" aria-hidden="true"><defs><linearGradient id={`completion-stat-${kind}`} x1="9" y1="4" x2="32" y2="40" gradientUnits="userSpaceOnUse"><stop stopColor={kind === 'correct' ? '#20d99c' : kind === 'incorrect' ? '#ff466d' : '#a788ff'} /><stop offset="1" stopColor={kind === 'correct' ? '#08a879' : kind === 'incorrect' ? '#fa144c' : '#713bff'} /></linearGradient></defs>{kind === 'time' ? <><circle cx="22" cy="22" r="20" fill="#e8ddff" /><circle cx="22" cy="22" r="15" fill="#f7f0ff" stroke="url(#completion-stat-time)" strokeWidth="3.5" /><path d="M22 12v10l7 4" stroke="#7945ff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></> : <><circle cx="22" cy="22" r="19" fill={`url(#completion-stat-${kind})`} /><path d={kind === 'correct' ? 'm13 22 6 6 12-14' : 'm15 15 14 14M29 15 15 29'} stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></>}</svg>
}
export function CompletionDesignPreview({ sampleStatistics, onBack, onReview, onLibrary }: Props) {
  return <section className="completion-design-page">
    <button className="icon-button completion-design-back" type="button" onClick={onBack} aria-label="Go back"><Icon name="back" /></button>
    <svg className="completion-design-duck" viewBox="418 179 1199 1019" role="img" aria-label="Bibot duck celebrating with a purple flag and colorful confetti"><image href={duck} width="2000" height="1500" /></svg>
    <h1>Practice Set Completed!</h1>
    <p className="completion-design-summary">{sampleStatistics ? <>You answered {sampleStatistics.correct + sampleStatistics.incorrect} questions in<br />Critical Thinking: Foundations.</> : <>You finished your practice in<br />Critical Thinking.</>}</p>
    {sampleStatistics && <><p className="completion-design-sample">Sample statistics · illustration only</p><dl className="completion-design-stats">{[{kind: 'correct' as const, value: sampleStatistics.correct, label: 'Correct'}, {kind: 'incorrect' as const, value: sampleStatistics.incorrect, label: 'Incorrect'}, {kind: 'time' as const, value: sampleStatistics.timeLabel, label: 'Time Spent'}].map(stat => <div className={stat.kind} key={stat.kind}><StatisticIcon kind={stat.kind} /><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl></>}
    <button className="primary-button pale completion-design-review" type="button" onClick={onReview} title="Open question gallery preview only">Review Questions</button>
    <button className="primary-button dark completion-design-library" type="button" onClick={onLibrary} title="Open practice-set gallery preview only">Back to Practice Sets</button>
  </section>
}
