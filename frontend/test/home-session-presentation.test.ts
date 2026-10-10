import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPracticeSession } from '../src/state/practice-session.ts'
import { getReviewedContentStore } from '../src/state/load-reviewed-content.ts'
import { createHomePresentation } from '../src/components/home/home-session-presentation.ts'
import { practiceEntry } from '../src/components/home/home-presentation.ts'

const content = getReviewedContentStore()
const questions = content.getQuestions()
function setup() {
  let saved: string | null = null
  const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value } }
  const session = createPracticeSession({ contentStore: content, storage, apiClient: { submitFeedback: async request => {
    const question = content.getQuestion(request.question_id)!
    return { ok: true as const, data: { kind: 'fallback' as const, verified_explanation: question.verified_explanation, follow_up_id: question.follow_up_ids[0]! } }
  } } })
  const stop = session.subscribe(() => {})
  const view = () => createHomePresentation(session.getSnapshot().state, questions, session.map.getSnapshot())
  return {session,storage,stop,view}
}
test('fresh Home uses reviewed counts and an empty saved-map snapshot', () => {
  const {view,stop} = setup()
  assert.equal(view().preparedPractice.availability, 'available')
  assert.equal(view().sessionProgress?.totalInitialQuestions, questions.length)
  assert.equal(view().sessionProgress?.canResume, false)
  assert.equal(view().mapPreview?.hasEvidence, false)
  assert.ok(view().mapPreview?.nodes.every(node => node.status === 'Not Yet Practiced'))
  stop()
})
test('last initial answer stays resumable through feedback and follow-up; reload preserves it', async () => {
  const {session,storage,stop,view} = setup()
  for (const question of questions.slice(0,-1)) {
    session.controller.selectChoice(question.correct_choice_id); session.controller.checkAnswer(); session.controller.advanceToNextQuestion()
  }
  const last = questions.at(-1)!
  session.controller.selectChoice(last.choices.find(choice => choice.id !== last.correct_choice_id)!.id)
  session.controller.checkAnswer(); session.controller.setReasoning('I guessed'); await session.controller.submitReasoning()
  session.controller.startFollowUp()
  assert.equal(view().sessionProgress?.answeredInitialQuestions, questions.length)
  assert.equal(view().sessionProgress?.canResume, true)
  assert.equal(view().sessionProgress?.isCompleted, false)
  const restored = createPracticeSession({contentStore:content,storage})
  assert.equal(restored.getSnapshot().state.status,'follow_up_answering')
  assert.deepEqual(createHomePresentation(restored.getSnapshot().state,questions,restored.map.getSnapshot()),view())
  const state = session.getSnapshot().state
  assert.equal(state.status,'follow_up_answering')
  if(state.status !== 'follow_up_answering') throw new Error('Expected follow-up')
  session.controller.selectFollowUpChoice(state.activeFollowUp.correct_choice_id); session.controller.checkFollowUpAnswer()
  assert.equal(view().sessionProgress?.answeredInitialQuestions,questions.length)
  session.controller.advanceToNextQuestion()
  assert.equal(view().sessionProgress?.isCompleted,true)
  assert.equal(view().sessionProgress?.canResume,false)
  stop()
})
test('mismatched reviewed content is unavailable and duplicate initial evidence cannot inflate progress', () => {
  const {session,view,stop}=setup()
  session.controller.selectChoice(questions[0]!.correct_choice_id); session.controller.checkAnswer()
  const state=session.getSnapshot().state
  const duplicate={...state, learningEvidence:[...state.learningEvidence,...state.learningEvidence]}
  assert.equal(createHomePresentation(duplicate,questions,session.map.getSnapshot()).sessionProgress?.answeredInitialQuestions,1)
  assert.equal(view().mapPreview?.hasEvidence,true)
  assert.equal(createHomePresentation(state,[],session.map.getSnapshot()).preparedPractice.availability,'unavailable')
  stop()
})
test('continuation without a callback never falls back to a potentially resetting Start action', () => {
  let starts=0
  const entry=practiceEntry({answeredInitialQuestions:6,totalInitialQuestions:6,canResume:true,isCompleted:false},{onStartPractice:()=>starts++})
  assert.equal(entry.label,'Continue Practice'); assert.equal(entry.action,undefined); assert.equal(starts,0)
})

test('completed session entry describes reopening completion without starting or resetting practice', () => {
  const { session, stop, view } = setup()
  for (const question of questions) {
    session.controller.selectChoice(question.correct_choice_id)
    session.controller.checkAnswer()
    session.controller.advanceToNextQuestion()
  }
  assert.equal(session.getSnapshot().state.status, 'session_completed')
  let opened = 0
  const action = () => { opened++ }
  const entry = practiceEntry(view().sessionProgress, { onStartPractice: action })
  assert.equal(entry.label, 'View Completion')
  assert.equal(entry.action, action)
  entry.action?.()
  assert.equal(opened, 1)
  assert.equal(session.getSnapshot().state.status, 'session_completed')
  stop()
})
