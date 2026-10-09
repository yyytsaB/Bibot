import type {
  Question,
  DiagnosisResult,
  FallbackResult,
} from "shared";
import type {
  PracticeState,
  LearningEvidenceEvent,
  QuestionAnsweringState,
  QuestionCorrectState,
  ReasoningState,
  AnalysisState,
  ClarificationState,
  DiagnosisState,
  FallbackState,
  FollowUpAnsweringState,
  FollowUpCheckedState,
  RecoverableErrorState,
  SessionCompletedState,
} from "./types.ts";
import type { PracticeContentStore } from "./content-store.ts";
import type { ClarificationPolicy } from "./clarification-policy.ts";

export interface StateMachineInitOptions {
  sessionId?: string;
  questions: Question[];
  contentStore: PracticeContentStore;
  clarificationPolicy: ClarificationPolicy;
}

export class PracticeStateMachine {
  private state: PracticeState;
  private readonly contentStore: PracticeContentStore;
  private readonly clarificationPolicy: ClarificationPolicy;
  private readonly questions: Question[];
  private readonly emittedEvidenceKeys: Set<string> = new Set();
  private submissionCounter: number = 0;

  constructor(options: StateMachineInitOptions) {
    if (options.questions.length === 0) {
      throw new Error("PracticeStateMachine requires at least one question");
    }
    this.questions = [...options.questions];
    this.contentStore = options.contentStore;
    this.clarificationPolicy = options.clarificationPolicy;

    const sessionId = options.sessionId ?? this.generateSessionId();
    this.state = this.createInitialQuestionState(sessionId, 0, []);
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private generateEventId(): string {
    return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private createInitialQuestionState(
    sessionId: string,
    questionIndex: number,
    existingEvidence: LearningEvidenceEvent[]
  ): QuestionAnsweringState {
    const q = this.questions[questionIndex]!;
    return {
      status: "question_answering",
      stage: "question",
      sessionId,
      currentQuestionIndex: questionIndex,
      currentQuestion: q,
      totalQuestions: this.questions.length,
      isSessionCompleted: false,
      learningEvidence: existingEvidence,
      shownFollowUpIds: [],
      selectedChoiceId: null,
    };
  }

  public getState(): PracticeState {
    return this.state;
  }

  /**
   * Select a choice for the current initial question.
   * Invalid after the answer has been checked (prevents changing answer).
   */
  public selectChoice(choiceId: string): boolean {
    if (this.state.status !== "question_answering") {
      return false; // Invalid action leaves state unchanged
    }
    // Verify choice exists on question
    const exists = this.state.currentQuestion.choices.some((c) => c.id === choiceId);
    if (!exists) {
      return false;
    }
    this.state = {
      ...this.state,
      selectedChoiceId: choiceId,
    };
    return true;
  }

  /**
   * Checks the initial answer.
   * If correct: reveals verified explanation, permits advancing, zero AI calls.
   * If wrong: locks choice, reveals reasoning input.
   */
  public checkAnswer(): boolean {
    if (this.state.status !== "question_answering" || this.state.selectedChoiceId === null) {
      return false;
    }

    const { sessionId, currentQuestion, currentQuestionIndex, selectedChoiceId, learningEvidence, shownFollowUpIds } =
      this.state;
    const isCorrect = selectedChoiceId === currentQuestion.correct_choice_id;

    if (isCorrect) {
      // Emit correct_first_try learning evidence (deduplicated per session)
      const evidenceKey = `${sessionId}:initial:${currentQuestion.id}`;
      let updatedEvidence = learningEvidence;
      if (!this.emittedEvidenceKeys.has(evidenceKey)) {
        this.emittedEvidenceKeys.add(evidenceKey);
        const event: LearningEvidenceEvent = {
          eventId: this.generateEventId(),
          sessionId,
          timestamp: Date.now(),
          kind: "correct_first_try",
          questionId: currentQuestion.id,
          conceptIds: [...currentQuestion.concept_ids],
        };
        updatedEvidence = [...learningEvidence, event];
      }

      const nextState: QuestionCorrectState = {
        status: "question_correct",
        stage: "question",
        sessionId,
        currentQuestionIndex,
        currentQuestion,
        totalQuestions: this.questions.length,
        isSessionCompleted: false,
        learningEvidence: updatedEvidence,
        shownFollowUpIds,
        selectedChoiceId,
        verifiedExplanation: currentQuestion.verified_explanation,
      };
      this.state = nextState;
      return true;
    } else {
      // Wrong initial answer: emit wrong_initial once using question.concept_ids
      const evidenceKey = `${sessionId}:initial:${currentQuestion.id}`;
      let updatedEvidence = learningEvidence;
      if (!this.emittedEvidenceKeys.has(evidenceKey)) {
        this.emittedEvidenceKeys.add(evidenceKey);
        const event: LearningEvidenceEvent = {
          eventId: this.generateEventId(),
          sessionId,
          timestamp: Date.now(),
          kind: "wrong_initial",
          questionId: currentQuestion.id,
          selectedChoiceId,
          conceptIds: [...currentQuestion.concept_ids],
        };
        updatedEvidence = [...learningEvidence, event];
      }

      const nextState: ReasoningState = {
        status: "reasoning",
        stage: "reasoning",
        sessionId,
        currentQuestionIndex,
        currentQuestion,
        totalQuestions: this.questions.length,
        isSessionCompleted: false,
        learningEvidence: updatedEvidence,
        shownFollowUpIds,
        selectedChoiceId,
        studentReasoning: "",
        clarificationAttemptCount: this.clarificationPolicy.getClarificationCount(currentQuestion.id),
      };
      this.state = nextState;
      return true;
    }
  }

  /**
   * Updates student reasoning text in reasoning, clarification, or recoverable error states.
   */
  public setReasoning(reasoning: string): boolean {
    if (
      this.state.status !== "reasoning" &&
      this.state.status !== "clarification" &&
      this.state.status !== "recoverable_error"
    ) {
      return false;
    }
    this.state = {
      ...this.state,
      studentReasoning: reasoning,
    };
    return true;
  }

  /**
   * Prepares for reasoning submission by validating nonblank text and generating a submission ID.
   */
  public prepareSubmission(): { ok: boolean; submissionId?: number; error?: string } {
    if (
      this.state.status !== "reasoning" &&
      this.state.status !== "clarification" &&
      this.state.status !== "recoverable_error"
    ) {
      return { ok: false, error: "Cannot submit reasoning in current state" };
    }

    if (this.state.studentReasoning.trim().length === 0) {
      return { ok: false, error: "Reasoning cannot be blank or whitespace-only" };
    }

    this.submissionCounter++;
    const subId = this.submissionCounter;

    const nextState: AnalysisState = {
      status: "analysis",
      stage: "analysis",
      sessionId: this.state.sessionId,
      currentQuestionIndex: this.state.currentQuestionIndex,
      currentQuestion: this.state.currentQuestion,
      totalQuestions: this.questions.length,
      isSessionCompleted: false,
      learningEvidence: this.state.learningEvidence,
      shownFollowUpIds: this.state.shownFollowUpIds,
      selectedChoiceId: this.state.selectedChoiceId,
      studentReasoning: this.state.studentReasoning,
      clarificationAttemptCount: this.clarificationPolicy.getClarificationCount(this.state.currentQuestion.id),
      submissionId: subId,
    };
    this.state = nextState;
    return { ok: true, submissionId: subId };
  }

  /**
   * Applies a successful Clarification response.
   */
  public applyClarificationResponse(
    submissionId: number,
    prompt: string
  ): boolean {
    if (this.state.status !== "analysis" || this.state.submissionId !== submissionId) {
      return false;
    }
    const newCount = this.clarificationPolicy.recordClarification(this.state.currentQuestion.id);

    const nextState: ClarificationState = {
      status: "clarification",
      stage: "feedback",
      sessionId: this.state.sessionId,
      currentQuestionIndex: this.state.currentQuestionIndex,
      currentQuestion: this.state.currentQuestion,
      totalQuestions: this.questions.length,
      isSessionCompleted: false,
      learningEvidence: this.state.learningEvidence,
      shownFollowUpIds: this.state.shownFollowUpIds,
      selectedChoiceId: this.state.selectedChoiceId,
      studentReasoning: this.state.studentReasoning, // Preserved for edit/resubmit
      clarificationPrompt: prompt,
      clarificationAttemptCount: newCount,
    };
    this.state = nextState;
    return true;
  }

  /**
   * Applies a successful Diagnosis response.
   */
  public applyDiagnosisResponse(
    submissionId: number,
    diagnosis: DiagnosisResult
  ): { ok: boolean; error?: string } {
    if (this.state.status !== "analysis" || this.state.submissionId !== submissionId) {
      return { ok: false, error: "Stale or invalid response state" };
    }

    // Validate follow_up_id is linked to the current question
    if (!this.contentStore.isFollowUpLinkedToQuestion(this.state.currentQuestion.id, diagnosis.follow_up_id)) {
      return {
        ok: false,
        error: `Diagnosis references follow_up_id '${diagnosis.follow_up_id}' not linked to current question`,
      };
    }

    // Validate diagnosis concept IDs against reviewed concepts
    const conceptCheck = this.contentStore.validateDiagnosisConcepts(diagnosis.concept_ids);
    if (!conceptCheck.ok) {
      return {
        ok: false,
        error: `Diagnosis references unreviewed concept ID: '${conceptCheck.unrecognizedConceptId}'`,
      };
    }

    const nextState: DiagnosisState = {
      status: "diagnosis",
      stage: "feedback",
      sessionId: this.state.sessionId,
      currentQuestionIndex: this.state.currentQuestionIndex,
      currentQuestion: this.state.currentQuestion,
      totalQuestions: this.questions.length,
      isSessionCompleted: false,
      learningEvidence: this.state.learningEvidence,
      shownFollowUpIds: this.state.shownFollowUpIds,
      selectedChoiceId: this.state.selectedChoiceId,
      studentReasoning: this.state.studentReasoning,
      diagnosis,
      clarificationAttemptCount: this.clarificationPolicy.getClarificationCount(this.state.currentQuestion.id),
    };
    this.state = nextState;
    return { ok: true };
  }

  /**
   * Applies a successful Fallback response.
   */
  public applyFallbackResponse(
    submissionId: number,
    fallback: FallbackResult
  ): { ok: boolean; error?: string } {
    if (this.state.status !== "analysis" || this.state.submissionId !== submissionId) {
      return { ok: false, error: "Stale or invalid response state" };
    }

    // Validate follow_up_id is linked to the current question
    if (!this.contentStore.isFollowUpLinkedToQuestion(this.state.currentQuestion.id, fallback.follow_up_id)) {
      return {
        ok: false,
        error: `Fallback references follow_up_id '${fallback.follow_up_id}' not linked to current question`,
      };
    }

    const nextState: FallbackState = {
      status: "fallback",
      stage: "feedback",
      sessionId: this.state.sessionId,
      currentQuestionIndex: this.state.currentQuestionIndex,
      currentQuestion: this.state.currentQuestion,
      totalQuestions: this.questions.length,
      isSessionCompleted: false,
      learningEvidence: this.state.learningEvidence,
      shownFollowUpIds: this.state.shownFollowUpIds,
      selectedChoiceId: this.state.selectedChoiceId,
      studentReasoning: this.state.studentReasoning,
      fallback,
      clarificationAttemptCount: this.clarificationPolicy.getClarificationCount(this.state.currentQuestion.id),
    };
    this.state = nextState;
    return { ok: true };
  }

  /**
   * Applies a recoverable error from submission (preserves student reasoning).
   */
  public applySubmissionError(
    submissionId: number,
    errorMessage: string
  ): boolean {
    if (this.state.status !== "analysis" || this.state.submissionId !== submissionId) {
      return false;
    }

    const nextState: RecoverableErrorState = {
      status: "recoverable_error",
      stage: "reasoning",
      sessionId: this.state.sessionId,
      currentQuestionIndex: this.state.currentQuestionIndex,
      currentQuestion: this.state.currentQuestion,
      totalQuestions: this.questions.length,
      isSessionCompleted: false,
      learningEvidence: this.state.learningEvidence,
      shownFollowUpIds: this.state.shownFollowUpIds,
      selectedChoiceId: this.state.selectedChoiceId,
      studentReasoning: this.state.studentReasoning, // Preserved!
      errorMessage,
      clarificationAttemptCount: this.clarificationPolicy.getClarificationCount(this.state.currentQuestion.id),
    };
    this.state = nextState;
    return true;
  }

  /**
   * Allows student to edit reasoning from clarification or error state.
   */
  public editReasoning(): boolean {
    if (this.state.status !== "clarification" && this.state.status !== "recoverable_error") {
      return false;
    }

    const nextState: ReasoningState = {
      status: "reasoning",
      stage: "reasoning",
      sessionId: this.state.sessionId,
      currentQuestionIndex: this.state.currentQuestionIndex,
      currentQuestion: this.state.currentQuestion,
      totalQuestions: this.questions.length,
      isSessionCompleted: false,
      learningEvidence: this.state.learningEvidence,
      shownFollowUpIds: this.state.shownFollowUpIds,
      selectedChoiceId: this.state.selectedChoiceId,
      studentReasoning: this.state.studentReasoning,
      clarificationAttemptCount: this.state.clarificationAttemptCount,
    };
    this.state = nextState;
    return true;
  }

  /**
   * Starts the follow-up stage from diagnosis or fallback.
   * Tracks which reviewed follow-up was actually shown.
   */
  public startFollowUp(): boolean {
    const followUpId =
      this.state.status === "diagnosis"
        ? this.state.diagnosis.follow_up_id
        : this.state.status === "fallback"
          ? this.state.fallback.follow_up_id
          : null;

    if (!followUpId) {
      return false;
    }

    const followUp = this.contentStore.getFollowUp(followUpId);
    if (!followUp) {
      return false;
    }

    const updatedShown = [...this.state.shownFollowUpIds, followUpId];

    const nextState: FollowUpAnsweringState = {
      status: "follow_up_answering",
      stage: "follow_up",
      sessionId: this.state.sessionId,
      currentQuestionIndex: this.state.currentQuestionIndex,
      currentQuestion: this.state.currentQuestion,
      totalQuestions: this.questions.length,
      isSessionCompleted: false,
      learningEvidence: this.state.learningEvidence,
      shownFollowUpIds: updatedShown,
      activeFollowUp: followUp,
      isExtra: false,
      selectedFollowUpChoiceId: null,
      clarificationAttemptCount: this.clarificationPolicy.getClarificationCount(this.state.currentQuestion.id),
    };
    this.state = nextState;
    return true;
  }

  /**
   * Selects a choice for the active follow-up question.
   * Invalid after follow-up answer has been checked (prevents changing answer).
   */
  public selectFollowUpChoice(choiceId: string): boolean {
    if (this.state.status !== "follow_up_answering") {
      return false;
    }
    const exists = this.state.activeFollowUp.choices.some((c) => c.id === choiceId);
    if (!exists) {
      return false;
    }
    this.state = {
      ...this.state,
      selectedFollowUpChoiceId: choiceId,
    };
    return true;
  }

  /**
   * Checks the follow-up answer locally and provides immediate verified feedback.
   * If wrong on primary follow-up, finds an unused eligible linked example.
   * If no unused linked example exists, unusedLinkedFollowUpId is null (finite termination).
   */
  public checkFollowUpAnswer(): boolean {
    if (this.state.status !== "follow_up_answering" || this.state.selectedFollowUpChoiceId === null) {
      return false;
    }

    const {
      sessionId,
      currentQuestion,
      currentQuestionIndex,
      activeFollowUp,
      isExtra,
      selectedFollowUpChoiceId,
      shownFollowUpIds,
      learningEvidence,
      clarificationAttemptCount,
    } = this.state;

    const isCorrect = selectedFollowUpChoiceId === activeFollowUp.correct_choice_id;

    // Emit follow_up_result learning evidence using activeFollowUp.concept_pair (deduplicated per session)
    const evidenceKey = `${sessionId}:follow_up:${activeFollowUp.id}`;
    let updatedEvidence = learningEvidence;
    if (!this.emittedEvidenceKeys.has(evidenceKey)) {
      this.emittedEvidenceKeys.add(evidenceKey);
      const event: LearningEvidenceEvent = {
        eventId: this.generateEventId(),
        sessionId,
        timestamp: Date.now(),
        kind: "follow_up_result",
        questionId: currentQuestion.id,
        followUpId: activeFollowUp.id,
        isExtra,
        isCorrect,
        conceptPair: [...activeFollowUp.concept_pair],
      };
      updatedEvidence = [...learningEvidence, event];
    }

    // Determine unused eligible linked follow-up if wrong
    let unusedLinkedFollowUpId: string | null = null;
    if (!isCorrect) {
      const unused = this.contentStore.findUnusedLinkedFollowUp(currentQuestion.id, shownFollowUpIds);
      unusedLinkedFollowUpId = unused ? unused.id : null;
    }

    const nextState: FollowUpCheckedState = {
      status: "follow_up_checked",
      stage: "follow_up",
      sessionId,
      currentQuestionIndex,
      currentQuestion,
      totalQuestions: this.questions.length,
      isSessionCompleted: false,
      learningEvidence: updatedEvidence,
      shownFollowUpIds,
      activeFollowUp,
      isExtra,
      selectedFollowUpChoiceId,
      isCorrect,
      verifiedExplanation: activeFollowUp.verified_explanation,
      unusedLinkedFollowUpId,
      clarificationAttemptCount,
    };
    this.state = nextState;
    return true;
  }

  /**
   * Offers and starts the unused extra example follow-up.
   * Finite branch: never repeats the same example as its own extra.
   */
  public tryExtraExample(): boolean {
    if (
      this.state.status !== "follow_up_checked" ||
      this.state.isCorrect ||
      this.state.unusedLinkedFollowUpId === null
    ) {
      return false;
    }

    const extraFollowUp = this.contentStore.getFollowUp(this.state.unusedLinkedFollowUpId);
    if (!extraFollowUp) {
      return false;
    }

    const updatedShown = [...this.state.shownFollowUpIds, extraFollowUp.id];

    const nextState: FollowUpAnsweringState = {
      status: "follow_up_answering",
      stage: "follow_up",
      sessionId: this.state.sessionId,
      currentQuestionIndex: this.state.currentQuestionIndex,
      currentQuestion: this.state.currentQuestion,
      totalQuestions: this.questions.length,
      isSessionCompleted: false,
      learningEvidence: this.state.learningEvidence,
      shownFollowUpIds: updatedShown,
      activeFollowUp: extraFollowUp,
      isExtra: true,
      selectedFollowUpChoiceId: null,
      clarificationAttemptCount: this.state.clarificationAttemptCount,
    };
    this.state = nextState;
    return true;
  }

  /**
   * Advances to the next question or completes the session.
   * Resets clarification attempts for the completed question.
   */
  public advanceToNextQuestion(): boolean {
    if (this.state.status !== "question_correct" && this.state.status !== "follow_up_checked") {
      return false;
    }

    // Reset clarification count for this question
    this.clarificationPolicy.resetQuestion(this.state.currentQuestion.id);

    const nextIndex = this.state.currentQuestionIndex + 1;
    if (nextIndex < this.questions.length) {
      this.state = this.createInitialQuestionState(
        this.state.sessionId,
        nextIndex,
        this.state.learningEvidence
      );
      return true;
    } else {
      const completedState: SessionCompletedState = {
        status: "session_completed",
        stage: "completed",
        sessionId: this.state.sessionId,
        currentQuestionIndex: this.state.currentQuestionIndex,
        currentQuestion: this.state.currentQuestion,
        totalQuestions: this.questions.length,
        isSessionCompleted: true,
        learningEvidence: this.state.learningEvidence,
        shownFollowUpIds: this.state.shownFollowUpIds,
      };
      this.state = completedState;
      return true;
    }
  }

  /**
   * Session-aware reset: invalidates pending submission requests, clears deduplication keys,
   * generates a fresh sessionId, and starts from question 0.
   */
  public resetSession(newSessionId?: string): void {
    this.submissionCounter++; // Invalidates in-flight responses
    this.emittedEvidenceKeys.clear();
    this.clarificationPolicy.resetAll();

    const sessionId = newSessionId ?? this.generateSessionId();
    this.state = this.createInitialQuestionState(sessionId, 0, []);
  }
}
