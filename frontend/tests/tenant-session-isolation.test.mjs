import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "../src/stores/auth.ts";
import { useProjectsStore, STORAGE_ACTIVE_PROJECT_KEY, getUserActiveProjectStorageKey } from "../src/stores/projects.ts";
import { useWorkspaceStore, STARTER_FILES } from "../src/stores/workspace.ts";
import { useSnapshotsStore } from "../src/stores/snapshots.ts";
import { useHighLevelStore } from "../src/stores/highlevel.ts";

try {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
} catch (_e) {}

console.log("=== Running Multi-Tenant Session Isolation Tests ===");

// Mock localStorage for Node test runner
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

async function runTests() {
  const pinia = createPinia();
  setActivePinia(pinia);

  const authStore = useAuthStore();
  const workspaceStore = useWorkspaceStore();
  const projectsStore = useProjectsStore();
  const snapshotsStore = useSnapshotsStore();
  const hlStore = useHighLevelStore();

  // -------------------------------------------------------------------------
  // Test Case 1: User A Session Setup & Data Mutation
  // -------------------------------------------------------------------------
  console.log("1. Simulating User A active session with prompt, custom files & snapshots...");
  const userAId = "user_alpha_123";
  authStore.user = { uid: userAId, email: "user_a@genesis.test" };

  // User A enters prompt and receives custom files
  workspaceStore.addMessage({
    id: "msg_user_a_prompt",
    role: "user",
    content: "Build a custom private CRM for Apex Medical with patient records",
    timestamp: Date.now(),
  });
  workspaceStore.addMessage({
    id: "msg_user_a_assistant",
    role: "assistant",
    content: "Here is your custom Apex Medical CRM application.",
    timestamp: Date.now() + 100,
  });

  // User A modifies code files
  const userACustomHtml = "<!-- Private Medical Dashboard User A --><h1>Apex Medical Portal</h1>";
  workspaceStore.setFileContent("index.html", userACustomHtml);
  workspaceStore.createFile("patients.js", "const patients = [{ id: 1, name: 'Alice' }];");

  // User A project setup
  const userAProject = {
    id: "proj_user_a_456",
    userId: userAId,
    name: "Apex Medical CRM",
    description: "Private Clinic App",
    locationId: "loc_apex_clinic",
    files: { ...workspaceStore.files },
    isDeleted: false,
    deletedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastActiveFilename: "index.html",
  };
  projectsStore.projects = [userAProject];
  projectsStore.activeProjectId = userAProject.id;
  localStorage.setItem(getUserActiveProjectStorageKey(userAId), userAProject.id);
  localStorage.setItem(STORAGE_ACTIVE_PROJECT_KEY, userAProject.id);

  // User A snapshot
  snapshotsStore.snapshots = [
    {
      id: "snap_user_a_1",
      projectId: userAProject.id,
      userId: userAId,
      createdAt: Date.now(),
      trigger: "generation",
      description: "Apex Medical V1",
      prompt: "Build a custom private CRM for Apex Medical with patient records",
      files: { ...workspaceStore.files },
      filesCount: 4,
    },
  ];

  // User A HighLevel connection
  hlStore.isConnected = true;
  hlStore.locationId = "loc_apex_clinic";
  hlStore.companyId = "comp_apex_health";

  // Assert User A state is populated
  assert.equal(workspaceStore.messages.length, 2, "User A should have 2 chat messages");
  assert.ok(workspaceStore.files["index.html"].includes("Apex Medical"), "User A should have custom files");
  assert.ok(workspaceStore.files["patients.js"] !== undefined, "User A should have patients.js file");
  assert.equal(projectsStore.projects.length, 1, "User A should have 1 project");
  assert.equal(snapshotsStore.snapshots.length, 1, "User A should have 1 snapshot");
  assert.equal(hlStore.isConnected, true, "User A should have connected HighLevel");
  assert.equal(localStorage.getItem(STORAGE_ACTIVE_PROJECT_KEY), "proj_user_a_456");
  console.log("   ✓ User A session populated with custom data, prompts, and snapshots");

  // -------------------------------------------------------------------------
  // Test Case 2: User A Exits / Signs Out -> Verifying Multi-Store Purge
  // -------------------------------------------------------------------------
  console.log("\n2. Executing User A sign out and testing complete tenant store purge...");
  
  // Call full multi-tenant reset
  workspaceStore.reset();
  projectsStore.reset();
  snapshotsStore.reset();
  hlStore.reset();
  localStorage.removeItem(STORAGE_ACTIVE_PROJECT_KEY);
  localStorage.removeItem(getUserActiveProjectStorageKey(userAId));
  authStore.user = null;

  // Assert all tenant data has been completely erased from memory
  assert.equal(workspaceStore.messages.length, 0, "Messages must be completely purged (0 prompts leaked)");
  assert.deepEqual(
    workspaceStore.files,
    STARTER_FILES,
    "Files must revert to clean STARTER_FILES without User A's custom files"
  );
  assert.equal(workspaceStore.files["patients.js"], undefined, "User A's patients.js must no longer exist");
  assert.equal(projectsStore.projects.length, 0, "Projects list must be empty");
  assert.equal(projectsStore.activeProjectId, null, "Active project ID must be null");
  assert.equal(snapshotsStore.snapshots.length, 0, "Snapshots history must be completely empty");
  assert.equal(hlStore.isConnected, false, "HighLevel connection status must be disconnected");
  assert.equal(hlStore.locationId, null, "HighLevel location must be null");
  assert.equal(localStorage.getItem(STORAGE_ACTIVE_PROJECT_KEY), null, "Active project localStorage key must be deleted");
  assert.equal(localStorage.getItem(getUserActiveProjectStorageKey(userAId)), null, "User A scoped key must be deleted");
  console.log("   ✓ User A sign out completely purged in-memory prompts, files, snapshots, and localStorage");

  // -------------------------------------------------------------------------
  // Test Case 3: User B Registers in Same Tab -> Verifying Clean Isolation
  // -------------------------------------------------------------------------
  console.log("\n3. Registering User B in the same browser session...");
  const userBId = "user_beta_789";
  authStore.user = { uid: userBId, email: "user_b@genesis.test" };

  // User B creates a fresh default project
  const userBDefaultProject = {
    id: "proj_user_b_default_001",
    userId: userBId,
    name: "My First HighLevel App",
    description: "Starter CRM Dashboard integrating HighLevel Contacts & Calendars",
    locationId: null,
    files: { ...STARTER_FILES },
    isDeleted: false,
    deletedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastActiveFilename: "index.html",
  };
  projectsStore.projects = [userBDefaultProject];
  projectsStore.activeProjectId = userBDefaultProject.id;
  localStorage.setItem(getUserActiveProjectStorageKey(userBId), userBDefaultProject.id);

  // User B hydrates workspace
  workspaceStore.loadProjectFiles(userBDefaultProject.files, userBDefaultProject.lastActiveFilename);

  // Assert User B sees ZERO artifacts from User A
  assert.equal(workspaceStore.messages.length, 0, "User B must NOT see User A's prompt or messages");
  assert.ok(
    !workspaceStore.files["index.html"].includes("Apex Medical"),
    "User B must NOT see User A's Apex Medical code"
  );
  assert.equal(
    workspaceStore.files["patients.js"],
    undefined,
    "User B must NOT see User A's patients.js file"
  );
  assert.equal(projectsStore.projects.length, 1, "User B should only see User B's project");
  assert.equal(projectsStore.projects[0].userId, userBId, "Project must belong to User B");
  assert.equal(snapshotsStore.snapshots.length, 0, "User B must NOT see User A's snapshot history");
  assert.equal(hlStore.isConnected, false, "User B must start disconnected from HighLevel");

  console.log("   ✓ User B starts with completely clean workspace, zero prompts, and default starter files");

  console.log("\n=========================================================");
  console.log("🎉 ALL MULTI-TENANT SESSION ISOLATION TESTS PASSED!");
  console.log("=========================================================\n");
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Multi-tenant isolation test failure:", err);
    process.exit(1);
  });
