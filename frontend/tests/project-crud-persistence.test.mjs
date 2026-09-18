import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import { useProjectsStore, STORAGE_ACTIVE_PROJECT_KEY } from "../src/stores/projects.ts";
import { useAuthStore } from "../src/stores/auth.ts";
import { useWorkspaceStore, STARTER_FILES } from "../src/stores/workspace.ts";

console.log("=== Running Task 12 Project CRUD & File Persistence Tests ===");

// Mock localStorage for Node test runner
const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, val) => memoryStorage.set(key, String(val)),
  removeItem: (key) => memoryStorage.delete(key),
  clear: () => memoryStorage.clear(),
};

async function runTests() {
  // Test Suite 1: Initial Store State
  console.log("\n1. Testing Projects Store Initial State...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const store = useProjectsStore();
    assert.deepEqual(store.projects, []);
    assert.equal(store.activeProjectId, null);
    assert.equal(store.activeProject, null);
    assert.deepEqual(store.activeProjectsList, []);
    assert.equal(store.loading, false);
    assert.equal(store.error, null);

    console.log("   ✓ Initial project state properly empty and reactive");
  }

  // Test Suite 2: Project Creation & Validation
  console.log("\n2. Testing Project Creation & Validation...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const authStore = useAuthStore();
    const projectsStore = useProjectsStore();

    // Rejection when unauthenticated
    authStore.user = null;
    const failedUnauth = await projectsStore.createProject({ name: "Demo App" });
    assert.equal(failedUnauth, null);
    assert.match(projectsStore.error, /authenticated/i);

    // Mock authenticated user
    authStore.user = { uid: "usr_evaluator_789", email: "evaluator@genesis.app" };

    // Rejection when name is empty
    const failedEmpty = await projectsStore.createProject({ name: "   " });
    assert.equal(failedEmpty, null);
    assert.match(projectsStore.error, /name cannot be empty/i);

    // Successful project creation
    const created = await projectsStore.createProject({
      name: "Lead Ingestion Dashboard",
      description: "Automates CRM lead capture and appointment bookings",
      locationId: "loc_hl_sandbox_001",
    });

    assert.ok(created);
    assert.ok(created.id);
    assert.equal(created.name, "Lead Ingestion Dashboard");
    assert.equal(created.description, "Automates CRM lead capture and appointment bookings");
    assert.equal(created.locationId, "loc_hl_sandbox_001");
    assert.equal(created.userId, "usr_evaluator_789");
    assert.equal(created.isDeleted, false);
    assert.equal(created.deletedAt, null);
    assert.deepEqual(created.files, STARTER_FILES);

    // Verify active project selection and localStorage caching
    assert.equal(projectsStore.activeProjectId, created.id);
    assert.equal(projectsStore.activeProject?.id, created.id);
    assert.equal(memoryStorage.get(STORAGE_ACTIVE_PROJECT_KEY), created.id);

    console.log("   ✓ Creation validations, starter file injection, and active project caching passed");
  }

  // Test Suite 3: Multi-Project Listing & Ordering
  console.log("\n3. Testing Multi-Project Listing & Sorting...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const authStore = useAuthStore();
    authStore.user = { uid: "usr_evaluator_789", email: "evaluator@genesis.app" };
    const projectsStore = useProjectsStore();

    // Create 3 projects with staggered timestamps
    const p1 = await projectsStore.createProject({ name: "App Alpha" });
    p1.updatedAt = 1000;

    const p2 = await projectsStore.createProject({ name: "App Beta" });
    p2.updatedAt = 3000;

    const p3 = await projectsStore.createProject({ name: "App Gamma" });
    p3.updatedAt = 2000;

    // activeProjectsList should sort by updatedAt descending
    const sorted = projectsStore.activeProjectsList;
    assert.equal(sorted.length, 3);
    assert.equal(sorted[0].name, "App Beta"); // updatedAt 3000
    assert.equal(sorted[1].name, "App Gamma"); // updatedAt 2000
    assert.equal(sorted[2].name, "App Alpha"); // updatedAt 1000

    console.log("   ✓ Multiple projects properly registered and sorted by updatedAt descending");
  }

  // Test Suite 4: Project Metadata Updates & Renaming
  console.log("\n4. Testing Project Metadata Updates & Renaming...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const authStore = useAuthStore();
    authStore.user = { uid: "usr_evaluator_789", email: "evaluator@genesis.app" };
    const projectsStore = useProjectsStore();

    const proj = await projectsStore.createProject({ name: "Old Name" });
    const initialUpdatedAt = proj.updatedAt;

    // Update with empty name should fail
    const emptyFail = await projectsStore.updateProjectMetadata(proj.id, { name: "  " });
    assert.equal(emptyFail, false);

    // Update name and description
    const updatedSuccess = await projectsStore.updateProjectMetadata(proj.id, {
      name: "New HighLevel App Name",
      description: "Updated description text",
      locationId: "loc_updated_456",
    });

    assert.equal(updatedSuccess, true);
    assert.equal(proj.name, "New HighLevel App Name");
    assert.equal(proj.description, "Updated description text");
    assert.equal(proj.locationId, "loc_updated_456");
    assert.ok(proj.updatedAt >= initialUpdatedAt);

    console.log("   ✓ Project metadata updates, input validation, and timestamp bumps passed");
  }

  // Test Suite 5: Soft Deletion & Auto-Switching
  console.log("\n5. Testing Soft Deletion & Auto-Switching...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const authStore = useAuthStore();
    authStore.user = { uid: "usr_evaluator_789", email: "evaluator@genesis.app" };
    const projectsStore = useProjectsStore();

    const proj1 = await projectsStore.createProject({ name: "Project 1" });
    const proj2 = await projectsStore.createProject({ name: "Project 2" });

    assert.equal(projectsStore.activeProjectsList.length, 2);
    assert.equal(projectsStore.activeProjectId, proj2.id);

    // Soft delete active project (proj2)
    const deleteSuccess = await projectsStore.deleteProject(proj2.id);
    assert.equal(deleteSuccess, true);
    assert.equal(proj2.isDeleted, true);
    assert.ok(proj2.deletedAt);

    // proj2 is excluded from activeProjectsList
    assert.equal(projectsStore.activeProjectsList.length, 1);
    assert.equal(projectsStore.activeProjectsList[0].id, proj1.id);

    // Active project automatically switched to proj1
    assert.equal(projectsStore.activeProjectId, proj1.id);

    // Now soft delete proj1 (all projects gone)
    await projectsStore.deleteProject(proj1.id);

    // Should automatically provision a new default project
    assert.equal(projectsStore.activeProjectsList.length, 1);
    assert.equal(projectsStore.activeProject?.name, "My First HighLevel App");

    console.log("   ✓ Soft-delete preserves historical data, filters active list, and provisions default project");
  }

  // Test Suite 6: Workspace Store Integration & Hydration
  console.log("\n6. Testing Project Hydration into Workspace Store...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const authStore = useAuthStore();
    authStore.user = { uid: "usr_evaluator_789", email: "evaluator@genesis.app" };
    const projectsStore = useProjectsStore();
    const workspaceStore = useWorkspaceStore();

    const customFiles = {
      "index.html": "<h1>Custom HighLevel Project</h1>",
      "app.js": "console.log('Custom JS');",
      "style.css": "body { background: purple; }",
      "extra.html": "<p>Bonus file</p>",
    };

    const proj = await projectsStore.createProject(
      { name: "Hydration Test App" },
      customFiles
    );

    // Load files into workspace
    workspaceStore.loadProjectFiles(proj.files, "extra.html");

    assert.deepEqual(workspaceStore.files, customFiles);
    assert.equal(workspaceStore.activeFilename, "extra.html");
    assert.ok(workspaceStore.openFiles.includes("extra.html"));
    assert.equal(workspaceStore.saveStatus, "saved");

    console.log("   ✓ Project files cleanly hydrated into workspace editor and tab state");
  }

  // Test Suite 7: File Persistence & Debounced Auto-Save
  console.log("\n7. Testing File Persistence & Debounced Auto-Save...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const authStore = useAuthStore();
    authStore.user = { uid: "usr_evaluator_789", email: "evaluator@genesis.app" };
    const projectsStore = useProjectsStore();
    const workspaceStore = useWorkspaceStore();

    const proj = await projectsStore.createProject({ name: "AutoSave Test" });
    workspaceStore.loadProjectFiles(proj.files);

    // 1. Manual edit triggers "unsaved" status
    workspaceStore.setFileContent("index.html", "<h2>Updated HTML Content</h2>");
    assert.equal(workspaceStore.saveStatus, "unsaved");
    assert.equal(workspaceStore.files["index.html"], "<h2>Updated HTML Content</h2>");

    // 2. forceSaveNow flushes changes immediately
    const saveResult = await workspaceStore.forceSaveNow();
    assert.equal(saveResult, true);
    assert.equal(workspaceStore.saveStatus, "saved");
    assert.equal(proj.files["index.html"], "<h2>Updated HTML Content</h2>");

    // 3. Creating file in FileTree forces save
    workspaceStore.createFile("components.js", "export const foo = 1;");
    await workspaceStore.forceSaveNow();
    assert.equal(workspaceStore.saveStatus, "saved");
    assert.equal(proj.files["components.js"], "export const foo = 1;");

    // 4. Deleting file forces save
    workspaceStore.deleteFile("components.js");
    await workspaceStore.forceSaveNow();
    assert.equal(workspaceStore.saveStatus, "saved");
    assert.equal(proj.files["components.js"], undefined);

    console.log("   ✓ Unsaved detection, immediate manual save, and file mutation persistence verified");
  }

  // Test Suite 8: LLM Generation File Persistence
  console.log("\n8. Testing LLM Generation Completion Persistence...");
  {
    setActivePinia(createPinia());
    memoryStorage.clear();

    const authStore = useAuthStore();
    authStore.user = { uid: "usr_evaluator_789", email: "evaluator@genesis.app" };
    const projectsStore = useProjectsStore();
    const workspaceStore = useWorkspaceStore();

    const proj = await projectsStore.createProject({ name: "Generation Persistence App" });
    workspaceStore.loadProjectFiles(proj.files);

    // Mock stream client function simulating onFileStart, onFileContent, onFileEnd, onDone
    const mockStreamClient = (params) => {
      // Simulate synchronous event callbacks
      params.callbacks.onStart?.({
        prompt: params.prompt,
        model: "gemini-2.0-flash",
        timestamp: Date.now(),
      });

      params.callbacks.onFileStart?.({ filename: "app.js" });
      params.callbacks.onFileContent?.({ filename: "app.js", chunk: "// Generated CRM app\n" });
      params.callbacks.onFileEnd?.({
        filename: "app.js",
        fullContent: "// Generated CRM app\nwindow.highlevel.contacts.list();",
      });

      params.callbacks.onDone?.({
        conversationText: "App generated successfully with Contacts API integration.",
        files: {
          ...params.existingFiles,
          "app.js": "// Generated CRM app\nwindow.highlevel.contacts.list();",
        },
        stats: { durationMs: 400, tokenCount: 25, filesCount: 1 },
      });

      return { abort: () => {} };
    };

    // Execute generation with mock stream client
    workspaceStore.generateApp("Generate a contact list app", {
      streamClientFn: mockStreamClient,
    });
    await workspaceStore.forceSaveNow();

    // Verify files were updated and persisted to project
    assert.equal(workspaceStore.saveStatus, "saved");
    assert.equal(
      workspaceStore.files["app.js"],
      "// Generated CRM app\nwindow.highlevel.contacts.list();"
    );
    assert.equal(
      proj.files["app.js"],
      "// Generated CRM app\nwindow.highlevel.contacts.list();"
    );

    console.log("   ✓ Generated files cleanly persisted to project upon generation completion");
  }

  console.log("\n=======================================================");
  console.log("🎉 ALL TASK 12 PROJECT CRUD & PERSISTENCE TESTS PASSED!");
  console.log("=======================================================\n");
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
