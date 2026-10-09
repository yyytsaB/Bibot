import conceptsData from "../../../data/concepts.json";
import questionsData from "../../../data/questions.json";
import followUpsData from "../../../data/follow-ups.json";
import { PracticeContentStore } from "./content-store.ts";

let defaultStoreInstance: PracticeContentStore | null = null;

/**
 * Loads and validates the reviewed C1/F2 static content bank.
 * Guarantees that only human-reviewed/approved content enters practice,
 * keeping development fixtures and evaluation cases strictly isolated.
 */
export function getReviewedContentStore(): PracticeContentStore {
  if (!defaultStoreInstance) {
    defaultStoreInstance = new PracticeContentStore({
      concepts: conceptsData,
      questions: questionsData,
      followUps: followUpsData,
    });
  }
  return defaultStoreInstance;
}
