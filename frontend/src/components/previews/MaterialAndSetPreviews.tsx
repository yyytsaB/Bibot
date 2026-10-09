import { SetReadyPreview } from './SetReadyPreview'
import { GeneratingPreview } from './GeneratingPreview'
import { PracticeSetDetailsPreview } from './PracticeSetDetailsPreview'
import { UploadFilePreview } from './UploadFilePreview'
import { PasteTextPreview } from './PasteTextPreview'
import { SplashScreen } from './SplashScreen'

export function MaterialAndSetPreviews({ screen, onNavigate, onBack }: { screen: number; onNavigate: (screen: number) => void; onBack: () => void }) {
  if (screen === 1) return <SplashScreen onContinue={() => onNavigate(2)} />
  if (screen === 3) return <PasteTextPreview onBack={onBack} onContinue={() => onNavigate(6)} />
  if (screen === 4) return <UploadFilePreview onBack={onBack} onContinue={() => onNavigate(6)} />
  if (screen === 7) return <GeneratingPreview onBack={onBack} onContinue={() => onNavigate(8)} />
  if (screen === 8) return <SetReadyPreview onBack={onBack} onClose={() => onNavigate(2)} onEdit={() => onNavigate(6)} onStart={() => onNavigate(10)} />
  return <PracticeSetDetailsPreview onBack={onBack} onContinue={() => onNavigate(7)} />
}

