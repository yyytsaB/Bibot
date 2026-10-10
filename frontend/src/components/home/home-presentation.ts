/** Presentation values supplied by the integration owner; no stores or API calls. */
export type PreparedPracticeSummary =
  | { availability: 'loading' }
  | { availability: 'unavailable'; message?: string }
  | { availability: 'available'; reviewedQuestionCount: number }
export type SessionProgress = { answeredInitialQuestions: number; totalInitialQuestions: number; canResume: boolean; isCompleted?: boolean }
export type HomeConceptStatus = 'Not Yet Practiced' | 'Needs Review' | 'Improving' | 'Understanding Demonstrated'
export type HomeMapPreviewData = { nodes: readonly { id: string; label: string; status: HomeConceptStatus }[]; hasEvidence?: boolean }
export type HomePresentationData = { preparedPractice: PreparedPracticeSummary; sessionProgress?: SessionProgress; mapPreview?: HomeMapPreviewData }
export type HomeNavigation = { onBack?: () => void; onExploreSubjects?: () => void; onSelectSubject?: (subjectId: 'critical-thinking') => void; onStartPractice?: () => void; onResumePractice?: () => void; onOpenMap?: () => void }
export type HomeViewProps = { presentation: HomePresentationData } & HomeNavigation
/** A pending follow-up can remain even after every initial question is answered. */
export function practiceEntry(progress: SessionProgress | undefined, navigation: Pick<HomeNavigation, 'onStartPractice' | 'onResumePractice'>) {
  return progress?.canResume
    ? { label: 'Continue Practice', action: navigation.onResumePractice }
    : { label: 'Start Practice', action: navigation.onStartPractice }
}
export function reviewedQuestionCount(practice: PreparedPracticeSummary): number | undefined {
  return practice.availability === 'available' && Number.isSafeInteger(practice.reviewedQuestionCount) && practice.reviewedQuestionCount > 0 ? practice.reviewedQuestionCount : undefined
}
export function visibleSessionProgress(data: HomePresentationData): SessionProgress | undefined {
  const progress = data.sessionProgress
  const total = reviewedQuestionCount(data.preparedPractice)
  if (!progress || total === undefined || progress.totalInitialQuestions !== total || !Number.isSafeInteger(progress.answeredInitialQuestions) || progress.answeredInitialQuestions < 0 || progress.answeredInitialQuestions > total || typeof progress.canResume !== 'boolean') return undefined
  return progress
}
export function practiceAvailabilityText(practice: PreparedPracticeSummary): string {
  if (reviewedQuestionCount(practice) !== undefined) return 'Reviewed Critical Thinking practice'
  return practice.availability === 'loading' ? 'Loading prepared practice…' : practice.availability === 'unavailable' && practice.message ? practice.message : 'Prepared practice unavailable'
}
