import { PracticeController } from "./controller.ts";
import { getReviewedContentStore } from "./load-reviewed-content.ts";
import { LearningMapStore, connectLearningMap } from "./learning-map.ts";

/**
 * Verification entry ensuring that PracticeController, PracticeContentStore,
 * and the shared package bundle cleanly under Vite without modifying
 * teammate-owned UI components.
 */
export function verifyStateBundle(): boolean {
  const store = getReviewedContentStore();
  const controller = new PracticeController({ contentStore: store });
  const state = controller.getState();
  const map = new LearningMapStore(store);
  const disconnect = connectLearningMap(controller, map);
  disconnect();
  return state.status === "question_answering" && map.getSnapshot().nodes.length === 3;
}
