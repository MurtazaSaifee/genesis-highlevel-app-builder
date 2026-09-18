import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import {
  useWorkspaceStore,
  getLanguageByFilename,
  DEFAULT_FILES,
  STARTER_FILES,
} from "../src/stores/workspace.ts";

console.log("=== Running Task 09 Monaco Code Editor & File Tree Tests ===");

async function runTests() {
  // Test Suite 1: Filename Extension to Monaco Language Mapping
  console.log("\n1. Testing Filename to Monaco Language Mapping...");
  {
    assert.equal(getLanguageByFilename("index.html"), "html");
    assert.equal(getLanguageByFilename("preview.htm"), "html");
    assert.equal(getLanguageByFilename("app.js"), "javascript");
    assert.equal(getLanguageByFilename("script.mjs"), "javascript");
    assert.equal(getLanguageByFilename("helper.cjs"), "javascript");
    assert.equal(getLanguageByFilename("types.ts"), "typescript");
    assert.equal(getLanguageByFilename("style.css"), "css");
    assert.equal(getLanguageByFilename("package.json"), "json");
    assert.equal(getLanguageByFilename("config.JSON"), "json");
    assert.equal(getLanguageByFilename("README.md"), "plaintext");
    assert.equal(getLanguageByFilename("unknown_file"), "plaintext");

    setActivePinia(createPinia());
    const store = useWorkspaceStore();
    assert.equal(store.activeLanguage, "html");

    store.setActiveFilename("app.js");
    assert.equal(store.activeLanguage, "javascript");

    store.setActiveFilename("style.css");
    assert.equal(store.activeLanguage, "css");

    console.log("   ✓ Language resolution and reactive activeLanguage computed correctly");
  }

  // Test Suite 2: Starter Files & File State Initialization
  console.log("\n2. Testing Starter Files & Project State...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    assert.deepEqual(store.openFiles, DEFAULT_FILES);
    assert.equal(store.activeFilename, "index.html");
    assert.ok(store.files["index.html"].includes("HighLevel Genesis App"));
    assert.ok(store.files["app.js"].includes("window.highlevel"));
    assert.ok(store.files["style.css"].includes("fadeIn"));

    // Verify allFilenames computed property
    assert.deepEqual(store.allFilenames.sort(), ["app.js", "index.html", "style.css"].sort());
    assert.equal(store.activeFileContent, store.files["index.html"]);

    console.log("   ✓ Starter files properly initialized with HighLevel API contracts");
  }

  // Test Suite 3: File Tree Operations (Create, Delete, Toggle)
  console.log("\n3. Testing File Tree Operations (Create, Delete, Toggle)...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    // Toggle File Tree visibility
    assert.equal(store.isFileTreeOpen, true);
    store.toggleFileTree();
    assert.equal(store.isFileTreeOpen, false);
    store.toggleFileTree();
    assert.equal(store.isFileTreeOpen, true);

    // Create a new file
    const created = store.createFile("components.js", "// Components");
    assert.equal(created, true);
    assert.equal(store.files["components.js"], "// Components");
    assert.equal(store.activeFilename, "components.js");
    assert.ok(store.openFiles.includes("components.js"));

    // Prevent duplicate file creation
    const duplicate = store.createFile("components.js", "// Duplicate");
    assert.equal(duplicate, false);

    // Prevent empty file creation
    const empty = store.createFile("   ", "");
    assert.equal(empty, false);

    // Delete file
    const deleted = store.deleteFile("components.js");
    assert.equal(deleted, true);
    assert.equal(store.files["components.js"], undefined);
    assert.ok(!store.openFiles.includes("components.js"));
    assert.ok(store.activeFilename !== "components.js");

    // Guard against deleting all files
    store.deleteFile("style.css");
    store.deleteFile("app.js");
    assert.equal(store.allFilenames.length, 1);
    const deletedLast = store.deleteFile("index.html");
    assert.equal(deletedLast, false, "Must not delete the last remaining file in project");
    assert.equal(store.allFilenames.length, 1);

    console.log("   ✓ File creation, deletion, and tree boundaries enforced");
  }

  // Test Suite 4: Multi-Tab Navigation & Boundaries
  console.log("\n4. Testing Multi-Tab Navigation & Boundaries...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    // Open existing tab
    store.openTab("app.js");
    assert.equal(store.activeFilename, "app.js");

    // Close tab switches to adjacent
    store.closeTab("app.js");
    assert.ok(!store.openFiles.includes("app.js"));
    assert.equal(store.activeFilename, "index.html");

    // Reopen tab
    store.openTab("app.js");
    assert.ok(store.openFiles.includes("app.js"));
    assert.equal(store.activeFilename, "app.js");

    // Close down to 1 tab
    store.closeTab("app.js");
    store.closeTab("style.css");
    assert.equal(store.openFiles.length, 1);
    assert.equal(store.openFiles[0], "index.html");

    // Try closing the only remaining tab
    store.closeTab("index.html");
    assert.equal(store.openFiles.length, 1, "Must not close the last remaining tab");

    console.log("   ✓ Tab opening, closing, and minimum tab guard working properly");
  }

  // Test Suite 5: Real-Time Token Accumulation & Read-Only Locking
  console.log("\n5. Testing Real-Time Token Accumulation & Read-Only Streaming Lock...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    assert.equal(store.isStreaming, false);
    assert.equal(store.streamingFilename, null);

    // Enter streaming state
    store.setStreamingState(true, "index.html");
    assert.equal(store.isStreaming, true);
    assert.equal(store.streamingFilename, "index.html");

    // Reset file content for streaming accumulation
    store.setFileContent("index.html", "");
    assert.equal(store.files["index.html"], "");

    // Accumulate real-time streaming tokens
    store.appendToFileContent("index.html", "<!DOCTYPE html>\n");
    store.appendToFileContent("index.html", "<html><body>\n");
    store.appendToFileContent("index.html", "  <h1>Streamed CRM App</h1>\n");
    store.appendToFileContent("index.html", "</body></html>");

    assert.equal(
      store.files["index.html"],
      "<!DOCTYPE html>\n<html><body>\n  <h1>Streamed CRM App</h1>\n</body></html>"
    );

    // Switch streaming to a secondary file
    store.setStreamingState(true, "app.js");
    assert.equal(store.streamingFilename, "app.js");
    store.setFileContent("app.js", "");
    store.appendToFileContent("app.js", "console.log('generated code');");
    assert.equal(store.files["app.js"], "console.log('generated code');");

    // Verify Concurrency Mutex: Block file creation/deletion while streaming
    store.setStreamingState(true, "index.html");
    const blockedCreate = store.createFile("intruder.js", "// should fail");
    assert.equal(blockedCreate, false, "Must not allow creating files while streaming");
    const blockedDelete = store.deleteFile("app.js");
    assert.equal(blockedDelete, false, "Must not allow deleting files while streaming");

    // Exit streaming state
    store.setStreamingState(false);
    assert.equal(store.isStreaming, false);
    assert.equal(store.streamingFilename, null);

    // After streaming completes, creation works normally
    const allowedCreate = store.createFile("allowed.js", "// succeeds");
    assert.equal(allowedCreate, true);
    assert.ok(store.allFilenames.includes("allowed.js"));

    console.log("   ✓ Token accumulation and streaming read-only lock cycle verified");
  }

  // Test Suite 6: Full SSE Event Flow into Workspace Store Simulation
  console.log("\n6. Testing SSE Stream Event Pipeline into Store...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    // Simulated event callbacks as used in sseClient.ts
    const simulatedEvents = [
      { type: "start", data: { prompt: "Create contact form" } },
      { type: "file_start", data: { filename: "form.html" } },
      { type: "file_content", data: { filename: "form.html", chunk: "<form id='lead-form'>" } },
      { type: "file_content", data: { filename: "form.html", chunk: "<input name='name'/>" } },
      { type: "file_content", data: { filename: "form.html", chunk: "</form>" } },
      { type: "file_end", data: { filename: "form.html", fullContent: "<form id='lead-form'><input name='name'/></form>" } },
      { type: "done", data: { stats: { durationMs: 120 } } },
    ];

    for (const evt of simulatedEvents) {
      if (evt.type === "start") {
        store.setStreamingState(true, null);
      } else if (evt.type === "file_start") {
        store.setStreamingState(true, evt.data.filename);
        store.setFileContent(evt.data.filename, "");
        store.openTab(evt.data.filename);
      } else if (evt.type === "file_content") {
        store.appendToFileContent(evt.data.filename, evt.data.chunk);
      } else if (evt.type === "file_end") {
        store.setFileContent(evt.data.filename, evt.data.fullContent);
      } else if (evt.type === "done") {
        store.setStreamingState(false);
      }
    }

    assert.equal(store.isStreaming, false);
    assert.ok(store.allFilenames.includes("form.html"));
    assert.equal(store.files["form.html"], "<form id='lead-form'><input name='name'/></form>");
    assert.equal(store.activeFilename, "form.html");

    console.log("   ✓ Full multi-file SSE streaming simulation executed flawlessly");
  }

  // Test Suite 7: Cursor Position Tracking
  console.log("\n7. Testing Editor Cursor Tracking...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    assert.deepEqual(store.cursorPosition, { line: 1, col: 1 });
    store.setEditorCursor(42, 17);
    assert.deepEqual(store.cursorPosition, { line: 42, col: 17 });

    console.log("   ✓ Cursor position updates properly tracked");
  }

  console.log("\n✅ All Task 09 Monaco Code Editor & File Tree Tests Passed!\n");
}

runTests().catch((err) => {
  console.error("❌ Task 09 Monaco Tests Failed:", err);
  process.exit(1);
});
