import fs from "node:fs";
import path from "node:path";
import {
  validateEvalDirectory,
  defaultDataDirectory,
} from "./validate-eval-cases.js";
import { runModelEvaluation, type EvalRunnerResult } from "../src/eval/eval-runner.js";
import { formatHumanJudgeReviewSheet } from "../src/eval/eval-summary.js";
import { MockOllamaTransport } from "../test/support/mock-transport.js";
import { getQuestion, getLinkedFollowUps, loadContent } from "../src/content.js";

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
    const match = data.models.find(
      (m) =>
        m.name === modelName ||
        m.model === modelName ||
        m.name.startsWith(modelName) ||
        modelName.startsWith(m.name)
    );
    return match ?? null;
  } catch {
    return null;
  }
}

function sanitizeModelName(name: string): string {
  return name.replace(/[:/]/g, "-");
}

function generateComparisonSummaryMarkdown(
  metricsList: { model: string; runnerResult: EvalRunnerResult; meta: OllamaTagModel | null }[],
  runDate: string,
  runId: string,
  isDryRun: boolean
): string {
  let md = `# F5 Model Comparison Summary\n\n`;
  md += `**Run ID**: \`${runId}\`${isDryRun ? " *(DRY-RUN / OFFLINE)*" : ""}\n`;
  md += `**Evaluation Date**: ${runDate}\n`;
  md += `**Scope**: 15 Approved F3 Test Cases (T01–T15) across Installed Candidates\n\n`;

  md += `## 1. Candidate Model Hardware & Packaging Metadata\n\n`;
  md += `| Candidate Model | Tag/Digest | Size | Parameter Size | Quantization |\n`;
  md += `|---|---|---|---|---|\n`;
  for (const item of metricsList) {
    const meta = item.meta;
    const sizeGb = meta?.size ? `${(meta.size / (1024 * 1024 * 1024)).toFixed(2)} GB` : "N/A";
    const digestShort = item.runnerResult.model_digest ? item.runnerResult.model_digest.slice(0, 12) : (meta?.digest ? meta.digest.slice(0, 12) : "offline/simulated");
    const param = meta?.details?.parameter_size ?? "N/A";
    const quant = meta?.details?.quantization_level ?? "N/A";
    md += `| **${item.model}** | \`${digestShort}\` | ${sizeGb} | ${param} | ${quant} |\n`;
  }
  md += `\n`;

  md += `## 2. Runtime Settings & Warm-up Outcome\n\n`;
  md += `| Candidate Model | Timeout Setting | Warm-up Status | Warm-up Latency | Prompt Version |\n`;
  md += `|---|---|---|---|---|\n`;
  for (const item of metricsList) {
    const r = item.runnerResult;
    const warmupLat = r.warmup_outcome.latency_ms !== null ? `${r.warmup_outcome.latency_ms}ms` : "N/A";
    md += `| **${item.model}** | ${r.runtime_settings.timeout_ms}ms | ${r.warmup_outcome.status} | ${warmupLat} | ${r.provenance_evidence.pipeline_prompt_version} |\n`;
  }
  md += `\n`;

  md += `## 3. Quantitative Evaluation Targets & Results\n\n`;
  md += `All criteria are evaluated against the locked standards in \`docs/DECISIONS.md\`:\n\n`;
  md += `| Metric / Target | Target Threshold | ${metricsList.map((m) => `**${m.model}**`).join(" | ")} |\n`;
  md += `|---|---|${metricsList.map(() => "---").join("|")}|\n`;

  md += `| **All 15 Expected Cases Present** | Exactly 15 Unique | ${metricsList
    .map((m) => `${m.runnerResult.metrics.all_expected_cases_present ? "15/15 ✅" : "INCOMPLETE ❌"}`)
    .join(" | ")} |\n`;

  md += `| **Timings Complete** | 100% Present | ${metricsList
    .map((m) => `${m.runnerResult.metrics.timings_complete ? "Complete ✅" : "Missing Timings ❌"}`)
    .join(" | ")} |\n`;

  md += `| **First-Attempt Schema Validity** | ≥ 95.0% (15/15) | ${metricsList
    .map(
      (m) =>
        `${(m.runnerResult.metrics.first_attempt_schema_valid_rate * 100).toFixed(1)}% (${m.runnerResult.metrics.first_attempt_schema_valid_count}/15) ${m.runnerResult.metrics.schema_validity_target_met ? "✅" : "❌"}`
    )
    .join(" | ")} |\n`;

  md += `| **Vague Case Clarification Rate** | 100.0% (7/7) | ${metricsList
    .map(
      (m) =>
        `${(m.runnerResult.metrics.vague_clarification_rate * 100).toFixed(1)}% (${m.runnerResult.metrics.vague_needs_clarification_count}/7) ${m.runnerResult.metrics.vague_clarification_target_met ? "✅" : "❌"}`
    )
    .join(" | ")} |\n`;

  md += `| **Invented Misconceptions (Vague)** | Exactly 0 (No Unknowns) | ${metricsList
    .map(
      (m) =>
        `${m.runnerResult.metrics.invented_misconceptions_count} ${m.runnerResult.metrics.unknown_safety_cases_count > 0 ? `(${m.runnerResult.metrics.unknown_safety_cases_count} unknown) ` : ""}${m.runnerResult.metrics.invented_misconceptions_target_met ? "✅" : "❌"}`
    )
    .join(" | ")} |\n`;

  md += `| **Typical Pipeline Latency (Median)** | < 10.0s (10,000ms) | ${metricsList
    .map(
      (m) =>
        `${(m.runnerResult.metrics.latencies.median_ms / 1000).toFixed(2)}s (${m.runnerResult.metrics.latencies.median_ms}ms) ${m.runnerResult.metrics.typical_latency_target_met ? "✅" : "❌"}`
    )
    .join(" | ")} |\n`;

  md += `| **Retries Count** | Minimal | ${metricsList.map((m) => `${m.runnerResult.metrics.retries_count}`).join(" | ")} |\n`;
  md += `| **Repairs Count** | Minimal | ${metricsList.map((m) => `${m.runnerResult.metrics.repairs_count}`).join(" | ")} |\n`;

  md += `| **Human Agreement Status** | ≥ 80.0% Unanimous (≥7/8) | ${metricsList
    .map((m) => `**${m.runnerResult.metrics.human_agreement_status}** ⏳`)
    .join(" | ")} |\n\n`;

  md += `## 4. Latency Distribution Breakdown\n\n`;
  md += `| Candidate Model | Pre-flight Warm-up | Median (P50) | Mean | P90 | Min | Max |\n`;
  md += `|---|---|---|---|---|---|---|\n`;
  for (const item of metricsList) {
    const l = item.runnerResult.metrics.latencies;
    const warmup = item.runnerResult.warmup_latency_ms !== null ? `${(item.runnerResult.warmup_latency_ms / 1000).toFixed(2)}s` : "N/A";
    md += `| **${item.model}** | ${warmup} | ${(l.median_ms / 1000).toFixed(2)}s | ${(l.mean_ms / 1000).toFixed(2)}s | ${(l.p90_ms / 1000).toFixed(2)}s | ${(l.min_ms / 1000).toFixed(2)}s | ${(l.max_ms / 1000).toFixed(2)}s |\n`;
  }
  md += `\n`;

  md += `## 5. Human Review Status\n\n`;
  md += `- **Required Reviewers**: Two distinct identified human judges.\n`;
  md += `- **Judged Cases**: 8 clear misunderstanding diagnosis cases (T01, T02, T03, T04, T05, T06, T12, T13).\n`;
  md += `- **Rule**: Fallback outcomes cannot earn a diagnosis pass.\n`;
  md += `- **Current State**: Judgments remain unfilled (\`null\`) and human agreement is strictly **PENDING**.\n`;
  md += `- Review sheets generated:\n`;
  for (const item of metricsList) {
    const sName = sanitizeModelName(item.model);
    md += `  - [\`${sName}-judge-sheet.md\`](./${sName}-judge-sheet.md)\n`;
  }
  md += `\n`;

  md += `## 6. Model Recommendation & Provisional Status\n\n`;
  const eligibleCandidates = metricsList.filter((m) => m.runnerResult.metrics.all_quantitative_targets_met);
  if (eligibleCandidates.length === 1) {
    const best = eligibleCandidates[0]!;
    md += `### Provisional Recommendation: **${best.model}**\n\n`;
    md += `> [!IMPORTANT]\n`;
    md += `> **PROVISIONAL STATUS**: This recommendation is strictly **PROVISIONAL** pending human review.\n`;
    md += `> Under the approved F5 plan and \`AGENTS.md\`, F5 cannot be marked complete until two distinct human teammates fill and sign the review sheets for the 8 clear cases.\n\n`;
  } else if (eligibleCandidates.length > 1) {
    const sorted = [...eligibleCandidates].sort((a, b) => a.runnerResult.metrics.latencies.median_ms - b.runnerResult.metrics.latencies.median_ms);
    const best = sorted[0]!;
    md += `### Provisional Recommendation: **${best.model}**\n\n`;
    md += `> [!IMPORTANT]\n`;
    md += `> **PROVISIONAL STATUS**: This recommendation is strictly **PROVISIONAL** pending human review.\n`;
    md += `> Both models met quantitative targets, but ${best.model} had superior typical latency.\n\n`;
  } else {
    md += `### Provisional Recommendation: **None / Blocked**\n\n`;
    md += `Neither model passed all quantitative targets. See breakdown above for failures.\n\n`;
  }

  return md;
}

function parseCliArgs(): {
  isDryRun: boolean;
  models: string[];
  timeoutMs: number;
  skipWarmup: boolean;
  runId: string;
  outputDir?: string | undefined;
  endpointBase: string;
} {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
F5 Model Evaluation Runner CLI

Usage:
  npx tsx scripts/run-eval.ts [options]

Options:
  --dry-run              Run completely offline with deterministic mock transports
  --models <list>        Comma-separated list of models to evaluate (default: qwen2.5:7b,llama3.2:latest)
  --timeout <ms>         Request timeout in ms (default: 15000, F4 production timeout)
  --skip-warmup          Skip the pre-flight warm-up request
  --run-id <id>          Custom identifier for this run
  --output-dir <path>    Custom directory for output results
  --endpoint <url>       Ollama endpoint base URL (default: http://127.0.0.1:11434)
  --help, -h             Show this help message
`);
    process.exit(0);
  }

  const isDryRun = args.includes("--dry-run");
  const skipWarmup = args.includes("--skip-warmup");

  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
    const prefix = `${flag}=`;
    const m = args.find((a) => a.startsWith(prefix));
    return m ? m.slice(prefix.length) : undefined;
  };

  const modelsArg = getArg("--models") ?? getArg("--model") ?? process.env.EVAL_MODELS ?? "qwen2.5:7b,llama3.2:latest";
  const models = modelsArg.split(",").map((m) => m.trim()).filter(Boolean);

  const timeoutArg = getArg("--timeout") ?? process.env.OLLAMA_TIMEOUT_MS ?? "15000";
  const timeoutMs = parseInt(timeoutArg, 10);

  const runId = getArg("--run-id") ?? `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const outputDir = getArg("--output-dir");
  const endpointBase = getArg("--endpoint") ?? process.env.OLLAMA_ENDPOINT_BASE ?? "http://127.0.0.1:11434";

  return { isDryRun, models, timeoutMs, skipWarmup, runId, outputDir, endpointBase };
}

function createDeterministicMockTransport(modelName: string): MockOllamaTransport {
  loadContent();
  const responses: string[] = [];
  // Warmup response
  responses.push(JSON.stringify({ status: "needs_clarification", clarification_prompt: "warmup prompt", needs_clarification: true, explanation: "", concept_ids: [], possible_misconception: null, follow_up_id: null, confidence: "low" }));

  // Responses for the 15 cases (T01..T15)
  // T01..T06: diagnosis
  // T07..T11: clarification
  // T12, T13: diagnosis
  // T14, T15: clarification
  const caseKinds = [
    { id: "T01", kind: "diagnosis", q: "q1" },
    { id: "T02", kind: "diagnosis", q: "q2" },
    { id: "T03", kind: "diagnosis", q: "q3" },
    { id: "T04", kind: "diagnosis", q: "q4" },
    { id: "T05", kind: "diagnosis", q: "q5" },
    { id: "T06", kind: "diagnosis", q: "q6" },
    { id: "T07", kind: "clarification", q: "q1" },
    { id: "T08", kind: "clarification", q: "q2" },
    { id: "T09", kind: "clarification", q: "q3" },
    { id: "T10", kind: "clarification", q: "q4" },
    { id: "T11", kind: "clarification", q: "q5" },
    { id: "T12", kind: "diagnosis", q: "q6" },
    { id: "T13", kind: "diagnosis", q: "q1" },
    { id: "T14", kind: "clarification", q: "q2" },
    { id: "T15", kind: "clarification", q: "q3" },
  ];

  for (const c of caseKinds) {
    if (c.kind === "clarification") {
      responses.push(
        JSON.stringify({
          status: "needs_clarification",
          possible_misconception: null,
          explanation: "",
          concept_ids: [],
          follow_up_id: null,
          needs_clarification: true,
          clarification_prompt: `Can you explain your reasoning for ${c.id}?`,
          confidence: "low",
        })
      );
    } else {
      const q = getQuestion(c.q)!;
      const linked = getLinkedFollowUps(q);
      const pair = linked[0]?.concept_pair ?? ["induction", "deduction"];
      responses.push(
        JSON.stringify({
          status: "possible_misconception",
          possible_misconception: `Misconception identified by ${modelName} on ${c.id}`,
          explanation: `Explaining the distinction between concepts for ${c.id}.`,
          concept_ids: [...pair],
          follow_up_id: null,
          needs_clarification: false,
          clarification_prompt: null,
          confidence: "high",
        })
      );
    }
  }

  return new MockOllamaTransport(responses);
}

async function main(): Promise<void> {
  const cli = parseCliArgs();
  const dataDir = defaultDataDirectory();

  const runMode = cli.isDryRun
    ? "dry_run"
    : cli.timeoutMs > 15000
      ? "diagnostic"
      : "production";

  console.log(`=== F5 Model Evaluation Runner ===`);
  console.log(`Mode: ${cli.isDryRun ? "OFFLINE DRY-RUN (using deterministic mock transports)" : runMode.toUpperCase()}`);
  console.log(`Run ID: ${cli.runId}`);
  console.log(`Timeout: ${cli.timeoutMs}ms${cli.timeoutMs > 15000 ? " (DIAGNOSTIC: exceeds F4 15000ms production standard)" : " (F4 production standard: 15000ms)"}`);
  console.log(`Warm-up enabled: ${!cli.skipWarmup}`);
  console.log(`Models: ${cli.models.join(", ")}`);
  console.log(`Data directory: ${dataDir}`);

  // 1. Validate F3 inputs
  console.log(`\nValidating F3 source data...`);
  const report = validateEvalDirectory(dataDir);
  if (!report.ok) {
    console.error("Evaluation input data validation failed:");
    for (const err of report.errors) {
      console.error(`- [${err.code}] ${err.path.join(".")}: ${err.message}`);
    }
    process.exit(1);
  }
  console.log(`✓ F3 dataset and template verified successfully.`);

  const { casesDataset, template } = report.data!;

  // 2. Determine target output directory
  const outDir = cli.outputDir
    ? path.resolve(cli.outputDir)
    : path.resolve(dataDir, "eval-results", "runs", cli.runId);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  console.log(`Output directory: ${outDir}`);

  const chatEndpoint = `${cli.endpointBase}/api/chat`;

  const referenceMap: Record<string, { student_explanation: string; what_reviewers_should_assess: string; question_id: string; student_choice_id: string }> = {};
  for (const c of casesDataset.cases) {
    referenceMap[c.id] = {
      student_explanation: c.student_explanation,
      what_reviewers_should_assess: c.what_reviewers_should_assess,
      question_id: c.question_id,
      student_choice_id: c.student_choice_id,
    };
  }

  const allSummaryMetrics: { model: string; runnerResult: EvalRunnerResult; meta: OllamaTagModel | null }[] = [];
  const runDate = new Date().toISOString().slice(0, 10);

  for (const model of cli.models) {
    console.log(`\n======================================================`);
    console.log(`Evaluating Candidate: ${model}`);
    console.log(`======================================================`);

    let meta: OllamaTagModel | null = null;
    let transportToUse: MockOllamaTransport | undefined;

    if (cli.isDryRun) {
      console.log(`[Dry-Run] Using deterministic mock transport for ${model}`);
      transportToUse = createDeterministicMockTransport(model);
    } else {
      meta = await fetchOllamaModelMetadata(cli.endpointBase, model);
      if (meta) {
        console.log(`Model metadata: Size ${(meta.size / (1024 * 1024 * 1024)).toFixed(2)} GB, Digest ${meta.digest.slice(0, 12)}, Quantization ${meta.details?.quantization_level ?? "N/A"}`);
      } else {
        console.log(`Warning: Metadata not found for ${model} via ${cli.endpointBase}/api/tags`);
      }
    }

    console.log(`Running evaluation across all 15 test cases...`);
    const evalResult = await runModelEvaluation({
      model,
      endpoint: chatEndpoint,
      timeoutMs: cli.timeoutMs,
      transport: transportToUse,
      skipWarmup: cli.skipWarmup,
      modelDigest: meta?.digest ?? (cli.isDryRun ? "offline-dry-run-digest" : null),
      runType: runMode,
      runId: cli.runId,
      casesDataset,
      template,
    });

    console.log(`Warm-up outcome: ${evalResult.warmup_outcome.status} (${evalResult.warmup_outcome.latency_ms ?? "N/A"}ms)`);
    console.log(`\nCase Outcomes:`);
    for (const r of evalResult.template.results) {
      const validIcon = r.first_attempt_schema_valid ? "✓" : "✗";
      const statusIcon = r.expected_status_match ? "✓" : "✗";
      const retryIcon = r.retry_occurred ? " (RETRY)" : "";
      console.log(
        `  ${r.id} [${r.expected_feedback_kind}]: 1st-try schema ${validIcon}, status match ${statusIcon}, 1st latency ${r.first_attempt_latency_ms}ms, total latency ${r.total_pipeline_latency_ms}ms${retryIcon}`
      );
    }

    const m = evalResult.metrics;
    console.log(`\nMetrics Summary for ${model}:`);
    console.log(`- All 15 expected cases present: ${m.all_expected_cases_present ? "YES" : "NO"} (${m.total_cases}/${m.expected_cases_count})`);
    console.log(`- Timings complete: ${m.timings_complete ? "YES" : "NO"}`);
    console.log(`- 1st-attempt schema validity: ${(m.first_attempt_schema_valid_rate * 100).toFixed(1)}% (${m.first_attempt_schema_valid_count}/15) -> ${m.schema_validity_target_met ? "PASS" : "FAIL"}`);
    console.log(`- Vague clarification rate: ${(m.vague_clarification_rate * 100).toFixed(1)}% (${m.vague_needs_clarification_count}/7) -> ${m.vague_clarification_target_met ? "PASS" : "FAIL"}`);
    console.log(`- Invented misconceptions: ${m.invented_misconceptions_count} (unknown: ${m.unknown_safety_cases_count}) -> ${m.invented_misconceptions_target_met ? "PASS" : "FAIL"}`);
    console.log(`- Median pipeline latency: ${(m.latencies.median_ms / 1000).toFixed(2)}s -> ${m.typical_latency_target_met ? "PASS" : "FAIL"}`);
    console.log(`- Retries count: ${m.retries_count}, Repairs count: ${m.repairs_count}`);
    console.log(`- Human agreement: ${m.human_agreement_status}`);

    allSummaryMetrics.push({ model, runnerResult: evalResult, meta });

    // Save detailed run result JSON
    const sName = sanitizeModelName(model);
    const jsonPath = path.resolve(outDir, `${sName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(evalResult, null, 2), "utf8");
    console.log(`✓ Saved evaluation results JSON to ${jsonPath}`);

    // Generate human review sheet with unfilled checkboxes
    const sheetMd = formatHumanJudgeReviewSheet(model, evalResult.template.results, referenceMap);
    const sheetPath = path.resolve(outDir, `${sName}-judge-sheet.md`);
    fs.writeFileSync(sheetPath, sheetMd, "utf8");
    console.log(`✓ Saved human judge review sheet to ${sheetPath}`);
  }

  // Generate comparison summary markdown in the run directory
  const summaryMd = generateComparisonSummaryMarkdown(allSummaryMetrics, runDate, cli.runId, cli.isDryRun);
  const summaryPath = path.resolve(outDir, "comparison-summary.md");
  fs.writeFileSync(summaryPath, summaryMd, "utf8");
  console.log(`\n✓ Saved comparison summary markdown to ${summaryPath}`);

  console.log(`\n======================================================`);
  console.log(`F5 Evaluation Run Completed (${cli.runId}).`);
  console.log(`Review sheets ready in: ${outDir}`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error("Evaluation failed:", err);
  process.exit(1);
});
