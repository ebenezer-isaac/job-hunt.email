import type { NextConfig } from "next";
import { validateEnv } from "./src/env";
import { createDebugLogger } from "./src/lib/debug-logger";

const configLogger = createDebugLogger("next-config");
configLogger.step("Loading Next.js config now");
const validatedEnv = validateEnv();
configLogger.data("validated-env", {
  NODE_ENV: validatedEnv.NODE_ENV,
  PORT: validatedEnv.PORT,
  FIREBASE_PROJECT_ID: validatedEnv.FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: validatedEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});

const nextConfig: NextConfig = {
  serverExternalPackages: ["pino", "pino-pretty", "node-latex"],
  typescript: { ignoreBuildErrors: false },
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  turbopack: {
    root: __dirname,
  },
};

configLogger.data("next-config", nextConfig);

export default nextConfig;
