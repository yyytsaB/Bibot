import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FeedbackPipeline,
  resolveDistinction,
  repairFollowUp,
  QuestionNotFoundError,
  InvalidChoiceError,
  FallbackVerificationError,
} from "../src/pipeline.js";
import { MockOllamaTransport } from "./support/mock-transport.js";
import { getQuestion, getLinkedFollowUps, loadContent } from "../src/content.js";
import { createApp } from "../src/server.js";
import { type FollowUp, type Question } from "shared";

// Ensure content is loaded
loadContent();
const q1 = getQuestion("q1")!;
const linkedQ1 = getLinkedFollowUps(q1);

test("resolveDistinction resolves 2-element concept pair", () => {
  const result = resolveDistinction(["induction", "abduction"], linkedQ1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.pair, ["induction", "abduction"]);
});

test("resolveDistinction resolves singleton concept when unique candidate pair exists", () => {
  const result = resolveDistinction(["abduction"], linkedQ1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.pair, ["induction", "abduction"]);
});

test("resolveDistinction reports error for ambiguous singleton with multiple candidate pairs", () => {
  const mockFollowUps: FollowUp[] = [
    {
      id: "f1",
      subject_id: "critical-thinking",
      text: "F1",
      choices: [{ id: "A", text: "A" }, { id: "B", text: "B" }, { id: "C", text: "C" }],
      correct_choice_id: "A",
      concept_ids: ["induction", "abduction"],
      verified_explanation: "E1",
      follow_up_ids: [],
      concept_pair: ["induction", "abduction"],
    },
    {
      id: "f2",
      subject_id: "critical-thinking",
      text: "F2",
      choices: [{ id: "A", text: "A" }, { id: "B", text: "B" }, { id: "C", text: "C" }],
      correct_choice_id: "A",
      concept_ids: ["induction", "deduction"],
      verified_explanation: "E2",
      follow_up_ids: [],
      concept_pair: ["induction", "deduction"],
    },
  ];

  const result = resolveDistinction(["induction"], mockFollowUps);
  assert.equal(result.ok, false);
  assert.ok(result.error?.includes("Ambiguous distinction: multiple candidate pairs"));
});

test("resolveDistinction resolves larger array when single linked pair is identified", () => {
  const result = resolveDistinction(["induction", "abduction", "deduction"], linkedQ1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.pair, ["induction", "abduction"]);
});

test("resolveDistinction reports error for ambiguous larger array matching multiple pairs", () => {
  const mockFollowUps: FollowUp[] = [
    {
      id: "f1",
      subject_id: "critical-thinking",
      text: "F1",
      choices: [{ id: "A", text: "A" }, { id: "B", text: "B" }, { id: "C", text: "C" }],
      correct_choice_id: "A",
      concept_ids: ["induction", "abduction"],
      verified_explanation: "E1",
      follow_up_ids: [],
      concept_pair: ["induction", "abduction"],
    },
    {
      id: "f2",
      subject_id: "critical-thinking",
      text: "F2",
      choices: [{ id: "A", text: "A" }, { id: "B", text: "B" }, { id: "C", text: "C" }],
      correct_choice_id: "A",
      concept_ids: ["induction", "deduction"],
      verified_explanation: "E2",
      follow_up_ids: [],
      concept_pair: ["induction", "deduction"],
    },
  ];

  const result = resolveDistinction(["induction", "abduction", "deduction"], mockFollowUps);
  assert.equal(result.ok, false);
  assert.ok(result.error?.includes("Ambiguous distinction"));
});

test("repairFollowUp keeps valid and eligible supplied ID", () => {
  const result = repairFollowUp(q1, linkedQ1, ["induction", "abduction"], "q1-e");
  assert.equal(result.ok, true);
  assert.equal(result.follow_up_id, "q1-e");
});

test("repairFollowUp replaces null follow_up_id with primary reviewed follow-up", () => {
  const result = repairFollowUp(q1, linkedQ1, ["induction", "abduction"], null);
  assert.equal(result.ok, true);
  assert.equal(result.follow_up_id, "q1-p");
});

test("repairFollowUp replaces ineligible follow_up_id with primary reviewed follow-up", () => {
  const result = repairFollowUp(q1, linkedQ1, ["induction", "abduction"], "unlinked-id");
  assert.equal(result.ok, true);
  assert.equal(result.follow_up_id, "q1-p");
});

test("FeedbackPipeline produces diagnosis on valid first-try response", async () => {
  const validDiagnosisResponse = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Confuses inductive pattern prediction with abductive explanation",
    explanation: "The student treated a single observed puddle as a repeated statistical pattern.",
    concept_ids: ["induction", "abduction"],
    follow_up_id: "q1-p",
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "high",
  });

  const mock = new MockOllamaTransport([validDiagnosisResponse]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Because it is an induction from observations.",
  });

  assert.equal(result.kind, "diagnosis");
  assert.equal(result.follow_up_id, "q1-p");
  assert.equal(result.confidence, "high");
  assert.equal(mock.calls.length, 1);
});

test("FeedbackPipeline produces clarification on valid needs_clarification response", async () => {
  const validClarificationResponse = JSON.stringify({
    status: "needs_clarification",
    possible_misconception: null,
    explanation: "",
    concept_ids: [],
    follow_up_id: null,
    needs_clarification: true,
    clarification_prompt: "Can you explain what led you to conclude this was deductive?",
    confidence: "low",
  });

  const mock = new MockOllamaTransport([validClarificationResponse]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "B",
    student_reasoning: "The observation could be interpreted as multiple kinds of reasoning.",
  });

  assert.equal(result.kind, "clarification");
  assert.equal(
    result.clarification_prompt,
    "Can you explain what led you to conclude this was deductive?"
  );
  assert.equal(mock.calls.length, 1);
});

test("FeedbackPipeline repairs null follow_up_id to primary reviewed follow-up", async () => {
  const diagnosisWithNullFollowUp = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Confuses abductive inference with inductive reasoning",
    explanation: "The student mistook an explanation of an event for pattern reasoning.",
    concept_ids: ["induction", "abduction"],
    follow_up_id: null,
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "medium",
  });

  const mock = new MockOllamaTransport([diagnosisWithNullFollowUp]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Observation indicates a pattern.",
  });

  assert.equal(result.kind, "diagnosis");
  assert.equal(result.follow_up_id, "q1-p");
  assert.equal(mock.calls.length, 1);
});

test("FeedbackPipeline repairs singleton concept_ids to matching distinction and primary follow-up", async () => {
  const diagnosisWithSingleton = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Confuses abduction with induction",
    explanation: "Student overlooked that this is an abductive explanation.",
    concept_ids: ["abduction"],
    follow_up_id: null,
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "high",
  });

  const mock = new MockOllamaTransport([diagnosisWithSingleton]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Mika is seeking the best explanation for the wet floor, which is abduction.",
  });

  assert.equal(result.kind, "diagnosis");
  assert.equal(result.follow_up_id, "q1-p");
  assert.equal(mock.calls.length, 1);
});

test("FeedbackPipeline resolves larger concept_ids array matching single linked distinction", async () => {
  const diagnosisWithLargerArray = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Confuses abduction with induction",
    explanation: "Student compared all concepts but the distinction is induction vs abduction.",
    concept_ids: ["induction", "abduction", "deduction"],
    follow_up_id: null,
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "medium",
  });

  const mock = new MockOllamaTransport([diagnosisWithLargerArray]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Thinking about induction, deduction, and abduction.",
  });

  assert.equal(result.kind, "diagnosis");
  assert.equal(result.follow_up_id, "q1-p");
  assert.equal(mock.calls.length, 1);
});

test("FeedbackPipeline retries when model returns empty explanation for diagnosis", async () => {
  const emptyExplanationDiagnosis = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Confuses induction and abduction",
    explanation: "",
    concept_ids: ["induction", "abduction"],
    follow_up_id: "q1-p",
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "medium",
  });

  const validDiagnosis = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Confuses induction and abduction",
    explanation: "Corrected non-empty explanation grounded in definitions.",
    concept_ids: ["induction", "abduction"],
    follow_up_id: "q1-p",
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "high",
  });

  const mock = new MockOllamaTransport([emptyExplanationDiagnosis, validDiagnosis]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Sample reasoning.",
  });

  assert.equal(result.kind, "diagnosis");
  assert.equal(result.explanation, "Corrected non-empty explanation grounded in definitions.");
  assert.equal(mock.calls.length, 2);
  const secondCallPrompt = mock.calls[1]![1]!.content;
  assert.ok(secondCallPrompt.includes("[RETRY CORRECTION REQUIRED]"));
});

test("FeedbackPipeline retries when model returns unverified concept in diagnosis", async () => {
  const badConceptResponse = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Confuses something unknown",
    explanation: "Some explanation.",
    concept_ids: ["quantum_entanglement"],
    follow_up_id: "q1-p",
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "low",
  });

  const validResponse = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Confuses induction with abduction",
    explanation: "Explanation.",
    concept_ids: ["induction", "abduction"],
    follow_up_id: "q1-p",
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "high",
  });

  const mock = new MockOllamaTransport([badConceptResponse, validResponse]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Reasoning.",
  });

  assert.equal(result.kind, "diagnosis");
  assert.equal(mock.calls.length, 2);
});

test("FeedbackPipeline retries when model returns unverified concept in clarification", async () => {
  // Attempt 1: needs_clarification with unverified concept ID
  const badClarificationResponse = JSON.stringify({
    status: "needs_clarification",
    possible_misconception: null,
    explanation: "",
    concept_ids: ["unknown_telepathy"],
    follow_up_id: null,
    needs_clarification: true,
    clarification_prompt: "Can you clarify?",
    confidence: "low",
  });

  // Attempt 2: valid clarification with empty concept_ids
  const validClarificationResponse = JSON.stringify({
    status: "needs_clarification",
    possible_misconception: null,
    explanation: "",
    concept_ids: [],
    follow_up_id: null,
    needs_clarification: true,
    clarification_prompt: "Can you elaborate on your reasoning?",
    confidence: "low",
  });

  const mock = new MockOllamaTransport([badClarificationResponse, validClarificationResponse]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "B",
    student_reasoning: "The situation could mean several things depending on context.",
  });

  assert.equal(result.kind, "clarification");
  assert.equal(result.clarification_prompt, "Can you elaborate on your reasoning?");
  assert.equal(mock.calls.length, 2);
});

test("FeedbackPipeline retries when transport fails and falls back after 2 failures", async () => {
  // Transport fails twice due to network or timeout error
  const mock = new MockOllamaTransport([
    new Error("Network timeout connecting to Ollama"),
    new Error("ECONNREFUSED 127.0.0.1:11434"),
  ]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "My explanation.",
  });

  assert.equal(result.kind, "fallback");
  assert.equal(result.verified_explanation, q1.verified_explanation);
  assert.equal(result.follow_up_id, q1.follow_up_ids[0]);
  assert.equal(mock.calls.length, 2, "Exactly 2 model calls must be made on retry to fallback");
});

test("FeedbackPipeline emits verified fallback after two invalid model outputs", async () => {
  const invalidOutput = "NOT_JSON_AT_ALL";

  const mock = new MockOllamaTransport([invalidOutput, invalidOutput]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "My answer.",
  });

  assert.equal(result.kind, "fallback");
  assert.equal(result.verified_explanation, q1.verified_explanation);
  assert.equal(result.follow_up_id, q1.follow_up_ids[0]);
  assert.equal(mock.calls.length, 2, "Exactly 2 model calls must be made");

  // Fallback must never contain diagnosis fields
  assert.equal("possible_misconception" in result, false);
  assert.equal("explanation" in result, false);
});

test("FeedbackPipeline rejects unknown question ID or invalid choice ID with zero model calls", async () => {
  const mock = new MockOllamaTransport([]);
  const pipeline = new FeedbackPipeline(mock);

  await assert.rejects(
    () =>
      pipeline.processFeedback({
        question_id: "nonexistent-q",
        student_choice_id: "A",
        student_reasoning: "test",
      }),
    QuestionNotFoundError
  );
  assert.equal(mock.calls.length, 0);

  await assert.rejects(
    () =>
      pipeline.processFeedback({
        question_id: "q1",
        student_choice_id: "Z",
        student_reasoning: "test",
      }),
    InvalidChoiceError
  );
  assert.equal(mock.calls.length, 0);
});

test("FeedbackPipeline throws FallbackVerificationError if fallback content is corrupted or ineligible", async () => {
  const invalidOutput = "INVALID";
  const mock = new MockOllamaTransport([invalidOutput, invalidOutput]);
  const pipeline = new FeedbackPipeline(mock);

  // Synthesize question with unreviewed / corrupted primary follow-up ID
  const corruptedQuestion: Question = {
    ...q1,
    id: "q-corrupted",
    follow_up_ids: ["nonexistent-followup-id"],
  };

  const contentModule = await import("../src/content.js");
  const store = contentModule.getContentStore();
  store.questionsById.set("q-corrupted", corruptedQuestion);

  try {
    await assert.rejects(
      () =>
        pipeline.processFeedback({
          question_id: "q-corrupted",
          student_choice_id: "A",
          student_reasoning: "testing fallback corruption",
        }),
      FallbackVerificationError
    );
  } finally {
    store.questionsById.delete("q-corrupted");
  }
});

test("Express POST /api/feedback rejects invalid, missing, empty, or whitespace fields with HTTP 400", async () => {
  const mock = new MockOllamaTransport([]);
  const pipeline = new FeedbackPipeline(mock);
  const app = createApp(pipeline);

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 3001;

  try {
    const testCases: Record<string, unknown>[] = [
      { student_choice_id: "A", student_reasoning: "valid" }, // missing question_id
      { question_id: "q1", student_reasoning: "valid" }, // missing student_choice_id
      { question_id: "q1", student_choice_id: "A" }, // missing student_reasoning
      { question_id: "q1", student_choice_id: 123, student_reasoning: "valid" }, // wrong type
      { question_id: "q1", student_choice_id: "A", student_reasoning: "" }, // empty string
      { question_id: "q1", student_choice_id: "A", student_reasoning: "   \n\t  " }, // whitespace-only
      { question_id: "   ", student_choice_id: "A", student_reasoning: "valid" }, // whitespace-only question_id
      { question_id: "q1", student_choice_id: "   ", student_reasoning: "valid" }, // whitespace-only choice
    ];

    for (const body of testCases) {
      const res = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      assert.equal(res.status, 400, `Expected 400 for payload ${JSON.stringify(body)}`);
    }

    // Zero model calls made
    assert.equal(mock.calls.length, 0);
  } finally {
    server.close();
  }
});

test("Express POST /api/feedback returns 404 for unknown question and 400 for invalid choice", async () => {
  const mock = new MockOllamaTransport([]);
  const pipeline = new FeedbackPipeline(mock);
  const app = createApp(pipeline);

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 3001;

  try {
    // Unknown question -> 404
    const res404 = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: "unknown-question-id",
        student_choice_id: "A",
        student_reasoning: "Reasoning.",
      }),
    });
    assert.equal(res404.status, 404);
    assert.equal(mock.calls.length, 0);

    // Invalid choice ID -> 400
    const res400 = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: "q1",
        student_choice_id: "INVALID_CHOICE",
        student_reasoning: "Reasoning.",
      }),
    });
    assert.equal(res400.status, 400);
    assert.equal(mock.calls.length, 0);
  } finally {
    server.close();
  }
});

test("Express POST /api/feedback returns 200 with FeedbackResult on success", async () => {
  const validDiagnosisResponse = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Confuses induction and abduction",
    explanation: "Student thought this was induction.",
    concept_ids: ["induction", "abduction"],
    follow_up_id: "q1-p",
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "high",
  });

  const mock = new MockOllamaTransport([validDiagnosisResponse]);
  const pipeline = new FeedbackPipeline(mock);
  const app = createApp(pipeline);

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 3001;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: "q1",
        student_choice_id: "A",
        student_reasoning: "Pattern observation.",
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { kind: string; follow_up_id: string };
    assert.equal(body.kind, "diagnosis");
    assert.equal(body.follow_up_id, "q1-p");
    assert.equal(mock.calls.length, 1);
  } finally {
    server.close();
  }
});
