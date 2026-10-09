import { Icon } from './Icon'

export type Tab = 'home' | 'practice' | 'map'
export function BottomNavigation({ active, onNavigate }: { active: Tab; onNavigate: (tab: Tab) => void }) {
  return <nav className="bottom-nav" aria-label="Main navigation">{(['home', 'practice', 'map'] as const).map(tab => <button key={tab} type="button" aria-current={active === tab ? 'page' : undefined} onClick={() => onNavigate(tab)}><Icon name={tab} /><span>{tab === 'home' ? 'Home' : tab === 'practice' ? 'Practice' : 'Map'}</span></button>)}</nav>
}
