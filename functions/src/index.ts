import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import * as dotenv from "dotenv";

dotenv.config();

if (!admin.apps.length) {
  admin.initializeApp();
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
