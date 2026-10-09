import { readFileSync } from "node:fs";
import path from "node:path";
import { QuestionSchema, type Question } from "shared";

export interface Diagnostic {
  code: string;
  path: (string | number)[];
  message: string;
  item_id?: string;
}

export interface EvalCase {
  id: string;
  category: string;
  question_id: string;
  student_choice_id: string;
  student_explanation: string;
  expected_model_status: "possible_misconception" | "needs_clarification";
  expected_feedback_kind: "diagnosis" | "clarification";
  what_reviewers_should_assess: string;
  sources: string[];
}

export interface EvalCaseDataset {
  batch_id: string;
  provenance: {
    author: string;
    human_authored: boolean;
    nature: string;
    reviewer: string;
    review_date: string;
    owner_approval: {
      role: string;
      approved: boolean;
      peer_reviewed: boolean;
      confirmed_in: string;
      confirmation_date: string;
      scope: string;
    };
    extends_to_future_content: boolean;
  };
  sources: Record<string, { tag: string; citation: string; url: string }>;
  clarification_sequence_scenario: {
    description: string;
    steps: Array<{
      step?: number;
      question_id?: string;
      reference_case_id?: string;
      description: string;
    }>;
  };
  cases: EvalCase[];
}

export interface HumanJudgmentSlot {
  judge_id: string | null;
  matches_student_words: boolean | null;
  grounded_in_definitions: boolean | null;
  notes: string | null;
}

export interface EvalResultItem {
  id: string;
  expected_model_status: "possible_misconception" | "needs_clarification";
  expected_feedback_kind: "diagnosis" | "clarification";
  raw_first_response: string | null;
  first_attempt_schema_valid: boolean | null;
  expected_status_match: boolean | null;
  invented_misconception: boolean | null;
  final_pipeline_outcome: string | null;
  retry_occurred: boolean | null;
  repair_occurred: boolean | null;
  retry_details: string | null;
  first_attempt_latency_ms: number | null;
  total_pipeline_latency_ms: number | null;
  human_judgments: {
    judge_1: HumanJudgmentSlot;
    judge_2: HumanJudgmentSlot;
  } | null;
  attempts?: CaseAttemptRecord[];
}

export interface CaseAttemptRecord {
  attempt_number: number;
  latency_ms: number;
  raw_response: string | null;
  error: string | null;
}

export interface EvalTemplate {
  model_id: string | null;
  evaluation_date: string | null;
  evaluation_environment: {
    temperature: number;
    stream: boolean;
    format: string;
  };
  evaluation_thresholds: {
    min_first_try_schema_validity: number;
    vague_needs_clarification_rate: number;
    max_vague_invented_misconceptions: number;
    min_clear_case_human_agreement: number;
    target_typical_latency_seconds: number;
  };
  latency_measurement_definitions: {
    first_attempt_latency_ms: string;
    total_pipeline_latency_ms: string;
  };
  results: EvalResultItem[];
}

export interface EvalValidationInput {
  casesDataset: unknown;
  template: unknown;
  questions: unknown;
}

export interface ValidatedEvalData {
  casesDataset: EvalCaseDataset;
  template: EvalTemplate;
}

export interface EvalValidationReport {
  ok: boolean;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  data?: ValidatedEvalData;
}

export const reviewedEvalCaseReference: Record<string, Readonly<EvalCase>> = Object.freeze({
  T01: Object.freeze({
    id: "T01",
    category: "Clear misunderstanding",
    question_id: "q1",
    student_choice_id: "A",
    student_explanation: "They observed water and made a conclusion. Any conclusion from an observation is induction.",
    expected_model_status: "possible_misconception",
    expected_feedback_kind: "diagnosis",
    what_reviewers_should_assess: "Address the overbroad observation criterion.",
    sources: Object.freeze(["S2"]) as unknown as string[],
  }),
  T02: Object.freeze({
    id: "T02",
    category: "Clear misunderstanding",
    question_id: "q2",
    student_choice_id: "C",
    student_explanation: "A prediction about the room is an explanation, so it has to be abduction.",
    expected_model_status: "possible_misconception",
    expected_feedback_kind: "diagnosis",
    what_reviewers_should_assess: "Distinguish prediction from explaining observed evidence.",
    sources: Object.freeze(["S1", "S2"]) as unknown as string[],
  }),
  T03: Object.freeze({
    id: "T03",
    category: "Clear misunderstanding",
    question_id: "q3",
    student_choice_id: "A",
    student_explanation: "The rule talks about a whole club, so it must have been formed by induction. Applying it to Bea is induction too.",
    expected_model_status: "possible_misconception",
    expected_feedback_kind: "diagnosis",
    what_reviewers_should_assess: "Classify the presented inference, not an imagined origin of its premise.",
    sources: Object.freeze(["S1"]) as unknown as string[],
  }),
  T04: Object.freeze({
    id: "T04",
    category: "Clear misunderstanding",
    question_id: "q4",
    student_choice_id: "B",
    student_explanation: "The jam warning and folded sheet prove the cause with absolute certainty, so this is deduction.",
    expected_model_status: "possible_misconception",
    expected_feedback_kind: "diagnosis",
    what_reviewers_should_assess: "Address claimed certainty; do not assert the printer has been repaired.",
    sources: Object.freeze(["S2"]) as unknown as string[],
  }),
  T05: Object.freeze({
    id: "T05",
    category: "Clear misunderstanding",
    question_id: "q5",
    student_choice_id: "B",
    student_explanation: "Twelve successes turn the pattern into a rule that guarantees tomorrow's arrival.",
    expected_model_status: "possible_misconception",
    expected_feedback_kind: "diagnosis",
    what_reviewers_should_assess: "Address the unsupported guarantee.",
    sources: Object.freeze(["S1"]) as unknown as string[],
  }),
  T06: Object.freeze({
    id: "T06",
    category: "Clear misunderstanding",
    question_id: "q6",
    student_choice_id: "C",
    student_explanation: "Drawer B is just the best guess even though the question says those are the only two places and A is ruled out.",
    expected_model_status: "possible_misconception",
    expected_feedback_kind: "diagnosis",
    what_reviewers_should_assess: "Use the explicit exhaustive alternatives.",
    sources: Object.freeze(["S1"]) as unknown as string[],
  }),
  T07: Object.freeze({
    id: "T07",
    category: "Vague",
    question_id: "q1",
    student_choice_id: "A",
    student_explanation: "I guessed.",
    expected_model_status: "needs_clarification",
    expected_feedback_kind: "clarification",
    what_reviewers_should_assess: "Ask for reasoning; invent no misconception.",
    sources: Object.freeze(["S2"]) as unknown as string[],
  }),
  T08: Object.freeze({
    id: "T08",
    category: "Vague",
    question_id: "q2",
    student_choice_id: "B",
    student_explanation: "It just seemed right.",
    expected_model_status: "needs_clarification",
    expected_feedback_kind: "clarification",
    what_reviewers_should_assess: "Ask which part supports the chosen category.",
    sources: Object.freeze(["S1"]) as unknown as string[],
  }),
  T09: Object.freeze({
    id: "T09",
    category: "Vague",
    question_id: "q3",
    student_choice_id: "C",
    student_explanation: "I'm not sure how to explain it.",
    expected_model_status: "needs_clarification",
    expected_feedback_kind: "clarification",
    what_reviewers_should_assess: "Seek detail without attributing a belief.",
    sources: Object.freeze(["S1"]) as unknown as string[],
  }),
  T10: Object.freeze({
    id: "T10",
    category: "Vague",
    question_id: "q4",
    student_choice_id: "A",
    student_explanation: "Because of the situation.",
    expected_model_status: "needs_clarification",
    expected_feedback_kind: "clarification",
    what_reviewers_should_assess: "Ask which feature of the inference matters.",
    sources: Object.freeze(["S2"]) as unknown as string[],
  }),
  T11: Object.freeze({
    id: "T11",
    category: "Vague",
    question_id: "q5",
    student_choice_id: "C",
    student_explanation: "Maybe that one? I don't know.",
    expected_model_status: "needs_clarification",
    expected_feedback_kind: "clarification",
    what_reviewers_should_assess: "Request reasoning without diagnosis.",
    sources: Object.freeze(["S1"]) as unknown as string[],
  }),
  T12: Object.freeze({
    id: "T12",
    category: "Unusual, clear rule error",
    question_id: "q6",
    student_choice_id: "A",
    student_explanation: "Deduction always moves from a general rule to one specific case. This has two locations instead, so it cannot be deduction.",
    expected_model_status: "possible_misconception",
    expected_feedback_kind: "diagnosis",
    what_reviewers_should_assess: "Address the overly narrow definition of deduction.",
    sources: Object.freeze(["S1"]) as unknown as string[],
  }),
  T13: Object.freeze({
    id: "T13",
    category: "Unusual, explicit category conflation",
    question_id: "q1",
    student_choice_id: "B",
    student_explanation: "The person is acting like a detective. Detective work is always deductive, so choosing the likely cause must be deduction.",
    expected_model_status: "possible_misconception",
    expected_feedback_kind: "diagnosis",
    what_reviewers_should_assess: "Address occupation-based classification; avoid unrelated claims.",
    sources: Object.freeze(["S2"]) as unknown as string[],
  }),
  T14: Object.freeze({
    id: "T14",
    category: "Unusual, unrelated",
    question_id: "q2",
    student_choice_id: "C",
    student_explanation: "Our classroom curtains are green.",
    expected_model_status: "needs_clarification",
    expected_feedback_kind: "clarification",
    what_reviewers_should_assess: "No inference about the learner's conceptual beliefs.",
    sources: Object.freeze(["S1"]) as unknown as string[],
  }),
  T15: Object.freeze({
    id: "T15",
    category: "Unusual, selection/reasoning mismatch",
    question_id: "q3",
    student_choice_id: "A",
    student_explanation: "I meant that Bea must have the badge if both statements are true, but I may have clicked the wrong label.",
    expected_model_status: "needs_clarification",
    expected_feedback_kind: "clarification",
    what_reviewers_should_assess: "Clarify the selection mismatch; do not invent a conceptual error.",
    sources: Object.freeze(["S1"]) as unknown as string[],
  }),
});

const expectedBatchId = "critical-thinking-c1-reviewed-2026-10-09";
const allowedCaseFields = new Set([
  "id",
  "category",
  "question_id",
  "student_choice_id",
  "student_explanation",
  "expected_model_status",
  "expected_feedback_kind",
  "what_reviewers_should_assess",
  "sources",
]);

const outcomeNullFields: (keyof EvalResultItem)[] = [
  "raw_first_response",
  "first_attempt_schema_valid",
  "expected_status_match",
  "invented_misconception",
  "final_pipeline_outcome",
  "retry_occurred",
  "repair_occurred",
  "retry_details",
  "first_attempt_latency_ms",
  "total_pipeline_latency_ms",
];

function isRecord(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

function isValidIsoDate(val: unknown): boolean {
  if (typeof val !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const parsed = new Date(val + "T00:00:00Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === val;
}

export function validateEvalDatasets(input: EvalValidationInput): EvalValidationReport {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];

  const fail = (code: string, at: (string | number)[], message: string, itemId?: string): void => {
    const diagnostic: Diagnostic = { code, path: at, message };
    if (itemId !== undefined) diagnostic.item_id = itemId;
    errors.push(diagnostic);
  };

  // Questions index using shared QuestionSchema
  const questionMap = new Map<string, Question>();
  if (!Array.isArray(input.questions)) {
    fail("INVALID_QUESTIONS_DATASET", ["questions"], "Questions input must be an array");
  } else {
    for (let i = 0; i < input.questions.length; i++) {
      const q = input.questions[i];
      const parsed = QuestionSchema.safeParse(q);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          fail(
            "SCHEMA_ERROR",
            ["questions", i, ...issue.path.map(p => (typeof p === "symbol" ? p.toString() : p))],
            issue.message,
            isRecord(q) && typeof q.id === "string" ? q.id : undefined
          );
        }
      } else {
        questionMap.set(parsed.data.id, parsed.data);
      }
    }
  }

  // Validate cases dataset
  if (!isRecord(input.casesDataset)) {
    fail("INVALID_DATASET", ["casesDataset"], "casesDataset must be an object");
    return { ok: false, errors, warnings };
  }

  const rawCasesDataset = input.casesDataset;

  // batch_id
  if (rawCasesDataset.batch_id !== expectedBatchId) {
    fail("INVALID_BATCH_ID", ["casesDataset", "batch_id"], `Expected batch_id '${expectedBatchId}'`);
  }

  // provenance
  if (!isRecord(rawCasesDataset.provenance)) {
    fail("INVALID_PROVENANCE", ["casesDataset", "provenance"], "Provenance must be an object");
  } else {
    const prov = rawCasesDataset.provenance;
    if (prov.author !== "Codex (AI)") {
      fail("INVALID_PROVENANCE", ["casesDataset", "provenance", "author"], "Author must be 'Codex (AI)'");
    }
    if (prov.human_authored !== false) {
      fail("INVALID_AUTHORSHIP_EXCEPTION", ["casesDataset", "provenance", "human_authored"], "human_authored must be false");
    }
    if (prov.reviewer !== "Karl Andrei") {
      fail("INVALID_REVIEWER", ["casesDataset", "provenance", "reviewer"], "Reviewer must be 'Karl Andrei'");
    }
    if (prov.review_date !== "2026-10-09") {
      fail("INVALID_REVIEW_DATE", ["casesDataset", "provenance", "review_date"], "Review date must be '2026-10-09'");
    }
    if (prov.extends_to_future_content !== false) {
      fail("INVALID_AUTHORSHIP_EXCEPTION", ["casesDataset", "provenance", "extends_to_future_content"], "extends_to_future_content must be false");
    }

    if (!isRecord(prov.owner_approval)) {
      fail("INVALID_AUTHORSHIP_EXCEPTION", ["casesDataset", "provenance", "owner_approval"], "Owner approval must be an object");
    } else {
      const approval = prov.owner_approval;
      if (approval.role !== "project owner" || approval.approved !== true || approval.peer_reviewed !== true) {
        fail("INVALID_AUTHORSHIP_EXCEPTION", ["casesDataset", "provenance", "owner_approval"], "Owner peer approval required");
      }
      if (!isValidIsoDate(approval.confirmation_date)) {
        fail("INVALID_AUTHORSHIP_EXCEPTION", ["casesDataset", "provenance", "owner_approval", "confirmation_date"], "Valid confirmation date required");
      }
      if (!isNonEmptyString(approval.confirmed_in)) {
        fail("INVALID_AUTHORSHIP_EXCEPTION", ["casesDataset", "provenance", "owner_approval", "confirmed_in"], "Confirmation record required");
      }
    }
  }

  // sources
  const availableSources = new Set<string>();
  if (!isRecord(rawCasesDataset.sources)) {
    fail("INVALID_SOURCES", ["casesDataset", "sources"], "Sources must be an object");
  } else {
    for (const [tag, s] of Object.entries(rawCasesDataset.sources)) {
      if (!isRecord(s) || s.tag !== tag || !isNonEmptyString(s.citation) || !isNonEmptyString(s.url)) {
        fail("INVALID_SOURCE", ["casesDataset", "sources", tag], `Source '${tag}' is malformed`);
      } else {
        try {
          const parsed = new URL(s.url);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            fail("INVALID_SOURCE", ["casesDataset", "sources", tag, "url"], `Source '${tag}' URL must be http/https`);
          } else {
            availableSources.add(tag);
          }
        } catch {
          fail("INVALID_SOURCE", ["casesDataset", "sources", tag, "url"], `Source '${tag}' URL is invalid`);
        }
      }
    }
    if (!availableSources.has("S1") || !availableSources.has("S2")) {
      fail("MISSING_SOURCE", ["casesDataset", "sources"], "Sources must contain both 'S1' and 'S2'");
    }
  }

  // clarification_sequence_scenario
  if (!isRecord(rawCasesDataset.clarification_sequence_scenario)) {
    fail("INVALID_SCENARIO", ["casesDataset", "clarification_sequence_scenario"], "clarification_sequence_scenario required");
  } else {
    const scenario = rawCasesDataset.clarification_sequence_scenario;
    if (!isNonEmptyString(scenario.description)) {
      fail("INVALID_SCENARIO", ["casesDataset", "clarification_sequence_scenario", "description"], "Scenario description required");
    }
    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
      fail("INVALID_SCENARIO", ["casesDataset", "clarification_sequence_scenario", "steps"], "Scenario steps array required");
    }
  }

  // cases array
  const caseIdSet = new Set<string>();
  const validatedCases: EvalCase[] = [];
  let diagnosisCount = 0;
  let clarificationCount = 0;

  if (!Array.isArray(rawCasesDataset.cases)) {
    fail("INVALID_DATASET", ["casesDataset", "cases"], "Cases must be an array");
  } else {
    if (rawCasesDataset.cases.length !== 15) {
      fail("INVALID_CASE_COUNT", ["casesDataset", "cases"], `Expected exactly 15 cases, got ${rawCasesDataset.cases.length}`);
    }

    for (let i = 0; i < rawCasesDataset.cases.length; i++) {
      const item = rawCasesDataset.cases[i];
      if (!isRecord(item)) {
        fail("INVALID_CASE_ITEM", ["casesDataset", "cases", i], "Case must be an object");
        continue;
      }

      const caseId = typeof item.id === "string" ? item.id : undefined;

      // Undeclared fields
      for (const key of Object.keys(item)) {
        if (!allowedCaseFields.has(key)) {
          fail("UNDECLARED_FIELD", ["casesDataset", "cases", i, key], `Undeclared field '${key}' in test case`, caseId);
        }
      }

      // id
      if (!isNonEmptyString(item.id) || !/^T(0[1-9]|1[0-5])$/.test(item.id)) {
        fail("INVALID_ID_FORMAT", ["casesDataset", "cases", i, "id"], `Case ID must be T01-T15, got '${String(item.id)}'`, caseId);
        continue;
      }

      if (caseIdSet.has(item.id)) {
        fail("DUPLICATE_ID", ["casesDataset", "cases", i, "id"], `Duplicate case ID '${item.id}'`, item.id);
        continue;
      }
      caseIdSet.add(item.id);

      const ref = reviewedEvalCaseReference[item.id];
      if (!ref) {
        fail("UNAPPROVED_CASE", ["casesDataset", "cases", i, "id"], `Case ID '${item.id}' not in approved reference`, item.id);
        continue;
      }

      // Check category against fixed reference
      if (item.category !== ref.category) {
        fail("CONTENT_MISMATCH", ["casesDataset", "cases", i, "category"], `Category '${String(item.category)}' does not match approved reference '${ref.category}'`, item.id);
      }

      // Check question_id against fixed reference
      if (item.question_id !== ref.question_id) {
        fail("CONTENT_MISMATCH", ["casesDataset", "cases", i, "question_id"], `question_id '${String(item.question_id)}' does not match approved reference '${ref.question_id}'`, item.id);
      }

      // Check student_choice_id against fixed reference
      if (item.student_choice_id !== ref.student_choice_id) {
        fail("CONTENT_MISMATCH", ["casesDataset", "cases", i, "student_choice_id"], `student_choice_id '${String(item.student_choice_id)}' does not match approved reference '${ref.student_choice_id}'`, item.id);
      }

      // Check question and choice validity against practice questions
      const question = typeof item.question_id === "string" ? questionMap.get(item.question_id) : undefined;
      if (!question) {
        fail("UNKNOWN_QUESTION", ["casesDataset", "cases", i, "question_id"], `Unknown question '${String(item.question_id)}'`, item.id);
      } else {
        const choice = question.choices.find(c => c.id === item.student_choice_id);
        if (!choice) {
          fail("UNKNOWN_CHOICE", ["casesDataset", "cases", i, "student_choice_id"], `Choice '${String(item.student_choice_id)}' not found in question '${question.id}'`, item.id);
        } else if (item.student_choice_id === question.correct_choice_id) {
          fail("CORRECT_CHOICE_SELECTED", ["casesDataset", "cases", i, "student_choice_id"], `Student choice '${item.student_choice_id}' is the correct choice; evaluation cases must use incorrect choices`, item.id);
        }
      }

      // Check student_explanation against fixed reference
      if (item.student_explanation !== ref.student_explanation) {
        fail("CONTENT_MISMATCH", ["casesDataset", "cases", i, "student_explanation"], `Student explanation does not match approved reference wording`, item.id);
      }

      // Check expected_model_status against fixed reference
      if (item.expected_model_status !== ref.expected_model_status) {
        fail("CONTENT_MISMATCH", ["casesDataset", "cases", i, "expected_model_status"], `expected_model_status does not match approved reference`, item.id);
      }

      // Check expected_feedback_kind against fixed reference
      if (item.expected_feedback_kind !== ref.expected_feedback_kind) {
        fail("CONTENT_MISMATCH", ["casesDataset", "cases", i, "expected_feedback_kind"], `expected_feedback_kind does not match approved reference`, item.id);
      }

      // Check status-kind consistency
      if (item.expected_model_status === "possible_misconception" && item.expected_feedback_kind !== "diagnosis") {
        fail("STATUS_KIND_MISMATCH", ["casesDataset", "cases", i], "possible_misconception must map to diagnosis feedback", item.id);
      } else if (item.expected_model_status === "needs_clarification" && item.expected_feedback_kind !== "clarification") {
        fail("STATUS_KIND_MISMATCH", ["casesDataset", "cases", i], "needs_clarification must map to clarification feedback", item.id);
      }

      if (item.expected_model_status === "possible_misconception") {
        diagnosisCount++;
      } else {
        clarificationCount++;
      }

      // Check what_reviewers_should_assess against fixed reference
      if (item.what_reviewers_should_assess !== ref.what_reviewers_should_assess) {
        fail("CONTENT_MISMATCH", ["casesDataset", "cases", i, "what_reviewers_should_assess"], `Rubric does not match approved reference`, item.id);
      }

      // Check sources against fixed reference and availableSources
      if (!Array.isArray(item.sources) || item.sources.length === 0) {
        fail("MISSING_SOURCES", ["casesDataset", "cases", i, "sources"], "Case sources array required", item.id);
      } else {
        const refSources = ref.sources;
        if (item.sources.length !== refSources.length || !item.sources.every((s, idx) => s === refSources[idx])) {
          fail("CONTENT_MISMATCH", ["casesDataset", "cases", i, "sources"], "Sources do not match approved reference", item.id);
        }
        for (const s of item.sources) {
          if (typeof s !== "string" || !availableSources.has(s)) {
            fail("DANGLING_SOURCE", ["casesDataset", "cases", i, "sources"], `Source '${String(s)}' not found in dataset sources`, item.id);
          }
        }
      }

      validatedCases.push(item as unknown as EvalCase);
    }

    if (diagnosisCount !== 8 || clarificationCount !== 7) {
      fail("INVALID_CASE_DISTRIBUTION", ["casesDataset", "cases"], `Expected exactly 8 diagnosis cases and 7 clarification cases, got ${diagnosisCount} and ${clarificationCount}`);
    }
  }

  // Validate template
  if (!isRecord(input.template)) {
    fail("INVALID_TEMPLATE", ["template"], "Template must be an object");
    return { ok: false, errors, warnings };
  }

  const rawTemplate = input.template;

  // model_id & evaluation_date must be null
  if (rawTemplate.model_id !== null) {
    fail("PREFILLED_MEASUREMENT", ["template", "model_id"], "model_id must be null in unfilled template");
  }
  if (rawTemplate.evaluation_date !== null) {
    fail("PREFILLED_MEASUREMENT", ["template", "evaluation_date"], "evaluation_date must be null in unfilled template");
  }

  // evaluation_environment
  if (!isRecord(rawTemplate.evaluation_environment)) {
    fail("INVALID_ENVIRONMENT", ["template", "evaluation_environment"], "evaluation_environment required");
  } else {
    const env = rawTemplate.evaluation_environment;
    if (env.temperature !== 0.1 || env.stream !== false || env.format !== "json_schema") {
      fail("INVALID_ENVIRONMENT", ["template", "evaluation_environment"], "Environment must specify temperature=0.1, stream=false, format='json_schema'");
    }
  }

  // evaluation_thresholds
  if (!isRecord(rawTemplate.evaluation_thresholds)) {
    fail("INVALID_THRESHOLDS", ["template", "evaluation_thresholds"], "evaluation_thresholds required");
  } else {
    const t = rawTemplate.evaluation_thresholds;
    if (
      t.min_first_try_schema_validity !== 0.95 ||
      t.vague_needs_clarification_rate !== 1.00 ||
      t.max_vague_invented_misconceptions !== 0 ||
      t.min_clear_case_human_agreement !== 0.80 ||
      t.target_typical_latency_seconds !== 10.0
    ) {
      fail("INVALID_THRESHOLDS", ["template", "evaluation_thresholds"], "Thresholds must match DECISIONS.md locked standards");
    }
  }

  // latency_measurement_definitions (separated first_attempt_latency_ms and total_pipeline_latency_ms)
  if (!isRecord(rawTemplate.latency_measurement_definitions)) {
    fail("MISSING_LATENCY_DEFINITION", ["template", "latency_measurement_definitions"], "latency_measurement_definitions required");
  } else {
    const defs = rawTemplate.latency_measurement_definitions;
    if (!isNonEmptyString(defs.first_attempt_latency_ms) || !/first ollama.*full response-body receipt/i.test(defs.first_attempt_latency_ms)) {
      fail("MISSING_LATENCY_DEFINITION", ["template", "latency_measurement_definitions", "first_attempt_latency_ms"], "first_attempt_latency_ms definition must specify boundary from first Ollama dispatch through full response-body receipt");
    }
    if (
      !isNonEmptyString(defs.total_pipeline_latency_ms) ||
      !/pipeline entry.*FeedbackResult/i.test(defs.total_pipeline_latency_ms) ||
      !/retries/i.test(defs.total_pipeline_latency_ms)
    ) {
      fail("MISSING_LATENCY_DEFINITION", ["template", "latency_measurement_definitions", "total_pipeline_latency_ms"], "total_pipeline_latency_ms definition must specify boundary from pipeline entry through final FeedbackResult/error including prompt assembly, retries, repair, and conversion");
    }
  }

  // results array
  if (!Array.isArray(rawTemplate.results)) {
    fail("INVALID_TEMPLATE_RESULTS", ["template", "results"], "Template results must be an array");
  } else {
    if (rawTemplate.results.length !== 15) {
      fail("INVALID_CASE_COUNT", ["template", "results"], `Expected exactly 15 template results, got ${rawTemplate.results.length}`);
    }

    for (let i = 0; i < rawTemplate.results.length; i++) {
      const res = rawTemplate.results[i];
      if (!isRecord(res)) {
        fail("INVALID_TEMPLATE_ITEM", ["template", "results", i], "Template result must be an object");
        continue;
      }

      const matchingCase = validatedCases[i];
      const resId = typeof res.id === "string" ? res.id : undefined;

      if (!matchingCase || res.id !== matchingCase.id) {
        fail("TEMPLATE_MISMATCH", ["template", "results", i, "id"], `Result ID '${String(res.id)}' does not match case ID '${matchingCase?.id}'`, resId);
      }
      if (matchingCase && res.expected_model_status !== matchingCase.expected_model_status) {
        fail("TEMPLATE_MISMATCH", ["template", "results", i, "expected_model_status"], `Result expected status does not match case`, resId);
      }
      if (matchingCase && res.expected_feedback_kind !== matchingCase.expected_feedback_kind) {
        fail("TEMPLATE_MISMATCH", ["template", "results", i, "expected_feedback_kind"], `Result expected feedback kind does not match case`, resId);
      }

      // Check all outcome fields are null
      for (const field of outcomeNullFields) {
        if (res[field] !== null) {
          fail("PREFILLED_MEASUREMENT", ["template", "results", i, field], `Field '${field}' must be null in unfilled template`, resId);
        }
      }

      // Check human judgments
      if (matchingCase?.expected_feedback_kind === "diagnosis") {
        if (!isRecord(res.human_judgments)) {
          fail("TEMPLATE_MISMATCH", ["template", "results", i, "human_judgments"], "Diagnosis cases must provide 2 unfilled judge slots", resId);
        } else {
          const hj = res.human_judgments;
          for (const judgeKey of ["judge_1", "judge_2"]) {
            const judgeSlot = hj[judgeKey];
            if (!isRecord(judgeSlot)) {
              fail("TEMPLATE_MISMATCH", ["template", "results", i, "human_judgments", judgeKey], `Judge slot '${judgeKey}' must be an object`, resId);
            } else {
              if (
                judgeSlot.judge_id !== null ||
                judgeSlot.matches_student_words !== null ||
                judgeSlot.grounded_in_definitions !== null ||
                judgeSlot.notes !== null
              ) {
                fail("PREFILLED_JUDGMENT", ["template", "results", i, "human_judgments", judgeKey], `Judge slot '${judgeKey}' must be completely unfilled (all null)`, resId);
              }
            }
          }
        }
      } else {
        // Clarification case
        if (res.human_judgments !== null) {
          fail("TEMPLATE_MISMATCH", ["template", "results", i, "human_judgments"], "human_judgments must be null for clarification cases", resId);
        }
      }
    }
  }

  const ok = errors.length === 0;
  const report: EvalValidationReport = { ok, errors, warnings };
  if (ok) {
    report.data = {
      casesDataset: rawCasesDataset as unknown as EvalCaseDataset,
      template: rawTemplate as unknown as EvalTemplate,
    };
  }
  return report;
}

export function defaultDataDirectory(): string {
  const backend = path.resolve(__dirname, path.basename(path.dirname(__dirname)) === "dist" ? "../.." : "..");
  return path.resolve(backend, "../data");
}

export function validateEvalDirectory(directory = defaultDataDirectory()): EvalValidationReport {
  const errors: Diagnostic[] = [];
  const files: Record<string, unknown> = {};

  const requiredFiles = [
    { key: "casesDataset", filename: "explanation-eval-cases.json" },
    { key: "template", filename: "explanation-eval-template.json" },
    { key: "questions", filename: "questions.json" },
  ];

  for (const { key, filename } of requiredFiles) {
    const fullPath = path.resolve(directory, filename);
    try {
      files[key] = JSON.parse(readFileSync(fullPath, "utf8"));
    } catch (error) {
      errors.push({
        code: error instanceof SyntaxError ? "INVALID_JSON" : "FILE_READ_ERROR",
        path: [filename],
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings: [] };
  }

  return validateEvalDatasets({
    casesDataset: files.casesDataset,
    template: files.template,
    questions: files.questions,
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && !(args.length === 2 && args[0] === "--data-dir")) {
    console.error(JSON.stringify({ code: "INVALID_ARGUMENTS", message: "Usage: validate-eval-cases [--data-dir PATH]" }));
    process.exitCode = 1;
  } else {
    const report = validateEvalDirectory(args[1]);
    for (const warning of report.warnings) console.warn(JSON.stringify(warning));
    if (!report.ok) {
      for (const error of report.errors) console.error(JSON.stringify(error));
      process.exitCode = 1;
    } else {
      console.log(
        JSON.stringify({
          ok: true,
          cases: report.data?.casesDataset.cases.length,
          batch_id: report.data?.casesDataset.batch_id,
          template_results: report.data?.template.results.length,
          warnings: report.warnings.length,
        })
      );
    }
  }
}
