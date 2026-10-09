import test from "node:test";
import assert from "node:assert/strict";
import { LearningMapStore, connectLearningMap } from "../src/state/learning-map.ts";
import { getReviewedContentStore } from "../src/state/load-reviewed-content.ts";
import { PracticeController } from "../src/state/controller.ts";
import { PracticeContentStore } from "../src/state/content-store.ts";
import type { LearningEvidenceEvent } from "../src/state/types.ts";

const content = getReviewedContentStore();

function initial(
  questionId: string, correct: boolean, sessionId = "session-1", timestamp = 100,
): LearningEvidenceEvent {
  const question = content.getQuestion(questionId)!;
  const common = {
    eventId: `${sessionId}-${questionId}`, sessionId, timestamp, questionId,
    conceptIds: [...question.concept_ids],
  };
  return correct
    ? { ...common, kind: "correct_first_try" }
    : {
      ...common, kind: "wrong_initial",
      selectedChoiceId: question.choices.find((choice) => choice.id !== question.correct_choice_id)!.id,
    };
}

function followUp(
  followUpId: string, isCorrect: boolean, sessionId = "session-1", timestamp = 200,
): LearningEvidenceEvent {
  const question = content.getQuestions().find((q) => q.follow_up_ids.includes(followUpId))!;
  const follow = content.getFollowUp(followUpId)!;
  return {
    kind: "follow_up_result", eventId: `${sessionId}-${followUpId}`, sessionId, timestamp,
    questionId: question.id, followUpId, isExtra: question.follow_up_ids[0] !== followUpId,
    isCorrect, conceptPair: [follow.concept_pair[0], follow.concept_pair[1]],
  };
}

function concept(map: LearningMapStore, id: string) {
  const found = map.getSnapshot().concepts.find((item) => item.concept_id === id);
  assert.ok(found);
  return found;
}

test("F10 initializes all reviewed graph concepts unpracticed with fixed nodes and valid links", () => {
  const map = new LearningMapStore(content);
  const snapshot = map.getSnapshot();
  assert.equal(snapshot.concepts.length, 3);
  assert.deepEqual(snapshot.confused_pairs, []);
  assert.equal(snapshot.edges.length, 3);
  const ids = new Set(snapshot.nodes.map((node) => node.id));
  assert.equal(ids.size, 3);
  for (const state of snapshot.concepts) {
    assert.equal(state.status, "Not Yet Practiced");
    assert.equal(state.consecutive_correct, 0);
    assert.equal(state.last_updated, null);
  }
  for (const node of snapshot.nodes) {
    assert.equal(node.color, "gray");
    assert.equal(node.label, content.getConcept(node.id)!.name);
    assert.equal(node.definition, content.getConcept(node.id)!.definition);
    assert.ok(Number.isFinite(node.position.x) && Number.isFinite(node.position.y));
  }
  for (const edge of snapshot.edges) {
    assert.ok(ids.has(edge.source) && ids.has(edge.target));
    assert.notEqual(edge.source, edge.target);
    assert.equal(edge.isConfused, false);
    assert.equal(edge.count, 0);
  }
});

test("F10 wrong initial answer credits only question concepts and highlights its canonical pair", () => {
  const map = new LearningMapStore(content);
  map.applyEvent(initial("q1", false));
  for (const id of ["induction", "abduction"]) {
    assert.deepEqual(concept(map, id), {
      concept_id: id, status: "Needs Review", consecutive_correct: 0, last_updated: 100,
    });
  }
  assert.equal(concept(map, "deduction").status, "Not Yet Practiced");
  assert.deepEqual(map.getSnapshot().confused_pairs, [
    { concept_a: "abduction", concept_b: "induction", count: 1 },
  ]);
  const highlighted = map.getSnapshot().edges.filter((edge) => edge.isConfused);
  assert.equal(highlighted.length, 1);
  assert.equal(highlighted[0].count, 1);
  assert.ok(map.getSnapshot().nodes.filter((node) => node.status === "Needs Review").every((node) => node.color === "red"));
});

test("F10 correct first tries move only affected concepts through amber to green", () => {
  const map = new LearningMapStore(content);
  map.applyEvent(initial("q1", true));
  assert.equal(concept(map, "induction").status, "Improving");
  assert.equal(concept(map, "abduction").consecutive_correct, 1);
  assert.equal(concept(map, "deduction").consecutive_correct, 0);
  assert.equal(map.getSnapshot().nodes.find((node) => node.id === "induction")!.color, "amber");
  map.applyEvent(initial("q2", true, "session-1", 300));
  assert.equal(concept(map, "induction").status, "Understanding Demonstrated");
  assert.equal(concept(map, "abduction").consecutive_correct, 2);
  assert.equal(concept(map, "abduction").last_updated, 300);
  assert.equal(map.getSnapshot().nodes.find((node) => node.id === "induction")!.color, "green");
  assert.deepEqual(map.getSnapshot().confused_pairs, []);
});

test("F10 wrong answers reset demonstrated understanding and require two fresh correct answers", () => {
  const map = new LearningMapStore(content);
  map.applyEvidence([initial("q1", true), initial("q2", true)]);
  map.applyEvent(initial("q1", false, "session-2", 400));
  assert.equal(concept(map, "induction").consecutive_correct, 0);
  assert.equal(concept(map, "induction").status, "Needs Review");
  map.applyEvent(followUp("q1-p", true, "session-2", 500));
  assert.equal(concept(map, "induction").status, "Improving");
  map.applyEvent(initial("q2", true, "session-2", 600));
  assert.equal(concept(map, "induction").status, "Understanding Demonstrated");
  assert.equal(concept(map, "induction").consecutive_correct, 2);
});

test("F10 follow-up pair attribution and canonical counts survive reversed pair order", () => {
  const map = new LearningMapStore(content);
  map.applyEvent(initial("q1", false));
  const wrongFollow = followUp("q1-p", false);
  assert.equal(wrongFollow.kind, "follow_up_result");
  if (wrongFollow.kind !== "follow_up_result") throw new Error("Expected follow-up event");
  wrongFollow.conceptPair.reverse();
  map.applyEvent(wrongFollow);
  map.applyEvent(followUp("q1-e", true));
  assert.equal(concept(map, "induction").status, "Improving");
  assert.equal(concept(map, "abduction").consecutive_correct, 1);
  assert.equal(concept(map, "deduction").status, "Not Yet Practiced");
  assert.deepEqual(map.getSnapshot().confused_pairs, [
    { concept_a: "abduction", concept_b: "induction", count: 2 },
  ]);
});

test("F10 repeated cumulative evidence and duplicate answer IDs cannot inflate credit", () => {
  const map = new LearningMapStore(content);
  const first = initial("q1", false);
  const second = followUp("q1-p", true);
  assert.equal(map.applyEvidence([first, second]), 2);
  assert.equal(map.applyEvidence([first, second]), 0);
  assert.equal(map.applyEvent({ ...second, eventId: "different-event-same-answer" }), false);
  assert.equal(map.applyEvent(initial("q1", true)), false);
  assert.equal(concept(map, "induction").consecutive_correct, 1);
  assert.equal(map.getSnapshot().confused_pairs[0].count, 1);
  assert.equal(map.applyEvent(initial("q1", true, "new-session")), true);
  assert.equal(concept(map, "induction").consecutive_correct, 2);
});

test("F10 event identity is session-scoped and counters are independent per concept", () => {
  const map = new LearningMapStore(content);
  const a = initial("q1", true);
  const b = initial("q3", true, "session-2");
  b.eventId = a.eventId;
  map.applyEvidence([a, b]);
  assert.equal(concept(map, "induction").consecutive_correct, 2);
  assert.equal(concept(map, "deduction").consecutive_correct, 1);
  assert.equal(concept(map, "abduction").consecutive_correct, 1);
});

test("F10 invalid references and forged attribution leave state unchanged and events reusable", () => {
  const map = new LearningMapStore(content);
  const before = map.getSnapshot();
  const event = initial("q1", false);
  const invalid = [
    { ...event, questionId: "missing" },
    { ...event, conceptIds: ["deduction", "abduction"] },
    { ...event, conceptIds: ["induction", "induction"] },
    { ...event, timestamp: NaN },
    { ...event, sessionId: "" },
    { ...event, selectedChoiceId: "C" },
    { ...event, selectedChoiceId: "missing-choice" },
    { ...followUp("q1-p", true), followUpId: "q2-p" },
    { ...followUp("q1-p", true), conceptPair: ["deduction", "abduction"] },
  ];
  for (const item of invalid) {
    assert.throws(() => map.applyEvent(item as LearningEvidenceEvent));
    assert.deepEqual(map.getSnapshot(), before);
  }
  assert.equal(map.applyEvent(event), true);
});

test("F10 snapshots cannot mutate internal counters, graph positions, or confused pairs", () => {
  const map = new LearningMapStore(content);
  map.applyEvent(initial("q1", false));
  const before = map.getSnapshot();
  const leaked = map.getSnapshot();
  leaked.concepts[0].consecutive_correct = 999;
  leaked.nodes[0].position.x = 999;
  leaked.nodes[0].label = "Invented concept";
  leaked.confused_pairs[0].count = 999;
  leaked.edges[0].count = 999;
  assert.deepEqual(map.getSnapshot(), before);
});

test("F10 rejects content missing a predefined concept instead of inventing a node", () => {
  const emptyContent = new PracticeContentStore({ concepts: [], questions: [], followUps: [] });
  assert.throws(() => new LearningMapStore(emptyContent), /requires reviewed concept/);
});

test("F10 controller integration: wrong answer, clarification, fallback, follow-up, next question", async () => {
  let calls = 0;
  const controller = new PracticeController({
    contentStore: content, sessionId: "integration-session",
    apiClient: { submitFeedback: async () => {
      calls++;
      return calls === 1
        ? { ok: true, data: { kind: "clarification", clarification_prompt: "Which scenario detail mattered?" } }
        : { ok: true, data: {
          kind: "fallback", verified_explanation: content.getQuestion("q1")!.verified_explanation,
          follow_up_id: "q1-p",
        } };
    } },
  });
  controller.selectChoice("A");
  controller.checkAnswer();
  const map = new LearningMapStore(content);
  const disconnect = connectLearningMap(controller, map); // Replays evidence emitted before attachment.
  assert.equal(concept(map, "induction").status, "Needs Review");
  controller.setReasoning("I guessed.");
  await controller.submitReasoning();
  assert.equal(controller.getState().status, "clarification");
  controller.editReasoning();
  controller.setReasoning("Still unsure.");
  await controller.submitReasoning();
  assert.equal(controller.getState().status, "fallback");
  assert.equal(map.getSnapshot().confused_pairs[0].count, 1); // Feedback is not another answer.
  controller.startFollowUp();
  controller.selectFollowUpChoice(content.getFollowUp("q1-p")!.correct_choice_id);
  controller.checkFollowUpAnswer();
  controller.checkFollowUpAnswer(); // Duplicate click must not award credit.
  assert.equal(concept(map, "abduction").status, "Improving");
  assert.equal(concept(map, "abduction").consecutive_correct, 1);
  controller.advanceToNextQuestion();
  controller.selectChoice(content.getQuestion("q2")!.correct_choice_id);
  controller.checkAnswer();
  assert.equal(concept(map, "abduction").status, "Understanding Demonstrated");
  assert.equal(calls, 2);
  assert.equal(concept(map, "deduction").status, "Not Yet Practiced");
  disconnect();
  const frozen = map.getSnapshot();
  controller.resetSession("another-session");
  controller.selectChoice("A");
  controller.checkAnswer();
  assert.deepEqual(map.getSnapshot(), frozen);
});
