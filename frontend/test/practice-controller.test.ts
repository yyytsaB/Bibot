import test from "node:test";
import assert from "node:assert/strict";
import type { Question, FollowUp, Concept, FeedbackResult } from "shared";
import { PracticeContentStore } from "../src/state/content-store.ts";
import { PracticeController } from "../src/state/controller.ts";
import {
  type IFeedbackApiClient,
  type FeedbackApiRequest,
  type FeedbackApiResponse,
} from "../src/api/client.ts";
import { DefaultClarificationPolicy } from "../src/state/clarification-policy.ts";
import { getReviewedContentStore } from "../src/state/load-reviewed-content.ts";

function createMockContent(): {
  concepts: Concept[];
  questions: Question[];
  followUps: FollowUp[];
} {
  const concepts: Concept[] = [
    { id: "induction", name: "Induction", definition: "Generalizing from patterns" },
    { id: "deduction", name: "Deduction", definition: "Applying general rules" },
    { id: "abduction", name: "Abduction", definition: "Best plausible explanation" },
  ];

  const followUps: FollowUp[] = [
    {
      id: "q1-p",
      subject_id: "critical-thinking",
      text: "Primary follow-up text for Q1",
      choices: [
        { id: "A", text: "Inductive" },
        { id: "B", text: "Deductive" },
        { id: "C", text: "Abductive" },
      ],
      correct_choice_id: "C",
      concept_ids: ["induction", "abduction"],
      verified_explanation: "Primary explanation",
      follow_up_ids: [],
      concept_pair: ["induction", "abduction"],
    },
    {
      id: "q1-e",
      subject_id: "critical-thinking",
      text: "Extra follow-up text for Q1",
      choices: [
        { id: "A", text: "Inductive" },
        { id: "B", text: "Deductive" },
        { id: "C", text: "Abductive" },
      ],
      correct_choice_id: "C",
      concept_ids: ["induction", "abduction"],
      verified_explanation: "Extra explanation",
      follow_up_ids: [],
      concept_pair: ["induction", "abduction"],
    },
    {
      id: "q2-p",
      subject_id: "critical-thinking",
      text: "Primary follow-up text for Q2",
      choices: [
        { id: "A", text: "Inductive" },
        { id: "B", text: "Deductive" },
        { id: "C", text: "Abductive" },
      ],
      correct_choice_id: "A",
      concept_ids: ["induction", "deduction"],
      verified_explanation: "Primary explanation for Q2",
      follow_up_ids: [],
      concept_pair: ["induction", "deduction"],
    },
  ];

  const questions: Question[] = [
    {
      id: "q1",
      subject_id: "critical-thinking",
      text: "Mika sees a wet floor. What reasoning is used?",
      choices: [
        { id: "A", text: "Inductive" },
        { id: "B", text: "Deductive" },
        { id: "C", text: "Abductive" },
      ],
      correct_choice_id: "C",
      concept_ids: ["induction", "abduction"],
      verified_explanation: "Mika proposes a cause for this puddle.",
      follow_up_ids: ["q1-p", "q1-e"],
    },
    {
      id: "q2",
      subject_id: "critical-thinking",
      text: "Jo observed pattern on 9 of 10 days. What reasoning is used?",
      choices: [
        { id: "A", text: "Inductive" },
        { id: "B", text: "Deductive" },
        { id: "C", text: "Abductive" },
      ],
      correct_choice_id: "A",
      concept_ids: ["induction", "deduction"],
      verified_explanation: "Pattern-based prediction.",
      follow_up_ids: ["q2-p"],
    },
  ];

  return { concepts, questions, followUps };
}

class MockApiClient implements IFeedbackApiClient {
  public callCount = 0;
  public lastRequest: FeedbackApiRequest | null = null;
  public responseDelayMs = 0;
  private queuedResponses: FeedbackApiResponse[] = [];

  public queueResponse(res: FeedbackApiResponse): void {
    this.queuedResponses.push(res);
  }

  public async submitFeedback(
    request: FeedbackApiRequest
  ): Promise<FeedbackApiResponse> {
    this.callCount++;
    this.lastRequest = request;

    if (this.responseDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.responseDelayMs));
    }

    const next = this.queuedResponses.shift();
    if (!next) {
      return { ok: false, error: "Mock client had no queued response" };
    }
    return next;
  }
}

test("PracticeController: correct initial answer invokes zero API calls", async () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const mockApi = new MockApiClient();
  const controller = new PracticeController({ contentStore: store, apiClient: mockApi });

  controller.selectChoice("C");
  controller.checkAnswer();

  assert.equal(controller.getState().status, "question_correct");
  assert.equal(mockApi.callCount, 0, "No API calls should be made for correct answers");
});

test("PracticeController: submits exact fields, prevents duplicates, handles clarification edit/resubmit", async () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const mockApi = new MockApiClient();
  const policy = new DefaultClarificationPolicy();
  const controller = new PracticeController({
    contentStore: store,
    apiClient: mockApi,
    clarificationPolicy: policy,
  });

  // Select wrong choice A
  controller.selectChoice("A");
  controller.checkAnswer();
  controller.setReasoning("I thought this was inductive reasoning.");

  // Queue clarification response
  const clarificationResult: FeedbackResult = {
    kind: "clarification",
    clarification_prompt: "What makes you think this is inductive rather than abductive?",
  };
  mockApi.queueResponse({ ok: true, data: clarificationResult });

  // Submit reasoning
  await controller.submitReasoning();

  // Verify exact fields submitted to API (attempt 0)
  assert.equal(mockApi.callCount, 1);
  assert.deepEqual(mockApi.lastRequest, {
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "I thought this was inductive reasoning.",
    clarification_attempt_count: 0,
  });

  // Verify clarification state reached
  const clarState = controller.getState();
  assert.equal(clarState.status, "clarification");
  if (clarState.status === "clarification") {
    assert.equal(clarState.clarificationPrompt, clarificationResult.clarification_prompt);
    assert.equal(clarState.studentReasoning, "I thought this was inductive reasoning.");
    assert.equal(clarState.clarificationAttemptCount, 1);
  }

  // Edit reasoning and resubmit
  controller.editReasoning();
  assert.equal(controller.getState().status, "reasoning");
  controller.setReasoning("I thought it was inductive because Mika made a hypothesis about what happened.");

  // Queue diagnosis response for second attempt
  const diagnosisResult: FeedbackResult = {
    kind: "diagnosis",
    possible_misconception: "Treated hypothesis formation as induction",
    explanation: "Hypothesis formation for an observation is abduction.",
    concept_ids: ["induction", "abduction"],
    follow_up_id: "q1-p",
    confidence: "high",
  };
  mockApi.queueResponse({ ok: true, data: diagnosisResult });

  await controller.submitReasoning();

  assert.equal(mockApi.callCount, 2);
  assert.deepEqual(mockApi.lastRequest, {
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "I thought it was inductive because Mika made a hypothesis about what happened.",
    clarification_attempt_count: 1,
  });
  const diagState = controller.getState();
  assert.equal(diagState.status, "diagnosis");
  if (diagState.status === "diagnosis") {
    assert.equal(diagState.diagnosis.possible_misconception, diagnosisResult.possible_misconception);
    assert.equal(diagState.diagnosis.follow_up_id, "q1-p");
  }
});

test("PracticeController: rejects diagnosis with unreviewed concepts honestly", async () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const mockApi = new MockApiClient();
  const controller = new PracticeController({ contentStore: store, apiClient: mockApi });

  controller.selectChoice("A");
  controller.checkAnswer();
  controller.setReasoning("Reasoning text");

  // Queue diagnosis with unreviewed concept ID
  mockApi.queueResponse({
    ok: true,
    data: {
      kind: "diagnosis",
      possible_misconception: "Misconception",
      explanation: "Explanation",
      concept_ids: ["unreviewed_invented_concept"],
      follow_up_id: "q1-p",
      confidence: "high",
    },
  });

  await controller.submitReasoning();

  // State must transition to recoverable_error, preserving reasoning, never fabricating fallback
  const state = controller.getState();
  assert.equal(state.status, "recoverable_error");
  if (state.status === "recoverable_error") {
    assert.match(state.errorMessage, /unreviewed concept/i);
    assert.equal(state.studentReasoning, "Reasoning text");
  }
});

test("PracticeController: rejects diagnosis/fallback with unlinked follow_up_id honestly", async () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const mockApi = new MockApiClient();
  const controller = new PracticeController({ contentStore: store, apiClient: mockApi });

  controller.selectChoice("A");
  controller.checkAnswer();
  controller.setReasoning("Reasoning text");

  // Queue diagnosis referencing a follow_up_id not linked to q1
  mockApi.queueResponse({
    ok: true,
    data: {
      kind: "diagnosis",
      possible_misconception: "Misconception",
      explanation: "Explanation",
      concept_ids: ["induction"],
      follow_up_id: "unlinked_follow_up_id",
      confidence: "high",
    },
  });

  await controller.submitReasoning();

  const state = controller.getState();
  assert.equal(state.status, "recoverable_error");
  if (state.status === "recoverable_error") {
    assert.match(state.errorMessage, /not linked to current question/i);
    assert.equal(state.studentReasoning, "Reasoning text");
  }
});

test("PracticeController: handles HTTP 500 / network error honestly without fabricating fallback", async () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const mockApi = new MockApiClient();
  const controller = new PracticeController({ contentStore: store, apiClient: mockApi });

  controller.selectChoice("A");
  controller.checkAnswer();
  controller.setReasoning("My precious reasoning text");

  mockApi.queueResponse({
    ok: false,
    error: "HTTP 500 Internal Server Error: Ollama connection refused",
    statusCode: 500,
  });

  await controller.submitReasoning();

  const state = controller.getState();
  assert.equal(state.status, "recoverable_error");
  if (state.status === "recoverable_error") {
    assert.match(state.errorMessage, /500/);
    // Preserves student reasoning for editing / retry!
    assert.equal(state.studentReasoning, "My precious reasoning text");
  }
});

test("PracticeController: ignores stale responses when question/session changes", async () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const mockApi = new MockApiClient();
  mockApi.responseDelayMs = 20; // Simulated latency
  const controller = new PracticeController({ contentStore: store, apiClient: mockApi });

  controller.selectChoice("A");
  controller.checkAnswer();
  controller.setReasoning("Reasoning text");

  // Queue diagnosis
  mockApi.queueResponse({
    ok: true,
    data: {
      kind: "diagnosis",
      possible_misconception: "Misconception",
      explanation: "Explanation",
      concept_ids: ["induction"],
      follow_up_id: "q1-p",
      confidence: "high",
    },
  });

  // Launch async submission (in-flight)
  const submitPromise = controller.submitReasoning();
  assert.equal(controller.getState().status, "analysis");

  // Student resets session while request is still pending
  controller.resetSession("new-session-id");
  assert.equal(controller.getState().status, "question_answering");
  assert.equal(controller.getState().sessionId, "new-session-id");

  // Wait for late response to return
  await submitPromise;

  // Stale response MUST be ignored: state remains question_answering in new session
  assert.equal(controller.getState().status, "question_answering");
  assert.equal(controller.getState().sessionId, "new-session-id");
});

test("PracticeContentStore loads reviewed C1/F2 data without schema or reference errors", () => {
  const store = getReviewedContentStore();
  const questions = store.getQuestions();
  assert.ok(questions.length >= 6, "Expected at least 6 reviewed questions in production bank");

  // Validate every question links existing follow-ups
  for (const q of questions) {
    assert.ok(q.follow_up_ids.length >= 2, `Question ${q.id} should have at least 2 follow-ups`);
    for (const fId of q.follow_up_ids) {
      const f = store.getFollowUp(fId);
      assert.ok(f, `Follow-up ${fId} linked by ${q.id} must exist in store`);
      assert.equal(store.isFollowUpLinkedToQuestion(q.id, fId), true);
    }
  }

  // Validate all concepts
  assert.equal(store.hasConcept("induction"), true);
  assert.equal(store.hasConcept("deduction"), true);
  assert.equal(store.hasConcept("abduction"), true);
});

test("PracticeController: duplicate submitReasoning while analysis is pending makes exactly one API call and emits one evidence event", async () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);

  let resolveDeferred!: (value: FeedbackApiResponse) => void;
  const deferredPromise = new Promise<FeedbackApiResponse>((resolve) => {
    resolveDeferred = resolve;
  });

  let callCount = 0;
  const mockClient: IFeedbackApiClient = {
    async submitFeedback() {
      callCount++;
      return deferredPromise;
    },
  };

  const controller = new PracticeController({ contentStore: store, apiClient: mockClient });
  controller.selectChoice("B"); // wrong choice for q1
  controller.checkAnswer(); // emits wrong_initial evidence
  controller.setReasoning("I thought it was deductive");

  // Call submitReasoning twice while analysis is pending
  const p1 = controller.submitReasoning();
  const p2 = controller.submitReasoning();

  assert.equal(controller.getState().status, "analysis");
  assert.equal(callCount, 1, "API client must be called exactly once despite duplicate submit calls");

  // Initial-answer evidence was emitted exactly once
  const evidenceBefore = controller.getState().learningEvidence;
  assert.equal(evidenceBefore.length, 1);
  assert.equal(evidenceBefore[0].kind, "wrong_initial");

  // Resolve deferred API response
  resolveDeferred({
    ok: true,
    data: {
      kind: "diagnosis",
      possible_misconception: "Confused deduction with abduction",
      explanation: "Detailed diagnosis text",
      concept_ids: ["induction", "abduction"],
      follow_up_id: "q1-p",
      confidence: "high",
    },
  });

  await Promise.all([p1, p2]);

  assert.equal(controller.getState().status, "diagnosis");
  assert.equal(callCount, 1, "API client callCount remains exactly 1");
  const evidenceAfter = controller.getState().learningEvidence;
  assert.equal(evidenceAfter.length, 1, "Initial-answer evidence event not duplicated");
});

test("PracticeController: exercises successful fallback response end-to-end", async () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const mockClient = new MockApiClient();
  mockClient.queueResponse({
    ok: true,
    data: {
      kind: "fallback",
      verified_explanation: "Let's review this together with a concrete example.",
      follow_up_id: "q1-p",
    },
  });

  const controller = new PracticeController({ contentStore: store, apiClient: mockClient });
  controller.selectChoice("B");
  controller.checkAnswer();
  controller.setReasoning("I am guessing here");
  await controller.submitReasoning();

  // State is now fallback
  const state = controller.getState();
  assert.equal(state.status, "fallback");
  if (state.status === "fallback") {
    assert.equal(state.fallback.verified_explanation, "Let's review this together with a concrete example.");
    assert.equal(state.fallback.follow_up_id, "q1-p");
  }

  // Follow-up flow from fallback
  controller.startFollowUp();
  const followUpState = controller.getState();
  assert.equal(followUpState.status, "follow_up_answering");
  if (followUpState.status === "follow_up_answering") {
    assert.equal(followUpState.activeFollowUp.id, "q1-p");
  }

  controller.selectFollowUpChoice("C"); // correct choice
  controller.checkFollowUpAnswer();
  const checkedState = controller.getState();
  assert.equal(checkedState.status, "follow_up_checked");
  if (checkedState.status === "follow_up_checked") {
    assert.equal(checkedState.isCorrect, true);
  }
});

test("PracticeController: old request resolving after resetSession and newer submission cannot overwrite newer result", async () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);

  let resolveDeferredOld!: (value: FeedbackApiResponse) => void;
  const oldPromise = new Promise<FeedbackApiResponse>((resolve) => {
    resolveDeferredOld = resolve;
  });

  let resolveDeferredNew!: (value: FeedbackApiResponse) => void;
  const newPromise = new Promise<FeedbackApiResponse>((resolve) => {
    resolveDeferredNew = resolve;
  });

  let submissionCount = 0;
  const mockClient: IFeedbackApiClient = {
    async submitFeedback() {
      submissionCount++;
      if (submissionCount === 1) {
        return oldPromise;
      } else {
        return newPromise;
      }
    },
  };

  const controller = new PracticeController({
    contentStore: store,
    apiClient: mockClient,
    sessionId: "session-initial",
  });

  // Start submission 1 in initial session
  controller.selectChoice("B");
  controller.checkAnswer();
  controller.setReasoning("Old reasoning text");
  const sub1Promise = controller.submitReasoning();
  assert.equal(controller.getState().status, "analysis");

  // Reset session and start submission 2 in new session
  controller.resetSession("session-new");
  assert.equal(controller.getState().sessionId, "session-new");
  assert.equal(controller.getState().status, "question_answering");

  controller.selectChoice("B");
  controller.checkAnswer();
  controller.setReasoning("New reasoning text");
  const sub2Promise = controller.submitReasoning();
  assert.equal(controller.getState().status, "analysis");

  // Now OLD submission 1 resolves
  resolveDeferredOld({
    ok: true,
    data: {
      kind: "diagnosis",
      possible_misconception: "Old misconception",
      explanation: "OLD DIAGNOSIS THAT MUST BE DROPPED",
      concept_ids: ["induction", "abduction"],
      follow_up_id: "q1-p",
      confidence: "high",
    },
  });
  await sub1Promise;

  // State must remain in analysis for session-new (not overwritten by old diagnosis)
  assert.equal(controller.getState().status, "analysis");
  assert.equal(controller.getState().sessionId, "session-new");

  // Now NEW submission 2 resolves
  resolveDeferredNew({
    ok: true,
    data: {
      kind: "diagnosis",
      possible_misconception: "New misconception",
      explanation: "NEW LEGITIMATE DIAGNOSIS",
      concept_ids: ["induction", "abduction"],
      follow_up_id: "q1-p",
      confidence: "high",
    },
  });
  await sub2Promise;

  // State is now diagnosis with the new result
  const finalState = controller.getState();
  assert.equal(finalState.status, "diagnosis");
  if (finalState.status === "diagnosis") {
    assert.equal(finalState.diagnosis.explanation, "NEW LEGITIMATE DIAGNOSIS");
  }
});

test("PracticeController: backend selecting extra follow-up first offers primary as unused extra and never repeats", async () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const mockClient = new MockApiClient();
  // Backend returns extra follow-up "q1-e" instead of "q1-p"
  mockClient.queueResponse({
    ok: true,
    data: {
      kind: "diagnosis",
      possible_misconception: "Misconception",
      explanation: "Diagnosis pointing to extra follow-up",
      concept_ids: ["induction", "abduction"],
      follow_up_id: "q1-e",
      confidence: "high",
    },
  });

  const controller = new PracticeController({ contentStore: store, apiClient: mockClient });
  controller.selectChoice("B");
  controller.checkAnswer();
  controller.setReasoning("Reasoning text");
  await controller.submitReasoning();

  controller.startFollowUp();
  const state1 = controller.getState();
  assert.equal(state1.status, "follow_up_answering");
  if (state1.status === "follow_up_answering") {
    assert.equal(state1.activeFollowUp.id, "q1-e");
    assert.deepEqual(state1.shownFollowUpIds, ["q1-e"]);
  }

  // Answer q1-e incorrectly
  controller.selectFollowUpChoice("A"); // wrong choice
  controller.checkFollowUpAnswer();

  const state2 = controller.getState();
  assert.equal(state2.status, "follow_up_checked");
  if (state2.status === "follow_up_checked") {
    assert.equal(state2.isCorrect, false);
    // Unused eligible linked example should be q1-p (never repeating q1-e as its own extra!)
    assert.equal(state2.unusedLinkedFollowUpId, "q1-p");
  }

  // Try extra example -> starts q1-p
  controller.tryExtraExample();
  const state3 = controller.getState();
  assert.equal(state3.status, "follow_up_answering");
  if (state3.status === "follow_up_answering") {
    assert.equal(state3.activeFollowUp.id, "q1-p");
    assert.equal(state3.isExtra, true);
    assert.deepEqual(state3.shownFollowUpIds, ["q1-e", "q1-p"]);
  }

  // Answer q1-p incorrectly as well
  controller.selectFollowUpChoice("A"); // wrong choice
  controller.checkFollowUpAnswer();

  const state4 = controller.getState();
  assert.equal(state4.status, "follow_up_checked");
  if (state4.status === "follow_up_checked") {
    assert.equal(state4.isCorrect, false);
    // Both linked follow-ups have been shown; unusedLinkedFollowUpId must be null!
    assert.equal(state4.unusedLinkedFollowUpId, null);
  }

  // Further tryExtraExample rejected cleanly (finite termination)
  controller.tryExtraExample();
  assert.equal(controller.getState().status, "follow_up_checked");

  // Advance to next question
  controller.advanceToNextQuestion();
  assert.equal(controller.getState().status, "question_answering");
  assert.equal(controller.getState().currentQuestion.id, "q2");
});

test("PracticeController: clarification count resets on question advancement", async () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const policy = new DefaultClarificationPolicy();
  const mockClient = new MockApiClient();

  // Queue clarification 1, clarification 2, then diagnosis for q1
  mockClient.queueResponse({
    ok: true,
    data: { kind: "clarification", clarification_prompt: "Clarify please 1" },
  });
  mockClient.queueResponse({
    ok: true,
    data: { kind: "clarification", clarification_prompt: "Clarify please 2" },
  });
  mockClient.queueResponse({
    ok: true,
    data: {
      kind: "diagnosis",
      possible_misconception: "Misconception",
      explanation: "Diagnosis explanation",
      concept_ids: ["induction", "abduction"],
      follow_up_id: "q1-p",
      confidence: "high",
    },
  });

  const controller = new PracticeController({
    contentStore: store,
    clarificationPolicy: policy,
    apiClient: mockClient,
  });

  // Question 1:
  controller.selectChoice("B");
  controller.checkAnswer();
  controller.setReasoning("Reason 1");
  await controller.submitReasoning();
  assert.equal(policy.getClarificationCount("q1"), 1);

  controller.editReasoning();
  controller.setReasoning("Reason 2");
  await controller.submitReasoning();
  assert.equal(policy.getClarificationCount("q1"), 2);

  controller.editReasoning();
  controller.setReasoning("Reason 3 detailed");
  await controller.submitReasoning();
  assert.equal(controller.getState().status, "diagnosis");

  // Finish follow-up on q1
  controller.startFollowUp();
  controller.selectFollowUpChoice("C"); // correct choice
  controller.checkFollowUpAnswer();
  assert.equal(controller.getState().status, "follow_up_checked");

  // Advance to question 2
  controller.advanceToNextQuestion();
  assert.equal(controller.getState().currentQuestion.id, "q2");

  // Clarification count for q1 must be reset to 0!
  assert.equal(policy.getClarificationCount("q1"), 0);
  assert.equal(policy.getClarificationCount("q2"), 0);

  // If question 2 gets a clarification, its count should be 1
  mockClient.queueResponse({
    ok: true,
    data: { kind: "clarification", clarification_prompt: "Clarify q2 please" },
  });
  controller.selectChoice("B"); // wrong choice for q2
  controller.checkAnswer();
  controller.setReasoning("Reason for q2");
  await controller.submitReasoning();

  assert.equal(controller.getState().status, "clarification");
  assert.equal(policy.getClarificationCount("q2"), 1);
});

test("PracticeController: second unclear returns verified fallback, closing clarification loop", async () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const mockClient = new MockApiClient();
  const policy = new DefaultClarificationPolicy();
  const controller = new PracticeController({
    contentStore: store,
    apiClient: mockClient,
    clarificationPolicy: policy,
  });

  // Select wrong choice A
  controller.selectChoice("A");
  controller.checkAnswer();
  controller.setReasoning("I guessed.");

  // Attempt 1: First unclear -> Clarification response
  mockClient.queueResponse({
    ok: true,
    data: { kind: "clarification", clarification_prompt: "Could you elaborate on your thinking?" },
  });
  await controller.submitReasoning();

  assert.equal(controller.getState().status, "clarification");
  assert.equal(policy.getClarificationCount("q1"), 1);
  assert.equal(mockClient.lastRequest?.clarification_attempt_count, 0);

  // Attempt 2: Still unclear -> Backend fallback response
  controller.editReasoning();
  controller.setReasoning("Still guessing.");
  mockClient.queueResponse({
    ok: true,
    data: {
      kind: "fallback",
      verified_explanation: "Verified explanation for Q1.",
      follow_up_id: "q1-p",
    },
  });
  await controller.submitReasoning();

  // Reaches fallback state, closing clarification loop!
  const finalState = controller.getState();
  assert.equal(finalState.status, "fallback");
  assert.equal(mockClient.lastRequest?.clarification_attempt_count, 1);
  if (finalState.status === "fallback") {
    assert.equal(finalState.fallback.follow_up_id, "q1-p");
  }

  // Can start follow-up directly from fallback
  controller.startFollowUp();
  assert.equal(controller.getState().status, "follow_up_answering");
});

test("PracticeController: network/API error preserves clarification count without penalizing student", async () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const mockClient = new MockApiClient();
  const policy = new DefaultClarificationPolicy();
  const controller = new PracticeController({
    contentStore: store,
    apiClient: mockClient,
    clarificationPolicy: policy,
  });

  controller.selectChoice("A");
  controller.checkAnswer();
  controller.setReasoning("Initial reasoning.");

  // Queue network failure
  mockClient.queueResponse({ ok: false, error: "Network connection lost" });
  await controller.submitReasoning();

  assert.equal(controller.getState().status, "recoverable_error");
  // Counter must remain 0! Errors do not increment student clarification count.
  assert.equal(policy.getClarificationCount("q1"), 0);

  // Student edits reasoning and retries
  controller.editReasoning();
  assert.equal(controller.getState().status, "reasoning");
  mockClient.queueResponse({
    ok: true,
    data: { kind: "clarification", clarification_prompt: "Specific prompt" },
  });
  await controller.submitReasoning();

  // Retry submitted with clarification_attempt_count: 0
  assert.equal(mockClient.lastRequest?.clarification_attempt_count, 0);
  assert.equal(controller.getState().status, "clarification");
  assert.equal(policy.getClarificationCount("q1"), 1);
});

