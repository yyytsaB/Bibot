import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  defaultDataDirectory,
  reviewedEvalCaseReference,
  validateEvalDatasets,
  validateEvalDirectory,
  type EvalCaseDataset,
  type EvalTemplate,
  type EvalValidationInput,
  type EvalValidationReport,
} from "../scripts/validate-eval-cases.js";

const directory = defaultDataDirectory();

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(path.join(directory, filename), "utf8")) as T;
}

const originalCases = readJson<EvalCaseDataset>("explanation-eval-cases.json");
const originalTemplate = readJson<EvalTemplate>("explanation-eval-template.json");
const originalQuestions = readJson<unknown[]>("questions.json");

function getFixture(): EvalValidationInput {
  return {
    casesDataset: structuredClone(originalCases),
    template: structuredClone(originalTemplate),
    questions: structuredClone(originalQuestions),
  };
}

function rejects(name: string, expectedCode: string, mutate: (input: EvalValidationInput) => void): void {
  test(name, () => {
    const fixture = getFixture();
    mutate(fixture);
    const result = validateEvalDatasets(fixture);
    assert.equal(result.ok, false, `Expected validation to fail with ${expectedCode}, but it passed`);
    assert.ok(
      result.errors.some(err => err.code === expectedCode),
      `Expected error code '${expectedCode}', got: ${JSON.stringify(result.errors)}`
    );
    assert.equal(result.data, undefined, "Invalid data must not return validated data payload");
  });
}

test("production eval dataset and template pass validation with zero errors and zero warnings", () => {
  const result = validateEvalDatasets(getFixture());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.warnings.length, 0);
  assert.equal(result.data?.casesDataset.cases.length, 15);
  assert.equal(result.data?.template.results.length, 15);
});

test("provenance preserves approved batch exception, Codex authorship, Karl Andrei review, and owner peer approval", () => {
  const prov = originalCases.provenance;
  assert.equal(originalCases.batch_id, "critical-thinking-c1-reviewed-2026-10-09");
  assert.equal(prov.author, "Codex (AI)");
  assert.equal(prov.human_authored, false);
  assert.equal(prov.reviewer, "Karl Andrei");
  assert.equal(prov.review_date, "2026-10-09");
  assert.equal(prov.owner_approval.role, "project owner");
  assert.equal(prov.owner_approval.approved, true);
  assert.equal(prov.owner_approval.peer_reviewed, true);
  assert.equal(prov.owner_approval.confirmation_date, "2026-10-10");
  assert.equal(prov.extends_to_future_content, false);
});

test("evaluation cases preserve exact reviewed 8 diagnosis / 7 clarification distribution", () => {
  const diagnosisCases = originalCases.cases.filter(c => c.expected_feedback_kind === "diagnosis");
  const clarificationCases = originalCases.cases.filter(c => c.expected_feedback_kind === "clarification");
  assert.equal(diagnosisCases.length, 8);
  assert.equal(clarificationCases.length, 7);

  const diagIds = diagnosisCases.map(c => c.id).sort();
  const clarIds = clarificationCases.map(c => c.id).sort();
  assert.deepEqual(diagIds, ["T01", "T02", "T03", "T04", "T05", "T06", "T12", "T13"]);
  assert.deepEqual(clarIds, ["T07", "T08", "T09", "T10", "T11", "T14", "T15"]);
});

test("every synthetic case is paired with an incorrect choice against verified question keys", () => {
  const qMap = new Map((originalQuestions as { id: string; correct_choice_id: string }[]).map(q => [q.id, q]));
  for (const c of originalCases.cases) {
    const q = qMap.get(c.question_id);
    assert.ok(q, `Question ${c.question_id} exists`);
    assert.notEqual(c.student_choice_id, q.correct_choice_id, `Case ${c.id} must be paired with an incorrect choice`);
  }
});

test("all 15 cases match the fixed reviewed reference across question, choice, wording, category, rubric, status, and sources", () => {
  assert.equal(originalCases.cases.length, 15);
  for (const c of originalCases.cases) {
    const ref = reviewedEvalCaseReference[c.id];
    assert.ok(ref, `Reference entry exists for ${c.id}`);
    assert.equal(c.category, ref.category, `${c.id} category mismatch`);
    assert.equal(c.question_id, ref.question_id, `${c.id} question_id mismatch`);
    assert.equal(c.student_choice_id, ref.student_choice_id, `${c.id} student_choice_id mismatch`);
    assert.equal(c.student_explanation, ref.student_explanation, `${c.id} student_explanation mismatch`);
    assert.equal(c.expected_model_status, ref.expected_model_status, `${c.id} expected_model_status mismatch`);
    assert.equal(c.expected_feedback_kind, ref.expected_feedback_kind, `${c.id} expected_feedback_kind mismatch`);
    assert.equal(c.what_reviewers_should_assess, ref.what_reviewers_should_assess, `${c.id} what_reviewers_should_assess mismatch`);
    assert.deepEqual(c.sources, ref.sources, `${c.id} sources mismatch`);
  }
});

test("clarification sequence scenario specifies integration steps for F6/F7 without adding a 16th item", () => {
  const scenario = originalCases.clarification_sequence_scenario;
  assert.ok(scenario.description.includes("reserved for F6/F7"));
  assert.equal(scenario.steps.length, 4);
  assert.equal(scenario.steps[0]?.reference_case_id, "T07");
  assert.equal(scenario.steps[1]?.reference_case_id, "T11");
});

test("unfilled measurement template defines separate latency boundaries and leaves measurements null", () => {
  assert.equal(originalTemplate.model_id, null);
  assert.equal(originalTemplate.evaluation_date, null);
  assert.deepEqual(originalTemplate.evaluation_environment, {
    temperature: 0.1,
    stream: false,
    format: "json_schema",
  });
  assert.deepEqual(originalTemplate.evaluation_thresholds, {
    min_first_try_schema_validity: 0.95,
    vague_needs_clarification_rate: 1.0,
    max_vague_invented_misconceptions: 0,
    min_clear_case_human_agreement: 0.8,
    target_typical_latency_seconds: 10.0,
  });

  const defs = originalTemplate.latency_measurement_definitions;
  assert.ok(/first ollama.*full response-body receipt/i.test(defs.first_attempt_latency_ms));
  assert.ok(/pipeline entry.*FeedbackResult/i.test(defs.total_pipeline_latency_ms));
  assert.ok(/retries/i.test(defs.total_pipeline_latency_ms));

  assert.equal(originalTemplate.results.length, 15);
  for (const r of originalTemplate.results) {
    assert.equal(r.raw_first_response, null);
    assert.equal(r.first_attempt_schema_valid, null);
    assert.equal(r.expected_status_match, null);
    assert.equal(r.invented_misconception, null);
    assert.equal(r.final_pipeline_outcome, null);
    assert.equal(r.retry_occurred, null);
    assert.equal(r.repair_occurred, null);
    assert.equal(r.retry_details, null);
    assert.equal(r.first_attempt_latency_ms, null);
    assert.equal(r.total_pipeline_latency_ms, null);
    if (r.expected_feedback_kind === "diagnosis") {
      assert.ok(r.human_judgments !== null);
      assert.equal(r.human_judgments.judge_1.judge_id, null);
      assert.equal(r.human_judgments.judge_1.matches_student_words, null);
      assert.equal(r.human_judgments.judge_1.grounded_in_definitions, null);
      assert.equal(r.human_judgments.judge_2.judge_id, null);
      assert.equal(r.human_judgments.judge_2.matches_student_words, null);
      assert.equal(r.human_judgments.judge_2.grounded_in_definitions, null);
    } else {
      assert.equal(r.human_judgments, null);
    }
  }
});

// QuestionSchema validation
test("parses question inputs using QuestionSchema and returns structured diagnostics without throwing", () => {
  const fixture = getFixture();
  const qList = fixture.questions as Record<string, unknown>[];
  // Corrupt a question record with invalid choices count and invalid correct_choice_id
  qList[0] = { id: "q1", text: "Question", subject_id: "critical-thinking", concept_ids: ["induction"], choices: [{ id: "A", text: "A" }], correct_choice_id: "Z", verified_explanation: "Exp", follow_up_ids: ["q1-p", "q1-e"] };
  let report: EvalValidationReport | undefined;
  assert.doesNotThrow(() => {
    report = validateEvalDatasets(fixture);
  });
  assert.equal(report?.ok, false);
  assert.ok(report?.errors.some((err: { code: string; path: (string | number)[] }) => err.code === "SCHEMA_ERROR" && err.path[0] === "questions"));
});

// Rejection test cases: mutations on reference fidelity (including those that previously passed)
rejects("rejects mutated wording on T04", "CONTENT_MISMATCH", f => {
  (f.casesDataset as EvalCaseDataset).cases.find(c => c.id === "T04")!.student_explanation = "Different unapproved text.";
});
rejects("rejects mutated question mapping on T01", "CONTENT_MISMATCH", f => {
  (f.casesDataset as EvalCaseDataset).cases.find(c => c.id === "T01")!.question_id = "q2";
});
rejects("rejects mutated choice mapping on T01 to another incorrect choice (B)", "CONTENT_MISMATCH", f => {
  // Choice B is incorrect on q1, but not the approved choice A for T01
  (f.casesDataset as EvalCaseDataset).cases.find(c => c.id === "T01")!.student_choice_id = "B";
});
rejects("rejects mutated category on T12", "CONTENT_MISMATCH", f => {
  (f.casesDataset as EvalCaseDataset).cases.find(c => c.id === "T12")!.category = "Vague";
});
rejects("rejects mutated rubric on T02", "CONTENT_MISMATCH", f => {
  (f.casesDataset as EvalCaseDataset).cases.find(c => c.id === "T02")!.what_reviewers_should_assess = "Unapproved rubric text.";
});
rejects("rejects mutated sources on T02", "CONTENT_MISMATCH", f => {
  (f.casesDataset as EvalCaseDataset).cases.find(c => c.id === "T02")!.sources = ["S1"];
});
rejects("rejects mutated expected_model_status on T07", "CONTENT_MISMATCH", f => {
  (f.casesDataset as EvalCaseDataset).cases.find(c => c.id === "T07")!.expected_model_status = "possible_misconception";
});

// Rejection test cases: structural and provenance
rejects("rejects non-object cases dataset", "INVALID_DATASET", f => { f.casesDataset = "not-an-object"; });
rejects("rejects invalid batch ID", "INVALID_BATCH_ID", f => { (f.casesDataset as EvalCaseDataset).batch_id = "wrong-batch"; });
rejects("rejects AI content mislabeled as human-authored", "INVALID_AUTHORSHIP_EXCEPTION", f => { (f.casesDataset as EvalCaseDataset).provenance.human_authored = true; });
rejects("rejects extending exception to future content", "INVALID_AUTHORSHIP_EXCEPTION", f => { (f.casesDataset as EvalCaseDataset).provenance.extends_to_future_content = true; });
rejects("requires owner peer approval", "INVALID_AUTHORSHIP_EXCEPTION", f => { (f.casesDataset as EvalCaseDataset).provenance.owner_approval.approved = false; });
rejects("rejects unapproved reviewer", "INVALID_REVIEWER", f => { (f.casesDataset as EvalCaseDataset).provenance.reviewer = "Other Person"; });
rejects("rejects unapproved review date", "INVALID_REVIEW_DATE", f => { (f.casesDataset as EvalCaseDataset).provenance.review_date = "2026-10-15"; });
rejects("rejects missing source S1", "MISSING_SOURCE", f => { delete (f.casesDataset as EvalCaseDataset).sources["S1"]; });
rejects("rejects invalid source URL", "INVALID_SOURCE", f => { (f.casesDataset as EvalCaseDataset).sources["S1"]!.url = "ftp://invalid"; });
rejects("rejects wrong case count (14 cases)", "INVALID_CASE_COUNT", f => { (f.casesDataset as EvalCaseDataset).cases.pop(); });
rejects("rejects duplicate case ID", "DUPLICATE_ID", f => { (f.casesDataset as EvalCaseDataset).cases[1]!.id = "T01"; });
rejects("rejects invalid case ID format", "INVALID_ID_FORMAT", f => { (f.casesDataset as EvalCaseDataset).cases[0]!.id = "T99"; });
rejects("rejects unknown question ID", "CONTENT_MISMATCH", f => { (f.casesDataset as EvalCaseDataset).cases[0]!.question_id = "q99"; });
rejects("rejects pairing synthetic case with correct choice", "CONTENT_MISMATCH", f => { (f.casesDataset as EvalCaseDataset).cases[0]!.student_choice_id = "C"; });
rejects("rejects dangling source reference in case", "CONTENT_MISMATCH", f => { (f.casesDataset as EvalCaseDataset).cases[0]!.sources = ["S99"]; });
rejects("rejects undeclared field in case item", "UNDECLARED_FIELD", f => { Object.assign((f.casesDataset as EvalCaseDataset).cases[0]!, { extra_field: 123 }); });

// Rejection test cases: template fields and separated latencies
rejects("rejects prefilled model_id in template", "PREFILLED_MEASUREMENT", f => { (f.template as EvalTemplate).model_id = "llama3.2"; });
rejects("rejects prefilled evaluation_date in template", "PREFILLED_MEASUREMENT", f => { (f.template as EvalTemplate).evaluation_date = "2026-10-10"; });
rejects("rejects prefilled raw_first_response in template result", "PREFILLED_MEASUREMENT", f => { (f.template as EvalTemplate).results[0]!.raw_first_response = "{ ... }"; });
rejects("rejects prefilled first_attempt_latency_ms in template result", "PREFILLED_MEASUREMENT", f => { (f.template as EvalTemplate).results[0]!.first_attempt_latency_ms = 1200; });
rejects("rejects prefilled total_pipeline_latency_ms in template result", "PREFILLED_MEASUREMENT", f => { (f.template as EvalTemplate).results[0]!.total_pipeline_latency_ms = 1500; });
rejects("rejects prefilled judge slot in template result", "PREFILLED_JUDGMENT", f => { (f.template as EvalTemplate).results[0]!.human_judgments!.judge_1.judge_id = "Judge Alice"; });
rejects("rejects template result ID mismatch", "TEMPLATE_MISMATCH", f => { (f.template as EvalTemplate).results[0]!.id = "T02"; });
rejects("rejects human_judgments on clarification case in template", "TEMPLATE_MISMATCH", f => {
  (f.template as EvalTemplate).results.find(r => r.id === "T07")!.human_judgments = {
    judge_1: { judge_id: null, matches_student_words: null, grounded_in_definitions: null, notes: null },
    judge_2: { judge_id: null, matches_student_words: null, grounded_in_definitions: null, notes: null },
  };
});
rejects("rejects altered evaluation thresholds", "INVALID_THRESHOLDS", f => { (f.template as EvalTemplate).evaluation_thresholds.min_first_try_schema_validity = 0.80; });
rejects("rejects missing first_attempt_latency_ms definition", "MISSING_LATENCY_DEFINITION", f => {
  (f.template as EvalTemplate).latency_measurement_definitions.first_attempt_latency_ms = "";
});
rejects("rejects missing total_pipeline_latency_ms definition", "MISSING_LATENCY_DEFINITION", f => {
  (f.template as EvalTemplate).latency_measurement_definitions.total_pipeline_latency_ms = "";
});

test("file validation reports missing files and invalid JSON", () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "mm-f3-input-"));
  try {
    assert.ok(validateEvalDirectory(temporary).errors.every(e => e.code === "FILE_READ_ERROR"));
    writeFileSync(path.join(temporary, "explanation-eval-cases.json"), "{broken-json");
    assert.ok(validateEvalDirectory(temporary).errors.some(e => e.code === "INVALID_JSON"));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("compiled CLI loads real data independently of cwd and fails on bad inputs", () => {
  const backend = path.resolve(directory, "../backend");
  const cli = path.join(backend, "dist/scripts/validate-eval-cases.js");
  const temporary = mkdtempSync(path.join(os.tmpdir(), "mm-f3-cli-"));
  try {
    const good = spawnSync(process.execPath, [cli], { cwd: temporary, encoding: "utf8" });
    assert.equal(good.status, 0, good.stderr);
    const parsed = JSON.parse(good.stdout) as { ok: boolean; cases: number; template_results: number };
    assert.equal(parsed.ok, true);
    assert.equal(parsed.cases, 15);
    assert.equal(parsed.template_results, 15);

    const bad = spawnSync(process.execPath, [cli, "--data-dir", temporary], { cwd: temporary, encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.ok(bad.stderr.includes('"code":"FILE_READ_ERROR"'));

    const args = spawnSync(process.execPath, [cli, "--invalid-flag"], { encoding: "utf8" });
    assert.equal(args.status, 1);
    assert.ok(args.stderr.includes("INVALID_ARGUMENTS"));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
