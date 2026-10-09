import { type Server } from "node:http";
import { FeedbackResultSchema, ModelResponseSchema } from "shared";
import { createApp } from "../src/server.js";
import { FeedbackPipeline } from "../src/pipeline.js";
import { HttpOllamaTransport } from "../src/transport.js";
import { ObservableTransport } from "../src/eval/observable-transport.js";

async function runF4SmokeTest(): Promise<void> {
  const model = process.env.OLLAMA_MODEL ?? "llama3.2:latest";
  const endpoint = process.env.OLLAMA_ENDPOINT ?? "http://127.0.0.1:11434/api/chat";
  const timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT_MS ?? "15000", 10);
  const runMode = timeoutMs > 15000 ? "diagnostic" : "production";

  console.log(`=== F4 Live Smoke Test ===`);
  console.log(`Execution mode: ${runMode}`);
  console.log(`Target model: ${model}`);
  console.log(`Ollama endpoint: ${endpoint}`);
  console.log(`Timeout: ${timeoutMs}ms${timeoutMs > 15000 ? " (diagnostic run: exceeds production 15000ms standard)" : ""}`);

  const innerTransport = new HttpOllamaTransport({
    endpoint,
    model,
    timeoutMs,
  });
  const observableTransport = new ObservableTransport(innerTransport);
  const pipeline = new FeedbackPipeline(observableTransport);
  const app = createApp(pipeline);

  // Start server on an ephemeral port
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to obtain server port");
  }

  const serverUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Ephemeral server listening at ${serverUrl}`);

  try {
    // 1. Validation test: Missing fields -> HTTP 400
    console.log("\n[1/3] Testing HTTP 400 on missing fields...");
    const badRes = await fetch(`${serverUrl}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_id: "q1" }),
    });
    if (badRes.status !== 400) {
      throw new Error(`Expected 400 for missing fields, got ${badRes.status}`);
    }
    console.log("  ✓ Correctly rejected with HTTP 400");

    // 2. Validation test: Unknown question -> HTTP 404
    console.log("\n[2/3] Testing HTTP 404 on unknown question...");
    const notFoundRes = await fetch(`${serverUrl}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: "q_nonexistent",
        student_choice_id: "A",
        student_reasoning: "Reasoning here",
      }),
    });
    if (notFoundRes.status !== 404) {
      throw new Error(`Expected 404 for unknown question, got ${notFoundRes.status}`);
    }
    console.log("  ✓ Correctly rejected with HTTP 404");

    // 3. Live model test: Use documented reviewed case T01 (Q1, Choice A, reviewed wording)
    console.log(`\n[3/3] Testing live model request with documented reviewed case T01...`);
    const reviewedPayload = {
      question_id: "q1",
      student_choice_id: "A",
      student_reasoning:
        "They observed water and made a conclusion. Any conclusion from an observation is induction.",
    };
    console.log("  Actual Request Payload:", JSON.stringify(reviewedPayload, null, 2));

    const startTime = performance.now();
    const liveRes = await fetch(`${serverUrl}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reviewedPayload),
    });

    const elapsedMs = Math.round(performance.now() - startTime);

    if (liveRes.status !== 200) {
      const errBody = await liveRes.text();
      throw new Error(`Expected 200 from live pipeline, got ${liveRes.status}: ${errBody}`);
    }

    const json = (await liveRes.json()) as Record<string, unknown>;
    console.log(`  ✓ Received HTTP 200 in ${elapsedMs}ms`);

    // Verify ObservableTransport captured the raw model response
    if (observableTransport.attempts.length === 0) {
      throw new Error("No model call recorded by ObservableTransport");
    }
    const rawAttempt1 = observableTransport.attempts[0]?.rawResponse;
    if (!rawAttempt1) {
      throw new Error("Attempt 1 had no rawResponse recorded");
    }
    console.log("  Raw Model Output (First Attempt):", rawAttempt1);

    // Validate ModelResponseSchema on raw model response
    const parsedModelJson = JSON.parse(rawAttempt1);
    const modelSchemaCheck = ModelResponseSchema.safeParse(parsedModelJson);
    if (!modelSchemaCheck.success) {
      throw new Error(
        `Raw model output failed ModelResponseSchema: ${JSON.stringify(modelSchemaCheck.error.format())}`
      );
    }
    console.log(`  ✓ Raw model output satisfies ModelResponseSchema (status: '${modelSchemaCheck.data.status}')`);

    // Validate FeedbackResultSchema on API response
    const apiSchemaCheck = FeedbackResultSchema.safeParse(json);
    if (!apiSchemaCheck.success) {
      throw new Error(
        `API response failed FeedbackResultSchema: ${JSON.stringify(apiSchemaCheck.error.format())}`
      );
    }

    // Fail fallback-only outcomes!
    if (apiSchemaCheck.data.kind === "fallback") {
      throw new Error(
        "Smoke test FAILED: Live model request resulted in fallback instead of live model diagnosis/clarification!"
      );
    }

    console.log(`  ✓ API response correctly converted to FeedbackResult (kind: '${apiSchemaCheck.data.kind}')`);
    console.log("  API Response Body:", JSON.stringify(apiSchemaCheck.data, null, 2));

    console.log(`\n=== F4 Live Smoke Test PASSED ===\n`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

runF4SmokeTest().catch((err) => {
  console.error("F4 Smoke Test FAILED:", err);
  process.exit(1);
});
