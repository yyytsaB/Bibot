import test from "node:test";
import assert from "node:assert/strict";
import type { Question, FollowUp, Concept } from "shared";
import { PracticeContentStore } from "../src/state/content-store.ts";
import { PracticeStateMachine } from "../src/state/machine.ts";
import { DefaultClarificationPolicy } from "../src/state/clarification-policy.ts";

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
      follow_up_ids: ["q2-p"], // Single follow-up matching q2's induction/deduction distinction
    },
  ];

  return { concepts, questions, followUps };
}

test("PracticeStateMachine initializes to question_answering stage", () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const policy = new DefaultClarificationPolicy();
  const machine = new PracticeStateMachine({
    questions: store.getQuestions(),
    contentStore: store,
    clarificationPolicy: policy,
  });

  const state = machine.getState();
  assert.equal(state.status, "question_answering");
  assert.equal(state.stage, "question");
  assert.equal(state.currentQuestionIndex, 0);
  assert.equal(state.currentQuestion.id, "q1");
  assert.equal(state.selectedChoiceId, null);
  assert.equal(state.isSessionCompleted, false);
  assert.equal(state.learningEvidence.length, 0);
});

test("selecting choices and locking answer after checking", () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const policy = new DefaultClarificationPolicy();
  const machine = new PracticeStateMachine({
    questions: store.getQuestions(),
    contentStore: store,
    clarificationPolicy: policy,
  });

  // Valid selection
  assert.equal(machine.selectChoice("A"), true);
  const stateSelected = machine.getState();
  if (stateSelected.status === "question_answering") {
    assert.equal(stateSelected.selectedChoiceId, "A");
  } else {
    assert.fail("Expected question_answering state");
  }

  // Selection with non-existent choice ID is rejected
  assert.equal(machine.selectChoice("NON_EXISTENT"), false);
  const stateRejected = machine.getState();
  if (stateRejected.status === "question_answering") {
    assert.equal(stateRejected.selectedChoiceId, "A");
  } else {
    assert.fail("Expected question_answering state");
  }

  // Check answer (Choice A is incorrect for Q1)
  assert.equal(machine.checkAnswer(), true);
  assert.equal(machine.getState().status, "reasoning");

  // Cannot change choice after it has been checked!
  assert.equal(machine.selectChoice("C"), false);
  const state = machine.getState();
  if (state.status === "reasoning") {
    assert.equal(state.selectedChoiceId, "A");
  } else {
    assert.fail("Expected reasoning state");
  }
});

test("correct initial answer reveals verified explanation and permits advancing without AI", () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const policy = new DefaultClarificationPolicy();
  const machine = new PracticeStateMachine({
    questions: store.getQuestions(),
    contentStore: store,
    clarificationPolicy: policy,
  });

  // Select correct choice C
  assert.equal(machine.selectChoice("C"), true);
  assert.equal(machine.checkAnswer(), true);

  const state = machine.getState();
  assert.equal(state.status, "question_correct");
  assert.equal(state.stage, "question");
  if (state.status === "question_correct") {
    assert.equal(state.selectedChoiceId, "C");
    assert.equal(state.verifiedExplanation, "Mika proposes a cause for this puddle.");
  }

  // Emits correct_first_try learning evidence with question.concept_ids
  assert.equal(state.learningEvidence.length, 1);
  const ev = state.learningEvidence[0]!;
  assert.equal(ev.kind, "correct_first_try");
  assert.equal(ev.questionId, "q1");
  assert.deepEqual(ev.conceptIds, ["induction", "abduction"]);

  // Permits advancing to next question
  assert.equal(machine.advanceToNextQuestion(), true);
  assert.equal(machine.getState().status, "question_answering");
  assert.equal(machine.getState().currentQuestionIndex, 1);
  assert.equal(machine.getState().currentQuestion.id, "q2");
});

test("wrong initial answer emits wrong_initial once and requires non-blank reasoning", () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const policy = new DefaultClarificationPolicy();
  const machine = new PracticeStateMachine({
    questions: store.getQuestions(),
    contentStore: store,
    clarificationPolicy: policy,
  });

  // Select incorrect choice A
  machine.selectChoice("A");
  machine.checkAnswer();

  const state = machine.getState();
  assert.equal(state.status, "reasoning");
  assert.equal(state.stage, "reasoning");
  if (state.status === "reasoning") {
    assert.equal(state.selectedChoiceId, "A");
    assert.equal(state.studentReasoning, "");
  }

  // Emits wrong_initial learning evidence using question.concept_ids
  assert.equal(state.learningEvidence.length, 1);
  const ev = state.learningEvidence[0]!;
  assert.equal(ev.kind, "wrong_initial");
  assert.equal(ev.questionId, "q1");
  assert.deepEqual(ev.conceptIds, ["induction", "abduction"]);

  // Blank reasoning is rejected
  const prepBlank = machine.prepareSubmission();
  assert.equal(prepBlank.ok, false);
  assert.equal(machine.getState().status, "reasoning");

  // Whitespace-only reasoning is rejected
  machine.setReasoning("   \t  \n ");
  const prepWhitespace = machine.prepareSubmission();
  assert.equal(prepWhitespace.ok, false);

  // Non-blank reasoning is accepted
  machine.setReasoning("I thought any conclusion from observation is induction.");
  const prepValid = machine.prepareSubmission();
  assert.equal(prepValid.ok, true);
  assert.equal(machine.getState().status, "analysis");
});

test("follow-up answer checking, extra example discovery, and finite termination", () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const policy = new DefaultClarificationPolicy();
  const machine = new PracticeStateMachine({
    questions: store.getQuestions(),
    contentStore: store,
    clarificationPolicy: policy,
  });

  // Reach diagnosis state on Q1
  machine.selectChoice("A");
  machine.checkAnswer();
  machine.setReasoning("My explanation");
  const prep = machine.prepareSubmission();
  assert.equal(prep.ok, true);

  machine.applyDiagnosisResponse(prep.submissionId!, {
    kind: "diagnosis",
    possible_misconception: "Treated observation as induction",
    explanation: "Distinction explanation",
    concept_ids: ["induction", "abduction"],
    follow_up_id: "q1-p",
    confidence: "high",
  });

  assert.equal(machine.getState().status, "diagnosis");

  // Start follow-up
  assert.equal(machine.startFollowUp(), true);
  const followUpState = machine.getState();
  assert.equal(followUpState.status, "follow_up_answering");
  if (followUpState.status === "follow_up_answering") {
    assert.equal(followUpState.activeFollowUp.id, "q1-p");
    assert.equal(followUpState.isExtra, false);
  }

  // Answer follow-up incorrectly (Choice A is wrong for q1-p; C is correct)
  machine.selectFollowUpChoice("A");
  assert.equal(machine.checkFollowUpAnswer(), true);

  const checkedState = machine.getState();
  assert.equal(checkedState.status, "follow_up_checked");
  if (checkedState.status === "follow_up_checked") {
    assert.equal(checkedState.isCorrect, false);
    // Unused eligible linked example q1-e is discovered!
    assert.equal(checkedState.unusedLinkedFollowUpId, "q1-e");
  }

  // Cannot change choice after follow-up is checked!
  assert.equal(machine.selectFollowUpChoice("C"), false);

  // Verify learning evidence emitted for primary follow-up result
  const followUpEv = machine.getState().learningEvidence.find((e) => e.kind === "follow_up_result");
  assert.ok(followUpEv);
  assert.equal(followUpEv.kind, "follow_up_result");
  assert.equal(followUpEv.followUpId, "q1-p");
  assert.equal(followUpEv.isCorrect, false);
  assert.deepEqual(followUpEv.conceptPair, ["induction", "abduction"]);

  // Start extra example
  assert.equal(machine.tryExtraExample(), true);
  const extraState = machine.getState();
  assert.equal(extraState.status, "follow_up_answering");
  if (extraState.status === "follow_up_answering") {
    assert.equal(extraState.activeFollowUp.id, "q1-e");
    assert.equal(extraState.isExtra, true);
  }

  // Answer extra example (Choice C is correct)
  machine.selectFollowUpChoice("C");
  assert.equal(machine.checkFollowUpAnswer(), true);

  const checkedExtraState = machine.getState();
  assert.equal(checkedExtraState.status, "follow_up_checked");
  if (checkedExtraState.status === "follow_up_checked") {
    assert.equal(checkedExtraState.isCorrect, true);
    // FINITE PATH: all linked follow-ups shown, so unusedLinkedFollowUpId MUST be null!
    assert.equal(checkedExtraState.unusedLinkedFollowUpId, null);
  }

  // tryExtraExample MUST return false (finite path, never loops)
  assert.equal(machine.tryExtraExample(), false);

  // Advance to Q2
  assert.equal(machine.advanceToNextQuestion(), true);
  assert.equal(machine.getState().status, "question_answering");
  assert.equal(machine.getState().currentQuestionIndex, 1);
});

test("single follow-up question terminates follow-up branch honestly without repeating itself", () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const policy = new DefaultClarificationPolicy();
  const machine = new PracticeStateMachine({
    questions: store.getQuestions(),
    contentStore: store,
    clarificationPolicy: policy,
  });

  // Advance to Q2 (which only links q2-p and has no extra follow-up)
  machine.selectChoice("C"); // Correct on Q1
  machine.checkAnswer();
  machine.advanceToNextQuestion();

  assert.equal(machine.getState().currentQuestion.id, "q2");

  // Wrong answer on Q2 (Choice B wrong; A correct)
  machine.selectChoice("B");
  machine.checkAnswer();
  machine.setReasoning("Explanation for Q2");
  const prep = machine.prepareSubmission();
  machine.applyFallbackResponse(prep.submissionId!, {
    kind: "fallback",
    verified_explanation: "Fallback verified text",
    follow_up_id: "q2-p",
  });

  assert.equal(machine.getState().status, "fallback");
  machine.startFollowUp();
  const followUpState = machine.getState();
  assert.equal(followUpState.status, "follow_up_answering");
  if (followUpState.status === "follow_up_answering") {
    assert.equal(followUpState.activeFollowUp.id, "q2-p");
  }

  // Answer q2-p incorrectly (Choice B wrong; A is correct)
  machine.selectFollowUpChoice("B");
  machine.checkFollowUpAnswer();

  const state = machine.getState();
  assert.equal(state.status, "follow_up_checked");
  if (state.status === "follow_up_checked") {
    assert.equal(state.isCorrect, false);
    // There are no unused follow-ups linked to Q2!
    assert.equal(state.unusedLinkedFollowUpId, null);
  }

  // Calling tryExtraExample is rejected
  assert.equal(machine.tryExtraExample(), false);

  // Can only advance, and Q2 is the last question -> session completes!
  assert.equal(machine.advanceToNextQuestion(), true);
  assert.equal(machine.getState().status, "session_completed");
  assert.equal(machine.getState().isSessionCompleted, true);
});

test("session-aware learning evidence deduplication and resetSession", () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);
  const policy = new DefaultClarificationPolicy();
  const machine = new PracticeStateMachine({
    questions: store.getQuestions(),
    contentStore: store,
    clarificationPolicy: policy,
  });

  // Answer Q1 correctly
  machine.selectChoice("C");
  machine.checkAnswer();
  assert.equal(machine.getState().learningEvidence.length, 1);
  const initialSessionId = machine.getState().sessionId;

  // Invalid attempts to re-check do not duplicate evidence
  machine.checkAnswer();
  assert.equal(machine.getState().learningEvidence.length, 1);

  // Reset session
  machine.resetSession("new-session-id");
  const resetState = machine.getState();
  assert.equal(resetState.sessionId, "new-session-id");
  assert.notEqual(resetState.sessionId, initialSessionId);
  assert.equal(resetState.learningEvidence.length, 0);

  // New session can earn credit again legitimately
  machine.selectChoice("C");
  machine.checkAnswer();
  assert.equal(machine.getState().learningEvidence.length, 1);
  assert.equal(machine.getState().learningEvidence[0]!.sessionId, "new-session-id");
});

test("PracticeContentStore rejects follow-up with repeated pair members", () => {
  const content = createMockContent();
  content.followUps.push({
    id: "bad-followup-repeated",
    subject_id: "critical-thinking",
    text: "Bad text",
    choices: [
      { id: "A", text: "A" },
      { id: "B", text: "B" },
      { id: "C", text: "C" },
    ],
    correct_choice_id: "A",
    concept_ids: ["induction"],
    verified_explanation: "Explanation",
    follow_up_ids: [],
    concept_pair: ["induction", "induction"],
  });

  assert.throws(
    () => new PracticeContentStore(content),
    /must be two distinct concepts/
  );
});

test("PracticeContentStore rejects follow-up where concept_pair member is not in concept_ids", () => {
  const content = createMockContent();
  content.followUps.push({
    id: "bad-followup-missing-id",
    subject_id: "critical-thinking",
    text: "Bad text",
    choices: [
      { id: "A", text: "A" },
      { id: "B", text: "B" },
      { id: "C", text: "C" },
    ],
    correct_choice_id: "A",
    concept_ids: ["induction"], // Missing "abduction"!
    verified_explanation: "Explanation",
    follow_up_ids: [],
    concept_pair: ["induction", "abduction"],
  });

  assert.throws(
    () => new PracticeContentStore(content),
    /concept_pair member 'abduction' is not included in concept_ids/
  );
});

test("PracticeContentStore rejects question linking follow-up with existing-but-wrong concept pair", () => {
  const content = createMockContent();
  // Question with induction/deduction distinction links to q1-p which has induction/abduction distinction!
  content.questions.push({
    id: "q-mismatched",
    subject_id: "critical-thinking",
    text: "Mismatched question",
    choices: [
      { id: "A", text: "A" },
      { id: "B", text: "B" },
      { id: "C", text: "C" },
    ],
    correct_choice_id: "A",
    concept_ids: ["induction", "deduction"],
    verified_explanation: "Explanation",
    follow_up_ids: ["q1-p"], // q1-p has ["induction", "abduction"], not ["induction", "deduction"]!
  });

  assert.throws(
    () => new PracticeContentStore(content),
    /does not match question distinction/
  );
});

test("isFollowUpLinkedToQuestion and findUnusedLinkedFollowUp enforce distinction matching", () => {
  const content = createMockContent();
  const store = new PracticeContentStore(content);

  // q1 tests induction/abduction, links q1-p and q1-e
  assert.equal(store.isFollowUpLinkedToQuestion("q1", "q1-p"), true);
  assert.equal(store.isFollowUpLinkedToQuestion("q1", "q1-e"), true);
  // q2-p is linked to q2 (induction/deduction), not q1
  assert.equal(store.isFollowUpLinkedToQuestion("q1", "q2-p"), false);
  // Nonexistent follow-up
  assert.equal(store.isFollowUpLinkedToQuestion("q1", "nonexistent"), false);

  // findUnusedLinkedFollowUp preserves active distinction
  const unused1 = store.findUnusedLinkedFollowUp("q1", ["q1-p"]);
  assert.ok(unused1);
  assert.equal(unused1.id, "q1-e");
  assert.deepEqual(unused1.concept_pair, ["induction", "abduction"]);

  // When all linked follow-ups shown, returns null
  const unusedAll = store.findUnusedLinkedFollowUp("q1", ["q1-p", "q1-e"]);
  assert.equal(unusedAll, null);
});
