#!/usr/bin/env node
import { loadEnvConfig } from "@next/env";
import { Timestamp } from "firebase-admin/firestore";
import { getScriptLogger } from "./logger";
import { getDb } from "@/lib/firebase-admin";
import { quotaService } from "@/lib/security/quota-service";
import { sessionRepository } from "@/lib/session";

const projectRoot = process.cwd();
const isDev = process.env.NODE_ENV ? process.env.NODE_ENV !== "production" : true;
loadEnvConfig(projectRoot, isDev);

async function main() {
  const logger = getScriptLogger("expire-processing");
  const db = getDb();
  const now = new Date();
  const snapshot = await db
    .collection("sessions")
    .where("status", "==", "processing")
    .where("processingDeadline", "<=", Timestamp.fromDate(now))
    .get();

  if (snapshot.empty) {
    logger.step("No expired sessions found");
    return;
  }

  logger.step("Processing expired sessions", { count: snapshot.size });
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const sessionId = doc.id;
    const userId = data.userId as string;
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    const holdKey = typeof metadata.activeHoldKey === "string" ? metadata.activeHoldKey : null;
    try {
      await sessionRepository.updateSession(
        sessionId,
        {
          status: "failed",
          processingStartedAt: null,
          processingDeadline: null,
          metadata: { activeHoldKey: null, processingHoldStartedAt: null },
        },
        userId,
      );
      if (holdKey) {
        await quotaService.releaseHold({ uid: userId, sessionId: holdKey, refund: true });
      }
      logger.info("Expired session cleaned", { sessionId, userId, holdKey });
    } catch (error) {
      logger.error("Failed to clean expired session", {
        sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

main().catch((error) => {
  const logger = getScriptLogger("expire-processing");
  logger.error("Expiration job failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
