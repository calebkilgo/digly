import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// Vercel runs the full app with API routes. DIGLY_STATIC=1 builds the offline
// preview instead: a static export with no routes, running the engine in the
// browser against localStorage.
const isStatic = process.env.DIGLY_STATIC === "1";

const nextConfig: NextConfig = {
  output: isStatic ? "export" : undefined,
  // route.ts files can't be exported, so the static build only sees .tsx
  pageExtensions: isStatic ? ["tsx"] : ["tsx", "ts"],
  env: { NEXT_PUBLIC_DIGLY_BACKEND: isStatic ? "local" : process.env.NEXT_PUBLIC_DIGLY_BACKEND || "remote" },
  assetPrefix: process.env.DIGLY_ASSET_PREFIX || undefined,
  // fonts and icons rarely change: let browsers keep them a week instead of re-checking every visit
  ...(isStatic
    ? {}
    : {
        async headers() {
          const week = [{ key: "cache-control", value: "public, max-age=604800, stale-while-revalidate=86400" }];
          return [
            { source: "/fonts/:file*", headers: week },
            { source: "/icons/:file*", headers: week },
          ];
        },
      }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Sentry wraps the live build only. Source maps upload when SENTRY_AUTH_TOKEN,
// SENTRY_ORG and SENTRY_PROJECT are set; otherwise it just reports errors.
export default isStatic
  ? nextConfig
  : withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      telemetry: false,
    });
