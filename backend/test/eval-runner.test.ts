import assert from "node:assert/strict";
import { test } from "node:test";
import { ObservableTransport } from "../src/eval/observable-transport.js";
import {
  calculateLatencyStats,
  computeSummaryMetrics,
  formatHumanJudgeReviewSheet,
} from "../src/eval/eval-summary.js";
import { runModelEvaluation } from "../src/eval/eval-runner.js";
import { MockOllamaTransport } from "./support/mock-transport.js";
import {
  type EvalCaseDataset,
  type EvalTemplate,
  validateEvalDirectory,
} from "../scripts/validate-eval-cases.js";
import { loadContent } from "../src/content.js";

// Ensure content is loaded
loadContent();

test("ObservableTransport records successful chat calls with latency and rawResponse", async () => {
  const mock = new MockOllamaTransport([JSON.stringify({ status: "needs_clarification" })]);
  const observable = new ObservableTransport(mock);

  const res = await observable.chat([{ role: "user", content: "hello" }]);
  assert.equal(res, JSON.stringify({ status: "needs_clarification" }));
  assert.equal(observable.attempts.length, 1);

  const attempt = observable.attempts[0]!;
  assert.equal(attempt.attemptNumber, 1);
  assert.equal(attempt.rawResponse, JSON.stringify({ status: "needs_clarification" }));
  assert.equal(attempt.error, undefined);
  assert.ok(attempt.latencyMs >= 0);
  assert.equal(attempt.messages[0]?.content, "hello");
});

test("ObservableTransport records error and rethrows when underlying transport fails", async () => {
  const mock = new MockOllamaTransport([new Error("Connection refused")]);
  const observable = new ObservableTransport(mock);

  await assert.rejects(
    () => observable.chat([{ role: "user", content: "hello" }]),
    /Connection refused/
  );

  assert.equal(observable.attempts.length, 1);
  const attempt = observable.attempts[0]!;
  assert.equal(attempt.attemptNumber, 1);
  assert.equal(attempt.error, "Connection refused");
  assert.equal(attempt.rawResponse, undefined);
  assert.ok(attempt.latencyMs >= 0);
});

test("ObservableTransport reset clears recorded attempts", async () => {
  const mock = new MockOllamaTransport(["resp1", "resp2"]);
  const observable = new ObservableTransport(mock);

  await observable.chat([{ role: "user", content: "1" }]);
  assert.equal(observable.attempts.length, 1);

  observable.reset();
  assert.equal(observable.attempts.length, 0);

  await observable.chat([{ role: "user", content: "2" }]);
  assert.equal(observable.attempts.length, 1);
  assert.equal(observable.attempts[0]?.attemptNumber, 1);
});

test("calculateLatencyStats calculates correct stats for empty, odd, and even arrays", () => {
  const empty = calculateLatencyStats([]);
  assert.deepEqual(empty, { median_ms: 0, mean_ms: 0, p90_ms: 0, min_ms: 0, max_ms: 0 });

  // Odd length: [100, 200, 300, 400, 500] -> median 300
  const odd = calculateLatencyStats([500, 100, 400, 200, 300]);
  assert.equal(odd.median_ms, 300);
  assert.equal(odd.min_ms, 100);
  assert.equal(odd.max_ms, 500);
  assert.equal(odd.mean_ms, 300);
  assert.equal(odd.p90_ms, 500);

  // Even length: [100, 200, 300, 400] -> median 250
  const even = calculateLatencyStats([400, 100, 200, 300]);
  assert.equal(even.median_ms, 250);
  assert.equal(even.mean_ms, 250);
});

test("computeSummaryMetrics calculates rates and handles PENDING human judgments", () => {
  const mockTemplate: EvalTemplate = {
    model_id: "test-model",
    evaluation_date: "2026-10-10",
    evaluation_environment: {
      temperature: 0.1,
      stream: false,
      format: "json_schema",
    },
    evaluation_thresholds: {
      min_first_try_schema_validity: 0.95,
      vague_needs_clarification_rate: 1.0,
      max_vague_invented_misconceptions: 0,
      min_clear_case_human_agreement: 0.8,
      target_typical_latency_seconds: 10.0,
    },
    latency_measurement_definitions: {
      first_attempt_latency_ms: "first ollama dispatch through full response-body receipt",
      total_pipeline_latency_ms: "pipeline entry through final FeedbackResult/error including retries",
    },
    results: [
      // 1 diagnosis case with null human judgment
      {
        id: "T01",
        expected_model_status: "possible_misconception",
        expected_feedback_kind: "diagnosis",
        raw_first_response: "{}",
        first_attempt_schema_valid: true,
        expected_status_match: true,
        invented_misconception: false,
        final_pipeline_outcome: "{}",
        retry_occurred: false,
        repair_occurred: false,
        retry_details: null,
        first_attempt_latency_ms: 1000,
        total_pipeline_latency_ms: 1200,
        human_judgments: {
          judge_1: { judge_id: null, matches_student_words: null, grounded_in_definitions: null, notes: null },
          judge_2: { judge_id: null, matches_student_words: null, grounded_in_definitions: null, notes: null },
        },
      },
      // 1 vague case
      {
        id: "T07",
        expected_model_status: "needs_clarification",
        expected_feedback_kind: "clarification",
        raw_first_response: "{}",
        first_attempt_schema_valid: true,
        expected_status_match: true,
        invented_misconception: false,
        final_pipeline_outcome: "{}",
        retry_occurred: false,
        repair_occurred: false,
        retry_details: null,
        first_attempt_latency_ms: 800,
        total_pipeline_latency_ms: 950,
        human_judgments: null,
      },
    ],
  };

  const metrics = computeSummaryMetrics(mockTemplate, 2500);

  assert.equal(metrics.total_cases, 2);
  assert.equal(metrics.first_attempt_schema_valid_count, 2);
  assert.equal(metrics.first_attempt_schema_valid_rate, 1.0);
  assert.equal(metrics.schema_validity_target_met, false, "Partial run cannot meet schema validity target without all 15 cases");
  assert.equal(metrics.vague_cases_count, 1);
  assert.equal(metrics.vague_needs_clarification_count, 1);
  assert.equal(metrics.all_expected_cases_present, false, "2 cases does not meet 15-case requirement");
  assert.equal(metrics.invented_misconceptions_count, 0);
  assert.equal(metrics.warmup_latency_ms, 2500);
  // Human judgments has nulls, so status MUST be PENDING
  assert.equal(metrics.human_agreement_status, "PENDING");
  assert.equal(metrics.all_quantitative_targets_met, false, "Partial run cannot pass all quantitative targets");
});

test("computeSummaryMetrics evaluates human agreement when judges are filled", () => {
  const createDiagnosisResult = (id: string, j1Match: boolean, j1Def: boolean, j2Match: boolean, j2Def: boolean) => ({
    id,
    expected_model_status: "possible_misconception" as const,
    expected_feedback_kind: "diagnosis" as const,
    raw_first_response: "{}",
    first_attempt_schema_valid: true,
    expected_status_match: true,
    invented_misconception: false,
    final_pipeline_outcome: JSON.stringify({
      kind: "diagnosis",
      possible_misconception: "Valid misconception",
      explanation: "Valid explanation",
      concept_ids: ["induction"],
      follow_up_id: "q1-p",
      confidence: "high",
    }),
    retry_occurred: false,
    repair_occurred: false,
    retry_details: null,
    first_attempt_latency_ms: 1000,
    total_pipeline_latency_ms: 1200,
    human_judgments: {
      judge_1: { judge_id: "J1", matches_student_words: j1Match, grounded_in_definitions: j1Def, notes: null },
      judge_2: { judge_id: "J2", matches_student_words: j2Match, grounded_in_definitions: j2Def, notes: null },
    },
  });

  const baseTemplate: EvalTemplate = {
    model_id: "test",
    evaluation_date: "2026-10-10",
    evaluation_environment: { temperature: 0.1, stream: false, format: "json_schema" },
    evaluation_thresholds: {
      min_first_try_schema_validity: 0.95,
      vague_needs_clarification_rate: 1.0,
      max_vague_invented_misconceptions: 0,
      min_clear_case_human_agreement: 0.8,
      target_typical_latency_seconds: 10.0,
    },
    latency_measurement_definitions: {
      first_attempt_latency_ms: "first ollama dispatch through full response-body receipt",
      total_pipeline_latency_ms: "pipeline entry through final FeedbackResult/error including retries",
    },
    results: [
      // 8 diagnosis cases: 7 unanimous approvals, 1 rejection (7/8 = 87.5% >= 80%)
      createDiagnosisResult("T01", true, true, true, true),
      createDiagnosisResult("T02", true, true, true, true),
      createDiagnosisResult("T03", true, true, true, true),
      createDiagnosisResult("T04", true, true, true, true),
      createDiagnosisResult("T05", true, true, true, true),
      createDiagnosisResult("T06", true, true, true, true),
      createDiagnosisResult("T12", true, true, true, true),
      createDiagnosisResult("T13", true, false, true, true), // rejected by J1
    ],
  };

  const metricsPassing = computeSummaryMetrics(baseTemplate);
  assert.equal(metricsPassing.human_agreement_status, "PASSED");
  assert.equal(metricsPassing.unanimous_approved_cases_count, 7);
  assert.equal(metricsPassing.unanimous_approval_rate, 0.875);

  // If 2 fail out of 8 (6/8 = 75% < 80%) -> FAILED
  baseTemplate.results[6] = createDiagnosisResult("T12", false, true, true, true);
  const metricsFailing = computeSummaryMetrics(baseTemplate);
  assert.equal(metricsFailing.human_agreement_status, "FAILED");
  assert.equal(metricsFailing.unanimous_approved_cases_count, 6);
  assert.equal(metricsFailing.unanimous_approval_rate, 0.75);
});

test("formatHumanJudgeReviewSheet creates markdown sheet with expected cases and empty checkboxes", () => {
  const results = [
    {
      id: "T01",
      expected_model_status: "possible_misconception" as const,
      expected_feedback_kind: "diagnosis" as const,
      raw_first_response: "{}",
      first_attempt_schema_valid: true,
      expected_status_match: true,
      invented_misconception: false,
      final_pipeline_outcome: JSON.stringify({
        kind: "diagnosis",
        possible_misconception: "Confusing induction with deduction",
        explanation: "Induction generalizes from observations.",
        follow_up_id: "f1",
      }),
      retry_occurred: false,
      repair_occurred: false,
      retry_details: null,
      first_attempt_latency_ms: 1000,
      total_pipeline_latency_ms: 1200,
      human_judgments: null,
    },
    {
      id: "T07",
      expected_model_status: "needs_clarification" as const,
      expected_feedback_kind: "clarification" as const,
      raw_first_response: "{}",
      first_attempt_schema_valid: true,
      expected_status_match: true,
      invented_misconception: false,
      final_pipeline_outcome: JSON.stringify({ kind: "clarification", text: "Please clarify." }),
      retry_occurred: false,
      repair_occurred: false,
      retry_details: null,
      first_attempt_latency_ms: 1000,
      total_pipeline_latency_ms: 1200,
      human_judgments: null,
    },
  ];

  const sheet = formatHumanJudgeReviewSheet("qwen2.5:7b", results, {
    T01: {
      student_explanation: "My explanation",
      what_reviewers_should_assess: "Assess definition",
      question_id: "q1",
      student_choice_id: "B",
    },
  });

  assert.ok(sheet.includes("# Human Judge Review Sheet: qwen2.5:7b"));
  assert.ok(sheet.includes("Case T01"));
  assert.ok(sheet.includes("My explanation"));
  assert.ok(sheet.includes("Confusing induction with deduction"));
  assert.ok(sheet.includes("| Judge 1 | [ ] | [ ] | |"));
  // T07 is clarification and must NOT be in the diagnosis review sheet
  assert.ok(!sheet.includes("Case T07"));
});

test("runModelEvaluation runs offline against mock transport and populates results", async () => {
  const report = validateEvalDirectory();
  assert.equal(report.ok, true, "F3 source data must validate");
  const { casesDataset, template } = report.data!;

  // Mock transport returning valid responses for each case:
  // For warmup (1 call) + 15 cases (1 call each) = 16 calls
  const mockResponses: string[] = [];
  // 1 warmup response
  mockResponses.push(JSON.stringify({ status: "needs_clarification", clarification_question: "warmup" }));

  // 15 case responses
  for (const c of casesDataset.cases) {
    if (c.expected_feedback_kind === "clarification") {
      mockResponses.push(
        JSON.stringify({
          status: "needs_clarification",
          possible_misconception: null,
          explanation: "",
          concept_ids: [],
          follow_up_id: null,
          needs_clarification: true,
          clarification_prompt: "Could you explain what you meant by that?",
          confidence: "low",
        })
      );
    } else {
      const q = (await import("../src/content.js")).getQuestion(c.question_id)!;
      const linked = (await import("../src/content.js")).getLinkedFollowUps(q);
      const pair = linked[0]?.concept_pair ?? ["induction", "deduction"];
      mockResponses.push(
        JSON.stringify({
          status: "possible_misconception",
          possible_misconception: "Student confused the two concepts",
          explanation: "Distinguishing the two concepts based on definitions.",
          concept_ids: [...pair],
          follow_up_id: null,
          needs_clarification: false,
          clarification_prompt: null,
          confidence: "high",
        })
      );
    }
  }

  const mock = new MockOllamaTransport(mockResponses);

  const evalResult = await runModelEvaluation({
    model: "mock-model:7b",
    transport: mock,
    casesDataset,
    template,
  });

  assert.equal(evalResult.model_id, "mock-model:7b");
  assert.equal(evalResult.template.results.length, 15);
  assert.ok(evalResult.warmup_latency_ms !== null);

  // Check result properties
  for (let i = 0; i < 15; i++) {
    const item = evalResult.template.results[i]!;
    assert.equal(item.first_attempt_schema_valid, true);
    assert.equal(item.retry_occurred, false);
    assert.ok(item.first_attempt_latency_ms !== null);
    assert.ok(item.total_pipeline_latency_ms !== null);
    assert.equal(item.expected_status_match, true);
    assert.equal(item.invented_misconception, false);
  }

  // Check metrics
  const m = evalResult.metrics;
  assert.equal(m.all_expected_cases_present, true);
  assert.equal(m.timings_complete, true);
  assert.equal(m.first_attempt_schema_valid_count, 15);
  assert.equal(m.first_attempt_schema_valid_rate, 1.0);
  assert.equal(m.schema_validity_target_met, true);
  assert.equal(m.vague_clarification_rate, 1.0);
  assert.equal(m.vague_clarification_target_met, true);
  assert.equal(m.invented_misconceptions_count, 0);
  assert.equal(m.unknown_safety_cases_count, 0);
  assert.equal(m.invented_misconceptions_target_met, true);
  assert.equal(m.all_quantitative_targets_met, true);
  assert.equal(m.human_agreement_status, "PENDING");
});

test("runModelEvaluation correctly tracks retry and schema validity failure when first attempt is malformed", async () => {
  const report = validateEvalDirectory();
  assert.equal(report.ok, true);
  const { casesDataset, template } = report.data!;

  // Take just 1 case for test
  const singleCaseDataset: EvalCaseDataset = {
    ...casesDataset,
    cases: [casesDataset.cases[0]!], // T01: diagnosis case
  };

  // Calls:
  // 1: malformed first attempt
  // 2: retry second attempt (valid)
  const mock = new MockOllamaTransport([
    "Not JSON at all! Just raw text",
    JSON.stringify({
      status: "possible_misconception",
      possible_misconception: "Confused terms",
      explanation: "Explaining confusion",
      concept_ids: ["induction", "abduction"],
      follow_up_id: null,
      needs_clarification: false,
      clarification_prompt: null,
      confidence: "high",
    }),
  ]);

  const evalResult = await runModelEvaluation({
    model: "mock-retry-model",
    skipWarmup: true,
    transport: mock,
    casesDataset: singleCaseDataset,
    template,
  });

  assert.equal(evalResult.template.results.length, 1);
  const res = evalResult.template.results[0]!;
  assert.equal(res.first_attempt_schema_valid, false, "First attempt was not valid schema");
  assert.equal(res.retry_occurred, true, "Retry must have occurred");
  assert.ok(res.retry_details?.length ?? 0 > 0);
  assert.equal(res.raw_first_response, "Not JSON at all! Just raw text");
  assert.equal(res.attempts?.length, 2, "Both attempts must be persisted in attempts record");
});

test("regression: status match is scored strictly from first attempt, ignoring successful retry", async () => {
  const report = validateEvalDirectory();
  assert.equal(report.ok, true);
  const { casesDataset, template } = report.data!;

  // Single diagnosis case expecting possible_misconception
  const singleCaseDataset: EvalCaseDataset = {
    ...casesDataset,
    cases: [casesDataset.cases[0]!], // T01: diagnosis case
  };

  // Attempt 1 returns status needs_clarification (status mismatch)
  // Attempt 2 returns valid diagnosis matching status
  const mock = new MockOllamaTransport([
    JSON.stringify({
      status: "needs_clarification",
      possible_misconception: null,
      explanation: "",
      concept_ids: ["unverified_concept_xyz"], // Unverified concept triggers pipeline retry
      follow_up_id: null,
      needs_clarification: true,
      clarification_prompt: "Clarify please",
      confidence: "low",
    }),
    JSON.stringify({
      status: "possible_misconception",
      possible_misconception: "Confused terms",
      explanation: "Explaining confusion",
      concept_ids: ["induction", "abduction"],
      follow_up_id: null,
      needs_clarification: false,
      clarification_prompt: null,
      confidence: "high",
    }),
  ]);

  const evalResult = await runModelEvaluation({
    model: "mock-model",
    skipWarmup: true,
    transport: mock,
    casesDataset: singleCaseDataset,
    template,
  });

  const res = evalResult.template.results[0]!;
  assert.equal(res.retry_occurred, true, "Retry occurred");
  // CRITICAL: expected_status_match MUST be false because Attempt 1 did not match!
  assert.equal(res.expected_status_match, false, "Status match must be scored strictly from first attempt");
});

test("regression: unknown safety evidence on malformed first attempt is never treated as a safety pass", async () => {
  const report = validateEvalDirectory();
  assert.equal(report.ok, true);
  const { casesDataset, template } = report.data!;

  // Vague clarification case T07
  const vagueCase = casesDataset.cases.find((c) => c.expected_feedback_kind === "clarification")!;
  const singleCaseDataset: EvalCaseDataset = {
    ...casesDataset,
    cases: [vagueCase],
  };

  // Malformed first attempt (fails schema parse)
  const mock = new MockOllamaTransport([
    "Malformed non-JSON output from model",
    // Retry succeeds with clarification
    JSON.stringify({
      status: "needs_clarification",
      possible_misconception: null,
      explanation: "",
      concept_ids: [],
      follow_up_id: null,
      needs_clarification: true,
      clarification_prompt: "Can you explain?",
      confidence: "low",
    }),
  ]);

  const evalResult = await runModelEvaluation({
    model: "mock-model",
    skipWarmup: true,
    transport: mock,
    casesDataset: singleCaseDataset,
    template,
  });

  const res = evalResult.template.results[0]!;
  // Unknown safety assessment must be preserved as null
  assert.equal(res.invented_misconception, null, "Safety must be null (unknown) when first attempt is malformed");

  // In summary metrics, unknown safety CANNOT count as a safety pass
  const m = evalResult.metrics;
  assert.equal(m.unknown_safety_cases_count, 1, "Must record 1 unknown safety case");
  assert.equal(m.invented_misconceptions_target_met, false, "Unknown safety evidence must NEVER pass safety target");
});

test("regression: full-run approval requires all 15 unique expected cases", () => {
  const incompleteTemplate: EvalTemplate = {
    model_id: "test",
    evaluation_date: "2026-10-10",
    evaluation_environment: { temperature: 0.1, stream: false, format: "json_schema" },
    evaluation_thresholds: {
      min_first_try_schema_validity: 0.95,
      vague_needs_clarification_rate: 1.0,
      max_vague_invented_misconceptions: 0,
      min_clear_case_human_agreement: 0.8,
      target_typical_latency_seconds: 10.0,
    },
    latency_measurement_definitions: {
      first_attempt_latency_ms: "first dispatch",
      total_pipeline_latency_ms: "pipeline entry through final",
    },
    results: [
      // Only 14 cases instead of 15
      {
        id: "T01",
        expected_model_status: "possible_misconception",
        expected_feedback_kind: "diagnosis",
        raw_first_response: "{}",
        first_attempt_schema_valid: true,
        expected_status_match: true,
        invented_misconception: false,
        final_pipeline_outcome: JSON.stringify({ kind: "diagnosis", possible_misconception: "misconception" }),
        retry_occurred: false,
        repair_occurred: false,
        retry_details: null,
        first_attempt_latency_ms: 500,
        total_pipeline_latency_ms: 600,
        human_judgments: null,
      },
    ],
  };

  const metrics = computeSummaryMetrics(incompleteTemplate);
  assert.equal(metrics.all_expected_cases_present, false);
  assert.equal(metrics.all_quantitative_targets_met, false, "Incomplete case set cannot pass full-run approval");
});

test("regression: missing or null timings prevent full-run approval", () => {
  const createCase = (id: string, lat1: number | null, lat2: number | null) => ({
    id,
    expected_model_status: "possible_misconception" as const,
    expected_feedback_kind: "diagnosis" as const,
    raw_first_response: "{}",
    first_attempt_schema_valid: true,
    expected_status_match: true,
    invented_misconception: false,
    final_pipeline_outcome: JSON.stringify({ kind: "diagnosis", possible_misconception: "misconception" }),
    retry_occurred: false,
    repair_occurred: false,
    retry_details: null,
    first_attempt_latency_ms: lat1,
    total_pipeline_latency_ms: lat2,
    human_judgments: null,
  });

  const templateWithMissingTiming: EvalTemplate = {
    model_id: "test",
    evaluation_date: "2026-10-10",
    evaluation_environment: { temperature: 0.1, stream: false, format: "json_schema" },
    evaluation_thresholds: {
      min_first_try_schema_validity: 0.95,
      vague_needs_clarification_rate: 1.0,
      max_vague_invented_misconceptions: 0,
      min_clear_case_human_agreement: 0.8,
      target_typical_latency_seconds: 10.0,
    },
    latency_measurement_definitions: {
      first_attempt_latency_ms: "first dispatch",
      total_pipeline_latency_ms: "pipeline entry through final",
    },
    results: [
      createCase("T01", 100, 200),
      createCase("T02", 100, 200),
      createCase("T03", 100, 200),
      createCase("T04", 100, 200),
      createCase("T05", 100, 200),
      createCase("T06", 100, 200),
      createCase("T07", 100, 200),
      createCase("T08", 100, 200),
      createCase("T09", 100, 200),
      createCase("T10", 100, 200),
      createCase("T11", 100, 200),
      createCase("T12", 100, 200),
      createCase("T13", 100, 200),
      createCase("T14", 100, 200),
      createCase("T15", null, 200), // Missing first_attempt_latency_ms!
    ],
  };

  const metrics = computeSummaryMetrics(templateWithMissingTiming);
  assert.equal(metrics.all_expected_cases_present, true);
  assert.equal(metrics.timings_complete, false, "Timings must be marked incomplete when any timing is null");
  assert.equal(metrics.typical_latency_target_met, false);
  assert.equal(metrics.all_quantitative_targets_met, false);
});

test("regression: human approval requires two distinct identified judges", () => {
  const createDiagnosisResult = (judge1Id: string | null, judge2Id: string | null) => ({
    id: "T01",
    expected_model_status: "possible_misconception" as const,
    expected_feedback_kind: "diagnosis" as const,
    raw_first_response: "{}",
    first_attempt_schema_valid: true,
    expected_status_match: true,
    invented_misconception: false,
    final_pipeline_outcome: JSON.stringify({
      kind: "diagnosis",
      possible_misconception: "misconception",
      explanation: "explanation",
      concept_ids: ["induction"],
      follow_up_id: "q1-p",
      confidence: "high",
    }),
    retry_occurred: false,
    repair_occurred: false,
    retry_details: null,
    first_attempt_latency_ms: 1000,
    total_pipeline_latency_ms: 1200,
    human_judgments: {
      judge_1: { judge_id: judge1Id, matches_student_words: true, grounded_in_definitions: true, notes: null },
      judge_2: { judge_id: judge2Id, matches_student_words: true, grounded_in_definitions: true, notes: null },
    },
  });

  // Test with identical judge IDs: "judgeA" and "judgeA"
  const templateSameJudge: EvalTemplate = {
    model_id: "test",
    evaluation_date: "2026-10-10",
    evaluation_environment: { temperature: 0.1, stream: false, format: "json_schema" },
    evaluation_thresholds: {
      min_first_try_schema_validity: 0.95,
      vague_needs_clarification_rate: 1.0,
      max_vague_invented_misconceptions: 0,
      min_clear_case_human_agreement: 0.8,
      target_typical_latency_seconds: 10.0,
    },
    latency_measurement_definitions: {
      first_attempt_latency_ms: "first dispatch",
      total_pipeline_latency_ms: "pipeline entry through final",
    },
    results: [createDiagnosisResult("judgeA", "judgeA")],
  };

  const metricsSame = computeSummaryMetrics(templateSameJudge);
  assert.equal(metricsSame.human_agreement_status, "PENDING", "Identical judges cannot pass; must remain PENDING");

  // Test with null judge ID
  const templateNullJudge: EvalTemplate = {
    ...templateSameJudge,
    results: [createDiagnosisResult("judgeA", null)],
  };
  const metricsNull = computeSummaryMetrics(templateNullJudge);
  assert.equal(metricsNull.human_agreement_status, "PENDING", "Null judge must remain PENDING");
});

test("regression: fallback outcome cannot earn a human diagnosis pass even if judges approve", () => {
  const createFallbackResult = (id: string) => ({
    id,
    expected_model_status: "possible_misconception" as const,
    expected_feedback_kind: "diagnosis" as const,
    raw_first_response: "{}",
    first_attempt_schema_valid: false,
    expected_status_match: false,
    invented_misconception: false,
    final_pipeline_outcome: JSON.stringify({ kind: "fallback", verified_explanation: "Fallback text", follow_up_id: "q1-p" }),
    retry_occurred: true,
    repair_occurred: false,
    retry_details: "Transport failed",
    first_attempt_latency_ms: 1000,
    total_pipeline_latency_ms: 2000,
    human_judgments: {
      judge_1: { judge_id: "judgeA", matches_student_words: true, grounded_in_definitions: true, notes: null },
      judge_2: { judge_id: "judgeB", matches_student_words: true, grounded_in_definitions: true, notes: null },
    },
  });

  const templateFallback: EvalTemplate = {
    model_id: "test",
    evaluation_date: "2026-10-10",
    evaluation_environment: { temperature: 0.1, stream: false, format: "json_schema" },
    evaluation_thresholds: {
      min_first_try_schema_validity: 0.95,
      vague_needs_clarification_rate: 1.0,
      max_vague_invented_misconceptions: 0,
      min_clear_case_human_agreement: 0.8,
      target_typical_latency_seconds: 10.0,
    },
    latency_measurement_definitions: {
      first_attempt_latency_ms: "first dispatch",
      total_pipeline_latency_ms: "pipeline entry through final",
    },
    results: [
      createFallbackResult("T01"),
      createFallbackResult("T02"),
      createFallbackResult("T03"),
      createFallbackResult("T04"),
      createFallbackResult("T05"),
      createFallbackResult("T06"),
      createFallbackResult("T12"),
      createFallbackResult("T13"),
    ],
  };

  const metrics = computeSummaryMetrics(templateFallback);
  // Unanimous approved cases MUST be 0 because fallback cannot earn a diagnosis pass!
  assert.equal(metrics.unanimous_approved_cases_count, 0, "Fallback cannot earn a diagnosis pass");
  assert.equal(metrics.human_agreement_status, "FAILED");
});

test("regression: F4 production timeout default of 15000ms and run settings are persisted", async () => {
  const report = validateEvalDirectory();
  assert.equal(report.ok, true);
  const { casesDataset, template } = report.data!;

  const mock = new MockOllamaTransport([
    JSON.stringify({
      status: "needs_clarification",
      possible_misconception: null,
      explanation: "",
      concept_ids: [],
      follow_up_id: null,
      needs_clarification: true,
      clarification_prompt: "Can you explain?",
      confidence: "low",
    }),
  ]);

  const singleCaseDataset: EvalCaseDataset = {
    ...casesDataset,
    cases: [casesDataset.cases[6]!], // T07: clarification case
  };

  const evalResult = await runModelEvaluation({
    model: "test-model",
    skipWarmup: true,
    transport: mock,
    casesDataset: singleCaseDataset,
    template,
  });

  // Verify F4 production timeout standard is 15000ms by default
  assert.equal(evalResult.runtime_settings.timeout_ms, 15000);
  assert.equal(evalResult.provenance_evidence.pipeline_prompt_version, "F4-v1");
  assert.equal(evalResult.warmup_outcome.status, "SKIPPED");
  assert.ok(evalResult.run_id.length > 0);
});

test("regression: incomplete diagnosis objects cannot earn human approval", () => {
  const createDiagnosisResult = (id: string, outcomeJson: string) => ({
    id,
    expected_model_status: "possible_misconception" as const,
    expected_feedback_kind: "diagnosis" as const,
    raw_first_response: "{}",
    first_attempt_schema_valid: true,
    expected_status_match: true,
    invented_misconception: false,
    final_pipeline_outcome: outcomeJson,
    retry_occurred: false,
    repair_occurred: false,
    retry_details: null,
    first_attempt_latency_ms: 1000,
    total_pipeline_latency_ms: 1200,
    human_judgments: {
      judge_1: { judge_id: "J1", matches_student_words: true, grounded_in_definitions: true, notes: null },
      judge_2: { judge_id: "J2", matches_student_words: true, grounded_in_definitions: true, notes: null },
    },
  });

  const validOutcome = JSON.stringify({
    kind: "diagnosis",
    possible_misconception: "Valid misconception",
    explanation: "Valid explanation",
    concept_ids: ["induction"],
    follow_up_id: "q1-p",
    confidence: "high",
  });

  // Incomplete diagnosis: missing concept_ids, follow_up_id, explanation, confidence
  const incompleteOutcome = JSON.stringify({
    kind: "diagnosis",
    possible_misconception: "Only misconception here",
  });

  const clearCaseIds = ["T01", "T02", "T03", "T04", "T05", "T06", "T12", "T13"];
  const template: EvalTemplate = {
    model_id: "test",
    evaluation_date: "2026-10-10",
    evaluation_environment: { temperature: 0.1, stream: false, format: "json_schema" },
    evaluation_thresholds: {
      min_first_try_schema_validity: 0.95,
      vague_needs_clarification_rate: 1.0,
      max_vague_invented_misconceptions: 0,
      min_clear_case_human_agreement: 0.8,
      target_typical_latency_seconds: 10.0,
    },
    latency_measurement_definitions: {
      first_attempt_latency_ms: "first dispatch",
      total_pipeline_latency_ms: "pipeline entry through final",
    },
    results: clearCaseIds.map((id, index) =>
      createDiagnosisResult(id, index === 0 ? incompleteOutcome : validOutcome)
    ),
  };

  const metrics = computeSummaryMetrics(template);
  // T01 had incomplete outcome, so it could NOT earn approval even though both judges marked true
  assert.equal(metrics.unanimous_approved_cases_count, 7, "Only the 7 schema-valid diagnoses earned approval");
  assert.equal(metrics.all_expected_clear_cases_present, true);

  // When 2 out of 8 have incomplete outcomes, 6/8 = 0.75 < 0.8 -> human_agreement_status fails
  template.results[1] = createDiagnosisResult("T02", incompleteOutcome);
  const metricsFailing = computeSummaryMetrics(template);
  assert.equal(metricsFailing.unanimous_approved_cases_count, 6);
  assert.equal(metricsFailing.human_agreement_status, "FAILED", "Incomplete diagnosis objects cannot earn approval, causing failure");
});

test("regression: missing or duplicate clear cases cannot produce human PASSED", () => {
  const createValidResult = (id: string) => ({
    id,
    expected_model_status: "possible_misconception" as const,
    expected_feedback_kind: "diagnosis" as const,
    raw_first_response: "{}",
    first_attempt_schema_valid: true,
    expected_status_match: true,
    invented_misconception: false,
    final_pipeline_outcome: JSON.stringify({
      kind: "diagnosis",
      possible_misconception: "Valid",
      explanation: "Valid",
      concept_ids: ["induction"],
      follow_up_id: "q1-p",
      confidence: "high",
    }),
    retry_occurred: false,
    repair_occurred: false,
    retry_details: null,
    first_attempt_latency_ms: 1000,
    total_pipeline_latency_ms: 1200,
    human_judgments: {
      judge_1: { judge_id: "J1", matches_student_words: true, grounded_in_definitions: true, notes: null },
      judge_2: { judge_id: "J2", matches_student_words: true, grounded_in_definitions: true, notes: null },
    },
  });

  const baseTemplate: EvalTemplate = {
    model_id: "test",
    evaluation_date: "2026-10-10",
    evaluation_environment: { temperature: 0.1, stream: false, format: "json_schema" },
    evaluation_thresholds: {
      min_first_try_schema_validity: 0.95,
      vague_needs_clarification_rate: 1.0,
      max_vague_invented_misconceptions: 0,
      min_clear_case_human_agreement: 0.8,
      target_typical_latency_seconds: 10.0,
    },
    latency_measurement_definitions: {
      first_attempt_latency_ms: "first dispatch",
      total_pipeline_latency_ms: "pipeline entry through final",
    },
    results: [
      createValidResult("T01"),
      createValidResult("T02"),
      createValidResult("T03"),
      createValidResult("T04"),
      createValidResult("T05"),
      createValidResult("T06"),
      createValidResult("T12"),
      // T13 is missing! Only 7 clear cases
    ],
  };

  const metricsMissing = computeSummaryMetrics(baseTemplate);
  assert.equal(metricsMissing.all_expected_clear_cases_present, false);
  assert.equal(metricsMissing.human_agreement_status, "PENDING", "Missing clear case must remain PENDING");

  // Duplicate clear case: T01 duplicated instead of T13
  baseTemplate.results.push(createValidResult("T01"));
  const metricsDuplicate = computeSummaryMetrics(baseTemplate);
  assert.equal(metricsDuplicate.all_expected_clear_cases_present, false);
  assert.equal(metricsDuplicate.human_agreement_status, "PENDING", "Duplicate clear case cannot produce PASSED");
});

test("regression: malformed first attempt followed by a repaired retry records repair=true", async () => {
  const report = validateEvalDirectory();
  assert.equal(report.ok, true);
  const { casesDataset, template } = report.data!;

  const singleCaseDataset: EvalCaseDataset = {
    ...casesDataset,
    cases: [casesDataset.cases[0]!], // T01: diagnosis case
  };

  // Attempt 1: malformed JSON (fails schema/parse)
  // Attempt 2: valid ModelResponse with follow_up_id: null (repaired by pipeline to q1-p)
  const mock = new MockOllamaTransport([
    "INVALID NON-JSON RESPONSE",
    JSON.stringify({
      status: "possible_misconception",
      possible_misconception: "Confused induction with deduction",
      explanation: "Explanation here",
      concept_ids: ["induction", "abduction"],
      follow_up_id: null, // Needs repair
      needs_clarification: false,
      clarification_prompt: null,
      confidence: "high",
    }),
  ]);

  const evalResult = await runModelEvaluation({
    model: "test-model",
    skipWarmup: true,
    transport: mock,
    casesDataset: singleCaseDataset,
    template,
  });

  const res = evalResult.template.results[0]!;
  assert.equal(res.retry_occurred, true, "Pipeline retried after malformed first attempt");
  assert.equal(res.first_attempt_schema_valid, false, "Attempt 1 was malformed");
  assert.equal(res.repair_occurred, true, "Repair occurred on accepted retry attempt");
  assert.ok(res.final_pipeline_outcome !== null);
  const outcome = JSON.parse(res.final_pipeline_outcome);
  assert.equal(outcome.kind, "diagnosis", "Pipeline produced valid diagnosis");
  assert.equal(outcome.follow_up_id, "q1-p", "Follow-up was repaired to q1-p");
});

test("regression: rejected first attempt followed by an unchanged eligible retry records repair=false", async () => {
  const report = validateEvalDirectory();
  assert.equal(report.ok, true);
  const { casesDataset, template } = report.data!;

  const singleCaseDataset: EvalCaseDataset = {
    ...casesDataset,
    cases: [casesDataset.cases[0]!], // T01: diagnosis case
  };

  // Attempt 1: rejected due to unverified concept reference, has follow_up_id: null
  // Attempt 2: returns eligible follow_up_id "q1-p" directly (not repaired by pipeline)
  const mock = new MockOllamaTransport([
    JSON.stringify({
      status: "possible_misconception",
      possible_misconception: "Confused terms",
      explanation: "Explanation",
      concept_ids: ["unverified_concept_triggers_retry"],
      follow_up_id: null,
      needs_clarification: false,
      clarification_prompt: null,
      confidence: "high",
    }),
    JSON.stringify({
      status: "possible_misconception",
      possible_misconception: "Confused induction with deduction",
      explanation: "Explanation here",
      concept_ids: ["induction", "abduction"],
      follow_up_id: "q1-p", // Already eligible, no repair needed
      needs_clarification: false,
      clarification_prompt: null,
      confidence: "high",
    }),
  ]);

  const evalResult = await runModelEvaluation({
    model: "test-model",
    skipWarmup: true,
    transport: mock,
    casesDataset: singleCaseDataset,
    template,
  });

  const res = evalResult.template.results[0]!;
  assert.equal(res.retry_occurred, true, "Pipeline retried after rejected first attempt");
  assert.equal(res.repair_occurred, false, "Accepted attempt already had eligible follow-up; repair=false");
  assert.ok(res.final_pipeline_outcome !== null);
  const outcome = JSON.parse(res.final_pipeline_outcome);
  assert.equal(outcome.kind, "diagnosis", "Pipeline produced valid diagnosis");
  assert.equal(outcome.follow_up_id, "q1-p", "Follow-up was preserved as q1-p");
});
