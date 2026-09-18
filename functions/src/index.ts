import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import * as dotenv from "dotenv";

dotenv.config();

if (!admin.apps.length) {
  admin.initializeApp();
  admin.firestore().settings({ ignoreUndefinedProperties: true });
}

/**
 * Basic health check endpoint
 */
export const health = onRequest({ cors: true }, (_req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "genesis-functions",
  });
});

// HighLevel OAuth & Integration Endpoints
export {
  getAuthUrl,
  oauthCallback,
  connectSandboxEndpoint as connectSandbox,
  disconnectHighLevelEndpoint as disconnectHighLevel,
  getIntegrationStatusEndpoint as getIntegrationStatus,
} from "./routes/oauth";

// HighLevel API Proxy Endpoint & Decoupled Execution Service
export { hlProxy, executeHighLevelProxy } from "./routes/highlevelProxy";

// Export core token & sandbox services for internal backend consumption
export * as tokenService from "./services/tokenService";
export * as sandboxMockService from "./services/sandboxMockService";

// Phase 3: Export LLM service, prompt contract, stream parser, and SSE streaming endpoint
export * as llmService from "./services/llmService";
export * as appContractPrompt from "./prompts/appContractPrompt";
export * as streamParser from "./utils/streamParser";
export {
  streamGenerate,
  handleStreamGenerate,
  runStreamGeneration,
  sendSSE,
} from "./routes/streamGenerate";

