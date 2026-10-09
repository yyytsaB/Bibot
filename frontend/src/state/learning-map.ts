import type { PracticeContentStore } from "./content-store.ts";
import type { LearningEvidenceEvent, PracticeState } from "./types.ts";

export type ConceptLearningStatus =
  | "Not Yet Practiced"
  | "Needs Review"
  | "Improving"
  | "Understanding Demonstrated";

export const LEARNING_STATUS_COLORS = {
  "Not Yet Practiced": "gray",
  "Needs Review": "red",
  Improving: "amber",
  "Understanding Demonstrated": "green",
} as const satisfies Record<ConceptLearningStatus, string>;

export interface ConceptLearningState {
  concept_id: string;
  status: ConceptLearningStatus;
  consecutive_correct: number;
  last_updated: number | null;
}

export interface ConfusedConceptPair {
  concept_a: string;
  concept_b: string;
  count: number;
}

export interface LearningMapNode {
  id: string;
  label: string;
  definition: string;
  position: { x: number; y: number };
  status: ConceptLearningStatus;
  color: "gray" | "red" | "amber" | "green";
}

export interface LearningMapEdge {
  id: string;
  source: string;
  target: string;
  isConfused: boolean;
  count: number;
}

export interface LearningMapSnapshot {
  concepts: ConceptLearningState[];
  confused_pairs: ConfusedConceptPair[];
  nodes: LearningMapNode[];
  edges: LearningMapEdge[];
}

// Prepared Critical Thinking topology. No model response can add graph elements.
const NODE_LAYOUT = [
  { id: "induction", x: 0, y: 180 },
  { id: "deduction", x: 180, y: 0 },
  { id: "abduction", x: 360, y: 180 },
] as const;

const LINKS = [
  ["abduction", "induction"],
  ["deduction", "induction"],
  ["abduction", "deduction"],
] as const;

function pairKey(a: string, b: string): string {
  return JSON.stringify([a, b].sort());
}

function sameConcepts(a: readonly string[], b: readonly string[]): boolean {
  const unique = new Set(a);
  return unique.size === a.length && a.length === b.length && b.every((id) => unique.has(id));
}

/**
 * In-memory F10 learning state. Consume F6 evidence in emission order, including
 * cumulative evidence arrays on repeated controller notifications. F8 owns persistence;
 * F11 owns adaptation of these presentation-independent snapshots to React Flow.
 */
export class LearningMapStore {
  private readonly contentStore: PracticeContentStore;
  private readonly concepts = new Map<string, ConceptLearningState>();
  private readonly confusedPairs = new Map<string, ConfusedConceptPair>();
  private readonly processedEventIds = new Set<string>();
  private readonly processedAnswers = new Set<string>();

  constructor(contentStore: PracticeContentStore) {
    this.contentStore = contentStore;
    for (const { id } of NODE_LAYOUT) {
      if (!contentStore.hasConcept(id)) {
        throw new Error(`Learning map requires reviewed concept '${id}'`);
      }
      this.concepts.set(id, {
        concept_id: id,
        status: "Not Yet Practiced",
        consecutive_correct: 0,
        last_updated: null,
      });
    }
  }

  public applyEvidence(events: readonly LearningEvidenceEvent[]): number {
    let applied = 0;
    for (const event of events) {
      if (this.applyEvent(event)) applied++;
    }
    return applied;
  }

  public applyEvent(event: LearningEvidenceEvent): boolean {
    if (!event.eventId || !event.sessionId || !Number.isFinite(event.timestamp) || event.timestamp < 0) {
      throw new Error("Learning evidence requires event/session IDs and a valid timestamp");
    }
    const eventKey = JSON.stringify([event.sessionId, event.eventId]);
    const answerKey = event.kind === "follow_up_result"
      ? JSON.stringify([event.sessionId, "follow_up", event.followUpId])
      : JSON.stringify([event.sessionId, "initial", event.questionId]);
    if (this.processedEventIds.has(eventKey) || this.processedAnswers.has(answerKey)) return false;

    const question = this.contentStore.getQuestion(event.questionId);
    if (!question) throw new Error(`Unknown evidence question '${event.questionId}'`);

    let affected: readonly string[];
    let correct: boolean;
    switch (event.kind) {
      case "wrong_initial":
      case "correct_first_try": {
        if (!sameConcepts(event.conceptIds, question.concept_ids)) {
          throw new Error("Initial-answer evidence must match the question's reviewed concepts");
        }
        if (event.kind === "wrong_initial" && (
          event.selectedChoiceId === question.correct_choice_id ||
          !question.choices.some((choice) => choice.id === event.selectedChoiceId)
        )) {
          throw new Error("Wrong-answer evidence must reference an existing incorrect choice");
        }
        affected = question.concept_ids;
        correct = event.kind === "correct_first_try";
        break;
      }
      case "follow_up_result": {
        const followUp = this.contentStore.getFollowUp(event.followUpId);
        if (!followUp || !this.contentStore.isFollowUpLinkedToQuestion(question.id, followUp.id)) {
          throw new Error("Follow-up evidence must reference an eligible reviewed linked follow-up");
        }
        if (!sameConcepts(event.conceptPair, followUp.concept_pair) || typeof event.isCorrect !== "boolean") {
          throw new Error("Follow-up evidence must match its reviewed concept pair and correctness");
        }
        affected = followUp.concept_pair;
        correct = event.isCorrect;
        break;
      }
      default:
        throw new Error("Unknown learning evidence kind");
    }

    // Validate all references before changing counters or marking the event consumed.
    for (const id of affected) {
      if (!this.concepts.has(id)) throw new Error(`Evidence concept '${id}' is outside the prepared graph`);
    }
    for (const id of affected) {
      const previous = this.concepts.get(id)!;
      const consecutive = correct ? previous.consecutive_correct + 1 : 0;
      this.concepts.set(id, {
        concept_id: id,
        status: !correct ? "Needs Review" : consecutive >= 2 ? "Understanding Demonstrated" : "Improving",
        consecutive_correct: consecutive,
        last_updated: event.timestamp,
      });
    }

    if (!correct) {
      // Both initial and follow-up wrong answers are evidence of a confused distinction.
      for (let i = 0; i < affected.length; i++) {
        for (let j = i + 1; j < affected.length; j++) {
          const [a, b] = [affected[i]!, affected[j]!].sort();
          const key = pairKey(a!, b!);
          const previous = this.confusedPairs.get(key);
          this.confusedPairs.set(key, {
            concept_a: a!, concept_b: b!, count: (previous?.count ?? 0) + 1,
          });
        }
      }
    }
    this.processedEventIds.add(eventKey);
    this.processedAnswers.add(answerKey);
    return true;
  }

  public getSnapshot(): LearningMapSnapshot {
    return {
      concepts: [...this.concepts.values()].map((state) => ({ ...state })),
      confused_pairs: [...this.confusedPairs.values()].map((pair) => ({ ...pair })),
      nodes: NODE_LAYOUT.map(({ id, x, y }) => {
        const concept = this.contentStore.getConcept(id)!;
        const state = this.concepts.get(id)!;
        return {
          id, label: concept.name, definition: concept.definition,
          position: { x, y }, status: state.status, color: LEARNING_STATUS_COLORS[state.status],
        };
      }),
      edges: LINKS.map(([source, target]) => {
        const count = this.confusedPairs.get(pairKey(source, target))?.count ?? 0;
        return { id: `edge-${source}-${target}`, source, target, isConfused: count > 0, count };
      }),
    };
  }
}

/** Replays current evidence, then consumes future notifications; call the disposer on unmount. */
export function connectLearningMap(
  source: {
    getState(): PracticeState;
    subscribe(listener: (state: PracticeState) => void): () => void;
  },
  map: LearningMapStore,
): () => void {
  const consume = (state: PracticeState) => { map.applyEvidence(state.learningEvidence); };
  const unsubscribe = source.subscribe(consume);
  try {
    consume(source.getState());
  } catch (error) {
    unsubscribe();
    throw error;
  }
  return unsubscribe;
}
