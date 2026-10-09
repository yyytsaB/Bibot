import { Icon } from '../layout/Icon'
import wordmark from '../../assets/bibot/wordmark.png'
import reading from '../../assets/bibot/duck-reading.png'
import '../../styles/empty-map-design-preview.css'
import '../../styles/populated-map-design-preview.css'

type SubjectKind = 'thinking' | 'logic' | 'research' | 'math' | 'communication'
const subjects: {name:string;date:string;kind:SubjectKind}[] = [{name:'Critical Thinking',date:'Apr 15, 2024',kind:'thinking'},{name:'Logic',date:'Apr 12, 2024',kind:'logic'},{name:'Research',date:'Apr 10, 2024',kind:'research'},{name:'Mathematics',date:'Apr 8, 2024',kind:'math'},{name:'Communication',date:'Apr 5, 2024',kind:'communication'}]
function SubjectArt({kind}:{kind:SubjectKind}) {
  return <span className={`populated-map-art ${kind}`} aria-hidden="true"><svg viewBox="0 0 40 40" fill="currentColor">{kind==='thinking' ? <><path d="M20 3a12 12 0 0 0-7 22l2 5h10l2-5A12 12 0 0 0 20 3M15 33h10l-2 4h-6Z" /><path d="M20 10v19" stroke="white" strokeWidth="3" /><circle cx="20" cy="12" r="4" fill="white" /></> : kind==='logic' ? <><path d="M19 10C14 5 7 6 4 9v22c5-3 10-2 15 2ZM21 10c5-5 12-4 15-1v22c-5-3-10-2-15 2Z" /></> : kind==='research' ? <><path d="m1 12 19-8 19 8-19 8ZM8 18v10c7 6 17 6 24 0V18" /><path d="M37 14v15" stroke="currentColor" strokeWidth="2" /></> : kind==='math' ? <><rect x="7" y="4" width="27" height="32" rx="5" /><path d="M13 11h14M13 19h3M13 27h3M24 19v9" stroke="white" strokeWidth="3" /></> : <><path d="M20 5C1 5 0 28 12 30L6 36l13-5C40 32 40 5 20 5Z" /><g fill="white"><circle cx="12" cy="18" r="2" /><circle cx="20" cy="18" r="2" /><circle cx="28" cy="18" r="2" /></g></>}</svg></span>
}
type Props = { onNavigate: (screen: number) => void }
export function PopulatedMapDesignPreview({ onNavigate }: Props) {
  return <section className="empty-map-design populated-map-design">
    <header className="empty-map-brand"><svg viewBox="405 161 1385 411" role="img" aria-label="Bibot"><image href={wordmark} width="2172" height="724" /></svg><span className="empty-map-profile" aria-hidden="true"><Icon name="user" /></span></header>
    <h1>My Concept Maps</h1><p className="empty-map-intro">Review your completed practice<br />sets through concept maps.</p>
    <svg className="empty-map-duck" viewBox="581 282 900 984" role="img" aria-label="Bibot reading a purple book"><image href={reading} width="2000" height="1500" /></svg>
    <div className="populated-map-subjects">{subjects.map((subject,index) => <button type="button" key={subject.name} disabled={index>0} onClick={() => onNavigate(18)} title={index>0 ? 'Illustrated subject only; practice unavailable' : 'Open illustrative map'}><SubjectArt kind={subject.kind} /><span><strong>{subject.name}</strong><small>Last completed {subject.date}</small></span><span className="populated-map-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg></span></button>)}</div>
    <nav className="empty-map-nav" aria-label="Main navigation">{(['home','practice','map'] as const).map(tab => <button type="button" key={tab} aria-current={tab === 'map' ? 'page' : undefined} onClick={() => onNavigate(tab === 'home' ? 2 : tab === 'practice' ? 9 : 17)}>{tab === 'map' ? <svg className="icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 23 8-17 9 8-5 10-12-1M17 6l4 18" /><circle cx="9" cy="23" r="4.2" fill="#faf9ff" /><circle cx="17" cy="6" r="4.2" fill="#faf9ff" /><circle cx="26" cy="14" r="4.2" fill="#faf9ff" /><circle cx="21" cy="24" r="4.2" fill="#faf9ff" /></svg> : <Icon name={tab} />}<span>{tab === 'home' ? 'Home' : tab === 'practice' ? 'Practice' : 'My Map'}</span></button>)}</nav>
  </section>
}
