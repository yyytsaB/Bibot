Misconception Mapper  •  Team reference
1
Misconception Mapper
Team feature guide | Concise implementation plan | Based on the proposed Home, Practice, Feedback,
and Map UI
Core idea: Students answer a multiple-choice question. If they get it wrong, they explain their thinking.
Local AI looks for a possible misconception, explains the distinction immediately, and gives a targeted
follow-up question. The concept map reflects their learning evidence.
1. Home - start a study session
What students see: Two clear options: Upload Materials or Explore Subjects; a Start/Generate Practice button; and a
small preview of their concept map.
How to build: Use a simple React page with an upload input and sample-subject cards. For the demo, provide a
prepared Critical Thinking lesson so practice works even without an uploaded file.
Uploading materials: Accept PDF/TXT first; extract text locally, show the filename and extraction status. DOCX is a
stretch feature. A file should not be labeled "processed" until text extraction succeeds.
Question generation: For an MVP, use reviewed questions from a local JSON file. If time permits, let local AI propose
questions from uploaded text, then validate them against the source before use.
2. Practice - check answers and capture reasoning
What students see: One question, 3-4 choices, a progress bar, and a Check Answer button. Correct answers get a short
explanation and Next Question.
Wrong-answer flow: Keep the question and selected wrong answer visible. Reveal a text box: "Why did you choose this
answer? Explain your understanding in your own words." Then show Analyze My Answer.
How to build: Store each question with its correct choice, topic/concept IDs, verified explanation, and linked follow-up
IDs. React state controls the stages: question → reasoning → analysis → feedback → follow-up.
3. Vague explanations - ask for more detail
What should happen: If a student writes "I guessed," "I just thought so," or an unrelated sentence, AI must not invent a
misconception. Ask a specific clarification such as "What makes you think this is inductive rather than abductive
reasoning?"
How to build: Ask the model to return needs_clarification: true/false with a short clarification prompt. Allow the student
to edit and resubmit. After 1-2 unclear attempts, offer the verified concept explanation and a follow-up without
claiming a diagnosis.
4. AI feedback - explain the misunderstanding immediately
What students see: Three compact sections: Possible Misconception, Let's Clear It Up, and Try Again. Avoid long essays
and unnecessary technical labels.
Example: Wrong answer: "Inductive"; reasoning: "They observed a wet floor and drew a conclusion." Feedback: "You
may be treating any observation-based conclusion as induction. Induction forms generalizations; abduction proposes a
plausible explanation for an observation."
How to build: Pass the question, correct answer, student choice, student reasoning, and verified definitions to a locally
running LLM. Request short structured JSON: status, possible_misconception, explanation, concept_ids, follow_up_id.
Show uncertainty if evidence is weak.
5. Follow-up - check whether the correction helped
What students see: One new multiple-choice scenario testing the same distinction. Immediately show correct/incorrect
feedback and a Continue Practice button.
How to build: Select a reviewed follow-up from the local question bank, using the identified concept pair. If correct,
mark Improving, not fully mastered; if wrong, keep Needs Review and offer another prepared example.
6. My Map - visualize areas for review


Misconception Mapper  •  Team reference
2
What students see: A small interactive node map with concept names, colored statuses, and an optional short detail
panel on click. Red = Needs Review; amber = Improving; green = Understanding Demonstrated; gray = Not Yet
Practiced.
How to build: Use React Flow with predefined nodes and links. Store status changes from practice results; highlight a
connection when the student confuses two related concepts. Avoid having the AI invent the whole graph.
7. Local AI - the actual AI contribution
Recommended setup: React frontend → local backend (Python FastAPI or Node) → Ollama local model. Keep questions,
definitions, uploaded extracted text, and learning state on the same machine.
Key test: Prepare 15-20 explanations: clear misunderstandings, vague answers, and unusual errors. Check whether
feedback matches the student's words, stays within verified definitions, and appropriately asks for clarification.
Offline claim: Only say "Local AI Ready" when the local model is running and reachable. If Ollama is on a laptop, the AI
runs locally on that laptop, not automatically on every student's device.
8. Build order and team split
Priority 1: Sample subject + working MCQ → wrong-answer explanation → local AI feedback → reviewed follow-up.
Priority 2: Map updates and clean UI matching the mockups.
Priority 3 (stretch): PDF/TXT uploads and grounded question generation. Skip accounts, analytics, gamification, and full
document management.
Suggested split: UI/UX (Home, Practice, Feedback, Map); content (verified definitions, questions, follow-ups);
AI/backend (Ollama, JSON response, vague-answer handling); integration/testing (states, persistence, demo).
Demo story: Select Critical Thinking → answer "Inductive" incorrectly → explain why → see a specific AI
clarification → answer an abductive follow-up correctly → watch the relevant map status change from Needs
Review to Improving.

