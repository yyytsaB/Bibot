import { toJSONSchema } from "zod";
import { ModelResponseSchema } from "shared";

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatPayload {
  model: string;
  messages: OllamaChatMessage[];
  stream: boolean;
  format: Record<string, unknown>;
  options: {
    temperature: number;
  };
}

export interface OllamaTransportOptions {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export interface OllamaTransport {
  chat(messages: OllamaChatMessage[], signal?: AbortSignal): Promise<string>;
}

export class HttpOllamaTransport implements OllamaTransport {
  readonly endpoint: string;
  readonly model: string;
  readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly cachedSchema: Record<string, unknown>;

  constructor(options: OllamaTransportOptions = {}) {
    this.endpoint = options.endpoint ?? "http://127.0.0.1:11434/api/chat";
    this.model = options.model ?? "qwen2.5:7b";
    this.timeoutMs =
      options.timeoutMs ??
      parseInt(process.env["OLLAMA_TIMEOUT_MS"] ?? "15000", 10);
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.cachedSchema = toJSONSchema(ModelResponseSchema) as Record<string, unknown>;
  }

  getSchema(): Record<string, unknown> {
    return this.cachedSchema;
  }

  async chat(messages: OllamaChatMessage[], callerSignal?: AbortSignal): Promise<string> {
    const payload: OllamaChatPayload = {
      model: this.model,
      messages,
      stream: false,
      format: this.cachedSchema,
      options: {
        temperature: 0.1,
      },
    };

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const combinedSignal = callerSignal
      ? AbortSignal.any([callerSignal, timeoutSignal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: combinedSignal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(`Ollama request timed out after ${this.timeoutMs}ms`, { cause: err });
      }
      throw err;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Ollama HTTP error ${response.status} ${response.statusText}${
          errorText ? `: ${errorText}` : ""
        }`
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (err: unknown) {
      throw new Error("Failed to parse Ollama response as JSON", { cause: err });
    }

    if (
      !body ||
      typeof body !== "object" ||
      !("message" in body) ||
      typeof (body as { message?: { content?: unknown } }).message?.content !== "string"
    ) {
      throw new Error("Malformed Ollama envelope: missing message.content");
    }

    return (body as { message: { content: string } }).message.content;
  }
}
