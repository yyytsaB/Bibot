import { describe, it } from "node:test";
import assert from "node:assert";
import {
  ConceptSchema,
  QuestionSchema,
  FollowUpSchema,
  ModelResponseSchema,
  FeedbackResultSchema,
  FallbackResultSchema,
} from "../dist/index.js";

describe("ConceptSchema", () => {
  it("validates kebab-case concept IDs", () => {
    const valid = {
      id: "inductive-reasoning",
      name: "Inductive Reasoning",
      definition: "Forming generalizations from observations.",
    };
    assert.deepStrictEqual(ConceptSchema.parse(valid), valid);
  });

  it("rejects non-kebab-case concept IDs", () => {
    assert.throws(() => {
      ConceptSchema.parse({
        id: "Inductive Reasoning",
        name: "Inductive Reasoning",
        definition: "Def",
      });
    });
    assert.throws(() => {
      ConceptSchema.parse({
        id: "inductive_reasoning",
        name: "Inductive Reasoning",
        definition: "Def",
      });
    });
  });
});

describe("QuestionSchema", () => {
  const baseValid = {
    id: "q1",
    subject_id: "critical-thinking",
    text: "Which type of reasoning is this?",
    choices: [
      { id: "c1", text: "Deduction" },
      { id: "c2", text: "Induction" },
      { id: "c3", text: "Abduction" },
    ],
    correct_choice_id: "c3",
    concept_ids: ["abduction", "induction"],
    verified_explanation: "This is abduction because it provides a plausible explanation.",
    follow_up_ids: ["fu1", "fu2"],
  };

  it("accepts a question with 3 choices", () => {
    assert.deepStrictEqual(QuestionSchema.parse(baseValid), baseValid);
  });

  it("accepts a question with 4 choices", () => {
    const fourChoices = {
      ...baseValid,
      choices: [...baseValid.choices, { id: "c4", text: "Analogy" }],
    };
    assert.deepStrictEqual(QuestionSchema.parse(fourChoices), fourChoices);
  });

  it("rejects fewer than 3 choices", () => {
    const twoChoices = {
      ...baseValid,
      choices: [
        { id: "c1", text: "Deduction" },
        { id: "c2", text: "Induction" },
      ],
    };
    assert.throws(() => QuestionSchema.parse(twoChoices));
  });

  it("rejects more than 4 choices", () => {
    const fiveChoices = {
      ...baseValid,
      choices: [
        { id: "c1", text: "Deduction" },
        { id: "c2", text: "Induction" },
        { id: "c3", text: "Abduction" },
        { id: "c4", text: "Analogy" },
        { id: "c5", text: "Heuristic" },
      ],
    };
    assert.throws(() => QuestionSchema.parse(fiveChoices));
  });

  it("rejects correct_choice_id that does not match any choice", () => {
    const invalidChoiceId = {
      ...baseValid,
      correct_choice_id: "c99",
    };
    assert.throws(() => QuestionSchema.parse(invalidChoiceId));
  });

  it("rejects empty concept_ids", () => {
    const emptyConcepts = {
      ...baseValid,
      concept_ids: [],
    };
    assert.throws(() => QuestionSchema.parse(emptyConcepts));
  });
});

describe("FollowUpSchema", () => {
  const validFollowUp = {
    id: "fu1",
    subject_id: "critical-thinking",
    text: "Follow-up question scenario.",
    choices: [
      { id: "c1", text: "Deduction" },
      { id: "c2", text: "Induction" },
      { id: "c3", text: "Abduction" },
    ],
    correct_choice_id: "c3",
    concept_ids: ["abduction"],
    verified_explanation: "Verified explanation for follow-up.",
    follow_up_ids: [],
    concept_pair: ["induction", "abduction"],
  };

  it("accepts valid follow-up with concept_pair 2-tuple", () => {
    assert.deepStrictEqual(FollowUpSchema.parse(validFollowUp), validFollowUp);
  });

  it("rejects concept_pair with 1 element", () => {
    const invalidPair = {
      ...validFollowUp,
      concept_pair: ["induction"],
    };
    assert.throws(() => FollowUpSchema.parse(invalidPair));
  });

  it("rejects concept_pair with 3 elements", () => {
    const invalidPair = {
      ...validFollowUp,
      concept_pair: ["induction", "abduction", "deduction"],
    };
    assert.throws(() => FollowUpSchema.parse(invalidPair));
  });
});

describe("ModelResponseSchema", () => {
  it("accepts valid diagnosis response", () => {
    const validDiagnosis = {
      status: "possible_misconception",
      possible_misconception: "Confusing induction with abduction.",
      explanation: "Induction generalizes while abduction explains an observation.",
      concept_ids: ["induction", "abduction"],
      follow_up_id: "fu1",
      needs_clarification: false,
      clarification_prompt: null,
      confidence: "high",
    };
    assert.deepStrictEqual(ModelResponseSchema.parse(validDiagnosis), validDiagnosis);
  });

  it("accepts valid diagnosis response with null follow_up_id (to be repaired in F4)", () => {
    const validDiagnosisNullFollowUp = {
      status: "possible_misconception",
      possible_misconception: "Confusing induction with abduction.",
      explanation: "Induction generalizes while abduction explains an observation.",
      concept_ids: ["induction"],
      follow_up_id: null,
      needs_clarification: false,
      clarification_prompt: null,
      confidence: "medium",
    };
    assert.deepStrictEqual(
      ModelResponseSchema.parse(validDiagnosisNullFollowUp),
      validDiagnosisNullFollowUp
    );
  });

  it("rejects diagnosis response with empty concept_ids", () => {
    const missingConcepts = {
      status: "possible_misconception",
      possible_misconception: "Some misconception.",
      explanation: "Explanation text.",
      concept_ids: [],
      follow_up_id: "fu1",
      needs_clarification: false,
      clarification_prompt: null,
      confidence: "medium",
    };
    assert.throws(() => ModelResponseSchema.parse(missingConcepts));
  });

  it("rejects diagnosis response with null possible_misconception", () => {
    const nullMisconception = {
      status: "possible_misconception",
      possible_misconception: null,
      explanation: "Explanation text.",
      concept_ids: ["induction"],
      follow_up_id: "fu1",
      needs_clarification: false,
      clarification_prompt: null,
      confidence: "medium",
    };
    assert.throws(() => ModelResponseSchema.parse(nullMisconception));
  });

  it("rejects diagnosis response with contradictory needs_clarification: true", () => {
    const contradictory = {
      status: "possible_misconception",
      possible_misconception: "Some misconception.",
      explanation: "Explanation text.",
      concept_ids: ["induction"],
      follow_up_id: "fu1",
      needs_clarification: true,
      clarification_prompt: null,
      confidence: "medium",
    };
    assert.throws(() => ModelResponseSchema.parse(contradictory));
  });

  it("accepts valid clarification response", () => {
    const validClarification = {
      status: "needs_clarification",
      possible_misconception: null,
      explanation: "Student reasoning is too brief.",
      concept_ids: [],
      follow_up_id: null,
      needs_clarification: true,
      clarification_prompt: "Could you explain why you chose induction over abduction?",
      confidence: "low",
    };
    assert.deepStrictEqual(
      ModelResponseSchema.parse(validClarification),
      validClarification
    );
  });

  it("accepts valid clarification response with empty explanation string", () => {
    const validClarificationEmptyExplanation = {
      status: "needs_clarification",
      possible_misconception: null,
      explanation: "",
      concept_ids: [],
      follow_up_id: null,
      needs_clarification: true,
      clarification_prompt: "Could you explain why you chose induction over abduction?",
      confidence: "low",
    };
    assert.deepStrictEqual(
      ModelResponseSchema.parse(validClarificationEmptyExplanation),
      validClarificationEmptyExplanation
    );
  });

  it("rejects clarification response with contradictory needs_clarification: false", () => {
    const contradictory = {
      status: "needs_clarification",
      possible_misconception: null,
      explanation: "Reasoning vague.",
      concept_ids: [],
      follow_up_id: null,
      needs_clarification: false,
      clarification_prompt: "Can you elaborate?",
      confidence: "low",
    };
    assert.throws(() => ModelResponseSchema.parse(contradictory));
  });

  it("rejects clarification response with empty or null clarification_prompt", () => {
    assert.throws(() => {
      ModelResponseSchema.parse({
        status: "needs_clarification",
        possible_misconception: null,
        explanation: "Reasoning vague.",
        concept_ids: [],
        follow_up_id: null,
        needs_clarification: true,
        clarification_prompt: null,
        confidence: "low",
      });
    });
    assert.throws(() => {
      ModelResponseSchema.parse({
        status: "needs_clarification",
        possible_misconception: null,
        explanation: "Reasoning vague.",
        concept_ids: [],
        follow_up_id: null,
        needs_clarification: true,
        clarification_prompt: "   ",
        confidence: "low",
      });
    });
  });

  it("rejects clarification response with non-null possible_misconception", () => {
    const forbiddenField = {
      status: "needs_clarification",
      possible_misconception: "Premature diagnosis.",
      explanation: "Reasoning vague.",
      concept_ids: [],
      follow_up_id: null,
      needs_clarification: true,
      clarification_prompt: "Please clarify your reasoning.",
      confidence: "low",
    };
    assert.throws(() => ModelResponseSchema.parse(forbiddenField));
  });

  it("rejects clarification response with non-null follow_up_id", () => {
    const forbiddenFollowUp = {
      status: "needs_clarification",
      possible_misconception: null,
      explanation: "Reasoning vague.",
      concept_ids: [],
      follow_up_id: "fu1",
      needs_clarification: true,
      clarification_prompt: "Please clarify your reasoning.",
      confidence: "low",
    };
    assert.throws(() => ModelResponseSchema.parse(forbiddenFollowUp));
  });
});

describe("FeedbackResultSchema", () => {
  it("accepts valid diagnosis variant", () => {
    const diagnosis = {
      kind: "diagnosis",
      possible_misconception: "Confusing induction with abduction.",
      explanation: "Induction generalizes from observed patterns.",
      concept_ids: ["induction"],
      follow_up_id: "fu1",
      confidence: "high",
    };
    assert.deepStrictEqual(FeedbackResultSchema.parse(diagnosis), diagnosis);
  });

  it("accepts valid clarification variant", () => {
    const clarification = {
      kind: "clarification",
      clarification_prompt: "What made you choose this option?",
    };
    assert.deepStrictEqual(FeedbackResultSchema.parse(clarification), clarification);
  });

  it("accepts valid fallback variant", () => {
    const fallback = {
      kind: "fallback",
      verified_explanation: "Verified explanation of the concept.",
      follow_up_id: "fu1",
    };
    assert.deepStrictEqual(FeedbackResultSchema.parse(fallback), fallback);
  });

  it("rejects fallback missing required fields", () => {
    assert.throws(() => {
      FeedbackResultSchema.parse({
        kind: "fallback",
        verified_explanation: "Verified explanation.",
      });
    });
    assert.throws(() => {
      FeedbackResultSchema.parse({
        kind: "fallback",
        follow_up_id: "fu1",
      });
    });
  });

  it("proves diagnosis fields cannot survive parsing into fallback FeedbackResult", () => {
    const payloadWithForbiddenDiagnosisFields = {
      kind: "fallback",
      verified_explanation: "Verified explanation.",
      follow_up_id: "fu1",
      possible_misconception: "Forbidden misconception text",
      diagnosis: "Forbidden diagnosis text",
      explanation: "Forbidden explanation text",
      concept_ids: ["induction"],
      confidence: "high",
    };

    const parsed = FeedbackResultSchema.parse(payloadWithForbiddenDiagnosisFields);

    assert.strictEqual(parsed.kind, "fallback");
    assert.strictEqual(parsed.verified_explanation, "Verified explanation.");
    assert.strictEqual(parsed.follow_up_id, "fu1");
    assert.strictEqual("possible_misconception" in parsed, false);
    assert.strictEqual("diagnosis" in parsed, false);
    assert.strictEqual("explanation" in parsed, false);
    assert.strictEqual("concept_ids" in parsed, false);
    assert.strictEqual("confidence" in parsed, false);

    // Also assert on FallbackResultSchema directly
    const directParsed = FallbackResultSchema.parse(payloadWithForbiddenDiagnosisFields);
    assert.strictEqual("possible_misconception" in directParsed, false);
    assert.strictEqual("diagnosis" in directParsed, false);
  });
});
