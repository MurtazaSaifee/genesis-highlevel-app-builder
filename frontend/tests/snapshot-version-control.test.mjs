import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import { useProjectsStore, STORAGE_ACTIVE_PROJECT_KEY } from "../src/stores/projects.ts";
import { useAuthStore } from "../src/stores/auth.ts";
import { useWorkspaceStore, STARTER_FILES } from "../src/stores/workspace.ts";
import { useSnapshotsStore } from "../src/stores/snapshots.ts";

console.log("=== Running Task 13 Version Control & Snapshots Tests ===");

// Mock localStorage for Node test runner
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
  // Test Suite 1: Initial Snapshots Store State
  console.log("\n1. Testing Snapshots Store Initial State...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const snapshotsStore = useSnapshotsStore();
    assert.deepEqual(snapshotsStore.snapshots, []);
    assert.equal(snapshotsStore.loading, false);
    assert.equal(snapshotsStore.restoring, false);
    assert.equal(snapshotsStore.error, null);
    assert.equal(snapshotsStore.isSheetOpen, false);
    assert.equal(snapshotsStore.selectedSnapshotId, null);
    assert.equal(snapshotsStore.selectedSnapshot, null);
    assert.equal(snapshotsStore.snapshotCount, 0);

    console.log("   ✓ Initial snapshots store state properly initialized and reactive");
  }

  // Test Suite 2: Snapshot Creation & Schema Validation
  console.log("\n2. Testing Snapshot Creation & Schema Validation...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const authStore = useAuthStore();
    const snapshotsStore = useSnapshotsStore();

    // Rejection when unauthenticated
    authStore.user = null;
    const failedUnauth = await snapshotsStore.createSnapshot("proj_123", {
      trigger: "manual",
      description: "Test Checkpoint",
      files: { "index.html": "<h1>Test</h1>" },
    });
    assert.equal(failedUnauth, null);

    // Mock authenticated user
    await ensureAuthenticated(authStore);

    // Successful snapshot creation
    const snapshot = await snapshotsStore.createSnapshot("proj_123", {
      trigger: "generation",
      description: "Build Contacts CRM with live search",
      prompt: "Build a contacts CRM with live search and appointments",
      files: {
        "index.html": "<!DOCTYPE html><html><body><h1>CRM</h1></body></html>",
        "app.js": "window.highlevel.contacts.list();",
        "style.css": "body { background: #f8fafc; }",
      },
      messageId: "msg_assistant_101",
    });

    assert.ok(snapshot);
    assert.ok(snapshot.id);
    assert.equal(snapshot.projectId, "proj_123");
    assert.equal(snapshot.userId, authStore.userId);
    assert.equal(snapshot.trigger, "generation");
    assert.equal(snapshot.description, "Build Contacts CRM with live search");
    assert.equal(snapshot.prompt, "Build a contacts CRM with live search and appointments");
    assert.equal(snapshot.filesCount, 3);
    assert.equal(snapshot.messageId, "msg_assistant_101");
    assert.ok(snapshot.createdAt > 0);
    assert.equal(snapshotsStore.snapshotCount, 1);
    assert.equal(snapshotsStore.selectedSnapshotId, snapshot.id);

    console.log("   ✓ Snapshot creation, validation, and reactive indexing verified");
  }

  // Test Suite 3: Multi-Snapshot Listing & Chronological Sorting
  console.log("\n3. Testing Snapshot Listing & Chronological Sorting...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const authStore = useAuthStore();
    await ensureAuthenticated(authStore);
    const snapshotsStore = useSnapshotsStore();

    const testProjId = `proj_sort_${Date.now()}`;

    // Create 3 snapshots with staggered timestamps
    const s1 = await snapshotsStore.createSnapshot(testProjId, {
      trigger: "manual",
      description: "Initial Draft",
      files: { "index.html": "<h1>Draft</h1>" },
      createdAt: 1000,
    });

    const s2 = await snapshotsStore.createSnapshot(testProjId, {
      trigger: "generation",
      description: "Added Contacts Table",
      files: { "index.html": "<h1>Table</h1>" },
      createdAt: 3000,
    });

    const s3 = await snapshotsStore.createSnapshot(testProjId, {
      trigger: "pre-restore",
      description: "Safety Backup",
      files: { "index.html": "<h1>Backup</h1>" },
      createdAt: 2000,
    });

    // Fetch and check ordering
    const loaded = await snapshotsStore.fetchSnapshots(testProjId);
    assert.equal(loaded.length, 3);
    assert.equal(loaded[0].description, "Added Contacts Table"); // createdAt 3000
    assert.equal(loaded[1].description, "Safety Backup");        // createdAt 2000
    assert.equal(loaded[2].description, "Initial Draft");        // createdAt 1000

    console.log("   ✓ Snapshots sorted descending by createdAt across multiple triggers");
  }

  // Test Suite 4: Manual Checkpoint Creation
  console.log("\n4. Testing Manual Checkpoint Creation...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const authStore = useAuthStore();
    await ensureAuthenticated(authStore);
    const workspaceStore = useWorkspaceStore();
    const snapshotsStore = useSnapshotsStore();

    // Set custom workspace content
    workspaceStore.setFileContent("index.html", "<div>Custom Header</div>", false);
    workspaceStore.createFile("utils.js", "export const log = console.log;");

    const manualSnap = await snapshotsStore.takeManualSnapshot(
      "proj_manual_1",
      "Before major redesign"
    );

    assert.ok(manualSnap);
    assert.equal(manualSnap.trigger, "manual");
    assert.equal(manualSnap.description, "Before major redesign");
    assert.equal(manualSnap.files["index.html"], "<div>Custom Header</div>");
    assert.equal(manualSnap.files["utils.js"], "export const log = console.log;");
    assert.equal(snapshotsStore.snapshots[0].id, manualSnap.id);

    console.log("   ✓ User manual checkpoint captured all workspace files cleanly");
  }

  // Test Suite 5: Snapshot Restoration & Non-Destructive Safety Backup
  console.log("\n5. Testing Snapshot Restoration & Safety Rollback Point...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const authStore = useAuthStore();
    await ensureAuthenticated(authStore);
    const projectsStore = useProjectsStore();
    const workspaceStore = useWorkspaceStore();
    const snapshotsStore = useSnapshotsStore();

    // 1. Create a project
    const project = await projectsStore.createProject({
      name: "Version Control Test App",
    });
    assert.ok(project);

    // 2. Setup Version 1
    const v1Files = {
      "index.html": "<h1>Version 1</h1>",
      "app.js": "console.log('v1');",
    };
    workspaceStore.loadProjectFiles(v1Files);
    const snap1 = await snapshotsStore.createSnapshot(project.id, {
      trigger: "manual",
      description: "Version 1 Baseline",
      files: v1Files,
    });
    assert.ok(snap1);

    // 3. Mutate workspace to Version 2
    const v2Files = {
      "index.html": "<h1>Version 2 - Broken</h1>",
      "app.js": "throw new Error('bug');",
    };
    workspaceStore.loadProjectFiles(v2Files);
    await projectsStore.saveProjectFiles(project.id, v2Files);

    const reloadKeyBefore = workspaceStore.previewReloadKey;
    const initialSnapshotsCount = snapshotsStore.snapshotCount;

    // 4. Restore Version 1
    const restoreResult = await snapshotsStore.restoreSnapshot(snap1);
    assert.equal(restoreResult, true);

    // Verify workspace restored to Version 1
    assert.equal(workspaceStore.files["index.html"], "<h1>Version 1</h1>");
    assert.equal(workspaceStore.files["app.js"], "console.log('v1');");

    // Verify project document updated with restored files
    assert.equal(project.files["index.html"], "<h1>Version 1</h1>");
    assert.equal(project.files["app.js"], "console.log('v1');");

    // Verify preview reload was triggered
    assert.ok(workspaceStore.previewReloadKey > reloadKeyBefore);

    // Verify safety pre-restore backup was automatically created!
    assert.equal(snapshotsStore.snapshotCount, initialSnapshotsCount + 1);
    const safetyBackup = snapshotsStore.snapshots[0];
    assert.equal(safetyBackup.trigger, "pre-restore");
    assert.match(safetyBackup.description, /safety backup before restoring/i);
    assert.equal(safetyBackup.files["index.html"], "<h1>Version 2 - Broken</h1>");

    // Verify confirmation message was added to chat messages
    const lastMsg = workspaceStore.messages[workspaceStore.messages.length - 1];
    assert.equal(lastMsg.role, "system");
    assert.match(lastMsg.content, /Restored project to snapshot/);

    console.log("   ✓ Snapshot restoration succeeded with automatic safety pre-restore backup");
  }

  // Test Suite 6: Automatic Snapshot upon LLM Generation Completion
  console.log("\n6. Testing Automatic Snapshot on LLM Generation Completion...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const authStore = useAuthStore();
    await ensureAuthenticated(authStore);
    const projectsStore = useProjectsStore();
    const workspaceStore = useWorkspaceStore();
    const snapshotsStore = useSnapshotsStore();

    const proj = await projectsStore.createProject({ name: "Auto Snapshot App" });
    assert.ok(proj);

    const initialSnapshotCount = snapshotsStore.snapshotCount;

    // Mock streaming client that fires onDone
    const mockStreamClient = (params) => {
      params.callbacks.onStart?.({ model: "gemini-2.5-flash" });
      params.callbacks.onFileStart?.({ filename: "app.js" });
      params.callbacks.onFileContent?.({ filename: "app.js", chunk: "console.log('generated');" });
      params.callbacks.onFileEnd?.({
        filename: "app.js",
        fullContent: "console.log('generated');",
      });
      params.callbacks.onDone?.({
        conversationText: "Application generation complete.",
        files: {
          ...params.existingFiles,
          "app.js": "console.log('generated');",
        },
        stats: { durationMs: 250, tokenCount: 15, filesCount: 1 },
      });
      return { abort: () => {} };
    };

    // Trigger generation
    workspaceStore.generateApp("Add highlevel appointment booking UI", {
      streamClientFn: mockStreamClient,
    });

    const startWait = Date.now();
    while (snapshotsStore.snapshotCount <= initialSnapshotCount && Date.now() - startWait < 3000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    // Verify snapshot was created automatically
    assert.ok(snapshotsStore.snapshotCount > initialSnapshotCount);
    const genSnap = snapshotsStore.snapshots[0];
    assert.equal(genSnap.trigger, "generation");
    assert.match(genSnap.prompt, /Add highlevel appointment booking UI/);
    assert.equal(genSnap.files["app.js"], "console.log('generated');");

    console.log("   ✓ LLM generation automatically created an immutable snapshot upon completion");
  }

  // Test Suite 7: Sheet State Management
  console.log("\n7. Testing Sheet Open/Close State Transitions...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const snapshotsStore = useSnapshotsStore();
    assert.equal(snapshotsStore.isSheetOpen, false);

    snapshotsStore.openSheet();
    assert.equal(snapshotsStore.isSheetOpen, true);

    snapshotsStore.toggleSheet();
    assert.equal(snapshotsStore.isSheetOpen, false);

    snapshotsStore.toggleSheet();
    assert.equal(snapshotsStore.isSheetOpen, true);

    snapshotsStore.closeSheet();
    assert.equal(snapshotsStore.isSheetOpen, false);

    console.log("   ✓ Sheet visibility controls work seamlessly");
  }

  console.log("\n===========================================================");
  console.log("🎉 ALL TASK 13 VERSION CONTROL & SNAPSHOTS TESTS PASSED!");
  console.log("===========================================================\n");
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
