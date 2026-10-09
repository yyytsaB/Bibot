import { type OllamaTransport, type OllamaChatMessage } from "../../src/transport.js";

export class MockOllamaTransport implements OllamaTransport {
  public calls: OllamaChatMessage[][] = [];
  private queuedResponses: (string | Error | (() => string | Error))[] = [];

  constructor(responses: (string | Error | (() => string | Error))[] = []) {
    this.queuedResponses = [...responses];
  }

  enqueue(response: string | Error | (() => string | Error)): void {
    this.queuedResponses.push(response);
  }

  async chat(messages: OllamaChatMessage[]): Promise<string> {
    this.calls.push(messages);

    if (this.queuedResponses.length === 0) {
      throw new Error("MockOllamaTransport: no queued responses available");
    }

    const next = this.queuedResponses.shift()!;
    const resolved = typeof next === "function" ? next() : next;

    if (resolved instanceof Error) {
      throw resolved;
    }

    return resolved;
  }
}
