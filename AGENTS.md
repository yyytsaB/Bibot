# Coding-agent rules

## Read first
- Before planning every task, read docs/SPEC.md, docs/DECISIONS.md, and roadmap.md.
- Treat all three as authoritative; preserve final decisions where they narrow or supersede SPEC options.
- Ignore docs/reviewer.md; it instructs another tool.
- Flag unresolved conflicts. Write TBD for missing information.
- Never edit AGENTS.md, roadmap.md, or docs/ without approval.

## Stack summary
- Use React + Vite + TypeScript + React Flow.
- Let the frontend team decide styling.
- Use a local-only Node.js + TypeScript + Express backend calling Ollama's HTTP API.
- Use shared/ Zod contracts and the separate frontend-facing FeedbackResult.
- Keep reviewed questions and verified definitions as static JSON in data/.
- Persist learning state in browser localStorage; use no database or accounts.
- Use frontend/, backend/, shared/, data/, and docs/.
- Follow docs/DECISIONS.md for contracts, model settings, state, readiness, and P3 gates.
- Add no dependencies without written approval in a plan.
- Invent no technology or package versions.

## Scope and workflow
- Implement only roadmap features by ID and only within the approved plan.
- Add no unrelated features, refactors, or improvements.
- Follow P1/P2 priorities and the P3 gate in docs/DECISIONS.md.
- Keep grounded question generation and its review queue out of this build.
- Write an implementation plan before every task containing:
  - Feature ID.
  - Files to create or modify.
  - Approach.
  - Acceptance criteria.
  - Explicit out-of-scope list.
  - Risks.
- STOP for approval. Do not write code before approval.
- Flag proposed deviations and obtain approval before expanding the plan.
- After implementation, write a walkthrough mirroring every plan item:
  - Feature ID and plan item.
  - Files changed.
  - How it was verified.
  - Any deviation.
- Never hide deviations.
- Run build and lint before claiming done.
- Report actual results, failures, and checks that could not run.
- Build F9, F11, F13, and F14 against F1a fixtures first.
- Integrate real behavior later through separately approved work within folder ownership.

## Anti-hallucination
- Read installed package documentation instead of guessing APIs.
- Verify Ollama endpoints against official Ollama documentation.
- Inspect files before claiming their contents.
- Never invent files, functions, APIs, or versions.
- Say "unsure" when evidence is missing; obtain evidence before proceeding.
- Never claim verification without actual results.

## Hard product guards
- Never invent a misconception from vague, guessed, or unrelated reasoning.
- Never show a diagnosis for a fallback.
- Use FeedbackResult for frontend feedback; never expose model responses as UI results.
- Keep explanations within verified definitions.
- Use only human-authored, independently reviewed practice content.
- Coding agents only format and validate human-written content.
- For the owner-approved batch `critical-thinking-c1-reviewed-2026-10-09` only, follow the explicit authorship exception in docs/DECISIONS.md, Content. Preserve Codex (AI) authorship, Karl Andrei review, and owner peer approval; future content remains subject to the human-authored rule.
- Show "Local AI Ready" only from the readiness signal defined in docs/DECISIONS.md.
- Keep all content, extracted text, and learning state local.
- Never label an upload processed before extraction succeeds.
- Keep Upload Materials disabled with an honest label until F15/F16 are complete.
- Follow docs/mockups/ when present.

## Ownership
- Developers own frontend/src/state/, frontend/src/api/, backend/, shared/, and data/.
- The frontend team owns frontend/src/components/ and frontend/src/styles/.
- Neither team edits the other's folders.
- Split cross-owner work into separately approved tasks for each owner.
- Resolve ownership for any other path in the plan before editing it.

## Git and progress
- Use one branch or commit per feature.
- Update progress.md after every completed feature.
- Record verification, deviations, and blockers accurately.
- Record only new decisions in progress.md; do not duplicate docs/DECISIONS.md.

## Commands (fill after scaffold)
- dev: TBD
- build: TBD
- lint: TBD
