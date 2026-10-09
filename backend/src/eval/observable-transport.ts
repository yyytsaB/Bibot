import { type OllamaTransport, type OllamaChatMessage } from "../transport.js";

export interface RecordedAttempt {
  attemptNumber: number;
  messages: OllamaChatMessage[];
  startTimeMs: number;
  endTimeMs: number;
  latencyMs: number;
  rawResponse?: string;
  error?: string;
}

export interface CaseAttemptRecord {
  attempt_number: number;
  latency_ms: number;
  raw_response: string | null;
  error: string | null;
}

export class ObservableTransport implements OllamaTransport {
  readonly attempts: RecordedAttempt[] = [];

  constructor(private readonly innerTransport: OllamaTransport) {}

  getAttemptRecords(): CaseAttemptRecord[] {
    return this.attempts.map((a) => ({
      attempt_number: a.attemptNumber,
      latency_ms: Math.round(a.latencyMs * 10) / 10,
      raw_response: a.rawResponse ?? null,
      error: a.error ?? null,
    }));
  }

  async chat(messages: OllamaChatMessage[], signal?: AbortSignal): Promise<string> {
    const attemptNumber = this.attempts.length + 1;
    const startTimeMs = performance.now();
    try {
      const rawResponse = await this.innerTransport.chat(messages, signal);
      const endTimeMs = performance.now();
      const latencyMs = endTimeMs - startTimeMs;
      this.attempts.push({
        attemptNumber,
        messages,
        startTimeMs,
        endTimeMs,
        latencyMs,
        rawResponse,
      });
      return rawResponse;
    } catch (err: unknown) {
      const endTimeMs = performance.now();
      const latencyMs = endTimeMs - startTimeMs;
      const error = err instanceof Error ? err.message : String(err);
      this.attempts.push({
        attemptNumber,
        messages,
        startTimeMs,
        endTimeMs,
        latencyMs,
        error,
      });
      throw err;
    }
  }

  reset(): void {
    this.attempts.length = 0;
  }
}
