import { useSyncExternalStore } from 'react'
import { getPracticePresentation, type PracticeSession } from '../../state/practice-session'
import { MobileShell } from '../layout/MobileShell'
import { PracticeScreens } from './PracticeScreens'

export function LivePractice({ session, onLeave }: { session: PracticeSession; onLeave: () => void }) {
  const { state, storageNotice } = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const presentation = getPracticePresentation(state)
  const controller = session.controller
  const followUp = state.status === 'follow_up_answering'
  return <MobileShell onNavigate={onLeave}>
    {storageNotice && <p role="status">{storageNotice}</p>}
    <PracticeScreens {...presentation}
      onSelectChoice={id => followUp ? controller.selectFollowUpChoice(id) : controller.selectChoice(id)}
      onReasoningChange={value => controller.setReasoning(value)}
      onCheckAnswer={() => followUp ? controller.checkFollowUpAnswer() : controller.checkAnswer()}
      onAnalyze={() => { void controller.submitReasoning() }}
      onFollowUp={() => controller.startFollowUp()}
      onContinue={() => controller.advanceToNextQuestion()}
      onExtraExample={() => controller.tryExtraExample()}
      onBack={onLeave} onLibrary={onLeave}
    />
  </MobileShell>
}
