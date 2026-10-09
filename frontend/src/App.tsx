import { useEffect, useState } from 'react'
import { PreviewApp } from './components/previews/PreviewApp'
import { LivePractice } from './components/practice/LivePractice'
import { LocalAiReadiness } from './components/readiness/LocalAiReadiness'
import { createPracticeSession } from './state/practice-session'
import './App.css'
import './styles/connected-navigation.css'

// Explicit design-preview routes remain illustrative; practice routes use reviewed content.
const screenRoutes = ['welcome', 'home', 'paste-text', 'upload-file', 'subjects', 'set-details', 'generating', 'set-ready', 'library', 'question', 'reasoning', 'feedback', 'follow-up', 'answer-result', 'completed', 'empty-map', 'map', 'concept-map', 'map-details'] as const
function currentScreen(): number {
  const route = window.location.hash.replace(/^#\/?/, '')
  if (route.startsWith('design-preview/')) {
    const number = Number(route.split('/')[1])
    return Number.isInteger(number) && number >= 1 && number <= 19 ? number : 2
  }
  if (route === 'prepared-practice') return 10
  const index = screenRoutes.findIndex(name => name === route)
  return index >= 0 ? index + 1 : route ? 2 : 1
}
const parents: Record<number, number> = { 2: 1, 3: 2, 4: 2, 5: 2, 6: 9, 7: 6, 8: 9, 9: 5, 10: 9, 11: 10, 12: 11, 13: 12, 14: 13, 15: 9, 16: 2, 17: 2, 18: 17, 19: 18 }

function App() {
  const [screen, setScreen] = useState(currentScreen)
  const [designPreview, setDesignPreview] = useState(() => window.location.hash.startsWith('#/design-preview/'))
  const [practiceSession] = useState(() => createPracticeSession())
  useEffect(() => {
    const update = () => {
      setScreen(currentScreen())
      setDesignPreview(window.location.hash.startsWith('#/design-preview/'))
    }
    window.addEventListener('hashchange', update)
    window.addEventListener('popstate', update)
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update) }
  }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [screen])
  const navigate = (next: number) => {
    const route = screenRoutes[next - 1]
    if (!route || next === screen) return
    window.history.pushState({ bibotNavigation: true }, '', designPreview ? `#/design-preview/${next}` : `#/${route}`)
    setScreen(next)
  }
  const back = () => {
    if (window.history.state?.bibotNavigation === true) window.history.back()
    else navigate(parents[screen] ?? 2)
  }
  const livePractice = !designPreview && screen >= 10 && screen <= 15
  return <div className="connected-frontend">
    {!designPreview && <div style={{ maxWidth: 480, marginInline: 'auto', padding: '12px 18px' }}><LocalAiReadiness /></div>}
    {livePractice
    ? <LivePractice session={practiceSession} onLeave={() => navigate(9)} />
    : <><PreviewApp screen={screen} connected onNavigate={navigate} onBack={back} /><p className="frontend-demo-notice" role="note">{designPreview ? 'Design preview · illustrative content only' : 'Interface preview · sample Home and map'}<br />Prepared practice uses reviewed questions</p></>}
  </div>
}

export default App
