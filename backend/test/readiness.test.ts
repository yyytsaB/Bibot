import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ReadinessService,
  resolveOllamaConfig,
  matchesExactModel,
  type Scheduler,
} from "../src/readiness.js";
import { HttpOllamaTransport } from "../src/transport.js";
import { createApp } from "../src/server.js";
import { FeedbackPipeline } from "../src/pipeline.js";
import { MockOllamaTransport } from "./support/mock-transport.js";

// Helper for deterministic scheduler recording delay ms without real delays
class MockScheduler implements Scheduler {
  private timerId = 0;
  public recordedDelays: number[] = [];
  private pendingCallbacks = new Map<number, { callback: () => void; ms: number }>();

  setTimeout(callback: () => void, ms: number): number {
    const id = ++this.timerId;
    this.recordedDelays.push(ms);
    this.pendingCallbacks.set(id, { callback, ms });
    return id;
  }

  clearTimeout(timer: unknown): void {
    if (typeof timer === "number") {
      this.pendingCallbacks.delete(timer);
    }
  }

  get pendingCount(): number {
    return this.pendingCallbacks.size;
  }

  runNext(): boolean {
    const nextKey = this.pendingCallbacks.keys().next().value;
    if (nextKey === undefined) {
      return false;
    }
    const item = this.pendingCallbacks.get(nextKey);
    this.pendingCallbacks.delete(nextKey);
    if (item) {
      item.callback();
      return true;
    }
    return false;
  }
}

test("matchesExactModel: strictly enforces exact matching and rejects prefixes", () => {
  // Target with explicit tag
  assert.equal(matchesExactModel("qwen2.5:7b", "qwen2.5:7b"), true);
  assert.equal(matchesExactModel("qwen2.5:7b-instruct", "qwen2.5:7b"), false);
  assert.equal(matchesExactModel("qwen2.5:7b-coder", "qwen2.5:7b"), false);
  assert.equal(matchesExactModel("qwen2.5:14b", "qwen2.5:7b"), false);
  assert.equal(matchesExactModel("qwen2.5", "qwen2.5:7b"), false);

  // Target without tag defaults to latest suffix equivalence
  assert.equal(matchesExactModel("llama3.2:latest", "llama3.2"), true);
  assert.equal(matchesExactModel("llama3.2", "llama3.2"), true);
  assert.equal(matchesExactModel("llama3.2:1b", "llama3.2"), false);
  assert.equal(matchesExactModel("llama3.2:3b", "llama3.2"), false);
  assert.equal(matchesExactModel("llama3.2-vision", "llama3.2"), false);

  // Unrelated models
  assert.equal(matchesExactModel("mistral:7b", "qwen2.5:7b"), false);
});

test("resolveOllamaConfig: resolves unified configuration object and applies overrides", () => {
  const defaultConfig = resolveOllamaConfig();
  assert.equal(defaultConfig.model, "qwen2.5:7b");
  assert.equal(defaultConfig.baseUrl, "http://127.0.0.1:11434");
  assert.equal(defaultConfig.chatEndpoint, "http://127.0.0.1:11434/api/chat");
  assert.equal(defaultConfig.tagsEndpoint, "http://127.0.0.1:11434/api/tags");
  assert.equal(defaultConfig.timeoutMs, 15000);

  const customConfig = resolveOllamaConfig({
    model: "llama3.2:latest",
    baseUrl: "http://localhost:11434/",
    timeoutMs: 12000,
  });
  assert.equal(customConfig.model, "llama3.2:latest");
  assert.equal(customConfig.baseUrl, "http://localhost:11434");
  assert.equal(customConfig.chatEndpoint, "http://localhost:11434/api/chat");
  assert.equal(customConfig.tagsEndpoint, "http://localhost:11434/api/tags");
  assert.equal(customConfig.timeoutMs, 12000);
});

test("Shared OllamaConfig is used by both HttpOllamaTransport and ReadinessService", () => {
  const sharedConfig = resolveOllamaConfig({ model: "test-model:7b" });
  const transport = new HttpOllamaTransport({ config: sharedConfig });
  const readiness = new ReadinessService({ config: sharedConfig });

  assert.equal(transport.model, "test-model:7b");
  assert.equal(readiness.config.model, "test-model:7b");
  assert.equal(transport.endpoint, readiness.config.chatEndpoint);
});

test("Startup availability failure: fetch error leaves readiness unavailable and verifies 2000ms timeout", async () => {
  const recordedTimeouts: number[] = [];
  const fakeFetch: typeof fetch = async () => {
    throw new Error("Connection refused");
  };

  const service = new ReadinessService({
    config: resolveOllamaConfig(),
    fetchFn: fakeFetch,
    createTimeoutSignal: (ms) => {
      recordedTimeouts.push(ms);
      return AbortSignal.timeout(ms);
    },
  });

  const available = await service.checkAvailability();
  assert.equal(available, false);
  assert.equal(recordedTimeouts.length, 1);
  assert.equal(recordedTimeouts[0], 2000, "Availability check uses 2000ms timeout");

  const state = service.getReadiness();
  assert.equal(state.isReady, false);
  assert.equal(state.statusLabel, "Local AI Unavailable");
  assert.match(state.detail, /Connection refused/);
  assert.equal(state.consecutiveFailures, 1);
});

test("Model missing in tags: leaves readiness unavailable", async () => {
  const fakeFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        models: [{ name: "other-model:latest" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const service = new ReadinessService({
    config: resolveOllamaConfig({ model: "qwen2.5:7b" }),
    fetchFn: fakeFetch,
  });

  const available = await service.checkAvailability();
  assert.equal(available, false);

  const state = service.getReadiness();
  assert.equal(state.isReady, false);
  assert.equal(state.statusLabel, "Local AI Unavailable");
  assert.match(state.detail, /not found in Ollama tags/);
});

test("Full startup lifecycle: tags confirmed, single warm-up runs, establishes readiness, and verifies 15000ms polling delay", async () => {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];

  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });

    if (url.endsWith("/api/tags")) {
      return new Response(
        JSON.stringify({
          models: [{ name: "qwen2.5:7b" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.endsWith("/api/chat")) {
      return new Response(
        JSON.stringify({
          message: { role: "assistant", content: "pong" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unexpected endpoint: ${url}`);
  };

  const scheduler = new MockScheduler();
  const service = new ReadinessService({
    config: resolveOllamaConfig({ model: "qwen2.5:7b" }),
    fetchFn: fakeFetch,
    scheduler,
  });

  await service.start();

  const state = service.getReadiness();
  assert.equal(state.isReady, true);
  assert.equal(state.statusLabel, "Local AI Ready");
  assert.equal(state.consecutiveFailures, 0);

  // Validate exact warm-up call structure
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "http://127.0.0.1:11434/api/tags");
  assert.equal(calls[1]?.url, "http://127.0.0.1:11434/api/chat");
  assert.equal(calls[1]?.method, "POST");
  assert.deepEqual(calls[1]?.body, {
    model: "qwen2.5:7b",
    messages: [{ role: "user", content: "ping" }],
    stream: false,
    options: { temperature: 0.1 },
  });

  // Verify scheduler recorded 15000ms polling delay
  assert.equal(scheduler.recordedDelays.length, 1);
  assert.equal(scheduler.recordedDelays[0], 15000, "Polling timer is scheduled for 15000ms");

  service.stop();
});

test("Warm-up failure policy: warm-up failure locks unavailable until restart and never retries on polling", async () => {
  let chatCalls = 0;
  let tagCalls = 0;

  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      tagCalls++;
      return new Response(
        JSON.stringify({
          models: [{ name: "qwen2.5:7b" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.endsWith("/api/chat")) {
      chatCalls++;
      return new Response("Ollama out of memory", { status: 500 });
    }
    throw new Error(`Unexpected endpoint: ${url}`);
  };

  const scheduler = new MockScheduler();
  const service = new ReadinessService({
    config: resolveOllamaConfig({ model: "qwen2.5:7b" }),
    fetchFn: fakeFetch,
    scheduler,
  });

  await service.start();

  let state = service.getReadiness();
  assert.equal(state.isReady, false);
  assert.equal(state.statusLabel, "Local AI Unavailable");
  assert.match(state.detail, /Warm-up failed/);
  assert.equal(chatCalls, 1);
  assert.equal(tagCalls, 1);

  // Trigger next periodic tick
  assert.equal(scheduler.pendingCount, 1);
  scheduler.runNext();
  await new Promise((r) => process.nextTick(r));

  // Verify tags check was executed, but chat warm-up was NEVER repeated
  assert.equal(tagCalls, 2);
  assert.equal(chatCalls, 1);

  state = service.getReadiness();
  assert.equal(state.isReady, false);
  assert.equal(state.statusLabel, "Local AI Unavailable");
  assert.match(state.detail, /Restart backend to re-attempt warm-up/);

  service.stop();
});

test("Consecutive failures: single failure maintains readiness, second failure withdraws readiness", async () => {
  let failTags = false;

  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      if (failTags) {
        throw new Error("Tags query timeout");
      }
      return new Response(
        JSON.stringify({
          models: [{ name: "qwen2.5:7b" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.endsWith("/api/chat")) {
      return new Response(
        JSON.stringify({
          message: { role: "assistant", content: "pong" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    throw new Error(`Unexpected endpoint: ${url}`);
  };

  const service = new ReadinessService({
    config: resolveOllamaConfig({ model: "qwen2.5:7b" }),
    fetchFn: fakeFetch,
  });

  // 1. Establish readiness initially
  await service.start();
  assert.equal(service.getReadiness().isReady, true);
  assert.equal(service.getReadiness().consecutiveFailures, 0);

  // 2. First failure: readiness remains true (transient tolerance)
  failTags = true;
  const check1 = await service.checkAvailability();
  assert.equal(check1, false);
  let state = service.getReadiness();
  assert.equal(state.isReady, true);
  assert.equal(state.consecutiveFailures, 1);
  assert.match(state.detail, /transient check failure \(1\/2\)/);

  // 3. Second consecutive failure: readiness withdrawn
  const check2 = await service.checkAvailability();
  assert.equal(check2, false);
  state = service.getReadiness();
  assert.equal(state.isReady, false);
  assert.equal(state.statusLabel, "Local AI Unavailable");
  assert.equal(state.consecutiveFailures, 2);

  // 4. Recovery: tag check succeeds again -> restores readiness without calling chat again
  failTags = false;
  const check3 = await service.checkAvailability();
  assert.equal(check3, true);
  state = service.getReadiness();
  assert.equal(state.isReady, true);
  assert.equal(state.statusLabel, "Local AI Ready");
  assert.equal(state.consecutiveFailures, 0);

  service.stop();
});

test("Timeout covers response-body consumption, including stalled body", async () => {
  let bodyReadAborted = false;

  const fakeFetch: typeof fetch = async (_input, init) => {
    const signal = init?.signal;

    const stalledStream = new ReadableStream({
      start(controller) {
        if (signal) {
          signal.addEventListener("abort", () => {
            bodyReadAborted = true;
            controller.error(new DOMException("The operation was aborted", "TimeoutError"));
          });
        }
      },
    });

    return new Response(stalledStream, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const abortCtrl = new AbortController();
  const createTimeoutSignal = () => {
    queueMicrotask(() => abortCtrl.abort());
    return abortCtrl.signal;
  };

  const service = new ReadinessService({
    config: resolveOllamaConfig({ model: "qwen2.5:7b" }),
    fetchFn: fakeFetch,
    createTimeoutSignal,
  });

  const available = await service.checkAvailability();
  assert.equal(available, false);
  assert.equal(bodyReadAborted, true);

  const state = service.getReadiness();
  assert.equal(state.isReady, false);
  assert.equal(state.consecutiveFailures, 1);
  assert.match(state.detail, /aborted|TimeoutError/i);
});

test("Shutdown race protection: late warm-up response after stop() does not restore readiness", async () => {
  let resolveWarmUpFetch: (resp: Response) => void;
  const warmUpFetchPromise = new Promise<Response>((resolve) => {
    resolveWarmUpFetch = resolve;
  });

  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return new Response(
        JSON.stringify({
          models: [{ name: "qwen2.5:7b" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.endsWith("/api/chat")) {
      return warmUpFetchPromise;
    }
    throw new Error(`Unexpected endpoint: ${url}`);
  };

  const scheduler = new MockScheduler();
  const service = new ReadinessService({
    config: resolveOllamaConfig({ model: "qwen2.5:7b" }),
    fetchFn: fakeFetch,
    scheduler,
  });

  const startPromise = service.start();
  await new Promise((r) => process.nextTick(r));

  service.stop();
  assert.equal(service.getReadiness().isReady, false);
  assert.equal(service.getReadiness().detail, "Readiness service stopped");

  resolveWarmUpFetch!(
    new Response(
      JSON.stringify({
        message: { role: "assistant", content: "late pong" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  );

  await startPromise;

  const state = service.getReadiness();
  assert.equal(state.isReady, false);
  assert.equal(state.statusLabel, "Local AI Unavailable");
  assert.equal(state.detail, "Readiness service stopped");
  assert.equal(scheduler.pendingCount, 0);
});

test("createApp(mockPipeline) compatibility: unconfigured readiness returns honest unavailable without network calls", async () => {
  let fetchCalled = false;
  const fakeFetch: typeof fetch = async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch;

  const mockPipeline = new FeedbackPipeline(new MockOllamaTransport());
  const app = createApp(mockPipeline);
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 3001;

  try {
    const response = await originalFetch(`http://127.0.0.1:${port}/api/readiness`);
    assert.equal(response.status, 200);

    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.isReady, false);
    assert.equal(body.statusLabel, "Local AI Unavailable");
    assert.equal(body.model, "unknown");
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/readiness endpoint is strictly read-only and does not trigger warm-up", async () => {
  let chatCalls = 0;
  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return new Response(
        JSON.stringify({ models: [{ name: "qwen2.5:7b" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.endsWith("/api/chat")) {
      chatCalls++;
      return new Response(
        JSON.stringify({ message: { content: "pong" } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    throw new Error(`Unexpected endpoint: ${url}`);
  };

  const service = new ReadinessService({
    config: resolveOllamaConfig({ model: "qwen2.5:7b" }),
    fetchFn: fakeFetch,
  });

  await service.start();
  assert.equal(chatCalls, 1);

  const mockPipeline = new FeedbackPipeline(new MockOllamaTransport());
  const app = createApp(mockPipeline, service);
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 3001;

  try {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/api/readiness`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.isReady, true);
      assert.equal(body.statusLabel, "Local AI Ready");
    }

    assert.equal(chatCalls, 1);
  } finally {
    service.stop();
    await new Promise((resolve) => server.close(resolve));
  }
});

// --- Targeted F12 Regression Tests ---

test("Regression: empty and whitespace-only warm-up content leaves readiness unavailable with no auto-retry", async () => {
  for (const emptyContent of ["", "   \t\n  "]) {
    let chatCalls = 0;
    let tagCalls = 0;

    const fakeFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/tags")) {
        tagCalls++;
        return new Response(
          JSON.stringify({ models: [{ name: "qwen2.5:7b" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/api/chat")) {
        chatCalls++;
        return new Response(
          JSON.stringify({ message: { role: "assistant", content: emptyContent } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    };

    const scheduler = new MockScheduler();
    const service = new ReadinessService({
      config: resolveOllamaConfig({ model: "qwen2.5:7b" }),
      fetchFn: fakeFetch,
      scheduler,
    });

    await service.start();

    const state = service.getReadiness();
    assert.equal(state.isReady, false);
    assert.equal(state.statusLabel, "Local AI Unavailable");
    assert.match(state.detail, /missing non-empty message\.content/);
    assert.equal(chatCalls, 1);

    // Subsequent periodic tick runs tags check, never retries warm-up
    scheduler.runNext();
    await new Promise((r) => process.nextTick(r));
    assert.equal(tagCalls, 2);
    assert.equal(chatCalls, 1);
    assert.equal(service.getReadiness().isReady, false);

    service.stop();
  }
});

test("Regression: concurrent start() calls deduplicate into one availability check, one warm-up, and one scheduled timer", async () => {
  let tagCalls = 0;
  let chatCalls = 0;

  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    if (url.endsWith("/api/tags")) {
      tagCalls++;
      return new Response(
        JSON.stringify({ models: [{ name: "qwen2.5:7b" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.endsWith("/api/chat")) {
      chatCalls++;
      return new Response(
        JSON.stringify({ message: { role: "assistant", content: "pong" } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    throw new Error(`Unexpected endpoint: ${url}`);
  };

  const scheduler = new MockScheduler();
  const service = new ReadinessService({
    config: resolveOllamaConfig({ model: "qwen2.5:7b" }),
    fetchFn: fakeFetch,
    scheduler,
  });

  // Call start() concurrently 3 times
  await Promise.all([service.start(), service.start(), service.start()]);

  assert.equal(tagCalls, 1, "Exactly one tags availability call in flight");
  assert.equal(chatCalls, 1, "Exactly one warm-up call in flight");
  assert.equal(scheduler.pendingCount, 1, "Exactly one scheduled timer");
  assert.equal(scheduler.recordedDelays[0], 15000, "Timer scheduled for 15000ms");
  assert.equal(service.getReadiness().isReady, true);

  service.stop();
});

test("Regression: concurrent checkAvailability() calls deduplicate into exactly one fetch and verify 2000ms timeout", async () => {
  let tagCalls = 0;

  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    if (url.endsWith("/api/tags")) {
      tagCalls++;
      return new Response(
        JSON.stringify({ models: [{ name: "qwen2.5:7b" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    throw new Error(`Unexpected endpoint: ${url}`);
  };

  const recordedTimeouts: number[] = [];
  const service = new ReadinessService({
    config: resolveOllamaConfig({ model: "qwen2.5:7b" }),
    fetchFn: fakeFetch,
    createTimeoutSignal: (ms) => {
      recordedTimeouts.push(ms);
      return AbortSignal.timeout(ms);
    },
  });

  const results = await Promise.all([
    service.checkAvailability(),
    service.checkAvailability(),
    service.checkAvailability(),
  ]);

  assert.deepEqual(results, [true, true, true]);
  assert.equal(tagCalls, 1, "Only one fetch was made for concurrent checks");
  assert.equal(recordedTimeouts[0], 2000, "Timeout is 2000ms for availability check");

  service.stop();
});

test("Regression: Ollama unavailable at startup, then available on a periodic tick runs warm-up once, followed by tags-only polling", async () => {
  let isOllamaOnline = false;
  let tagCalls = 0;
  let chatCalls = 0;

  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      tagCalls++;
      if (!isOllamaOnline) {
        throw new Error("Ollama daemon not responding");
      }
      return new Response(
        JSON.stringify({ models: [{ name: "qwen2.5:7b" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.endsWith("/api/chat")) {
      chatCalls++;
      if (!isOllamaOnline) {
        throw new Error("Ollama daemon not responding");
      }
      return new Response(
        JSON.stringify({ message: { role: "assistant", content: "pong" } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    throw new Error(`Unexpected endpoint: ${url}`);
  };

  const scheduler = new MockScheduler();
  const service = new ReadinessService({
    config: resolveOllamaConfig({ model: "qwen2.5:7b" }),
    fetchFn: fakeFetch,
    scheduler,
  });

  // 1. Startup: Ollama is offline
  await service.start();
  assert.equal(tagCalls, 1);
  assert.equal(chatCalls, 0, "No warm-up when tags unavailable");
  assert.equal(service.getReadiness().isReady, false);
  assert.equal(scheduler.pendingCount, 1);
  assert.equal(scheduler.recordedDelays[0], 15000);

  // 2. Ollama comes online; trigger first periodic tick
  isOllamaOnline = true;
  scheduler.runNext();
  await new Promise((r) => process.nextTick(r));

  assert.equal(tagCalls, 2);
  assert.equal(chatCalls, 1, "Warm-up executed once when model became available");
  assert.equal(service.getReadiness().isReady, true);
  assert.equal(service.getReadiness().statusLabel, "Local AI Ready");
  assert.equal(scheduler.recordedDelays[1], 15000);

  // 3. Second periodic tick: tags-only polling, zero extra warm-up calls
  scheduler.runNext();
  await new Promise((r) => process.nextTick(r));

  assert.equal(tagCalls, 3);
  assert.equal(chatCalls, 1, "Warm-up is never repeated on subsequent polling intervals");
  assert.equal(service.getReadiness().isReady, true);

  service.stop();
});

test("Regression: late availability response after stop() keeps readiness unavailable with no timer scheduled", async () => {
  let resolveTagsFetch: (resp: Response) => void;
  const tagsFetchPromise = new Promise<Response>((resolve) => {
    resolveTagsFetch = resolve;
  });

  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return tagsFetchPromise;
    }
    throw new Error(`Unexpected endpoint: ${url}`);
  };

  const scheduler = new MockScheduler();
  const service = new ReadinessService({
    config: resolveOllamaConfig({ model: "qwen2.5:7b" }),
    fetchFn: fakeFetch,
    scheduler,
  });

  const checkPromise = service.checkAvailability();
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

  // Stop service while check is in flight
  service.stop();
  assert.equal(service.getReadiness().isReady, false);
  assert.equal(service.getReadiness().detail, "Readiness service stopped");

  // Late response resolves
  resolveTagsFetch!(
    new Response(
      JSON.stringify({ models: [{ name: "qwen2.5:7b" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  );

  const available = await checkPromise;
  assert.equal(available, false, "Late response returns false after stop()");

  const state = service.getReadiness();
  assert.equal(state.isReady, false);
  assert.equal(state.statusLabel, "Local AI Unavailable");
  assert.equal(state.detail, "Readiness service stopped");
  assert.equal(scheduler.pendingCount, 0, "No timer scheduled after stop()");
});
