import assert from "node:assert/strict";
import { streamGenerateApp } from "../src/lib/sseClient.ts";

console.log("=== Running Frontend SSE Client Tests ===");

async function runTests() {
  // Test 1: Full Stream Parsing & Event Dispatch
  console.log("\n1. Testing Frontend SSE Stream Parsing & Callbacks...");
  {
    const ssePayloadChunks = [
      'event: start\ndata: {"prompt":"Create dashboard","model":"gemini-2.0-flash","timestamp":1000}\n\n',
      'event: token\ndata: {"chunk":"<<<FILE:index.html>>>"}\n\n',
      'event: file_start\ndata: {"filename":"index.html"}\n\n',
      'event: file_content\ndata: {"filename":"index.html","chunk":"<h1>Dashboard</h1>"}\n\n',
      'event: file_end\ndata: {"filename":"index.html","fullContent":"<h1>Dashboard</h1>"}\n\n',
      'event: done\ndata: {"conversationText":"","files":{"index.html":"<h1>Dashboard</h1>"},"stats":{"durationMs":50,"tokenCount":10,"filesCount":1}}\n\n',
    ];

    // Mock fetch returning readable stream
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of ssePayloadChunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    };

    const eventsReceived = [];
    const controller = streamGenerateApp({
      prompt: "Create dashboard",
      baseUrl: "http://mock-functions.local/streamGenerate",
      getIdToken: async () => "mock-id-token-xyz",
      callbacks: {
        onStart: (data) => eventsReceived.push({ type: "start", data }),
        onToken: (data) => eventsReceived.push({ type: "token", data }),
        onFileStart: (data) => eventsReceived.push({ type: "file_start", data }),
        onFileContent: (data) => eventsReceived.push({ type: "file_content", data }),
        onFileEnd: (data) => eventsReceived.push({ type: "file_end", data }),
        onDone: (data) => eventsReceived.push({ type: "done", data }),
      },
    });

    const result = await controller.promise;
    globalThis.fetch = originalFetch;

    assert.equal(eventsReceived.length, 6);
    assert.equal(eventsReceived[0].type, "start");
    assert.equal(eventsReceived[1].type, "token");
    assert.equal(eventsReceived[2].type, "file_start");
    assert.equal(eventsReceived[3].type, "file_content");
    assert.equal(eventsReceived[4].type, "file_end");
    assert.equal(eventsReceived[5].type, "done");
    assert.equal(result.files["index.html"], "<h1>Dashboard</h1>");

    console.log("   ✓ Frontend SSE client accurately processed all event types");
  }

  // Test 2: Fragmented Chunk Boundary Assembly across TCP Frames
  console.log("\n2. Testing Fragmented Packet Boundary Buffering...");
  {
    // Split frame across 3 fragmented network packets
    const packet1 = 'event: to';
    const packet2 = 'ken\ndata: {"ch';
    const packet3 = 'unk":"Hello World"}\n\nevent: done\ndata: {"conversationText":"","files":{},"stats":{"durationMs":10,"tokenCount":1,"filesCount":0}}\n\n';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(packet1));
          await new Promise((r) => setTimeout(r, 10));
          controller.enqueue(encoder.encode(packet2));
          await new Promise((r) => setTimeout(r, 10));
          controller.enqueue(encoder.encode(packet3));
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    };

    let receivedTokenChunk = "";
    const controller = streamGenerateApp({
      prompt: "test fragmentation",
      baseUrl: "http://mock-functions.local/streamGenerate",
      getIdToken: async () => "mock-token",
      callbacks: {
        onToken: (t) => {
          receivedTokenChunk += t.chunk;
        },
      },
    });

    await controller.promise;
    globalThis.fetch = originalFetch;

    assert.equal(receivedTokenChunk, "Hello World");
    console.log("   ✓ SSE buffer successfully reassembled cross-packet frames");
  }

  // Test 3: Mid-stream Abort Cancellation
  console.log("\n3. Testing Mid-stream Abort Cancellation...");
  {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      if (init?.signal?.aborted) {
        const err = new Error("This operation was aborted");
        err.name = "AbortError";
        throw err;
      }
      const stream = new ReadableStream({
        start(controller) {
          if (init?.signal?.aborted) {
            controller.error(new Error("AbortError"));
            return;
          }
          init?.signal?.addEventListener("abort", () => {
            controller.error(new Error("AbortError"));
          });
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('event: token\ndata: {"chunk":"start..."}\n\n'));
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    };

    let errorEvent = null;
    const controller = streamGenerateApp({
      prompt: "abort test",
      baseUrl: "http://mock-functions.local/streamGenerate",
      getIdToken: async () => "mock-token",
      callbacks: {
        onError: (err) => {
          errorEvent = err;
        },
      },
    });

    // Cancel stream immediately
    controller.abort();

    try {
      await controller.promise;
    } catch {
      // Expected to reject on abort
    }

    globalThis.fetch = originalFetch;

    assert.ok(errorEvent, "Error event should be emitted on cancellation");
    assert.equal(errorEvent.code, "REQUEST_ABORTED");
    console.log("   ✓ Client abort controller cancelled stream cleanly");
  }

  // Test 4: HTTP Error Response Handling
  console.log("\n4. Testing HTTP Error Handling...");
  {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    };

    let errorEvent = null;
    const controller = streamGenerateApp({
      prompt: "error test",
      baseUrl: "http://mock-functions.local/streamGenerate",
      getIdToken: async () => "invalid-token",
      callbacks: {
        onError: (err) => {
          errorEvent = err;
        },
      },
    });

    try {
      await controller.promise;
      assert.fail("Should have thrown error on 401 response");
    } catch (err) {
      assert.ok(err.message.includes("Unauthorized"));
    }

    globalThis.fetch = originalFetch;

    assert.ok(errorEvent);
    assert.equal(errorEvent.code, "HTTP_401");
    assert.ok(errorEvent.message.includes("Unauthorized"));
    console.log("   ✓ HTTP status codes properly mapped to error events");
  }

  console.log("\n✅ All Frontend SSE Client Tests Passed Successfully!\n");
}

runTests().catch((err) => {
  console.error("❌ Frontend SSE Client Tests Failed:", err);
  process.exit(1);
});
