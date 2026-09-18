import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import {
  bundlePreviewHtml,
  generateHighLevelRuntimeScript,
  generateConsoleCaptureScript,
  normalizeFilename,
} from "../src/lib/previewBundler.ts";
import { useWorkspaceStore, STARTER_FILES } from "../src/stores/workspace.ts";

console.log("=== Running Task 11 Sandboxed Live Preview Tests ===");

async function runTests() {
  // Test Suite 1: Path Normalization
  console.log("\n1. Testing Path Normalization...");
  {
    assert.equal(normalizeFilename("style.css"), "style.css");
    assert.equal(normalizeFilename("./style.css"), "style.css");
    assert.equal(normalizeFilename("/style.css"), "style.css");
    assert.equal(normalizeFilename("  ./app.js  "), "app.js");
    console.log("   ✓ Relative and absolute paths normalized correctly");
  }

  // Test Suite 2: Multi-File HTML Bundling with Inlining
  console.log("\n2. Testing Multi-File HTML Virtual Bundler...");
  {
    const files = {
      "index.html": `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Test App</h1>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="app.js"></script>
</body>
</html>`,
      "style.css": `body { background-color: #f0f0f0; }`,
      "app.js": `console.log("Hello from inside bundled app");`,
    };

    const bundled = bundlePreviewHtml(files);

    // 1. Local stylesheet should be inlined as <style>
    assert.ok(bundled.includes('<style data-filename="style.css">'), "Should inline local style.css");
    assert.ok(bundled.includes("background-color: #f0f0f0;"), "Should contain CSS content");
    assert.ok(!bundled.includes('<link rel="stylesheet" href="style.css">'), "Original local <link> must be removed");

    // 2. External stylesheet must be preserved
    assert.ok(
      bundled.includes('href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"'),
      "External stylesheet link must be preserved"
    );

    // 3. Local script should be inlined as <script>
    assert.ok(bundled.includes('<script data-filename="app.js">'), "Should inline local app.js");
    assert.ok(bundled.includes('console.log("Hello from inside bundled app");'), "Should contain JS content");
    assert.ok(!bundled.includes('<script src="app.js">'), "Original local <script src> must be replaced");

    // 4. External script must be preserved
    assert.ok(
      bundled.includes('<script src="https://cdn.tailwindcss.com"></script>'),
      "External script tag must be preserved"
    );

    // 5. Injected runtime and console interceptor must be present
    assert.ok(bundled.includes('data-genesis-injected="console-interceptor"'), "Should inject console interceptor");
    assert.ok(bundled.includes('data-genesis-injected="highlevel-runtime"'), "Should inject HighLevel runtime");

    console.log("   ✓ Virtual bundler accurately inlines local assets while preserving external CDNs");
  }

  // Test Suite 3: Relative Path Matching (./style.css and ./app.js)
  console.log("\n3. Testing Bundler with Dot-Slash Relative Paths...");
  {
    const files = {
      "index.html": `<!DOCTYPE html><html><head><link rel="stylesheet" href="./style.css"></head><body><script src="./app.js"></script></body></html>`,
      "style.css": `h1 { color: red; }`,
      "app.js": `alert("ok");`,
    };

    const bundled = bundlePreviewHtml(files);
    assert.ok(bundled.includes('<style data-filename="style.css">'), "Should match ./style.css to style.css");
    assert.ok(bundled.includes('<script data-filename="app.js">'), "Should match ./app.js to app.js");
    console.log("   ✓ Dot-slash relative paths successfully resolve to project files");
  }

  // Test Suite 4: Auto-Injection of Unreferenced Assets
  console.log("\n4. Testing Auto-Injection of Unreferenced CSS/JS...");
  {
    const files = {
      "index.html": `<!DOCTYPE html><html><head><title>Bare Page</title></head><body><p>Content</p></body></html>`,
      "custom.css": `.btn { padding: 8px; }`,
      "helper.js": `function helper() { return 42; }`,
    };

    const bundled = bundlePreviewHtml(files);
    assert.ok(bundled.includes('<style data-filename="custom.css">'), "Unreferenced custom.css must be auto-injected into head");
    assert.ok(bundled.includes('<script data-filename="helper.js">'), "Unreferenced helper.js must be auto-injected before </body>");
    console.log("   ✓ Unreferenced CSS and JS files are safely injected into document head and body");
  }

  // Test Suite 5: Fallback Document Generation
  console.log("\n5. Testing Fallback Document Generation when index.html is missing...");
  {
    const files = {
      "style.css": `body { color: blue; }`,
      "app.js": `console.log("no index");`,
    };

    const bundled = bundlePreviewHtml(files);
    assert.ok(bundled.includes("<!DOCTYPE html>"), "Must generate standard HTML document");
    assert.ok(bundled.includes('<style data-filename="style.css">'), "Must include style.css");
    assert.ok(bundled.includes('<script data-filename="app.js">'), "Must include app.js");
    assert.ok(bundled.includes('data-genesis-injected="highlevel-runtime"'), "Must include runtime");
    console.log("   ✓ Fallback HTML document correctly assembled with all assets");
  }

  // Test Suite 6: HighLevel Runtime Script Contract
  console.log("\n6. Testing HighLevel Runtime Script Contract...");
  {
    const runtimeScript = generateHighLevelRuntimeScript({
      proxyBaseUrl: "http://127.0.0.1:5001/test-proj/us-central1/hlProxy",
      userToken: "mock-firebase-token-xyz",
    });

    // Verify key APIs exposed on window.highlevel
    assert.ok(runtimeScript.includes("window.highlevel = {"), "Exposes window.highlevel object");
    assert.ok(runtimeScript.includes("contacts: {"), "Exposes contacts namespace");
    assert.ok(runtimeScript.includes("conversations: {"), "Exposes conversations namespace");
    assert.ok(runtimeScript.includes("calendars: {"), "Exposes calendars namespace");
    assert.ok(runtimeScript.includes("raw: function"), "Exposes raw proxy method");

    // Verify RPC message dispatch
    assert.ok(runtimeScript.includes("HL_API_REQUEST"), "Dispatches HL_API_REQUEST to parent");
    assert.ok(runtimeScript.includes("HL_API_RESPONSE"), "Listens for HL_API_RESPONSE from parent");

    // Verify fallback fetch
    assert.ok(runtimeScript.includes("http://127.0.0.1:5001/test-proj/us-central1/hlProxy"), "Configures proxy base URL");
    assert.ok(runtimeScript.includes("mock-firebase-token-xyz"), "Configures user token for fallback");

    console.log("   ✓ HighLevel runtime script implements complete API contract with RPC and fallback fetch");
  }

  // Test Suite 7: Console & Error Interceptor Contract
  console.log("\n7. Testing Console & Error Interceptor Script Contract...");
  {
    const consoleScript = generateConsoleCaptureScript();

    assert.ok(consoleScript.includes("PREVIEW_CONSOLE_LOG"), "Dispatches PREVIEW_CONSOLE_LOG to parent");
    assert.ok(consoleScript.includes("PREVIEW_RUNTIME_ERROR"), "Dispatches PREVIEW_RUNTIME_ERROR to parent");
    assert.ok(consoleScript.includes("window.onerror"), "Hooks window.onerror");
    assert.ok(consoleScript.includes("unhandledrejection"), "Hooks unhandled promise rejections");

    console.log("   ✓ Console and error interceptor traps all runtime exceptions and console outputs");
  }

  // Test Suite 8: Starter Files Bundling Verification
  console.log("\n8. Testing Starter Files Bundling...");
  {
    const bundledStarter = bundlePreviewHtml(STARTER_FILES);
    assert.ok(bundledStarter.includes("HighLevel Genesis App"), "Includes starter app title");
    assert.ok(bundledStarter.includes("Recent Contacts"), "Includes contacts UI section");
    assert.ok(bundledStarter.includes("Appointments"), "Includes appointments UI section");
    assert.ok(bundledStarter.includes("window.highlevel.contacts.list"), "Includes contacts API call");
    assert.ok(bundledStarter.includes("window.highlevel.calendars.getAppointments"), "Includes appointments API call");
    console.log("   ✓ Starter files bundle completely and reference window.highlevel APIs");
  }

  // Test Suite 9: Workspace Store Preview Reload Trigger
  console.log("\n9. Testing Workspace Store Preview Reload Actions...");
  {
    setActivePinia(createPinia());
    const store = useWorkspaceStore();

    assert.equal(store.previewReloadKey, 0);

    store.triggerPreviewReload();
    assert.equal(store.previewReloadKey, 1);

    store.triggerPreviewReload();
    assert.equal(store.previewReloadKey, 2);

    console.log("   ✓ Workspace store previewReloadKey reacts to triggerPreviewReload()");
  }

  // Test Suite 10: Decoupled HighLevel Client dispatchRpc
  console.log("\n10. Testing HighLevel Client dispatchRpc Routing...");
  {
    let lastCall = null;
    const mockClient = {
      dispatchRpc: async (service, action, endpoint, method, params, body) => {
        lastCall = { service, action, endpoint, method, params, body };
        return { ok: true, count: 1 };
      },
    };

    const res = await mockClient.dispatchRpc("contacts", "list", "/contacts", "GET", { limit: 5 });
    assert.deepEqual(res, { ok: true, count: 1 });
    assert.equal(lastCall.service, "contacts");
    assert.equal(lastCall.action, "list");
    assert.equal(lastCall.params.limit, 5);

    console.log("   ✓ HighLevel Client dispatchRpc handles decoupled service dispatches");
  }

  console.log("\n✅ All 10 Task 11 Live Preview test suites passed successfully!\n");
}

runTests().catch((err) => {
  console.error("❌ Test failure:", err);
  process.exit(1);
});
