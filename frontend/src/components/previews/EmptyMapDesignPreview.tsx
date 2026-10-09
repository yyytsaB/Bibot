import { Icon } from '../layout/Icon'
import wordmark from '../../assets/bibot/wordmark.png'
import reading from '../../assets/bibot/duck-reading.png'
import '../../styles/empty-map-design-preview.css'

type Props = { onNavigate: (screen: number) => void }
export function EmptyMapDesignPreview({ onNavigate }: Props) {
  return <section className="empty-map-design">
    <header className="empty-map-brand"><svg viewBox="405 161 1385 411" role="img" aria-label="Bibot"><image href={wordmark} width="2172" height="724" /></svg><span className="empty-map-profile" aria-hidden="true"><Icon name="user" /></span></header>
    <h1>My Concept Maps</h1><p className="empty-map-intro">Complete a practice set to unlock its concept map.</p>
    <svg className="empty-map-duck" viewBox="581 282 900 984" role="img" aria-label="Bibot reading a purple book"><image href={reading} width="2000" height="1500" /></svg>
    <div className="empty-map-benefits">{['Shows your understanding per subject','Highlights areas to review','Updated every time you complete a set'].map(text => <p key={text}><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#3013ad" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 12 4 4 8-9" /></svg></span>{text}</p>)}</div>
    <nav className="empty-map-nav" aria-label="Main navigation">{(['home','practice','map'] as const).map(tab => <button type="button" key={tab} aria-current={tab === 'map' ? 'page' : undefined} onClick={() => onNavigate(tab === 'home' ? 2 : tab === 'practice' ? 9 : 17)}>{tab === 'map' ? <svg className="icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 23 8-17 9 8-5 10-12-1M17 6l4 18" /><circle cx="9" cy="23" r="4.2" fill="#faf9ff" /><circle cx="17" cy="6" r="4.2" fill="#faf9ff" /><circle cx="26" cy="14" r="4.2" fill="#faf9ff" /><circle cx="21" cy="24" r="4.2" fill="#faf9ff" /></svg> : <Icon name={tab} />}<span>{tab === 'home' ? 'Home' : tab === 'practice' ? 'Practice' : 'My Map'}</span></button>)}</nav>
  </section>
}
