import "server-only";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { loggerProvider } from "@/instrumentation";

const logger = loggerProvider?.getLogger("digly.posthog");

type LogAttributes = Record<string, boolean | number | string>;

export function logGameEvent(body: string, severityNumber: SeverityNumber, attributes: LogAttributes) {
  logger?.emit({ body, severityNumber, attributes });
}

export function flushPostHogLogs() {
  return loggerProvider?.forceFlush() ?? Promise.resolve();
}
