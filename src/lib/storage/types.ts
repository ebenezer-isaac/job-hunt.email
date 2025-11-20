import { getStorageBucket } from "@/lib/firebase-admin";
import { createDebugLogger } from "@/lib/debug-logger";

export type StorageUploadInput = {
  key: string;
  buffer: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
};

export type StorageUploadResult = {
  key: string;
  url: string;
  contentType?: string;
};

export interface IStorageProvider {
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  download(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export class FirebaseStorageProvider implements IStorageProvider {
  private readonly bucket = getStorageBucket();
  private readonly logger = createDebugLogger("firebase-storage");

  constructor() {
    this.logger.step("Firebase storage provider initialized", { bucket: this.bucket.name });
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const summary = {
      key: input.key,
      bytes: input.buffer.length,
      contentType: input.contentType ?? null,
      hasMetadata: Boolean(input.metadata && Object.keys(input.metadata).length),
    };
    this.logger.step("Uploading file", summary);
    const file = this.bucket.file(input.key);
    await file.save(input.buffer, {
      metadata: {
        contentType: input.contentType,
        metadata: input.metadata,
      },
      resumable: false,
      public: false,
    });
    this.logger.step("File saved to bucket", summary);

    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 1000 * 60 * 60 * 24,
    });
    this.logger.step("Signed URL generated", { key: input.key });

    return {
      key: input.key,
      url: signedUrl,
      contentType: input.contentType,
    };
  }

  async download(key: string): Promise<Buffer> {
    this.logger.step("Downloading file", { key });
    const file = this.bucket.file(key);
    const [exists] = await file.exists();
    if (!exists) {
      this.logger.error("File not found in bucket", { key });
      throw new Error(`File ${key} not found in Firebase Storage`);
    }
    const [contents] = await file.download();
    this.logger.step("File downloaded", { key, bytes: contents.length });
    return contents;
  }

  async exists(key: string): Promise<boolean> {
    this.logger.step("Checking if file exists", { key });
    const file = this.bucket.file(key);
    const [exists] = await file.exists();
    this.logger.step("Existence check complete", { key, exists });
    return exists;
  }

  async delete(key: string): Promise<void> {
    this.logger.step("Deleting file", { key });
    await this.bucket.file(key).delete({ ignoreNotFound: true });
    this.logger.step("Delete request sent", { key });
  }
}

export function getStorageProvider(): IStorageProvider {
  return new FirebaseStorageProvider();
}
