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

// Export core token service for internal backend consumption
export * as tokenService from "./services/tokenService";
