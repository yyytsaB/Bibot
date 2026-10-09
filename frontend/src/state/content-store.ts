import {
  type Concept,
  type Question,
  type FollowUp,
  ConceptSchema,
  QuestionSchema,
  FollowUpSchema,
} from "shared";

export interface ContentValidationResult {
  ok: boolean;
  errors: string[];
}

export class PracticeContentStore {
  private readonly concepts: Map<string, Concept> = new Map();
  private readonly questions: Map<string, Question> = new Map();
  private readonly followUps: Map<string, FollowUp> = new Map();
  private readonly questionList: Question[] = [];

  constructor(data: {
    concepts: unknown[];
    questions: unknown[];
    followUps: unknown[];
  }) {
    const validation = this.validateAndLoad(data);
    if (!validation.ok) {
      throw new Error(
        `PracticeContentStore validation failed:\n${validation.errors.join("\n")}`
      );
    }
  }

  private validateAndLoad(data: {
    concepts: unknown[];
    questions: unknown[];
    followUps: unknown[];
  }): ContentValidationResult {
    const errors: string[] = [];

    // 1. Validate and store Concepts
    for (let i = 0; i < data.concepts.length; i++) {
      const parsed = ConceptSchema.safeParse(data.concepts[i]);
      if (!parsed.success) {
        errors.push(`Concept index ${i} failed schema validation: ${parsed.error.message}`);
        continue;
      }
      if (this.concepts.has(parsed.data.id)) {
        errors.push(`Duplicate concept ID detected: '${parsed.data.id}'`);
      }
      this.concepts.set(parsed.data.id, parsed.data);
    }

    // 2. Validate and store FollowUps
    for (let i = 0; i < data.followUps.length; i++) {
      const parsed = FollowUpSchema.safeParse(data.followUps[i]);
      if (!parsed.success) {
        errors.push(`FollowUp index ${i} failed schema validation: ${parsed.error.message}`);
        continue;
      }
      if (this.followUps.has(parsed.data.id)) {
        errors.push(`Duplicate follow-up ID detected: '${parsed.data.id}'`);
      }
      this.followUps.set(parsed.data.id, parsed.data);

      // Validate concept pair references
      const [cA, cB] = parsed.data.concept_pair;
      if (cA === cB) {
        errors.push(
          `Follow-up '${parsed.data.id}' has repeated concept '${cA}' in concept_pair; must be two distinct concepts`
        );
      }
      if (!this.concepts.has(cA)) {
        errors.push(`Follow-up '${parsed.data.id}' references unknown concept '${cA}' in concept_pair`);
      }
      if (!this.concepts.has(cB)) {
        errors.push(`Follow-up '${parsed.data.id}' references unknown concept '${cB}' in concept_pair`);
      }
      if (!parsed.data.concept_ids.includes(cA)) {
        errors.push(
          `Follow-up '${parsed.data.id}' concept_pair member '${cA}' is not included in concept_ids`
        );
      }
      if (!parsed.data.concept_ids.includes(cB)) {
        errors.push(
          `Follow-up '${parsed.data.id}' concept_pair member '${cB}' is not included in concept_ids`
        );
      }
      for (const cId of parsed.data.concept_ids) {
        if (!this.concepts.has(cId)) {
          errors.push(`Follow-up '${parsed.data.id}' references unknown concept_id '${cId}'`);
        }
      }
    }

    // 3. Validate and store Questions
    for (let i = 0; i < data.questions.length; i++) {
      const parsed = QuestionSchema.safeParse(data.questions[i]);
      if (!parsed.success) {
        errors.push(`Question index ${i} failed schema validation: ${parsed.error.message}`);
        continue;
      }
      if (this.questions.has(parsed.data.id)) {
        errors.push(`Duplicate question ID detected: '${parsed.data.id}'`);
      }
      this.questions.set(parsed.data.id, parsed.data);
      this.questionList.push(parsed.data);

      // Validate question concept_ids
      for (const cId of parsed.data.concept_ids) {
        if (!this.concepts.has(cId)) {
          errors.push(`Question '${parsed.data.id}' references unknown concept_id '${cId}'`);
        }
      }

      const qDistinction = new Set(parsed.data.concept_ids);
      if (qDistinction.size !== 2) {
        errors.push(
          `Question '${parsed.data.id}' must specify a distinction of exactly 2 distinct concepts in concept_ids, found ${qDistinction.size}`
        );
      }

      // Validate linked follow_up_ids
      for (const fId of parsed.data.follow_up_ids) {
        const followUp = this.followUps.get(fId);
        if (!followUp) {
          errors.push(`Question '${parsed.data.id}' references missing follow_up_id '${fId}'`);
          continue;
        }

        // Validate that linked follow-up matches question's reviewed distinction
        const [fA, fB] = followUp.concept_pair;
        if (
          qDistinction.size !== 2 ||
          !qDistinction.has(fA) ||
          !qDistinction.has(fB)
        ) {
          errors.push(
            `Question '${parsed.data.id}' linked follow-up '${fId}' concept_pair ['${fA}', '${fB}'] does not match question distinction ['${parsed.data.concept_ids.join("', '")}']`
          );
        }
      }
    }

    return {
      ok: errors.length === 0,
      errors,
    };
  }

  public getQuestions(): Question[] {
    return [...this.questionList];
  }

  public getQuestion(id: string): Question | undefined {
    return this.questions.get(id);
  }

  public getFollowUp(id: string): FollowUp | undefined {
    return this.followUps.get(id);
  }

  public hasConcept(id: string): boolean {
    return this.concepts.has(id);
  }

  public getConcept(id: string): Concept | undefined {
    return this.concepts.get(id);
  }

  /**
   * Validates whether all concept IDs from an AI diagnosis exist in reviewed concepts.
   */
  public validateDiagnosisConcepts(conceptIds: string[]): {
    ok: boolean;
    unrecognizedConceptId: string | null;
  } {
    for (const cId of conceptIds) {
      if (!this.concepts.has(cId)) {
        return { ok: false, unrecognizedConceptId: cId };
      }
    }
    return { ok: true, unrecognizedConceptId: null };
  }

  /**
   * Verifies that a follow_up_id in a response resolves to an existing eligible follow-up
   * linked to the current question and matching its reviewed distinction.
   */
  public isFollowUpLinkedToQuestion(questionId: string, followUpId: string): boolean {
    const q = this.questions.get(questionId);
    if (!q) return false;
    if (!q.follow_up_ids.includes(followUpId)) return false;
    const followUp = this.followUps.get(followUpId);
    if (!followUp) return false;

    // Verify concept pair integrity
    const [cA, cB] = followUp.concept_pair;
    if (cA === cB) return false;
    if (!followUp.concept_ids.includes(cA) || !followUp.concept_ids.includes(cB)) return false;

    // Verify distinction match with parent question
    const qDistinction = new Set(q.concept_ids);
    if (qDistinction.size !== 2 || !qDistinction.has(cA) || !qDistinction.has(cB)) return false;

    return true;
  }

  /**
   * Discovers an unused eligible linked example for a question that has not yet been shown.
   * Ensures the unused example preserves the active question distinction.
   * If all linked follow-ups have already been shown, returns null (finite termination).
   */
  public findUnusedLinkedFollowUp(
    questionId: string,
    shownFollowUpIds: string[]
  ): FollowUp | null {
    const q = this.questions.get(questionId);
    if (!q) return null;
    const shownSet = new Set(shownFollowUpIds);
    const qDistinction = new Set(q.concept_ids);

    for (const fId of q.follow_up_ids) {
      if (!shownSet.has(fId)) {
        const followUp = this.followUps.get(fId);
        if (
          followUp &&
          followUp.concept_pair[0] !== followUp.concept_pair[1] &&
          followUp.concept_ids.includes(followUp.concept_pair[0]) &&
          followUp.concept_ids.includes(followUp.concept_pair[1]) &&
          qDistinction.size === 2 &&
          qDistinction.has(followUp.concept_pair[0]) &&
          qDistinction.has(followUp.concept_pair[1])
        ) {
          return followUp;
        }
      }
    }
    return null;
  }
}
