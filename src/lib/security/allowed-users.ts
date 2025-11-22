import { getDb } from "@/lib/firebase-admin";
import { Timestamp, type DocumentReference, type FirestoreDataConverter } from "firebase-admin/firestore";
import { createDebugLogger } from "@/lib/debug-logger";
import { env } from "@/env";

const ACCESS_CONTROL_COLLECTION_PATH = "app_config/security/accessControl";
const ACCESS_CONTROL_DOC_ID = "config";
const ACCESS_CONTROL_DOC_PATH = `${ACCESS_CONTROL_COLLECTION_PATH}/${ACCESS_CONTROL_DOC_ID}`;

const allowedUsersLogger = createDebugLogger("allowed-users-service");

export type AccessControlConfig = {
  allowedUids: string[];
  allowedEmails: string[];
  defaultQuota: number;
  holdTimeoutMinutes: number;
};

const defaultConfig: AccessControlConfig = {
  allowedUids: [],
  allowedEmails: [],
  defaultQuota: 150,
  holdTimeoutMinutes: 60,
};

type AccessControlRecord = AccessControlConfig & {
  updatedAt: Date;
};

const converter: FirestoreDataConverter<AccessControlRecord> = {
  toFirestore(record) {
    const updatedAt = record.updatedAt instanceof Date ? record.updatedAt : new Date();
    return {
      ...record,
      updatedAt: Timestamp.fromDate(updatedAt),
    };
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return {
      allowedUids: Array.isArray(data.allowedUids) ? data.allowedUids : [],
      allowedEmails: Array.isArray(data.allowedEmails) ? data.allowedEmails : [],
      defaultQuota: typeof data.defaultQuota === "number" ? data.defaultQuota : defaultConfig.defaultQuota,
      holdTimeoutMinutes:
        typeof data.holdTimeoutMinutes === "number"
          ? data.holdTimeoutMinutes
          : defaultConfig.holdTimeoutMinutes,
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    } satisfies AccessControlRecord;
  },
};

let cachedConfig: AccessControlConfig | null = null;
let lastFetch = 0;
const CACHE_TTL_MS = 60_000;

export async function getAccessControlConfig(): Promise<AccessControlConfig> {
  const now = Date.now();
  if (cachedConfig && now - lastFetch < CACHE_TTL_MS) {
    return cachedConfig;
  }
  const db = getDb();
  const ref = db.doc(ACCESS_CONTROL_DOC_PATH).withConverter(converter);
  let snapshot = await ref.get();
  if (!snapshot.exists) {
    const bootstrapped = await bootstrapAccessControlDocument(ref);
    if (bootstrapped) {
      snapshot = await ref.get();
    }
  }
  if (!snapshot.exists) {
    allowedUsersLogger.warn("Access control doc unavailable; using defaults", { path: ACCESS_CONTROL_DOC_PATH });
    cachedConfig = defaultConfig;
    lastFetch = now;
    return cachedConfig;
  }
  const record = snapshot.data();
  const nextConfig: AccessControlConfig = record
    ? {
        allowedUids: record.allowedUids,
        allowedEmails: record.allowedEmails,
        defaultQuota: record.defaultQuota,
        holdTimeoutMinutes: record.holdTimeoutMinutes,
      }
    : defaultConfig;
  cachedConfig = nextConfig;
  lastFetch = now;
  allowedUsersLogger.data("access-control-config", nextConfig);
  return nextConfig;
}

export async function isUserAllowed(uid: string, email?: string | null): Promise<boolean> {
  const normalizedEmail = (email ?? "").trim().toLowerCase();
  
  // Admin Bypass
  if (env.ADMIN_EMAIL && normalizedEmail === env.ADMIN_EMAIL.toLowerCase()) {
    allowedUsersLogger.info("Admin bypass granted", { uid, email: normalizedEmail });
    return true;
  }

  const config = await getAccessControlConfig();
  allowedUsersLogger.step("Evaluating allowlist", {
    uid,
    email: normalizedEmail || null,
    configUidCount: config.allowedUids.length,
    configEmailCount: config.allowedEmails.length,
  });
  const emailAllowed = Boolean(normalizedEmail && config.allowedEmails.map((value) => value.toLowerCase()).includes(normalizedEmail));
  const uidAllowed = config.allowedUids.includes(uid);
  const allowed = uidAllowed || emailAllowed;
  allowedUsersLogger.step("Allowlist decision", {
    uid,
    email: normalizedEmail || null,
    uidAllowed,
    emailAllowed,
    allowed,
  });
  return allowed;
}

export function invalidateAccessControlCache() {
  cachedConfig = null;
  lastFetch = 0;
}

let bootstrapPromise: Promise<boolean> | null = null;
let bootstrapCompleted = false;

async function bootstrapAccessControlDocument(
  ref: DocumentReference<AccessControlRecord>,
): Promise<boolean> {
  if (bootstrapCompleted) {
    return true;
  }
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        await ref.create({
          ...defaultConfig,
          updatedAt: new Date(),
        });
        allowedUsersLogger.warn("Auto-created empty access-control config; update allowlists immediately", {
          path: ACCESS_CONTROL_DOC_PATH,
        });
        bootstrapCompleted = true;
        return true;
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          bootstrapCompleted = true;
          return true;
        }
        allowedUsersLogger.error("Failed to bootstrap access-control config", {
          path: ACCESS_CONTROL_DOC_PATH,
          error: describeError(error),
        });
        return false;
      } finally {
        bootstrapPromise = null;
      }
    })();
  }
  try {
    const result = await bootstrapPromise;
    if (result) {
      bootstrapCompleted = true;
    }
    return result;
  } catch {
    return false;
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string | number }).code;
  if (code === "already-exists" || code === "ALREADY_EXISTS" || code === 6) {
    return true;
  }
  const message = (error as { message?: string }).message;
  return typeof message === "string" && message.toLowerCase().includes("already exists");
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      code: (error as { code?: string | number }).code ?? null,
    };
  }
  return { message: String(error) };
}
