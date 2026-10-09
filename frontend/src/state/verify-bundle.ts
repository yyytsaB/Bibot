import { PracticeController } from "./controller.ts";
import { getReviewedContentStore } from "./load-reviewed-content.ts";

/**
 * Verification entry ensuring that PracticeController, PracticeContentStore,
 * and the shared package bundle cleanly under Vite without modifying
 * teammate-owned UI components.
 */
export function verifyStateBundle(): boolean {
  const store = getReviewedContentStore();
  const controller = new PracticeController({ contentStore: store });
  const state = controller.getState();
  return state.status === "question_answering";
}
