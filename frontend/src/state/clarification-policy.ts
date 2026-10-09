/**
 * F7 Clarification Integration Seam
 *
 * This interface defines the contract through which F7 will implement
 * multi-turn prompt tuning, first-unclear clarification prompts, and second-unclear
 * backend fallback policy.
 *
 * F6 responsibilities:
 * - Maintain transient clarification count per question.
 * - Reset count on question advancement.
 * - Terminate clarification cycle when diagnosis or fallback arrives.
 * - Keep student edit/resubmissions strictly separate from F4's internal model retry.
 *
 * Full multi-attempt clarification policy is finalized in F7.
 */
export interface ClarificationPolicy {
  getClarificationCount(questionId: string): number;
  recordClarification(questionId: string): number;
  resetQuestion(questionId: string): void;
  resetAll(): void;
}

export class DefaultClarificationPolicy implements ClarificationPolicy {
  private readonly counts: Map<string, number> = new Map();

  public getClarificationCount(questionId: string): number {
    return this.counts.get(questionId) ?? 0;
  }

  public recordClarification(questionId: string): number {
    const current = this.getClarificationCount(questionId);
    const next = current + 1;
    this.counts.set(questionId, next);
    return next;
  }

  public resetQuestion(questionId: string): void {
    this.counts.delete(questionId);
  }

  public resetAll(): void {
    this.counts.clear();
  }
}
