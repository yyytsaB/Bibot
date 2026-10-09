import { FeedbackResultSchema, type FeedbackResult, type Question } from "shared";
import type { PracticeContentStore } from "./content-store.ts";
import { LearningMapStore } from "./learning-map.ts";
import type { LearningEvidenceEvent, PracticeState, PracticeStage } from "./types.ts";

export const LEARNING_STORAGE_KEY = "mm_state_v1";

type DurableStatus = Exclude<PracticeState["status"], "analysis" | "recoverable_error">;

export interface PracticeCheckpoint {
  session_id: string;
  question_ids: string[];
  current_question_id: string;
  status: DurableStatus;
  stage: PracticeStage;
  answered_question_ids: string[];
  shown_follow_up_ids: string[];
  selected_choice_id: string | null;
  student_reasoning?: string;
  clarification_prompt?: string;
  feedback?: FeedbackResult;
  active_follow_up_id?: string;
  selected_follow_up_choice_id?: string | null;
}

export interface LocalStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type PersistenceResult = { ok: true } | { ok: false; error: string };
export type PersistenceLoadResult =
  | { status: "empty" }
  | { status: "restored"; checkpoint: PracticeCheckpoint; map: LearningMapStore }
  | { status: "unavailable" | "invalid"; error: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected stored object");
  return value as Record<string, unknown>;
}

function text(value: unknown, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new Error("Invalid stored string");
  return value;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Expected stored string array");
  const parsed = value.map((item) => text(item));
  if (new Set(parsed).size !== parsed.length) throw new Error("Duplicate stored references");
  return parsed;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid stored boolean");
  return value;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseEvidence(raw: unknown): LearningEvidenceEvent {
  const item = object(raw);
  const base = {
    eventId: text(item.eventId), sessionId: text(item.sessionId), questionId: text(item.questionId),
    timestamp: item.timestamp,
  };
  if (typeof base.timestamp !== "number" || !Number.isFinite(base.timestamp) || base.timestamp < 0) {
    throw new Error("Invalid evidence timestamp");
  }
  const common = { ...base, timestamp: base.timestamp };
  if (item.kind === "correct_first_try") {
    return { ...common, kind: item.kind, conceptIds: strings(item.conceptIds) };
  }
  if (item.kind === "wrong_initial") {
    return { ...common, kind: item.kind, conceptIds: strings(item.conceptIds), selectedChoiceId: text(item.selectedChoiceId) };
  }
  if (item.kind === "follow_up_result") {
    const pair = strings(item.conceptPair);
    if (pair.length !== 2) throw new Error("Invalid evidence concept pair");
    return {
      ...common, kind: item.kind, followUpId: text(item.followUpId),
      conceptPair: [pair[0]!, pair[1]!], isCorrect: boolean(item.isCorrect), isExtra: boolean(item.isExtra),
    };
  }
  throw new Error("Unknown evidence kind");
}

/** Content revision comparison prevents restoring stale explanations or answer keys. */
function contentRevision(content: PracticeContentStore): string {
  const questions = content.getQuestions();
  const conceptIds = [...new Set(questions.flatMap((question) => question.concept_ids))].sort();
  const followUpIds = [...new Set(questions.flatMap((question) => question.follow_up_ids))].sort();
  return JSON.stringify({
    concepts: conceptIds.map((id) => content.getConcept(id)), questions,
    followUps: followUpIds.map((id) => content.getFollowUp(id)),
  });
}

export function createPracticeCheckpoint(state: PracticeState, questions: readonly Question[]): PracticeCheckpoint {
  const interrupted = state.status === "analysis" || state.status === "recoverable_error";
  const checkpoint: PracticeCheckpoint = {
    session_id: state.sessionId,
    question_ids: questions.map((question) => question.id),
    current_question_id: state.currentQuestion.id,
    status: interrupted ? "reasoning" : state.status as DurableStatus,
    stage: interrupted ? "reasoning" : state.stage,
    answered_question_ids: state.learningEvidence
      .filter((event) => event.kind !== "follow_up_result").map((event) => event.questionId),
    shown_follow_up_ids: [...state.shownFollowUpIds],
    selected_choice_id: "selectedChoiceId" in state ? state.selectedChoiceId : null,
  };
  if ("studentReasoning" in state) checkpoint.student_reasoning = state.studentReasoning;
  if (state.status === "clarification") checkpoint.clarification_prompt = state.clarificationPrompt;
  if (state.status === "diagnosis") checkpoint.feedback = structuredClone(state.diagnosis);
  if (state.status === "fallback") checkpoint.feedback = structuredClone(state.fallback);
  if (state.status === "follow_up_answering" || state.status === "follow_up_checked") {
    checkpoint.active_follow_up_id = state.activeFollowUp.id;
    checkpoint.selected_follow_up_choice_id = state.selectedFollowUpChoiceId;
  }
  return checkpoint;
}

/** Validate and rebuild state from IDs; never restore copied questions, definitions, or counters. */
export function restorePracticeCheckpoint(
  raw: unknown,
  evidence: readonly LearningEvidenceEvent[],
  content: PracticeContentStore,
  questions: readonly Question[],
): PracticeState {
  const item = object(raw);
  const questionIds = strings(item.question_ids);
  if (!same(questionIds, questions.map((question) => question.id))) throw new Error("Saved question order has changed");
  const sessionId = text(item.session_id);
  const questionId = text(item.current_question_id);
  const currentQuestionIndex = questions.findIndex((question) => question.id === questionId);
  const currentQuestion = questions[currentQuestionIndex];
  if (!currentQuestion) throw new Error("Unknown saved question");
  const sessionEvidence = evidence.filter((event) => event.sessionId === sessionId);
  const initials = sessionEvidence.filter((event) => event.kind !== "follow_up_result");
  const answeredIds = strings(item.answered_question_ids);
  if (!same(answeredIds, initials.map((event) => event.questionId))) throw new Error("Saved answered questions disagree with evidence");
  for (let i = 0; i < currentQuestionIndex; i++) {
    const previousId = questions[i]!.id;
    const previous = initials.find((event) => event.questionId === previousId);
    if (!previous) throw new Error("Saved session skips unanswered questions");
    if (previous.kind === "wrong_initial" && !sessionEvidence.some((event) =>
      event.kind === "follow_up_result" && event.questionId === previousId)) {
      throw new Error("Saved session skips a required follow-up");
    }
  }
  for (const event of sessionEvidence) {
    const index = questionIds.indexOf(event.questionId);
    if (index < 0 || index > currentQuestionIndex) throw new Error("Evidence outside saved session position");
  }
  const initial = initials.find((event) => event.questionId === questionId);
  const shown = strings(item.shown_follow_up_ids);
  for (const id of shown) {
    if (!content.isFollowUpLinkedToQuestion(questionId, id)) throw new Error("Unknown or ineligible shown follow-up");
  }
  const currentFollowUps = sessionEvidence.filter((event) => event.kind === "follow_up_result" && event.questionId === questionId);
  if (currentFollowUps.some((event) => event.kind === "follow_up_result" && !shown.includes(event.followUpId))) {
    throw new Error("Follow-up evidence references an example not shown");
  }
  for (const id of shown.slice(0, -1)) {
    const previous = currentFollowUps.find((event) => event.kind === "follow_up_result" && event.followUpId === id);
    if (previous?.kind !== "follow_up_result" || previous.isCorrect) {
      throw new Error("Extra example must follow an incorrect checked follow-up");
    }
  }
  const base = {
    sessionId, currentQuestionIndex, currentQuestion, totalQuestions: questions.length,
    isSessionCompleted: false, learningEvidence: structuredClone(sessionEvidence), shownFollowUpIds: shown,
  };
  const requireStage = (stage: PracticeStage) => {
    if (item.stage !== stage) throw new Error("Saved stage does not match status");
  };
  const choice = (value: unknown, nullable = false) => {
    if (nullable && value === null) return null;
    const id = text(value);
    if (!currentQuestion.choices.some((candidate) => candidate.id === id)) throw new Error("Unknown saved choice");
    return id;
  };
  if (item.status === "session_completed") {
    requireStage("completed");
    if (currentQuestionIndex !== questions.length - 1 || answeredIds.length !== questions.length) {
      throw new Error("Incomplete session cannot restore as completed");
    }
    if (initial?.kind === "wrong_initial" && !currentFollowUps.some((event) =>
      event.kind === "follow_up_result" && event.followUpId === shown.at(-1))) {
      throw new Error("Completed session requires a checked final follow-up");
    }
    return { ...base, status: "session_completed", stage: "completed", isSessionCompleted: true };
  }
  if (item.status === "question_answering") {
    requireStage("question");
    if (initial || shown.length) throw new Error("Answered question cannot restore as unanswered");
    return { ...base, status: "question_answering", stage: "question", selectedChoiceId: choice(item.selected_choice_id, true) };
  }
  if (item.status === "question_correct") {
    requireStage("question");
    const selectedChoiceId = choice(item.selected_choice_id)!;
    if (initial?.kind !== "correct_first_try" || selectedChoiceId !== currentQuestion.correct_choice_id || shown.length) {
      throw new Error("Saved correct-answer state disagrees with reviewed evidence");
    }
    return { ...base, status: "question_correct", stage: "question", selectedChoiceId, verifiedExplanation: currentQuestion.verified_explanation };
  }
  if (initial?.kind !== "wrong_initial") throw new Error("Saved branch requires a wrong initial answer");
  const transient = { clarificationAttemptCount: 0 };
  if (item.status === "follow_up_answering" || item.status === "follow_up_checked") {
    requireStage("follow_up");
    const followUpId = text(item.active_follow_up_id);
    const follow = content.getFollowUp(followUpId);
    if (!follow || !content.isFollowUpLinkedToQuestion(questionId, followUpId) || shown.at(-1) !== followUpId) {
      throw new Error("Saved active follow-up is ineligible or was not shown last");
    }
    const value = item.selected_follow_up_choice_id;
    const selected = value === null ? null : text(value);
    if (selected !== null && !follow.choices.some((candidate) => candidate.id === selected)) throw new Error("Unknown follow-up choice");
    const followEvidence = sessionEvidence.find((event) => event.kind === "follow_up_result" && event.followUpId === followUpId);
    const common = { ...base, ...transient, activeFollowUp: follow, isExtra: shown.length > 1 };
    if (item.status === "follow_up_answering") {
      if (followEvidence) throw new Error("Answered follow-up cannot restore as unanswered");
      return { ...common, status: "follow_up_answering", stage: "follow_up", selectedFollowUpChoiceId: selected };
    }
    const isCorrect = selected === follow.correct_choice_id;
    if (selected === null || followEvidence?.kind !== "follow_up_result" || followEvidence.isCorrect !== isCorrect) {
      throw new Error("Saved follow-up correctness disagrees with reviewed evidence");
    }
    return {
      ...common, status: "follow_up_checked", stage: "follow_up", selectedFollowUpChoiceId: selected,
      isCorrect, verifiedExplanation: follow.verified_explanation,
      unusedLinkedFollowUpId: isCorrect ? null : content.findUnusedLinkedFollowUp(questionId, shown)?.id ?? null,
    };
  }
  if (shown.length) throw new Error("Pre-follow-up stage contains shown follow-ups");
  const selectedChoiceId = choice(item.selected_choice_id)!;
  if (selectedChoiceId !== initial.selectedChoiceId) throw new Error("Saved wrong choice disagrees with evidence");
  const reasoning = text(item.student_reasoning, true);
  const reasoningBase = { ...base, ...transient, selectedChoiceId, studentReasoning: reasoning };
  if (item.status === "reasoning") {
    requireStage("reasoning");
    return { ...reasoningBase, status: "reasoning", stage: "reasoning" };
  }
  requireStage("feedback");
  if (item.status === "clarification") {
    return { ...reasoningBase, status: "clarification", stage: "feedback", clarificationPrompt: text(item.clarification_prompt) };
  }
  const feedback = FeedbackResultSchema.parse(item.feedback);
  if (feedback.kind !== item.status || feedback.kind === "clarification" || !content.isFollowUpLinkedToQuestion(questionId, feedback.follow_up_id)) {
    throw new Error("Invalid saved feedback branch or follow-up reference");
  }
  if (feedback.kind === "diagnosis") {
    if (!content.validateDiagnosisConcepts(feedback.concept_ids).ok) throw new Error("Unreviewed saved diagnosis concept");
    return { ...reasoningBase, status: "diagnosis", stage: "feedback", diagnosis: feedback };
  }
  if (feedback.verified_explanation !== currentQuestion.verified_explanation) throw new Error("Saved fallback explanation is not verified");
  return { ...reasoningBase, status: "fallback", stage: "feedback", fallback: feedback };
}

export class PracticePersistence {
  private readonly content: PracticeContentStore;
  private readonly questions: Question[];
  private readonly storageProvider: () => LocalStoragePort;

  constructor(options: { contentStore: PracticeContentStore; questions?: Question[]; storage?: LocalStoragePort }) {
    this.content = options.contentStore;
    this.questions = options.questions ?? this.content.getQuestions();
    // Accessing localStorage itself can throw in browsers; keep access inside load/save guards.
    this.storageProvider = options.storage ? () => options.storage! : () => globalThis.localStorage;
  }

  public load(): PersistenceLoadResult {
    let serialized: string | null;
    try {
      serialized = this.storageProvider().getItem(LEARNING_STORAGE_KEY);
    } catch (error) {
      return { status: "unavailable", error: errorText(error) };
    }
    if (serialized === null) return { status: "empty" };
    try {
      const data = object(JSON.parse(serialized));
      if (data.version !== 1 || data.content_revision !== contentRevision(this.content)) throw new Error("Unsupported version or changed reviewed content");
      if (!Array.isArray(data.learning_evidence)) throw new Error("Missing saved learning evidence");
      const evidence = data.learning_evidence.map(parseEvidence);
      const map = new LearningMapStore(this.content);
      const initialEvents = new Map<string, LearningEvidenceEvent>();
      for (const event of evidence) {
        const key = JSON.stringify([event.sessionId, event.questionId]);
        if (event.kind === "follow_up_result") {
          if (initialEvents.get(key)?.kind !== "wrong_initial") throw new Error("Follow-up evidence has no preceding wrong initial answer");
        } else {
          initialEvents.set(key, event);
        }
        if (!map.applyEvent(event)) throw new Error("Duplicate saved learning evidence");
      }
      const snapshot = map.getSnapshot();
      if (!same(data.concepts, snapshot.concepts) || !same(data.confused_pairs, snapshot.confused_pairs)) {
        throw new Error("Saved learning state disagrees with validated evidence");
      }
      const state = restorePracticeCheckpoint(data.practice, evidence, this.content, this.questions);
      return { status: "restored", checkpoint: createPracticeCheckpoint(state, this.questions), map };
    } catch (error) {
      return { status: "invalid", error: errorText(error) };
    }
  }

  public save(state: PracticeState, map: LearningMapStore): PersistenceResult {
    try {
      map.applyEvidence(state.learningEvidence);
      const snapshot = map.getSnapshot();
      const checkpoint = createPracticeCheckpoint(state, this.questions);
      restorePracticeCheckpoint(checkpoint, map.getEvidence(), this.content, this.questions);
      this.storageProvider().setItem(LEARNING_STORAGE_KEY, JSON.stringify({
        version: 1, content_revision: contentRevision(this.content), concepts: snapshot.concepts,
        confused_pairs: snapshot.confused_pairs, learning_evidence: map.getEvidence(), practice: checkpoint,
      }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorText(error) };
    }
  }
}

/** Optional F9/F11 integration seam: saves current state and future notifications without UI work. */
export function connectPracticePersistence(
  source: { getState(): PracticeState; subscribe(listener: (state: PracticeState) => void): () => void },
  map: LearningMapStore,
  persistence: PracticePersistence,
  onResult?: (result: PersistenceResult) => void,
): () => void {
  const save = (state: PracticeState) => { const result = persistence.save(state, map); onResult?.(result); };
  const disconnect = source.subscribe(save);
  save(source.getState());
  return disconnect;
}
