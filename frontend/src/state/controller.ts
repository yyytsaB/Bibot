import type {
  Question,
} from "shared";
import type { PracticeState } from "./types.ts";
import { PracticeStateMachine } from "./machine.ts";
import { PracticeContentStore } from "./content-store.ts";
import {
  type ClarificationPolicy,
  DefaultClarificationPolicy,
} from "./clarification-policy.ts";
import {
  type IFeedbackApiClient,
  HttpFeedbackApiClient,
} from "../api/client.ts";

export interface PracticeControllerOptions {
  contentStore: PracticeContentStore;
  apiClient?: IFeedbackApiClient;
  clarificationPolicy?: ClarificationPolicy;
  questions?: Question[];
  sessionId?: string;
}

export type StateListener = (state: PracticeState) => void;

export class PracticeController {
  private readonly machine: PracticeStateMachine;
  private readonly apiClient: IFeedbackApiClient;
  private readonly listeners: Set<StateListener> = new Set();
  private abortController: AbortController | null = null;
  private activeSubmissionId: number | null = null;
  private activeQuestionId: string | null = null;
  private activeSessionId: string | null = null;

  constructor(options: PracticeControllerOptions) {
    const policy = options.clarificationPolicy ?? new DefaultClarificationPolicy();
    const questions = options.questions ?? options.contentStore.getQuestions();

    this.machine = new PracticeStateMachine({
      sessionId: options.sessionId,
      questions,
      contentStore: options.contentStore,
      clarificationPolicy: policy,
    });

    this.apiClient = options.apiClient ?? new HttpFeedbackApiClient();
  }

  public getState(): PracticeState {
    return this.machine.getState();
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const currentState = this.machine.getState();
    for (const listener of this.listeners) {
      listener(currentState);
    }
  }

  public selectChoice(choiceId: string): void {
    if (this.machine.selectChoice(choiceId)) {
      this.notify();
    }
  }

  public checkAnswer(): void {
    if (this.machine.checkAnswer()) {
      this.notify();
    }
  }

  public setReasoning(reasoning: string): void {
    if (this.machine.setReasoning(reasoning)) {
      this.notify();
    }
  }

  public editReasoning(): void {
    if (this.machine.editReasoning()) {
      this.notify();
    }
  }

  public async submitReasoning(): Promise<void> {
    const currentState = this.machine.getState();

    // Prevent duplicate submissions if already in analysis
    if (currentState.status === "analysis") {
      return;
    }

    const prep = this.machine.prepareSubmission();
    if (!prep.ok || prep.submissionId === undefined) {
      return;
    }

    const stateAfterPrep = this.machine.getState();
    if (stateAfterPrep.status !== "analysis") {
      return;
    }

    const subId = prep.submissionId;
    const qId = stateAfterPrep.currentQuestion.id;
    const sId = stateAfterPrep.sessionId;
    const choiceId = stateAfterPrep.selectedChoiceId;
    const reasoningText = stateAfterPrep.studentReasoning;

    this.activeSubmissionId = subId;
    this.activeQuestionId = qId;
    this.activeSessionId = sId;

    // Abort any prior in-flight request
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    this.notify(); // Transitioned to AnalysisState

    try {
      const response = await this.apiClient.submitFeedback(
        {
          question_id: qId,
          student_choice_id: choiceId,
          student_reasoning: reasoningText,
        },
        { signal: this.abortController.signal }
      );

      // Stale response guard: verify submission ID, question ID, and session ID
      const latestState = this.machine.getState();
      if (
        this.activeSubmissionId !== subId ||
        this.activeQuestionId !== latestState.currentQuestion.id ||
        this.activeSessionId !== latestState.sessionId ||
        latestState.status !== "analysis"
      ) {
        // Discard stale response
        return;
      }

      if (!response.ok) {
        this.machine.applySubmissionError(subId, response.error);
        this.notify();
        return;
      }

      const result = response.data;
      if (result.kind === "clarification") {
        this.machine.applyClarificationResponse(subId, result.clarification_prompt);
      } else if (result.kind === "diagnosis") {
        const diagApply = this.machine.applyDiagnosisResponse(subId, result);
        if (!diagApply.ok) {
          // Reject invalid references honestly without fabricating fallback
          this.machine.applySubmissionError(subId, diagApply.error ?? "Invalid diagnosis references");
        }
      } else if (result.kind === "fallback") {
        const fallbackApply = this.machine.applyFallbackResponse(subId, result);
        if (!fallbackApply.ok) {
          this.machine.applySubmissionError(subId, fallbackApply.error ?? "Invalid fallback references");
        }
      }

      this.notify();
    } catch (err: unknown) {
      const latestState = this.machine.getState();
      if (
        this.activeSubmissionId !== subId ||
        this.activeQuestionId !== latestState.currentQuestion.id ||
        this.activeSessionId !== latestState.sessionId ||
        latestState.status !== "analysis"
      ) {
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      this.machine.applySubmissionError(subId, message);
      this.notify();
    }
  }

  public startFollowUp(): void {
    if (this.machine.startFollowUp()) {
      this.notify();
    }
  }

  public selectFollowUpChoice(choiceId: string): void {
    if (this.machine.selectFollowUpChoice(choiceId)) {
      this.notify();
    }
  }

  public checkFollowUpAnswer(): void {
    if (this.machine.checkFollowUpAnswer()) {
      this.notify();
    }
  }

  public tryExtraExample(): void {
    if (this.machine.tryExtraExample()) {
      this.notify();
    }
  }

  public advanceToNextQuestion(): void {
    if (this.machine.advanceToNextQuestion()) {
      this.notify();
    }
  }

  /**
   * Internal session reset (rehearsal / new session).
   * Note: This is an internal controller/rehearsal capability and is not exposed as reset UI.
   */
  public resetSession(newSessionId?: string): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.activeSubmissionId = null;
    this.activeQuestionId = null;
    this.activeSessionId = null;

    this.machine.resetSession(newSessionId);
    this.notify();
  }
}
