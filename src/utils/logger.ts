import pino from "pino";

const REDACT_PATHS = [
  "apiKey",
  "api_key",
  "api_secret",
  "accessToken",
  "accessSecret",
  "bearerToken",
  "authToken",
  "ct0",
  "webhookUrl",
  "password",
  "secret",
  "*.apiKey",
  "*.api_key",
  "*.api_secret",
  "*.accessToken",
  "*.accessSecret",
  "*.bearerToken",
  "*.authToken",
  "*.ct0",
  "*.webhookUrl",
  "*.password",
  "*.secret",
  "auth.apiKey",
  "auth.api_secret",
  "auth.accessToken",
  "auth.accessSecret",
  "auth.bearerToken",
  "auth.authToken",
  "auth.ct0",
  "auth.webhookUrl",
  "auth.password",
  "auth.secret",
  "xapi.apiKey",
  "xapi.api_secret",
  "xapi.accessToken",
  "xapi.accessSecret",
  "bird.authToken",
  "bird.ct0",
  "firecrawl.apiKey",
  "anthropic.apiKey",
  "slack.webhookUrl",
];

const MAX_REDACTION_DEPTH = 10;

type LogLevel = "debug" | "info" | "warn" | "error";
type ConsoleMethod = typeof console.log;

interface LogPayload {
  [key: string]: unknown;
}

interface ParsedArgs {
  message: string;
  payload: LogPayload;
  error?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

const pinoLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "auto-twitterer" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
});

function sanitize(value: unknown, depth = 0): unknown {
  if (depth >= MAX_REDACTION_DEPTH) return "[REDACTION_DEPTH_LIMIT]";

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));

  if (isObject(value)) {
    const entries = Object.entries(value).map(([key, rawValue]) => [
      key,
      sanitize(rawValue, depth + 1),
    ]);
    return Object.fromEntries(entries);
  }

  if (typeof value === "string") return sanitizeString(value);
  return value;
}

function sanitizeString(value: string): string {
  if (value.length > 2000) {
    return `${value.slice(0, 120)}...${value.slice(-30)}`;
  }
  return value;
}

function parseConsoleArgs(args: unknown[]): ParsedArgs {
  const payload: LogPayload = {};
  const messages: string[] = [];
  let error: unknown;

  args.forEach((arg, index) => {
    if (arg instanceof Error) {
      if (error === undefined) {
        error = arg;
      } else {
        messages.push(arg.message);
      }
      return;
    }

    if (arg === undefined) return;

    if (isObject(arg)) {
      const value = sanitize(arg);
      if (Object.keys(value as object).length > 0) {
        payload[`arg_${index}`] = value;
      }
      return;
    }

    messages.push(String(arg));
  });

  const nonEmptyMessages = messages.filter((item) => item.length > 0);
  return {
    message: nonEmptyMessages.length > 0 ? nonEmptyMessages.join(" ") : "console output",
    payload,
    error,
  };
}

function emit(level: LogLevel, message: string, payload: LogPayload = {}): void {
  const output = {
    ...sanitize(payload),
    msg: message,
  };

  if (level === "warn") {
    pinoLogger.warn(output);
    return;
  }
  if (level === "error") {
    pinoLogger.error(output);
    return;
  }
  if (level === "debug") {
    pinoLogger.debug(output);
    return;
  }
  pinoLogger.info(output);
}

function routeConsole(level: LogLevel, ...args: unknown[]): void {
  const parsed = parseConsoleArgs(args);
  if (level === "error") {
    emit("error", parsed.message, {
      ...parsed.payload,
      ...(parsed.error !== undefined ? { error: sanitize(parsed.error) } : {}),
    });
    return;
  }
  emit(level, parsed.message, parsed.payload);
}

const consoleOriginals = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

let consolePatched = false;

export function installConsoleOverrides(): void {
  if (consolePatched) return;

  console.log = ((...args: unknown[]) => routeConsole("info", ...args)) as ConsoleMethod;
  console.info = ((...args: unknown[]) => routeConsole("info", ...args)) as ConsoleMethod;
  console.warn = ((...args: unknown[]) => routeConsole("warn", ...args)) as ConsoleMethod;
  console.error = ((...args: unknown[]) => routeConsole("error", ...args)) as ConsoleMethod;
  console.debug = ((...args: unknown[]) => routeConsole("debug", ...args)) as ConsoleMethod;

  consolePatched = true;
}

export function restoreConsole(): void {
  if (!consolePatched) return;

  console.log = consoleOriginals.log;
  console.info = consoleOriginals.info;
  console.warn = consoleOriginals.warn;
  console.error = consoleOriginals.error;
  console.debug = consoleOriginals.debug;
  consolePatched = false;
}
