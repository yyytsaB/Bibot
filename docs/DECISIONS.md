# Final project decisions

## Authority
- Treat this file, docs/SPEC.md, and roadmap.md as authoritative.
- Preserve these final decisions where they narrow or supersede guide options.
- Flag unresolved conflicts rather than inventing requirements.

## Stack
- Use React + Vite + TypeScript + React Flow.
- Let the frontend team decide styling.
- Use local-only Node.js + TypeScript + Express calling Ollama's HTTP API.
- Use frontend/, backend/, shared/, data/, and docs/.
- Use no database or accounts.
- Keep questions, definitions, extracted uploads, and learning state on the same machine.

## Contracts
- Keep Zod schemas and shared types in shared/ as the single source of truth.
- Concept: { id, name, definition }.
- Use kebab-case concept IDs, including induction, deduction, and abduction.
- Question: { id, subject_id, text, choices: [{ id, text }], correct_choice_id,
  concept_ids: string[], verified_explanation, follow_up_ids: string[] }.
- Require 3-4 choices per question.
- Follow-up: Question shape plus concept_pair: [concept_id, concept_id].

### Model response
- Preserve this model schema:
  { status: "possible_misconception" | "needs_clarification",
    possible_misconception: string | null,
    explanation: string,
    concept_ids: string[],
    follow_up_id: string | null,
    needs_clarification: boolean,
    clarification_prompt: string | null,
    confidence: "low" | "medium" | "high" }.
- Refine needs_clarification === (status === "needs_clarification").
- When clarification is needed, require a non-empty clarification_prompt,
  possible_misconception === null, and follow_up_id === null.
- Otherwise require a non-empty possible_misconception and at least one concept_id.
- Validate every model response.
- Retry invalid output once; after a second invalid output, use verified fallback.
- Validate every concept/follow-up reference against data/ in the backend.
- Replace an invalid follow_up_id with the question's linked follow-up.
- Never return an unvalidated follow-up reference to the frontend.

### Frontend result
- Define FeedbackResult separately from the model schema.
- Discriminate on kind:
  - "diagnosis": { kind, possible_misconception, explanation, concept_ids,
    follow_up_id, confidence }.
  - "clarification": { kind, clarification_prompt }.
  - "fallback": { kind, verified_explanation, follow_up_id }.
- Require diagnosis.follow_up_id and fallback.follow_up_id to reference reviewed,
  existing follow-ups.
- Use the model confidence values for diagnosis.confidence.
- Convert validated model output into FeedbackResult in the backend.
- Produce fallback in the backend, never through the model.
- A fallback never has a diagnosis field or possible_misconception.
- The frontend consumes FeedbackResult, not the model schema.

### Fixtures
- Build a typed fixtures file in shared/ from the F1 contracts during hour 1.
- Include representative diagnosis, clarification, fallback, map, and readiness
  presentation data needed by fixture-first frontend work.
- Use reviewed content when available; do not let fixture examples enter practice
  as unreviewed content.
- Build F9, F11, F13, and F14 against fixtures first.
- Integrate real behavior in later approved steps without crossing folder ownership.

## Content
- Humans author questions, verified definitions, follow-ups, and 15-20 test explanations.
- Author: <fill>.
- Reviewer: <fill>, a different person who checks every item against a cited source.
- Coding agents only format and validate the human-written content.
- Minimum demo content:
  - Concepts induction, deduction, and abduction.
  - 6-8 questions.
  - Wet-floor question with "Inductive" wrong and abduction correct.
  - At least two follow-ups per question: primary and extra prepared example.
- Store reviewed questions and verified definitions as static JSON in data/.
- Provide prepared Critical Thinking practice without requiring uploads.

## Practice and clarification
- Show one question, 3-4 choices, progress, and Check Answer.
- For correct initial answers, show a short explanation and Next Question.
- For wrong answers, preserve question/choice and request reasoning with Analyze My Answer.
- Follow question -> reasoning -> analysis -> feedback -> follow-up.
- Send question, correct answer, student choice, reasoning, and verified definitions to AI.
- Keep feedback short, grounded in verified definitions, and explicit about weak evidence.
- Present Possible Misconception, Let's Clear It Up, and Try Again where applicable.
- Never display a diagnosis section for clarification or fallback.
- After the first unclear answer for a question, return clarification with a specific
  prompt and allow edit/resubmit.
- After the second unclear answer for that question, return fallback with the verified
  explanation and a reviewed follow-up, without a diagnosis.
- Count unclear attempts per question; reset on the next question.
- A diagnosis ends the clarification loop.
- Select reviewed follow-ups testing the same distinction using the concept pair.
- Show immediate follow-up correctness feedback and Continue Practice.
- After a wrong follow-up, keep Needs Review and offer the extra prepared example.

## Learning state and map
- Use predefined React Flow nodes/links; never let AI invent the graph.
- Initialize concepts to Not Yet Practiced.
- Any wrong answer sets affected concepts to Needs Review and resets consecutive_correct.
- For wrong-answer updates, use the question's concept_ids or validated AI concept_ids;
  use the question's concept_ids when fallback is used.
- Correct first-try answers update the question's concept_ids.
- Correct follow-ups update the follow-up's concept_pair.
- A correct answer moves Needs Review or Not Yet Practiced to Improving with counter 1.
- A second consecutive correct answer on the same concept sets Understanding Demonstrated.
- Record confused concept pairs from wrong answers so the map can highlight connections.
- Use red = Needs Review; amber = Improving; green = Understanding Demonstrated;
  gray = Not Yet Practiced.
- Persist under one versioned localStorage key, such as mm_state_v1:
  - Per concept: { concept_id, status, consecutive_correct, last_updated }.
  - confused_pairs: [{ concept_a, concept_b, count }].
  - current_question_id and stage.
  - Answered question IDs.
- Keep clarification attempts transient; never persist them.
- Add no reset UI.
- Document clearing the storage key for rehearsal; ?reset=1 is an optional alternative.

## Evaluation and readiness
### Model evaluation
- Use Ollama's JSON-schema format parameter, temperature 0.1, and no streaming.
- Start with qwen2.5:7b.
- Compare qwen2.5:7b and llama3.2; allow at most one additional model selected by
  developers from the current Ollama library, maximum three total.
- Use the same 15-20 explanations covering clear misunderstandings, vague answers,
  and unusual errors.
- Require >=95% first-try schema validity.
- Require 100% of vague cases to return needs_clarification, with zero invented misconceptions.
- Require >=80% of clear cases to match student words and verified definitions,
  judged by two teammates.
- Require acceptable typical latency on the demo laptop; target under 10 seconds.
- Record results and select the final model from evidence.
- Run F3/F5 around hours 2-6; tune F7 after F5.

### Readiness
- Verify Ollama endpoints against official Ollama documentation.
- On app load, confirm Ollama responds and the selected model is available.
- Run the warm-up request once after model availability is confirmed.
- Establish readiness only after warm-up succeeds.
- Afterwards, run lightweight availability checks every 15 seconds with a 2-second timeout.
- Do not repeat warm-up on every polling interval.
- Withdraw readiness after two consecutive availability-check failures.
- Show "Local AI Ready" only from this readiness signal.
- Do not imply that a model on one laptop runs automatically on other devices.

## UI
- Follow docs/mockups/ when present.
- Let the frontend team decide styling.
- Keep Upload Materials disabled with an honest label until F15/F16 are complete.
- Treat the short map click-detail panel as optional within an approved plan.

## P3 gate
- Attempt only after P1 and P2 are complete and verified, and not before hour 16.
- Keep only material uploads in P3 scope for this build.
- Approve extraction dependencies through a written plan at the gate.
- Implement TXT first; implement PDF only after TXT is verified.
- Use one extraction library.
- Keep extraction local and show filename/extraction status.
- Never label a file processed before extraction succeeds.
- Treat DOCX as optional additional stretch requiring explicit plan scope.
- Exclude grounded question proposals and their review queue from this build.
