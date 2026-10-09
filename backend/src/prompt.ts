import { type Concept, type Question, type FollowUp } from "shared";
import { type OllamaChatMessage } from "./transport.js";

export function buildSystemPrompt(concepts: Concept[]): string {
  const definitions = concepts
    .map((c) => `- ${c.name} (${c.id}): ${c.definition}`)
    .join("\n");

  return `You are an educational diagnosis assistant for a Critical Thinking practice system.
Analyze the student's submitted reasoning to determine whether they demonstrate a specific conceptual misconception or require clarification.

Ground your evaluation strictly in these verified concept definitions:
${definitions}

Rules you must follow:
1. BASE DIAGNOSIS SOLELY ON THE STUDENT'S WORDS: Never infer or invent a misconception merely because the student selected a specific wrong choice. A diagnosis of "possible_misconception" requires positive, articulate evidence of conceptual confusion in the student's own explanation.
2. WHEN TO RETURN "needs_clarification": If the student's reasoning is vague, empty, guessing (e.g., "I guessed", "not sure"), circular (merely restating the choice label without explanation), unrelated to the scenario, or indicates a selection slip (e.g., "clicked the wrong button"), you MUST output:
   - status: "needs_clarification"
   - needs_clarification: true
   - clarification_prompt: A specific, neutral, non-leading prompt encouraging the student to elaborate on their thinking (e.g., "Could you explain what features of the scenario led you to choose this answer?")
   - possible_misconception: null
   - follow_up_id: null
   - confidence: "low"
   Never invent a misconception for vague, guessed, or unelaborated reasoning.
3. WHEN TO RETURN "possible_misconception": If the student demonstrates a clear, articulate misunderstanding between concepts in their own words, output:
   - status: "possible_misconception"
   - needs_clarification: false
   - clarification_prompt: null
   - possible_misconception: A concise summary of their specific conceptual misunderstanding
   - explanation: A concise 1-2 sentence explanation grounded strictly in the verified definitions
   - concept_ids: Relevant concept IDs from the verified definitions
   - confidence: "low" | "medium" | "high" reflecting how clearly their words demonstrate the confusion
4. Ground all explanations in the verified definitions above. Do not cite external philosophical definitions.
5. Output JSON strictly conforming to the requested schema.`;
}

export function buildUserPrompt(
  question: Question,
  studentChoiceId: string,
  reasoning: string,
  linkedFollowUps: FollowUp[],
  retryError?: string
): string {
  const choicesText = question.choices
    .map((c) => `[${c.id}] ${c.text}`)
    .join("\n");

  const correctChoice = question.choices.find((c) => c.id === question.correct_choice_id);
  const studentChoice = question.choices.find((c) => c.id === studentChoiceId);

  const followUpsText = linkedFollowUps
    .map((f) => `- ID: ${f.id}, Tests distinction: [${f.concept_pair.join(", ")}]`)
    .join("\n");

  let prompt = `Question:
${question.text}

Choices:
${choicesText}

Correct Answer: [${question.correct_choice_id}] ${correctChoice?.text ?? ""}
Student's Selected Choice: [${studentChoiceId}] ${studentChoice?.text ?? ""}

Student's Submitted Reasoning:
"${reasoning}"

Available Reviewed Follow-Up Questions for this item:
${followUpsText || "None"}

Instructions:
Evaluate the student's submitted reasoning text carefully.
Do NOT diagnose a misconception simply because choice [${studentChoiceId}] was selected.
If the reasoning text does not provide clear conceptual evidence (e.g. it is guessing, circular, vague, or unrelated), produce a response with status "needs_clarification" and a neutral clarification_prompt.`;

  if (retryError) {
    prompt += `\n\n[RETRY CORRECTION REQUIRED]
Your previous response was rejected due to the following validation error:
"${retryError}"
Please correct your response to ensure all schema constraints, valid concept IDs, and non-empty explanations (for diagnoses) are satisfied.`;
  }

  return prompt;
}

export function buildChatMessages(
  concepts: Concept[],
  question: Question,
  studentChoiceId: string,
  reasoning: string,
  linkedFollowUps: FollowUp[],
  retryError?: string
): OllamaChatMessage[] {
  return [
    {
      role: "system",
      content: buildSystemPrompt(concepts),
    },
    {
      role: "user",
      content: buildUserPrompt(question, studentChoiceId, reasoning, linkedFollowUps, retryError),
    },
  ];
}
