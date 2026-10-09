# Misconception Mapper roadmap

## Authority and priorities
- Follow docs/SPEC.md and docs/DECISIONS.md.
- P1: Prepared subject + MCQ -> reasoning -> local AI feedback -> reviewed follow-up.
- P2: Map updates and clean UI.
- P3: Local material uploads.
- Preserve feature IDs for review traceability.
- Treat dependencies as implementation ordering.
- Split cross-owner integration into approved tasks without crossing owned folders.

## Hour-one contract lock
- Approve F1 before dependent implementation.
- Lock model and frontend contracts separately.
- Complete F1a typed fixtures during hour 1.
- Start frontend work against fixtures without waiting for backend completion.

## Tasks

### C1 — Content authoring
- Priority: P1.
- Owner: humans only.
- Timing: hours 0-4; deliver reviewed batches as available.
- Dependencies: none.
- Acceptance:
  - Author questions, verified definitions, follow-ups, and 15-20 test explanations
    according to DECISIONS.md, Content and Evaluation and readiness.
  - Author: <fill>; reviewer: <fill>, a different person.
  - Check every item against a cited source before handing it to F2/F3.
  - Keep authorship with humans; coding agents only format and validate.

### F1 — Shared contracts
- Priority: P1.
- Owner: dev.
- Dependencies: none.
- Acceptance:
  - Define Concept, Question, Follow-up, and unchanged model-response schemas
    according to DECISIONS.md, Contracts.
  - Define the separate FeedbackResult discriminated union.
  - Enforce refinements, reference validation rules, and validated follow-up requirements.
  - Keep backend fallback structurally separate from diagnosis.

### F1a — Fixtures
- Priority: P1.
- Owner: dev.
- Timing: hour 1.
- Dependencies: F1.
- Acceptance:
  - Create a typed fixtures file in shared/ using F1 contracts.
  - Supply representative result variants and presentation data under DECISIONS.md, Fixtures.
  - Enable F9, F11, F13, and F14 to build before real-logic integration.
  - Keep fixture content outside reviewed practice unless approved through C1.

### F2 — Format and validate prepared content
- Priority: P1.
- Owner: dev.
- Dependencies: F1, reviewed C1 batches.
- Acceptance:
  - Format human-written content into static JSON without authoring or rewriting it.
  - Validate schemas and references under DECISIONS.md, Contracts and Content.
  - Preserve source/review evidence and required primary/extra follow-up links.
  - Supply prepared Critical Thinking practice without uploads.

### F3 — Explanation test-set preparation
- Priority: P1.
- Owner: dev.
- Timing: approximately hours 2-6, using reviewed C1 batches.
- Dependencies: F1, reviewed C1 test explanations; relevant F2 content.
- Acceptance:
  - Format and validate the human-written 15-20 explanations.
  - Preserve expected behavior grounded in verified definitions.
  - Prepare measurements and teammate judgments required by DECISIONS.md,
    Evaluation and readiness.

### F4 — Local AI JSON pipeline
- Priority: P1.
- Owner: dev.
- Dependencies: F1, F2.
- Acceptance:
  - Implement local Express/Ollama calls under DECISIONS.md, Stack and Contracts.
  - Validate model output, references, repair, retry, and backend fallback behavior.
  - Convert responses into FeedbackResult; never return a fabricated fallback diagnosis.
  - Follow DECISIONS.md model settings and verified official Ollama endpoints.

### F5 — Model comparison
- Priority: P1.
- Owner: dev.
- Timing: approximately hours 2-6 as F3/F4 become available.
- Dependencies: F3, F4.
- Acceptance:
  - Compare permitted candidates on the same test set under DECISIONS.md,
    Evaluation and readiness.
  - Record all required validity, vague-case, clear-case, and latency results.
  - Select the final model from evidence and flag unmet thresholds.

### F6 — Practice and follow-up state machine
- Priority: P1.
- Owner: dev.
- Dependencies: F1, F2, F4; F7 for completed clarification behavior.
- Acceptance:
  - Implement stages and correct/wrong-answer branches under DECISIONS.md,
    Practice and clarification.
  - Consume FeedbackResult through distinct diagnosis, clarification, and fallback branches.
  - Select reviewed follow-ups and supply immediate feedback/navigation.
  - Emit learning evidence with the credit attribution in DECISIONS.md,
    Learning state and map.

### F7 — Vague-answer handling and tuning
- Priority: P1.
- Owner: dev.
- Timing: tune after F5.
- Dependencies: F3, F4, F5; F6 transition interfaces.
- Acceptance:
  - Implement first-unclear clarification and second-unclear fallback under
    DECISIONS.md, Practice and clarification.
  - Return the appropriate FeedbackResult variant without diagnosis fields on fallback.
  - Enforce transient per-question counting, next-question reset, and diagnosis termination.
  - Tune against F5 findings and verify vague, guessed, and unrelated answers.

### F8 — Learning-state persistence
- Priority: P2.
- Owner: dev.
- Dependencies: F6, F7, F10.
- Acceptance:
  - Persist and restore the exact learning-state fields in DECISIONS.md,
    Learning state and map.
  - Keep clarification attempts transient.
  - Document the permitted rehearsal reset method without adding reset UI.

### F9 — Practice and feedback interface
- Priority: P1 for working flow; P2 for visual polish.
- Owner: frontend.
- Dependencies: F1a for initial work; F6/F7 for later integration.
- Acceptance:
  - Build against fixtures first and follow docs/mockups/ when present.
  - Present the practice views and controls in DECISIONS.md, Practice and clarification.
  - Render FeedbackResult variants distinctly; never show a diagnosis for fallback.
  - Integrate real behavior later through approved owner-specific work.

### F10 — Map data and learning-status mapping
- Priority: P2.
- Owner: dev.
- Dependencies: F2, F6, F7.
- Acceptance:
  - Supply predefined graph data and implement statuses/counters under DECISIONS.md,
    Learning state and map.
  - Attribute wrong answers to question or validated AI concept_ids,
    correct first-try answers to question concept_ids, and correct follow-ups to concept_pair.
  - Record confused pairs for highlighting and persistence.

### F11 — Concept-map interface
- Priority: P2.
- Owner: frontend.
- Dependencies: F1a for initial work; F10 for later integration.
- Acceptance:
  - Build against fixtures first and follow docs/mockups/ when present.
  - Render the React Flow graph, exact status colors, and confused connections
    under DECISIONS.md, Learning state and map.
  - Treat the short click-detail panel as optional within an approved plan.
  - Integrate real map data later without editing developer-owned folders.

### F12 — Local AI readiness
- Priority: P1.
- Owner: dev.
- Dependencies: F4.
- Acceptance:
  - Verify official Ollama endpoints.
  - Confirm availability and run warm-up once under DECISIONS.md,
    Evaluation and readiness.
  - Use subsequent lightweight checks with the defined interval/timeout
    and withdraw readiness after two consecutive failures.

### F13 — Local AI readiness display
- Priority: P1.
- Owner: frontend.
- Dependencies: F1a for initial work; F12 for later integration.
- Acceptance:
  - Build ready/unavailable presentation against fixtures first.
  - Apply the honest readiness-display rules in DECISIONS.md.
  - Integrate the real signal later without editing readiness logic.

### F14 — Home and study-session entry
- Priority: P1 for prepared-subject entry; P2 for complete Home UI.
- Owner: frontend.
- Dependencies: F1a for initial work; F2/F6/F11 for later integration.
- Acceptance:
  - Build against fixtures first and follow docs/mockups/ when present.
  - Provide Explore Subjects, prepared Critical Thinking entry,
    Start/Generate Practice, and a small map preview.
  - Keep Upload Materials disabled with an honest label until F15/F16 are complete.
  - Integrate real behavior later within folder ownership.

### F15 — Local material uploads
- Priority: P3.
- Owner: dev.
- Dependencies: verified P1/P2 completion; hour 16 or later.
- Acceptance:
  - Obtain the written dependency approval required by DECISIONS.md, P3 gate.
  - Implement and verify TXT before attempting PDF.
  - Supply honest filename/extraction status and keep extraction local.
  - Keep any DOCX work explicitly optional and separately scoped in the approved plan.

### F16 — Upload interface
- Priority: P3.
- Owner: frontend.
- Dependencies: F14, F15; P3 gate.
- Acceptance:
  - Connect Upload Materials to developer-owned extraction behavior.
  - Show accurate filename and extraction status under DECISIONS.md, P3 gate.
  - Enable uploads only when F15/F16 are complete; preserve prepared practice.

## Suggested hour-based checklist
- Hours 0-1: Start C1; read authoritative files; lock F1; complete F1a fixtures.
- Hours 1-2: Start fixture-based frontend work and content formatting;
  establish the AI pipeline and practice transitions.
- Hours 2-6: Prepare F3 and run F5 using reviewed C1 batches;
  finish C1 by hour 4.
- After F5: Tune F7 using comparison findings.
- By approximately hour 8: Integrate a vertical slice of the demo story,
  including a basic map status update.
- Hours 8-12: Complete persistence, readiness, map behavior, and P2 UI.
- Hours 12-16: Verify all P1/P2 criteria and close integration gaps.
- Hours 16-18: Attempt F15/F16 only after verified P1/P2 completion;
  verify TXT before PDF.
- Around hour 18: Freeze features.
- Hours 18-24: Test, fix demonstrated defects, run build/lint, and rehearse.

## Demo story
- Select Critical Thinking.
- Answer the wet-floor question with "Inductive" incorrectly.
- Explain the reasoning.
- Show specific AI feedback clarifying induction versus abduction.
- Answer the primary reviewed abductive follow-up correctly.
- Show the relevant map status changing from Needs Review to Improving.
- Keep the extra prepared example available if the follow-up is wrong.
- Demonstrate vague-answer clarification separately without inventing a diagnosis.

## Out of scope for this build
- F17 — Grounded question proposals and review queue logic.
- F18 — Proposal review interface.
- Accounts, analytics, gamification, and full document management.
- Databases.
- AI-invented concept graphs.
- Unreviewed questions or follow-ups in practice.
- Reset UI.
- P3 before verified P1/P2 completion or before hour 16.
- Features, refactors, or improvements outside the approved plan.
