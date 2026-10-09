import { FeedbackResultSchema } from "shared";
import { type EvalTemplate, type EvalResultItem } from "../../scripts/validate-eval-cases.js";

export const EXPECTED_EVAL_CASE_IDS = Object.freeze([
  "T01", "T02", "T03", "T04", "T05",
  "T06", "T07", "T08", "T09", "T10",
  "T11", "T12", "T13", "T14", "T15",
]);

export const EXPECTED_CLEAR_CASE_IDS = Object.freeze([
  "T01", "T02", "T03", "T04", "T05",
  "T06", "T12", "T13",
]);

export interface LatencyDistribution {
  median_ms: number;
  mean_ms: number;
  p90_ms: number;
  min_ms: number;
  max_ms: number;
}

export interface SummaryMetrics {
  model_id: string;
  total_cases: number;
  expected_cases_count: number;
  all_expected_cases_present: boolean;
  all_expected_clear_cases_present: boolean;
  timings_complete: boolean;
  first_attempt_schema_valid_count: number;
  first_attempt_schema_valid_rate: number;
  schema_validity_target_met: boolean;
  vague_cases_count: number;
  vague_needs_clarification_count: number;
  vague_clarification_rate: number;
  vague_clarification_target_met: boolean;
  invented_misconceptions_count: number;
  unknown_safety_cases_count: number;
  invented_misconceptions_target_met: boolean;
  latencies: LatencyDistribution;
  typical_latency_target_met: boolean;
  warmup_latency_ms: number | null;
  retries_count: number;
  repairs_count: number;
  clear_cases_count: number;
  human_agreement_status: "PASSED" | "FAILED" | "PENDING";
  unanimous_approved_cases_count: number;
  unanimous_approval_rate: number;
  all_quantitative_targets_met: boolean;
}

export function calculateLatencyStats(values: number[]): LatencyDistribution {
  if (values.length === 0) {
    return { median_ms: 0, mean_ms: 0, p90_ms: 0, min_ms: 0, max_ms: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min_ms = Math.round(sorted[0]! * 10) / 10;
  const max_ms = Math.round(sorted[sorted.length - 1]! * 10) / 10;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean_ms = Math.round((sum / sorted.length) * 10) / 10;

  // Median (P50)
  const mid = Math.floor(sorted.length / 2);
  const median_ms =
    sorted.length % 2 !== 0
      ? Math.round(sorted[mid]! * 10) / 10
      : Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10;

  // P90 (nearest rank)
  const p90Index = Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1);
  const p90_ms = Math.round(sorted[p90Index]! * 10) / 10;

  return { median_ms, mean_ms, p90_ms, min_ms, max_ms };
}

export function computeSummaryMetrics(
  template: EvalTemplate,
  warmupLatencyMs: number | null = null
): SummaryMetrics {
  const results = template.results;
  const total_cases = results.length;
  const expected_cases_count = EXPECTED_EVAL_CASE_IDS.length;

  // Check that all 15 expected cases are present uniquely
  const resultIds = new Set(results.map((r) => r.id));
  const all_expected_cases_present =
    results.length === expected_cases_count &&
    EXPECTED_EVAL_CASE_IDS.every((id) => resultIds.has(id));

  let timings_complete = results.length === expected_cases_count;
  let first_attempt_schema_valid_count = 0;
  let vague_cases_count = 0;
  let vague_needs_clarification_count = 0;
  let invented_misconceptions_count = 0;
  let unknown_safety_cases_count = 0;
  let retries_count = 0;
  let repairs_count = 0;
  let clear_cases_count = 0;
  let unanimous_approved_cases_count = 0;
  let anyJudgePending = false;
  const seenClearCaseIds = new Set<string>();
  let hasDuplicateClearCases = false;

  const latenciesList: number[] = [];

  for (const r of results) {
    if (
      typeof r.first_attempt_latency_ms !== "number" ||
      Number.isNaN(r.first_attempt_latency_ms) ||
      r.first_attempt_latency_ms < 0 ||
      typeof r.total_pipeline_latency_ms !== "number" ||
      Number.isNaN(r.total_pipeline_latency_ms) ||
      r.total_pipeline_latency_ms < 0
    ) {
      timings_complete = false;
    } else {
      latenciesList.push(r.total_pipeline_latency_ms);
    }

    if (r.first_attempt_schema_valid === true) {
      first_attempt_schema_valid_count++;
    }
    if (r.retry_occurred === true) {
      retries_count++;
    }
    if (r.repair_occurred === true) {
      repairs_count++;
    }

    if (r.expected_feedback_kind === "clarification") {
      vague_cases_count++;
      if (r.expected_status_match === true) {
        vague_needs_clarification_count++;
      }
      if (r.invented_misconception === true) {
        invented_misconceptions_count++;
      } else if (r.invented_misconception === null) {
        // Unknown safety assessment on missing/malformed evidence
        unknown_safety_cases_count++;
      }
    } else if (r.expected_feedback_kind === "diagnosis") {
      if (seenClearCaseIds.has(r.id)) {
        hasDuplicateClearCases = true;
      }
      seenClearCaseIds.add(r.id);
      clear_cases_count++;

      if (r.human_judgments) {
        const j1 = r.human_judgments.judge_1;
        const j2 = r.human_judgments.judge_2;

        const hasDistinctIdentifiedJudges =
          typeof j1.judge_id === "string" &&
          j1.judge_id.trim().length > 0 &&
          typeof j2.judge_id === "string" &&
          j2.judge_id.trim().length > 0 &&
          j1.judge_id.trim() !== j2.judge_id.trim();

        const allQuestionsAnswered =
          typeof j1.matches_student_words === "boolean" &&
          typeof j1.grounded_in_definitions === "boolean" &&
          typeof j2.matches_student_words === "boolean" &&
          typeof j2.grounded_in_definitions === "boolean";

        if (!hasDistinctIdentifiedJudges || !allQuestionsAnswered) {
          anyJudgePending = true;
        } else {
          // Both judges scored and are two distinct identified judges
          // Validate final_pipeline_outcome with FeedbackResultSchema.safeParse:
          // Only a successfully validated diagnosis can earn human approval!
          let isDiagnosticFeedback = false;
          if (r.final_pipeline_outcome) {
            try {
              const rawOutcome = JSON.parse(r.final_pipeline_outcome);
              const parseResult = FeedbackResultSchema.safeParse(rawOutcome);
              if (parseResult.success && parseResult.data.kind === "diagnosis") {
                isDiagnosticFeedback = true;
              }
            } catch {
              isDiagnosticFeedback = false;
            }
          }

          if (isDiagnosticFeedback) {
            const j1Approve = j1.matches_student_words === true && j1.grounded_in_definitions === true;
            const j2Approve = j2.matches_student_words === true && j2.grounded_in_definitions === true;
            if (j1Approve && j2Approve) {
              unanimous_approved_cases_count++;
            }
          }
        }
      } else {
        anyJudgePending = true;
      }
    }
  }

  const first_attempt_schema_valid_rate =
    total_cases > 0 ? first_attempt_schema_valid_count / total_cases : 0;
  const schema_validity_target_met =
    all_expected_cases_present &&
    first_attempt_schema_valid_rate >= template.evaluation_thresholds.min_first_try_schema_validity;

  const vague_clarification_rate =
    vague_cases_count > 0 ? vague_needs_clarification_count / vague_cases_count : 0;
  const vague_clarification_target_met =
    vague_cases_count === 7 &&
    vague_clarification_rate >= template.evaluation_thresholds.vague_needs_clarification_rate;

  // Safety target: exactly 0 invented misconceptions AND 0 unknown/missing safety evidence
  const invented_misconceptions_target_met =
    vague_cases_count === 7 &&
    unknown_safety_cases_count === 0 &&
    invented_misconceptions_count <= template.evaluation_thresholds.max_vague_invented_misconceptions;

  const latencies = calculateLatencyStats(latenciesList);
  const typical_latency_target_met =
    timings_complete &&
    latencies.median_ms < template.evaluation_thresholds.target_typical_latency_seconds * 1000;

  // Requirement 1: Require all eight expected clear-case IDs, without duplicates,
  // before human_agreement_status can be PASSED. Incomplete human evaluation remains PENDING.
  const all_expected_clear_cases_present =
    !hasDuplicateClearCases &&
    seenClearCaseIds.size === EXPECTED_CLEAR_CASE_IDS.length &&
    EXPECTED_CLEAR_CASE_IDS.every((id) => seenClearCaseIds.has(id));

  let human_agreement_status: "PASSED" | "FAILED" | "PENDING";
  let unanimous_approval_rate = 0;
  if (!all_expected_clear_cases_present || anyJudgePending) {
    human_agreement_status = "PENDING";
  } else {
    unanimous_approval_rate =
      clear_cases_count > 0 ? unanimous_approved_cases_count / clear_cases_count : 0;
    human_agreement_status =
      unanimous_approval_rate >= template.evaluation_thresholds.min_clear_case_human_agreement
        ? "PASSED"
        : "FAILED";
  }

  const all_quantitative_targets_met =
    all_expected_cases_present &&
    timings_complete &&
    schema_validity_target_met &&
    vague_clarification_target_met &&
    invented_misconceptions_target_met &&
    typical_latency_target_met;

  return {
    model_id: template.model_id ?? "unknown",
    total_cases,
    expected_cases_count,
    all_expected_cases_present,
    all_expected_clear_cases_present,
    timings_complete,
    first_attempt_schema_valid_count,
    first_attempt_schema_valid_rate,
    schema_validity_target_met,
    vague_cases_count,
    vague_needs_clarification_count,
    vague_clarification_rate,
    vague_clarification_target_met,
    invented_misconceptions_count,
    unknown_safety_cases_count,
    invented_misconceptions_target_met,
    latencies,
    typical_latency_target_met,
    warmup_latency_ms: warmupLatencyMs,
    retries_count,
    repairs_count,
    clear_cases_count,
    human_agreement_status,
    unanimous_approved_cases_count,
    unanimous_approval_rate,
    all_quantitative_targets_met,
  };
}

export function formatHumanJudgeReviewSheet(
  modelId: string,
  results: EvalResultItem[],
  referenceCases: Record<string, { student_explanation: string; what_reviewers_should_assess: string; question_id: string; student_choice_id: string }>
): string {
  const clearResults = results.filter((r) => r.expected_feedback_kind === "diagnosis");
  let md = `# Human Judge Review Sheet: ${modelId}\n\n`;
  md += `**Instructions for Judges**:\n`;
  md += `For each of the 8 clear misunderstanding cases, evaluate whether the model's generated feedback:\n`;
  md += `1. **matches_student_words**: Directly addresses the student's stated reasoning without fabricating unmentioned thoughts.\n`;
  md += `2. **grounded_in_definitions**: Stays strictly within verified definitions of Induction, Deduction, and Abduction.\n`;
  md += `Approval of a case requires affirmative (true) on both questions from two distinct identified judges.\n`;
  md += `*Note: Fallback outcomes cannot earn a diagnosis pass.*\n\n`;
  md += `---\n\n`;

  for (const r of clearResults) {
    const ref = referenceCases[r.id];
    let parsedFeedback: Record<string, unknown> | null = null;
    if (r.final_pipeline_outcome) {
      try {
        parsedFeedback = JSON.parse(r.final_pipeline_outcome) as Record<string, unknown>;
      } catch {
        // ignore
      }
    }

    md += `### Case ${r.id} (${ref?.question_id.toUpperCase()} / Choice ${ref?.student_choice_id})\n\n`;
    md += `- **Student Explanation**: "${ref?.student_explanation}"\n`;
    md += `- **Reviewer Rubric**: ${ref?.what_reviewers_should_assess}\n`;
    md += `- **Model Outcome Kind**: \`${parsedFeedback?.kind ?? "fallback/error"}\`\n`;
    if (parsedFeedback?.kind === "diagnosis") {
      md += `- **Possible Misconception**: "${parsedFeedback.possible_misconception}"\n`;
      md += `- **Explanation**: "${parsedFeedback.explanation}"\n`;
      md += `- **Assigned Follow-Up**: \`${parsedFeedback.follow_up_id}\`\n`;
    } else {
      md += `- **Status**: Ineligible for diagnosis pass (Outcome was fallback or error: ${r.final_pipeline_outcome})\n`;
    }
    md += `\n**Judge Scoring**:\n`;
    md += `| Judge | Matches Student Words? (yes/no) | Grounded in Definitions? (yes/no) | Notes |\n`;
    md += `|---|---|---|---|\n`;
    md += `| Judge 1 | [ ] | [ ] | |\n`;
    md += `| Judge 2 | [ ] | [ ] | |\n\n`;
    md += `---\n\n`;
  }

  return md;
}
