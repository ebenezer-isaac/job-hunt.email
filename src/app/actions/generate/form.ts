import { z } from "zod";

export const formSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
  jobDescription: z.string().min(1, "jobDescription is required"),
  originalCV: z.string().min(1, "originalCV is required"),
  extensiveCV: z.string().min(1, "extensiveCV is required"),
  cvStrategy: z.string().min(1, "cvStrategy is required"),
  companyName: z.string().min(1, "companyName is required"),
  jobTitle: z.string().min(1, "jobTitle is required"),
  companyWebsite: z.string().optional().default(""),
  coverLetterStrategy: z.string().optional().default(""),
  coldEmailStrategy: z.string().optional().default(""),
  validatedCVText: z.string().optional().default(""),
  contactName: z.string().optional().default(""),
  contactTitle: z.string().optional().default(""),
  contactEmail: z.string().optional().default(""),
  companyProfile: z.string().optional().default(""),
  genericEmail: z.string().optional().default(""),
  jobSourceUrl: z.string().optional().default(""),
  emailAddresses: z.string().optional().default(""),
  mode: z.enum(["standard", "cold_outreach"]).default("standard"),
});

export type ParsedForm = z.infer<typeof formSchema>;

export function normalizeFormData(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}
