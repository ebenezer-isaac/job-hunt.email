import { randomUUID } from "node:crypto";
import { Timestamp, type FirestoreDataConverter, type DocumentData } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { createDebugLogger } from "@/lib/debug-logger";

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

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    this.logger.step("Creating session", input);
    const now = new Date();
    const id = this.createSessionId(input.userId, input.companyName, input.jobTitle);
    this.logger.data("create-session-metadata", { now, id });

    const record: SessionRecord = {
      id,
      userId: input.userId,
      status: "processing",
      approved: false,
      locked: false,
      chatHistory: [],
      generatedFiles: {},
      metadata: input.metadata ?? {},
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
    return data;
  }

  async listSessions(userId: string): Promise<SessionRecord[]> {
    this.logger.step("Listing sessions for user", { userId });
    const snapshot = await this.collection.where("userId", "==", userId).get();
    const sessions = snapshot.docs
      .map((doc) => doc.data())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    this.logger.data("list-sessions-result", { count: sessions.length });
    return sessions;
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
      const sanitizedMetadata = updates.metadata
        ? {
            ...current.metadata,
            ...(omitUndefined(updates.metadata) ?? {}),
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
          sanitizedEntry.payload = cleanedPayload;
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

/**
 * The legacy implementation relied on async-mutex to guard file writes. In a distributed setting,
 * Firestore transactions provide the necessary atomicity so no in-memory mutex is required.
 */
export const sessionRepository = new SessionRepository();
