import type { ReactNode } from 'react'
import { BottomNavigation } from './BottomNavigation'
import type { Tab } from './BottomNavigation'

export function MobileShell({ children, active, onNavigate, edgeToEdge = false, homeLayout = false }: { children: ReactNode; active?: Tab; onNavigate: (tab: Tab) => void; edgeToEdge?: boolean; homeLayout?: boolean }) {
  return <div className={`mobile-shell ${active ? 'with-nav' : ''} ${edgeToEdge ? 'splash-shell' : ''} ${homeLayout ? 'home-shell' : ''}`}><main className="page-content">{children}</main>{active && <BottomNavigation active={active} onNavigate={onNavigate} />}</div>
}
