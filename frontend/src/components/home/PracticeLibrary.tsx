import { useState } from 'react'
import type { FixtureHomeData } from '../../../../shared/src/fixtures'
import { Icon } from '../layout/Icon'
import { LibrarySetIcon } from './LibrarySetIcon'
import type { LibrarySetIconKind } from './LibrarySetIcon'
import portrait from '../../assets/bibot/duck-portrait.png'
import '../../styles/practice-library.css'

const sampleSets: { name: string; questions: number; kind: LibrarySetIconKind }[] = [
  { name: 'Foundations', questions: 10, kind: 'foundations' },
  { name: 'Logical Reasoning', questions: 15, kind: 'reasoning' },
  { name: 'Fallacies', questions: 10, kind: 'fallacies' },
  { name: 'Real-World Scenarios', questions: 10, kind: 'scenarios' },
  { name: 'My Notes - Chapter 1', questions: 12, kind: 'notes' },
  { name: 'Article Summary', questions: 8, kind: 'article' },
]

export function PracticeLibrary({ data, onBack, onStartPractice, preview }: { data: FixtureHomeData; onBack: () => void; onStartPractice: () => void; preview?: boolean }) {
  const [tab, setTab] = useState('Practice Sets')
  const [filter, setFilter] = useState('All')
  const sets = preview ? sampleSets : [{ name: 'Critical Thinking Practice', questions: 0, kind: 'foundations' as const }]
  return <section className="practice-library-page">
    <header className="practice-library-header"><button className="icon-button" type="button" onClick={onBack} aria-label="Go back"><Icon name="back" /></button><span className="library-menu-decoration" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg></span></header>
    <div className="practice-library-heading"><h1>{data.preparedSubject.title}</h1><svg className="library-portrait" viewBox="65 197 1052 855" aria-hidden="true"><image href={portrait} width="1254" height="1254" /></svg></div>
    <div className="library-tabs" aria-label="Library sections">{['Practice Sets', 'About'].map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{value}</button>)}</div>
    {tab === 'About' ? <div className="about-card"><Icon name="book" /><h2>Critical Thinking</h2><p>Prepared practice exploring induction, deduction, and abduction.</p><button className="primary-button" onClick={onStartPractice}>Start Practice <Icon name="arrow" /></button></div> : <>
      <div className="library-filters" aria-label="Practice set filters">{['All', 'Ready-made', 'My Uploads'].map(value => <button key={value} type="button" disabled={value === 'My Uploads'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
      <div className="library-set-list" aria-label={preview ? 'Illustrative sample library — no saved progress or uploaded files' : 'Prepared practice'}>{sets.map((set, index) => <button key={set.name} className={`library-set-card ${index === 0 && preview ? 'with-sample-progress' : ''}`} type="button" disabled={preview && index !== 0} title={preview ? 'Sample design — not saved practice or uploaded content' : 'Reviewed prepared question set'} onClick={onStartPractice}>
        <span className={`library-set-icon ${set.kind}`}><LibrarySetIcon kind={set.kind} /></span><span className="library-set-text"><strong>{set.name}</strong><small>{preview ? `${set.questions} questions${index >= 4 ? ' • My Upload' : ''}` : 'Reviewed, prepared question set'}</small>{preview && index === 0 && <span className="library-sample-progress" aria-label="Sample progress illustration, 6 of 10"><span className="library-progress-track"><i /></span><span>6/10</span></span>}</span>
        {preview && index >= 4 ? <span className="library-upload-chevron" aria-hidden="true">›</span> : <span className="library-play-decoration"><Icon name="play" /></span>}
      </button>)}</div>
    </>}
  </section>
}
