import test from "node:test";
import assert from "node:assert/strict";
import { HttpFeedbackApiClient } from "../src/api/client.ts";
import type { FeedbackResult } from "shared";

test("HttpFeedbackApiClient sends POST with JSON header and exact request body", async () => {
  let capturedUrl: string | undefined;
  let capturedMethod: string | undefined;
  let capturedHeaders: HeadersInit | undefined;
  let capturedBody: string | undefined;

  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedMethod = init?.method;
    capturedHeaders = init?.headers;
    capturedBody = init?.body as string;

    const mockResponse: FeedbackResult = {
      kind: "diagnosis",
      possible_misconception: "Confused induction with abduction",
      explanation: "Detailed diagnosis text",
      concept_ids: ["induction", "abduction"],
      follow_up_id: "q1-p",
      confidence: "high",
    };

    return new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const client = new HttpFeedbackApiClient({
    endpointUrl: "/api/test-feedback",
    fetchFn: mockFetch,
  });

  const res = await client.submitFeedback({
    question_id: "q1",
    student_choice_id: "B",
    student_reasoning: "Because I noticed a regular pattern",
  });

  assert.equal(capturedUrl, "/api/test-feedback");
  assert.equal(capturedMethod, "POST");
  assert.deepEqual(capturedHeaders, { "Content-Type": "application/json" });
  assert.deepEqual(JSON.parse(capturedBody!), {
    question_id: "q1",
    student_choice_id: "B",
    student_reasoning: "Because I noticed a regular pattern",
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.kind, "diagnosis");
  }
});

test("HttpFeedbackApiClient parses all three valid FeedbackResult variants", async () => {
  // 1. Diagnosis
  const diagnosisPayload: FeedbackResult = {
    kind: "diagnosis",
    possible_misconception: "Confused induction with abduction",
    explanation: "Diagnosis explanation",
    concept_ids: ["induction", "abduction"],
    follow_up_id: "q1-p",
    confidence: "high",
  };
  const diagClient = new HttpFeedbackApiClient({
    fetchFn: async () =>
      new Response(JSON.stringify(diagnosisPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });
  const diagRes = await diagClient.submitFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "My explanation",
  });
  assert.equal(diagRes.ok, true);
  if (diagRes.ok) {
    assert.equal(diagRes.data.kind, "diagnosis");
    assert.equal(diagRes.data.follow_up_id, "q1-p");
    assert.deepEqual(diagRes.data.concept_ids, ["induction", "abduction"]);
  }

  // 2. Clarification
  const clarificationPayload: FeedbackResult = {
    kind: "clarification",
    clarification_prompt: "Could you elaborate on why you selected choice B?",
  };
  const clarClient = new HttpFeedbackApiClient({
    fetchFn: async () =>
      new Response(JSON.stringify(clarificationPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });
  const clarRes = await clarClient.submitFeedback({
    question_id: "q1",
    student_choice_id: "B",
    student_reasoning: "Too brief",
  });
  assert.equal(clarRes.ok, true);
  if (clarRes.ok) {
    assert.equal(clarRes.data.kind, "clarification");
    assert.equal(
      clarRes.data.clarification_prompt,
      "Could you elaborate on why you selected choice B?"
    );
  }

  // 3. Fallback
  const fallbackPayload: FeedbackResult = {
    kind: "fallback",
    verified_explanation: "Let's review this together with a concrete example.",
    follow_up_id: "q1-p",
  };
  const fbClient = new HttpFeedbackApiClient({
    fetchFn: async () =>
      new Response(JSON.stringify(fallbackPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });
  const fbRes = await fbClient.submitFeedback({
    question_id: "q1",
    student_choice_id: "B",
    student_reasoning: "Guessing completely",
  });
  assert.equal(fbRes.ok, true);
  if (fbRes.ok) {
    assert.equal(fbRes.data.kind, "fallback");
    assert.equal(fbRes.data.verified_explanation, "Let's review this together with a concrete example.");
    assert.equal(fbRes.data.follow_up_id, "q1-p");
  }
});

test("HttpFeedbackApiClient rejects malformed or schema-invalid successful responses without fabricating results", async () => {
  const invalidBodies = [
    {}, // Empty object
    { kind: "unknown_kind" }, // Unknown kind
    { kind: "diagnosis", diagnosis: "Missing concepts and follow up" }, // Missing fields
    { kind: "diagnosis", concept_ids: [], diagnosis: "Empty concepts", follow_up_id: "q1-p" }, // Empty concept_ids violates min(1)
    { kind: "fallback" }, // Missing message and follow_up_id
    { kind: "clarification" }, // Missing clarification_prompt
  ];

  for (const body of invalidBodies) {
    const client = new HttpFeedbackApiClient({
      fetchFn: async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });
    const res = await client.submitFeedback({
      question_id: "q1",
      student_choice_id: "B",
      student_reasoning: "Test reasoning",
    });

    assert.equal(res.ok, false);
    assert.equal("data" in res, false);
    if (!res.ok) {
      assert.ok(res.error.includes("Invalid response format"));
    }
  }

  // Also test non-JSON body on HTTP 200
  const nonJsonClient = new HttpFeedbackApiClient({
    fetchFn: async () =>
      new Response("<html>Not JSON</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
  });
  const nonJsonRes = await nonJsonClient.submitFeedback({
    question_id: "q1",
    student_choice_id: "B",
    student_reasoning: "Test reasoning",
  });
  assert.equal(nonJsonRes.ok, false);
  assert.equal("data" in nonJsonRes, false);
  if (!nonJsonRes.ok) {
    assert.ok(nonJsonRes.error.includes("Malformed JSON"));
  }
});

test("HttpFeedbackApiClient covers HTTP 400, 404, 500, non-JSON error bodies, and network errors without fabricating diagnosis or fallback", async () => {
  // HTTP 400 with JSON error body
  const client400 = new HttpFeedbackApiClient({
    fetchFn: async () =>
      new Response(JSON.stringify({ error: "Missing required student_choice_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
  });
  const res400 = await client400.submitFeedback({
    question_id: "q1",
    student_choice_id: "",
    student_reasoning: "Reasoning",
  });
  assert.equal(res400.ok, false);
  assert.equal("data" in res400, false);
  if (!res400.ok) {
    assert.equal(res400.statusCode, 400);
    assert.equal(res400.error, "Missing required student_choice_id");
  }

  // HTTP 404 with plain text body
  const client404 = new HttpFeedbackApiClient({
    fetchFn: async () =>
      new Response("Not Found", {
        status: 404,
        statusText: "Not Found",
      }),
  });
  const res404 = await client404.submitFeedback({
    question_id: "q99",
    student_choice_id: "A",
    student_reasoning: "Reasoning",
  });
  assert.equal(res404.ok, false);
  assert.equal("data" in res404, false);
  if (!res404.ok) {
    assert.equal(res404.statusCode, 404);
    assert.ok(res404.error.includes("404"));
  }

  // HTTP 500 with HTML error body
  const client500 = new HttpFeedbackApiClient({
    fetchFn: async () =>
      new Response("<html>Server Error</html>", {
        status: 500,
        statusText: "Internal Server Error",
      }),
  });
  const res500 = await client500.submitFeedback({
    question_id: "q1",
    student_choice_id: "B",
    student_reasoning: "Reasoning",
  });
  assert.equal(res500.ok, false);
  assert.equal("data" in res500, false);
  if (!res500.ok) {
    assert.equal(res500.statusCode, 500);
    assert.ok(res500.error.includes("500"));
  }

  // Thrown network error
  const clientNetwork = new HttpFeedbackApiClient({
    fetchFn: async () => {
      throw new TypeError("Failed to fetch");
    },
  });
  const resNetwork = await clientNetwork.submitFeedback({
    question_id: "q1",
    student_choice_id: "B",
    student_reasoning: "Reasoning",
  });
  assert.equal(resNetwork.ok, false);
  assert.equal("data" in resNetwork, false);
  if (!resNetwork.ok) {
    assert.equal(resNetwork.error, "Failed to fetch");
  }
});

test("HttpFeedbackApiClient serializes clarification_attempt_count when provided and omits it when undefined", async () => {
  let capturedBodyWithCount: string | undefined;
  let capturedBodyWithoutCount: string | undefined;

  const mockResponse: FeedbackResult = {
    kind: "clarification",
    clarification_prompt: "Please elaborate.",
  };

  const client = new HttpFeedbackApiClient({
    fetchFn: async (_url, init) => {
      const body = init?.body as string;
      const parsed = JSON.parse(body);
      if ("clarification_attempt_count" in parsed) {
        capturedBodyWithCount = body;
      } else {
        capturedBodyWithoutCount = body;
      }
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  // 1. Without clarification_attempt_count: strictly 3 fields
  await client.submitFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Reasoning text",
  });
  const parsedWithout = JSON.parse(capturedBodyWithoutCount!);
  assert.deepEqual(parsedWithout, {
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Reasoning text",
  });
  assert.equal("clarification_attempt_count" in parsedWithout, false);

  // 2. With clarification_attempt_count: 0
  await client.submitFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Reasoning text",
    clarification_attempt_count: 0,
  });
  const parsedWithZero = JSON.parse(capturedBodyWithCount!);
  assert.deepEqual(parsedWithZero, {
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Reasoning text",
    clarification_attempt_count: 0,
  });

  // 3. With clarification_attempt_count: 1
  await client.submitFeedback({
    question_id: "q1",
    student_choice_id: "A",
    student_reasoning: "Reasoning text",
    clarification_attempt_count: 1,
  });
  const parsedWithOne = JSON.parse(capturedBodyWithCount!);
  assert.equal(parsedWithOne.clarification_attempt_count, 1);
});

