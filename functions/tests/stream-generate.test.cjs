const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  sendSSE,
  runStreamGeneration,
  handleStreamGenerate,
  streamGenerate,
} = require("../lib/routes/streamGenerate.js");
const llmService = require("../lib/services/llmService.js");

console.log("=== Running Task 07: SSE Streaming Endpoint & Event Protocol Tests ===");

// Mock Response helper for testing SSE writes
class MockResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.written = [];
    this.flushed = false;
    this.writableEnded = false;
    this.destroyed = false;
    this.jsonData = null;
  }

  writeHead(status, headers) {
    this.statusCode = status;
    Object.assign(this.headers, headers);
    return this;
  }

  setHeader(key, value) {
    this.headers[key.toLowerCase()] = value;
    this.headers[key] = value;
    return this;
  }

  getHeader(key) {
    return this.headers[key.toLowerCase()] || this.headers[key];
  }

  get(name) {
    return this.getHeader(name);
  }

  set(key, value) {
    return this.setHeader(key, value);
  }

  flushHeaders() {
    this.flushed = true;
  }

  flush() {
    this.flushed = true;
  }

  write(chunk) {
    if (this.writableEnded || this.destroyed) {
      throw new Error("Cannot write to ended response");
    }
    this.written.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }

  json(data) {
    this.jsonData = data;
    this.end();
    return this;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  end() {
    this.writableEnded = true;
    this.emit("finish");
    return this;
  }
}

// Mock Request helper
class MockRequest extends EventEmitter {
  constructor({ method = "POST", headers = {}, body = {}, query = {} } = {}) {
    super();
    this.method = method;
    this.headers = headers;
    this.body = body;
    this.query = query;
  }
}

async function runTests() {
  // Test 1: SSE Event Formatter & Guarding
  console.log("\n1. Testing sendSSE Event Formatting & Socket Guards...");
  {
    const res = new MockResponse();
    sendSSE(res, "test_event", { message: "hello world", count: 42 });

    assert.equal(res.written.length, 1);
    const frame = res.written[0];
    assert.ok(frame.includes("event: test_event\n"), "Must contain event name line");
    assert.ok(frame.includes('data: {"message":"hello world","count":42}\n\n'), "Must contain serialized data line with double newline");

    // Guard against writing to ended response
    res.writableEnded = true;
    sendSSE(res, "after_end", { foo: "bar" });
    assert.equal(res.written.length, 1, "Should not write to ended response");

    console.log("   ✓ sendSSE correctly formats SSE frames and respects socket boundaries");
  }

  // Test 2: Full Streaming Event Sequence (start -> token -> file_* -> done)
  console.log("\n2. Testing runStreamGeneration Event Protocol Sequence...");
  {
    // Mock sample chunks returned by the LLM
    const mockChunks = [
      { choices: [{ delta: { content: "Here is your app:\n<<<FILE:index.html>>>\n" } }] },
      { choices: [{ delta: { content: "<!DOCTYPE html>\n<html>\n" } }] },
      { choices: [{ delta: { content: "<body><h1>CRM</h1></body>\n</html>\n<<</FILE>>>\n" } }] },
      { choices: [{ delta: { content: "<<<FILE:style.css>>>\nbody { color: blue; }\n<<</FILE>>>\n" } }] },
      { choices: [{ delta: { content: "<<<FILE:app.js>>>\nconsole.log('crm loaded');\n<<</FILE>>>" } }] },
    ];

    // Temporarily replace streamChatCompletion with our mock
    const originalStreamChat = llmService.streamChatCompletion;
    llmService.streamChatCompletion = async function mockStream() {
      async function* generate() {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      }
      return generate();
    };

    const recordedEvents = [];
    const result = await runStreamGeneration({
      userId: "test-user-123",
      prompt: "Build a HighLevel CRM dashboard",
      byok: {
        apiKey: "mock-key",
        model: "mock-model",
      },
      onEvent: (event, data) => {
        recordedEvents.push({ event, data });
      },
    });

    // Restore original function
    llmService.streamChatCompletion = originalStreamChat;

    // Verify event sequence
    const eventNames = recordedEvents.map((e) => e.event);
    assert.ok(eventNames.includes("start"), "Must emit start event");
    assert.ok(eventNames.includes("token"), "Must emit raw token events");
    assert.ok(eventNames.includes("file_start"), "Must emit file_start event");
    assert.ok(eventNames.includes("file_content"), "Must emit file_content event");
    assert.ok(eventNames.includes("file_end"), "Must emit file_end event");
    assert.ok(eventNames.includes("done"), "Must emit done event");

    // Verify files extracted
    assert.ok(result.files["index.html"], "Must contain index.html");
    assert.ok(result.files["style.css"], "Must contain style.css");
    assert.ok(result.files["app.js"], "Must contain app.js");
    assert.ok(result.files["index.html"].includes("<h1>CRM</h1>"));
    assert.ok(result.files["style.css"].includes("color: blue;"));
    assert.ok(result.files["app.js"].includes("console.log('crm loaded');"));

    // Verify done payload stats
    const doneEvent = recordedEvents.find((e) => e.event === "done");
    assert.ok(doneEvent, "Done event must exist");
    assert.equal(doneEvent.data.stats.filesCount, 3);
    assert.ok(doneEvent.data.stats.tokenCount > 0);

    console.log("   ✓ Full streaming protocol successfully decoded and verified");
  }

  // Test 3: Iterative Refinement Handling
  console.log("\n3. Testing Iterative Refinement Streaming...");
  {
    const existingFiles = {
      "index.html": "<html><body>Old Content</body></html>",
      "style.css": "body { color: red; }",
      "app.js": "console.log('old');",
    };

    const mockChunks = [
      { choices: [{ delta: { content: "<<<FILE:index.html>>>\n<html><body>Updated Content</body></html>\n<<</FILE>>>\n" } }] },
      { choices: [{ delta: { content: "<<<FILE:style.css>>>\nbody { color: green; }\n<<</FILE>>>\n" } }] },
      { choices: [{ delta: { content: "<<<FILE:app.js>>>\nconsole.log('updated');\n<<</FILE>>>" } }] },
    ];

    const originalStreamChat = llmService.streamChatCompletion;
    let capturedMessages = null;

    llmService.streamChatCompletion = async function mockStream(options) {
      capturedMessages = options.messages;
      async function* generate() {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      }
      return generate();
    };

    const recordedEvents = [];
    const result = await runStreamGeneration({
      userId: "test-user-123",
      prompt: "Change theme to green and update header",
      existingFiles,
      byok: { apiKey: "mock-key" },
      onEvent: (event, data) => {
        recordedEvents.push({ event, data });
      },
    });

    llmService.streamChatCompletion = originalStreamChat;

    // Verify prompt contains previous files
    assert.ok(capturedMessages, "Options messages must have been captured");
    const userPromptContent = capturedMessages.find((m) => m.role === "user").content;
    assert.ok(userPromptContent.includes("<<<CURRENT_FILE:index.html>>>"), "Refinement prompt must inject existing index.html");
    assert.ok(userPromptContent.includes("Old Content"), "Refinement prompt must include previous content");
    assert.ok(userPromptContent.includes("Change theme to green"), "Refinement prompt must include modification request");

    // Verify updated files output
    assert.ok(result.files["index.html"].includes("Updated Content"));
    assert.ok(result.files["style.css"].includes("color: green;"));

    console.log("   ✓ Iterative refinement prompt injection and file regeneration verified");
  }

  // Test 4: AbortController Mid-Stream Cancellation
  console.log("\n4. Testing Mid-Stream Cancellation via AbortController...");
  {
    const abortController = new AbortController();
    let streamChunksProduced = 0;

    const originalStreamChat = llmService.streamChatCompletion;
    llmService.streamChatCompletion = async function mockStream(options) {
      async function* generate() {
        yield { choices: [{ delta: { content: "<<<FILE:index.html>>>\n<html><body>" } }] };
        streamChunksProduced++;

        // Simulate client aborting after first chunk
        abortController.abort();

        if (options.signal?.aborted) {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          throw err;
        }

        yield { choices: [{ delta: { content: "Unreachable chunk</body></html><<</FILE>>>" } }] };
        streamChunksProduced++;
      }
      return generate();
    };

    const recordedEvents = [];
    const result = await runStreamGeneration({
      userId: "test-user-123",
      prompt: "Large app that will be cancelled",
      byok: { apiKey: "mock-key" },
      signal: abortController.signal,
      onEvent: (event, data) => {
        recordedEvents.push({ event, data });
      },
    });

    llmService.streamChatCompletion = originalStreamChat;

    assert.equal(streamChunksProduced, 1, "Only 1 chunk should have been processed before abort");
    // Should NOT emit "error" on clean client cancellation
    const errorEvent = recordedEvents.find((e) => e.event === "error");
    assert.equal(errorEvent, undefined, "Clean abort must not emit error event");

    console.log("   ✓ Client mid-stream abort halted LLM consumption cleanly");
  }

  // Test 5: Error Event Protocol & Upstream Failure Normalization
  console.log("\n5. Testing Error Normalization & SSE Error Event Emission...");
  {
    const originalStreamChat = llmService.streamChatCompletion;
    llmService.streamChatCompletion = async function mockStream() {
      const err = new Error("Rate limit exceeded");
      err.status = 429;
      throw err;
    };

    const recordedEvents = [];
    let thrownError = null;

    try {
      await runStreamGeneration({
        userId: "test-user-123",
        prompt: "Will trigger 429",
        byok: { apiKey: "mock-key" },
        onEvent: (event, data) => {
          recordedEvents.push({ event, data });
        },
      });
    } catch (err) {
      thrownError = err;
    }

    llmService.streamChatCompletion = originalStreamChat;

    assert.ok(thrownError, "Should throw normalized error");
    const errorEvent = recordedEvents.find((e) => e.event === "error");
    assert.ok(errorEvent, "Must emit SSE error event");
    assert.equal(errorEvent.data.code, "RATE_LIMIT_EXCEEDED");
    assert.ok(errorEvent.data.message.includes("quota exceeded"));

    console.log("   ✓ Upstream provider failures correctly mapped to SSE error event");
  }

  // Test 6: HTTP /streamGenerate Endpoint Auth & Method Validation
  console.log("\n6. Testing /streamGenerate HTTP Transport & Security...");
  {
    // Test 6a: Reject non-POST methods
    const getReq = new MockRequest({ method: "GET" });
    const getRes = new MockResponse();
    await handleStreamGenerate(getReq, getRes);
    assert.equal(getRes.statusCode, 405);
    assert.ok(getRes.jsonData.error.includes("Method not allowed"));

    // Test 6b: Reject unauthenticated requests
    process.env.FUNCTIONS_EMULATOR = "false";
    delete process.env.NODE_ENV;
    const unauthReq = new MockRequest({ method: "POST", body: { prompt: "test" } });
    const unauthRes = new MockResponse();
    await handleStreamGenerate(unauthReq, unauthRes);
    assert.equal(unauthRes.statusCode, 401);
    assert.ok(unauthRes.jsonData.error.includes("Unauthorized"));

    // Test 6c: Reject empty prompt
    process.env.NODE_ENV = "test";
    const emptyPromptReq = new MockRequest({
      method: "POST",
      body: { prompt: "", userId: "valid-user" },
    });
    const emptyPromptRes = new MockResponse();
    await handleStreamGenerate(emptyPromptReq, emptyPromptRes);
    assert.equal(emptyPromptRes.statusCode, 400);
    assert.ok(emptyPromptRes.jsonData.error.includes("prompt is required"));

    // Test 6d: Proper SSE headers established for valid authenticated request
    const originalStreamChat = llmService.streamChatCompletion;
    llmService.streamChatCompletion = async function mockStream() {
      async function* generate() {
        yield { choices: [{ delta: { content: "<<<FILE:index.html>>>\n<h1>Hello</h1>\n<<</FILE>>>" } }] };
      }
      return generate();
    };

    const validReq = new MockRequest({
      method: "POST",
      body: { prompt: "Build test app", userId: "test-user-id", byok: { apiKey: "test-key" } },
    });
    const validRes = new MockResponse();

    await handleStreamGenerate(validReq, validRes);

    llmService.streamChatCompletion = originalStreamChat;

    assert.equal(validRes.statusCode, 200);
    assert.equal(validRes.headers["Content-Type"], "text/event-stream; charset=utf-8");
    assert.equal(validRes.headers["Cache-Control"], "no-cache, no-transform");
    assert.equal(validRes.headers["Connection"], "keep-alive");
    assert.ok(validRes.writableEnded, "Response must be cleanly ended");
    assert.ok(validRes.written.some((w) => w.includes("event: start")), "Must write start event");
    assert.ok(validRes.written.some((w) => w.includes("event: done")), "Must write done event");

    console.log("   ✓ HTTP /streamGenerate security, headers, and lifecycle verified");
  }

  console.log("\n✅ All Task 07 SSE Streaming Endpoint & Event Protocol Tests Passed Successfully!\n");
}

runTests().catch((err) => {
  console.error("❌ Test Suite Failed:", err);
  process.exit(1);
});
