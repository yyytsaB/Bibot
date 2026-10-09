import express, { type Express, type Request, type Response } from "express";
import {
  FeedbackPipeline,
  QuestionNotFoundError,
  InvalidChoiceError,
} from "./pipeline.js";
import { HttpOllamaTransport } from "./transport.js";
import { loadContent } from "./content.js";

export function createApp(pipeline?: FeedbackPipeline): Express {
  // Ensure content is loaded and validated
  loadContent();

  const activePipeline = pipeline ?? new FeedbackPipeline(new HttpOllamaTransport());
  const app: Express = express();

  app.use(express.json());

  app.post("/api/feedback", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        res.status(400).json({ error: "Request body must be a JSON object" });
        return;
      }

      const {
        question_id,
        student_choice_id,
        student_reasoning,
        clarification_attempt_count,
      } = body as Record<string, unknown>;

      const isValidField = (val: unknown): val is string =>
        typeof val === "string" && val.trim().length > 0;

      if (
        !isValidField(question_id) ||
        !isValidField(student_choice_id) ||
        !isValidField(student_reasoning)
      ) {
        res.status(400).json({
          error:
            "Fields 'question_id', 'student_choice_id', and 'student_reasoning' are required and cannot be empty or whitespace-only",
        });
        return;
      }

      let parsedCount: number | undefined = undefined;
      if (clarification_attempt_count !== undefined) {
        if (
          typeof clarification_attempt_count !== "number" ||
          !Number.isInteger(clarification_attempt_count) ||
          clarification_attempt_count < 0
        ) {
          res.status(400).json({
            error:
              "Field 'clarification_attempt_count' must be a non-negative integer when provided",
          });
          return;
        }
        parsedCount = clarification_attempt_count;
      }

      const result = await activePipeline.processFeedback({
        question_id,
        student_choice_id,
        student_reasoning,
        ...(parsedCount !== undefined ? { clarification_attempt_count: parsedCount } : {}),
      });

      res.status(200).json(result);
    } catch (err: unknown) {
      if (err instanceof QuestionNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof InvalidChoiceError) {
        res.status(400).json({ error: err.message });
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return app;
}
