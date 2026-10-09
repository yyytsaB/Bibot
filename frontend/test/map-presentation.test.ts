import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapPresentation } from '../src/state/map-presentation.ts';
import { LearningMapStore } from '../src/state/learning-map.ts';
import { getReviewedContentStore } from '../src/state/load-reviewed-content.ts';
import { createPracticeSession } from '../src/state/practice-session.ts';
import type { LearningEvidenceEvent } from '../src/state/types.ts';

const content = getReviewedContentStore();
const question = content.getQuestion('q1')!;
function initial(correct: boolean, sessionId: string): LearningEvidenceEvent {
  const common = { eventId: `${sessionId}-q1`, sessionId, timestamp: 100, questionId: question.id, conceptIds: [...question.concept_ids] };
  return correct ? { ...common, kind: 'correct_first_try' } : {
    ...common, kind: 'wrong_initial', selectedChoiceId: question.choices.find(choice => choice.id !== question.correct_choice_id)!.id,
  };
}

test('F11 presents exactly the reviewed F10 graph with named statuses and definitions', () => {
  const snapshot = new LearningMapStore(content).getSnapshot();
  const view = createMapPresentation(snapshot);
  assert.equal(view.hasEvidence, false);
  assert.deepEqual(view.confusedPairs, []);
  assert.deepEqual(view.nodes.map(node => node.id), snapshot.nodes.map(node => node.id));
  assert.deepEqual(view.edges.map(edge => [edge.id, edge.source, edge.target]), snapshot.edges.map(edge => [edge.id, edge.source, edge.target]));
  for (const node of view.nodes) {
    assert.equal(node.data.label, content.getConcept(node.id)!.name);
    assert.equal(node.data.definition, content.getConcept(node.id)!.definition);
    assert.equal(node.data.status, 'Not Yet Practiced');
    assert.equal(node.data.color, 'gray');
    assert.equal(node.data.consecutiveCorrect, 0);
    assert.equal(node.connectable, false);
    assert.equal(node.draggable, false);
  }
  assert.ok(view.edges.every(edge => edge.className === 'live-map-edge'));
});

test('F11 updates red, amber and green from evidence while retaining recorded confusion history', () => {
  const map = new LearningMapStore(content);
  map.applyEvent(initial(false, 'wrong'));
  let view = createMapPresentation(map.getSnapshot());
  assert.equal(view.hasEvidence, true);
  assert.equal(view.edges.filter(edge => edge.className === 'live-map-edge-confused').length, 1);
  assert.equal(view.confusedPairs[0]!.count, 1);
  assert.ok(view.confusedPairs[0]!.label.includes('Abductive Reasoning'));
  assert.ok(view.nodes.filter(node => question.concept_ids.includes(node.id)).every(node => node.data.status === 'Needs Review' && node.data.color === 'red'));
  const follow = content.getFollowUp(question.follow_up_ids[0]!)!;
  map.applyEvent({ kind: 'follow_up_result', eventId: 'follow', sessionId: 'wrong', timestamp: 200, questionId: question.id,
    followUpId: follow.id, isExtra: false, isCorrect: true, conceptPair: [follow.concept_pair[0], follow.concept_pair[1]] });
  view = createMapPresentation(map.getSnapshot());
  assert.ok(view.nodes.filter(node => follow.concept_pair.includes(node.id)).every(node => node.data.status === 'Improving' && node.data.color === 'amber' && node.data.consecutiveCorrect === 1));
  map.applyEvent(initial(true, 'next-session'));
  view = createMapPresentation(map.getSnapshot());
  assert.ok(view.nodes.filter(node => question.concept_ids.includes(node.id)).every(node => node.data.status === 'Understanding Demonstrated' && node.data.color === 'green' && node.data.consecutiveCorrect === 2));
  assert.equal(view.nodes.find(node => node.id === 'deduction')!.data.status, 'Not Yet Practiced');
  assert.equal(view.confusedPairs[0]!.count, 1);
  assert.equal(view.edges.filter(edge => edge.className === 'live-map-edge-confused').length, 1);
});

test('F11 presentation cannot mutate authoritative learning state', () => {
  const map = new LearningMapStore(content);
  map.applyEvent(initial(false, 'wrong'));
  const snapshot = map.getSnapshot();
  const before = structuredClone(snapshot);
  const view = createMapPresentation(snapshot);
  view.nodes[0]!.position.x = 999;
  view.nodes[0]!.data.status = 'Understanding Demonstrated';
  view.edges[0]!.source = 'invented';
  view.confusedPairs[0]!.count = 999;
  assert.deepEqual(snapshot, before);
  assert.deepEqual(map.getSnapshot(), before);
});

test('F11 shares practice evidence and restores the same graph without duplicate credit or AI calls', () => {
  let saved: string | null = null;
  const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
  const apiClient = { submitFeedback: async () => { throw new Error('Unexpected AI call'); } };
  const session = createPracticeSession({ storage, apiClient });
  let updates = 0;
  const stop = session.subscribe(() => { updates++; });
  session.controller.selectChoice(question.correct_choice_id);
  session.controller.checkAnswer();
  const before = createMapPresentation(session.map.getSnapshot());
  assert.ok(updates > 1);
  assert.ok(before.nodes.filter(node => question.concept_ids.includes(node.id)).every(node => node.data.status === 'Improving'));
  stop();
  const restored = createPracticeSession({ storage, apiClient });
  const stopRestored = restored.subscribe(() => {});
  assert.deepEqual(createMapPresentation(restored.map.getSnapshot()), before);
  assert.equal(restored.getSnapshot().state.status, 'question_correct');
  stopRestored();
});
