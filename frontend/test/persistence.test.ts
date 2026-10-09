import test from "node:test";
import assert from "node:assert/strict";
import type { FeedbackResult } from "shared";
import { PracticeController } from "../src/state/controller.ts";
import { PracticeContentStore } from "../src/state/content-store.ts";
import { getReviewedContentStore } from "../src/state/load-reviewed-content.ts";
import { LearningMapStore } from "../src/state/learning-map.ts";
import {
  PracticePersistence, LEARNING_STORAGE_KEY, connectPracticePersistence,
  type LocalStoragePort,
} from "../src/state/persistence.ts";
import type { IFeedbackApiClient } from "../src/api/client.ts";

const content = getReviewedContentStore();

class MemoryStorage implements LocalStoragePort {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const fallback: FeedbackResult = {
  kind: "fallback", follow_up_id: "q1-p", verified_explanation: content.getQuestion("q1")!.verified_explanation,
};
const diagnosis: FeedbackResult = {
  kind: "diagnosis", follow_up_id: "q1-p", concept_ids: ["induction", "abduction"],
  possible_misconception: "Treating every conclusion from an observation as induction.",
  explanation: content.getQuestion("q1")!.verified_explanation, confidence: "medium",
};

function setup(results: FeedbackResult[] = [fallback]) {
  let calls = 0;
  const apiClient: IFeedbackApiClient = {
    submitFeedback: async () => ({ ok: true, data: results[Math.min(calls++, results.length - 1)]! }),
  };
  const controller = new PracticeController({ contentStore: content, apiClient, sessionId: "saved-session" });
  const map = new LearningMapStore(content);
  const storage = new MemoryStorage();
  const persistence = new PracticePersistence({ contentStore: content, storage });
  return { controller, map, storage, persistence, apiClient, calls: () => calls };
}

function wrong(controller: PracticeController) {
  controller.selectChoice("A");
  controller.checkAnswer();
  controller.setReasoning("They observed water and made a conclusion.");
}

function reload(env: ReturnType<typeof setup>) {
  const saved = env.persistence.save(env.controller.getState(), env.map);
  assert.deepEqual(saved, { ok: true });
  const loaded = env.persistence.load();
  assert.equal(loaded.status, "restored");
  if (loaded.status !== "restored") throw new Error("Expected restored data");
  const controller = new PracticeController({
    contentStore: content, apiClient: env.apiClient,
    restored: { checkpoint: loaded.checkpoint, evidence: loaded.map.getEvidence() },
  });
  return { ...env, controller, map: loaded.map };
}

test("F8 empty storage starts clean; saved record contains required fields under one versioned key", () => {
  const env = setup();
  assert.deepEqual(env.persistence.load(), { status: "empty" });
  env.controller.selectChoice("B");
  const restored = reload(env);
  assert.equal(restored.controller.getState().status, "question_answering");
  assert.equal(restored.controller.getState().currentQuestion.id, "q1");
  assert.equal((restored.controller.getState() as { selectedChoiceId: string }).selectedChoiceId, "B");
  assert.deepEqual([...env.storage.values.keys()], [LEARNING_STORAGE_KEY]);
  const stored = JSON.parse(env.storage.getItem(LEARNING_STORAGE_KEY)!);
  assert.equal(stored.version, 1);
  assert.equal(stored.concepts.length, 3);
  assert.deepEqual(stored.confused_pairs, []);
  assert.equal(stored.practice.current_question_id, "q1");
  assert.equal(stored.practice.stage, "question");
  assert.deepEqual(stored.practice.answered_question_ids, []);
  assert.equal(env.calls(), 0);
});

test("F8 correct-answer reload preserves credit once and resumes next-question navigation", () => {
  const env = setup();
  env.controller.selectChoice("C");
  env.controller.checkAnswer();
  const restored = reload(env);
  assert.equal(restored.controller.getState().status, "question_correct");
  assert.deepEqual(restored.map.getSnapshot(), env.map.getSnapshot());
  restored.controller.checkAnswer();
  restored.map.applyEvidence(restored.controller.getState().learningEvidence);
  assert.equal(restored.map.getSnapshot().concepts.find((c) => c.concept_id === "induction")!.consecutive_correct, 1);
  restored.controller.advanceToNextQuestion();
  assert.equal(restored.controller.getState().currentQuestion.id, "q2");
  restored.controller.selectChoice("A");
  restored.controller.checkAnswer();
  const secondReload = reload(restored);
  assert.equal(secondReload.map.getSnapshot().concepts.find((c) => c.concept_id === "induction")!.consecutive_correct, 2);
  assert.equal(env.calls(), 0);
});

test("F8 reasoning and clarification round trips preserve text but never persist attempt counts", async () => {
  const env = setup([{ kind: "clarification", clarification_prompt: "What detail mattered?" }]);
  wrong(env.controller);
  const reasoning = reload(env);
  assert.equal(reasoning.controller.getState().status, "reasoning");
  await env.controller.submitReasoning();
  const before = env.controller.getState();
  assert.equal(before.status, "clarification");
  if (before.status !== "clarification") throw new Error("Expected clarification");
  assert.equal(before.clarificationAttemptCount, 1);
  const restored = reload(env);
  const state = restored.controller.getState();
  assert.equal(state.status, "clarification");
  if (state.status !== "clarification") throw new Error("Expected clarification");
  assert.equal(state.clarificationAttemptCount, 0);
  assert.equal(state.studentReasoning, before.studentReasoning);
  assert.equal(state.clarificationPrompt, before.clarificationPrompt);
  const serialized = env.storage.getItem(LEARNING_STORAGE_KEY)!;
  assert.equal(serialized.includes("clarificationAttemptCount"), false);
  assert.equal(serialized.includes("clarification_attempt_count"), false);
  restored.controller.editReasoning();
  await restored.controller.submitReasoning();
  assert.equal(restored.controller.getState().status, "clarification");
  const twice = reload(restored);
  assert.equal(twice.map.getSnapshot().confused_pairs[0].count, 1);
});

test("F8 interrupted analysis resumes editable reasoning without launching an AI request", async () => {
  const env = setup();
  let finish!: (value: { ok: true; data: FeedbackResult }) => void;
  let calls = 0;
  const controller = new PracticeController({
    contentStore: content, sessionId: "pending-session",
    apiClient: { submitFeedback: () => { calls++; return new Promise((resolve) => { finish = resolve; }); } },
  });
  wrong(controller);
  const pending = controller.submitReasoning();
  assert.equal(controller.getState().status, "analysis");
  const restored = reload({ ...env, controller });
  assert.equal(restored.controller.getState().status, "reasoning");
  assert.equal(calls, 1);
  assert.equal(env.calls(), 0);
  finish({ ok: true, data: fallback });
  await pending;
  assert.equal(restored.controller.getState().status, "reasoning");
});

test("F8 recoverable API failure reloads as reasoning and preserves the student's text", async () => {
  const env = setup();
  const controller = new PracticeController({ contentStore: content, apiClient: {
    submitFeedback: async () => ({ ok: false, error: "Offline" }),
  } });
  wrong(controller);
  await controller.submitReasoning();
  assert.equal(controller.getState().status, "recoverable_error");
  const restored = reload({ ...env, controller });
  const state = restored.controller.getState();
  assert.equal(state.status, "reasoning");
  assert.ok("studentReasoning" in state && state.studentReasoning.includes("observed water"));
  assert.equal("errorMessage" in state, false);
});

test("F8 diagnosis and fallback retain separate validated feedback branches after reload", async () => {
  for (const result of [diagnosis, fallback]) {
    const env = setup([result]);
    wrong(env.controller);
    await env.controller.submitReasoning();
    const restored = reload(env);
    const state = restored.controller.getState();
    assert.equal(state.status, result.kind);
    if (state.status === "fallback") {
      assert.equal("diagnosis" in state, false);
      assert.equal("possible_misconception" in state.fallback, false);
    }
    restored.controller.startFollowUp();
    assert.equal(restored.controller.getState().status, "follow_up_answering");
  }
});

test("F8 follow-up selection, checked answers, and extra examples resume without duplicate credit", async () => {
  const env = setup();
  wrong(env.controller);
  await env.controller.submitReasoning();
  env.controller.startFollowUp();
  env.controller.selectFollowUpChoice("A");
  const answering = reload(env);
  const state = answering.controller.getState();
  assert.equal(state.status, "follow_up_answering");
  if (state.status !== "follow_up_answering") throw new Error("Expected follow-up");
  assert.equal(state.selectedFollowUpChoiceId, "A");
  answering.controller.checkFollowUpAnswer();
  const checked = reload(answering);
  assert.equal(checked.controller.getState().status, "follow_up_checked");
  assert.equal(checked.map.getSnapshot().confused_pairs[0].count, 2);
  checked.controller.checkFollowUpAnswer();
  checked.controller.tryExtraExample();
  const extra = reload(checked);
  const extraState = extra.controller.getState();
  assert.equal(extraState.status, "follow_up_answering");
  if (extraState.status !== "follow_up_answering") throw new Error("Expected extra follow-up");
  assert.equal(extraState.activeFollowUp.id, "q1-e");
  assert.equal(extraState.isExtra, true);
  extra.controller.selectFollowUpChoice("C");
  extra.controller.checkFollowUpAnswer();
  const correct = reload(extra);
  assert.equal(correct.map.getSnapshot().concepts.find((c) => c.concept_id === "abduction")!.consecutive_correct, 1);
  correct.controller.advanceToNextQuestion();
  assert.equal(correct.controller.getState().currentQuestion.id, "q2");
});

test("F8 completed sessions restore as completed with all answered IDs and no model calls", () => {
  const env = setup();
  for (const question of content.getQuestions()) {
    env.controller.selectChoice(question.correct_choice_id);
    env.controller.checkAnswer();
    env.controller.advanceToNextQuestion();
  }
  assert.equal(env.controller.getState().status, "session_completed");
  const restored = reload(env);
  assert.equal(restored.controller.getState().status, "session_completed");
  assert.equal(restored.controller.getState().learningEvidence.length, 6);
  assert.equal(env.calls(), 0);
});

test("F8 prior session learning survives a fresh session and restored event replay", () => {
  const env = setup();
  env.controller.selectChoice("C");
  env.controller.checkAnswer();
  env.map.applyEvidence(env.controller.getState().learningEvidence);
  env.controller.resetSession("new-session");
  env.controller.selectChoice("C");
  env.controller.checkAnswer();
  const restored = reload(env);
  assert.equal(restored.map.getEvidence().length, 2);
  assert.equal(restored.controller.getState().learningEvidence.length, 1);
  assert.equal(restored.map.getSnapshot().concepts.find((c) => c.concept_id === "induction")!.consecutive_correct, 2);
  restored.map.applyEvidence(restored.controller.getState().learningEvidence);
  assert.equal(restored.map.getSnapshot().concepts.find((c) => c.concept_id === "induction")!.consecutive_correct, 2);
});

test("F8 malformed, incompatible, inconsistent, and unreviewed saved records fail safely", () => {
  const env = setup();
  wrong(env.controller);
  reload(env);
  const valid = env.storage.getItem(LEARNING_STORAGE_KEY)!;
  const mutations: ((data: ReturnType<typeof JSON.parse>) => void)[] = [
    (data) => { data.version = 2; },
    (data) => { data.content_revision = "changed"; },
    (data) => { data.concepts[0].consecutive_correct = 99; },
    (data) => { data.confused_pairs[0].count = 99; },
    (data) => { data.practice.current_question_id = "missing"; },
    (data) => {
      data.practice.current_question_id = "q2";
      data.practice.status = "question_answering";
      data.practice.stage = "question";
      data.practice.selected_choice_id = null;
    },
    (data) => { data.practice.selected_choice_id = "missing"; },
    (data) => { data.practice.stage = "completed"; },
    (data) => { data.practice.status = "session_completed"; data.practice.stage = "completed"; },
    (data) => { data.practice.answered_question_ids = []; },
    (data) => { data.practice.question_ids.reverse(); },
    (data) => { data.practice.shown_follow_up_ids = ["q6-p"]; },
    (data) => { data.learning_evidence[0].conceptIds = ["invented", "abduction"]; },
    (data) => { data.learning_evidence.push(data.learning_evidence[0]); },
    (data) => { data.learning_evidence[0].timestamp = "not-a-time"; },
  ];
  for (const mutate of mutations) {
    const changed = JSON.parse(valid);
    mutate(changed);
    env.storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(changed));
    const result = env.persistence.load();
    assert.equal(result.status, "invalid");
  }
  for (const bad of ["{", "null", "[]", "42"]) {
    env.storage.setItem(LEARNING_STORAGE_KEY, bad);
    assert.equal(env.persistence.load().status, "invalid");
  }
  env.storage.setItem(LEARNING_STORAGE_KEY, valid);
  assert.equal(env.persistence.load().status, "restored");
});

test("F8 reload rejects invalid feedback references and altered verified fallback text", async () => {
  const env = setup();
  wrong(env.controller);
  await env.controller.submitReasoning();
  reload(env);
  const valid = env.storage.getItem(LEARNING_STORAGE_KEY)!;
  for (const patch of [
    { follow_up_id: "q6-p" },
    { verified_explanation: "Unreviewed explanation" },
  ]) {
    const data = JSON.parse(valid);
    Object.assign(data.practice.feedback, patch);
    env.storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(data));
    assert.equal(env.persistence.load().status, "invalid");
  }
});

test("F8 changed reviewed content invalidates an old save instead of restoring stale answers", () => {
  const env = setup();
  reload(env);
  const questions = structuredClone(content.getQuestions());
  questions[0].verified_explanation += " Updated.";
  const changed = new PracticeContentStore({
    concepts: ["induction", "deduction", "abduction"].map((id) => content.getConcept(id)!),
    questions,
    followUps: [...new Set(questions.flatMap((q) => q.follow_up_ids))].map((id) => content.getFollowUp(id)!),
  });
  const persistence = new PracticePersistence({ contentStore: changed, storage: env.storage });
  assert.equal(persistence.load().status, "invalid");
});

test("F8 unavailable storage and quota errors do not break in-memory practice", () => {
  const env = setup();
  const persistence = new PracticePersistence({ contentStore: content, storage: {
    getItem: () => { throw new Error("Storage blocked"); },
    setItem: () => { throw new Error("Quota exceeded"); },
  } });
  assert.equal(persistence.load().status, "unavailable");
  wrong(env.controller);
  const state = env.controller.getState();
  const result = persistence.save(state, env.map);
  assert.equal(result.ok, false);
  assert.equal(env.controller.getState(), state);
  assert.equal(env.map.getSnapshot().confused_pairs[0].count, 1);
  assert.equal(persistence.save(state, env.map).ok, false);
  assert.equal(env.map.getSnapshot().confused_pairs[0].count, 1);
});

test("F8 persistence subscription saves current/future state and disconnects cleanly", () => {
  const env = setup();
  const outcomes: boolean[] = [];
  const disconnect = connectPracticePersistence(env.controller, env.map, env.persistence, (result) => outcomes.push(result.ok));
  assert.equal(env.persistence.load().status, "restored");
  env.controller.selectChoice("A");
  env.controller.checkAnswer();
  const saved = env.persistence.load();
  assert.equal(saved.status, "restored");
  assert.ok(outcomes.every(Boolean));
  disconnect();
  const before = env.storage.getItem(LEARNING_STORAGE_KEY);
  env.controller.setReasoning("This should not be saved after disconnect.");
  assert.equal(env.storage.getItem(LEARNING_STORAGE_KEY), before);
});
