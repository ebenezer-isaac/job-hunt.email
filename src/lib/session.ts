import { randomUUID } from "node:crypto";
import { Timestamp, type FirestoreDataConverter, type DocumentData } from "firebase-admin/firestore";
import { env } from "@/env";
import { getDb } from "@/lib/firebase-admin";
import { createDebugLogger } from "@/lib/debug-logger";
import { sanitizeForStorage } from "@/lib/logging/redaction";
import { quotaService } from "@/lib/security/quota-service";

export type SessionStatus =
  | "processing"
  | "completed"
  | "failed"
  | "approved";

export type ChatLogEntry = {
  id?: string;
  timestamp: string;
  level: "info" | "success" | "error";
  message: string;
  payload?: Record<string, unknown>;
};

export type GeneratedFile = {
  key: string;
  url: string;
  label: string;
  mimeType?: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  status: SessionStatus;
  approved: boolean;
  locked: boolean;
  chatHistory: ChatLogEntry[];
  generatedFiles: Record<string, GeneratedFile>;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  processingStartedAt?: Date;
  processingDeadline?: Date;
};

export type CreateSessionInput = {
  userId: string;
  companyName?: string;
  jobTitle?: string;
  mode?: string;
  metadata?: Record<string, unknown>;
};

export type UpdateSessionInput = {
  status?: SessionStatus;
  approved?: boolean;
  locked?: boolean;
  generatedFiles?: Record<string, GeneratedFile>;
  metadata?: Record<string, unknown>;
  processingStartedAt?: Date | null;
  processingDeadline?: Date | null;
};

const collectionName = "sessions";
const PROCESSING_TIMEOUT_MS = 45 * 60_000;
const STALE_PROCESSING_GRACE_MS = 30_000;

const sessionLogger = createDebugLogger("session-repository");
sessionLogger.step("Session repository initializing");

const converter: FirestoreDataConverter<SessionRecord> = {
  toFirestore(record) {
    sessionLogger.step("Converting record to Firestore", {
      id: record.id,
      status: record.status,
      generatedFileCount: Object.keys(record.generatedFiles ?? {}).length,
      metadataKeys: Object.keys(record.metadata ?? {}),
    });
    const { createdAt, updatedAt, processingStartedAt, processingDeadline, ...rest } = record;

    const doc: DocumentData = {
      ...rest,
      createdAt: Timestamp.fromDate(createdAt as Date),
      updatedAt: Timestamp.fromDate(updatedAt as Date),
    };

    if (processingStartedAt instanceof Date) {
      doc.processingStartedAt = Timestamp.fromDate(processingStartedAt);
    }

    if (processingDeadline instanceof Date) {
      doc.processingDeadline = Timestamp.fromDate(processingDeadline);
    }

    return doc;
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    sessionLogger.step("Received Firestore snapshot", {
      id: snapshot.id,
      hasData: Boolean(data),
      metadataKeys: data ? Object.keys(data.metadata ?? {}) : [],
    });
    return {
      ...data,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
      processingStartedAt: data.processingStartedAt?.toDate?.(),
      processingDeadline: data.processingDeadline?.toDate?.(),
    } as SessionRecord;
  },
};

function omitUndefined<T extends Record<string, unknown>>(input?: T): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

export class SessionRepository {
  private readonly db = getDb();
  private readonly collection = this.db.collection(collectionName).withConverter(converter);
  private readonly logger = createDebugLogger("session-repository-instance");
  private readonly metadataValueLimit = env.MAX_CONTENT_LENGTH;

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    this.logger.step("Creating session", input);
    const now = new Date();
    const id = this.createSessionId(input.userId, input.companyName, input.jobTitle);
    this.logger.data("create-session-metadata", { now, id });
    const sanitizedMetadata = this.sanitizeMetadataForPersistence(input.metadata);

    const record: SessionRecord = {
      id,
      userId: input.userId,
      status: "processing",
      approved: false,
      locked: false,
      chatHistory: [],
      generatedFiles: {},
      metadata: sanitizedMetadata ?? {},
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    await this.collection.doc(id).set(record);
    this.logger.step("Session persisted", { id });
    return record;
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    this.logger.step("Fetching session", { id });
    const snapshot = await this.collection.doc(id).get();
    if (!snapshot.exists) {
      this.logger.warn("Session not found", { id });
      return null;
    }
    const data = snapshot.data() ?? null;
    if (data) {
      this.logger.data("session-loaded", {
        id: data.id,
        status: data.status,
        chatMessages: data.chatHistory?.length ?? 0,
        generatedFiles: Object.keys(data.generatedFiles ?? {}).length,
      });
    }
    if (!data) {
      return null;
    }
    return this.recoverProcessingStatusIfNeeded(data);
  }

  async listSessions(userId: string): Promise<SessionRecord[]> {
    this.logger.step("Listing sessions for user", { userId });
    const snapshot = await this.collection.where("userId", "==", userId).get();
    const sessions = snapshot.docs
      .map((doc) => doc.data())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const resolvedSessions: SessionRecord[] = [];
    let recovered = 0;
    for (const session of sessions) {
      const updated = await this.recoverProcessingStatusIfNeeded(session);
      if (updated !== session && session.status === "processing") {
        recovered += 1;
      }
      resolvedSessions.push(updated);
    }
    this.logger.data("list-sessions-result", { count: resolvedSessions.length, recovered });
    return resolvedSessions;
  }

  async updateSession(id: string, updates: UpdateSessionInput, userId: string): Promise<SessionRecord> {
    this.logger.step("Updating session", { id, updates, userId });
    return this.db.runTransaction(async (tx) => {
      const ref = this.collection.doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        this.logger.error("Session not found during update", { id });
        throw new Error(`Session ${id} not found`);
      }
      const current = snap.data();
      if (!current) {
        this.logger.error("Session snapshot failed to deserialize", { id });
        throw new Error(`Session ${id} failed to deserialize`);
      }

      if (current.userId !== userId) {
        this.logger.error("Session ownership mismatch during update", {
          id,
          expectedUserId: current.userId,
          providedUserId: userId,
        });
        throw new Error("Session ownership validation failed");
      }

      const nextVersion = current.version + 1;
      const metadataUpdates = updates.metadata
        ? this.sanitizeMetadataForPersistence(omitUndefined(updates.metadata))
        : undefined;

      const sanitizedMetadata = metadataUpdates
        ? {
            ...current.metadata,
            ...metadataUpdates,
          }
        : current.metadata;

      const updated: SessionRecord = {
        ...current,
        ...updates,
        metadata: sanitizedMetadata,
        generatedFiles: updates.generatedFiles
          ? { ...current.generatedFiles, ...updates.generatedFiles }
          : current.generatedFiles,
        updatedAt: new Date(),
        version: nextVersion,
        processingStartedAt:
          updates.processingStartedAt === null
            ? undefined
            : updates.processingStartedAt ?? current.processingStartedAt,
        processingDeadline:
          updates.processingDeadline === null
            ? undefined
            : updates.processingDeadline ?? current.processingDeadline,
      };

      tx.set(ref, updated);
      this.logger.step("Session updated", { id, version: updated.version });
      return updated;
    });
  }

  async appendChatLog(id: string, entry: Omit<ChatLogEntry, "timestamp">, userId: string): Promise<SessionRecord> {
    this.logger.step("Appending chat log entry", { id, entry, userId });
    return this.db.runTransaction(async (tx) => {
      const ref = this.collection.doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        this.logger.error("Session not found during append", { id });
        throw new Error(`Session ${id} not found`);
      }
      const current = snap.data();
      if (!current) {
        this.logger.error("Session snapshot failed to deserialize in append", { id });
        throw new Error(`Session ${id} failed to deserialize`);
      }

      if (current.userId !== userId) {
        this.logger.error("Session ownership mismatch during append", {
          id,
          expectedUserId: current.userId,
          providedUserId: userId,
        });
        throw new Error("Session ownership validation failed");
      }

      const sanitizedEntry = { ...entry, timestamp: new Date().toISOString() } as ChatLogEntry;
      if (!sanitizedEntry.id) {
        sanitizedEntry.id = randomUUID();
      }
      if (sanitizedEntry.payload === undefined) {
        delete sanitizedEntry.payload;
      } else {
        const cleanedPayload = omitUndefined(sanitizedEntry.payload);
        if (!cleanedPayload || Object.keys(cleanedPayload).length === 0) {
          delete sanitizedEntry.payload;
        } else {
          sanitizedEntry.payload = sanitizePayloadForStorage(cleanedPayload, this.metadataValueLimit);
        }
      }

      const updatedHistory = [...current.chatHistory, sanitizedEntry];
      this.logger.data("chat-history-updated", {
        id,
        entries: updatedHistory.length,
      });

      const updated: SessionRecord = {
        ...current,
        chatHistory: updatedHistory,
        updatedAt: new Date(),
        version: current.version + 1,
      };

      tx.set(ref, updated);
      this.logger.step("Chat log appended", { id, version: updated.version });
      return updated;
    });
  }

  async deleteSession(id: string, userId: string): Promise<{ deletedFileKeys: string[] }> {
    this.logger.step("Deleting session", { id, userId });
    return this.db.runTransaction(async (tx) => {
      const ref = this.collection.doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        this.logger.warn("Session not found during delete", { id });
        return { deletedFileKeys: [] };
      }
      const current = snap.data();
      if (!current) {
        throw new Error(`Session ${id} failed to deserialize`);
      }
      if (current.userId !== userId) {
        this.logger.error("Session ownership mismatch during delete", {
          id,
          expectedUserId: current.userId,
          providedUserId: userId,
        });
        throw new Error("Session ownership validation failed");
      }

      const deletedFileKeys = extractFileKeys(current.generatedFiles);
      tx.delete(ref);
      this.logger.step("Session deleted", { id });
      return { deletedFileKeys };
    });
  }

  async deleteGeneration(
    id: string,
    generationId: string,
    userId: string,
    messageIds?: string[],
  ): Promise<{ updated: SessionRecord; deletedFileKeys: string[]; isLatest: boolean }> {
    this.logger.step("Deleting generation", { id, generationId, userId });
    let releaseHoldKey: string | null = null;
    const result = await this.db.runTransaction(async (tx) => {
      const ref = this.collection.doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new Error(`Session ${id} not found`);
      }
      const current = snap.data();
      if (!current) {
        throw new Error(`Session ${id} failed to deserialize`);
      }
      if (current.userId !== userId) {
        throw new Error("Session ownership validation failed");
      }

      const messageIdSet = new Set(messageIds?.filter((value) => Boolean(value)) ?? []);
      const filteredHistory = (current.chatHistory ?? []).filter((entry) => {
        if (entry.payload?.generationId === generationId) {
          return false;
        }
        if (entry.id && messageIdSet.has(entry.id)) {
          return false;
        }
        return true;
      });
      const isLatest = current.metadata?.lastGenerationId === generationId;
      const deletedFileKeys = isLatest ? extractFileKeys(current.generatedFiles) : [];
      const cleanedMetadata = { ...(current.metadata ?? {}) } as Record<string, unknown>;
      if (isLatest) {
        delete cleanedMetadata.lastGenerationId;
        delete cleanedMetadata.lastGeneratedAt;
        delete cleanedMetadata.artifactPreviews;
        delete cleanedMetadata.cvChangeSummary;
        delete cleanedMetadata.coldEmailSubject;
        delete cleanedMetadata.coldEmailBody;
        delete cleanedMetadata.coldEmailTo;
      }

      const hadProcessingState = current.status === "processing";
      const fallbackStatus: SessionStatus = hadProcessingState
        ? hasGeneratedArtifacts(current)
          ? "completed"
          : "failed"
        : current.status;
      const holdKey = readActiveHoldKey(current.metadata);
      if (hadProcessingState) {
        cleanedMetadata.activeHoldKey = null;
        cleanedMetadata.processingHoldStartedAt = null;
        releaseHoldKey = holdKey;
      }

      const updated: SessionRecord = {
        ...current,
        chatHistory: filteredHistory,
        generatedFiles: isLatest ? {} : current.generatedFiles,
        metadata: cleanedMetadata,
        updatedAt: new Date(),
        version: current.version + 1,
        status: fallbackStatus,
        processingStartedAt: hadProcessingState ? undefined : current.processingStartedAt,
        processingDeadline: hadProcessingState ? undefined : current.processingDeadline,
      };

      tx.set(ref, updated);
      this.logger.step("Generation deleted", { id, generationId, isLatest });
      return { updated, deletedFileKeys, isLatest };
    });

    if (releaseHoldKey) {
      await this.releaseQuotaHold(userId, releaseHoldKey, id);
    }

    return result;
  }

  private async recoverProcessingStatusIfNeeded(session: SessionRecord): Promise<SessionRecord> {
    if (session.status !== "processing") {
      return session;
    }
    if (!this.hasProcessingExpired(session)) {
      return session;
    }
    const holdKey = readActiveHoldKey(session.metadata);
    this.logger.warn("Detected stale processing session", {
      sessionId: session.id,
      userId: session.userId,
      processingDeadline: session.processingDeadline ?? null,
    });
    try {
      const fallbackStatus: SessionStatus = hasGeneratedArtifacts(session) ? "completed" : "failed";
      const updated = await this.updateSession(
        session.id,
        {
          status: fallbackStatus,
          processingStartedAt: null,
          processingDeadline: null,
          metadata: { activeHoldKey: null, processingHoldStartedAt: null },
        },
        session.userId,
      );
      await this.releaseQuotaHold(session.userId, holdKey, session.id);
      return updated;
    } catch (error) {
      this.logger.error("Failed to recover stale processing session", {
        sessionId: session.id,
        message: error instanceof Error ? error.message : String(error),
      });
      return session;
    }
  }

  private hasProcessingExpired(session: SessionRecord): boolean {
    const now = Date.now();
    const explicitDeadline = session.processingDeadline?.getTime();
    const derivedDeadline = session.processingStartedAt
      ? session.processingStartedAt.getTime() + PROCESSING_TIMEOUT_MS
      : null;
    const deadline = explicitDeadline ?? derivedDeadline;
    if (!deadline) {
      return false;
    }
    return deadline + STALE_PROCESSING_GRACE_MS <= now;
  }

  private async releaseQuotaHold(userId: string, holdKey: string | null, sessionId: string): Promise<void> {
    if (!holdKey) {
      return;
    }
    try {
      await quotaService.releaseHold({ uid: userId, sessionId: holdKey, refund: true });
      this.logger.step("Released orphaned quota hold", { sessionId, holdKey, userId });
    } catch (error) {
      this.logger.warn("Failed to release quota hold", {
        sessionId,
        holdKey,
        userId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private sanitizeMetadataForPersistence(
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!metadata) {
      return metadata;
    }
    const sanitized = sanitizeForStorage(metadata, { maxStringLength: this.metadataValueLimit });
    if (sanitized && typeof sanitized === "object") {
      return sanitized as Record<string, unknown>;
    }
    return undefined;
  }

  private createSessionId(userId: string, companyName?: string, jobTitle?: string): string {
    this.logger.step("Creating session id", { userId, companyName, jobTitle });
    const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
    const safeUser = userId.replace(/[^a-z0-9]/gi, "_").slice(0, 8);
    const safeCompany = (companyName ?? "company").replace(/[^a-z0-9]/gi, "_").slice(0, 12);
    const safeTitle = (jobTitle ?? "role").replace(/[^a-z0-9]/gi, "_").slice(0, 12);
    const entropy = randomUUID().replace(/-/g, "").slice(0, 12);
    const composite = `${safeUser}_${timestamp}_${safeCompany}_${safeTitle}_${entropy}`;
    this.logger.data("session-id-composite", composite);
    return composite;
  }
}

function extractFileKeys(generatedFiles: Record<string, GeneratedFile> | undefined): string[] {
  if (!generatedFiles) {
    return [];
  }
  return Object.values(generatedFiles)
    .map((file) => file?.key)
    .filter((key): key is string => typeof key === "string" && Boolean(key));
}

function readActiveHoldKey(metadata?: Record<string, unknown>): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const value = (metadata as Record<string, unknown>).activeHoldKey;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function hasGeneratedArtifacts(session: SessionRecord): boolean {
  const files = session.generatedFiles ?? {};
  return Object.keys(files).length > 0;
}

function sanitizePayloadForStorage(
  payload: Record<string, unknown>,
  maxStringLength: number,
): Record<string, unknown> {
  const sanitized = sanitizeForStorage(payload, { maxStringLength });
  if (sanitized && typeof sanitized === "object") {
    return sanitized as Record<string, unknown>;
  }
  return {};
}

/**
 * The legacy implementation relied on async-mutex to guard file writes. In a distributed setting,
 * Firestore transactions provide the necessary atomicity so no in-memory mutex is required.
 */
export const sessionRepository = new SessionRepository();
