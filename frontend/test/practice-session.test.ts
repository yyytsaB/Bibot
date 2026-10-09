import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpFeedbackApiClient, type FeedbackApiResponse, type IFeedbackApiClient } from '../src/api/client.ts';
import { createPracticeSession, getPracticePresentation } from '../src/state/practice-session.ts';
import { getReviewedContentStore } from '../src/state/load-reviewed-content.ts';

const content = getReviewedContentStore();
const question = content.getQuestions()[0]!;
const fallback = { kind: 'fallback' as const, verified_explanation: question.verified_explanation, follow_up_id: question.follow_up_ids[0]! };
function memoryStorage(initial: string | null = null) {
  let saved = initial;
  return { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
}
function setup(responses: FeedbackApiResponse[] = []) {
  const calls: unknown[] = [];
  const api: IFeedbackApiClient = { submitFeedback: async request => {
    calls.push(request);
    const response = responses.shift();
    assert.ok(response, 'Unexpected model request');
    return response;
  } };
  const storage = memoryStorage();
  const session = createPracticeSession({ contentStore: content, apiClient: api, storage });
  const stop = session.subscribe(() => {});
  return { session, storage, api, calls, stop };
}
function wrong(session: ReturnType<typeof createPracticeSession>) {
  session.controller.selectChoice(question.choices.find(choice => choice.id !== question.correct_choice_id)!.id);
  session.controller.checkAnswer();
  session.controller.setReasoning('I guessed.');
}

test('reviewed questions, correct-answer navigation, and completion use zero model calls', () => {
  const { session, calls, stop } = setup();
  assert.equal(getPracticePresentation(session.getSnapshot().state).question.text, question.text);
  for (const item of content.getQuestions()) {
    session.controller.selectChoice(item.correct_choice_id);
    session.controller.checkAnswer();
    const presentation = getPracticePresentation(session.getSnapshot().state);
    assert.equal(presentation.view, 'correct');
    assert.equal(presentation.correctInitial, true);
    assert.equal(presentation.question.verified_explanation, item.verified_explanation);
    session.controller.advanceToNextQuestion();
  }
  assert.equal(getPracticePresentation(session.getSnapshot().state).view, 'completed');
  assert.equal(calls.length, 0);
  assert.equal(session.map.getEvidence().length, 6);
  stop();
});

test('clarification resubmission reaches verified fallback without exposing a diagnosis', async () => {
  const { session, calls, stop } = setup([
    { ok: true, data: { kind: 'clarification', clarification_prompt: 'Which facts support your choice?' } },
    { ok: true, data: fallback },
  ]);
  wrong(session);
  await session.controller.submitReasoning();
  assert.equal(getPracticePresentation(session.getSnapshot().state).feedback?.kind, 'clarification');
  session.controller.setReasoning('I still guessed.');
  await session.controller.submitReasoning();
  assert.deepEqual(getPracticePresentation(session.getSnapshot().state).feedback, fallback);
  assert.equal('possible_misconception' in getPracticePresentation(session.getSnapshot().state).feedback!, false);
  assert.deepEqual(calls.map(request => (request as { clarification_attempt_count: number }).clarification_attempt_count), [0, 1]);
  stop();
});

test('diagnosis renders only the accepted result and a correct follow-up credits the map once', async () => {
  const diagnosis = { kind: 'diagnosis' as const, possible_misconception: 'Possible confusion about generalization.', explanation: 'Reviewed distinction.', concept_ids: question.concept_ids, follow_up_id: question.follow_up_ids[0]!, confidence: 'low' as const };
  const { session, stop } = setup([{ ok: true, data: diagnosis }]);
  wrong(session);
  await session.controller.submitReasoning();
  assert.deepEqual(getPracticePresentation(session.getSnapshot().state).feedback, diagnosis);
  session.controller.startFollowUp();
  const follow = getPracticePresentation(session.getSnapshot().state);
  assert.equal(follow.view, 'follow-up');
  assert.equal(follow.selectedChoiceId, null);
  session.controller.selectFollowUpChoice(follow.question.correct_choice_id);
  session.controller.checkFollowUpAnswer();
  session.controller.checkFollowUpAnswer();
  assert.equal(getPracticePresentation(session.getSnapshot().state).view, 'correct');
  assert.ok(session.map.getSnapshot().concepts.filter(item => question.concept_ids.includes(item.concept_id)).every(item => item.status === 'Improving' && item.consecutive_correct === 1));
  stop();
});

test('wrong follow-up offers the extra example and terminates honestly when it is exhausted', async () => {
  const { session, stop } = setup([{ ok: true, data: fallback }]);
  wrong(session);
  await session.controller.submitReasoning();
  session.controller.startFollowUp();
  for (let index = 0; index < 2; index++) {
    const follow = getPracticePresentation(session.getSnapshot().state).question;
    session.controller.selectFollowUpChoice(follow.choices.find(choice => choice.id !== follow.correct_choice_id)!.id);
    session.controller.checkFollowUpAnswer();
    const view = getPracticePresentation(session.getSnapshot().state);
    assert.equal(view.view, 'incorrect');
    assert.equal(view.hasExtraExample, index === 0);
    if (!index) session.controller.tryExtraExample();
  }
  session.controller.advanceToNextQuestion();
  assert.equal(session.getSnapshot().state.currentQuestionIndex, 1);
  stop();
});

test('HTTP errors retain editable reasoning and retry sends the exact reviewed request', async () => {
  const requests: { url: string; body: unknown }[] = [];
  const api = new HttpFeedbackApiClient({ fetchFn: (async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return requests.length === 1 ? new Response('offline', { status: 503 }) : Response.json(fallback);
  }) as typeof fetch });
  const session = createPracticeSession({ apiClient: api, storage: memoryStorage() });
  const stop = session.subscribe(() => {});
  wrong(session);
  await session.controller.submitReasoning();
  let view = getPracticePresentation(session.getSnapshot().state);
  assert.equal(view.view, 'reasoning');
  assert.ok(view.errorMessage);
  assert.equal(view.reasoning, 'I guessed.');
  session.controller.setReasoning('Updated explanation.');
  await session.controller.submitReasoning();
  view = getPracticePresentation(session.getSnapshot().state);
  assert.equal(view.feedback?.kind, 'fallback');
  assert.deepEqual(requests[1], { url: '/api/feedback', body: { question_id: question.id, student_choice_id: 'A', student_reasoning: 'Updated explanation.', clarification_attempt_count: 0 } });
  stop();
});

test('pending analysis prevents duplicate submission and reload resumes editable reasoning', async () => {
  let finish!: (response: FeedbackApiResponse) => void;
  let calls = 0;
  const api: IFeedbackApiClient = { submitFeedback: () => { calls++; return new Promise(resolve => { finish = resolve; }); } };
  const storage = memoryStorage();
  const session = createPracticeSession({ apiClient: api, storage });
  const stop = session.subscribe(() => {});
  wrong(session);
  const pending = session.controller.submitReasoning();
  await session.controller.submitReasoning();
  assert.equal(getPracticePresentation(session.getSnapshot().state).busy, true);
  const restored = createPracticeSession({ apiClient: api, storage });
  assert.equal(restored.getSnapshot().state.status, 'reasoning');
  assert.equal(getPracticePresentation(restored.getSnapshot().state).reasoning, 'I guessed.');
  assert.equal(calls, 1);
  finish({ ok: true, data: fallback });
  await pending;
  stop();
});

test('route unmount/remount and reload preserve progress without duplicated learning evidence', () => {
  const { session, storage, api, stop } = setup();
  session.controller.selectChoice(question.correct_choice_id);
  session.controller.checkAnswer();
  stop();
  const stopAgain = session.subscribe(() => {});
  assert.equal(session.map.getEvidence().length, 1);
  const restored = createPracticeSession({ apiClient: api, storage });
  const stopRestored = restored.subscribe(() => {});
  assert.equal(restored.getSnapshot().state.status, 'question_correct');
  assert.deepEqual(restored.map.getSnapshot(), session.map.getSnapshot());
  assert.equal(restored.map.getEvidence().length, 1);
  stopAgain(); stopRestored();
});

test('corrupt or unavailable storage is reported while in-memory practice remains usable', () => {
  const invalid = createPracticeSession({ storage: memoryStorage('{bad') });
  const stopInvalid = invalid.subscribe(() => {});
  assert.match(invalid.getSnapshot().storageNotice!, /could not be restored/);
  const blocked = createPracticeSession({ storage: { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Quota'); } } });
  const stopBlocked = blocked.subscribe(() => {});
  blocked.controller.selectChoice(question.correct_choice_id);
  blocked.controller.checkAnswer();
  assert.equal(blocked.getSnapshot().state.status, 'question_correct');
  assert.match(blocked.getSnapshot().storageNotice!, /Saving is unavailable/);
  assert.equal(blocked.map.getEvidence().length, 1);
  stopInvalid(); stopBlocked();
});
