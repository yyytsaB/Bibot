import { ModelResponseSchema, type ModelResponse, type FeedbackResult } from "shared";
import { HttpOllamaTransport, type OllamaTransport } from "../transport.js";
import { FeedbackPipeline } from "../pipeline.js";
import { ObservableTransport, type CaseAttemptRecord } from "./observable-transport.js";
import {
  type EvalCaseDataset,
  type EvalTemplate,
  type EvalResultItem,
} from "../../scripts/validate-eval-cases.js";
import { computeSummaryMetrics, type SummaryMetrics } from "./eval-summary.js";

export interface ExtendedEvalResultItem extends EvalResultItem {
  attempts?: CaseAttemptRecord[];
}

export interface EvalRunnerOptions {
  model: string;
  endpoint?: string | undefined;
  timeoutMs?: number | undefined; // Defaults to F4 production timeout (15000 ms)
  transport?: OllamaTransport | undefined;
  skipWarmup?: boolean | undefined;
  casesDataset: EvalCaseDataset;
  template: EvalTemplate;
  signal?: AbortSignal | undefined;
  modelDigest?: string | null | undefined;
  runType?: "production" | "diagnostic" | "dry_run" | undefined;
  runId?: string | undefined;
}

export interface EvalRunnerResult {
  model_id: string;
  run_id: string;
  run_type: "production" | "diagnostic" | "dry_run";
  model_digest: string | null;
  runtime_settings: {
    endpoint: string;
    timeout_ms: number;
    temperature: number;
    stream: boolean;
    format: string;
  };
  warmup_outcome: {
    status: "SUCCESS" | "FAILED" | "SKIPPED";
    latency_ms: number | null;
    error?: string | null;
  };
  provenance_evidence: {
    dataset_batch_id: string;
    cases_count: number;
    pipeline_prompt_version: string;
  };
  template: EvalTemplate;
  metrics: SummaryMetrics;
  warmup_latency_ms: number | null;
}

export async function runModelEvaluation(
  options: EvalRunnerOptions
): Promise<EvalRunnerResult> {
  const modelId = options.model;
  // Use F4's actual production timeout default of 15000ms
  const timeoutMs = options.timeoutMs ?? 15000;
  const endpoint = options.endpoint ?? "http://127.0.0.1:11434/api/chat";
  const runType = options.runType ?? "production";
  const runId = options.runId ?? `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const modelDigest = options.modelDigest ?? null;

  const underlyingTransport =
    options.transport ??
    new HttpOllamaTransport({
      endpoint,
      model: modelId,
      timeoutMs,
    });

  const observableTransport = new ObservableTransport(underlyingTransport);
  const pipeline = new FeedbackPipeline(observableTransport);

  // 1. Pre-flight warm-up with separate settings & status recording
  let warmupLatencyMs: number | null = null;
  let warmupStatus: "SUCCESS" | "FAILED" | "SKIPPED" = "SKIPPED";
  let warmupError: string | null = null;

  if (!options.skipWarmup) {
    const warmupStart = performance.now();
    try {
      await observableTransport.chat(
        [
          {
            role: "system",
            content: "You are a learning assistant.",
          },
          {
            role: "user",
            content: "Respond with valid JSON.",
          },
        ],
        options.signal
      );
      warmupLatencyMs = Math.round((performance.now() - warmupStart) * 10) / 10;
      warmupStatus = "SUCCESS";
    } catch (err: unknown) {
      warmupLatencyMs = null;
      warmupStatus = "FAILED";
      warmupError = err instanceof Error ? err.message : String(err);
    }
  }

  // 2. Clone template to write results
  const filledTemplate: EvalTemplate = structuredClone(options.template);
  filledTemplate.model_id = modelId;
  filledTemplate.evaluation_date = new Date().toISOString().slice(0, 10);
  filledTemplate.results = [];

  // 3. Run all cases independently
  for (let i = 0; i < options.casesDataset.cases.length; i++) {
    const c = options.casesDataset.cases[i]!;
    observableTransport.reset();

    const pipelineStart = performance.now();
    let finalResult: FeedbackResult | null = null;
    let pipelineError: string | null = null;

    try {
      finalResult = await pipeline.processFeedback(
        {
          question_id: c.question_id,
          student_choice_id: c.student_choice_id,
          student_reasoning: c.student_explanation,
        },
        options.signal ? { signal: options.signal } : undefined
      );
    } catch (err: unknown) {
      pipelineError = err instanceof Error ? err.message : String(err);
    }
    const pipelineEnd = performance.now();
    const totalPipelineLatencyMs =
      Math.round((pipelineEnd - pipelineStart) * 10) / 10;

    const attempts = observableTransport.attempts;
    const attempt1 = attempts[0];
    const firstAttemptLatencyMs = attempt1
      ? Math.round(attempt1.latencyMs * 10) / 10
      : null;
    const rawFirstResponse = attempt1?.rawResponse ?? null;

    // Requirement 2: Score first-attempt status and safety strictly from the first raw response,
    // independently of retries and final outcome.
    let firstAttemptSchemaValid = false;
    let firstAttemptModel: ModelResponse | null = null;
    if (rawFirstResponse) {
      try {
        const parsed = JSON.parse(rawFirstResponse);
        const res = ModelResponseSchema.safeParse(parsed);
        if (res.success) {
          firstAttemptSchemaValid = true;
          firstAttemptModel = res.data;
        }
      } catch {
        firstAttemptSchemaValid = false;
      }
    }

    // Status match: strictly from first attempt
    const expectedStatusMatch =
      firstAttemptModel !== null
        ? firstAttemptModel.status === c.expected_model_status
        : false;

    // Safety on vague cases:
    // "Preserve unknown assessments for missing/malformed evidence; never treat unknown as a safety pass."
    let inventedMisconception: boolean | null;
    if (c.expected_feedback_kind === "clarification") {
      if (firstAttemptModel === null) {
        // Missing or malformed evidence on first attempt -> unknown assessment preserved as null
        inventedMisconception = null;
      } else if (
        firstAttemptModel.status === "possible_misconception" ||
        (typeof firstAttemptModel.possible_misconception === "string" &&
          firstAttemptModel.possible_misconception.trim().length > 0)
      ) {
        inventedMisconception = true;
      } else {
        inventedMisconception = false;
      }
    } else {
      inventedMisconception = false;
    }

    // Requirement 2: Determine repair_occurred from the accepted model attempt that produced the final diagnosis.
    // Do not compare the final diagnosis against a rejected first attempt.
    let repairOccurred = false;
    if (finalResult?.kind === "diagnosis") {
      const acceptedAttempt = attempts[attempts.length - 1];
      let acceptedModel: ModelResponse | null = null;
      if (acceptedAttempt?.rawResponse) {
        try {
          const parsed = JSON.parse(acceptedAttempt.rawResponse);
          const res = ModelResponseSchema.safeParse(parsed);
          if (res.success) {
            acceptedModel = res.data;
          }
        } catch {
          acceptedModel = null;
        }
      }

      if (acceptedModel?.status === "possible_misconception") {
        if (acceptedModel.follow_up_id !== finalResult.follow_up_id) {
          repairOccurred = true;
        }
      }
    }

    const retryOccurred = attempts.length > 1;
    const retryDetails = retryOccurred
      ? (attempt1?.error ?? "First attempt failed schema or reference validation")
      : null;

    const finalPipelineOutcome = finalResult
      ? JSON.stringify(finalResult)
      : `PIPELINE_ERROR: ${pipelineError ?? "Unknown error"}`;

    const humanJudgments =
      c.expected_feedback_kind === "diagnosis"
        ? {
            judge_1: {
              judge_id: null,
              matches_student_words: null,
              grounded_in_definitions: null,
              notes: null,
            },
            judge_2: {
              judge_id: null,
              matches_student_words: null,
              grounded_in_definitions: null,
              notes: null,
            },
          }
        : null;

    // Capture every attempt's raw response, timing, and error
    const caseAttempts: CaseAttemptRecord[] = observableTransport.getAttemptRecords();

    const resultItem: ExtendedEvalResultItem = {
      id: c.id,
      expected_model_status: c.expected_model_status,
      expected_feedback_kind: c.expected_feedback_kind,
      raw_first_response: rawFirstResponse,
      first_attempt_schema_valid: firstAttemptSchemaValid,
      expected_status_match: expectedStatusMatch,
      invented_misconception: inventedMisconception,
      final_pipeline_outcome: finalPipelineOutcome,
      retry_occurred: retryOccurred,
      repair_occurred: repairOccurred,
      retry_details: retryDetails,
      first_attempt_latency_ms: firstAttemptLatencyMs,
      total_pipeline_latency_ms: totalPipelineLatencyMs,
      human_judgments: humanJudgments,
      attempts: caseAttempts,
    };

    filledTemplate.results.push(resultItem);
  }

  const metrics = computeSummaryMetrics(filledTemplate, warmupLatencyMs);

  return {
    model_id: modelId,
    run_id: runId,
    run_type: runType,
    model_digest: modelDigest,
    runtime_settings: {
      endpoint,
      timeout_ms: timeoutMs,
      temperature: 0.1,
      stream: false,
      format: "json_schema",
    },
    warmup_outcome: {
      status: warmupStatus,
      latency_ms: warmupLatencyMs,
      error: warmupError,
    },
    provenance_evidence: {
      dataset_batch_id: options.casesDataset.batch_id,
      cases_count: options.casesDataset.cases.length,
      pipeline_prompt_version: "F4-v1",
    },
    template: filledTemplate,
    metrics,
    warmup_latency_ms: warmupLatencyMs,
  };
}
