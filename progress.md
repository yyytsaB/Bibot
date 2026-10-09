# Progress

## Done
- F4 — Local AI JSON pipeline: Implemented local Express/Ollama pipeline (`POST /api/feedback`), runtime content store backed by F2 validation, JSON Schema derivation via `toJSONSchema(ModelResponseSchema)`, distinction resolution across singleton and pair concept IDs, follow-up reference repair, at most one retry on invalid model output, and conversion to `FeedbackResult` (with verified fallback containing `question.verified_explanation` and primary `question.follow_up_ids[0]`). Verified with 30 new offline unit tests (7 transport tests with fake fetch, 23 pipeline/API tests with mock transport), 56 preserved F2 content tests (86 total backend tests passing), `tsc` build, `tsc --noEmit` typecheck, ESLint, and content validation. Live smoke testing against Ollama is marked pending as model `qwen2.5:7b` is not loaded in the local Ollama instance.
- F2 — Format and validate prepared content: Formatted 3 concepts, 6 initial questions, and 12 follow-ups into reviewed static JSON with item-level source/review metadata. Added offline validator and 56 passing tests. Verified clean shared/backend installs, shared/backend builds, backend typecheck/lint, production content validation (0 warnings), and source transcription. Owner-confirmed batch exception retains Codex (AI) authorship, Karl Andrei's 2026-10-09 review, and owner peer approval. F1/F1a sources and fixtures unchanged; F4 implementation remains paused for handoff review.
- F1 — Shared contracts: Defined and exported Concept, Question, FollowUp, ModelResponse, and FeedbackResult Zod schemas and derived TypeScript types in `shared/`. Verified with 27 unit tests (`node --test`), `tsc` build, `tsc --noEmit` typecheck, and ESLint.
- F1a — Fixtures: Created typed development fixtures in `shared/src/fixtures.ts` and test suite in `shared/test/fixtures.test.mjs`. Added separate `"./fixtures"` export in `shared/package.json`. Verified with 42 total unit tests (27 contract + 15 fixture tests), `tsc` build, `tsc --noEmit` typecheck, and ESLint.

## In progress
- None reported.

## Decisions made
- Set `verbatimModuleSyntax: false` in `shared/tsconfig.json` for CommonJS compilation to `dist/`, with explicit type/value exports in `shared/src/contracts.ts` and `shared/src/index.ts`.
- Configured `{ ignores: ["dist/**"] }` in `shared/eslint.config.mjs` to prevent linting generated build output.
- Exposed development fixtures via separate `"./fixtures"` subpath export in `shared/package.json`, keeping production contract barrel `shared/src/index.ts` unchanged.
- Used neutral educational placeholders in fixtures pending reviewed C1 content.
- Derived fallback fixture's `verified_explanation` directly from `fixtureQuestion.verified_explanation`.
- Represented all four map statuses across two named snapshots (`fixtureInitialMapSnapshot` and `fixtureProgressingMapSnapshot`) using canonical concepts `induction`, `deduction`, and `abduction`.
- Frontend consumer integration and backend Express runtime integration remain deferred to dependent feature tasks; F2's offline backend validation consumes the built `shared` package and is verified.
- F2 links the local built `shared` package through `file:../shared`; backend compilation includes src/, scripts/, and test/, with F4 source output under dist/src/. Existing compiler safeguards are preserved.
- Added `zod` (`^4.6.5`) to backend dependencies to enable direct `toJSONSchema` derivation from `ModelResponseSchema` without handwritten schema duplication.
- Enforced follow-up repair: repaired null, invalid, or ineligible follow-up IDs to the question's reviewed primary follow-up (`follow_up_ids[0]`) when matching the resolved distinction, and fallback always uses primary follow-up.
- Enforced strict HTTP request field validation (`question_id`, `student_choice_id`, `student_reasoning`), rejecting missing, wrong-type, empty, or whitespace-only inputs with HTTP 400 before invoking the model.
- Returned HTTP 404 for unknown question IDs and HTTP 400 for invalid choice IDs.
- Enforced runtime fallback verification: required primary follow-up to exist in reviewed data, link to the question, and match approved question distinction, returning HTTP 500 without a FeedbackResult if corrupted.

## Blockers
- Live Ollama evaluation awaits pulling `qwen2.5:7b` to the local Ollama instance (daemon is active on 127.0.0.1:11434 but has no models installed); F4 offline pipeline is fully verified.
- The reviewed 15 synthetic test explanations are approved; F3 formatting and live model evaluation remain unimplemented.
- Backend/frontend dev and full application integration remain pending feature implementation. Backend build/typecheck/lint and content-validation/test commands are verified; shared tooling verification is preserved.
