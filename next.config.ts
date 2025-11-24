import type { NextConfig } from "next";
import { validateEnv } from "./src/env";

if (process.env.NODE_ENV !== "production") {
  console.info("[next-config] Loading Next.js config now");
}
const validatedEnv = validateEnv();
if (process.env.NODE_ENV !== "production") {
  console.info("[next-config] validated-env", {
    NODE_ENV: validatedEnv.NODE_ENV,
    PORT: validatedEnv.PORT,
    FIREBASE_PROJECT_ID: validatedEnv.FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: validatedEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

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
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "unsafe-none",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "unsafe-none",
          },
        ],
      },
    ];
  },
};

if (process.env.NODE_ENV !== "production") {
  console.info("[next-config] resolved config", nextConfig);
}

export default nextConfig;
