import type { Question } from 'shared'
import type { PracticeState } from '../../state/types.ts'
import type { LearningMapSnapshot } from '../../state/learning-map.ts'
import type { HomePresentationData } from './home-presentation.ts'

/** Read-only projection; the existing session owns progress and learning rules. */
export function createHomePresentation(state: PracticeState, questions: readonly Question[], map: LearningMapSnapshot): HomePresentationData {
  const reviewed = questions.filter(question => question.subject_id === 'critical-thinking')
  const ids = new Set(reviewed.map(question => question.id))
  if (!reviewed.length || state.totalQuestions !== reviewed.length || !ids.has(state.currentQuestion.id)) {
    return { preparedPractice: { availability: 'unavailable', message: 'Reviewed Critical Thinking practice unavailable' } }
  }
  const answered = new Set(state.learningEvidence.filter(event => event.kind !== 'follow_up_result' && ids.has(event.questionId)).map(event => event.questionId)).size
  const isCompleted = state.isSessionCompleted
  const hasStarted = state.status !== 'question_answering' || state.currentQuestionIndex > 0 || answered > 0 || ('selectedChoiceId' in state && state.selectedChoiceId !== null)
  return {
    preparedPractice: { availability: 'available', reviewedQuestionCount: reviewed.length },
    sessionProgress: { answeredInitialQuestions: answered, totalInitialQuestions: reviewed.length, canResume: hasStarted && !isCompleted, isCompleted },
    mapPreview: { nodes: map.nodes.map(({ id, label, status }) => ({ id, label, status })), hasEvidence: map.concepts.some(concept => concept.last_updated !== null) },
  }
}
