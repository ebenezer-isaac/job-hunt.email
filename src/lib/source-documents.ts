import "server-only";

import { Timestamp, type FirestoreDataConverter } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { createDebugLogger } from "@/lib/debug-logger";

export type SourceDocumentType =
  | "original_cv"
  | "extensive_cv"
  | "cv_strategy"
  | "cover_letter_strategy"
  | "cold_email_strategy"
  | "recon_strategy";

export type SourceDocumentRecord = {
  id: string;
  userId: string;
  docType: SourceDocumentType;
  content: string;
  updatedAt: Date;
};

export type SourceDocumentSnapshot = {
  originalCV: string;
  extensiveCV: string;
  cvStrategy: string;
  coverLetterStrategy: string;
  coldEmailStrategy: string;
  reconStrategy: string;
  updatedAt: string | null;
};

const collectionName = "sourceDocuments";
const logger = createDebugLogger("source-documents");

const converter: FirestoreDataConverter<SourceDocumentRecord> = {
  toFirestore(record) {
    const updatedAt = record.updatedAt instanceof Date ? record.updatedAt : new Date();
    return {
      userId: record.userId,
      docType: record.docType,
      content: record.content,
      updatedAt: Timestamp.fromDate(updatedAt),
    };
  },
  fromFirestore(snapshot) {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      userId: data.userId,
      docType: data.docType as SourceDocumentType,
      content: data.content,
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    };
  },
};

function getDocId(userId: string, docType: SourceDocumentType): string {
  return `${userId}-${docType}`;
}

export async function getSourceDocument(userId: string, docType: SourceDocumentType): Promise<SourceDocumentRecord | null> {
  const db = getDb();
  const ref = db.collection(collectionName).withConverter(converter).doc(getDocId(userId, docType));
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return null;
  }
  const data = snapshot.data();
  return data ?? null;
}

export async function saveSourceDocument(userId: string, docType: SourceDocumentType, content: string): Promise<SourceDocumentRecord> {
  const db = getDb();
  const ref = db.collection(collectionName).withConverter(converter).doc(getDocId(userId, docType));
  const now = new Date();
  const record: SourceDocumentRecord = {
    id: ref.id,
    userId,
    docType,
    content,
    updatedAt: now,
  };
  logger.step("Saving source document", { userId, docType, bytes: content.length });
  await ref.set(record, { merge: true });
  return record;
}

export async function getSourceDocumentsForUser(userId: string): Promise<SourceDocumentSnapshot> {
  const db = getDb();
  const collection = db.collection(collectionName).withConverter(converter);
  const snapshot = await collection.where("userId", "==", userId).get();
  const records = snapshot.docs.map((doc) => doc.data());

  const pick = (type: SourceDocumentType) => records.find((doc) => doc.docType === type)?.content ?? "";
  const latest = records.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

  return {
    originalCV: pick("original_cv"),
    extensiveCV: pick("extensive_cv"),
    cvStrategy: pick("cv_strategy"),
    coverLetterStrategy: pick("cover_letter_strategy"),
    coldEmailStrategy: pick("cold_email_strategy"),
    reconStrategy: pick("recon_strategy"),
    updatedAt: latest?.updatedAt?.toISOString() ?? null,
  };
}
