import { useSyncExternalStore } from 'react'
import type { PracticeSession } from '../../state/practice-session'
import { getReviewedContentStore } from '../../state/load-reviewed-content'
import { MobileShell } from '../layout/MobileShell'
import { HomeView, SubjectSelectionView } from './HomeScreens'
import type { HomeScreen } from './HomeScreens'
import { PreparedPracticeLibrary } from './PracticeLibrary'
import { createHomePresentation } from './home-session-presentation'
import type { HomePresentationData } from './home-presentation'

export function LiveHome({ session, screen, onNavigate, onBack }: { session: PracticeSession; screen: HomeScreen; onNavigate: (screen: number) => void; onBack: () => void }) {
  const { state, storageNotice } = useSyncExternalStore(session.subscribe, session.getSnapshot)
  let presentation: HomePresentationData
  try {
    presentation = createHomePresentation(state, getReviewedContentStore().getQuestions(), session.map.getSnapshot())
  } catch {
    presentation = { preparedPractice: { availability: 'unavailable', message: 'Reviewed practice could not be loaded' } }
  }
  // Both entry actions reopen the same controller; never reset or create a session.
  const props = { presentation, onBack, onExploreSubjects: () => onNavigate(5), onSelectSubject: () => onNavigate(9), onStartPractice: () => onNavigate(10), onResumePractice: () => onNavigate(10), onOpenMap: () => onNavigate(17) }
  return <MobileShell homeLayout={screen === 'home'} active={screen === 'home' ? 'home' : 'practice'} onNavigate={tab => onNavigate(tab === 'home' ? 2 : tab === 'practice' ? 9 : 17)}>
    {storageNotice && <p role="status">{storageNotice}</p>}
    {screen === 'home' ? <HomeView {...props} /> : screen === 'subjects' ? <SubjectSelectionView {...props} /> : <PreparedPracticeLibrary {...props} />}
  </MobileShell>
}
