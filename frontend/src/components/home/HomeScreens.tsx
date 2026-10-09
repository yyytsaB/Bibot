import { PracticeLibrary } from './PracticeLibrary'
import { SubjectIcon } from './SubjectIcon'
import type { SubjectIconKind } from './SubjectIcon'
import '../../styles/subjects-refinement.css'
import { HomeEntryIcon } from './HomeEntryIcon'
import '../../styles/home-refinement.css'
import { useState } from 'react'
import type { FixtureHomeData } from '../../../../shared/src/fixtures'
import { Icon } from '../layout/Icon'
import type { IconName } from '../layout/Icon'
import logo from '../../assets/bibot/wordmark.png'
import homeDuck from '../../assets/bibot/duck-laptop.png'

export type HomeScreen = 'home' | 'subjects' | 'library'
type Props = { data: FixtureHomeData; screen: HomeScreen; onBack: () => void; onExplore: () => void; onSubject: () => void; onStartPractice: () => void; preview?: boolean; connected?: boolean }
const subjects: { title: string; description: string; icon: IconName; tone: string; art: SubjectIconKind }[] = [
  { title: 'Critical Thinking', art: 'thinking', description: 'Arguments, reasoning, fallacies, and more.', icon: 'map', tone: 'blue' },
  { title: 'Logic', art: 'logic', description: 'Propositions, validity, and arguments.', icon: 'screen', tone: 'mint' },
  { title: 'Research', art: 'research', description: 'Research methods, ethics, and design.', icon: 'upload', tone: 'orange' },
  { title: 'Mathematics', art: 'math', description: 'Problem solving and reasoning.', icon: 'math', tone: 'pink' },
  { title: 'Computer Science', art: 'computer', description: 'Fundamentals and core concepts.', icon: 'screen', tone: 'blue' },
  { title: 'Communication', art: 'communication', description: 'Media, messages, and interpretation.', icon: 'chat', tone: 'purple' },
]

function PageHeader({ onBack }: { onBack: () => void }) {
  return <header className="page-header"><button className="icon-button" onClick={onBack} aria-label="Go back"><Icon name="back" /></button><span className="profile-decoration" aria-hidden="true"><Icon name="user" /></span></header>
}

export function HomeScreens(props: Props) {
  return props.screen === 'home' ? <Home {...props} /> : props.screen === 'subjects' ? <Subjects {...props} /> : <Library {...props} />
}

function Home({ data, onExplore, onStartPractice, preview, connected }: Props) {
  return (
    <section className="home-page">
      <header className="home-brand">
        <svg className="home-wordmark" viewBox="405 161 1385 411" role="img" aria-label="Bibot"><image href={logo} width="2172" height="724" /></svg>
        <span className="profile-decoration" aria-hidden="true"><Icon name="user" /></span>
      </header>
      <div className="welcome">
        <h1>Good day!</h1>
        <p>What would you like<br />to learn today?</p>
        <svg className="home-mascot" viewBox="259 276 1413 979" role="img" aria-label="Bibot duck studying with a purple laptop"><image href={homeDuck} width="2000" height="1500" /></svg>
      </div>
      <div className="entry-cards">
        <button className="entry-card purple-card" disabled title={data.uploadStatus.tooltip}>
          <span className="card-icon purple"><HomeEntryIcon kind="upload" /></span>
          <span><strong>Upload Materials</strong><small>{preview && !connected ? <>Add PDFs or text files to<br />create practice sets.</> : <>Local file uploads<br />coming soon.</>}</small></span><span className="chevron">›</span>
        </button>
        <button className="entry-card purple-card" disabled title="Not available yet">
          <span className="card-icon purple"><HomeEntryIcon kind="text" /></span>
          <span><strong>Type or Paste Text</strong><small>{preview && !connected ? <>Enter your own notes,<br />readings, or any text.</> : <>Practice from notes<br />coming soon.</>}</small></span><span className="chevron">›</span>
        </button>
        <button className="entry-card yellow-card" onClick={onExplore}>
          <span className="card-icon yellow"><HomeEntryIcon kind="book" /></span>
          <span><strong>Explore Subjects</strong><small>Choose from ready-to-use<br />practice sets.</small></span><span className="chevron">›</span>
        </button>
      </div>
      <button className="primary-button dark" onClick={onStartPractice} disabled={!data.preparedSubject.hasPreparedPractice}>Start Practice <Icon name="arrow" /></button>
      {!preview && <><p className="availability-note">Local AI unavailable</p><button className="small-map-preview" onClick={onExplore}><Icon name="map" /><span>Explore Critical Thinking</span><span className="map-dots" aria-label="Concepts not yet practiced"><i /><i /><i /></span></button></>}
    </section>
  )
}

function Subjects({ data, onBack, onSubject, preview }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const visible = subjects.filter(s => s.title.toLowerCase().includes(query.toLowerCase()) && (filter !== 'Core' || s.title === 'Critical Thinking'))
  return <section className="subjects-page"><PageHeader onBack={onBack} /><h1>Choose a Subject</h1><p className="subtitle">Select a subject to start practicing<br />{preview ? 'with your materials or ready-made sets.' : 'with ready-made sets.'}</p><label className="search-field"><Icon name="search" /><input aria-label="Search subjects" placeholder="Search subjects..." value={query} onChange={e => setQuery(e.target.value)} /></label><div className="filter-pills" aria-label="Subject filters">{['All', 'Core', 'My Uploads'].map(f => <button key={f} disabled={f === 'My Uploads'} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div><div className="subject-list">{visible.map((s, i) => <button className={`subject-card ${i === 0 && s.title === 'Critical Thinking' ? 'featured' : ''}`} key={s.title} disabled={s.title !== 'Critical Thinking'} title={s.title === 'Critical Thinking' ? 'Prepared Critical Thinking practice' : 'Coming soon — illustration only'} onClick={onSubject}><span className={`card-icon ${s.tone}`}><SubjectIcon kind={s.art} /></span><span><strong>{s.title === 'Critical Thinking' ? data.preparedSubject.title : s.title}</strong><small>{s.description}</small>{s.title !== 'Critical Thinking' && !preview && <em>Coming soon</em>}</span><span className="chevron">›</span></button>)}</div>{visible.length === 0 && <p className="empty-message">No matching subjects.</p>}</section>
}

function Library(props: Props) {
  return <PracticeLibrary {...props} />
}
