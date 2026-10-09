import {
  type FeedbackResult,
  FeedbackResultSchema,
} from "shared";

export interface FeedbackApiRequest {
  question_id: string;
  student_choice_id: string;
  student_reasoning: string;
}

export type FeedbackApiResponse =
  | { ok: true; data: FeedbackResult }
  | { ok: false; error: string; statusCode?: number };

export interface IFeedbackApiClient {
  submitFeedback(
    request: FeedbackApiRequest,
    options?: { signal?: AbortSignal }
  ): Promise<FeedbackApiResponse>;
}

export class HttpFeedbackApiClient implements IFeedbackApiClient {
  private readonly endpointUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options?: { endpointUrl?: string; fetchFn?: typeof fetch }) {
    this.endpointUrl = options?.endpointUrl ?? "/api/feedback";
    this.fetchFn = options?.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  public async submitFeedback(
    request: FeedbackApiRequest,
    options?: { signal?: AbortSignal }
  ): Promise<FeedbackApiResponse> {
    try {
      const response = await this.fetchFn(this.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question_id: request.question_id,
          student_choice_id: request.student_choice_id,
          student_reasoning: request.student_reasoning,
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        const statusText = response.statusText ? ` ${response.statusText}` : "";
        let errMessage = `HTTP ${response.status}${statusText}`;
        try {
          const errBody = await response.json();
          if (errBody && typeof errBody === "object" && "error" in errBody && typeof errBody.error === "string") {
            errMessage = errBody.error;
          }
        } catch {
          // Non-JSON error body fallback
        }
        return {
          ok: false,
          error: errMessage,
          statusCode: response.status,
        };
      }

      let rawJson: unknown;
      try {
        rawJson = await response.json();
      } catch (jsonErr: unknown) {
        return {
          ok: false,
          error: `Malformed JSON response: ${jsonErr instanceof Error ? jsonErr.message : String(jsonErr)}`,
          statusCode: response.status,
        };
      }

      const parseResult = FeedbackResultSchema.safeParse(rawJson);

      if (!parseResult.success) {
        return {
          ok: false,
          error: `Invalid response format from server: ${parseResult.error.message}`,
          statusCode: response.status,
        };
      }

      return {
        ok: true,
        data: parseResult.data,
      };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { ok: false, error: "Request aborted" };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }
}
