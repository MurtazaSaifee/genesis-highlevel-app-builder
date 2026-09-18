const assert = require("node:assert/strict");
const { resolveConfig, getLlmClient, normalizeLlmError, LLMConfigurationError, LLMAPIError, DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL } = require("../lib/services/llmService.js");
const { buildInitialAppPrompt, buildIterativeRefinementPrompt, GENESIS_SYSTEM_PROMPT, HIGHLEVEL_API_CONTRACT_DOCS } = require("../lib/prompts/appContractPrompt.js");
const { MultiFileStreamParser, parseCompleteOutput } = require("../lib/utils/streamParser.js");

console.log("=== Running Task 06: LLM Service & HighLevel App Contract Tests ===");

async function runTests() {
  // Test 1: Configuration Resolution & BYOK Overrides
  console.log("\n1. Testing LLM Configuration Resolution...");
  {
    // Save original env
    const origKey = process.env.LLM_API_KEY;
    const origBase = process.env.LLM_BASE_URL;
    const origModel = process.env.LLM_MODEL;

    process.env.LLM_API_KEY = "env_test_api_key";
    process.env.LLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
    process.env.LLM_MODEL = "gemini-2.0-flash";

    // Test default environment resolution
    const envConfig = resolveConfig();
    assert.equal(envConfig.apiKey, "env_test_api_key");
    assert.equal(envConfig.baseURL, "https://generativelanguage.googleapis.com/v1beta/openai/");
    assert.equal(envConfig.model, "gemini-2.0-flash");
    assert.equal(envConfig.defaultTemperature, 0.2);

    // Test BYOK overrides (e.g. user passes OpenAI key & gpt-4o-mini from frontend settings)
    const byokConfig = resolveConfig({
      apiKey: "sk-user-custom-openai-key",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      defaultTemperature: 0.5,
    });
    assert.equal(byokConfig.apiKey, "sk-user-custom-openai-key");
    assert.equal(byokConfig.baseURL, "https://api.openai.com/v1");
    assert.equal(byokConfig.model, "gpt-4o-mini");
    assert.equal(byokConfig.defaultTemperature, 0.5);

    // Restore env
    process.env.LLM_API_KEY = origKey;
    process.env.LLM_BASE_URL = origBase;
    process.env.LLM_MODEL = origModel;

    console.log("   ✓ Configuration resolution and BYOK overrides operate accurately");
  }

  // Test 2: Client Instantiation & Validation
  console.log("\n2. Testing LLM Client Instantiation & Error Guards...");
  {
    const origKey = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;

    // Should throw if no API key provided
    assert.throws(
      () => getLlmClient(),
      (err) => err instanceof LLMConfigurationError && err.message.includes("No LLM API key configured"),
      "Must throw LLMConfigurationError when no key is present"
    );

    // Should instantiate cleanly with valid BYOK key
    const client = getLlmClient({
      apiKey: "test-valid-key",
      baseURL: "https://api.openai.com/v1",
    });
    assert.ok(client, "Client instance must be defined");
    assert.equal(client.baseURL, "https://api.openai.com/v1");

    process.env.LLM_API_KEY = origKey;
    console.log("   ✓ Client guards and instantiation verified");
  }

  // Test 3: Error Normalization
  console.log("\n3. Testing LLM Provider Error Normalization...");
  {
    const err401 = normalizeLlmError({ status: 401, message: "Unauthorized" });
    assert.ok(err401 instanceof LLMAPIError);
    assert.equal(err401.status, 401);
    assert.equal(err401.code, "INVALID_API_KEY");

    const err429 = normalizeLlmError({ status: 429, message: "Rate limit reached" });
    assert.ok(err429 instanceof LLMAPIError);
    assert.equal(err429.status, 429);
    assert.equal(err429.code, "RATE_LIMIT_EXCEEDED");

    const errAbort = normalizeLlmError({ name: "AbortError", message: "The operation was aborted" });
    assert.ok(errAbort instanceof LLMAPIError);
    assert.equal(errAbort.status, 499);
    assert.equal(errAbort.code, "REQUEST_ABORTED");

    console.log("   ✓ Error status codes and friendly diagnostic messages mapped cleanly");
  }

  // Test 4: HighLevel App Contract & System Prompt Assembly
  console.log("\n4. Testing HighLevel App Contract & System Prompts...");
  {
    assert.ok(GENESIS_SYSTEM_PROMPT.includes("Genesis AI"));
    assert.ok(GENESIS_SYSTEM_PROMPT.includes("<<<FILE:index.html>>>"));
    assert.ok(GENESIS_SYSTEM_PROMPT.includes("<<<FILE:style.css>>>"));
    assert.ok(GENESIS_SYSTEM_PROMPT.includes("<<<FILE:app.js>>>"));

    // Verify HighLevel APIs are completely documented
    assert.ok(HIGHLEVEL_API_CONTRACT_DOCS.includes("window.highlevel.contacts"));
    assert.ok(HIGHLEVEL_API_CONTRACT_DOCS.includes("window.highlevel.conversations"));
    assert.ok(HIGHLEVEL_API_CONTRACT_DOCS.includes("window.highlevel.calendars"));
    assert.ok(HIGHLEVEL_API_CONTRACT_DOCS.includes("getFreeSlots"));

    // Test Initial Prompt Builder
    const initialMessages = buildInitialAppPrompt("Create a lead capture and contacts management dashboard");
    assert.equal(initialMessages.length, 2);
    assert.equal(initialMessages[0].role, "system");
    assert.equal(initialMessages[1].role, "user");
    assert.ok(initialMessages[1].content.includes("lead capture and contacts management dashboard"));
    assert.ok(initialMessages[1].content.includes("<<<FILE:filename>>>"));

    // Test Iterative Refinement Prompt Builder
    const existingFiles = {
      "index.html": "<html><body><h1>CRM</h1></body></html>",
      "style.css": "body { background: #fff; }",
      "app.js": "window.highlevel.contacts.list();",
    };
    const refinementMessages = buildIterativeRefinementPrompt("Add a search bar and filter tags", existingFiles);
    assert.equal(refinementMessages.length, 2);
    assert.equal(refinementMessages[0].role, "system");
    assert.ok(refinementMessages[1].content.includes("<<<CURRENT_FILE:index.html>>>"));
    assert.ok(refinementMessages[1].content.includes("window.highlevel.contacts.list();"));
    assert.ok(refinementMessages[1].content.includes("Add a search bar and filter tags"));
    assert.ok(refinementMessages[1].content.includes("Do NOT output partial diffs"));

    console.log("   ✓ Prompt templates, schema docs, and iterative refinement context verified");
  }

  // Test 5: Multi-File Stream Parser (Chunked & Fragmented Delimiters)
  console.log("\n5. Testing MultiFileStreamParser with Chunk Boundary Fragmentation...");
  {
    const fileEvents = [];
    const parser = new MultiFileStreamParser({
      onFileStart: (name) => fileEvents.push({ type: "start", name }),
      onFileContent: (name, chunk) => fileEvents.push({ type: "chunk", name, chunk }),
      onFileEnd: (name) => fileEvents.push({ type: "end", name }),
    });

    // Simulate tokens arriving with delimiters fragmented across boundaries:
    // Fragment 1: intro garbage + partial opening tag
    parser.ingest("Here is your app:\n<<<FI");
    // Fragment 2: rest of opening tag + content
    parser.ingest("LE:index.html>>>\n<!DOCTYPE html><html>");
    // Fragment 3: content
    parser.ingest("<body><h1>Hello</h1></body></html>\n");
    // Fragment 4: partial closing tag
    parser.ingest("<<<");
    // Fragment 5: rest of closing tag + opening of next file
    parser.ingest("/FILE>>>\n<<<FILE:style.css>>>\nbody { color: red; }\n<<</FILE>>>");
    // Fragment 6: JS file without closing tag (handled on flush)
    parser.ingest("\n<<<FILE:app.js>>>\nconsole.log('started');");

    const finalFiles = parser.flush();

    // Verify index.html
    assert.ok(finalFiles["index.html"]);
    assert.ok(finalFiles["index.html"].includes("<!DOCTYPE html><html><body><h1>Hello</h1></body></html>"));

    // Verify style.css
    assert.ok(finalFiles["style.css"]);
    assert.equal(finalFiles["style.css"].trim(), "body { color: red; }");

    // Verify app.js
    assert.ok(finalFiles["app.js"]);
    assert.equal(finalFiles["app.js"].trim(), "console.log('started');");

    // Verify event sequence
    const starts = fileEvents.filter((e) => e.type === "start").map((e) => e.name);
    assert.deepEqual(starts, ["index.html", "style.css", "app.js"]);

    const ends = fileEvents.filter((e) => e.type === "end").map((e) => e.name);
    assert.deepEqual(ends, ["index.html", "style.css", "app.js"]);

    // Test immediate emission of HTML tags (no latency hold on standard tags like <div class="...">)
    const instantEvents = [];
    const instantParser = new MultiFileStreamParser({
      onFileContent: (name, chunk) => instantEvents.push(chunk),
    });
    instantParser.ingest("<<<FILE:index.html>>>\n");
    instantParser.ingest('<div class="max-w-md mx-auto p-4">');
    // Content should be emitted immediately, not held waiting for 15+ characters
    assert.ok(instantEvents.some((c) => c.includes('<div class="max-w-md mx-auto p-4">')), "HTML tags must stream without delay");
    instantParser.flush();

    console.log("   ✓ Real-time multi-file streaming parser correctly handles fragmented tokens & unbuffered HTML tags");
  }

  // Test 6: parseCompleteOutput (Delimiter & Markdown Fallbacks)
  console.log("\n6. Testing parseCompleteOutput Fallbacks...");
  {
    // Standard delimiter parsing
    const textDelimited = `
<<<FILE:index.html>>>
<h1>App</h1>
<<</FILE>>>
<<<FILE:app.js>>>
console.log('ok');
<<</FILE>>>
`;
    const parsed1 = parseCompleteOutput(textDelimited);
    assert.equal(parsed1["index.html"], "<h1>App</h1>");
    assert.equal(parsed1["app.js"], "console.log('ok');");

    // Fallback: Markdown code fences
    const textMarkdown = `
Here is the code:
\`\`\`html
<main>Dashboard</main>
\`\`\`
\`\`\`css
body { margin: 0; }
\`\`\`
\`\`\`javascript
const x = 42;
\`\`\`
`;
    const parsed2 = parseCompleteOutput(textMarkdown);
    assert.equal(parsed2["index.html"], "<main>Dashboard</main>");
    assert.equal(parsed2["style.css"], "body { margin: 0; }");
    assert.equal(parsed2["app.js"], "const x = 42;");

    console.log("   ✓ Complete output parser and fallback extractors verified");
  }

  console.log("\n=======================================================");
  console.log("✅ ALL TASK 06 TESTS PASSED SUCCESSFULLY");
  console.log("=======================================================\n");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
