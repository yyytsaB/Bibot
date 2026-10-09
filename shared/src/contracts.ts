import { z } from "zod";

export const ConceptSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Concept ID must be kebab-case"),
  name: z.string().min(1),
  definition: z.string().min(1),
});
export type Concept = z.infer<typeof ConceptSchema>;

export const ChoiceSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});
export type Choice = z.infer<typeof ChoiceSchema>;

export const QuestionSchema = z
  .object({
    id: z.string().min(1),
    subject_id: z.string().min(1),
    text: z.string().min(1),
    choices: z.array(ChoiceSchema).min(3).max(4),
    correct_choice_id: z.string().min(1),
    concept_ids: z.array(z.string().min(1)).min(1),
    verified_explanation: z.string().min(1),
    follow_up_ids: z.array(z.string().min(1)),
  })
  .refine((q) => q.choices.some((c) => c.id === q.correct_choice_id), {
    message: "correct_choice_id must match one of the choices",
  });
export type Question = z.infer<typeof QuestionSchema>;

export const FollowUpSchema = z
  .object({
    id: z.string().min(1),
    subject_id: z.string().min(1),
    text: z.string().min(1),
    choices: z.array(ChoiceSchema).min(3).max(4),
    correct_choice_id: z.string().min(1),
    concept_ids: z.array(z.string().min(1)).min(1),
    verified_explanation: z.string().min(1),
    follow_up_ids: z.array(z.string().min(1)),
    concept_pair: z.tuple([z.string().min(1), z.string().min(1)]),
  })
  .refine((q) => q.choices.some((c) => c.id === q.correct_choice_id), {
    message: "correct_choice_id must match one of the choices",
  });
export type FollowUp = z.infer<typeof FollowUpSchema>;

export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const ModelResponseStatusSchema = z.enum([
  "possible_misconception",
  "needs_clarification",
]);
export type ModelResponseStatus = z.infer<typeof ModelResponseStatusSchema>;

export const ModelResponseSchema = z
  .object({
    status: ModelResponseStatusSchema,
    possible_misconception: z.string().nullable(),
    explanation: z.string(),
    concept_ids: z.array(z.string()),
    follow_up_id: z.string().nullable(),
    needs_clarification: z.boolean(),
    clarification_prompt: z.string().nullable(),
    confidence: ConfidenceSchema,
  })
  .refine(
    (val) => val.needs_clarification === (val.status === "needs_clarification"),
    {
      message: "needs_clarification must equal (status === 'needs_clarification')",
    }
  )
  .refine(
    (val) => {
      if (val.status === "needs_clarification") {
        return (
          val.clarification_prompt !== null &&
          val.clarification_prompt.trim().length > 0 &&
          val.possible_misconception === null &&
          val.follow_up_id === null
        );
      }
      return true;
    },
    {
      message:
        "When clarification is needed, clarification_prompt must be non-empty, and possible_misconception and follow_up_id must be null",
    }
  )
  .refine(
    (val) => {
      if (val.status === "possible_misconception") {
        return (
          val.possible_misconception !== null &&
          val.possible_misconception.trim().length > 0 &&
          val.concept_ids.length > 0
        );
      }
      return true;
    },
    {
      message:
        "When a possible misconception is detected, possible_misconception must be non-empty and at least one concept_id is required",
    }
  );
export type ModelResponse = z.infer<typeof ModelResponseSchema>;

export const DiagnosisResultSchema = z.object({
  kind: z.literal("diagnosis"),
  possible_misconception: z.string().min(1),
  explanation: z.string().min(1),
  concept_ids: z.array(z.string().min(1)).min(1),
  follow_up_id: z.string().min(1),
  confidence: ConfidenceSchema,
});
export type DiagnosisResult = z.infer<typeof DiagnosisResultSchema>;

export const ClarificationResultSchema = z.object({
  kind: z.literal("clarification"),
  clarification_prompt: z.string().min(1),
});
export type ClarificationResult = z.infer<typeof ClarificationResultSchema>;

export const FallbackResultSchema = z.object({
  kind: z.literal("fallback"),
  verified_explanation: z.string().min(1),
  follow_up_id: z.string().min(1),
});
export type FallbackResult = z.infer<typeof FallbackResultSchema>;

export const FeedbackResultSchema = z.discriminatedUnion("kind", [
  DiagnosisResultSchema,
  ClarificationResultSchema,
  FallbackResultSchema,
]);
export type FeedbackResult = z.infer<typeof FeedbackResultSchema>;
