import {
  ModelResponseSchema,
  FeedbackResultSchema,
  type FeedbackResult,
  type Question,
  type FollowUp,
  type ModelResponse,
} from "shared";
import { type OllamaTransport } from "./transport.js";
import {
  getQuestion,
  getAllConcepts,
  getLinkedFollowUps,
  getContentStore,
} from "./content.js";
import { buildChatMessages } from "./prompt.js";

export class QuestionNotFoundError extends Error {
  constructor(questionId: string) {
    super(`Unknown question ID: '${questionId}'`);
    this.name = "QuestionNotFoundError";
  }
}

export class InvalidChoiceError extends Error {
  constructor(choiceId: string, questionId: string) {
    super(`Invalid choice ID '${choiceId}' for question '${questionId}'`);
    this.name = "InvalidChoiceError";
  }
}

export class FallbackVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FallbackVerificationError";
  }
}

export interface FeedbackRequest {
  question_id: string;
  student_choice_id: string;
  student_reasoning: string;
}

export interface PipelineExecutionOptions {
  signal?: AbortSignal;
}

function sameConceptPair(
  pairA: readonly [string, string] | readonly string[],
  pairB: readonly [string, string] | readonly string[]
): boolean {
  if (pairA.length !== 2 || pairB.length !== 2) return false;
  const setA = new Set(pairA);
  return setA.has(pairB[0]!) && setA.has(pairB[1]!);
}

export interface DistinctionResolutionResult {
  ok: boolean;
  pair?: [string, string];
  error?: string;
}

export function resolveDistinction(
  conceptIds: string[],
  linkedFollowUps: FollowUp[]
): DistinctionResolutionResult {
  if (conceptIds.length === 2) {
    const pair: [string, string] = [conceptIds[0]!, conceptIds[1]!];
    return { ok: true, pair };
  }

  if (conceptIds.length === 1) {
    const single = conceptIds[0]!;
    // Find candidate linked follow-ups containing this concept
    const candidatePairs: [string, string][] = [];
    for (const f of linkedFollowUps) {
      if (f.concept_pair.includes(single)) {
        const already = candidatePairs.some((p) => sameConceptPair(p, f.concept_pair));
        if (!already) {
          candidatePairs.push(f.concept_pair);
        }
      }
    }

    if (candidatePairs.length === 1) {
      return { ok: true, pair: candidatePairs[0]! };
    }
    if (candidatePairs.length === 0) {
      return {
        ok: false,
        error: `No linked distinction pair found containing concept '${single}'`,
      };
    }
    return {
      ok: false,
      error: `Ambiguous distinction: multiple candidate pairs found for concept '${single}'`,
    };
  }

  if (conceptIds.length > 2) {
    // If more than 2 concepts, see if they identify exactly one linked distinction pair
    const conceptSet = new Set(conceptIds);
    const candidatePairs: [string, string][] = [];
    for (const f of linkedFollowUps) {
      if (f.concept_pair.every((c) => conceptSet.has(c))) {
        const already = candidatePairs.some((p) => sameConceptPair(p, f.concept_pair));
        if (!already) {
          candidatePairs.push(f.concept_pair);
        }
      }
    }

    if (candidatePairs.length === 1) {
      return { ok: true, pair: candidatePairs[0]! };
    }
    return {
      ok: false,
      error: `Ambiguous distinction: multiple or no matching candidate pairs for concepts [${conceptIds.join(", ")}]`,
    };
  }

  return { ok: false, error: "Empty concept_ids array" };
}

export function repairFollowUp(
  question: Question,
  linkedFollowUps: FollowUp[],
  distinction: [string, string],
  suppliedId: string | null
): { ok: boolean; follow_up_id?: string; error?: string } {
  // Check if suppliedId is valid and eligible
  if (suppliedId) {
    const candidate = linkedFollowUps.find((f) => f.id === suppliedId);
    if (candidate && sameConceptPair(candidate.concept_pair, distinction)) {
      return { ok: true, follow_up_id: candidate.id };
    }
  }

  // Supplied ID is null, invalid, or ineligible: trigger repair
  const eligible = linkedFollowUps.filter((f) =>
    sameConceptPair(f.concept_pair, distinction)
  );

  if (eligible.length === 0) {
    return {
      ok: false,
      error: `No reviewed follow-up linked to question '${question.id}' tests distinction [${distinction.join(", ")}]`,
    };
  }

  // Convention: follow_up_ids[0] is primary, [1] is extra. Prefer primary if eligible.
  const primaryId = question.follow_up_ids[0];
  const primaryEligible = eligible.find((f) => f.id === primaryId);
  if (primaryEligible) {
    return { ok: true, follow_up_id: primaryEligible.id };
  }

  // Otherwise pick first eligible
  return { ok: true, follow_up_id: eligible[0]!.id };
}

export class FeedbackPipeline {
  constructor(private readonly transport: OllamaTransport) {}

  async processFeedback(
    request: FeedbackRequest,
    options: PipelineExecutionOptions = {}
  ): Promise<FeedbackResult> {
    const question = getQuestion(request.question_id);
    if (!question) {
      throw new QuestionNotFoundError(request.question_id);
    }

    const choice = question.choices.find((c) => c.id === request.student_choice_id);
    if (!choice) {
      throw new InvalidChoiceError(request.student_choice_id, question.id);
    }

    const store = getContentStore();
    const concepts = getAllConcepts();
    const linkedFollowUps = getLinkedFollowUps(question);

    let retryError: string | undefined = undefined;
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const messages = buildChatMessages(
          concepts,
          question,
          request.student_choice_id,
          request.student_reasoning,
          linkedFollowUps,
          retryError
        );

        const rawResponse = await this.transport.chat(messages, options.signal);

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(rawResponse);
        } catch {
          throw new Error("Model response was not valid JSON");
        }

        const modelParseResult = ModelResponseSchema.safeParse(parsedJson);
        if (!modelParseResult.success) {
          const issues = modelParseResult.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          throw new Error(`ModelResponseSchema validation failed: ${issues}`);
        }

        const modelOutput: ModelResponse = modelParseResult.data;

        // Reference validation: all concept_ids must exist in verified concepts
        for (const cid of modelOutput.concept_ids) {
          if (!store.conceptsById.has(cid)) {
            throw new Error(`Unverified concept reference '${cid}' in model response`);
          }
        }

        // Branch by status
        if (modelOutput.status === "needs_clarification") {
          // Clarification bypasses follow-up repair (intentional follow_up_id: null)
          const clarificationResult = {
            kind: "clarification" as const,
            clarification_prompt: modelOutput.clarification_prompt!,
          };

          const validation = FeedbackResultSchema.safeParse(clarificationResult);
          if (!validation.success) {
            throw new Error("Clarification result failed FeedbackResultSchema");
          }
          return validation.data;
        }

        // Status: "possible_misconception"
        // 1. Resolve candidate distinction
        const distinctionResult = resolveDistinction(
          modelOutput.concept_ids,
          linkedFollowUps
        );
        if (!distinctionResult.ok || !distinctionResult.pair) {
          throw new Error(
            distinctionResult.error ?? "Failed to resolve concept distinction"
          );
        }

        // 2. Validate / repair follow-up ID
        const repairResult = repairFollowUp(
          question,
          linkedFollowUps,
          distinctionResult.pair,
          modelOutput.follow_up_id
        );
        if (!repairResult.ok || !repairResult.follow_up_id) {
          throw new Error(repairResult.error ?? "Failed to repair follow-up reference");
        }

        // 3. Convert to FeedbackResult and validate
        // Note: ModelResponseSchema allows explanation: "", but DiagnosisResultSchema requires min(1).
        // This validates within the attempt boundary, triggering retry if explanation is empty.
        const diagnosisResult = {
          kind: "diagnosis" as const,
          possible_misconception: modelOutput.possible_misconception!,
          explanation: modelOutput.explanation,
          concept_ids: modelOutput.concept_ids,
          follow_up_id: repairResult.follow_up_id,
          confidence: modelOutput.confidence,
        };

        const resultValidation = FeedbackResultSchema.safeParse(diagnosisResult);
        if (!resultValidation.success) {
          const issues = resultValidation.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          throw new Error(`Diagnosis conversion failed FeedbackResultSchema: ${issues}`);
        }

        return resultValidation.data;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt < maxAttempts) {
          retryError = message;
          continue;
        }
      }
    }

    // Retries exhausted: emit verified fallback
    // 1. Primary follow-up link must exist on question
    const primaryFollowUpId = question.follow_up_ids[0];
    if (!primaryFollowUpId) {
      throw new FallbackVerificationError(`Question '${question.id}' is missing a primary follow-up link`);
    }

    // 2. Primary follow-up must exist in reviewed runtime data
    const primaryFollowUp = store.followUpsById.get(primaryFollowUpId);
    if (!primaryFollowUp) {
      throw new FallbackVerificationError(
        `Primary follow-up '${primaryFollowUpId}' for question '${question.id}' does not exist in reviewed runtime data`
      );
    }

    // 3. Primary follow-up must be linked to the question
    if (!question.follow_up_ids.includes(primaryFollowUp.id)) {
      throw new FallbackVerificationError(
        `Primary follow-up '${primaryFollowUp.id}' is not linked to question '${question.id}'`
      );
    }

    // 4. Primary follow-up distinction must match approved question distinction
    if (
      question.concept_ids.length !== 2 ||
      !sameConceptPair(primaryFollowUp.concept_pair, question.concept_ids)
    ) {
      throw new FallbackVerificationError(
        `Primary follow-up '${primaryFollowUp.id}' distinction does not match approved question distinction for '${question.id}'`
      );
    }

    const fallbackResult = {
      kind: "fallback" as const,
      verified_explanation: question.verified_explanation,
      follow_up_id: primaryFollowUp.id,
    };

    const fallbackValidation = FeedbackResultSchema.safeParse(fallbackResult);
    if (!fallbackValidation.success) {
      throw new FallbackVerificationError("Fallback failed FeedbackResultSchema");
    }

    return fallbackValidation.data;
  }
}
