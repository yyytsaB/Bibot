import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FeedbackPipeline,
  assessReasoningClarity,
} from "../src/pipeline.js";
import { MockOllamaTransport } from "./support/mock-transport.js";
import { getQuestion, loadContent } from "../src/content.js";
import { createApp } from "../src/server.js";

// Ensure content is loaded
loadContent();
const q1 = getQuestion("q1")!;

test("assessReasoningClarity: classifies all reviewed vague and unusual cases", () => {
  // T07: Pure guess
  const t07 = assessReasoningClarity("I guessed.", q1, "A");
  assert.equal(t07.isUnclear, true);
  assert.equal(t07.reason, "guessing_or_uncertainty");

  // T08: Intuition without rationale
  const t08 = assessReasoningClarity("It just seemed right.", q1, "B");
  assert.equal(t08.isUnclear, true);
  assert.equal(t08.reason, "guessing_or_uncertainty");

  // T09: Unable to explain
  const t09 = assessReasoningClarity("I'm not sure how to explain it.", q1, "C");
  assert.equal(t09.isUnclear, true);
  assert.equal(t09.reason, "guessing_or_uncertainty");

  // T10: Vague situational
  const t10 = assessReasoningClarity("Because of the situation.", q1, "A");
  assert.equal(t10.isUnclear, true);
  assert.equal(t10.reason, "vague_situational");

  // T11: Uncertainty
  const t11 = assessReasoningClarity("Maybe that one? I don't know.", q1, "C");
  assert.equal(t11.isUnclear, true);
  assert.equal(t11.reason, "guessing_or_uncertainty");

  // T14: Completely unrelated statement
  const t14 = assessReasoningClarity("Our classroom curtains are green.", q1, "C");
  assert.equal(t14.isUnclear, true);
  assert.equal(t14.reason, "unrelated_statement");

  // T15: Selection/reasoning mismatch (substantive thought, but describes wrong label)
  const t15 = assessReasoningClarity(
    "I meant that Bea must have the badge if both statements are true, but I may have clicked the wrong label.",
    q1,
    "A"
  );
  assert.equal(t15.isUnclear, true);
  assert.equal(t15.reason, "selection_mismatch");
  assert.ok(t15.clarificationPrompt?.includes("different choice than the one selected"));
});

test("assessReasoningClarity: handles positive and negative counterexamples beyond reviewed text", () => {
  // Short meaningful reasoning (must NOT be rejected)
  const short1 = assessReasoningClarity("Guarantees tomorrow's arrival.", q1, "A");
  assert.equal(short1.isUnclear, false);

  const short2 = assessReasoningClarity("Rain causes wet floors.", q1, "A");
  assert.equal(short2.isUnclear, false);

  const short3 = assessReasoningClarity("General rule applied to one case.", q1, "A");
  assert.equal(short3.isUnclear, false);

  const short4 = assessReasoningClarity("Absolute certainty.", q1, "A");
  assert.equal(short4.isUnclear, false);

  // Substantive reasoning containing the word "guess" (must NOT be rejected)
  const substantiveWithGuess = assessReasoningClarity(
    "I guessed induction because it happened on 9 out of 10 days.",
    q1,
    "A"
  );
  assert.equal(substantiveWithGuess.isUnclear, false);

  const q2 = getQuestion("q2")!;
  const substantiveWithScenarioFacts = assessReasoningClarity(
    "I guessed because nine of ten visits were full.",
    q2,
    "A"
  );
  assert.equal(substantiveWithScenarioFacts.isUnclear, false);

  // Pure guessing combined with concept name or hunch (MUST be caught)
  const pureThought = assessReasoningClarity("I just thought so.", q1, "A");
  assert.equal(pureThought.isUnclear, true);
  assert.equal(pureThought.reason, "guessing_or_uncertainty");

  const pureGuessedConcept = assessReasoningClarity("I guessed induction.", q1, "A");
  assert.equal(pureGuessedConcept.isUnclear, true);
  assert.equal(pureGuessedConcept.reason, "guessing_or_uncertainty");

  // Long empty reasoning (MUST be caught)
  const longEmpty = assessReasoningClarity(
    "Well, honestly I was reading through all of the different options and choices and to be completely frank I just ended up guessing choice A because I really have no clue whatsoever.",
    q1,
    "A"
  );
  assert.equal(longEmpty.isUnclear, true);
  assert.equal(longEmpty.reason, "guessing_or_uncertainty");

  // Circular restatement (MUST be caught)
  const circular1 = assessReasoningClarity("Because it's induction.", q1, "A");
  assert.equal(circular1.isUnclear, true);
  assert.equal(circular1.reason, "circular_restatement");

  const circular2 = assessReasoningClarity("Choice A is inductive reasoning.", q1, "A");
  assert.equal(circular2.isUnclear, true);
  assert.equal(circular2.reason, "circular_restatement");

  // In-context relevance without unconditional keyword blocks:
  // 1. Completely unrelated statements are caught dynamically
  const unrelatedWeather = assessReasoningClarity(
    "The weather is very sunny outside today.",
    q1,
    "A"
  );
  assert.equal(unrelatedWeather.isUnclear, true);
  assert.equal(unrelatedWeather.reason, "unrelated_statement");

  const unrelatedMovie = assessReasoningClarity(
    "I watched a movie yesterday afternoon.",
    q1,
    "A"
  );
  assert.equal(unrelatedMovie.isUnclear, true);
  assert.equal(unrelatedMovie.reason, "unrelated_statement");

  const unrelatedSherlock = assessReasoningClarity(
    "Sherlock Holmes is my favorite fictional character.",
    q1,
    "A"
  );
  assert.equal(unrelatedSherlock.isUnclear, true);
  assert.equal(unrelatedSherlock.reason, "unrelated_statement");

  // 2. Statements using those words in legitimate logical context are preserved
  const logicalSherlock = assessReasoningClarity(
    "Deduction is like Sherlock Holmes finding the mud and proving the culprit.",
    q1,
    "A"
  );
  assert.equal(logicalSherlock.isUnclear, false);

  // 3. Irrelevant statements containing concept names purely as linguistic/trivia meta-talk (MUST be caught)
  const irrelevantConcept1 = assessReasoningClarity(
    "My teacher said induction is a word that starts with the letter I.",
    q1,
    "A"
  );
  assert.equal(irrelevantConcept1.isUnclear, true);
  assert.equal(irrelevantConcept1.reason, "unrelated_statement");

  const irrelevantConcept2 = assessReasoningClarity(
    "Deduction sounds like a cool word from a movie.",
    q1,
    "A"
  );
  assert.equal(irrelevantConcept2.isUnclear, true);
  assert.equal(irrelevantConcept2.reason, "unrelated_statement");
});

test("assessReasoningClarity: clear misunderstanding cases remain diagnosable", () => {
  const clearCases = [
    "They observed water and made a conclusion. Any conclusion from an observation is induction.", // T01
    "A prediction about the room is an explanation, so it has to be abduction.", // T02
    "The rule talks about a whole club, so it must have been formed by induction. Applying it to Bea is induction too.", // T03
    "The jam warning and folded sheet prove the cause with absolute certainty, so this is deduction.", // T04
    "Twelve successes turn the pattern into a rule that guarantees tomorrow's arrival.", // T05
    "Drawer B is just the best guess even though the question says those are the only two places and A is ruled out.", // T06
    "Deduction always moves from a general rule to one specific case. This has two locations instead, so it cannot be deduction.", // T12
    "The person is acting like a detective. Detective work is always deductive, so choosing the likely cause must be deduction.", // T13
  ];

  for (const text of clearCases) {
    const res = assessReasoningClarity(text, q1, "A");
    assert.equal(res.isUnclear, false, `Failed to recognize substantive reasoning for: "${text}"`);
  }
});

test("FeedbackPipeline: pre-model safeguard handles unclear reasoning without calling model (count 0)", async () => {
  // If model was called it would return an invalid/unverified concept error
  const mock = new MockOllamaTransport([
    JSON.stringify({
      status: "possible_misconception",
      possible_misconception: "Hallucinated misconception",
      explanation: "Expl",
      concept_ids: ["unverified_hallucination"],
      follow_up_id: null,
      needs_clarification: false,
      clarification_prompt: null,
      confidence: "high",
    }),
  ]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "I guessed.",
    clarification_attempt_count: 0,
  });

  assert.equal(result.kind, "clarification");
  assert.ok(result.clarification_prompt.length > 0);
  assert.equal(mock.calls.length, 0, "Model must not be called for confidently unclear reasoning");
  assert.equal(pipeline.lastTelemetry?.decision, "safeguard_clarification");
  assert.equal(pipeline.lastTelemetry?.model_called, false);
  assert.equal(pipeline.lastTelemetry?.attempts, 0);
});

test("FeedbackPipeline: pre-model safeguard handles 'I just thought so.' and 'I guessed induction.'", async () => {
  const mock = new MockOllamaTransport([]);
  const pipeline = new FeedbackPipeline(mock);

  // 1. "I just thought so." (count 0) -> clarification, 0 model calls
  const resThought0 = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "I just thought so.",
    clarification_attempt_count: 0,
  });
  assert.equal(resThought0.kind, "clarification");
  assert.equal(mock.calls.length, 0);
  assert.equal(pipeline.lastTelemetry?.decision, "safeguard_clarification");

  // 2. "I just thought so." (count 1) -> verified fallback, 0 model calls
  const resThought1 = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "I just thought so.",
    clarification_attempt_count: 1,
  });
  assert.equal(resThought1.kind, "fallback");
  assert.equal(mock.calls.length, 0);
  assert.equal(pipeline.lastTelemetry?.decision, "second_unclear_fallback");

  // 3. "I guessed induction." (count 0) -> clarification, 0 model calls
  const resGuessed0 = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "I guessed induction.",
    clarification_attempt_count: 0,
  });
  assert.equal(resGuessed0.kind, "clarification");
  assert.equal(mock.calls.length, 0);
  assert.equal(pipeline.lastTelemetry?.decision, "safeguard_clarification");

  // 4. "I guessed induction." (count 1) -> verified fallback, 0 model calls
  const resGuessed1 = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "I guessed induction.",
    clarification_attempt_count: 1,
  });
  assert.equal(resGuessed1.kind, "fallback");
  assert.equal(mock.calls.length, 0);
  assert.equal(pipeline.lastTelemetry?.decision, "second_unclear_fallback");
});

test("FeedbackPipeline: preserves substantive reasoning such as 'I guessed because nine of ten visits were full.'", async () => {
  const diagnosisJson = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Treated observed visit frequency as deduction",
    explanation: "Predicting the next visit from 9 of 10 past visits is inductive reasoning.",
    concept_ids: ["induction", "abduction"],
    follow_up_id: "q2-p",
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "high",
  });

  const mock = new MockOllamaTransport([diagnosisJson]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q2",
    student_choice_id: "A",
    student_reasoning: "I guessed because nine of ten visits were full.",
    clarification_attempt_count: 0,
  });

  // Model must be called because reasoning contains substantive empirical premises
  assert.equal(result.kind, "diagnosis");
  assert.equal(result.possible_misconception, "Treated observed visit frequency as deduction");
  assert.equal(mock.calls.length, 1, "Model must be called exactly once for substantive reasoning");
  assert.equal(pipeline.lastTelemetry?.decision, "accepted_diagnosis");
  assert.equal(pipeline.lastTelemetry?.model_called, true);
  assert.equal(pipeline.lastTelemetry?.attempts, 1);
});

test("FeedbackPipeline regression: guess marker with non-substantive filler produces clarification at count 0 and fallback at count 1 with zero model calls", async () => {
  const mock = new MockOllamaTransport([]);
  const pipeline = new FeedbackPipeline(mock);

  // 1. "I guessed because of the situation." -> count 0: clarification, 0 model calls
  const resSituation0 = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "I guessed because of the situation.",
    clarification_attempt_count: 0,
  });
  assert.equal(resSituation0.kind, "clarification");
  assert.equal(mock.calls.length, 0);
  assert.equal(pipeline.lastTelemetry?.decision, "safeguard_clarification");
  assert.equal(pipeline.lastTelemetry?.model_called, false);

  // 1b. "I guessed because of the situation." -> count 1: verified fallback, 0 model calls
  const resSituation1 = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "I guessed because of the situation.",
    clarification_attempt_count: 1,
  });
  assert.equal(resSituation1.kind, "fallback");
  assert.equal(mock.calls.length, 0);
  assert.equal(pipeline.lastTelemetry?.decision, "second_unclear_fallback");
  assert.equal(pipeline.lastTelemetry?.model_called, false);

  // 2. "I guessed because I like the number nine." -> count 0: clarification, 0 model calls
  const resNine0 = await pipeline.processFeedback({
    question_id: "q2",
    student_choice_id: "A",
    student_reasoning: "I guessed because I like the number nine.",
    clarification_attempt_count: 0,
  });
  assert.equal(resNine0.kind, "clarification");
  assert.equal(mock.calls.length, 0);
  assert.equal(pipeline.lastTelemetry?.decision, "safeguard_clarification");
  assert.equal(pipeline.lastTelemetry?.model_called, false);

  // 2b. "I guessed because I like the number nine." -> count 1: verified fallback, 0 model calls
  const resNine1 = await pipeline.processFeedback({
    question_id: "q2",
    student_choice_id: "A",
    student_reasoning: "I guessed because I like the number nine.",
    clarification_attempt_count: 1,
  });
  assert.equal(resNine1.kind, "fallback");
  assert.equal(mock.calls.length, 0);
  assert.equal(pipeline.lastTelemetry?.decision, "second_unclear_fallback");
  assert.equal(pipeline.lastTelemetry?.model_called, false);
});

test("FeedbackPipeline regression: supporting reasoning in separate sentence allows model evaluation on q2", async () => {
  const diagnosisJson = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Treated observed visit frequency as deduction",
    explanation: "Extending nine of ten recorded visits to predict the next visit is inductive reasoning.",
    concept_ids: ["induction", "abduction"],
    follow_up_id: "q2-p",
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "high",
  });

  const mock = new MockOllamaTransport([diagnosisJson]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q2",
    student_choice_id: "A",
    student_reasoning: "I am not sure. Nine of ten visits were full.",
    clarification_attempt_count: 0,
  });

  assert.equal(result.kind, "diagnosis");
  assert.equal(result.possible_misconception, "Treated observed visit frequency as deduction");
  assert.equal(mock.calls.length, 1, "Model must be called exactly once for substantive separate sentence");
  assert.equal(pipeline.lastTelemetry?.decision, "accepted_diagnosis");
  assert.equal(pipeline.lastTelemetry?.model_called, true);
  assert.equal(pipeline.lastTelemetry?.attempts, 1);
});

test("FeedbackPipeline: second unclear submission (count 1) returns verified fallback with 0 model calls", async () => {
  const mock = new MockOllamaTransport([]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Still not sure about it.",
    clarification_attempt_count: 1,
  });

  assert.equal(result.kind, "fallback");
  assert.equal(result.verified_explanation, q1.verified_explanation);
  assert.equal(result.follow_up_id, q1.follow_up_ids[0]);
  assert.equal(mock.calls.length, 0, "Second unclear submission must not call model");
  assert.equal(pipeline.lastTelemetry?.decision, "second_unclear_fallback");
  assert.equal(pipeline.lastTelemetry?.model_called, false);
});

test("FeedbackPipeline: substantive resubmission after clarification produces genuine diagnosis", async () => {
  const genuineDiagnosis = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Treated predictive pattern as absolute guarantee",
    explanation: "Abductive reasoning infers the best explanation rather than a guaranteed conclusion.",
    concept_ids: ["induction", "abduction"],
    follow_up_id: "q1-p",
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "high",
  });

  const mock = new MockOllamaTransport([genuineDiagnosis]);
  const pipeline = new FeedbackPipeline(mock);

  const result = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Twelve successes turn the pattern into a rule that guarantees tomorrow's arrival.",
    clarification_attempt_count: 1,
  });

  // Substantive reasoning produces a diagnosis even when count >= 1!
  assert.equal(result.kind, "diagnosis");
  assert.equal(result.possible_misconception, "Treated predictive pattern as absolute guarantee");
  assert.equal(result.follow_up_id, "q1-p");
  assert.equal(mock.calls.length, 1);
  assert.equal(pipeline.lastTelemetry?.decision, "accepted_diagnosis");
});

test("FeedbackPipeline: documented F3 multi-submission scenario (T07 -> T11)", async () => {
  const mockTransport = new MockOllamaTransport([]);
  const pipeline = new FeedbackPipeline(mockTransport);

  // Step 1: Submit T07 for q1 with count 0 -> Expect clarification with zero model calls
  const step1 = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "I guessed.",
    clarification_attempt_count: 0,
  });
  assert.equal(step1.kind, "clarification");
  assert.equal(mockTransport.calls.length, 0);
  assert.equal(pipeline.lastTelemetry?.decision, "safeguard_clarification");

  // Step 2: Submit T11 for q1 with count 1 -> Expect backend fallback containing verified explanation and follow-up with zero model calls
  const step2 = await pipeline.processFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Maybe that one? I don't know.",
    clarification_attempt_count: 1,
  });
  assert.equal(step2.kind, "fallback");
  assert.equal(step2.verified_explanation, q1.verified_explanation);
  assert.equal(step2.follow_up_id, q1.follow_up_ids[0]);
  assert.equal(mockTransport.calls.length, 0);
  assert.equal(pipeline.lastTelemetry?.decision, "second_unclear_fallback");
});

test("FeedbackPipeline telemetry: distinguishes invalid references, model clarification, safeguard intervention, and retry exhaustion", async () => {
  // 1. Safeguard intervention: unclear reasoning, model not called
  const mock1 = new MockOllamaTransport([]);
  const pipeline1 = new FeedbackPipeline(mock1);
  const { result: res1, telemetry: tel1 } = await pipeline1.processFeedbackWithTelemetry({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "I guessed.",
    clarification_attempt_count: 0,
  });
  assert.equal(res1.kind, "clarification");
  assert.equal(tel1.decision, "safeguard_clarification");
  assert.equal(tel1.model_called, false);
  assert.equal(tel1.attempts, 0);
  assert.equal(mock1.calls.length, 0);

  // 2. Model clarification: substantive reasoning, model explicitly returns needs_clarification
  const modelClarificationJson = JSON.stringify({
    status: "needs_clarification",
    possible_misconception: null,
    explanation: "",
    concept_ids: [],
    follow_up_id: null,
    needs_clarification: true,
    clarification_prompt: "Can you elaborate on your observation?",
    confidence: "low",
  });
  const mock2 = new MockOllamaTransport([modelClarificationJson]);
  const pipeline2 = new FeedbackPipeline(mock2);
  const { result: res2, telemetry: tel2 } = await pipeline2.processFeedbackWithTelemetry({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "The puddle was observed on the classroom floor.",
    clarification_attempt_count: 0,
  });
  assert.equal(res2.kind, "clarification");
  assert.equal(tel2.decision, "model_clarification");
  assert.equal(tel2.model_called, true);
  assert.equal(tel2.attempts, 1);
  assert.equal(mock2.calls.length, 1);

  // 3. Invalid references: substantive reasoning, model returns unverified concept references -> retry exhaustion -> technical fallback
  const invalidRefJson = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Some error",
    explanation: "Expl",
    concept_ids: ["unverified_concept_xyz"],
    follow_up_id: "q1-p",
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "high",
  });
  const mock3 = new MockOllamaTransport([invalidRefJson, invalidRefJson]);
  const pipeline3 = new FeedbackPipeline(mock3);
  const { result: res3, telemetry: tel3 } = await pipeline3.processFeedbackWithTelemetry({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "The puddle was observed on the classroom floor.",
    clarification_attempt_count: 0,
  });
  assert.equal(res3.kind, "fallback");
  assert.equal(tel3.decision, "technical_fallback");
  assert.equal(tel3.model_called, true);
  assert.equal(tel3.attempts, 2);
  assert.ok(tel3.error?.includes("Unverified concept reference"));
  assert.equal(mock3.calls.length, 2);

  // 4. Retry exhaustion: substantive reasoning, model returns malformed non-JSON twice -> technical fallback
  const mock4 = new MockOllamaTransport(["NOT_JSON", "STILL_NOT_JSON"]);
  const pipeline4 = new FeedbackPipeline(mock4);
  const { result: res4, telemetry: tel4 } = await pipeline4.processFeedbackWithTelemetry({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "The puddle was observed on the classroom floor.",
    clarification_attempt_count: 0,
  });
  assert.equal(res4.kind, "fallback");
  assert.equal(tel4.decision, "technical_fallback");
  assert.equal(tel4.model_called, true);
  assert.equal(tel4.attempts, 2);
  assert.ok(tel4.error?.includes("not valid JSON"));
  assert.equal(mock4.calls.length, 2);

  // 5. Post-model safeguard intervention in direct evaluation mode:
  // Model returns possible_misconception on unclear reasoning ("I guessed."),
  // but safeguard intercepts and emits safeguard_clarification with model_called: true.
  const modelDiagnosisOnGuess = JSON.stringify({
    status: "possible_misconception",
    possible_misconception: "Student thought guessing was induction",
    explanation: "Guessing is not reasoning.",
    concept_ids: ["induction", "abduction"],
    follow_up_id: "q1-p",
    needs_clarification: false,
    clarification_prompt: null,
    confidence: "high",
  });
  const mock5 = new MockOllamaTransport([modelDiagnosisOnGuess]);
  const pipeline5 = new FeedbackPipeline(mock5);
  const { result: res5, telemetry: tel5 } = await pipeline5.processFeedbackWithTelemetry(
    {
      question_id: "q1",
      student_choice_id: "A",
      student_reasoning: "I guessed.",
      clarification_attempt_count: 0,
    },
    { evaluateModelDirectly: true }
  );
  assert.equal(res5.kind, "clarification");
  assert.equal(tel5.decision, "safeguard_clarification");
  assert.equal(tel5.model_called, true);
  assert.equal(tel5.attempts, 1);
  assert.equal(tel5.reason, "guessing_or_uncertainty");
  assert.equal(mock5.calls.length, 1);
});

test("Express POST /api/feedback: validates clarification_attempt_count before model call", async () => {
  const mock = new MockOllamaTransport([]);
  const pipeline = new FeedbackPipeline(mock);
  const app = createApp(pipeline);

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 3001;

  try {
    // 1. Invalid values: negative, fractional, string, null, boolean -> 400
    const invalidValues = [-1, 1.5, "1", null, true, false, NaN];
    for (const val of invalidValues) {
      const res = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: "q1",
          student_choice_id: "A",
          student_reasoning: "Valid reasoning text.",
          clarification_attempt_count: val,
        }),
      });
      assert.equal(res.status, 400, `Expected 400 for count value ${JSON.stringify(val)}`);
      const body = (await res.json()) as { error?: string };
      assert.ok(body.error?.includes("clarification_attempt_count"));
    }

    // Zero model calls made on validation failures!
    assert.equal(mock.calls.length, 0);

    // 2. Valid omitted count, 0, 1, and 2
    const validClarification = JSON.stringify({
      status: "needs_clarification",
      possible_misconception: null,
      explanation: "",
      concept_ids: [],
      follow_up_id: null,
      needs_clarification: true,
      clarification_prompt: "Clarify please.",
      confidence: "low",
    });

    const validPipeline = new FeedbackPipeline(new MockOllamaTransport([
      validClarification, // for omitted
      validClarification, // for 0
      validClarification, // for 1 -> fallback
      validClarification, // for 2 -> fallback
    ]));
    const validApp = createApp(validPipeline);
    const validServer = validApp.listen(0);
    const validPort = typeof validServer.address() === "object" && validServer.address() ? (validServer.address() as { port: number }).port : 3002;

    try {
      // Omitted count -> accepted, defaults to 0 -> clarification
      const resOmitted = await fetch(`http://127.0.0.1:${validPort}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: "q1",
          student_choice_id: "A",
          student_reasoning: "Valid non-guess reasoning text.",
        }),
      });
      assert.equal(resOmitted.status, 200);
      const dataOmitted = (await resOmitted.json()) as { kind: string };
      assert.equal(dataOmitted.kind, "clarification");

      // Count 0 -> accepted -> clarification
      const resZero = await fetch(`http://127.0.0.1:${validPort}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: "q1",
          student_choice_id: "A",
          student_reasoning: "Valid non-guess reasoning text.",
          clarification_attempt_count: 0,
        }),
      });
      assert.equal(resZero.status, 200);
      const dataZero = (await resZero.json()) as { kind: string };
      assert.equal(dataZero.kind, "clarification");

      // Count 1 -> accepted -> fallback
      const resOne = await fetch(`http://127.0.0.1:${validPort}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: "q1",
          student_choice_id: "A",
          student_reasoning: "Valid non-guess reasoning text.",
          clarification_attempt_count: 1,
        }),
      });
      assert.equal(resOne.status, 200);
      const dataOne = (await resOne.json()) as { kind: string };
      assert.equal(dataOne.kind, "fallback");

      // Count 2 -> accepted -> fallback
      const resTwo = await fetch(`http://127.0.0.1:${validPort}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: "q1",
          student_choice_id: "A",
          student_reasoning: "Valid non-guess reasoning text.",
          clarification_attempt_count: 2,
        }),
      });
      assert.equal(resTwo.status, 200);
      const dataTwo = (await resTwo.json()) as { kind: string };
      assert.equal(dataTwo.kind, "fallback");
    } finally {
      validServer.close();
    }
  } finally {
    server.close();
  }
});
