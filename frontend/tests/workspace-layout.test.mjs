import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import { useSettingsStore, PRESET_DEFAULTS } from "../src/stores/settings.ts";
import { useWorkspaceStore, DEVICE_WIDTHS } from "../src/stores/workspace.ts";

console.log("=== Running Task 08 Workspace Layout & Settings Tests ===");

// In-memory mock for localStorage in Node test runner
const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, val) => memoryStorage.set(key, String(val)),
  removeItem: (key) => memoryStorage.delete(key),
  clear: () => memoryStorage.clear(),
};

async function runTests() {
  // Test Suite 1: Settings Store & BYOK Configuration
  console.log("\n1. Testing BYOK Settings Store & Presets...");
  {
    setActivePinia(createPinia());
    globalThis.localStorage.clear();

    const store = useSettingsStore();

    // Default state
    assert.equal(store.provider, "google");
    assert.equal(store.baseUrl, PRESET_DEFAULTS.google.baseUrl);
    assert.equal(store.model, "gemini-2.0-flash");
    assert.equal(store.hasCustomKey, false);
    assert.equal(store.byokPayload, undefined);

    // Apply OpenAI preset
    store.applyPreset("openai");
    assert.equal(store.provider, "openai");
    assert.equal(store.baseUrl, PRESET_DEFAULTS.openai.baseUrl);
    assert.equal(store.model, "gpt-4o-mini");

    // Configure custom API key
    store.updateSettings({
      apiKey: "sk-mock-test-key-12345",
      temperature: 0.3,
    });

    assert.equal(store.hasCustomKey, true);
    assert.deepEqual(store.byokPayload, {
      apiKey: "sk-mock-test-key-12345",
      baseUrl: PRESET_DEFAULTS.openai.baseUrl,
      model: "gpt-4o-mini",
    });

    // Check localStorage persistence
    const saved = JSON.parse(globalThis.localStorage.getItem("genesis_byok_settings"));
    assert.equal(saved.provider, "openai");
    assert.equal(saved.apiKey, "sk-mock-test-key-12345");
    assert.equal(saved.temperature, 0.3);

    // Test clearKey
    store.clearKey();
    assert.equal(store.apiKey, "");
    assert.equal(store.hasCustomKey, false);
    assert.equal(store.byokPayload, undefined);

    // Test resetDefaults
    store.resetDefaults();
    assert.equal(store.provider, "google");
    assert.equal(store.model, "gemini-2.0-flash");
    assert.equal(store.baseUrl, PRESET_DEFAULTS.google.baseUrl);

    console.log("   ✓ BYOK settings correctly manages presets, keys, and persistence");
  }

  // Test Suite 2: Workspace Layout & Multi-Panel State
  console.log("\n2. Testing Workspace Layout Engine & Panel Toggles...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    // Default 3-panel split
    assert.equal(store.showChat, true);
    assert.equal(store.showCode, true);
    assert.equal(store.showPreview, true);
    assert.equal(store.visibleDesktopPanelCount, 3);
    assert.ok(store.desktopGridStyle.includes("minmax(300px, 340px)"));
    assert.ok(store.desktopGridStyle.includes("minmax(380px, 1fr)"));
    assert.ok(store.desktopGridStyle.includes("minmax(340px, 1fr)"));

    // Toggle Chat off
    store.togglePanel("chat");
    assert.equal(store.showChat, false);
    assert.equal(store.visibleDesktopPanelCount, 2);
    assert.ok(!store.desktopGridStyle.includes("minmax(300px, 340px)"));

    // Toggle Code off
    store.togglePanel("code");
    assert.equal(store.showCode, false);
    assert.equal(store.visibleDesktopPanelCount, 1);

    // Safety guard: cannot toggle off the last remaining panel
    store.togglePanel("preview");
    assert.equal(store.showPreview, true, "Last remaining panel must stay visible");
    assert.equal(store.visibleDesktopPanelCount, 1);

    // Restore all panels
    store.setAllPanelsVisible();
    assert.equal(store.showChat, true);
    assert.equal(store.showCode, true);
    assert.equal(store.showPreview, true);
    assert.equal(store.visibleDesktopPanelCount, 3);

    console.log("   ✓ Panel toggles and visibility boundaries enforced cleanly");
  }

  // Test Suite 3: Mobile/Tablet View Switcher & Device Emulation
  console.log("\n3. Testing Mobile Tab Switcher & Preview Device Emulation...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    // Mobile panel switching
    assert.equal(store.activePanel, "chat");
    store.setActivePanel("code");
    assert.equal(store.activePanel, "code");
    store.setActivePanel("preview");
    assert.equal(store.activePanel, "preview");

    // Device emulation mode
    assert.equal(store.previewDevice, "desktop");
    assert.equal(DEVICE_WIDTHS.desktop, "100%");

    store.setPreviewDevice("tablet");
    assert.equal(store.previewDevice, "tablet");
    assert.equal(DEVICE_WIDTHS.tablet, "768px");

    store.setPreviewDevice("mobile");
    assert.equal(store.previewDevice, "mobile");
    assert.equal(DEVICE_WIDTHS.mobile, "375px");

    console.log("   ✓ Responsive mobile tabs and device width dimensions verified");
  }

  // Test Suite 4: File Selection & Modal Controls
  console.log("\n4. Testing File Selection & Modal Dialog State...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    assert.equal(store.activeFilename, "index.html");
    store.setActiveFilename("app.js");
    assert.equal(store.activeFilename, "app.js");

    // Modal dialogs
    assert.equal(store.isSettingsOpen, false);
    store.openSettings();
    assert.equal(store.isSettingsOpen, true);
    store.closeSettings();
    assert.equal(store.isSettingsOpen, false);

    assert.equal(store.isConnectModalOpen, false);
    store.openConnectModal();
    assert.equal(store.isConnectModalOpen, true);
    store.closeConnectModal();
    assert.equal(store.isConnectModalOpen, false);

    console.log("   ✓ File tabs and dialog triggers functioning properly");
  }

  console.log("\n✅ All Task 08 Workspace Layout & Settings Tests Passed!\n");
}

runTests().catch((err) => {
  console.error("❌ Task 08 Workspace Layout Tests Failed:", err);
  process.exit(1);
});
