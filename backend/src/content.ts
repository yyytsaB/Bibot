import { type Concept, type Question, type FollowUp } from "shared";
import {
  validateContentDirectory,
  defaultDataDirectory,
} from "../scripts/validate-content.js";

export interface ContentStore {
  concepts: Concept[];
  questions: Question[];
  followUps: FollowUp[];
  conceptsById: Map<string, Concept>;
  questionsById: Map<string, Question>;
  followUpsById: Map<string, FollowUp>;
}

let store: ContentStore | null = null;

export function loadContent(directory: string = defaultDataDirectory()): ContentStore {
  const report = validateContentDirectory(directory);
  if (!report.ok || !report.data) {
    const errorDetails = report.errors.map((e) => `[${e.code}] ${e.message}`).join("; ");
    throw new Error(`Failed to load and validate content from ${directory}: ${errorDetails}`);
  }

  const { concepts, questions, followUps } = report.data;
  const conceptsById = new Map<string, Concept>(concepts.map((c) => [c.id, c]));
  const questionsById = new Map<string, Question>(questions.map((q) => [q.id, q]));
  const followUpsById = new Map<string, FollowUp>(followUps.map((f) => [f.id, f]));

  store = {
    concepts,
    questions,
    followUps,
    conceptsById,
    questionsById,
    followUpsById,
  };

  return store;
}

export function getContentStore(directory?: string): ContentStore {
  if (!store) {
    return loadContent(directory);
  }
  return store;
}

export function getQuestion(id: string): Question | undefined {
  return getContentStore().questionsById.get(id);
}

export function getFollowUp(id: string): FollowUp | undefined {
  return getContentStore().followUpsById.get(id);
}

export function getConcept(id: string): Concept | undefined {
  return getContentStore().conceptsById.get(id);
}

export function getAllConcepts(): Concept[] {
  return getContentStore().concepts;
}

export function getLinkedFollowUps(question: Question): FollowUp[] {
  const s = getContentStore();
  const linked: FollowUp[] = [];
  for (const id of question.follow_up_ids) {
    const f = s.followUpsById.get(id);
    if (f) {
      linked.push(f);
    }
  }
  return linked;
}
