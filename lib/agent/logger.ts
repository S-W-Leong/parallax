export type AgentLogLevel = "info" | "warn" | "error";
export type AgentLogValue = string | number | boolean | null | undefined;
export type AgentLogFields = Record<string, unknown>;

export type AgentLogEntry = Record<string, AgentLogValue> & {
  timestamp: string;
  level: AgentLogLevel;
  event: string;
};

export type AgentLogSink = (entry: AgentLogEntry) => void;

export type AgentLogger = {
  info: (event: string, fields?: AgentLogFields) => void;
  warn: (event: string, fields?: AgentLogFields) => void;
  error: (event: string, fields?: AgentLogFields) => void;
  child: (fields: AgentLogFields) => AgentLogger;
};

type CreateAgentLoggerOptions = {
  base?: AgentLogFields;
  enabled?: boolean;
  sink?: AgentLogSink;
};

const REDACTED_KEYS = new Set([
  "artifact",
  "artifacts",
  "builderBrief",
  "html",
  "input",
  "inputSummary",
  "message",
  "messages",
  "output",
  "outputSummary",
  "prompt",
  "requestMessage",
  "sceneSource",
  "userMessage",
]);

function shouldRedact(key: string): boolean {
  return REDACTED_KEYS.has(key) || /prompt|secret|token|password|source|html|message/i.test(key);
}

function sanitizeValue(key: string, value: unknown): AgentLogValue {
  if (shouldRedact(key)) return "[redacted]";

  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return value.message;

  return JSON.stringify(value);
}

function sanitizeFields(fields: AgentLogFields | undefined): Record<string, AgentLogValue> {
  if (!fields) return {};
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => key !== "timestamp" && key !== "level" && key !== "event")
      .map(([key, value]) => [key, sanitizeValue(key, value)]),
  );
}

function consoleSink(entry: AgentLogEntry) {
  const line = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(line);
  } else if (entry.level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function createAgentLogger(options: CreateAgentLoggerOptions = {}): AgentLogger {
  const base = sanitizeFields(options.base);
  const enabled = options.enabled ?? true;
  const sink = options.sink ?? consoleSink;

  function write(level: AgentLogLevel, event: string, fields?: AgentLogFields) {
    if (!enabled) return;
    sink({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...base,
      ...sanitizeFields(fields),
    });
  }

  return {
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
    child: (fields) => createAgentLogger({
      base: { ...base, ...sanitizeFields(fields) },
      enabled,
      sink,
    }),
  };
}

export const defaultAgentLogger = createAgentLogger({
  enabled: process.env.NODE_ENV !== "test" && process.env.PARALLAX_AGENT_LOGGING !== "off",
});
