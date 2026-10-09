import type { FeedbackResult } from 'shared';
import type { IFeedbackApiClient } from '../api/client.ts';
import { PracticeController } from './controller.ts';
import type { PracticeContentStore } from './content-store.ts';
import { getReviewedContentStore } from './load-reviewed-content.ts';
import { LearningMapStore } from './learning-map.ts';
import { PracticePersistence, type LocalStoragePort } from './persistence.ts';
import type { PracticeState } from './types.ts';

/** Translate authoritative state into presentation without maintaining a second flow. */
export function getPracticePresentation(state: PracticeState) {
  const followUp = state.status === 'follow_up_answering' || state.status === 'follow_up_checked';
  const feedback: FeedbackResult | undefined = state.status === 'diagnosis' ? state.diagnosis
    : state.status === 'fallback' ? state.fallback
    : state.status === 'clarification' ? { kind: 'clarification', clarification_prompt: state.clarificationPrompt }
    : undefined;
  const view = state.status === 'question_answering' ? 'question'
    : state.status === 'question_correct' ? 'correct'
    : state.status === 'analysis' ? 'analysis'
    : state.status === 'reasoning' || state.status === 'recoverable_error' ? 'reasoning'
    : state.status === 'follow_up_answering' ? 'follow-up'
    : state.status === 'follow_up_checked' ? state.isCorrect ? 'correct' : 'incorrect'
    : state.status === 'session_completed' ? 'completed' : 'feedback';
  return {
    view,
    question: followUp ? state.activeFollowUp : state.currentQuestion,
    selectedChoiceId: followUp ? state.selectedFollowUpChoiceId
      : 'selectedChoiceId' in state ? state.selectedChoiceId : null,
    reasoning: 'studentReasoning' in state ? state.studentReasoning : '',
    feedback,
    progress: followUp ? { current: 1, total: 1 }
      : { current: state.currentQuestionIndex + 1, total: state.totalQuestions },
    busy: state.status === 'analysis',
    correctInitial: state.status === 'question_correct',
    hasExtraExample: state.status === 'follow_up_checked' && state.unusedLinkedFollowUpId !== null,
    errorMessage: state.status === 'recoverable_error' ? state.errorMessage : undefined,
  } as const;
}

export interface PracticeSessionSnapshot {
  state: PracticeState;
  storageNotice: string | null;
}

/** One session survives route changes; subscriptions never start model requests. */
export function createPracticeSession(options: {
  contentStore?: PracticeContentStore;
  apiClient?: IFeedbackApiClient;
  storage?: LocalStoragePort;
} = {}) {
  const contentStore = options.contentStore ?? getReviewedContentStore();
  const persistence = new PracticePersistence({ contentStore, ...(options.storage ? { storage: options.storage } : {}) });
  const loaded = persistence.load();
  const map = loaded.status === 'restored' ? loaded.map : new LearningMapStore(contentStore);
  const controller = new PracticeController({
    contentStore,
    ...(options.apiClient ? { apiClient: options.apiClient } : {}),
    ...(loaded.status === 'restored' ? { restored: { checkpoint: loaded.checkpoint, evidence: map.getEvidence() } } : {}),
  });
  const loadNotice = loaded.status === 'invalid'
    ? 'Saved progress could not be restored. Practice has started from the first question.' : null;
  let snapshot: PracticeSessionSnapshot = {
    state: controller.getState(),
    storageNotice: loadNotice ?? (loaded.status === 'unavailable' ? 'Saving is unavailable. You can continue, but progress may be lost on reload.' : null),
  };
  const listeners = new Set<() => void>();
  let disconnect: (() => void) | undefined;
  const update = () => {
    const state = controller.getState();
    map.applyEvidence(state.learningEvidence);
    const result = persistence.save(state, map);
    snapshot = { state, storageNotice: result.ok ? loadNotice : 'Saving is unavailable. You can continue, but progress may be lost on reload.' };
    for (const listener of listeners) listener();
  };
  return {
    controller, map,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!disconnect) { disconnect = controller.subscribe(update); update(); }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) { disconnect?.(); disconnect = undefined; }
      };
    },
  };
}

export type PracticeSession = ReturnType<typeof createPracticeSession>;
