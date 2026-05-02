import pino from "pino";

/**
 * Shared structured logger. Outputs one JSON line per event with at minimum
 * { item_id, stage, duration_ms } in pipeline contexts.
 *
 * Set LOG_LEVEL env var to override (default: "info").
 * Set NODE_ENV=production to disable pretty-printing.
 */
export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // In non-production environments pretty-print to stdout for readability.
  // In production, raw JSON is expected by log aggregators.
  ...(process.env.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss" },
    },
  }),
});
