import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ConceptSchema, QuestionSchema, type Concept, type Question, type FollowUp } from "shared";
import { defaultDataDirectory, validateContent, validateContentDirectory, type ContentInput } from "../scripts/validate-content.js";

interface ReviewRecord {
  item_id: string;
  source_item_id: string;
  content_sha256: string;
  sources: { tag: string; citation: string; url: string }[];
  provenance: { author: string; human_authored: boolean; authorship_exception_batch?: string };
  review: { reviewer_name: string; review_date: string; status: string; approved: boolean; source_section_verified: boolean };
  owner_approval: { approved: boolean };
}
interface Fixture {
  concepts: Concept[];
  questions: Question[];
  followUps: FollowUp[];
  metadata: {
    records: Record<string, ReviewRecord>;
    authorship_exception: { extends_to_future_content: boolean; owner_approval: { approved: boolean } };
  };
}
const directory = defaultDataDirectory();
function json(file: string): unknown { return JSON.parse(readFileSync(path.join(directory, file), "utf8")); }
const original = { concepts: json("concepts.json"), questions: json("questions.json"), followUps: json("follow-ups.json"), metadata: json("content-metadata.json") } as Fixture;
function fixture(): Fixture { return structuredClone(original); }
function first<T>(items: T[]): T { const value = items[0]; assert.ok(value); return value; }
function record(data: Fixture, id: string): ReviewRecord { const value = data.metadata.records[id]; assert.ok(value); return value; }
function approveChecksum(data: Fixture, item: Concept | Question | FollowUp): void {
  record(data, item.id).content_sha256 = createHash("sha256").update(JSON.stringify(item)).digest("hex");
}
function rejects(name: string, code: string, change: (data: Fixture) => void): void {
  test(name, () => {
    const data = fixture(); change(data);
    const result = validateContent(data);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.code === code), JSON.stringify(result.errors));
    assert.equal(result.data, undefined, "Invalid data must not be returned as validated content");
  });
}

test("reviewed production batch passes and preserves all text", () => {
  const result = validateContent(original);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.warnings.length, 0);
  assert.deepEqual(result.data, { concepts: original.concepts, questions: original.questions, followUps: original.followUps });
  assert.deepEqual([result.data?.concepts.length, result.data?.questions.length, result.data?.followUps.length], [3, 6, 12]);
});
test("production metadata is truthful and records owner confirmation", () => {
  for (const metadata of Object.values(original.metadata.records)) {
    assert.equal(metadata.provenance.author, "Codex (AI)");
    assert.equal(metadata.provenance.human_authored, false);
    assert.equal(metadata.review.reviewer_name, "Karl Andrei");
    assert.equal(metadata.review.review_date, "2026-10-09");
    assert.equal(metadata.owner_approval.approved, true);
  }
});
test("Q6 variants retain exhaustive alternatives", () => {
  const q = original.questions.find(item => item.id === "q6");
  assert.ok(q?.text.includes("there are no other possibilities"));
  assert.ok(original.followUps.find(item => item.id === "q6-p")?.text.includes("no other possible location"));
  assert.ok(original.followUps.find(item => item.id === "q6-e")?.text.includes("no other submission method is possible"));
});

for (const field of ["concepts", "questions", "followUps"] as const) {
  test(`rejects non-array ${field} dataset`, () => {
    const data: ContentInput = { ...fixture(), [field]: {} };
    assert.ok(validateContent(data).errors.some(e => e.code === "INVALID_DATASET" && e.path[0] === field));
  });
}
test("schema failures report item ID and field path", () => {
  const data = fixture(); first(data.concepts).id = "Invalid_Id";
  const issue = validateContent(data).errors.find(e => e.code === "SCHEMA_ERROR");
  assert.equal(issue?.item_id, "Invalid_Id");
  assert.deepEqual(issue?.path, ["concepts", 0, "id"]);
});
test("locked schema diagnostic codes/paths match installed Zod", () => {
  const concept = ConceptSchema.safeParse({ ...first(original.concepts), id: "Invalid_Id" });
  assert.equal(concept.success, false);
  if (!concept.success) {
    assert.equal(first(concept.error.issues).code, "invalid_format");
    assert.deepEqual(first(concept.error.issues).path, ["id"]);
  }
  const wrong = QuestionSchema.safeParse({ ...first(original.questions), correct_choice_id: "missing" });
  assert.equal(wrong.success, false);
  if (!wrong.success) {
    assert.equal(first(wrong.error.issues).code, "custom");
    assert.deepEqual(first(wrong.error.issues).path, []);
  }
  for (const [count, code] of [[2, "too_small"], [5, "too_big"]] as const) {
    const choices = Array.from({ length: count }, (_, i) => ({ id: String(i), text: String(i) }));
    const result = QuestionSchema.safeParse({ ...first(original.questions), choices, correct_choice_id: "0" });
    assert.equal(result.success, false);
    if (!result.success) assert.ok(result.error.issues.some(issue => issue.code === code && issue.path[0] === "choices"));
  }
});
rejects("rejects wrong answer key", "SCHEMA_ERROR", d => { first(d.questions).correct_choice_id = "D"; });
rejects("rejects duplicate concept IDs", "DUPLICATE_ID", d => { d.concepts.push(structuredClone(first(d.concepts))); });
rejects("rejects question/follow-up ID collisions", "DUPLICATE_ID", d => { first(d.followUps).id = first(d.questions).id; });
rejects("rejects duplicate question choice IDs", "DUPLICATE_CHOICE", d => { const q = first(d.questions); const choice = q.choices[1]; assert.ok(choice); choice.id = first(q.choices).id; });
rejects("rejects duplicate follow-up choice IDs", "DUPLICATE_CHOICE", d => { const q = first(d.followUps); const choice = q.choices[1]; assert.ok(choice); choice.id = first(q.choices).id; });
rejects("rejects dangling question concept", "DANGLING_CONCEPT", d => { first(d.questions).concept_ids = ["missing"]; });
rejects("rejects dangling follow-up concept", "DANGLING_CONCEPT", d => { first(d.followUps).concept_ids.push("missing"); });
rejects("rejects dangling follow-up link", "DANGLING_FOLLOWUP", d => { first(d.questions).follow_up_ids[0] = "missing"; });
rejects("requires primary and extra links", "INSUFFICIENT_FOLLOWUPS", d => { first(d.questions).follow_up_ids = ["q1-p"]; });
rejects("rejects identical primary/extra links", "DUPLICATE_FOLLOWUP_LINK", d => { first(d.questions).follow_up_ids = ["q1-p", "q1-p"]; });
rejects("rejects a valid pair testing the wrong distinction", "WRONG_DISTINCTION", d => { first(d.followUps).concept_pair = ["induction", "deduction"]; });
rejects("rejects identical concept pair", "IDENTICAL_CONCEPT_PAIR", d => { first(d.followUps).concept_pair = ["induction", "induction"]; });
rejects("rejects dangling pair concepts", "DANGLING_CONCEPT_PAIR", d => { first(d.followUps).concept_pair = ["induction", "missing"]; });
rejects("requires pair concepts in follow-up concept IDs", "PAIR_NOT_IN_CONCEPTS", d => { first(d.followUps).concept_ids = ["induction"]; });
rejects("rejects nonterminal follow-up", "NONTERMINAL_FOLLOWUP", d => { first(d.followUps).follow_up_ids = ["q1-e"]; });
rejects("rejects wrong subject", "WRONG_SUBJECT", d => { first(d.questions).subject_id = "other"; });
rejects("rejects undeclared fields instead of stripping them silently", "UNDECLARED_FIELD", d => { Object.assign(first(d.questions), { diagnosis: "unapproved" }); });
rejects("rejects incomplete demo", "INCOMPLETE_DEMO", d => { d.questions.pop(); });
rejects("rejects missing wet-floor demo", "MISSING_WET_FLOOR_DEMO", d => { first(d.questions).id = "other"; });
rejects("rejects missing metadata entry", "MISSING_METADATA", d => { delete d.metadata.records.q1; });
rejects("rejects unapproved review status", "UNAPPROVED_CONTENT", d => { record(d, "q1").review.status = "pending"; });
rejects("rejects unapproved review flag", "UNAPPROVED_CONTENT", d => { record(d, "q1").review.approved = false; });
for (const name of ["TBD", "<fill>", "Human Reviewer Name", "Reviewer Name", "Codex (AI)", " "]) {
  rejects(`rejects reviewer '${name}'`, "INVALID_REVIEWER", d => { record(d, "q1").review.reviewer_name = name; });
}
for (const value of ["2026-02-30", "2026-10-XX", "10/09/2026", ""]) {
  rejects(`rejects review date '${value}'`, "INVALID_REVIEW_DATE", d => { record(d, "q1").review.review_date = value; });
}
rejects("rejects absent source verification", "MISSING_SOURCE_VERIFICATION", d => { record(d, "q1").review.source_section_verified = false; });
rejects("rejects missing sources", "INVALID_SOURCE", d => { record(d, "q1").sources = []; });
rejects("rejects unusable source URL", "INVALID_SOURCE", d => { first(record(d, "q1").sources).url = "javascript:alert(1)"; });
rejects("rejects missing author", "MISSING_AUTHOR", d => { record(d, "q1").provenance.author = ""; });
rejects("rejects AI content mislabeled as human-authored", "INVALID_AUTHORSHIP_EXCEPTION", d => { record(d, "q1").provenance.human_authored = true; });
rejects("requires owner peer approval", "INVALID_AUTHORSHIP_EXCEPTION", d => { record(d, "q1").owner_approval.approved = false; });
rejects("rejects extending exception to future content", "INVALID_AUTHORSHIP_EXCEPTION", d => { d.metadata.authorship_exception.extends_to_future_content = true; });
rejects("rejects unapproved AI item outside the batch", "INVALID_AUTHORSHIP_EXCEPTION", d => { record(d, "q1").source_item_id = "Q99"; });
rejects("rejects reusing another item's review approval", "INVALID_AUTHORSHIP_EXCEPTION", d => { record(d, "q1").source_item_id = "Q2"; });
rejects("rejects replacing the batch reviewer", "INVALID_AUTHORSHIP_EXCEPTION", d => { record(d, "q1").review.reviewer_name = "Another Person"; });
test("invalid metadata fails without crashing", () => {
  const result = validateContent({ ...fixture(), metadata: null });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.code === "INVALID_METADATA"));
});
test("changing record property order does not invalidate approved content", () => {
  const data = fixture();
  const q = first(data.questions);
  const { text, ...other } = q;
  data.questions[0] = { text, ...other };
  assert.equal(validateContent(data).ok, true);
});
rejects("detects content changed after review", "CONTENT_APPROVAL_MISMATCH", d => { first(d.questions).text += " Unreviewed change."; });
test("an otherwise approved spare human item emits a nonfatal orphan warning", () => {
  const data = fixture();
  const spare = structuredClone(first(data.followUps)); spare.id = "spare";
  data.followUps.push(spare);
  const metadata = structuredClone(record(data, "q1-p"));
  metadata.item_id = "spare"; metadata.source_item_id = "test-spare";
  metadata.provenance = { author: "Different human author (test fixture)", human_authored: true };
  data.metadata.records.spare = metadata; approveChecksum(data, spare);
  const result = validateContent(data);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(result.warnings.some(w => w.code === "ORPHAN_FOLLOWUP" && w.item_id === "spare"));
});
test("file validation reports missing files and invalid JSON", () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "mm-f2-input-"));
  try {
    assert.ok(validateContentDirectory(temporary).errors.every(e => e.code === "FILE_READ_ERROR"));
    writeFileSync(path.join(temporary, "concepts.json"), "{broken");
    assert.ok(validateContentDirectory(temporary).errors.some(e => e.code === "INVALID_JSON"));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
test("compiled CLI loads real data independently of cwd and fails on bad inputs", () => {
  const backend = path.resolve(directory, "../backend");
  const cli = path.join(backend, "dist/scripts/validate-content.js");
  const temporary = mkdtempSync(path.join(os.tmpdir(), "mm-f2-cli-"));
  try {
    const good = spawnSync(process.execPath, [cli], { cwd: temporary, encoding: "utf8" });
    assert.equal(good.status, 0, good.stderr);
    assert.equal(JSON.parse(good.stdout).questions, 6);
    const bad = spawnSync(process.execPath, [cli, "--data-dir", temporary], { cwd: temporary, encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.ok(bad.stderr.includes('"code":"FILE_READ_ERROR"'));
    const args = spawnSync(process.execPath, [cli, "--unexpected"], { encoding: "utf8" });
    assert.equal(args.status, 1);
    assert.ok(args.stderr.includes("INVALID_ARGUMENTS"));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
