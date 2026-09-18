import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import {
  useWorkspaceStore,
  DEFAULT_REFINEMENT_SUGGESTIONS,
} from "../src/stores/workspace.ts";

console.log("=== Running Task 10 Chat Interface & Generation Controls Tests ===");

async function runTests() {
  // Test Suite 1: Initial Chat State & Refinement Suggestions
  console.log("\n1. Testing Initial Chat State & Defaults...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    assert.deepEqual(store.messages, []);
    assert.equal(store.isStreaming, false);
    assert.equal(store.activeStreamController, null);
    assert.equal(store.activeStreamingMessageId, null);
    assert.deepEqual(store.refinementSuggestions, DEFAULT_REFINEMENT_SUGGESTIONS);

    console.log("   ✓ Initial chat state and default refinement suggestions properly initialized");
  }

  // Test Suite 2: Chat Message Operations (addMessage, clearChat)
  console.log("\n2. Testing Chat Message Operations (addMessage, clearChat)...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    const userMsg = store.addMessage({
      role: "user",
      content: "Build a lead intake form",
    });

    assert.equal(store.messages.length, 1);
    assert.equal(store.messages[0].role, "user");
    assert.equal(store.messages[0].content, "Build a lead intake form");
    assert.equal(store.messages[0].status, "complete");
    assert.ok(store.messages[0].timestamp > 0);

    const asstMsg = store.addMessage({
      role: "assistant",
      content: "Here is your app",
      filesModified: ["index.html", "app.js"],
      stats: { durationMs: 1200, tokenCount: 450, filesCount: 2 },
    });

    assert.equal(store.messages.length, 2);
    assert.deepEqual(store.messages[1].filesModified, ["index.html", "app.js"]);
    assert.equal(store.messages[1].stats?.tokenCount, 450);

    // Test clearChat
    store.clearChat();
    assert.equal(store.messages.length, 0);
    assert.equal(store.activeStreamingMessageId, null);
    assert.deepEqual(store.refinementSuggestions, DEFAULT_REFINEMENT_SUGGESTIONS);

    console.log("   ✓ addMessage and clearChat function correctly");
  }

  // Test Suite 3: Mutex & Input Validation in generateApp
  console.log("\n3. Testing generateApp Guards (Mutex & Validation)...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    // Empty prompt returns null and creates no messages
    const emptyResult = store.generateApp("   ");
    assert.equal(emptyResult, null);
    assert.equal(store.messages.length, 0);

    // Streaming mutex guard
    store.setStreamingState(true, "index.html");
    const mutexResult = store.generateApp("Some prompt");
    assert.equal(mutexResult, null);
    assert.equal(store.messages.length, 0);

    // Release streaming lock
    store.setStreamingState(false, null);

    console.log("   ✓ Mutex and empty prompt guards operate reliably");
  }

  // Test Suite 4: End-to-End Generation & SSE Event Handling
  console.log("\n4. Testing Full Generation Lifecycle & SSE Event Handling...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    let capturedOptions = null;
    let abortCalled = false;

    const mockStreamClient = (options) => {
      capturedOptions = options;

      const promise = (async () => {
        // 1. Simulate onStart
        options.callbacks.onStart?.({
          prompt: options.prompt,
          model: "mock-gemini",
          timestamp: Date.now(),
        });

        // 2. Simulate onToken (conversational preamble)
        options.callbacks.onToken?.({ chunk: "I am generating " });
        options.callbacks.onToken?.({ chunk: "your HighLevel contact app." });

        // 3. Simulate file_start for index.html
        options.callbacks.onFileStart?.({ filename: "index.html" });

        // 4. Simulate file_content
        options.callbacks.onFileContent?.({ filename: "index.html", chunk: "<!DOCTYPE html><html>" });
        options.callbacks.onFileContent?.({ filename: "index.html", chunk: "<body><h1>CRM</h1></body></html>" });

        // 5. Simulate file_end
        options.callbacks.onFileEnd?.({
          filename: "index.html",
          fullContent: "<!DOCTYPE html><html><body><h1>CRM</h1></body></html>",
        });

        // 6. Simulate file_start for contact-form.js
        options.callbacks.onFileStart?.({ filename: "contact-form.js" });
        options.callbacks.onFileContent?.({ filename: "contact-form.js", chunk: "console.log('contact form');" });
        options.callbacks.onFileEnd?.({
          filename: "contact-form.js",
          fullContent: "console.log('contact form');",
        });

        // 7. Simulate done
        const doneEvt = {
          conversationText: "I am generating your HighLevel contact app.",
          files: {
            "index.html": "<!DOCTYPE html><html><body><h1>CRM</h1></body></html>",
            "contact-form.js": "console.log('contact form');",
          },
          stats: {
            durationMs: 850,
            tokenCount: 320,
            filesCount: 2,
          },
        };
        options.callbacks.onDone?.(doneEvt);
        return doneEvt;
      })();

      return {
        abort: () => {
          abortCalled = true;
        },
        promise,
      };
    };

    const controller = store.generateApp("Create contact management app", {
      streamClientFn: mockStreamClient,
    });

    assert.ok(controller, "generateApp should return a StreamController");
    assert.equal(store.messages.length, 2);
    assert.equal(store.messages[0].role, "user");
    assert.equal(store.messages[0].content, "Create contact management app");

    const asstMsg = store.messages[1];
    assert.equal(asstMsg.role, "assistant");

    // Wait for the mock stream to complete
    await controller.promise;

    // Verify final state
    assert.equal(asstMsg.status, "complete");
    assert.equal(asstMsg.content, "I am generating your HighLevel contact app.");
    assert.deepEqual(asstMsg.filesModified, ["index.html", "contact-form.js"]);
    assert.equal(asstMsg.stats?.tokenCount, 320);
    assert.equal(asstMsg.stats?.filesCount, 2);

    // Verify files in workspaceStore
    assert.equal(store.files["index.html"], "<!DOCTYPE html><html><body><h1>CRM</h1></body></html>");
    assert.equal(store.files["contact-form.js"], "console.log('contact form');");
    assert.ok(store.openFiles.includes("contact-form.js"));

    // Verify editor unlocked
    assert.equal(store.isStreaming, false);
    assert.equal(store.activeStreamController, null);

    // Verify refinement suggestions tailored to contact keywords
    assert.ok(
      store.refinementSuggestions.some((s) => s.toLowerCase().includes("contact") || s.toLowerCase().includes("csv")),
      "Refinement suggestions should adapt to contact prompt"
    );

    console.log("   ✓ Full streaming lifecycle, token updates, file updates, and refinement tailoring passed");
  }

  // Test Suite 5: Mid-Stream Abort & Cancellation
  console.log("\n5. Testing Mid-Stream Abort / Cancellation...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    let abortInvoked = false;

    const mockAbortingStream = (options) => {
      let aborted = false;

      const promise = new Promise((resolve, reject) => {
        options.callbacks.onStart?.({ prompt: options.prompt, model: "mock", timestamp: Date.now() });
        options.callbacks.onToken?.({ chunk: "Partial code..." });
        options.callbacks.onFileStart?.({ filename: "partial.js" });
        options.callbacks.onFileContent?.({ filename: "partial.js", chunk: "const x = 1;" });

        // Simulate abort trigger from user
        const checkInterval = setInterval(() => {
          if (aborted) {
            clearInterval(checkInterval);
            options.callbacks.onError?.({
              code: "REQUEST_ABORTED",
              message: "Generation was cancelled by user.",
            });
            reject(new Error("Generation was cancelled by user."));
          }
        }, 10);
      });

      return {
        abort: () => {
          aborted = true;
          abortInvoked = true;
        },
        promise,
      };
    };

    const controller = store.generateApp("Cancel me midstream", {
      streamClientFn: mockAbortingStream,
    });

    assert.equal(store.isStreaming, true);
    assert.equal(store.messages[1].status, "streaming");

    // User triggers abort
    store.abortCurrentGeneration();

    assert.equal(abortInvoked, true, "controller.abort() should have been called");
    assert.equal(store.isStreaming, false, "Streaming state should reset to false");
    assert.equal(store.activeStreamController, null);
    assert.equal(store.messages[1].status, "aborted");
    assert.ok(store.files["partial.js"].includes("const x = 1;"), "Partial files should be preserved");

    // Await aborted controller promise
    await controller.promise.catch(() => {});

    console.log("   ✓ Mid-stream abort cleanly terminates generation and preserves state");
  }

  // Test Suite 6: Stream Error Handling
  console.log("\n6. Testing Stream Error Handling...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    const mockFailingStream = (options) => {
      const promise = (async () => {
        options.callbacks.onError?.({
          code: "QUOTA_EXCEEDED",
          message: "Rate limit reached. Please check your API quota.",
        });
        throw new Error("Rate limit reached. Please check your API quota.");
      })();

      return {
        abort: () => {},
        promise,
      };
    };

    const controller = store.generateApp("Cause error", {
      streamClientFn: mockFailingStream,
    });

    try {
      await controller.promise;
    } catch {
      // Expected rejection
    }

    assert.equal(store.isStreaming, false);
    assert.equal(store.messages[1].status, "error");
    assert.equal(store.messages[1].error, "Rate limit reached. Please check your API quota.");

    console.log("   ✓ Stream errors handled gracefully without corrupting store");
  }

  // Test Suite 7: Multi-Turn Conversation History Retention
  console.log("\n7. Testing Multi-Turn Conversation History Retention...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    let passedHistory = [];

    const mockEchoStream = (options) => {
      passedHistory = options.conversationHistory || [];

      const promise = (async () => {
        options.callbacks.onDone?.({
          conversationText: "Turn response",
          files: {},
          stats: { durationMs: 100, tokenCount: 50, filesCount: 0 },
        });
        return { conversationText: "Turn response", files: {}, stats: { durationMs: 100, tokenCount: 50, filesCount: 0 } };
      })();

      return {
        abort: () => {},
        promise,
      };
    };

    // Turn 1
    const turn1 = store.generateApp("First prompt: Build intake form", {
      streamClientFn: mockEchoStream,
    });
    await turn1.promise;

    // In Turn 1, history passed to stream should have 0 prior turns
    assert.equal(passedHistory.length, 0);

    // Turn 2
    const turn2 = store.generateApp("Second prompt: Add search bar", {
      streamClientFn: mockEchoStream,
    });
    await turn2.promise;

    // In Turn 2, history should contain user + assistant from Turn 1
    assert.equal(passedHistory.length, 2);
    assert.equal(passedHistory[0].role, "user");
    assert.equal(passedHistory[0].content, "First prompt: Build intake form");
    assert.equal(passedHistory[1].role, "assistant");
    assert.equal(passedHistory[1].content, "Turn response");

    console.log("   ✓ Multi-turn conversation history accurately compiled and forwarded");
  }

  console.log("\n=======================================================");
  console.log("🎉 ALL TASK 10 CHAT INTERFACE & GENERATION CONTROLS TESTS PASSED!");
  console.log("=======================================================\n");
}

runTests().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
