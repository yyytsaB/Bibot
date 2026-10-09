import { MapDesignPreviews } from './MapDesignPreviews'
import { fixtureHomeData } from '../../../../shared/src/fixtures'
import { HomeScreens } from '../home/HomeScreens'
import { MobileShell } from '../layout/MobileShell'
import { MaterialAndSetPreviews } from './MaterialAndSetPreviews'
import { PreviewNavigator } from './PreviewNavigator'
import { PracticePreview } from './PracticePreview'

export function PreviewApp({ screen, onNavigate, onBack, connected = false }: { connected?: boolean; screen: number; onNavigate: (screen: number) => void; onBack: () => void }) {
  if (screen >= 16 && screen <= 19) return <>{!connected && <PreviewNavigator screen={screen} onSelect={onNavigate} />}<MapDesignPreviews key={screen} screen={screen} onNavigate={onNavigate} onBack={onBack} /></>
  if (screen >= 10 && screen <= 15) return <>{!connected && <PreviewNavigator screen={screen} onSelect={onNavigate} />}<PracticePreview screen={screen} onNavigate={onNavigate} onBack={onBack} /></>
  const homeScreen = screen === 2 ? 'home' : screen === 5 ? 'subjects' : 'library'
  const isHomeScreen = [2, 5, 9].includes(screen)
  return <>{!connected && <PreviewNavigator screen={screen} onSelect={onNavigate} />}<MobileShell edgeToEdge={screen === 1} homeLayout={screen === 2} active={isHomeScreen ? screen === 2 ? 'home' : 'practice' : undefined} onNavigate={tab => onNavigate(tab === 'home' ? 2 : tab === 'practice' ? 9 : connected ? 17 : 16)}>{isHomeScreen ? <HomeScreens data={fixtureHomeData} screen={homeScreen} preview connected={connected} onBack={onBack} onExplore={() => onNavigate(5)} onSubject={() => onNavigate(9)} onStartPractice={() => onNavigate(connected ? 10 : 6)} /> : screen <= 8 ? <MaterialAndSetPreviews key={screen} screen={screen} onNavigate={onNavigate} onBack={onBack} /> : <section className="integration-placeholder"><h1>Next presentation package</h1><p>This screen will be built in F9 or F11.</p><button className="primary-button" onClick={() => onNavigate(2)}>Back to Home</button></section>}</MobileShell></>
}
