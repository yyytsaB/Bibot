import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  FeedbackPipeline,
  type FeedbackRequest,
  assessReasoningClarity,
  type PipelineDecisionKind,
} from "../src/pipeline.js";
import { HttpOllamaTransport } from "../src/transport.js";
import { ObservableTransport } from "../src/eval/observable-transport.js";
import { getQuestion } from "../src/content.js";
import { FeedbackResultSchema, type FeedbackResult } from "shared";

interface OllamaTagModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    format?: string;
    family?: string;
  };
}

async function fetchOllamaModelMetadata(
  endpointBase: string,
  modelName: string
): Promise<OllamaTagModel | null> {
  try {
    const res = await fetch(`${endpointBase}/api/tags`);
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: OllamaTagModel[] };
    if (!data.models) return null;
    return (
      data.models.find(
        (m) =>
          m.name === modelName ||
          m.model === modelName ||
          m.name.startsWith(modelName) ||
          modelName.startsWith(m.name)
      ) ?? null
    );
  } catch {
    return null;
  }
}

function getDataDirectory(): string {
  const candidate1 = path.resolve(process.cwd(), "data");
  if (fs.existsSync(candidate1)) return candidate1;
  const candidate2 = path.resolve(process.cwd(), "../data");
  if (fs.existsSync(candidate2)) return candidate2;
  return path.resolve(process.cwd(), "../data");
}

export interface ReviewedLiveTestCase {
  case_id: string;
  category: string;
  description: string;
  expected_feedback_kind: "clarification" | "diagnosis";
  request: FeedbackRequest;
}

export interface DeveloperCounterexample {
  test_id: string;
  label: string;
  category: "developer_test";
  description: string;
  expected_feedback_kind: "clarification" | "diagnosis";
  request: FeedbackRequest;
}

export function loadApprovedF3Cases(): ReviewedLiveTestCase[] {
  const dataDir = getDataDirectory();
  const casesFilePath = path.join(dataDir, "explanation-eval-cases.json");
  if (!fs.existsSync(casesFilePath)) {
    throw new Error(`Explanation eval cases file not found: ${casesFilePath}`);
  }
  const evalCasesData = JSON.parse(fs.readFileSync(casesFilePath, "utf8")) as {
    cases: Array<{
      id: string;
      category: string;
      question_id: string;
      student_choice_id: string;
      student_explanation: string;
      expected_model_status: "possible_misconception" | "needs_clarification";
      expected_feedback_kind: "diagnosis" | "clarification";
      what_reviewers_should_assess: string;
      sources: string[];
    }>;
  };

  const TARGET_CASE_IDS = ["T07", "T08", "T09", "T10", "T11", "T14", "T15", "T01"];
  return TARGET_CASE_IDS.map((id) => {
    const found = evalCasesData.cases.find((c) => c.id === id);
    if (!found) {
      throw new Error(`Target case '${id}' not found in ${casesFilePath}`);
    }
    return {
      case_id: found.id,
      category: found.category,
      description: `[${found.id}] ${found.category}: "${found.student_explanation}"`,
      expected_feedback_kind: found.expected_feedback_kind,
      request: {
        question_id: found.question_id,
        student_choice_id: found.student_choice_id,
        student_reasoning: found.student_explanation,
        clarification_attempt_count: 0,
      },
    };
  });
}

export const DEVELOPER_COUNTEREXAMPLES: DeveloperCounterexample[] = [
  {
    test_id: "DEV-01",
    label: "Developer Test: Pure uncertainty",
    category: "developer_test",
    description: "I just thought so. (guessing / uncertainty)",
    expected_feedback_kind: "clarification",
    request: {
      question_id: "q1",
      student_choice_id: "A",
      student_reasoning: "I just thought so.",
      clarification_attempt_count: 0,
    },
  },
  {
    test_id: "DEV-02",
    label: "Developer Test: Guessing with concept keyword",
    category: "developer_test",
    description: "I guessed induction. (guess + concept name without reasoning)",
    expected_feedback_kind: "clarification",
    request: {
      question_id: "q1",
      student_choice_id: "A",
      student_reasoning: "I guessed induction.",
      clarification_attempt_count: 0,
    },
  },
  {
    test_id: "DEV-03",
    label: "Developer Test: Empirical premise preservation",
    category: "developer_test",
    description: "I guessed because nine of ten visits were full. (substantive premise despite 'guessed')",
    expected_feedback_kind: "diagnosis",
    request: {
      question_id: "q5",
      student_choice_id: "B",
      student_reasoning: "I guessed because nine of ten visits were full.",
      clarification_attempt_count: 0,
    },
  },
  {
    test_id: "DEV-04",
    label: "Developer Test: Circular restatement",
    category: "developer_test",
    description: "Because it is inductive reasoning. (circular)",
    expected_feedback_kind: "clarification",
    request: {
      question_id: "q1",
      student_choice_id: "A",
      student_reasoning: "Because it is inductive reasoning.",
      clarification_attempt_count: 0,
    },
  },
  {
    test_id: "DEV-05",
    label: "Developer Test: Contextual analogy",
    category: "developer_test",
    description: "Deduction is like Sherlock Holmes solving a mystery. (analogy in context)",
    expected_feedback_kind: "clarification",
    request: {
      question_id: "q1",
      student_choice_id: "A",
      student_reasoning: "Deduction is like Sherlock Holmes solving a mystery.",
      clarification_attempt_count: 0,
    },
  },
  {
    test_id: "DEV-06",
    label: "Developer Test: Selection mismatch on q1",
    category: "developer_test",
    description: "I accidentally clicked Inductive when I meant Abductive because Mika is making an educated guess.",
    expected_feedback_kind: "clarification",
    request: {
      question_id: "q1",
      student_choice_id: "A",
      student_reasoning:
        "I accidentally clicked Inductive when I meant Abductive because Mika is making an educated guess.",
      clarification_attempt_count: 0,
    },
  },
];

export interface LiveRunRecord {
  test_name: string;
  test_type: "reviewed_case" | "developer_counterexample" | "multi_turn_sequence";
  case_id?: string | undefined;
  turn?: number | undefined;
  input: FeedbackRequest;
  expected_feedback_kind: "clarification" | "diagnosis" | "fallback";
  telemetry: {
    decision: PipelineDecisionKind;
    reason: string | null;
    model_called: boolean;
    attempts: number;
    error: string | null;
  };
  model_attempts: {
    attempt_number: number;
    latency_ms: number;
    raw_response: string | null;
    error: string | null;
  }[];
  safeguard_assessment: {
    isUnclear: boolean;
    reason: string | null;
    notes: string | null;
  };
  safeguard_intervened: boolean;
  final_result: FeedbackResult;
  total_latency_ms: number;
  validation_ok: boolean;
  outcome_matched: boolean;
}

export interface SequenceSummary {
  sequence_id: string;
  description: string;
  status: "PASSED" | "FAILED" | "INCONCLUSIVE";
  halted_early: boolean;
  notes: string;
  turns: LiveRunRecord[];
}

export async function runF7LiveVerification(): Promise<void> {
  const model = process.env.OLLAMA_MODEL ?? "llama3.2:latest";
  const endpoint = process.env.OLLAMA_ENDPOINT ?? "http://127.0.0.1:11434/api/chat";
  const timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT_MS ?? "15000", 10);
  const endpointBase = endpoint.replace(/\/api\/chat\/?$/, "");

  console.log("==========================================================");
  console.log("   F7 Vague-Answer Handling Focused Live Verification    ");
  console.log("==========================================================");
  console.log(`Model: ${model} (provisional check)`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Timeout: ${timeoutMs}ms`);
  console.log(`Temperature: 0.1, stream: false`);

  // Gather Hardware & System metadata
  const cpus = os.cpus();
  const hardware = {
    platform: `${os.platform()} ${os.release()} (${os.arch()})`,
    cpu_model: cpus[0]?.model ?? "Unknown CPU",
    cpu_cores: cpus.length,
    total_memory_gb: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2) + " GB",
  };
  console.log(`Hardware: ${hardware.cpu_model} (${hardware.cpu_cores} cores), RAM: ${hardware.total_memory_gb}`);

  // Fetch model metadata
  const modelMeta = await fetchOllamaModelMetadata(endpointBase, model);
  const modelDigest = modelMeta?.digest ?? "unknown";
  console.log(`Digest: ${modelDigest}`);
  if (modelMeta?.details) {
    console.log(
      `Format: ${modelMeta.details.format}, Param: ${modelMeta.details.parameter_size}, Quant: ${modelMeta.details.quantization_level}`
    );
  }

  // Setup transport and pipeline
  const innerTransport = new HttpOllamaTransport({
    endpoint,
    model,
    timeoutMs,
  });
  const observableTransport = new ObservableTransport(innerTransport);
  const pipeline = new FeedbackPipeline(observableTransport);

  // Warm-up request
  console.log("\n[Warm-up] Warming up model with a lightweight ping...");
  const warmStart = performance.now();
  let warmStatus = "SUCCESS";
  try {
    await observableTransport.chat([
      { role: "system", content: "You are a test helper. Respond with JSON: {\"status\":\"ok\"}" },
      { role: "user", content: "ping" },
    ]);
  } catch (err) {
    warmStatus = `FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }
  const warmLatency = Math.round(performance.now() - warmStart);
  console.log(`Warm-up status: ${warmStatus} (${warmLatency}ms)`);
  observableTransport.reset();

  const runRecords: LiveRunRecord[] = [];

  // 1. Part 1: Reviewed F3 Cases directly from dataset
  console.log("\n--- Part 1: Eight Reviewed F3 Cases (Exact Dataset Load) ---");
  const approvedCases = loadApprovedF3Cases();

  for (const c of approvedCases) {
    observableTransport.reset();
    const q = getQuestion(c.request.question_id);
    if (!q) throw new Error(`Question not found: ${c.request.question_id}`);

    const safeguardCheck = assessReasoningClarity(
      c.request.student_reasoning,
      q,
      c.request.student_choice_id
    );

    const start = performance.now();
    const { result, telemetry } = await pipeline.processFeedbackWithTelemetry(c.request);
    const totalLatency = Math.round(performance.now() - start);

    const attempts = observableTransport.getAttemptRecords();
    const validation = FeedbackResultSchema.safeParse(result);
    const outcomeMatched = result.kind === c.expected_feedback_kind;
    const safeguardIntervened =
      telemetry.decision === "safeguard_clarification" ||
      telemetry.decision === "second_unclear_fallback";

    const record: LiveRunRecord = {
      test_name: `Reviewed Case ${c.case_id}`,
      test_type: "reviewed_case",
      case_id: c.case_id,
      input: c.request,
      expected_feedback_kind: c.expected_feedback_kind,
      telemetry: {
        decision: telemetry.decision,
        reason: telemetry.reason ?? null,
        model_called: telemetry.model_called,
        attempts: telemetry.attempts,
        error: telemetry.error ?? null,
      },
      model_attempts: attempts,
      safeguard_assessment: {
        isUnclear: safeguardCheck.isUnclear,
        reason: safeguardCheck.reason ?? null,
        notes: safeguardCheck.notes ?? null,
      },
      safeguard_intervened: safeguardIntervened,
      final_result: result,
      total_latency_ms: totalLatency,
      validation_ok: validation.success,
      outcome_matched: outcomeMatched,
    };

    runRecords.push(record);

    console.log(`\n[${c.case_id}] ${c.description}`);
    console.log(`  Question: ${c.request.question_id}, Choice: ${c.request.student_choice_id}`);
    console.log(`  Decision: ${telemetry.decision} (reason: ${telemetry.reason ?? "none"})`);
    console.log(`  Model called: ${telemetry.model_called ? `Yes (${attempts.length} attempts)` : "model not called"}`);
    console.log(`  Safeguard Check: ${safeguardCheck.isUnclear ? `UNCLEAR (${safeguardCheck.reason})` : "CLEAR"}`);
    console.log(`  Outcome: kind=${result.kind} (Expected: ${c.expected_feedback_kind}, Match: ${outcomeMatched ? "✓" : "✗"}) in ${totalLatency}ms`);
  }

  // 2. Part 2: Developer Counterexamples (Distinctly Labeled)
  console.log("\n--- Part 2: Developer Counterexamples (Distinctly Labeled) ---");

  for (const c of DEVELOPER_COUNTEREXAMPLES) {
    observableTransport.reset();
    const q = getQuestion(c.request.question_id);
    if (!q) throw new Error(`Question not found: ${c.request.question_id}`);

    const safeguardCheck = assessReasoningClarity(
      c.request.student_reasoning,
      q,
      c.request.student_choice_id
    );

    const start = performance.now();
    const { result, telemetry } = await pipeline.processFeedbackWithTelemetry(c.request);
    const totalLatency = Math.round(performance.now() - start);

    const attempts = observableTransport.getAttemptRecords();
    const validation = FeedbackResultSchema.safeParse(result);
    const outcomeMatched = result.kind === c.expected_feedback_kind;
    const safeguardIntervened =
      telemetry.decision === "safeguard_clarification" ||
      telemetry.decision === "second_unclear_fallback";

    const record: LiveRunRecord = {
      test_name: c.label,
      test_type: "developer_counterexample",
      case_id: c.test_id,
      input: c.request,
      expected_feedback_kind: c.expected_feedback_kind,
      telemetry: {
        decision: telemetry.decision,
        reason: telemetry.reason ?? null,
        model_called: telemetry.model_called,
        attempts: telemetry.attempts,
        error: telemetry.error ?? null,
      },
      model_attempts: attempts,
      safeguard_assessment: {
        isUnclear: safeguardCheck.isUnclear,
        reason: safeguardCheck.reason ?? null,
        notes: safeguardCheck.notes ?? null,
      },
      safeguard_intervened: safeguardIntervened,
      final_result: result,
      total_latency_ms: totalLatency,
      validation_ok: validation.success,
      outcome_matched: outcomeMatched,
    };

    runRecords.push(record);

    console.log(`\n[${c.test_id}] ${c.description}`);
    console.log(`  Decision: ${telemetry.decision} (reason: ${telemetry.reason ?? "none"})`);
    console.log(`  Model called: ${telemetry.model_called ? `Yes (${attempts.length} attempts)` : "model not called"}`);
    console.log(`  Safeguard Check: ${safeguardCheck.isUnclear ? `UNCLEAR (${safeguardCheck.reason})` : "CLEAR"}`);
    console.log(`  Outcome: kind=${result.kind} (Expected: ${c.expected_feedback_kind}, Match: ${outcomeMatched ? "✓" : "✗"}) in ${totalLatency}ms`);
  }

  // 3. Part 3: Sequence 1 (Unclear -> Unclear -> Verified Fallback)
  console.log("\n--- Part 3: Sequence 1 (Unclear -> Unclear -> Verified Fallback) ---");
  const sequence1Summary: SequenceSummary = {
    sequence_id: "SEQ-01",
    description: "Two consecutive unclear responses on q1 leading to verified fallback",
    status: "INCONCLUSIVE",
    halted_early: false,
    notes: "",
    turns: [],
  };

  {
    // Turn 1: T07 ("I guessed.", count 0)
    observableTransport.reset();
    const q1 = getQuestion("q1")!;
    const req1: FeedbackRequest = {
      question_id: "q1",
      student_choice_id: "A",
      student_reasoning: "I guessed.",
      clarification_attempt_count: 0,
    };
    const s1 = performance.now();
    const { result: res1, telemetry: tel1 } = await pipeline.processFeedbackWithTelemetry(req1);
    const lat1 = Math.round(performance.now() - s1);
    const att1 = observableTransport.getAttemptRecords();
    const assess1 = assessReasoningClarity(req1.student_reasoning, q1, req1.student_choice_id);

    const turn1Record: LiveRunRecord = {
      test_name: "Sequence 1 - Turn 1 (First Unclear)",
      test_type: "multi_turn_sequence",
      turn: 1,
      input: req1,
      expected_feedback_kind: "clarification",
      telemetry: {
        decision: tel1.decision,
        reason: tel1.reason ?? null,
        model_called: tel1.model_called,
        attempts: tel1.attempts,
        error: tel1.error ?? null,
      },
      model_attempts: att1,
      safeguard_assessment: {
        isUnclear: assess1.isUnclear,
        reason: assess1.reason ?? null,
        notes: assess1.notes ?? null,
      },
      safeguard_intervened:
        tel1.decision === "safeguard_clarification" || tel1.decision === "second_unclear_fallback",
      final_result: res1,
      total_latency_ms: lat1,
      validation_ok: FeedbackResultSchema.safeParse(res1).success,
      outcome_matched: res1.kind === "clarification",
    };
    runRecords.push(turn1Record);
    sequence1Summary.turns.push(turn1Record);

    console.log(`Turn 1 (count=0, "I guessed.") -> kind=${res1.kind}, decision=${tel1.decision} (${lat1}ms)`);

    // Strict Sequence Halt Check
    if (res1.kind !== "clarification") {
      sequence1Summary.status = "FAILED";
      sequence1Summary.halted_early = true;
      sequence1Summary.notes = `Turn 1 did not produce clarification (got kind=${res1.kind}, decision=${tel1.decision}). Sequence halted; terminal outcome reached.`;
      console.error(`  ✗ ${sequence1Summary.notes}`);
    } else {
      // Turn 2: Derived count = Turn 1 count + 1 = 1
      const countForTurn2 = (req1.clarification_attempt_count ?? 0) + 1;
      observableTransport.reset();
      const req2: FeedbackRequest = {
        question_id: "q1",
        student_choice_id: "A",
        student_reasoning: "Maybe that one? I don't know.",
        clarification_attempt_count: countForTurn2,
      };
      const s2 = performance.now();
      const { result: res2, telemetry: tel2 } = await pipeline.processFeedbackWithTelemetry(req2);
      const lat2 = Math.round(performance.now() - s2);
      const att2 = observableTransport.getAttemptRecords();
      const assess2 = assessReasoningClarity(req2.student_reasoning, q1, req2.student_choice_id);

      const turn2Record: LiveRunRecord = {
        test_name: "Sequence 1 - Turn 2 (Second Unclear -> Fallback)",
        test_type: "multi_turn_sequence",
        turn: 2,
        input: req2,
        expected_feedback_kind: "fallback",
        telemetry: {
          decision: tel2.decision,
          reason: tel2.reason ?? null,
          model_called: tel2.model_called,
          attempts: tel2.attempts,
          error: tel2.error ?? null,
        },
        model_attempts: att2,
        safeguard_assessment: {
          isUnclear: assess2.isUnclear,
          reason: assess2.reason ?? null,
          notes: assess2.notes ?? null,
        },
        safeguard_intervened:
          tel2.decision === "safeguard_clarification" || tel2.decision === "second_unclear_fallback",
        final_result: res2,
        total_latency_ms: lat2,
        validation_ok: FeedbackResultSchema.safeParse(res2).success,
        outcome_matched: res2.kind === "fallback" && tel2.decision === "second_unclear_fallback",
      };
      runRecords.push(turn2Record);
      sequence1Summary.turns.push(turn2Record);

      console.log(`Turn 2 (derived count=${countForTurn2}, second unclear) -> kind=${res2.kind}, decision=${tel2.decision} (${lat2}ms)`);
      if (res2.kind === "fallback" && tel2.decision === "second_unclear_fallback") {
        sequence1Summary.status = "PASSED";
        sequence1Summary.notes = "Successfully transitioned from clarification to verified fallback on second unclear response.";
        console.log(`  ✓ Sequence 1 PASSED: ${sequence1Summary.notes}`);
      } else {
        sequence1Summary.status = "FAILED";
        sequence1Summary.notes = `Expected second_unclear_fallback, got kind=${res2.kind}, decision=${tel2.decision}`;
        console.error(`  ✗ Sequence 1 FAILED: ${sequence1Summary.notes}`);
      }
    }
  }

  // 4. Part 4: Sequence 2 (Unclear -> Substantive -> Genuine Diagnosis)
  console.log("\n--- Part 4: Sequence 2 (Unclear -> Substantive -> Genuine Diagnosis) ---");
  const sequence2Summary: SequenceSummary = {
    sequence_id: "SEQ-02",
    description: "First unclear response followed by substantive explanation leading to genuine diagnosis",
    status: "INCONCLUSIVE",
    halted_early: false,
    notes: "",
    turns: [],
  };

  {
    // Turn 1: T07 ("I guessed.", count 0)
    observableTransport.reset();
    const q1 = getQuestion("q1")!;
    const req1: FeedbackRequest = {
      question_id: "q1",
      student_choice_id: "A",
      student_reasoning: "I guessed.",
      clarification_attempt_count: 0,
    };
    const s1 = performance.now();
    const { result: res1, telemetry: tel1 } = await pipeline.processFeedbackWithTelemetry(req1);
    const lat1 = Math.round(performance.now() - s1);
    const att1 = observableTransport.getAttemptRecords();
    const assess1 = assessReasoningClarity(req1.student_reasoning, q1, req1.student_choice_id);

    const turn1Record: LiveRunRecord = {
      test_name: "Sequence 2 - Turn 1 (First Unclear)",
      test_type: "multi_turn_sequence",
      turn: 1,
      input: req1,
      expected_feedback_kind: "clarification",
      telemetry: {
        decision: tel1.decision,
        reason: tel1.reason ?? null,
        model_called: tel1.model_called,
        attempts: tel1.attempts,
        error: tel1.error ?? null,
      },
      model_attempts: att1,
      safeguard_assessment: {
        isUnclear: assess1.isUnclear,
        reason: assess1.reason ?? null,
        notes: assess1.notes ?? null,
      },
      safeguard_intervened:
        tel1.decision === "safeguard_clarification" || tel1.decision === "second_unclear_fallback",
      final_result: res1,
      total_latency_ms: lat1,
      validation_ok: FeedbackResultSchema.safeParse(res1).success,
      outcome_matched: res1.kind === "clarification",
    };
    runRecords.push(turn1Record);
    sequence2Summary.turns.push(turn1Record);

    console.log(`Turn 1 (count=0, "I guessed.") -> kind=${res1.kind}, decision=${tel1.decision} (${lat1}ms)`);

    // Strict Sequence Halt Check
    if (res1.kind !== "clarification") {
      sequence2Summary.status = "FAILED";
      sequence2Summary.halted_early = true;
      sequence2Summary.notes = `Turn 1 did not produce clarification (got kind=${res1.kind}, decision=${tel1.decision}). Sequence halted; terminal outcome reached.`;
      console.error(`  ✗ ${sequence2Summary.notes}`);
    } else {
      // Turn 2: Derived count = Turn 1 count + 1 = 1
      const countForTurn2 = (req1.clarification_attempt_count ?? 0) + 1;
      observableTransport.reset();
      const req2: FeedbackRequest = {
        question_id: "q1",
        student_choice_id: "A",
        student_reasoning:
          "They observed water and made a conclusion. Any conclusion from an observation is induction.",
        clarification_attempt_count: countForTurn2,
      };
      const s2 = performance.now();
      const { result: res2, telemetry: tel2 } = await pipeline.processFeedbackWithTelemetry(req2);
      const lat2 = Math.round(performance.now() - s2);
      const att2 = observableTransport.getAttemptRecords();
      const assess2 = assessReasoningClarity(req2.student_reasoning, q1, req2.student_choice_id);

      const turn2Record: LiveRunRecord = {
        test_name: "Sequence 2 - Turn 2 (Substantive Resubmission -> Diagnosis)",
        test_type: "multi_turn_sequence",
        turn: 2,
        input: req2,
        expected_feedback_kind: "diagnosis",
        telemetry: {
          decision: tel2.decision,
          reason: tel2.reason ?? null,
          model_called: tel2.model_called,
          attempts: tel2.attempts,
          error: tel2.error ?? null,
        },
        model_attempts: att2,
        safeguard_assessment: {
          isUnclear: assess2.isUnclear,
          reason: assess2.reason ?? null,
          notes: assess2.notes ?? null,
        },
        safeguard_intervened: false,
        final_result: res2,
        total_latency_ms: lat2,
        validation_ok: FeedbackResultSchema.safeParse(res2).success,
        outcome_matched: res2.kind === "diagnosis" && tel2.decision === "accepted_diagnosis",
      };
      runRecords.push(turn2Record);
      sequence2Summary.turns.push(turn2Record);

      console.log(`Turn 2 (derived count=${countForTurn2}, substantive) -> kind=${res2.kind}, decision=${tel2.decision} (${lat2}ms)`);
      if (res2.kind === "diagnosis" && tel2.decision === "accepted_diagnosis") {
        sequence2Summary.status = "PASSED";
        sequence2Summary.notes = "Successfully transitioned from clarification to genuine accepted diagnosis.";
        console.log(`  ✓ Sequence 2 PASSED: ${sequence2Summary.notes}`);
      } else {
        sequence2Summary.status = "FAILED";
        sequence2Summary.notes = `Expected accepted_diagnosis, got kind=${res2.kind}, decision=${tel2.decision}`;
        console.error(`  ✗ Sequence 2 FAILED: ${sequence2Summary.notes}`);
      }
    }
  }

  // Persist results into NEW timestamped directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dataDir = getDataDirectory();
  const outputDir = path.join(dataDir, "eval-results", "runs", `f7-live-${timestamp}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const summary = {
    run_id: `f7-live-${timestamp}`,
    created_at: new Date().toISOString(),
    feature: "F7 — Vague-answer handling and tuning",
    model,
    model_digest: modelDigest,
    hardware,
    warmup: {
      status: warmStatus,
      latency_ms: warmLatency,
    },
    runtime_settings: {
      temperature: 0.1,
      stream: false,
      timeout_ms: timeoutMs,
      endpoint,
    },
    prompt_version: "2026-10-10-f7-tuned-strict-clarity",
    sequences: {
      sequence_1: sequence1Summary,
      sequence_2: sequence2Summary,
    },
    total_records: runRecords.length,
    records: runRecords,
  };

  const jsonPath = path.join(outputDir, "f7-live-results.json");
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");

  // Generate markdown report
  let md = `# F7 Vague-Answer Handling Live Verification Report\n\n`;
  md += `**Run ID**: \`${summary.run_id}\`\n`;
  md += `**Date**: ${summary.created_at}\n`;
  md += `**Model**: \`${model}\` (Provisional, not permanent selection)\n`;
  md += `**Digest**: \`${modelDigest}\`\n`;
  md += `**Hardware**: ${hardware.cpu_model} (${hardware.cpu_cores} cores), ${hardware.total_memory_gb} RAM, ${hardware.platform}\n`;
  md += `**Warm-up**: ${warmStatus} (${warmLatency}ms)\n\n`;

  md += `## 1. Eight Reviewed F3 Cases (Exact Dataset Load)\n\n`;
  md += `| Case ID | Category | Question / Choice | Expected | Decision | Model Called | Safeguard Assessment | Result Kind | Match | Latency |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of runRecords.filter((x) => x.test_type === "reviewed_case")) {
    md += `| **${r.case_id}** | ${r.test_name} | ${r.input.question_id}/${r.input.student_choice_id} | \`${r.expected_feedback_kind}\` | \`${r.telemetry.decision}\` | ${r.telemetry.model_called ? "Yes" : "No"} | ${r.safeguard_assessment.isUnclear ? `Unclear (${r.safeguard_assessment.reason})` : "Clear"} | \`${r.final_result.kind}\` | ${r.outcome_matched ? "✓" : "✗"} | ${r.total_latency_ms}ms |\n`;
  }
  md += `\n`;

  md += `## 2. Developer Counterexamples (Distinctly Labeled)\n\n`;
  md += `| Test ID | Label | Expected | Decision | Model Called | Safeguard Assessment | Result Kind | Match | Latency |\n`;
  md += `|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of runRecords.filter((x) => x.test_type === "developer_counterexample")) {
    md += `| **${r.case_id}** | ${r.test_name} | \`${r.expected_feedback_kind}\` | \`${r.telemetry.decision}\` | ${r.telemetry.model_called ? "Yes" : "No"} | ${r.safeguard_assessment.isUnclear ? `Unclear (${r.safeguard_assessment.reason})` : "Clear"} | \`${r.final_result.kind}\` | ${r.outcome_matched ? "✓" : "✗"} | ${r.total_latency_ms}ms |\n`;
  }
  md += `\n`;

  md += `## 3. Multi-Turn Clarification Sequences\n\n`;
  md += `### Sequence 1: Unclear -> Unclear -> Verified Fallback\n`;
  md += `- **Status**: **${sequence1Summary.status}**\n`;
  md += `- **Notes**: ${sequence1Summary.notes}\n`;
  md += `- **Halted Early**: ${sequence1Summary.halted_early ? "Yes" : "No"}\n`;
  for (const r of sequence1Summary.turns) {
    md += `  - **Turn ${r.turn}**: Input count=\`${r.input.clarification_attempt_count}\`, reasoning="${r.input.student_reasoning}". Decision: \`${r.telemetry.decision}\`, Result: \`${r.final_result.kind}\` (${r.total_latency_ms}ms). Matched: ${r.outcome_matched ? "✓" : "✗"}.\n`;
  }
  md += `\n`;

  md += `### Sequence 2: Unclear -> Substantive -> Genuine Diagnosis\n`;
  md += `- **Status**: **${sequence2Summary.status}**\n`;
  md += `- **Notes**: ${sequence2Summary.notes}\n`;
  md += `- **Halted Early**: ${sequence2Summary.halted_early ? "Yes" : "No"}\n`;
  for (const r of sequence2Summary.turns) {
    md += `  - **Turn ${r.turn}**: Input count=\`${r.input.clarification_attempt_count}\`, reasoning="${r.input.student_reasoning}". Decision: \`${r.telemetry.decision}\`, Result: \`${r.final_result.kind}\` (${r.total_latency_ms}ms). Matched: ${r.outcome_matched ? "✓" : "✗"}.\n`;
  }
  md += `\n`;

  md += `## 4. Execution Telemetry & Model Verification\n\n`;
  for (const r of runRecords) {
    md += `### ${r.test_name}\n`;
    md += `- **Type**: ${r.test_type}\n`;
    md += `- **Reasoning**: "${r.input.student_reasoning}"\n`;
    md += `- **Count**: ${r.input.clarification_attempt_count ?? "omitted"}\n`;
    md += `- **Telemetry Decision**: \`${r.telemetry.decision}\` (reason: ${r.telemetry.reason ?? "none"})\n`;
    md += `- **Model Called**: ${r.telemetry.model_called ? `Yes (${r.telemetry.attempts} attempts)` : "model not called"}\n`;
    if (r.telemetry.model_called && r.model_attempts[0]?.raw_response) {
      md += `- **Raw Model Output**: \`${r.model_attempts[0].raw_response.trim()}\`\n`;
    }
    if (r.telemetry.error) {
      md += `- **Error Recorded**: \`${r.telemetry.error}\`\n`;
    }
    md += `- **Safeguard Assessment**: isUnclear=${r.safeguard_assessment.isUnclear}, reason=${r.safeguard_assessment.reason ?? "none"}\n`;
    md += `- **Final FeedbackResult**: \`${r.final_result.kind}\`\n\n`;
  }

  const mdPath = path.join(outputDir, "f7-live-summary.md");
  fs.writeFileSync(mdPath, md, "utf8");

  console.log(`\nResults saved to:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD:   ${mdPath}`);
  console.log(`\nF7 Live Verification Completed. Sequence 1: ${sequence1Summary.status}, Sequence 2: ${sequence2Summary.status}.`);

  // Exit nonzero after saving artifacts if any expected outcome mismatches or either sequence fails
  const mismatchedRecords = runRecords.filter((r) => !r.outcome_matched);
  const sequence1Failed = sequence1Summary.status !== "PASSED";
  const sequence2Failed = sequence2Summary.status !== "PASSED";

  if (mismatchedRecords.length > 0 || sequence1Failed || sequence2Failed) {
    console.error(`\n❌ F7 Live Verification FAILED:`);
    if (mismatchedRecords.length > 0) {
      console.error(`  - ${mismatchedRecords.length} record(s) mismatched expected outcome:`);
      for (const m of mismatchedRecords) {
        console.error(
          `    * [${m.test_name}] expected kind='${m.expected_feedback_kind}', got kind='${m.final_result.kind}' (decision: ${m.telemetry.decision})`
        );
      }
    }
    if (sequence1Failed) {
      console.error(`  - Sequence 1 failed: status=${sequence1Summary.status} (${sequence1Summary.notes})`);
    }
    if (sequence2Failed) {
      console.error(`  - Sequence 2 failed: status=${sequence2Summary.status} (${sequence2Summary.notes})`);
    }
    process.exitCode = 1;
  } else {
    console.log(`\n✅ All outcomes matched and both sequences passed.`);
  }
}

// Execute if run directly as script
if (process.argv[1] && process.argv[1].endsWith("live-test-f7.ts")) {
  runF7LiveVerification().catch((err) => {
    console.error("Live test failed:", err);
    process.exit(1);
  });
}
