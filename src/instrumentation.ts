import * as Sentry from "@sentry/nextjs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

export const loggerProvider =
  posthogKey && posthogHost
    ? new LoggerProvider({
        resource: resourceFromAttributes({
          "service.name": "digly",
          "deployment.environment": process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
        }),
        processors: [
          new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({
              url: `${posthogHost.replace(/\/$/, "")}/i/v1/logs`,
              headers: {
                Authorization: `Bearer ${posthogKey}`,
                "Content-Type": "application/json",
              },
            }),
          }),
        ],
      })
    : null;

// Server-side error tracking. Does nothing until SENTRY_DSN (or the public DSN) is set.
export async function register() {
  if (!posthogKey || !posthogHost) {
    if (process.env.NODE_ENV !== "production") {
      const missing = posthogKey ? "NEXT_PUBLIC_POSTHOG_HOST" : "NEXT_PUBLIC_POSTHOG_KEY";
      console.warn(`${missing} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missing} is configured`);
    }
  }

  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      tracesSampleRate: 0.1,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
