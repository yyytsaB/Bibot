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
  clarification_attempt_count?: number | undefined;
}

export interface PipelineExecutionOptions {
  signal?: AbortSignal;
  evaluateModelDirectly?: boolean;
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

export type PipelineDecisionKind =
  | "safeguard_clarification"
  | "second_unclear_fallback"
  | "model_clarification"
  | "accepted_diagnosis"
  | "technical_fallback";

export interface PipelineTelemetry {
  decision: PipelineDecisionKind;
  reason?: string | undefined;
  model_called: boolean;
  attempts: number;
  error?: string | undefined;
}

export interface ReasoningClarityAssessment {
  isUnclear: boolean;
  reason?:
    | "guessing_or_uncertainty"
    | "circular_restatement"
    | "unrelated_statement"
    | "selection_mismatch"
    | "vague_situational";
  clarificationPrompt?: string;
  notes?: string;
}

const COMMON_STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing",
  "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself",
  "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into",
  "is", "isn't", "it", "it's", "its", "itself", "just", "let's", "me", "more", "most", "mustn't",
  "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought",
  "our", "ours", "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's",
  "should", "shouldn't", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them",
  "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've",
  "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd",
  "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", "where", "where's",
  "which", "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would", "wouldn't", "you",
  "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"
]);

const DOMAIN_INFERENCE_TOKENS = new Set([
  "induction", "deduction", "abduction", "inductive", "deductive", "abductive",
  "inference", "infer", "infers", "inferred", "inferring", "reasoning", "reason", "reasons", "reasoned",
  "premise", "premises", "conclusion", "conclusions", "conclude", "concludes", "concluded",
  "rule", "rules", "ruled", "general", "specific", "guarantee", "guarantees", "guaranteed",
  "certain", "certainty", "probable", "probability", "likely", "likelihood",
  "pattern", "patterns", "predict", "predicts", "predicted", "prediction", "predictions",
  "cause", "causes", "caused", "causing", "explanation", "explanations", "explain", "explains", "explained",
  "evidence", "observation", "observations", "observe", "observes", "observed",
  "hypothesis", "hypotheses", "logic", "logical", "valid", "invalid", "validity",
  "proof", "proves", "proven", "truth", "true", "false",
  "fact", "facts", "claim", "claims", "statement", "statements",
  "choice", "option", "answer", "question", "questions", "wrong", "right", "correct", "incorrect",
  "meant", "intended", "click", "clicked", "picked", "selected",
  "situation", "context", "scenario", "case", "cases", "example", "examples",
  "test", "testing", "tested", "concept", "concepts", "idea", "ideas",
  "point", "points", "meaning", "mean", "means", "depend", "depends", "depending",
  "difference", "different", "distinction", "type", "types", "kind", "kinds", "category", "categories",
  "guess", "guesses", "guessing", "guessed", "best", "better",
  "eliminate", "eliminated", "eliminating", "elimination", "alternative", "alternatives", "exhaustive",
  "possible", "possibility", "possibilities", "plausible", "plausibility"
]);

function extractContentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => (t.length >= 2 || /^\d+$/.test(t)) && !COMMON_STOP_WORDS.has(t));
}

function isUnrelatedInContext(reasoning: string, question: Question): boolean {
  const reasoningTokens = extractContentTokens(reasoning);
  if (reasoningTokens.length === 0) return false;

  // Catch linguistic/orthographic remarks that focus on the word name itself rather than inference
  const isSuperficialWordComment =
    /\b(sounds?\s+like\s+a\s+(cool\s+)?word|word\s+that\s+starts\s+with|spelling|starts?\s+with\s+the\s+letter)\b/i.test(
      reasoning
    );
  if (isSuperficialWordComment) {
    return true;
  }

  // Build context tokens from question prompt, choices, and concepts
  const questionTokens = new Set([
    ...extractContentTokens(question.text),
    ...question.choices.flatMap((c) => extractContentTokens(c.text)),
    ...question.concept_ids,
  ]);

  const domainMatches = reasoningTokens.filter((t) => DOMAIN_INFERENCE_TOKENS.has(t));
  const questionMatches = reasoningTokens.filter((t) => questionTokens.has(t));

  // If there are domain inference tokens, the student is discussing inference
  if (domainMatches.length > 0) {
    return false;
  }

  // If there are zero domain inference tokens, check scenario connection
  // If no question tokens match at all, statement is completely unrelated
  if (questionMatches.length === 0) {
    return true;
  }

  // If only 1 question token matches but 2 or more content tokens are unrelated non-sequiturs
  // (e.g. "Our classroom curtains are green" where only "classroom" matches question text)
  const nonQuestionTokens = reasoningTokens.filter((t) => !questionTokens.has(t));
  if (questionMatches.length <= 1 && nonQuestionTokens.length >= 2) {
    return true;
  }

  return false;
}

/**
 * Assesses whether student reasoning demonstrates substantive conceptual thinking or requires
 * clarification / fallback.
 *
 * Conservative safeguard rules:
 * 1. Selection / Reasoning Mismatch: Identifies statements where the student acknowledges clicking
 *    the wrong option or explains an alternative option (e.g. T15). Substantive reasoning describing
 *    a selection slip requires neutral clarification, not an invented misconception.
 * 2. Pure Guessing / Empty Uncertainty: Identifies declarations of guessing or lack of knowledge
 *    without supporting causal, observational, or conceptual premises.
 *    - Catches "I guessed.", "I guessed induction.", "I just thought so.", "It just seemed right.",
 *      "I'm not sure how to explain it.", "Maybe that one? I don't know."
 *    - Does NOT reject colloquial guessing combined with substantive premises (e.g. "I guessed because
 *      nine of ten visits were full." or "I guessed because 12 successes turn the pattern into a rule").
 * 3. Pure Circular Restatement: Identifies reasoning that merely repeats the selected choice label or option letter
 *    without explaining why (e.g. "Because it is induction", "Choice A is inductive reasoning").
 * 4. Vague Situational Reference: Identifies generic references to "the situation" without identifying any feature.
 * 5. In-Context Irrelevance: Identifies text completely disconnected from the scenario and inference domain.
 *    Assesses relevance dynamically against question text and domain concepts rather than hardcoding word blacklists.
 *
 * Substantive reasoning preserved:
 * - Short meaningful claims (e.g. "Guarantees tomorrow's arrival.", "Rain causes wet floors.", "General to specific.")
 *   are NOT rejected for brevity.
 * - Meaningful reasoning lacking specific keywords is NOT rejected.
 *
 * Limitations:
 * Heuristic safeguards cannot capture all nuances of human language or novel metaphors.
 * Subtly ungrounded reasoning not caught here relies on tuned model evaluation.
 */
export function assessReasoningClarity(
  reasoning: string,
  question: Question,
  choiceId: string
): ReasoningClarityAssessment {
  const trimmed = reasoning.trim();
  const lower = trimmed.toLowerCase();

  // 1. Selection / Reasoning Mismatch (e.g. T15)
  const mentionsAnotherChoice = question.choices.some(
    (c) => c.id !== choiceId && lower.includes(c.text.toLowerCase())
  );
  const mismatchPattern =
    /(clicked|chose|selected|picked)\s+(the\s+)?wrong\s+(label|button|choice|option|answer)/i.test(trimmed) ||
    /meant\s+to\s+(click|choose|select|pick)/i.test(trimmed) ||
    /accidental(ly)?\s+(click|chose|selected)/i.test(trimmed) ||
    /\b(misclick(ed)?|wrong\s+button)\b/i.test(trimmed) ||
    (mentionsAnotherChoice && (/meant/i.test(trimmed) || /intended/i.test(trimmed) || /instead/i.test(trimmed)));

  if (mismatchPattern) {
    return {
      isUnclear: true,
      reason: "selection_mismatch",
      clarificationPrompt:
        "Your explanation appears to describe a different choice than the one selected. Could you clarify which answer you intended to choose and why?",
      notes: "Student articulated a selection slip / misclick rather than a conceptual misconception.",
    };
  }

  // 2. Pure Circular Restatement
  const strippedCircular = lower
    .replace(/^(because\s+|it('?s|\s+is)\s+|choice\s+[a-d]\s+(is\s+)?|i\s+think\s+(it('?s|\s+is)\s+)?|just\s+)+/g, "")
    .replace(/(\s+reasoning|\s+inference|\s+answer|\s+choice|\s+option)+/g, "")
    .replace(/[.,!?;:]/g, "")
    .trim();

  const circularLabels = new Set([
    "",
    "induction",
    "deduction",
    "abduction",
    "inductive",
    "deductive",
    "abductive",
    "a",
    "b",
    "c",
    "d",
  ]);

  if (circularLabels.has(strippedCircular)) {
    return {
      isUnclear: true,
      reason: "circular_restatement",
      clarificationPrompt:
        "Could you explain what specific features of this scenario make it that type of inference?",
      notes: "Student merely repeated the choice label without supporting reasoning.",
    };
  }

  // 3. Vague Situational Reference
  const isVagueSituational =
    /^(because\s+of|due\s+to|from|it('?s|\s+is))\s+(the\s+situation|the\s+context|that|this)\.?$/i.test(trimmed) ||
    /^(the\s+situation|the\s+context|just\s+the\s+situation)\.?$/i.test(trimmed) ||
    /^(i\s+think\s+)?(choice|option)\s+[a-d]\s+(makes?\s+the\s+most\s+sense|is\s+the\s+best|seems?\s+best|seems?\s+right)(\s+here)?\.?$/i.test(trimmed) ||
    /^(it\s+)?makes?\s+the\s+most\s+sense(\s+here)?\.?$/i.test(trimmed);

  if (isVagueSituational) {
    return {
      isUnclear: true,
      reason: "vague_situational",
      clarificationPrompt:
        "Which specific detail or feature in the scenario led you to that conclusion?",
      notes: "Student referenced the scenario or restated an observation without identifying any inferential connection.",
    };
  }

  // 4. Pure Guessing or Empty Uncertainty (e.g. T07, T08, T09, T11)
  const pureGuessOrUncertaintyPatterns = [
    // "I guessed." / "I guessed induction." / "I just guessed choice A." / "Guessed."
    /^(i\s+)?(just\s+)?guessed(\s+it)?(\s+(so|that))?(\s+(induction|deduction|abduction|inductive|deductive|abductive|choice\s+[a-d]|[a-d]))?\.?$/i,
    // "I just thought so." / "I thought so." / "Thought so."
    /^(i\s+)?(just\s+)?thought(\s+so|\s+that|\s+it\s+was\s+right)?\.?$/i,
    // "It just seemed right." / "Seemed right." / "Just felt right." / "Felt like it."
    /^(it\s+)?(just\s+)?(seemed|felt)\s+(right|like\s+it|correct|best)\.?$/i,
    // "Not sure how to explain it." / "Can't explain it." / "I'm not sure."
    /^(i('?m|\s+am)\s+)?not\s+sure(\s+how\s+to\s+explain(\s+it)?|\s+about\s+it)?\.?$/i,
    /^(can'?t|cannot)\s+explain(\s+it)?\.?$/i,
    // "Maybe that one? I don't know." / "I don't know." / "idk"
    /^(maybe\s+that\s+one\??\s+)?(i\s+)?(don'?t|do\s+not)\s+know(\s+the\s+difference.*)?\.?$/i,
    /^idk\.?$/i,
    // "No idea." / "No clue."
    /^(no\s+idea|no\s+clue|haven'?t\s+a\s+clue)\.?$/i,
    // "Wild guess." / "Random guess." / "Pure guess." / "Just a guess."
    /^(just\s+a\s+|a\s+)?(wild|random|pure)?\s*guess\.?$/i,
    // "Just picked A." / "Just chose Choice B."
    /^(i\s+)?just\s+(picked|chose|selected)\s+(choice\s+)?[a-d]\.?$/i,
  ];

  for (const pat of pureGuessOrUncertaintyPatterns) {
    if (pat.test(trimmed)) {
      return {
        isUnclear: true,
        reason: "guessing_or_uncertainty",
        clarificationPrompt:
          "Could you describe what led you to choose this answer over the others?",
        notes: "Student declared a pure guess or inability to explain without conceptual basis.",
      };
    }
  }

  // Check for colloquial guess/uncertainty markers: evaluate whether substantive supporting reasoning is present
  const guessMarkers =
    /\b(i('?m|\s+am)?\s+(?:guessing|not\s+sure)|i\s+guessed|just\s+guessing|my\s+guess|pure\s+guess|wild\s+guess|no\s+clue|don'?t\s+know|no\s+idea|haven'?t\s+a\s+clue|not\s+sure)\b/i;

  if (guessMarkers.test(trimmed)) {
    const questionTokens = new Set([
      ...extractContentTokens(question.text),
      ...question.choices.flatMap((c) => extractContentTokens(c.text)),
    ]);

    // Gather candidate supporting segments:
    // 1. Separate sentences that do not contain guess/uncertainty markers
    // 2. Clauses within guess-marker sentences after stripping the guess/uncertainty prefix
    const rawSentences = trimmed
      .split(/(?<=[.!?;\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const candidateSegments: string[] = [];

    for (const sent of rawSentences) {
      if (!guessMarkers.test(sent)) {
        candidateSegments.push(sent);
      } else {
        const stripped = sent
          .replace(
            /^(?:(?:i('?m|\s+am)?\s+(?:guessing|not\s+sure)|i\s+guessed|just\s+guessing|my\s+guess|pure\s+guess|wild\s+guess|i\s+thought|i\s+think|don'?t\s+know|no\s+idea|no\s+clue|not\s+sure)\s*(?:induction|deduction|abduction|inductive|deductive|abductive|choice\s+[a-d]|[a-d])?\s*(?:because|since|as|that|but|although|,|;|-)?\s*)/i,
            ""
          )
          .trim();
        if (stripped.length > 0 && stripped !== sent) {
          candidateSegments.push(stripped);
        }
      }
    }

    const INFERENTIAL_RELATION_TOKENS = new Set([
      "premise", "premises", "conclusion", "conclusions", "conclude", "concludes", "concluded",
      "guarantee", "guarantees", "guaranteed", "certain", "certainty",
      "probable", "probability", "likely", "likelihood",
      "pattern", "patterns", "predict", "predicts", "predicted", "prediction", "predictions",
      "cause", "causes", "caused", "causing", "explanation", "explanations",
      "evidence", "observation", "observations", "observe", "observes", "observed",
      "hypothesis", "hypotheses", "rule", "rules", "general", "specific",
      "eliminate", "eliminated", "elimination", "alternative", "alternatives",
      "proof", "proves", "proven", "valid", "invalid"
    ]);

    const hasSubstantiveSupportingPremise = candidateSegments.some((seg) => {
      const lowerSeg = seg.toLowerCase().trim();

      // Vague situational phrases ("of the situation", "the context") do not establish a substantive premise
      if (
        /^(?:(?:because\s+of|due\s+to|from|it('?s|\s+is)|of)\s+)?(?:the\s+situation|the\s+context|that|this)\.?$/i.test(lowerSeg) ||
        /^(?:the\s+situation|the\s+context)\.?$/i.test(lowerSeg)
      ) {
        return false;
      }

      // Choice or category names alone do not establish a premise
      if (/^(?:choice\s+[a-d]|[a-d]|induction|deduction|abduction|inductive|deductive|abductive)\.?$/i.test(lowerSeg)) {
        return false;
      }

      const segTokens = extractContentTokens(seg);
      if (segTokens.length === 0) return false;

      // Scenario premise check: a single matching token or number must NOT establish a premise
      const matchingScenarioTokens = segTokens.filter((t) => questionTokens.has(t));
      if (matchingScenarioTokens.length >= 2) {
        return true;
      }

      // Empirical numerical premise check: a ratio or multiple numbers (e.g. "9 out of 10", "nine of ten")
      // A single matching token or number must NOT establish a premise
      const numberTokens = segTokens.filter(
        (t) =>
          /^\d+$/.test(t) ||
          [
            "zero", "one", "two", "three", "four", "five", "six",
            "seven", "eight", "nine", "ten", "eleven", "twelve",
          ].includes(t)
      );
      if (numberTokens.length >= 2) {
        return true;
      }

      // Inferential premise check: requires an inferential relation token plus at least one scenario/inference token
      const matchingInferentialTokens = segTokens.filter((t) => INFERENTIAL_RELATION_TOKENS.has(t));
      if (matchingInferentialTokens.length >= 1 && segTokens.length >= 2) {
        const substantiveTokens = segTokens.filter(
          (t) => questionTokens.has(t) || INFERENTIAL_RELATION_TOKENS.has(t)
        );
        if (substantiveTokens.length >= 2) {
          return true;
        }
      }

      return false;
    });

    if (hasSubstantiveSupportingPremise) {
      // Substantive premise present (e.g. in separate sentence or supporting clause)
      return {
        isUnclear: false,
      };
    }

    // No substantive premise in the guess/uncertainty statement
    return {
      isUnclear: true,
      reason: "guessing_or_uncertainty",
      clarificationPrompt:
        "Could you describe what led you to choose this answer over the others?",
      notes: "Student explanation consists of guessing/uncertainty elaboration without substantive premises.",
    };
  }

  // 5. In-Context Irrelevance / Unrelated Statements (e.g. T14)
  if (isUnrelatedInContext(trimmed, question)) {
    return {
      isUnclear: true,
      reason: "unrelated_statement",
      clarificationPrompt:
        "Please explain your reasoning regarding the scenario and the inference types in the question.",
      notes: "Student statement has no in-context connection to the scenario or inference concepts.",
    };
  }

  // Substantive reasoning confirmed
  return {
    isUnclear: false,
  };
}

/**
 * Constructs and verifies a runtime fallback response using the reviewed primary follow-up.
 * Reused identically for both retry exhaustion and second-unclear handling.
 */
export function createVerifiedFallback(
  question: Question,
  store: { followUpsById: Map<string, FollowUp> }
): FeedbackResult {
  const primaryFollowUpId = question.follow_up_ids[0];
  if (!primaryFollowUpId) {
    throw new FallbackVerificationError(
      `Question '${question.id}' is missing a primary follow-up link`
    );
  }

  const primaryFollowUp = store.followUpsById.get(primaryFollowUpId);
  if (!primaryFollowUp) {
    throw new FallbackVerificationError(
      `Primary follow-up '${primaryFollowUpId}' for question '${question.id}' does not exist in reviewed runtime data`
    );
  }

  if (!question.follow_up_ids.includes(primaryFollowUp.id)) {
    throw new FallbackVerificationError(
      `Primary follow-up '${primaryFollowUp.id}' is not linked to question '${question.id}'`
    );
  }

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

export class FeedbackPipeline {
  private _lastTelemetry: PipelineTelemetry | null = null;

  constructor(private readonly transport: OllamaTransport) {}

  get lastTelemetry(): PipelineTelemetry | null {
    return this._lastTelemetry;
  }

  async processFeedback(
    request: FeedbackRequest,
    options: PipelineExecutionOptions = {}
  ): Promise<FeedbackResult> {
    const { result } = await this.processFeedbackWithTelemetry(request, options);
    return result;
  }

  async processFeedbackWithTelemetry(
    request: FeedbackRequest,
    options: PipelineExecutionOptions = {}
  ): Promise<{ result: FeedbackResult; telemetry: PipelineTelemetry }> {
    const question = getQuestion(request.question_id);
    if (!question) {
      throw new QuestionNotFoundError(request.question_id);
    }

    const choice = question.choices.find((c) => c.id === request.student_choice_id);
    if (!choice) {
      throw new InvalidChoiceError(request.student_choice_id, question.id);
    }

    const store = getContentStore();
    const clarificationCount = request.clarification_attempt_count ?? 0;

    // Assess reasoning clarity independently of the model
    const assessment = assessReasoningClarity(
      request.student_reasoning,
      question,
      request.student_choice_id
    );

    // 1. Confidently unclear reasoning: apply clarification / count-based verified fallback
    // without calling the model or depending on valid model references
    if (assessment.isUnclear && !options.evaluateModelDirectly) {
      if (clarificationCount === 0) {
        const clarificationResult = {
          kind: "clarification" as const,
          clarification_prompt:
            assessment.clarificationPrompt ??
            "Could you explain your reasoning regarding this scenario in more detail?",
        };
        const validation = FeedbackResultSchema.safeParse(clarificationResult);
        if (!validation.success) {
          throw new Error("Clarification result failed FeedbackResultSchema");
        }
        const telemetry: PipelineTelemetry = {
          decision: "safeguard_clarification",
          reason: assessment.reason,
          model_called: false,
          attempts: 0,
        };
        this._lastTelemetry = telemetry;
        return { result: validation.data, telemetry };
      } else {
        // clarificationCount >= 1: Second unclear fallback
        const fallbackResult = createVerifiedFallback(question, store);
        const telemetry: PipelineTelemetry = {
          decision: "second_unclear_fallback",
          reason: assessment.reason ?? "second_unclear",
          model_called: false,
          attempts: 0,
        };
        this._lastTelemetry = telemetry;
        return { result: fallbackResult, telemetry };
      }
    }

    // 2. Substantive reasoning: invoke model with F4 retry and technical fallback
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

        // Model returned needs_clarification
        if (modelOutput.status === "needs_clarification") {
          if (clarificationCount === 0) {
            const clarificationResult = {
              kind: "clarification" as const,
              clarification_prompt: modelOutput.clarification_prompt!,
            };
            const validation = FeedbackResultSchema.safeParse(clarificationResult);
            if (!validation.success) {
              throw new Error("Clarification result failed FeedbackResultSchema");
            }
            const telemetry: PipelineTelemetry = {
              decision: "model_clarification",
              reason: "model_requested_clarification",
              model_called: true,
              attempts: attempt,
            };
            this._lastTelemetry = telemetry;
            return { result: validation.data, telemetry };
          } else {
            const fallbackResult = createVerifiedFallback(question, store);
            const telemetry: PipelineTelemetry = {
              decision: "second_unclear_fallback",
              reason: "second_unclear_model_fallback",
              model_called: true,
              attempts: attempt,
            };
            this._lastTelemetry = telemetry;
            return { result: fallbackResult, telemetry };
          }
        }

        // If evaluateModelDirectly was used, intercept unsafe diagnosis on unclear reasoning
        if (assessment.isUnclear) {
          if (clarificationCount === 0) {
            const clarificationResult = {
              kind: "clarification" as const,
              clarification_prompt:
                assessment.clarificationPrompt ??
                "Could you explain your reasoning regarding this scenario in more detail?",
            };
            const validation = FeedbackResultSchema.safeParse(clarificationResult);
            if (!validation.success) {
              throw new Error("Clarification result failed FeedbackResultSchema");
            }
            const telemetry: PipelineTelemetry = {
              decision: "safeguard_clarification",
              reason: assessment.reason,
              model_called: true,
              attempts: attempt,
            };
            this._lastTelemetry = telemetry;
            return { result: validation.data, telemetry };
          } else {
            const fallbackResult = createVerifiedFallback(question, store);
            const telemetry: PipelineTelemetry = {
              decision: "second_unclear_fallback",
              reason: assessment.reason ?? "second_unclear",
              model_called: true,
              attempts: attempt,
            };
            this._lastTelemetry = telemetry;
            return { result: fallbackResult, telemetry };
          }
        }

        // Resolve distinction
        const distinctionResult = resolveDistinction(
          modelOutput.concept_ids,
          linkedFollowUps
        );
        if (!distinctionResult.ok || !distinctionResult.pair) {
          throw new Error(
            distinctionResult.error ?? "Failed to resolve concept distinction"
          );
        }

        // Repair follow-up
        const repairResult = repairFollowUp(
          question,
          linkedFollowUps,
          distinctionResult.pair,
          modelOutput.follow_up_id
        );
        if (!repairResult.ok || !repairResult.follow_up_id) {
          throw new Error(repairResult.error ?? "Failed to repair follow-up reference");
        }

        // Convert to FeedbackResult
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

        const telemetry: PipelineTelemetry = {
          decision: "accepted_diagnosis",
          reason: "substantive_diagnosis_accepted",
          model_called: true,
          attempts: attempt,
        };
        this._lastTelemetry = telemetry;
        return { result: resultValidation.data, telemetry };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt < maxAttempts) {
          retryError = message;
          continue;
        }
        retryError = message;
      }
    }

    // Retries exhausted: technical fallback
    const fallbackResult = createVerifiedFallback(question, store);
    const telemetry: PipelineTelemetry = {
      decision: "technical_fallback",
      reason: `retries_exhausted: ${retryError}`,
      model_called: true,
      attempts: maxAttempts,
      error: retryError,
    };
    this._lastTelemetry = telemetry;
    return { result: fallbackResult, telemetry };
  }
}
