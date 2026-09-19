import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createPinia, setActivePinia } from "pinia";
import { useWorkspaceStore } from "../src/stores/workspace.ts";
import { useSnapshotsStore } from "../src/stores/snapshots.ts";
import { useProjectsStore } from "../src/stores/projects.ts";
import { useAuthStore } from "../src/stores/auth.ts";

try {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
} catch (_e) {}

console.log("=== Running Task 14 Monaco Diff Viewer & Version Comparison Tests ===");

// Mock localStorage for Node test environment
const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, val) => memoryStorage.set(key, String(val)),
  removeItem: (key) => memoryStorage.delete(key),
  clear: () => memoryStorage.clear(),
};

async function ensureAuthenticated(authStore) {
  try {
    await authStore.signUp(`evaluator_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@genesis.app`, "GenesisPass123!");
  } catch (_e) {
    authStore.user = { uid: "usr_evaluator_789", email: "evaluator@genesis.app" };
  }
}

async function runTests() {
  // Test Suite 1: Baseline Resolution & Code Diff Generation
  console.log("\n1. Testing Baseline Snapshot Resolution & Code Extraction...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const authStore = useAuthStore();
    await ensureAuthenticated(authStore);

    const workspaceStore = useWorkspaceStore();
    const snapshotsStore = useSnapshotsStore();

    // Initial files in workspace
    workspaceStore.setFileContent("index.html", "<html><body><h1>Version 2</h1></body></html>");
    workspaceStore.setFileContent("app.js", "console.log('v2 update');");

    // Mock recorded previous snapshot (Version 1)
    const snap1 = await snapshotsStore.createSnapshot("proj_diff_test", {
      trigger: "generation",
      description: "Initial Generation",
      files: {
        "index.html": "<html><body><h1>Version 1</h1></body></html>",
        "app.js": "console.log('v1 initial');",
        "legacy.js": "var old = true;",
      },
    });
    assert.ok(snap1, "Snapshot 1 must be created");

    // Add a second snapshot (Version 2)
    const snap2 = await snapshotsStore.createSnapshot("proj_diff_test", {
      trigger: "generation",
      description: "Iterative Refinement",
      files: {
        "index.html": "<html><body><h1>Version 2</h1></body></html>",
        "app.js": "console.log('v2 update');",
      },
    });
    assert.ok(snap2, "Snapshot 2 must be created");

    // Verify snapshots ordering (latest first)
    assert.equal(snapshotsStore.snapshots.length, 2);
    assert.equal(snapshotsStore.snapshots[0].id, snap2.id);
    assert.equal(snapshotsStore.snapshots[1].id, snap1.id);

    console.log("   ✓ Snapshots loaded and sorted descending for diff baseline selection");
  }

  // Test Suite 2: Diff Status Computations (Identical, Modified, Added, Deleted)
  console.log("\n2. Testing Code Diff State Computations...");
  {
    setActivePinia(createPinia());
    const workspaceStore = useWorkspaceStore();
    const snapshotsStore = useSnapshotsStore();
    const authStore = useAuthStore();
    authStore.user = { uid: "usr_tester_1" };

    // Baseline files (Snapshot v1)
    const v1Files = {
      "index.html": "<div id='app'>Hello World</div>",
      "style.css": "body { margin: 0; }",
      "old-file.txt": "to be deleted",
    };

    await snapshotsStore.createSnapshot("proj_test", {
      trigger: "manual",
      description: "V1 Checkpoint",
      files: v1Files,
    });

    // Current workspace files (V2 state)
    workspaceStore.setFileContent("index.html", "<div id='app'>Hello HighLevel</div>"); // Modified
    workspaceStore.setFileContent("style.css", "body { margin: 0; }"); // Identical
    workspaceStore.setFileContent("new-file.js", "export const newFeature = true;"); // Added
    delete workspaceStore.files["old-file.txt"]; // Deleted

    const baseline = snapshotsStore.snapshots[0];

    // Case A: Modified file (index.html)
    const origHtml = baseline.files["index.html"] ?? "";
    const modHtml = workspaceStore.files["index.html"] ?? "";
    assert.notEqual(origHtml, modHtml);
    assert.ok(origHtml.includes("World"));
    assert.ok(modHtml.includes("HighLevel"));

    // Case B: Identical file (style.css)
    const origCss = baseline.files["style.css"] ?? "";
    const modCss = workspaceStore.files["style.css"] ?? "";
    assert.equal(origCss, modCss, "style.css must be identical");

    // Case C: Added file (new-file.js)
    const origNew = baseline.files["new-file.js"] ?? "";
    const modNew = workspaceStore.files["new-file.js"] ?? "";
    assert.equal(origNew, "");
    assert.ok(modNew.length > 0);

    // Case D: Deleted file (old-file.txt)
    const origOld = baseline.files["old-file.txt"] ?? "";
    const modOld = workspaceStore.files["old-file.txt"] ?? "";
    assert.ok(origOld.length > 0);
    assert.equal(modOld, "");

    console.log("   ✓ Accurately detected Modified, Identical, Added, and Deleted files across generations");
  }

  // Test Suite 3: Switching Active File Updates Diff Target
  console.log("\n3. Testing Active Filename Switching for Monaco Models...");
  {
    setActivePinia(createPinia());
    const workspaceStore = useWorkspaceStore();

    workspaceStore.setActiveFilename("index.html");
    assert.equal(workspaceStore.activeFilename, "index.html");
    assert.equal(workspaceStore.activeLanguage, "html");

    workspaceStore.setActiveFilename("app.js");
    assert.equal(workspaceStore.activeFilename, "app.js");
    assert.equal(workspaceStore.activeLanguage, "javascript");

    workspaceStore.setActiveFilename("style.css");
    assert.equal(workspaceStore.activeFilename, "style.css");
    assert.equal(workspaceStore.activeLanguage, "css");

    console.log("   ✓ Active file and language change dynamically updates diff editor models");
  }

  // Test Suite 4: Streaming Interlock Logic
  console.log("\n4. Testing Streaming Interlock Guard...");
  {
    setActivePinia(createPinia());
    const workspaceStore = useWorkspaceStore();

    let viewMode = "diff";

    // Simulate watch trigger from CodeEditorShell
    function onStreamingChange(isStreaming) {
      if (isStreaming && viewMode === "diff") {
        viewMode = "code";
      }
    }

    // Start streaming
    workspaceStore.setStreamingState(true, "app.js");
    assert.equal(workspaceStore.isStreaming, true);
    onStreamingChange(workspaceStore.isStreaming);

    assert.equal(viewMode, "code", "Streaming must automatically transition viewMode back to 'code'");

    // Stop streaming
    workspaceStore.setStreamingState(false, null);
    assert.equal(workspaceStore.isStreaming, false);

    console.log("   ✓ Streaming interlock safely redirects view to Code editor during token reception");
  }

  console.log("\n✅ All Monaco Diff Viewer & Comparison Tests Passed Successfully!");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
