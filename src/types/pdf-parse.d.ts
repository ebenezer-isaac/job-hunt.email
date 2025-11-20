declare module "pdf-parse" {
  export type PDFParseResult = {
    numpages?: number;
    numrender?: number;
    info?: {
      Pages?: number;
      [key: string]: unknown;
    };
    metadata?: Record<string, unknown>;
    text: string;
    version?: string;
  };

  export default function pdfParse(
    data: Buffer | Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<PDFParseResult>;
}
