import { describe, it } from "node:test";
import assert from "node:assert";
import {
  ConceptSchema,
  QuestionSchema,
  FollowUpSchema,
  FeedbackResultSchema,
  FallbackResultSchema,
} from "../dist/index.js";
import {
  fixtureConcepts,
  fixtureFollowUps,
  fixtureQuestion,
  fixtureQuestions,
  fixtureDiagnosisResult,
  fixtureClarificationResult,
  fixtureFallbackResult,
  fixtureInitialMapSnapshot,
  fixtureProgressingMapSnapshot,
  fixtureReadinessReady,
  fixtureReadinessUnavailable,
  fixtureHomeData,
} from "../dist/fixtures.js";

describe("Fixtures - Schema Validation", () => {
  it("validates all fixture concepts against ConceptSchema", () => {
    assert.strictEqual(fixtureConcepts.length, 3);
    for (const concept of fixtureConcepts) {
      assert.deepStrictEqual(ConceptSchema.parse(concept), concept);
    }
  });

  it("validates all fixture follow-ups against FollowUpSchema", () => {
    assert.strictEqual(fixtureFollowUps.length, 2);
    for (const fu of fixtureFollowUps) {
      assert.deepStrictEqual(FollowUpSchema.parse(fu), fu);
    }
  });

  it("validates fixture question against QuestionSchema", () => {
    assert.deepStrictEqual(QuestionSchema.parse(fixtureQuestion), fixtureQuestion);
    for (const q of fixtureQuestions) {
      assert.deepStrictEqual(QuestionSchema.parse(q), q);
    }
  });

  it("validates all FeedbackResult variants against FeedbackResultSchema", () => {
    assert.deepStrictEqual(
      FeedbackResultSchema.parse(fixtureDiagnosisResult),
      fixtureDiagnosisResult
    );
    assert.deepStrictEqual(
      FeedbackResultSchema.parse(fixtureClarificationResult),
      fixtureClarificationResult
    );
    assert.deepStrictEqual(
      FeedbackResultSchema.parse(fixtureFallbackResult),
      fixtureFallbackResult
    );
  });
});

describe("Fixtures - Referential Consistency", () => {
  const conceptIdSet = new Set(fixtureConcepts.map((c) => c.id));
  const followUpIdSet = new Set(fixtureFollowUps.map((fu) => fu.id));

  it("ensures question references are internally consistent", () => {
    // correct_choice_id in choices
    assert.ok(
      fixtureQuestion.choices.some((c) => c.id === fixtureQuestion.correct_choice_id)
    );
    // concept_ids resolve in fixtureConcepts
    for (const cId of fixtureQuestion.concept_ids) {
      assert.ok(conceptIdSet.has(cId), `Missing concept: ${cId}`);
    }
    // follow_up_ids resolve in fixtureFollowUps
    for (const fuId of fixtureQuestion.follow_up_ids) {
      assert.ok(followUpIdSet.has(fuId), `Missing follow-up: ${fuId}`);
    }
  });

  it("ensures follow-up references are internally consistent", () => {
    for (const fu of fixtureFollowUps) {
      // correct_choice_id in choices
      assert.ok(fu.choices.some((c) => c.id === fu.correct_choice_id));
      // concept_ids resolve in fixtureConcepts
      for (const cId of fu.concept_ids) {
        assert.ok(conceptIdSet.has(cId), `Missing concept: ${cId}`);
      }
      // concept_pair resolve in fixtureConcepts
      assert.strictEqual(fu.concept_pair.length, 2);
      assert.ok(conceptIdSet.has(fu.concept_pair[0]));
      assert.ok(conceptIdSet.has(fu.concept_pair[1]));
    }
  });

  it("ensures diagnosis and fallback follow_up_id resolves to question-linked follow-up", () => {
    const questionLinkedSet = new Set(fixtureQuestion.follow_up_ids);

    // Diagnosis follow_up_id
    assert.ok(followUpIdSet.has(fixtureDiagnosisResult.follow_up_id));
    assert.ok(questionLinkedSet.has(fixtureDiagnosisResult.follow_up_id));

    // Fallback follow_up_id
    assert.ok(followUpIdSet.has(fixtureFallbackResult.follow_up_id));
    assert.ok(questionLinkedSet.has(fixtureFallbackResult.follow_up_id));
  });

  it("ensures diagnosis concept_ids resolve in fixtureConcepts", () => {
    assert.ok(fixtureDiagnosisResult.concept_ids.length > 0);
    for (const cId of fixtureDiagnosisResult.concept_ids) {
      assert.ok(conceptIdSet.has(cId), `Missing diagnosis concept: ${cId}`);
    }
  });

  it("ensures fallback verified_explanation matches question verified_explanation", () => {
    assert.strictEqual(
      fixtureFallbackResult.verified_explanation,
      fixtureQuestion.verified_explanation
    );
  });

  it("verifies absence of forbidden diagnosis fields in fallback fixture", () => {
    assert.strictEqual("possible_misconception" in fixtureFallbackResult, false);
    assert.strictEqual("diagnosis" in fixtureFallbackResult, false);
    assert.strictEqual("explanation" in fixtureFallbackResult, false);
    assert.strictEqual("concept_ids" in fixtureFallbackResult, false);
    assert.strictEqual("confidence" in fixtureFallbackResult, false);

    const parsed = FallbackResultSchema.parse(fixtureFallbackResult);
    assert.strictEqual("possible_misconception" in parsed, false);
    assert.strictEqual("diagnosis" in parsed, false);
  });
});

describe("Fixtures - Map Presentation", () => {
  const conceptIdSet = new Set(fixtureConcepts.map((c) => c.id));

  it("verifies node IDs and edge endpoints in initial map snapshot", () => {
    const snapshotNodeIds = new Set(fixtureInitialMapSnapshot.nodes.map((n) => n.id));
    for (const node of fixtureInitialMapSnapshot.nodes) {
      assert.ok(conceptIdSet.has(node.id), `Invalid node id: ${node.id}`);
    }
    for (const edge of fixtureInitialMapSnapshot.edges) {
      assert.ok(snapshotNodeIds.has(edge.source));
      assert.ok(snapshotNodeIds.has(edge.target));
    }
  });

  it("verifies node IDs, edge endpoints, and confused pairs in progressing map snapshot", () => {
    const snapshotNodeIds = new Set(fixtureProgressingMapSnapshot.nodes.map((n) => n.id));
    for (const node of fixtureProgressingMapSnapshot.nodes) {
      assert.ok(conceptIdSet.has(node.id), `Invalid node id: ${node.id}`);
    }
    for (const edge of fixtureProgressingMapSnapshot.edges) {
      assert.ok(snapshotNodeIds.has(edge.source));
      assert.ok(snapshotNodeIds.has(edge.target));
    }
    for (const pair of fixtureProgressingMapSnapshot.confused_pairs) {
      assert.ok(snapshotNodeIds.has(pair.concept_a));
      assert.ok(snapshotNodeIds.has(pair.concept_b));
    }
    // Confused edge present
    assert.ok(fixtureProgressingMapSnapshot.edges.some((e) => e.isConfused));
  });

  it("covers all four exact statuses across the two snapshots using only induction, deduction, abduction", () => {
    const allStatuses = new Set([
      ...fixtureInitialMapSnapshot.nodes.map((n) => n.status),
      ...fixtureProgressingMapSnapshot.nodes.map((n) => n.status),
    ]);

    assert.ok(allStatuses.has("Needs Review"), "Missing Needs Review");
    assert.ok(allStatuses.has("Improving"), "Missing Improving");
    assert.ok(
      allStatuses.has("Understanding Demonstrated"),
      "Missing Understanding Demonstrated"
    );
    assert.ok(allStatuses.has("Not Yet Practiced"), "Missing Not Yet Practiced");
    assert.strictEqual(allStatuses.size, 4);
  });
});

describe("Fixtures - Readiness and Home Presentation", () => {
  const conceptIdSet = new Set(fixtureConcepts.map((c) => c.id));

  it("verifies readiness fixtures present distinct ready and unavailable states", () => {
    assert.strictEqual(fixtureReadinessReady.isReady, true);
    assert.strictEqual(fixtureReadinessReady.statusLabel, "Local AI Ready");

    assert.strictEqual(fixtureReadinessUnavailable.isReady, false);
    assert.strictEqual(fixtureReadinessUnavailable.statusLabel, "Local AI Unavailable");
  });

  it("verifies Home presentation fixtures have prepared subject, disabled uploads, and valid map preview", () => {
    assert.strictEqual(fixtureHomeData.preparedSubject.id, "critical-thinking");
    assert.strictEqual(fixtureHomeData.preparedSubject.hasPreparedPractice, true);

    assert.strictEqual(fixtureHomeData.uploadStatus.disabled, true);
    assert.ok(fixtureHomeData.uploadStatus.label.length > 0);

    assert.ok(fixtureHomeData.mapPreviewNodes.length > 0);
    for (const node of fixtureHomeData.mapPreviewNodes) {
      assert.ok(conceptIdSet.has(node.id));
    }
  });
});
