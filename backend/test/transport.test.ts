import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpOllamaTransport, type OllamaChatMessage } from "../src/transport.js";

test("HttpOllamaTransport sends correct request headers, endpoint, and payload", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined = undefined;

  const fakeFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        message: {
          role: "assistant",
          content: '{"status":"needs_clarification"}',
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const transport = new HttpOllamaTransport({
    endpoint: "http://127.0.0.1:11434/api/chat",
    model: "qwen2.5:7b",
    fetchFn: fakeFetch,
  });

  const messages: OllamaChatMessage[] = [
    { role: "system", content: "sys" },
    { role: "user", content: "usr" },
  ];

  const content = await transport.chat(messages);

  assert.equal(capturedUrl, "http://127.0.0.1:11434/api/chat");
  assert.ok(capturedInit);
  const init = capturedInit as RequestInit;
  assert.equal(init.method, "POST");
  assert.deepEqual(init.headers, { "Content-Type": "application/json" });

  const body = JSON.parse(init.body as string);
  assert.equal(body.model, "qwen2.5:7b");
  assert.equal(body.stream, false);
  assert.deepEqual(body.options, { temperature: 0.1 });
  assert.deepEqual(body.messages, messages);
  assert.equal(body.format.type, "object");
  assert.ok(body.format.properties);
  assert.equal(content, '{"status":"needs_clarification"}');
});

test("HttpOllamaTransport extracts message.content from valid envelope", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        model: "qwen2.5:7b",
        message: {
          role: "assistant",
          content: "extracted content text",
        },
      }),
      { status: 200 }
    );

  const transport = new HttpOllamaTransport({ fetchFn: fakeFetch });
  const result = await transport.chat([{ role: "user", content: "hello" }]);
  assert.equal(result, "extracted content text");
});

test("HttpOllamaTransport rejects malformed envelope missing message or content", async () => {
  const noMessageFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ other: 123 }), { status: 200 });

  const transport1 = new HttpOllamaTransport({ fetchFn: noMessageFetch });
  await assert.rejects(
    () => transport1.chat([{ role: "user", content: "hi" }]),
    /Malformed Ollama envelope/
  );

  const noContentFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ message: { role: "assistant" } }), { status: 200 });

  const transport2 = new HttpOllamaTransport({ fetchFn: noContentFetch });
  await assert.rejects(
    () => transport2.chat([{ role: "user", content: "hi" }]),
    /Malformed Ollama envelope/
  );
});

test("HttpOllamaTransport rejects invalid non-JSON HTTP response body", async () => {
  const invalidJsonFetch: typeof fetch = async () =>
    new Response("not a json string", { status: 200 });

  const transport = new HttpOllamaTransport({ fetchFn: invalidJsonFetch });
  await assert.rejects(
    () => transport.chat([{ role: "user", content: "hi" }]),
    /Failed to parse Ollama response as JSON/
  );
});

test("HttpOllamaTransport handles non-200 HTTP error responses", async () => {
  const serverErrorFetch: typeof fetch = async () =>
    new Response("Internal Server Error", { status: 500, statusText: "Server Error" });

  const transport = new HttpOllamaTransport({ fetchFn: serverErrorFetch });
  await assert.rejects(
    () => transport.chat([{ role: "user", content: "hi" }]),
    /Ollama HTTP error 500 Server Error: Internal Server Error/
  );

  const notFoundFetch: typeof fetch = async () =>
    new Response("Model not found", { status: 404, statusText: "Not Found" });

  const transport2 = new HttpOllamaTransport({ fetchFn: notFoundFetch });
  await assert.rejects(
    () => transport2.chat([{ role: "user", content: "hi" }]),
    /Ollama HTTP error 404 Not Found: Model not found/
  );
});

test("HttpOllamaTransport propagates network connection failures", async () => {
  const failingFetch: typeof fetch = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
  };

  const transport = new HttpOllamaTransport({ fetchFn: failingFetch });
  await assert.rejects(
    () => transport.chat([{ role: "user", content: "hi" }]),
    /ECONNREFUSED/
  );
});

test("HttpOllamaTransport handles request timeout without real clock waiting", async () => {
  const timeoutFetch: typeof fetch = async (_input, init) => {
    // Simulate immediate abort via signal without delay
    const signal = init?.signal;
    if (signal) {
      const timeoutError = new Error("The operation was aborted due to timeout");
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    return new Response(JSON.stringify({ message: { content: "{}" } }));
  };

  const transport = new HttpOllamaTransport({
    timeoutMs: 100,
    fetchFn: timeoutFetch,
  });

  await assert.rejects(
    () => transport.chat([{ role: "user", content: "hi" }]),
    /Ollama request timed out after 100ms/
  );
});
