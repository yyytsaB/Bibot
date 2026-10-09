import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ConceptSchema, QuestionSchema, FollowUpSchema,
  type Concept, type Question, type FollowUp,
} from "shared";

export interface Diagnostic {
  code: string;
  path: (string | number)[];
  message: string;
  item_id?: string;
}
export interface ContentInput {
  concepts: unknown;
  questions: unknown;
  followUps: unknown;
  metadata: unknown;
}
export interface ValidatedContent {
  concepts: Concept[];
  questions: Question[];
  followUps: FollowUp[];
}
export interface ValidationReport {
  ok: boolean;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  data?: ValidatedContent;
}
interface Schema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: { code: string; path: PropertyKey[]; message: string }[] } };
}

const batchId = "critical-thinking-c1-reviewed-2026-10-09";
const approvedSourceIds = new Set([
  "D1", "D2", "D3",
  ...Array.from({ length: 6 }, (_, i) => [`Q${i + 1}`, `Q${i + 1}-P`, `Q${i + 1}-E`]).flat(),
]);

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function humanName(value: unknown): value is string {
  return text(value) && !/^(tbd|<fill>|pending|none|reviewer name|human reviewer name|codex(?: \(ai\))?|gemini|ai)$/i.test(value.trim());
}
function date(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
function source(value: unknown): boolean {
  const s = object(value);
  if (!s || !text(s.tag) || !text(s.citation) || !text(s.url)) return false;
  try { return ["https:", "http:"].includes(new URL(s.url).protocol); } catch { return false; }
}
function ownerApproved(value: unknown): boolean {
  const approval = object(value);
  return approval?.role === "project owner" && approval.approved === true
    && approval.peer_reviewed === true && date(approval.confirmation_date)
    && text(approval.confirmed_in);
}
function hash(record: unknown): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

export function validateContent(input: ContentInput): ValidationReport {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const fail = (code: string, at: (string | number)[], message: string, id?: string): void => {
    const diagnostic: Diagnostic = { code, path: at, message };
    if (id !== undefined) diagnostic.item_id = id;
    errors.push(diagnostic);
  };
  function parse<T>(value: unknown, schema: Schema<T>, dataset: string): T[] {
    if (!Array.isArray(value)) {
      fail("INVALID_DATASET", [dataset], "Expected a JSON array");
      return [];
    }
    const parsed: T[] = [];
    value.forEach((entry: unknown, i: number) => {
      const result = schema.safeParse(entry);
      if (!result.success) {
        const id = object(entry)?.id;
        for (const issue of result.error.issues) {
          fail("SCHEMA_ERROR", [dataset, i, ...issue.path.map(p => typeof p === "number" ? p : String(p))],
            `${issue.code}: ${issue.message}`, typeof id === "string" ? id : undefined);
        }
      } else if (JSON.stringify(entry) !== JSON.stringify(result.data)) {
        // Zod's locked object schemas strip unknown keys; report instead of silently accepting them.
        const original = object(entry);
        const known = object(result.data);
        if (original && known && Object.keys(original).some(key => !(key in known))) {
          fail("UNDECLARED_FIELD", [dataset, i], "Record contains fields outside the locked contract");
        }
        parsed.push(result.data);
      } else parsed.push(result.data);
    });
    return parsed;
  }
  const concepts = parse(input.concepts, ConceptSchema, "concepts");
  const questions = parse(input.questions, QuestionSchema, "questions");
  const followUps = parse(input.followUps, FollowUpSchema, "followUps");
  const metadata = object(input.metadata);
  const records = object(metadata?.records);
  if (!metadata || !records) fail("INVALID_METADATA", ["metadata"], "Expected metadata object with records");

  const ids = new Set<string>();
  for (const [dataset, entries] of [["concepts", concepts], ["questions", questions], ["followUps", followUps]] as const) {
    entries.forEach((entry, i) => {
      if (ids.has(entry.id)) fail("DUPLICATE_ID", [dataset, i, "id"], "ID is duplicated across datasets", entry.id);
      ids.add(entry.id);
    });
  }
  const conceptIds = new Set(concepts.map(c => c.id));
  const followById = new Map(followUps.map(f => [f.id, f]));
  const linked = new Set<string>();
  function questionChecks(q: Question, dataset: string, i: number): void {
    const choiceIds = new Set<string>();
    q.choices.forEach((choice, j) => {
      if (choiceIds.has(choice.id)) fail("DUPLICATE_CHOICE", [dataset, i, "choices", j, "id"], "Choice IDs must be unique", q.id);
      choiceIds.add(choice.id);
    });
    q.concept_ids.forEach((id, j) => {
      if (!conceptIds.has(id)) fail("DANGLING_CONCEPT", [dataset, i, "concept_ids", j], `Unknown concept '${id}'`, q.id);
    });
    q.follow_up_ids.forEach((id, j) => {
      if (!followById.has(id)) fail("DANGLING_FOLLOWUP", [dataset, i, "follow_up_ids", j], `Unknown follow-up '${id}'`, q.id);
    });
    if (q.subject_id !== "critical-thinking") fail("WRONG_SUBJECT", [dataset, i, "subject_id"], "This bank is Critical Thinking", q.id);
  }
  questions.forEach((q, i) => {
    questionChecks(q, "questions", i);
    if (q.follow_up_ids.length < 2) fail("INSUFFICIENT_FOLLOWUPS", ["questions", i, "follow_up_ids"], "Primary and extra links required", q.id);
    if (new Set(q.follow_up_ids).size !== q.follow_up_ids.length) fail("DUPLICATE_FOLLOWUP_LINK", ["questions", i, "follow_up_ids"], "Follow-up links must be distinct", q.id);
    q.follow_up_ids.forEach((id, j) => {
      linked.add(id);
      const f = followById.get(id);
      if (f && (new Set(q.concept_ids).size !== 2 || f.concept_pair.some(c => !q.concept_ids.includes(c)))) {
        fail("WRONG_DISTINCTION", ["questions", i, "follow_up_ids", j], "Follow-up pair differs from the approved parent distinction", q.id);
      }
    });
  });
  followUps.forEach((f, i) => {
    questionChecks(f, "followUps", i);
    if (f.follow_up_ids.length !== 0) fail("NONTERMINAL_FOLLOWUP", ["followUps", i, "follow_up_ids"], "This batch's follow-ups must be terminal", f.id);
    if (f.concept_pair[0] === f.concept_pair[1]) fail("IDENTICAL_CONCEPT_PAIR", ["followUps", i, "concept_pair"], "Pair concepts must be distinct", f.id);
    f.concept_pair.forEach((id, j) => {
      if (!conceptIds.has(id)) fail("DANGLING_CONCEPT_PAIR", ["followUps", i, "concept_pair", j], `Unknown concept '${id}'`, f.id);
      if (!f.concept_ids.includes(id)) fail("PAIR_NOT_IN_CONCEPTS", ["followUps", i, "concept_pair", j], "Pair concept missing from follow-up concept_ids", f.id);
    });
    if (!linked.has(f.id)) warnings.push({ code: "ORPHAN_FOLLOWUP", path: ["followUps", i], item_id: f.id, message: "Follow-up is not referenced by an initial question" });
  });

  const exception = object(metadata?.authorship_exception);
  const reviewedSourceIds = new Set<string>();
  for (const [dataset, entries] of [["concepts", concepts], ["questions", questions], ["followUps", followUps]] as const) {
    entries.forEach((item, i) => {
      const entry = object(records?.[item.id]);
      const at: (string | number)[] = ["metadata", "records", item.id];
      if (!entry) { fail("MISSING_METADATA", at, "Item has no approval metadata", item.id); return; }
      if (entry.item_id !== item.id || !text(entry.source_item_id)) fail("INVALID_ITEM_MAPPING", at, "Metadata ID/source mapping missing or inconsistent", item.id);
      const review = object(entry.review);
      if (review?.status !== "approved" || review.approved !== true) fail("UNAPPROVED_CONTENT", [...at, "review"], "Both approved status and flag are required", item.id);
      if (!humanName(review?.reviewer_name)) fail("INVALID_REVIEWER", [...at, "review", "reviewer_name"], "Actual human reviewer name required", item.id);
      if (!date(review?.review_date)) fail("INVALID_REVIEW_DATE", [...at, "review", "review_date"], "Valid YYYY-MM-DD review date required", item.id);
      if (review?.source_section_verified !== true) fail("MISSING_SOURCE_VERIFICATION", [...at, "review", "source_section_verified"], "Source check must be recorded", item.id);
      if (!Array.isArray(entry.sources) || entry.sources.length === 0 || !entry.sources.every(source)) fail("INVALID_SOURCE", [...at, "sources"], "Citation, source tag, and usable URL required", item.id);
      const provenance = object(entry.provenance);
      if (!text(provenance?.author)) fail("MISSING_AUTHOR", [...at, "provenance"], "Truthful author provenance required", item.id);
      if (provenance?.author === "Codex (AI)") {
        const expectedSourceId = ({ induction: "D1", deduction: "D2", abduction: "D3" } as Record<string, string>)[item.id] ?? item.id.toUpperCase();
        if (provenance.human_authored !== false || provenance.authorship_exception_batch !== batchId
          || metadata?.batch_id !== batchId || exception?.extends_to_future_content !== false
          || exception.author !== "Codex (AI)" || exception.human_reviewer !== "Karl Andrei"
          || !ownerApproved(exception.owner_approval) || !ownerApproved(entry.owner_approval)
          || entry.source_item_id !== expectedSourceId || reviewedSourceIds.has(expectedSourceId)
          || review?.reviewer_name !== "Karl Andrei" || review.review_date !== "2026-10-09"
          || !approvedSourceIds.has(String(entry.source_item_id))
          || !Array.isArray(exception.approved_source_item_ids) || !exception.approved_source_item_ids.includes(entry.source_item_id)) {
          fail("INVALID_AUTHORSHIP_EXCEPTION", [...at, "provenance"], "AI authorship requires the approved batch-specific owner exception", item.id);
        }
        reviewedSourceIds.add(expectedSourceId);
      } else if (provenance?.human_authored !== true || provenance.author === review?.reviewer_name) {
        fail("INVALID_AUTHORSHIP", [...at, "provenance"], "Other content requires a human author and a different reviewer", item.id);
      }
      if (entry.content_sha256 !== hash(item)) fail("CONTENT_APPROVAL_MISMATCH", [dataset, i], "Content differs from its reviewed record checksum", item.id);
    });
  }

  if (!["induction", "deduction", "abduction"].every(id => conceptIds.has(id)) || questions.length < 6 || questions.length > 8) {
    fail("INCOMPLETE_DEMO", ["questions"], "Required concepts and 6–8 initial questions must be present");
  }
  const wet = questions.find(q => q.id === "q1");
  if (!wet || wet.correct_choice_id !== "C" || !wet.text.includes("puddle") || wet.choices.find(c => c.id === "A")?.text !== "Inductive") {
    fail("MISSING_WET_FLOOR_DEMO", ["questions"], "Approved wet-floor question and answer mapping required");
  }
  const result: ValidationReport = { ok: errors.length === 0, errors, warnings };
  if (result.ok) result.data = { concepts, questions, followUps };
  return result;
}

export function defaultDataDirectory(): string {
  const backend = path.resolve(__dirname, path.basename(path.dirname(__dirname)) === "dist" ? "../.." : "..");
  return path.resolve(backend, "../data");
}

/** File reading is for offline validation; F4 owns its runtime loading/caching. */
export function validateContentDirectory(directory = defaultDataDirectory()): ValidationReport {
  const inputs: Record<string, unknown> = {};
  const errors: Diagnostic[] = [];
  for (const [key, file] of [["concepts", "concepts.json"], ["questions", "questions.json"], ["followUps", "follow-ups.json"], ["metadata", "content-metadata.json"]]) {
    if (!key || !file) continue;
    const filename = path.resolve(directory, file);
    try { inputs[key] = JSON.parse(readFileSync(filename, "utf8")); }
    catch (error) {
      errors.push({ code: error instanceof SyntaxError ? "INVALID_JSON" : "FILE_READ_ERROR", path: [file], message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (errors.length) return { ok: false, errors, warnings: [] };
  return validateContent({ concepts: inputs.concepts, questions: inputs.questions, followUps: inputs.followUps, metadata: inputs.metadata });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && !(args.length === 2 && args[0] === "--data-dir")) {
    console.error(JSON.stringify({ code: "INVALID_ARGUMENTS", message: "Usage: validate-content [--data-dir PATH]" }));
    process.exitCode = 1;
  } else {
    const report = validateContentDirectory(args[1]);
    for (const warning of report.warnings) console.warn(JSON.stringify(warning));
    if (!report.ok) {
      for (const error of report.errors) console.error(JSON.stringify(error));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ ok: true, concepts: report.data?.concepts.length, questions: report.data?.questions.length, followUps: report.data?.followUps.length, warnings: report.warnings.length }));
    }
  }
}
