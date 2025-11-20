'use server';

import { z } from "zod";
import { requireServerAuthTokens } from "@/lib/auth";
import { saveSourceDocument } from "@/lib/source-documents";
import { createDebugLogger } from "@/lib/debug-logger";

const logger = createDebugLogger("save-content-action");

const payloadSchema = z.object({
  docType: z.enum([
    "original_cv",
    "extensive_cv",
    "cv_strategy",
    "cover_letter_strategy",
    "cold_email_strategy",
  ] as const),
  content: z.string().max(200_000, "Document content exceeds safe size limit"),
});

export type SaveContentInput = z.infer<typeof payloadSchema>;

export async function saveContentAction(input: SaveContentInput): Promise<{ success: true }>{
  logger.step("saveContentAction invoked", { docType: input.docType, contentLength: input.content.length });
  const parsed = payloadSchema.parse(input);
  const tokens = await requireServerAuthTokens();
  await saveSourceDocument(tokens.decodedToken.uid, parsed.docType, parsed.content);
  logger.step("Source document saved", { docType: parsed.docType, userId: tokens.decodedToken.uid });
  return { success: true };
}
