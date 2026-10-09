# Misconception Mapper — content review draft

Status: AI-authored; NOT independently reviewed; NOT approved for practice or model evaluation.
Author: Codex (AI), at the user's explicit request.
Human reviewer(s): TBD. Review date and approval: TBD for every item.

The user requested AI authorship as an exception to the current human-authored-only rule. This draft preserves that provenance. Human review does not turn it into human-authored content. Resolve the policy exception with the team before F2 handoff; no protected project documents have been changed. F1 contract lock remains a separate prerequisite. These are editorial IDs and prose, not locked contract JSON.

## Sources and review method

- S1: Nathan Smith, OpenStax, Introduction to Philosophy, section 5.4, Types of Inferences: https://openstax.org/books/introduction-philosophy/pages/5-4-types-of-inferences
- S2: Igor Douven, Stanford Encyclopedia of Philosophy, Abduction, section 1.1: https://plato.stanford.edu/entries/abduction/#DedIndAbd

Definitions below summarize the conceptual distinctions. All scenarios and simulated student explanations are newly composed examples, not quotations or empirical findings from these sources. Source tags identify the conceptual reference the reviewer should use to assess each item; they do not establish independent review.

For each definition, question, follow-up, and test explanation, record: item ID; reviewer name; source and section checked; correct/needs correction; requested correction; review date; approval. Review the answer key, clarity, explanation, concept attribution, and follow-up pairing. Test-case expectations also need human approval. Two teammates must judge clear-case model feedback during the later model comparison.

## Definitions — pending review

- D1 / induction (S1): Uses observed patterns or sampled cases to support a broader conclusion or prediction. The evidence may support the conclusion strongly, but does not logically guarantee it.
- D2 / deduction (S1): Presents a conclusion as following necessarily from premises. A valid deduction cannot have true premises and a false conclusion; an invalid deduction fails that guarantee. Validity alone does not establish that the premises are true.
- D3 / abduction (S2): Proposes a plausible best explanation for observations. The explanation can be revised when new evidence appears; it is not guaranteed simply because it fits the observations.

Teaching scope: distinguish pattern-based generalization/prediction, logical consequence, and explanatory hypothesis. Do not teach deduction merely as general-to-specific, or induction as every inference using observations. All deduction examples below are valid under their stated premises. All scenarios are hypothetical.

## Common question format

Subject: Critical Thinking. Every question and follow-up ends with: **Which type of reasoning is used?**

Every item has these three choices:
- A: Inductive
- B: Deductive
- C: Abductive

Keys below use those choice letters. Explanations are candidate verified_explanation text awaiting human verification. Follow-ups do not start another AI-reasoning loop; their role is immediate correctness feedback. Do not recursively require two further follow-ups for each follow-up.

## Six initial questions and twelve follow-ups

### Q1 — Wet-floor demo

Source: S2. Concept IDs: induction, abduction. Primary: Q1-P. Extra: Q1-E.

Mika sees a puddle beside a tipped-over water bottle in a classroom. The nearby window is closed, and there is no visible ceiling leak. Mika concludes that water spilling from the bottle is the most plausible explanation for the wet floor, while allowing that another cause is possible.

Answer: C. Explanation: Mika proposes a cause for this puddle rather than a pattern across many floors.

- **Q1-P:** A paint tray is overturned beside fresh blue marks on the floor. Sam concludes that a spill from the tray best explains the marks, although Sam did not witness it. Answer: C. Explanation: The spill is a proposed explanation for the marks. Pair: induction, abduction. Source: S2.
- **Q1-E:** A zipper on a pencil case is open, and pencils are scattered directly below it. Ari concludes that the pencils probably fell from that case, while acknowledging they could have been placed there. Answer: C. Explanation: Ari explains the arrangement by proposing what happened. Pair: induction, abduction. Source: S2.

### Q2 — Study-room pattern

Source: S1. Concept IDs: induction, abduction. Primary: Q2-P. Extra: Q2-E.

On nine of ten weekday visits at noon, Jo found the study room full. Using this pattern, Jo predicts that the room will probably be full at noon next Monday.

Answer: A. Explanation: Jo extends a recorded pattern to a future visit.

- **Q2-P:** During eight rehearsal sessions, a group finished setting up its equipment within fifteen minutes. The group predicts that its next setup will probably take less than fifteen minutes too. Answer: A. Explanation: Earlier setup times support a new prediction. Pair: induction, abduction. Source: S1.
- **Q2-E:** A student samples thirty pages from a long booklet and finds a diagram on twenty-four. The student estimates that most pages in the entire booklet contain diagrams. Answer: A. Explanation: A sample supports an estimate about the whole booklet. Pair: induction, abduction. Source: S1.

### Q3 — Club badge rule

Source: S1. Concept IDs: deduction, induction. Primary: Q3-P. Extra: Q3-E.

Assume these statements are true: Every member of the robotics club has a blue badge. Bea is a member of the robotics club. Therefore, Bea has a blue badge.

Answer: B. Explanation: The stated membership rule includes Bea.

- **Q3-P:** Assume every item in Box R is a triangle, and tile T is in Box R. Therefore, tile T is a triangle. Answer: B. Explanation: Tile T falls under the given rule. Pair: deduction, induction. Source: S1.
- **Q3-E:** Assume every participant in Workshop L received a ticket, and Niko participated in Workshop L. Therefore, Niko received a ticket. Answer: B. Explanation: The premises include Niko among ticket recipients. Pair: deduction, induction. Source: S1.

### Q4 — Ticket printer

Source: S2. Concept IDs: abduction, deduction. Primary: Q4-P. Extra: Q4-E.

A ticket printer stops feeding paper and displays a paper-jam warning. A folded sheet is visible in the paper path. Lin concludes that the trapped sheet is the best explanation for the interruption, but further inspection could reveal an additional problem.

Answer: C. Explanation: Lin selects an explanation without claiming it is logically forced.

- **Q4-P:** A desk lamp goes dark, and its plug is found loose beside the socket. Pat considers disconnection the most plausible explanation, although a faulty bulb remains possible. Answer: C. Explanation: Pat weighs possible causes of the darkness. Pair: abduction, deduction. Source: S2.
- **Q4-E:** A paper model is found flattened beside a fallen stack of books. Dani concludes that the falling books most likely crushed it, while acknowledging nobody saw the event. Answer: C. Explanation: Dani proposes an account of the damage. Pair: abduction, deduction. Source: S2.

### Q5 — Shuttle arrivals

Source: S1. Concept IDs: induction, deduction. Primary: Q5-P. Extra: Q5-E.

On twelve recorded school days, a shuttle arrived before 7:30 a.m. Ren predicts that it will probably arrive before 7:30 a.m. tomorrow as well, without claiming that this is guaranteed.

Answer: A. Explanation: Past arrivals support a prediction, not a guarantee.

- **Q5-P:** Twenty markers sampled from a large shipment all worked. Kai predicts that another randomly selected marker from the shipment will probably work. Answer: A. Explanation: Sample results support a prediction about an untested marker. Pair: induction, deduction. Source: S1.
- **Q5-E:** A bakery sold out of rolls before noon on the last six Saturdays. Its manager predicts another sellout before noon next Saturday. Answer: A. Explanation: Previous Saturdays supply a pattern for prediction. Pair: induction, deduction. Source: S1.

### Q6 — Two possible storage places

Source: S1. Concept IDs: deduction, abduction. Primary: Q6-P. Extra: Q6-E.

Assume the archive key is either in Drawer A or Drawer B, and there are no other possibilities. The key is not in Drawer A. Therefore, it is in Drawer B.

Answer: B. Explanation: Eliminating A leaves B under the stated exhaustive alternatives.

- **Q6-P:** Assume a token is in either a red envelope or a green envelope, with no other possible location. It is not in the red envelope. Therefore, it is in the green envelope. Answer: B. Explanation: The exhaustive alternatives force the remaining location. Pair: deduction, abduction. Source: S1.
- **Q6-E:** Assume a form was submitted either online or on paper, and no other submission method is possible. It was not submitted online. Therefore, it was submitted on paper. Answer: B. Explanation: Removing one exhaustive alternative determines the other. Pair: deduction, abduction. Source: S1.

## Fifteen synthetic model-test explanations

These are AI-authored simulated student utterances, not collected student responses or human-authored evaluation data. Do not use them to claim an independent evaluation. All are paired with an incorrect selected choice. Expectations below are proposed semantic rubrics, not approved model answers. Diagnosis wording need not match verbatim.

Unless specified otherwise, run each case independently as the first reasoning submission for its question. D = model possible_misconception / frontend diagnosis. C = model needs_clarification / frontend clarification. For D cases, the eventual backend result must use an existing reviewed linked follow-up; all draft follow-ups here still await review.

| ID | Category | Question / selected | Student explanation | Expected | What reviewers should assess | Source |
|---|---|---|---|---|---|---|
| T01 | Clear misunderstanding | Q1 / A | “They observed water and made a conclusion. Any conclusion from an observation is induction.” | D | Address the overbroad observation criterion. | S2 |
| T02 | Clear misunderstanding | Q2 / C | “A prediction about the room is an explanation, so it has to be abduction.” | D | Distinguish prediction from explaining observed evidence. | S1, S2 |
| T03 | Clear misunderstanding | Q3 / A | “The rule talks about a whole club, so it must have been formed by induction. Applying it to Bea is induction too.” | D | Classify the presented inference, not an imagined origin of its premise. | S1 |
| T04 | Clear misunderstanding | Q4 / B | “The jam warning and folded sheet prove the cause with absolute certainty, so this is deduction.” | D | Address claimed certainty; do not assert the printer has been repaired. | S2 |
| T05 | Clear misunderstanding | Q5 / B | “Twelve successes turn the pattern into a rule that guarantees tomorrow's arrival.” | D | Address the unsupported guarantee. | S1 |
| T06 | Clear misunderstanding | Q6 / C | “Drawer B is just the best guess even though the question says those are the only two places and A is ruled out.” | D | Use the explicit exhaustive alternatives. | S1 |
| T07 | Vague | Q1 / A | “I guessed.” | C | Ask for reasoning; invent no misconception. | S2 |
| T08 | Vague | Q2 / B | “It just seemed right.” | C | Ask which part supports the chosen category. | S1 |
| T09 | Vague | Q3 / C | “I'm not sure how to explain it.” | C | Seek detail without attributing a belief. | S1 |
| T10 | Vague | Q4 / A | “Because of the situation.” | C | Ask which feature of the inference matters. | S2 |
| T11 | Vague | Q5 / C | “Maybe that one? I don't know.” | C | Request reasoning without diagnosis. | S1 |
| T12 | Unusual, clear rule error | Q6 / A | “Deduction always moves from a general rule to one specific case. This has two locations instead, so it cannot be deduction.” | D | Address the overly narrow definition of deduction. | S1 |
| T13 | Unusual, explicit category conflation | Q1 / B | “The person is acting like a detective. Detective work is always deductive, so choosing the likely cause must be deduction.” | D | Address occupation-based classification; avoid unrelated claims. | S2 |
| T14 | Unusual, unrelated | Q2 / C | “Our classroom curtains are green.” | C | No inference about the learner's conceptual beliefs. | S1 |
| T15 | Unusual, selection/reasoning mismatch | Q3 / A | “I meant that Bea must have the badge if both statements are true, but I may have clicked the wrong label.” | C | Clarify the selection mismatch; do not invent a conceptual error. | S1 |

T15's expected handling is a proposed rubric requiring human approval: the explanation and choice conflict. It is not a newly established product rule.

### Separate clarification sequence check

This reuses the set rather than adding a sixteenth explanation:

1. Submit T07 for Q1 with no prior unclear attempt: expect clarification and no diagnosis.
2. Submit T11's utterance for the same Q1 as its second unclear attempt: expect backend fallback containing the approved explanation and a reviewed linked follow-up; no diagnosis.
3. Move to another question: its first unclear submission must start a fresh count.
4. Separately check clarification followed by a supported diagnosis: the diagnosis ends that question's clarification loop.

The model's needs_clarification result and the backend's second-unclear fallback are distinct expectations. Evaluation should measure model schema validity separately from retry/repair success. Live model comparison remains pending; no scores or readiness claims are made by this draft.

## Handoff checklist

- [ ] Team explicitly resolves AI-authored content exception while retaining truthful provenance.
- [ ] Human reviewer assigned; every item reviewed against its tagged source.
- [ ] Question wording, answer keys, explanations, and concept pairs approved.
- [ ] Primary and extra links confirmed for all six initial questions.
- [ ] Synthetic evaluation provenance and all fifteen expectations approved.
- [ ] Two model-feedback judges assigned for later comparison; do not fabricate names.
- [ ] F1 completion reviewed and contracts locked by their owner.
- [ ] F2 plan reviewed before formatting into practice JSON; test-set formatting remains F3.

No C1/F2/F3 completion is claimed. No build, lint, schema validation, or model evaluation has been run for this prose draft.
