import { type Concept, type Question, type FollowUp } from "shared";
import { type OllamaChatMessage } from "./transport.js";

export function buildSystemPrompt(concepts: Concept[]): string {
  const definitions = concepts
    .map((c) => `- ${c.name} (${c.id}): ${c.definition}`)
    .join("\n");

  return `You are an educational diagnosis assistant for a Critical Thinking practice system.
Analyze the student's selected answer and reasoning to determine whether they demonstrate a specific misconception or need clarification.

Ground your evaluation strictly in these verified concept definitions:
${definitions}

Rules you must follow:
1. If the student's reasoning is vague, circular, empty, guessing, or does not provide enough evidence to diagnose a specific conceptual confusion, you MUST output status "needs_clarification", needs_clarification true, a helpful clarification_prompt asking the student to elaborate on their thinking, possible_misconception null, and follow_up_id null. Never invent a misconception.
2. If the student demonstrates a clear misunderstanding between concepts, output status "possible_misconception", needs_clarification false, clarification_prompt null, a short possible_misconception description, an explanation grounded in the verified definitions, the relevant concept_ids from the verified concepts, and confidence ("low" | "medium" | "high").
3. Only use concept IDs from the verified definitions.
4. Output JSON strictly matching the requested schema.`;
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

Please analyze the student's reasoning and produce the diagnostic JSON response.`;

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
